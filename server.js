#!/usr/bin/env node
/**
 * Claude Office — 세션 모니터링 서버
 *
 * ~/.claude/jobs/<id>/state.json 을 주기적으로 읽어
 * 세션 상태(working/done/blocked + stall 휴리스틱)를 SSE 로 브라우저에 푸시한다.
 * 의존성 없음. 읽기 전용이라 세션에 영향 없음.
 *
 * 실행: node server.js   →  http://localhost:4848
 * 환경변수: PORT(기본 4848), STALL_MIN(멈춤 판정 분, 기본 5), POLL_MS(기본 2500)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT || 4848);
const STALL_MIN = Number(process.env.STALL_MIN || 5);
const ACTIVE_MIN = Number(process.env.ACTIVE_MIN || 2);   // 재가동 판정: 트랜스크립트 최근 활동 분
const POLL_MS = Number(process.env.POLL_MS || 2500);

const JOBS_DIR = path.join(os.homedir(), '.claude', 'jobs');
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- 세션 수집 ----------

// sessionId → 트랜스크립트 경로 캐시 (전체 프로젝트 디렉토리 탐색 결과)
// cwd 유도 경로는 워크트리/재개(resume) 세션에서 빗나가므로 ID 글롭 방식 사용
const sidPathCache = new Map();           // sid → { path: string|null, retryAt: number }

function listProjectDirs() {
  try {
    return fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch (e) {
    return [];
  }
}

function transcriptMtimeFor(sid, projectDirs) {
  if (!sid) return 0;
  const cached = sidPathCache.get(sid);
  if (cached && cached.path) {
    try { return fs.statSync(cached.path).mtimeMs; } catch (e) { sidPathCache.delete(sid); }
  } else if (cached && cached.retryAt > Date.now()) {
    return 0;
  }
  for (const dir of projectDirs) {
    const p = path.join(PROJECTS_DIR, dir, sid + '.jsonl');
    try {
      const m = fs.statSync(p).mtimeMs;
      sidPathCache.set(sid, { path: p, retryAt: 0 });
      return m;
    } catch (e) { /* 다음 디렉토리 */ }
  }
  sidPathCache.set(sid, { path: null, retryAt: Date.now() + 30000 });
  return 0;
}

// 트랜스크립트에서 "사용자가 마지막에 보낸 요청" 추출 (AI 응답/도구결과 제외)
// mtime 으로 캐시 → 변경 시에만 재파싱
const promptCache = new Map();            // path → { mtime, prompt }
function lastUserPrompt(p, mtime) {
  if (!p) return '';
  const cached = promptCache.get(p);
  if (cached && cached.mtime === mtime) return cached.prompt;
  let prompt = '';
  try {
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line || line[0] !== '{') continue;
      let ev;
      try { ev = JSON.parse(line); } catch (e) { continue; }
      if (ev.type !== 'user' || ev.isMeta || ev.isSidechain) continue;
      const msg = ev.message;
      if (!msg) continue;
      let text = '';
      if (typeof msg.content === 'string') text = msg.content;
      else if (Array.isArray(msg.content)) {
        const tp = msg.content.find((b) => b && b.type === 'text');
        if (!tp) continue;                 // tool_result 전용 → 사람 요청 아님
        text = tp.text || '';
      }
      text = (text || '').trim();
      if (!text) continue;
      // 시스템 주입 메시지 스킵 → 실제 사람 요청만 탐색
      //  <task-notification> <bash-stdout> <command-…> <system-reminder> <local-command> 등 < 로 시작하는 래퍼,
      //  API Error / Caveat / 이미지 첨부 표식
      if (text[0] === '<' || text.startsWith('API Error') ||
          text.startsWith('Caveat:') || text.startsWith('[Image #') ||
          text.startsWith('[Request interrupted') ||
          text.startsWith('This session is being continued')) continue;
      prompt = text.replace(/\[Image #\d+\]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!prompt) continue;
      break;
    }
  } catch (e) { prompt = ''; }
  if (prompt.length > 280) prompt = prompt.slice(0, 280) + '…';
  promptCache.set(p, { mtime, prompt });
  return prompt;
}

function readJobs() {
  let dirs = [];
  try {
    dirs = fs.readdirSync(JOBS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch (e) {
    return [];
  }

  const now = Date.now();
  const sessions = [];
  const projectDirs = listProjectDirs();

  for (const id of dirs) {
    const stPath = path.join(JOBS_DIR, id, 'state.json');
    let st;
    try {
      st = JSON.parse(fs.readFileSync(stPath, 'utf8'));
    } catch (e) {
      continue; // state.json 없거나 깨짐 → 스킵 (방어적 파싱)
    }

    const cwd = st.cwd || st.originCwd || '';
    // sessionId + resumeSessionId 둘 다 확인 → 가장 최근 트랜스크립트 채택
    const mtA = transcriptMtimeFor(st.sessionId, projectDirs);
    const mtB = st.resumeSessionId && st.resumeSessionId !== st.sessionId
      ? transcriptMtimeFor(st.resumeSessionId, projectDirs) : 0;
    const transcriptMtime = Math.max(mtA, mtB);
    const bestSid = mtB > mtA ? st.resumeSessionId : st.sessionId;
    const bestPath = (sidPathCache.get(bestSid) || {}).path;
    const lastPrompt = lastUserPrompt(bestPath, transcriptMtime);
    let stateMtime = 0;
    try { stateMtime = fs.statSync(stPath).mtimeMs; } catch (e) { /* noop */ }

    const lastActivity = Math.max(
      transcriptMtime,
      stateMtime,
      Date.parse(st.updatedAt || '') || 0
    );

    const rawState = st.state || 'unknown';
    let effective = rawState;
    // 재가동 감지: done/blocked 기록 이후(+30초)에 트랜스크립트가 다시 자라고
    // 최근 ACTIVE_MIN 분 내 활동 → 실제로는 작업중
    const reactivated =
      transcriptMtime > stateMtime + 30000 &&
      now - transcriptMtime < ACTIVE_MIN * 60 * 1000;
    if (reactivated && rawState !== 'working') {
      effective = 'working';
    }
    if (effective === 'working' && lastActivity && now - lastActivity > STALL_MIN * 60 * 1000) {
      effective = 'stalled'; // working 인데 오래 갱신 없음 → 멈춤 의심
    }

    sessions.push({
      id,
      name: st.name || (st.detail ? String(st.detail).slice(0, 30) : id),
      state: rawState,
      effective,
      detail: st.detail ? String(st.detail) : '',
      lastPrompt,
      tempo: st.tempo || '',
      project: cwd ? path.basename(cwd) : '',
      cwd,
      createdAt: st.createdAt || null,
      updatedAt: st.updatedAt || null,
      lastActivity: lastActivity || null,
    });
  }

  // 생성순 정렬 → 책상 배치가 안정적으로 유지됨
  sessions.sort(
    (a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id)
  );
  return sessions;
}

// ---------- SSE ----------

const clients = new Set();
let lastPayload = '';

// statusline 이 덤프한 5시간/주간 rate limit (토큰 0, 읽기 전용)
function readUsage() {
  try {
    const u = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'office-usage.json'), 'utf8'));
    const rl = u.rate_limits || {};
    return {
      fiveHourPct: rl.five_hour ? rl.five_hour.used_percentage : null,
      fiveHourResetsAt: rl.five_hour ? rl.five_hour.resets_at : null,
      weeklyPct: rl.seven_day ? rl.seven_day.used_percentage : null,
      weeklyResetsAt: rl.seven_day ? rl.seven_day.resets_at : null,
      costUSD: u.cost ? u.cost.total_cost_usd : null,
      ts: u.ts ? Math.round(u.ts * 1000) : null,
    };
  } catch (e) {
    return null;
  }
}

function snapshot() {
  return JSON.stringify({ ts: Date.now(), stallMin: STALL_MIN, usage: readUsage(), sessions: readJobs() });
}

function broadcastIfChanged() {
  let payload;
  try {
    payload = snapshot();
  } catch (e) {
    return;
  }
  if (payload === lastPayload) return;
  lastPayload = payload;
  for (const res of clients) {
    res.write(`data: ${payload}\n\n`);
  }
}

setInterval(broadcastIfChanged, POLL_MS);
// keep-alive 코멘트 (프록시/브라우저 타임아웃 방지)
setInterval(() => {
  for (const res of clients) res.write(':hb\n\n');
}, 15000);

// ---------- HTTP ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`data: ${lastPayload || snapshot()}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (url.pathname === '/api/sessions') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(snapshot());
    return;
  }

  // 정적 파일
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(PUBLIC_DIR, file);
  if (!full.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(buf);
  });
});

server.listen(PORT, () => {
  console.log(`🏢 Claude Office  →  http://localhost:${PORT}`);
  console.log(`   jobs: ${JOBS_DIR}`);
  console.log(`   stall 판정: working 상태에서 ${STALL_MIN}분 무활동`);
});

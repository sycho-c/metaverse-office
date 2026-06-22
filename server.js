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

// 트랜스크립트에서 마지막 "사람 요청"(prompt) + 마지막 "AI 응답"(response) 추출
// 한 번 스캔으로 둘 다 구하고 mtime 으로 캐시 → 변경 시에만 재파싱
const promptCache = new Map();            // path → { mtime, prompt, response }
function blockText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const tp = content.find((b) => b && b.type === 'text');
    return tp ? (tp.text || '') : '';
  }
  return '';
}
function clean(text) {
  return (text || '').replace(/\[Image #\d+\]/g, ' ').replace(/\s+/g, ' ').trim();
}
function lastExchange(p, mtime) {
  const empty = { prompt: '', response: '' };
  if (!p) return empty;
  const cached = promptCache.get(p);
  if (cached && cached.mtime === mtime) return cached;
  let prompt = '', response = '';
  try {
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    for (let i = lines.length - 1; i >= 0 && (!prompt || !response); i--) {
      const line = lines[i].trim();
      if (!line || line[0] !== '{') continue;
      let ev;
      try { ev = JSON.parse(line); } catch (e) { continue; }
      if (ev.isSidechain) continue;        // 서브에이전트 메시지 제외
      const msg = ev.message;
      if (!msg) continue;

      if (!response && ev.type === 'assistant') {     // 마지막 AI 응답(텍스트)
        const txt = clean(blockText(msg.content));
        if (txt) response = txt;
        continue;
      }
      if (!prompt && ev.type === 'user' && !ev.isMeta) {   // 마지막 사람 요청
        const raw = (typeof msg.content === 'string')
          ? msg.content
          : (Array.isArray(msg.content) && msg.content.find((b) => b && b.type === 'text') ? blockText(msg.content) : null);
        if (raw == null) continue;          // tool_result 전용 → 사람 요청 아님
        const text = raw.trim();
        if (!text) continue;
        // 시스템 주입 메시지 스킵 (<task-notification>/<bash-stdout>/<command-…>/<system-reminder> 등)
        if (text[0] === '<' || text.startsWith('API Error') ||
            text.startsWith('Caveat:') || text.startsWith('[Image #') ||
            text.startsWith('[Request interrupted') ||
            text.startsWith('This session is being continued')) continue;
        const c = clean(text);
        if (c) prompt = c;
      }
    }
  } catch (e) { /* noop */ }
  if (prompt.length > 280) prompt = prompt.slice(0, 280) + '…';
  if (response.length > 240) response = response.slice(0, 240) + '…';
  const out = { mtime, prompt, response };
  promptCache.set(p, out);
  return out;
}

// ---------- 세션 내용 읽기(읽기 전용 패널용) ----------

// 시스템 주입/노이즈 사용자 메시지 판별 (lastExchange 와 동일 기준)
function isNoiseUserText(text) {
  return text[0] === '<' || text.startsWith('API Error') ||
    text.startsWith('Caveat:') || text.startsWith('[Image #') ||
    text.startsWith('[Request interrupted') ||
    text.startsWith('This session is being continued') ||
    text.startsWith('<local-command');
}

// 큰 jsonl 의 끝부분만 읽어 메모리 보호 (마지막 partial line 제거)
function tailRead(p, maxBytes) {
  const fd = fs.openSync(p, 'r');
  try {
    const sz = fs.fstatSync(fd).size;
    const start = Math.max(0, sz - maxBytes);
    const len = sz - start;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    let s = buf.toString('utf8');
    if (start > 0) { const nl = s.indexOf('\n'); if (nl >= 0) s = s.slice(nl + 1); }
    return s;
  } finally { fs.closeSync(fd); }
}

// 한 트랜스크립트 라인에서 표시용 메시지 추출 ([{role, text}])
function messagesFromLine(ev) {
  const out = [];
  const msg = ev.message; if (!msg) return out;
  const c = msg.content;
  if (ev.type === 'assistant') {
    if (typeof c === 'string') { const x = clean(c); if (x) out.push({ role: 'assistant', text: x }); }
    else if (Array.isArray(c)) {
      const tools = [];
      for (const b of c) {
        if (!b) continue;
        if (b.type === 'text') { const x = clean(b.text || ''); if (x) out.push({ role: 'assistant', text: x }); }
        else if (b.type === 'tool_use') tools.push(b.name || 'tool');
      }
      if (tools.length) out.push({ role: 'tool', text: '🔧 ' + [...new Set(tools)].join(', ') });
    }
  } else if (ev.type === 'user' && !ev.isMeta) {
    let raw = null;
    if (typeof c === 'string') raw = c;
    else if (Array.isArray(c)) { const tb = c.find((b) => b && b.type === 'text'); if (tb) raw = tb.text || ''; }
    if (raw != null) {
      const x = raw.trim();
      if (x && !isNoiseUserText(x)) out.push({ role: 'user', text: clean(x) });
    }
  }
  const ts = ev.timestamp || null;            // 메시지별 시각(표시용)
  for (const m of out) m.ts = ts;
  return out;
}

// 최근 limit 개의 대화 메시지(사람/AI/툴마커) 추출
function recentMessages(p, limit) {
  const text = tailRead(p, 600000);
  const lines = text.split('\n');
  const all = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t[0] !== '{') continue;
    let ev; try { ev = JSON.parse(t); } catch (e) { continue; }
    if (ev.isSidechain) continue;             // 서브에이전트 제외
    for (const m of messagesFromLine(ev)) {
      if (m.text.length > 700) m.text = m.text.slice(0, 700) + '…';
      all.push(m);
    }
  }
  return all.slice(-limit);
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
    const ex = lastExchange(bestPath, transcriptMtime);
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
      lastPrompt: ex.prompt,
      lastResponse: ex.response,
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

  // 세션 내용 보기(읽기 전용) — 상태/현재 작업 + 최근 대화 미리보기.
  // 명령 실행은 CLI 터미널에서 하므로, 이어가기용 `claude --resume` 명령만 함께 반환.
  if (url.pathname === '/api/transcript' && req.method === 'GET') {
    const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
    const id = String(url.searchParams.get('id') || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const limit = Math.min(200, Math.max(5, Number(url.searchParams.get('limit')) || 24));
    if (!id) return json(400, { ok: false, error: 'id required' });
    const dir = path.join(JOBS_DIR, id);
    if (!fs.existsSync(dir)) return json(404, { ok: false, error: 'unknown session' });
    let st;
    try { st = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')); } catch (e) { return json(500, { ok: false, error: 'state read failed' }); }

    const projectDirs = listProjectDirs();
    const mtA = transcriptMtimeFor(st.sessionId, projectDirs);
    const mtB = st.resumeSessionId && st.resumeSessionId !== st.sessionId
      ? transcriptMtimeFor(st.resumeSessionId, projectDirs) : 0;
    const bestSid = mtB > mtA ? st.resumeSessionId : st.sessionId;
    const bestPath = (sidPathCache.get(bestSid) || {}).path;

    let messages = [], transcriptMtime = 0;
    if (bestPath) {
      try { messages = recentMessages(bestPath, limit); transcriptMtime = fs.statSync(bestPath).mtimeMs; } catch (e) { /* noop */ }
    }
    const resumeCmd = bestSid ? `claude --resume ${bestSid}` : null;
    // 지표·산출물(필요한 필드만 정제 — 거대 객체 덤프 방지)
    const inFlight = (st.inFlight && typeof st.inFlight === 'object')
      ? { tasks: st.inFlight.tasks || 0, queued: st.inFlight.queued || 0, kinds: Array.isArray(st.inFlight.kinds) ? st.inFlight.kinds.slice(0, 4) : [] }
      : null;
    const fan = Array.isArray(st.fan)
      ? st.fan.slice(0, 6).map((f) => ({ kind: f && f.kind || null, label: f && f.label ? String(f.label).slice(0, 80) : null })).filter((f) => f.label)
      : [];
    const children = Array.isArray(st.children)
      ? st.children.slice(0, 12).map((c) => ({ id: c && c.id != null ? String(c.id) : null, kind: c && c.kind || null, href: c && typeof c.href === 'string' ? c.href : null })).filter((c) => c.href)
      : [];
    const result = (st.output && typeof st.output === 'object' && typeof st.output.result === 'string')
      ? st.output.result.slice(0, 600) : null;
    return json(200, {
      ok: true, id,
      name: st.name || null,
      state: st.state || null,
      detail: st.detail || null,
      sessionId: bestSid || st.sessionId || null,
      cwd: st.cwd || st.originCwd || null,
      tokens: st.tokens != null ? st.tokens : null,
      tempo: st.tempo || null,
      intent: typeof st.intent === 'string' ? st.intent.slice(0, 240) : null,
      createdAt: st.createdAt || null,
      updatedAt: st.updatedAt || null,
      transcriptAt: transcriptMtime ? new Date(transcriptMtime).toISOString() : null,
      inFlight, fan, children, result,
      resumeCmd,
      messages,
    });
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

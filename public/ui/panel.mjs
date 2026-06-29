// ui/panel.mjs — 사이드 세션 패널 · 사용량 위젯 · 토스트 · 알림 · 세션 내용 패널 · 설정 · SSE.
// 캔버스/월드 비의존(순수 DOM). 공유 데이터는 app-state(sessions/highlightId/talking/...),
// 대사 토글은 world-state(speeches/speechOn). 입력 키 배선(keydown/keyup·speed)은 메인 담당.
import { rel, resetLabel, usageColor, freshnessLabel, fmtTime, toolShortName, fmtTokens, fmtElapsed } from '../lib/format.mjs';
import { sessionSig } from '../lib/sig.mjs';
import { STATE_META } from '../constants.mjs';
import {
  highlightId, setHighlightId, talking, setTalking, talkTarget, setTalkTarget,
  settingsOpen, setSettingsOpen, keys, sessions, setSessions,
} from '../core/app-state.mjs';
import { speeches, speechOn, setSpeechOn } from '../core/world-state.mjs';

const listEl = document.getElementById('list');
const connEl = document.getElementById('conn');
let searchQuery = '';                          // 세션 검색어
let statusFilter = 'all';                       // 상태 필터(all/working/blocked/stalled/done)
const prevEffective = new Map();

// ---------- SSE ----------
export function connect() {
  const es = new EventSource('/events');
  es.onopen = () => { connEl.textContent = '● 실시간'; connEl.className = 'on'; };
  es.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      update(msg.sessions || []);
      renderUsage(msg.usage);
    } catch (err) { /* skip */ }
  };
  es.onerror = () => {
    connEl.textContent = '● 재연결 중…'; connEl.className = 'off';
    es.close();
    setTimeout(connect, 3000);
  };
}

// ---------- 토큰 사용량 위젯 (statusline 덤프 → 토큰 0) ----------
function renderUsage(u) {
  const box = document.getElementById('usage');
  if (!u || (u.fiveHourPct == null && u.weeklyPct == null)) { box.style.display = 'none'; return; }
  box.style.display = 'flex';
  const fresh = freshnessLabel(u.ts);
  const stale = u.ts ? (Date.now() - u.ts > 5 * 60e3) : false;   // 5분 초과 → 흐리게
  box.style.opacity = stale ? '0.5' : '1';
  const set = (itemId, pctId, fillId, label, pct, reset) => {
    const p = pct == null ? null : Math.round(pct);
    document.getElementById(pctId).textContent = p == null ? '–' : p + '%';
    const f = document.getElementById(fillId);
    f.style.width = (p == null ? 0 : Math.min(100, p)) + '%';
    f.style.background = usageColor(p || 0);
    const r = resetLabel(reset);
    // statusline rate_limits 기반 정수값 스냅샷 — 설정 화면과 ±1% 차이는 반올림·시점 차이(정상)
    const parts = [`${label} ${p}%`, r, fresh, 'statusline 스냅샷 · 설정값과 ±1%는 반올림/시점 차이'].filter(Boolean);
    document.getElementById(itemId).title = parts.join(' · ');
  };
  set('u5item', 'u5pct', 'u5fill', '현재 세션·5시간', u.fiveHourPct, u.fiveHourResetsAt);
  set('uwitem', 'uwpct', 'uwfill', '주간(모든 모델)', u.weeklyPct, u.weeklyResetsAt);
  const cost = document.getElementById('ucost');
  cost.textContent = (u.costUSD != null) ? `$${Number(u.costUSD).toFixed(2)}` : '';
  cost.title = fresh ? `누적 비용 · ${fresh}` : '누적 비용';
}

function update(next) {
  for (const s of next) {
    const prev = prevEffective.get(s.id);
    if (prev && prev !== s.effective) { toast(s); maybeNotify(s); }
    prevEffective.set(s.id, s.effective);
  }
  setSessions(next);
  renderPanel();
}

// ---------- 토스트 ----------
function toast(s) {
  const m = STATE_META[s.effective] || STATE_META.unknown;
  const el = document.createElement('div');
  el.className = 'toast ' + s.effective;
  el.textContent = `${m.emoji || '🔔'} ${s.name} — ${m.label}`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => { el.classList.add('bye'); setTimeout(() => el.remove(), 450); }, 5000);
}

// ---------- 사이드 패널 ----------
export function renderPanel() {
  const counts = { working: 0, done: 0, blocked: 0, stalled: 0, unknown: 0 };
  for (const s of sessions) counts[s.effective] = (counts[s.effective] || 0) + 1;
  for (const k of ['working', 'done', 'blocked', 'stalled']) {
    document.getElementById('c-' + k).textContent = counts[k] || 0;
  }

  listEl.innerHTML = '';
  const order = { stalled: 0, blocked: 1, working: 2, unknown: 3, done: 4 };
  const sorted = [...sessions].sort(
    (a, b) => order[a.effective] - order[b.effective] ||
      (b.lastActivity || 0) - (a.lastActivity || 0)
  );
  // 검색·상태 필터 적용 (헤더 카운트 칩은 전체 기준 유지)
  const q = searchQuery.trim().toLowerCase();
  const filtered = sorted.filter((s) => {
    if (statusFilter !== 'all' && s.effective !== statusFilter) return false;
    if (q) {
      const hay = (s.name + ' ' + (s.project || '') + ' ' + (s.detail || '') + ' ' + (s.lastPrompt || '') + ' ' + (s.lastResponse || '')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  if (!filtered.length) {
    const empty = document.createElement('li');
    empty.className = 'list-empty';
    empty.textContent = (q || statusFilter !== 'all') ? '조건에 맞는 세션이 없습니다.' : '세션이 없습니다.';
    listEl.appendChild(empty);
    return;
  }
  for (const s of filtered) {
    const m = STATE_META[s.effective] || STATE_META.unknown;
    const li = document.createElement('li');
    li.className = 'item ' + s.effective + (s.id === highlightId ? ' hl' : '');
    li.innerHTML = `
      <div class="row1">
        <span class="dot ${s.effective}" style="background:${m.color}"></span>
        <span class="name"></span>
        ${(s.effective === 'working' && s.inFlight > 0) ? `<span class="inflight" title="지금 도구 ${s.inFlight}개 실행 중">⚙ ${s.inFlight}</span>` : ''}
        <span class="badge ${s.effective}">${m.label}</span>
      </div>
      <div class="lastreq"></div>
      <div class="resp"></div>
      <div class="meta"><span>📁 ${s.project || '?'}</span><span>🕐 ${rel(s.lastActivity)}</span><button class="view-btn" type="button" title="세션 내용·이전 히스토리 보기">📄 내용 보기</button></div>`;
    li.querySelector('.name').textContent = s.name;
    const lr = li.querySelector('.lastreq');
    if (s.lastPrompt) { lr.textContent = '🗨 ' + s.lastPrompt; lr.title = s.lastPrompt; }
    else lr.style.display = 'none';
    const rp = li.querySelector('.resp');
    const respText = s.lastResponse || s.detail || '';
    if (respText) { rp.textContent = respText; rp.title = respText; }
    else rp.style.display = 'none';
    li.title = s.lastPrompt ? `내 요청: ${s.lastPrompt}\n\nAI 응답: ${respText}` : respText;
    li.onclick = () => { setHighlightId(s.id === highlightId ? null : s.id); renderPanel(); };
    li.ondblclick = () => { setHighlightId(s.id); openTalk(s); };           // 더블클릭: 내용 패널 열기
    const vb = li.querySelector('.view-btn');
    if (vb) vb.onclick = (e) => { e.stopPropagation(); setHighlightId(s.id); openTalk(s); };   // 버튼: 내용 패널(하이라이트 토글 안 함)
    listEl.appendChild(li);
  }
}

// ---------- 세션 패널 자동 갱신 주기 — 설정에서 선택, localStorage('office.refresh') 영속 ----------
const REFRESHES = [
  { key: '3s', label: '⚡ 3초', ms: 3000 },
  { key: '5s', label: '🔄 5초', ms: 5000 },
  { key: '10s', label: '🐢 10초', ms: 10000 },
  { key: 'manual', label: '✋ 수동(안 함)', ms: 0 },
];
function resolveRefresh() {
  try { const k = localStorage.getItem('office.refresh'); const f = REFRESHES.find((r) => r.key === k); if (f) return f; } catch (e) { /* */ }
  return REFRESHES[1];
}
let refreshSetting = resolveRefresh();
function applyPanelTimer() {                 // 열린 패널을 현재 주기로 재설정 + LIVE 표시 토글
  if (sessionTimer) { clearInterval(sessionTimer); sessionTimer = null; }
  const live = document.querySelector('#session .sess-live');
  if (live) {
    live.style.display = refreshSetting.ms > 0 ? '' : 'none';
    live.title = refreshSetting.ms > 0 ? `${refreshSetting.ms / 1000}초마다 자동 갱신` : '';
  }
  if (talking && talkTarget && refreshSetting.ms > 0) {
    sessionTimer = setInterval(() => loadSession(talkTarget, false), refreshSetting.ms);
  }
}
function setRefresh(key) {
  const f = REFRESHES.find((r) => r.key === key);
  if (!f) return;
  refreshSetting = f;
  try { localStorage.setItem('office.refresh', key); } catch (e) { /* */ }
  const sel = document.getElementById('refresh-select');
  if (sel && sel.value !== key) sel.value = key;
  applyPanelTimer();
}

// 대사 말풍선 표시 — speechOn 상태는 world-state, localStorage('office.speech') 영속(기본 켜기)
function setSpeech(on) {
  setSpeechOn(on);
  try { localStorage.setItem('office.speech', on ? 'on' : 'off'); } catch (e) { /* */ }
  if (!on) speeches.clear();
}

// 알림 — 세션이 입력 대기(blocked)/멈춤(stalled) 으로 전이할 때 데스크톱 알림 + 소리.
// 앰비언트 알림 그래디언트(Pousman & Stasko): interrupt 는 진짜 주목이 필요한 상태에만 예약.
const NOTIFY = [
  { key: 'off', label: '🔕 끄기', states: [] },
  { key: 'blocked', label: '🔔 입력 대기', states: ['blocked'] },
  { key: 'blocked_stalled', label: '🔔 입력대기+멈춤', states: ['blocked', 'stalled'] },
];
function resolveNotify() {
  try { const k = localStorage.getItem('office.notify'); const f = NOTIFY.find((n) => n.key === k); if (f) return f; } catch (e) { /* */ }
  return NOTIFY[1];   // 기본: 입력 대기만
}
let notifySetting = resolveNotify();
let audioCtx = null;
function beep() {                              // zero-dep WebAudio 알림음(짧은 2음)
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    [[660, 0], [880, 0.12]].forEach(([f, dt]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.0001, now + dt);
      g.gain.exponentialRampToValueAtTime(0.16, now + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dt + 0.18);
      o.start(now + dt); o.stop(now + dt + 0.2);
    });
  } catch (e) { /* */ }
}
const notifyCooldown = new Map();             // id → 마지막 알림 시각(ms)
const NOTIFY_COOLDOWN_MS = 180000;            // 3분: 같은 세션 반복/플래핑 알림 억제(alert fatigue 방지)
function maybeNotify(s) {                      // update() 가 전이 시 호출
  if (!notifySetting.states.includes(s.effective)) return;
  const t = Date.now(), last = notifyCooldown.get(s.id) || 0;
  if (t - last < NOTIFY_COOLDOWN_MS) return;   // 쿨다운 내 중복 알림 억제
  notifyCooldown.set(s.id, t);
  beep();
  if (window.Notification && Notification.permission === 'granted') {
    const m = STATE_META[s.effective] || STATE_META.unknown;
    const title = `${m.emoji || '🔔'} ${s.name}`;
    const body = (s.effective === 'blocked' ? '입력 대기 중' : m.label) + (s.detail ? ' — ' + String(s.detail).slice(0, 90) : '');
    try {
      const n = new Notification(title, { body, tag: 'office-' + s.id, silent: true });
      n.onclick = () => { window.focus(); try { openTalk(s); } catch (e) { /* */ } n.close(); };
    } catch (e) { /* */ }
  }
}
function setNotify(key) {
  const f = NOTIFY.find((n) => n.key === key);
  if (!f) return;
  notifySetting = f;
  try { localStorage.setItem('office.notify', key); } catch (e) { /* */ }
  const sel = document.getElementById('notify-select');
  if (sel && sel.value !== key) sel.value = key;
  // 켤 때 권한 요청(설정 변경=사용자 제스처) — 거부돼도 소리는 동작
  if (key !== 'off' && window.Notification && Notification.permission === 'default') {
    Notification.requestPermission().then((p) => { if (p === 'denied') toastMsg('데스크톱 알림은 차단됨 — 소리로만 알립니다', false); });
  }
}

function toastMsg(text, ok) {
  const el = document.createElement('div');
  el.className = 'toast ' + (ok ? 'done' : 'stalled');
  el.textContent = (ok ? '✅ ' : '⚠️ ') + text;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => { el.classList.add('bye'); setTimeout(() => el.remove(), 450); }, 4000);
}
// 세션 내용 보기(읽기 전용) — 다가가 Enter. 상태/현재작업 + 최근 대화 미리보기.
// 명령 실행은 CLI 터미널에서 하므로, 이어가기용 `claude --resume` 명령만 복사 제공.
let sessionData = null;
let sessionTimer = null;                      // 패널 열린 동안 라이브 갱신 타이머(주기는 refreshSetting)
let sessionLimit = 30;                        // 현재 불러올 메시지 수("이전 더 보기"로 증가)
let loadMoreFlag = false;                     // 직전 로드가 "더 보기"였는지(스크롤 상단 유지용)
const SESSION_LIMIT_MAX = 200;
function setBadge(ov, eff) {
  const b = ov.querySelector('.sess-badge');
  const m = STATE_META[eff] || STATE_META.unknown;
  b.className = 'sess-badge ' + eff;
  b.textContent = (m.emoji ? m.emoji + ' ' : '') + m.label;
}
function renderMeta(d) {                        // 지표 칩 + 목표 + 지금 실행 + 산출물 링크
  const meta = document.getElementById('session').querySelector('.sess-meta');
  meta.innerHTML = '';
  const chips = [];
  const tk = fmtTokens(d.tokens); if (tk) chips.push('🪙 ' + tk + ' tok');
  const el = fmtElapsed(d.createdAt); if (el) chips.push('⏱ ' + el);
  if (d.inFlight && d.inFlight.tasks > 0) chips.push('⚙ ' + d.inFlight.tasks + ' 실행' + (d.inFlight.queued ? ` (+${d.inFlight.queued})` : ''));
  if (chips.length) {
    const row = document.createElement('div'); row.className = 'sess-chips';
    for (const c of chips) { const s = document.createElement('span'); s.className = 'sess-chip'; s.textContent = c; row.appendChild(s); }
    meta.appendChild(row);
  }
  if (d.intent) { const i = document.createElement('div'); i.className = 'sess-intent'; i.textContent = '🎯 ' + d.intent; meta.appendChild(i); }
  if (d.fan && d.fan.length) {
    const f = document.createElement('div'); f.className = 'sess-line';
    const b = document.createElement('b'); b.textContent = '⚙ 지금 실행 '; f.appendChild(b);
    f.appendChild(document.createTextNode(d.fan.map((x) => x.label).join(' · ')));
    meta.appendChild(f);
  }
  if (d.children && d.children.length) {
    const row = document.createElement('div'); row.className = 'sess-links';
    const lbl = document.createElement('span'); lbl.className = 'sess-chip'; lbl.textContent = '🔗 산출물'; row.appendChild(lbl);
    for (const c of d.children) {
      const a = document.createElement('a'); a.className = 'sess-link'; a.href = c.href; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = (c.kind === 'pr' ? 'PR #' : (c.kind === 'issue' ? '#' : '')) + (c.id || 'link');
      row.appendChild(a);
    }
    meta.appendChild(row);
  }
}
// 변화 감지용 시그니처(상태·현재작업·메시지 수·마지막 메시지 꼬리) → lib/sig.mjs
async function loadSession(s, initial) {
  const ov = document.getElementById('session');
  try {
    const res = await fetch(`/api/transcript?id=${encodeURIComponent(s.id)}&limit=${sessionLimit}`);
    const d = await res.json().catch(() => ({}));
    if (!talking || talkTarget !== s) return;          // 이미 닫혔거나 대상 변경
    if (!d.ok) { if (initial) ov.querySelector('.sess-detail').textContent = '불러오기 실패: ' + (d.error || res.status); return; }
    if (!initial && sessionData && sessionSig(d) === sessionSig(sessionData)) return;  // 변화 없음 → 깜빡임 방지
    renderSession(d);
  } catch (e) {
    if (initial) ov.querySelector('.sess-detail').textContent = '불러오기 실패 (네트워크)';
  }
}
export async function openTalk(s) {           // (이름 유지) 세션 패널 열기 + 라이브 갱신 시작
  setTalkTarget(s); setTalking(true);
  keys.up = keys.down = keys.left = keys.right = keys.sprint = false;
  const ov = document.getElementById('session');
  ov.querySelector('.sess-name').textContent = s.name || '(이름 없음)';
  setBadge(ov, s.effective || s.state || 'unknown');
  ov.querySelector('.sess-detail').textContent = '불러오는 중…';
  ov.querySelector('.sess-msgs').innerHTML = '';
  ov.querySelector('.sess-cmd').textContent = '';
  ov.style.display = 'flex';
  if (sessionTimer) { clearInterval(sessionTimer); sessionTimer = null; }
  sessionData = null; sessionLimit = 30; loadMoreFlag = false;
  await loadSession(s, true);
  applyPanelTimer();                          // refreshSetting 주기로 라이브 갱신 시작(수동이면 미설정)
}
function renderSession(d) {
  const ov = document.getElementById('session');
  if (d.state) setBadge(ov, d.state);                                          // 라이브 상태 반영
  ov.querySelector('.sess-detail').textContent = d.detail || '(현재 작업 설명 없음)';
  renderMeta(d);                                                               // 지표·목표·산출물
  const wrap = ov.querySelector('.sess-msgs');
  const pinned = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 48;  // 바닥 근처면 자동 추적
  wrap.innerHTML = '';
  if (!d.messages || !d.messages.length) {
    const e = document.createElement('div'); e.className = 'sess-empty';
    e.textContent = '최근 대화 내용을 찾지 못했습니다.';
    wrap.appendChild(e);
  } else {
    // 더 오래된 내용이 남아있을 가능성: 요청 한도만큼 꽉 채워 왔고 아직 상한 미만
    if (d.messages.length >= sessionLimit && sessionLimit < SESSION_LIMIT_MAX) {
      const more = document.createElement('button');
      more.type = 'button'; more.className = 'sess-more'; more.textContent = '⬆ 이전 더 보기';
      more.onclick = () => {
        sessionLimit = Math.min(SESSION_LIMIT_MAX, sessionLimit + 40);
        loadMoreFlag = true;
        if (talkTarget) loadSession(talkTarget, true);
      };
      wrap.appendChild(more);
    }
    const who = { user: '나(사용자)', assistant: 'Claude' };
    for (const m of d.messages) {
      const el = document.createElement('div'); el.className = 'sess-msg ' + m.role;
      const time = fmtTime(m.ts);
      if (m.role !== 'tool') {
        const w = document.createElement('span'); w.className = 'who';
        w.textContent = who[m.role] || m.role;
        if (time) { const tm = document.createElement('span'); tm.className = 'mtime'; tm.textContent = ' · ' + time; w.appendChild(tm); }
        el.appendChild(w);
        el.appendChild(document.createTextNode(m.text));
      } else {                                   // 툴 단계: 🔧 이름 · 요약 · 상태(✓/✗)
        const name = document.createElement('span'); name.className = 'tool-name';
        name.textContent = '🔧 ' + toolShortName(m.name || 'tool');
        el.appendChild(name);
        if (m.text) { const sm = document.createElement('span'); sm.className = 'tool-sum'; sm.textContent = m.text; el.appendChild(sm); }
        if (m.error === true || m.error === false) {
          const st = document.createElement('span'); st.className = 'tool-st ' + (m.error ? 'err' : 'ok');
          st.textContent = m.error ? '✗' : '✓'; el.appendChild(st);
        }
        if (time) { const tm = document.createElement('span'); tm.className = 'mtime'; tm.textContent = ' · ' + time; el.appendChild(tm); }
      }
      wrap.appendChild(el);
    }
    if (loadMoreFlag) { wrap.scrollTop = 0; loadMoreFlag = false; }            // "더 보기" 직후엔 상단(오래된 내용) 노출
    else if (pinned) wrap.scrollTop = wrap.scrollHeight;                       // 바닥이었으면 새 내용까지 추적
  }
  ov.querySelector('.sess-cmd').textContent = d.resumeCmd || '(세션 ID 없음)';
  sessionData = d;
}
export function closeTalk() {                  // (이름 유지) 세션 패널 닫기 + 갱신 중지
  setTalking(false); setTalkTarget(null); sessionData = null;
  if (sessionTimer) { clearInterval(sessionTimer); sessionTimer = null; }
  const ov = document.getElementById('session');
  if (ov) ov.style.display = 'none';
}
// 설정 패널 — , 키 또는 헤더 ⚙ 버튼으로 토글(Mac 기본 Cmd+,와 충돌 없음). 설정 행은 index.html .set-row 추가.
export function openSettings() {
  setSettingsOpen(true);
  keys.up = keys.down = keys.left = keys.right = keys.sprint = false;
  const ov = document.getElementById('settings'); if (ov) ov.style.display = 'flex';
}
export function closeSettings() {
  setSettingsOpen(false);
  const ov = document.getElementById('settings'); if (ov) ov.style.display = 'none';
}

// ---------- 패널/설정 DOM 배선 (검색·필터·세션버튼·설정버튼·갱신/대사/알림 드롭다운) ----------
// 이동키(keydown/keyup)·속도 드롭다운은 메인의 initPlayerControls 가 담당.
export function initPanelTools() {
  const search = document.getElementById('sess-search');
  if (search) search.addEventListener('input', (e) => { searchQuery = e.target.value || ''; renderPanel(); });
  const chips = document.getElementById('filter-chips');
  if (chips) chips.addEventListener('click', (e) => {
    const btn = e.target.closest('.fchip'); if (!btn) return;
    statusFilter = btn.dataset.f || 'all';
    chips.querySelectorAll('.fchip').forEach((b) => b.classList.toggle('on', b === btn));
    renderPanel();
  });
  // 패널 자동 갱신 주기 드롭다운
  const rf = document.getElementById('refresh-select');
  if (rf) {
    rf.innerHTML = '';
    for (const r of REFRESHES) { const o = document.createElement('option'); o.value = r.key; o.textContent = r.label; rf.appendChild(o); }
    rf.value = refreshSetting.key;
    rf.addEventListener('change', (e) => setRefresh(e.target.value));
  }
  // 대사 말풍선 표시 드롭다운
  const sc = document.getElementById('speech-select');
  if (sc) {
    sc.innerHTML = '';
    for (const o of [['on', '💬 켜기'], ['off', '🔇 끄기']]) { const op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; sc.appendChild(op); }
    sc.value = speechOn ? 'on' : 'off';
    sc.addEventListener('change', (e) => setSpeech(e.target.value === 'on'));
  }
  // 알림 드롭다운
  const nt = document.getElementById('notify-select');
  if (nt) {
    nt.innerHTML = '';
    for (const n of NOTIFY) { const o = document.createElement('option'); o.value = n.key; o.textContent = n.label; nt.appendChild(o); }
    nt.value = notifySetting.key;
    nt.addEventListener('change', (e) => setNotify(e.target.value));
  }
  const sx = document.querySelector('#session .sess-x');
  if (sx) sx.addEventListener('click', closeTalk);
  const cp = document.querySelector('#session .sess-copy');
  if (cp) cp.addEventListener('click', () => {
    const cmd = (sessionData && sessionData.resumeCmd) || '';
    if (!cmd) { toastMsg('복사할 명령이 없습니다', false); return; }
    navigator.clipboard.writeText(cmd)
      .then(() => toastMsg('이어가기 명령 복사됨 — 터미널에 붙여넣기', true))
      .catch(() => toastMsg('복사 실패 (클립보드 권한)', false));
  });
  const sov = document.getElementById('session');
  if (sov) sov.addEventListener('mousedown', (e) => { if (e.target === sov) closeTalk(); });
  const setBtn = document.getElementById('settings-btn');
  if (setBtn) setBtn.addEventListener('click', () => (settingsOpen ? closeSettings() : openSettings()));
  const setOv = document.getElementById('settings');
  if (setOv) setOv.addEventListener('mousedown', (e) => { if (e.target === setOv) closeSettings(); });  // 배경 클릭 닫기
}

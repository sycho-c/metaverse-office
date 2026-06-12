/* Claude Office — Canvas 픽셀 오피스 렌더러
 * 애플 스타일 오피스: 화이트+라이트 오크+알루미늄, iMac 데스크, 자유 배치 클러스터 */
'use strict';

// ---------- 레이아웃 상수 ----------
const DISP = 2;                    // 화면 표시 배율 (CSS px per 논리 px)
let S = 2;                         // 백킹 렌더 배율 = DISP × devicePixelRatio (프레임마다 갱신, 고DPI 선명도)
const POD_W = 92;
const POD_H = 106;
const AISLE_X = 44;
const AISLE_Y = 40;
const WALL = 14;
const TOP_WALL = 22;
const ZONE_H = 124;                // 방 깊이(캐릭터가 방 안 깊숙이 서도록)
const CORRIDOR_H = 26;

// 애플 스타일 팔레트 (화이트 · 라이트오크 · 알루미늄 · 소프트 그레이)
const C = {
  // 작업 영역 바닥: 매끄러운 단색 블루그레이(체크·흰점 없음, 시안 스와치 매칭)
  tile: '#a7b3c6', tileAlt: '#a2aec2', grout: 'rgba(60,72,96,.05)',
  wall: '#cdd5e0', wallShade: '#b3bdcb', wallDark: '#9ba6b6',
  glass: '#b5dcf2', glassDeep: '#8cc6e8',
  roomWood: '#ecd9b4', roomWoodAlt: '#e6d1a6', roomWoodSeam: 'rgba(160,120,60,.18)',
  roomB: '#f1ece3', roomBalt: '#eae4d8',          // 탕비실: 따뜻한 크림 타일
  roomEdge: '#c2c6cc',
  rugs: [['#dde3ec', '#e5eaf1'], ['#dee8de', '#e6eee6'], ['#ece5da', '#f1ebe2']],
  rugLine: 'rgba(0,0,0,.05)',
  // 라이트 오크 데스크 + 알루미늄
  oakHi: '#f0dcae', oak: '#e7cd97', oakGrain: '#d4b67c', oakEdge: '#c9a96a',
  alu: '#d4d7dc', aluHi: '#e8eaee', aluDark: '#b2b6be',
  white: '#f8f9fa', whiteEdge: '#dfe2e6',
  chair: '#aeb3bb', chairSeat: '#c9ccd2', chairDark: '#8d929b',
  sofaBase: '#8fb98a', sofaSeat: '#a8cca0', sofaHi: '#c4ddba', sofaDark: '#6e9b6b',  // 세이지 그린 라운지
  tan: '#d8b27e', tanDark: '#bb9560',
  potDark: '#c9ccd2', pot: '#eceef0', potHi: '#ffffff',
  leafDark: '#3a9457', leaf: '#4cb56c', leafHi: '#6cc986',
  outline: '#4a4d55', monitor: '#1d1f24', monitorHi: '#34373e',
  screenBezel: '#0f1115',
  shadow: 'rgba(60,65,78,.13)',
};

// 디자인 시스템 시맨틱: success #22C55E / warning #F59E0B / danger #EF4444 / info #3B82F6 / neutral #64748B
const SCREEN = {
  working: '#bbf7d0', done: '#bfdbfe', blocked: '#fed7aa',
  stalled: '#334155', unknown: '#64748b',
};

const STATE_META = {
  working: { color: '#22C55E', label: '작업중',    emoji: null },
  done:    { color: '#3B82F6', label: '완료',      emoji: '✅' },
  blocked: { color: '#F59E0B', label: '입력 대기', emoji: '⚠️' },
  stalled: { color: '#EF4444', label: '멈춤 의심', emoji: '💤' },
  unknown: { color: '#64748B', label: '알 수 없음', emoji: '❔' },
};

// 이름표 버블 배경(흰 글씨) = 시맨틱 색 그대로
const TAG_COLOR = {
  working: '#22C55E', done: '#3B82F6', blocked: '#F59E0B',
  stalled: '#EF4444', unknown: '#64748B',
};

const SKINS  = ['#f1c27d', '#e0ac69', '#ffdbac', '#d9a066'];
const HAIRS  = ['#2d2235', '#4a3320', '#7b4a12', '#26262c', '#8c2f2f', '#3a4a8c', '#62656d', '#c75b8a'];
const HAIRHI = ['#4a3a58', '#65482e', '#9e6420', '#3f3f48', '#aa4848', '#5163ab', '#83868f', '#d878a4'];
const SHIRTS = ['#4a78bb', '#bb5555', '#46a468', '#8f68c4', '#c39247', '#46a8a2', '#7a8694', '#a85f86'];

// ---------- 상태 ----------
let sessions = [];
let prevEffective = new Map();
let highlightId = null;
let hideDone = false;
let cellRects = [];
let tagJobs = [];
let zoneLabels = [];

// 충돌/보행
let obstacles = [];                // 통과 불가 영역 (논리 AABB)
let floorW = 0, floorH = 0;        // 현재 바닥 논리 크기
const walkers = new Map();         // sessionId → 보행 상태
let lastT = 0, dtFrame = 16;       // 프레임 간격(ms)
let maxWalkers = 2;                // 동시 보행 인원 상한
const ROAM_TOP = TOP_WALL + ZONE_H + 2;   // 코어 보행 영역 상단(복도)
const WALK_SPEED = 0.05;           // 논리px/ms
let rooms = [];                    // 휴게실/탕비실 기하 {type,x,y,w,h} (개방형, 아래 열림)
let seatMap = [];                  // pod별 좌석 배정 [pods][4] (세션 or undefined)
const speeches = new Map();        // sessionId → { text, until }
let speechCooldown = 1500;
let tagPlaced = new Map();         // sessionId → 최종 이름표 위치 {cx,y} (말풍선 배치용)

// 상황별 랜덤 대사
const SAY = {
  room_break: ['커피 한 잔 ☕', '잠깐 쉬자', '휴~ 당 떨어졌다', '소파 최고야', '5분만 쉴게요', '리프레시 🌿'],
  room_pantry: ['간식 타임 🍪', '물 좀 마시고', '당 충전! 🍫', '냉장고에 내 거…', '커피 리필', '컵라면 ㄱ?'],
  walk: ['스트레칭 좀…', '다리 저려', '잠깐 산책', '머리 식히자', '어디 가지~', '한 바퀴 돌고 올게'],
  working: ['음… 왜 안 되지', '거의 다 됐다', '빌드 도는 중 ⏳', '이거 커밋!', '집중 모드 🔥', '로그 어디 갔어', '한 줄만 더…'],
  done: ['끝났다! 🎉', '오늘도 수고', 'PR 올렸어요', '리뷰 ㄱㄱ', '깔끔하네 ✨', '머지 완료'],
  blocked: ['확인 부탁해요 🙏', '입력 대기 중…', '음, 어떻게 할까', '잠깐 멈춤', '결정만 해주시면!'],
  stalled: ['음…', '어? 멈췄나', 'zzz', '응답이 없네', '뭔가 이상한데'],
};

const canvas = document.getElementById('office');
const ctx = canvas.getContext('2d');
const listEl = document.getElementById('list');
const connEl = document.getElementById('conn');

// ---------- 유틸 ----------
function hash(s) {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function lookOf(id) {
  const h = hash(id);
  const hi = (h >>> 3) % HAIRS.length;
  return {
    skin: SKINS[h % SKINS.length],
    hair: HAIRS[hi], hairHi: HAIRHI[hi],
    shirt: SHIRTS[(h >>> 7) % SHIRTS.length],
    deskKind: (h >>> 16) % 3,
    hairStyle: (h >>> 21) % 4,       // 0 숏컷 1 사이드 2 롱헤어 3 똥머리
    glasses: (h >>> 23) % 3 === 0,
    headphone: (h >>> 25) % 4 === 0,
    collar: (h >>> 27) % 2 === 0,
    phase: (h % 100) / 100 * Math.PI * 2,
  };
}
function rel(ms) {
  if (!ms) return '—';
  const d = Date.now() - ms;
  if (d < 60e3) return '방금';
  if (d < 3600e3) return Math.floor(d / 60e3) + '분 전';
  if (d < 86400e3) return Math.floor(d / 3600e3) + '시간 전';
  return Math.floor(d / 86400e3) + '일 전';
}
function visible() {
  return hideDone ? sessions.filter((s) => s.effective !== 'done') : sessions;
}

// ---------- SSE ----------
function connect() {
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
function resetLabel(epochSec) {
  if (!epochSec) return '';
  const ms = epochSec * 1000 - Date.now();
  if (ms <= 0) return '곧 재설정';
  const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
  const when = new Date(epochSec * 1000).toLocaleString('ko-KR',
    { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  return h >= 1 ? `${h}시간 ${m}분 후 재설정 · ${when}` : `${m}분 후 재설정 · ${when}`;
}
function usageColor(p) { return p >= 85 ? '#EF4444' : p >= 60 ? '#F59E0B' : '#22C55E'; }
// 스냅샷 신선도: office-usage.json 은 statusline 렌더 시점에만 갱신됨(라이브 아님)
function freshnessLabel(tsMs) {
  if (!tsMs) return '';
  const age = Date.now() - tsMs;
  if (age < 90e3) return '방금 기준';
  const m = Math.round(age / 60e3);
  if (m < 60) return `${m}분 전 기준`;
  const h = Math.floor(m / 60);
  return `${h}시간 ${m % 60}분 전 기준`;
}
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
    if (prev && prev !== s.effective) toast(s);
    prevEffective.set(s.id, s.effective);
  }
  sessions = next;
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
function renderPanel() {
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
  for (const s of sorted) {
    const m = STATE_META[s.effective] || STATE_META.unknown;
    const li = document.createElement('li');
    li.className = 'item ' + s.effective + (s.id === highlightId ? ' hl' : '');
    li.innerHTML = `
      <div class="row1">
        <span class="dot ${s.effective}" style="background:${m.color}"></span>
        <span class="name"></span>
        <span class="badge ${s.effective}">${m.label}</span>
      </div>
      <div class="lastreq"></div>
      <div class="resp"></div>
      <div class="meta"><span>📁 ${s.project || '?'}</span><span>🕐 ${rel(s.lastActivity)}</span></div>`;
    li.querySelector('.name').textContent = s.name;
    const lr = li.querySelector('.lastreq');
    if (s.lastPrompt) { lr.textContent = '🗨 ' + s.lastPrompt; lr.title = s.lastPrompt; }
    else lr.style.display = 'none';
    const rp = li.querySelector('.resp');
    const respText = s.lastResponse || s.detail || '';
    if (respText) { rp.textContent = respText; rp.title = respText; }
    else rp.style.display = 'none';
    li.title = s.lastPrompt ? `내 요청: ${s.lastPrompt}\n\nAI 응답: ${respText}` : respText;
    li.onclick = () => { highlightId = s.id === highlightId ? null : s.id; renderPanel(); };
    listEl.appendChild(li);
  }
}

// ---------- 클릭/호버 ----------
function cellAt(ev) {
  const r = canvas.getBoundingClientRect();
  const lx = (ev.clientX - r.left) / DISP, ly = (ev.clientY - r.top) / DISP;
  for (const c of cellRects) {
    if (lx >= c.x && lx < c.x + c.w && ly >= c.y && ly < c.y + c.h) return c.s;
  }
  return null;
}
canvas.addEventListener('click', (ev) => {
  const s = cellAt(ev);
  highlightId = s && s.id !== highlightId ? s.id : null;
  renderPanel();
});
canvas.addEventListener('mousemove', (ev) => {
  const s = cellAt(ev);
  canvas.title = s ? `${s.name}\n${s.detail || ''}` : '';
});
document.getElementById('hide-done').addEventListener('change', (e) => {
  hideDone = e.target.checked;
});

// ---------- 레이아웃 (자유 배치: 슬롯 셔플 + 벽돌 오프셋 + 지터) ----------
function computeLayout(n) {
  const availLogical = Math.max(460, (canvas.parentElement.clientWidth - 30) / DISP);
  const podCols = Math.max(2, Math.min(5,
    Math.floor((availLogical - WALL * 2 + AISLE_X) / (POD_W + AISLE_X))));
  const pods = Math.max(1, Math.ceil(Math.ceil(n * 1.5) / 4));  // 좌석 ~1.5배(빈 자리 여유)
  const podRows = Math.ceil(pods / podCols) + (pods % podCols === 0 && pods > podCols ? 0 : 0);
  const slots = podCols * podRows;
  const usedCols = Math.min(pods, podCols);
  const W = Math.max(
    WALL * 2 + usedCols * POD_W + (usedCols - 1) * AISLE_X, 470);
  const workY = TOP_WALL + ZONE_H + CORRIDOR_H;
  const BOTTOM_BAND = 124;                            // 하단 Infrastructure / QA 존
  const bottomTop = workY + podRows * (POD_H + AISLE_Y) + 6;
  const H = bottomTop + BOTTOM_BAND;

  // 슬롯 셔플 (좌상단부터 채우지 않게) — 시드 고정으로 위치 안정
  const order = [...Array(slots).keys()];
  let seed = hash('scatter' + pods + ':' + podCols);
  for (let i = order.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }

  const innerW = W - WALL * 2;
  const span = podCols * POD_W + (podCols - 1) * AISLE_X;
  const x0 = WALL + Math.max(0, (innerW - span) / 2);

  const podPos = [];
  const emptySlots = [];
  for (let sIdx = 0; sIdx < slots; sIdx++) {
    const slot = order[sIdx];
    const pc = slot % podCols, pr = Math.floor(slot / podCols);
    const jh = hash('pp' + slot);
    const pos = {
      x: x0 + pc * (POD_W + AISLE_X) + (pr % 2 ? 16 : 0) + ((jh % 13) - 6),
      y: workY + pr * (POD_H + AISLE_Y) + ((jh >>> 4) % 11) - 5,
    };
    pos.x = Math.max(WALL, Math.min(W - WALL - POD_W, pos.x));
    if (sIdx < pods) podPos.push(pos);
    else emptySlots.push(pos);
  }
  return { W, H, pods, podCols, podRows, podPos, emptySlots, workY, bottomTop, bottomH: BOTTOM_BAND };
}

// ---------- 바닥/벽 ----------
function drawFloor(W, H) {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  // 단색 블루그레이 바닥 (체크무늬·흰 하이라이트 제거 → 시안처럼 매끈)
  ctx.fillStyle = C.tile;
  ctx.fillRect(0, 0, W, H);
  // 아주 옅은 대형 타일 seam (밋밋함만 살짝 깸, 거의 안 보임)
  ctx.fillStyle = C.grout;
  const T = 60;
  for (let x = T; x < W; x += T) ctx.fillRect(x, 0, 1, H);
  for (let y = T; y < H; y += T) ctx.fillRect(0, y, W, 1);
}

function drawWalls(W, H) {
  ctx.fillStyle = C.wall;
  ctx.fillRect(0, 0, W, TOP_WALL);
  ctx.fillStyle = C.wallShade;
  ctx.fillRect(0, TOP_WALL - 3, W, 3);
  for (let x = 26; x < W - 36; x += 76) {
    ctx.fillStyle = C.wallDark;
    ctx.fillRect(x - 2, 3, 26, 16);
    ctx.fillStyle = C.glass;
    ctx.fillRect(x, 5, 22, 7);
    ctx.fillStyle = C.glassDeep;
    ctx.fillRect(x, 12, 22, 5);
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.fillRect(x + 3, 5, 3, 12);
    ctx.fillStyle = C.wallDark;
    ctx.fillRect(x + 10, 5, 2, 12);
  }
  ctx.fillStyle = C.wallShade;
  ctx.fillRect(0, TOP_WALL, 3, H - TOP_WALL);
  ctx.fillRect(W - 3, TOP_WALL, 3, H - TOP_WALL);
  ctx.fillRect(0, H - 4, W, 4);
}

// ---------- 그림자/식물 ----------
function shadow(cx, cy, w, h) {
  ctx.fillStyle = C.shadow;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlant(x, y, big) {
  const w = big ? 9 : 7, ph = big ? 6 : 5;
  shadow(x + w / 2, y + ph + 13, w + 3, 3);
  ctx.fillStyle = C.potHi;                       // 화이트 라운드 포트
  ctx.fillRect(x, y + 9, w, ph);
  ctx.fillStyle = C.pot;
  ctx.fillRect(x, y + 11, w, ph - 2);
  ctx.fillStyle = C.potDark;
  ctx.fillRect(x, y + 9 + ph - 1, w, 1);
  ctx.fillStyle = C.leafDark;
  ctx.fillRect(x + w / 2 - 2, y, 4, 10);
  ctx.fillStyle = C.leaf;
  ctx.fillRect(x + w / 2 - 4, y + 2, 3, 4);
  ctx.fillRect(x + w / 2 + 1, y + 1, 3, 5);
  ctx.fillStyle = C.leafHi;
  ctx.fillRect(x + w / 2 - 3, y + 2, 1, 2);
  ctx.fillRect(x + w / 2 + 2, y + 1, 1, 2);
  if (big) {
    ctx.fillStyle = C.leaf;
    ctx.fillRect(x + w / 2 - 1, y - 3, 2, 4);
    ctx.fillStyle = C.leafHi;
    ctx.fillRect(x + w / 2 - 1, y - 3, 1, 2);
  }
}

// ---------- 가구 (애플 라운지 스타일) ----------
function drawSofa(x, y, w) {
  shadow(x + w / 2, y + 13, w + 4, 4);
  ctx.fillStyle = C.sofaDark;
  ctx.fillRect(x - 1, y - 1, w + 2, 13);
  ctx.fillStyle = C.sofaBase;
  ctx.fillRect(x, y, w, 5);
  ctx.fillStyle = C.sofaHi;
  ctx.fillRect(x + 1, y, w - 2, 1);
  ctx.fillStyle = C.sofaSeat;
  ctx.fillRect(x, y + 4, w, 7);
  ctx.fillStyle = C.sofaHi;
  ctx.fillRect(x + 2, y + 5, w / 2 - 3, 3);
  ctx.fillRect(x + w / 2 + 1, y + 5, w / 2 - 3, 3);
  ctx.fillStyle = C.sofaDark;
  ctx.fillRect(x - 2, y + 1, 3, 10);
  ctx.fillRect(x + w - 1, y + 1, 3, 10);
  ctx.fillStyle = C.tan;                         // 탠 가죽 쿠션 포인트
  ctx.fillRect(x + 2, y + 1, 5, 4);
  ctx.fillStyle = C.tanDark;
  ctx.fillRect(x + 2, y + 4, 5, 1);
  ctx.fillStyle = '#9fb6d4';
  ctx.fillRect(x + w - 7, y + 1, 5, 4);
  // 오크 다리
  ctx.fillStyle = C.oakEdge;
  ctx.fillRect(x + 1, y + 11, 2, 3);
  ctx.fillRect(x + w - 3, y + 11, 2, 3);
}

function drawArmchair(x, y) {
  shadow(x + 6, y + 12, 14, 4);
  ctx.fillStyle = C.sofaDark;
  ctx.fillRect(x - 1, y - 1, 14, 12);
  ctx.fillStyle = C.sofaBase;
  ctx.fillRect(x, y, 12, 4);
  ctx.fillStyle = C.sofaSeat;
  ctx.fillRect(x + 1, y + 3, 10, 7);
  ctx.fillStyle = C.sofaHi;
  ctx.fillRect(x + 2, y + 4, 8, 2);
  ctx.fillStyle = C.oakEdge;
  ctx.fillRect(x + 1, y + 10, 2, 3);
  ctx.fillRect(x + 9, y + 10, 2, 3);
}

function drawCoffeeTable(x, y) {
  shadow(x + 7, y + 9, 16, 4);
  ctx.fillStyle = C.aluDark;
  ctx.fillRect(x, y + 1, 14, 7);
  ctx.fillStyle = C.oak;
  ctx.fillRect(x, y, 14, 7);
  ctx.fillStyle = C.oakHi;
  ctx.fillRect(x + 1, y, 12, 1);
  ctx.fillStyle = C.white;
  ctx.fillRect(x + 4, y + 2, 5, 3);
  ctx.fillStyle = '#bb5555';
  ctx.fillRect(x + 10, y + 2, 2, 2);
}

function drawRoundTable(cx, cy) {
  shadow(cx, cy + 8, 20, 5);
  ctx.fillStyle = '#6e9b6b';                      // 세이지 그린 의자
  for (const [dx, dy] of [[-11, 0], [11, 0]]) {
    ctx.fillRect(cx + dx - 3, cy + dy - 3, 6, 6);
    ctx.fillStyle = '#86b482';
    ctx.fillRect(cx + dx - 3, cy + dy - 3, 6, 2);
    ctx.fillStyle = '#6e9b6b';
  }
  ctx.fillStyle = C.whiteEdge;
  ctx.beginPath(); ctx.arc(cx, cy + 1, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.white;
  ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#bb5555';
  ctx.fillRect(cx - 2, cy - 2, 2, 2);
  ctx.fillStyle = '#46a468';
  ctx.fillRect(cx + 1, cy, 2, 2);
}

function drawBookshelf(x, y) {
  shadow(x + 9, y + 19, 20, 3);
  ctx.fillStyle = C.aluDark;
  ctx.fillRect(x - 1, y - 1, 20, 20);
  ctx.fillStyle = C.white;
  ctx.fillRect(x, y, 18, 18);
  ctx.fillStyle = C.oak;
  ctx.fillRect(x + 1, y + 5, 16, 1);
  ctx.fillRect(x + 1, y + 11, 16, 1);
  const cols = ['#bb5555', '#4a78bb', '#46a468', '#c39247'];
  for (let r = 0; r < 3; r++) {
    for (let c2 = 0; c2 < 4; c2++) {
      ctx.fillStyle = cols[(r + c2) % 4];
      ctx.fillRect(x + 3 + c2 * 4, y + 1 + r * 6, 2, 4);
    }
  }
}

// ---------- 탕비실 가전 (스테인리스/화이트) ----------
function drawFridge(x, y) {
  shadow(x + 6, y + 24, 14, 3);
  ctx.fillStyle = C.outline;
  ctx.fillRect(x - 1, y - 1, 14, 25);
  ctx.fillStyle = C.alu;
  ctx.fillRect(x, y, 12, 23);
  ctx.fillStyle = C.aluHi;
  ctx.fillRect(x, y, 3, 23);
  ctx.fillStyle = C.aluDark;
  ctx.fillRect(x, y + 9, 12, 1);
  ctx.fillRect(x, y + 21, 12, 2);
  ctx.fillStyle = '#6b7078';
  ctx.fillRect(x + 9, y + 2, 1, 5);
  ctx.fillRect(x + 9, y + 12, 1, 6);
}

function drawVending(x, y, t) {
  shadow(x + 8, y + 26, 18, 3);
  ctx.fillStyle = C.outline;
  ctx.fillRect(x - 1, y - 1, 17, 27);
  ctx.fillStyle = C.alu;
  ctx.fillRect(x, y, 15, 25);
  ctx.fillStyle = C.aluHi;
  ctx.fillRect(x, y, 2, 25);
  ctx.fillStyle = C.aluDark;
  ctx.fillRect(x, y + 22, 15, 3);
  ctx.fillStyle = '#22252b';                      // 다크 글라스 진열창
  ctx.fillRect(x + 2, y + 2, 8, 14);
  const snacks = ['#e85d4a', '#f0b32e', '#46b06a', '#9a6cd0', '#e87fb0', '#4aa8d8'];
  for (let r = 0; r < 3; r++) {
    for (let c2 = 0; c2 < 3; c2++) {
      ctx.fillStyle = snacks[(r * 3 + c2) % 6];
      ctx.fillRect(x + 3 + c2 * 2.5, y + 4 + r * 4, 2, 3);
    }
  }
  ctx.fillStyle = Math.floor(t / 700) % 2 ? '#30c158' : '#1f8a40';
  ctx.fillRect(x + 12, y + 3, 2, 2);
  ctx.fillStyle = '#3a3d44';
  ctx.fillRect(x + 11, y + 7, 3, 5);
  ctx.fillStyle = '#15171c';
  ctx.fillRect(x + 3, y + 18, 9, 4);
}

function drawCounter(x, y, w, t) {
  shadow(x + w / 2, y + 16, w, 4);
  ctx.fillStyle = C.outline;
  ctx.fillRect(x - 1, y - 1, w + 2, 15);
  ctx.fillStyle = C.white;
  ctx.fillRect(x, y, w, 9);
  ctx.fillStyle = C.oak;                          // 오크 하부장
  ctx.fillRect(x, y + 9, w, 5);
  ctx.fillStyle = C.oakGrain;
  ctx.fillRect(x, y + 9, w, 1);
  ctx.fillStyle = C.alu;                          // 싱크
  ctx.fillRect(x + 6, y + 2, 10, 5);
  ctx.fillStyle = C.aluDark;
  ctx.fillRect(x + 7, y + 3, 8, 3);
  ctx.fillStyle = '#6b7078';
  ctx.fillRect(x + 10, y, 1, 2);
  const cm = x + w - 16;                          // 커피머신 (실버)
  ctx.fillStyle = C.aluDark;
  ctx.fillRect(cm, y - 6, 11, 13);
  ctx.fillStyle = C.alu;
  ctx.fillRect(cm + 1, y - 5, 9, 11);
  ctx.fillStyle = '#2a2d33';
  ctx.fillRect(cm + 3, y - 1, 5, 5);
  ctx.fillStyle = Math.floor(t / 500) % 2 ? '#30c158' : '#1f8a40';
  ctx.fillRect(cm + 8, y - 4, 2, 2);
  const mw = x + w / 2 + 2;                       // 전자레인지
  ctx.fillStyle = C.alu;
  ctx.fillRect(mw, y - 4, 13, 8);
  ctx.fillStyle = '#22252b';
  ctx.fillRect(mw + 1, y - 3, 8, 6);
  ctx.fillStyle = '#30c158';
  ctx.fillRect(mw + 10, y - 2, 2, 1);
}

function drawSnackShelf(x, y) {
  shadow(x + 9, y + 19, 20, 3);
  ctx.fillStyle = C.aluDark;
  ctx.fillRect(x - 1, y - 1, 20, 20);
  ctx.fillStyle = C.white;
  ctx.fillRect(x, y, 18, 18);
  ctx.fillStyle = C.oak;
  ctx.fillRect(x + 1, y + 5, 16, 1);
  ctx.fillRect(x + 1, y + 11, 16, 1);
  const snacks = ['#e85d4a', '#f0b32e', '#46b06a', '#9a6cd0', '#e87fb0'];
  for (let r = 0; r < 3; r++) {
    for (let c2 = 0; c2 < 5; c2++) {
      ctx.fillStyle = snacks[(r + c2) % 5];
      ctx.fillRect(x + 2 + c2 * 3, y + 1 + r * 6, 2, 3);
    }
  }
}

function drawTV(x, y, t) {
  // 초슬림 디스플레이 + 알루미늄 스탠드
  ctx.fillStyle = C.outline;
  ctx.fillRect(x - 1, y - 1, 24, 14);
  ctx.fillStyle = C.screenBezel;
  ctx.fillRect(x, y, 22, 12);
  ctx.fillStyle = '#1a2530';
  ctx.fillRect(x + 1, y + 1, 20, 10);
  ctx.fillStyle = '#30c158';
  const ph = Math.floor(t / 600) % 2;
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(x + 3 + i * 3, y + 9 - ((i * 2 + ph) % 6), 2, 1 + ((i * 2 + ph) % 6));
  }
  ctx.fillStyle = C.alu;
  ctx.fillRect(x + 8, y + 12, 6, 1);
}

function drawWaterCooler(x, y) {
  shadow(x + 4, y + 17, 10, 3);
  ctx.fillStyle = C.alu;
  ctx.fillRect(x, y + 6, 7, 11);
  ctx.fillStyle = C.aluHi;
  ctx.fillRect(x, y + 6, 7, 2);
  ctx.fillStyle = '#8cc6e8';
  ctx.fillRect(x + 1, y, 5, 7);
  ctx.fillStyle = '#bde0f4';
  ctx.fillRect(x + 1, y, 2, 5);
  ctx.fillStyle = '#3a3d44';
  ctx.fillRect(x + 2, y + 10, 3, 1);
}

// ---------- 신규 테마 오브젝트 (AI Lab / Collaboration / Cafe) ----------
function drawMonitorWall(x, y, w, t) {            // AI Lab: 벽면 대형 대시보드 월
  const n = Math.max(2, Math.floor((w - 8) / 24));
  const hues = ['#22C55E', '#3B82F6', '#F59E0B', '#6366F1'];
  for (let i = 0; i < n; i++) {
    const mx = x + 4 + i * 24;
    ctx.fillStyle = C.outline; ctx.fillRect(mx, y, 22, 15);
    ctx.fillStyle = C.screenBezel; ctx.fillRect(mx + 1, y + 1, 20, 13);
    ctx.fillStyle = hues[i % 4];
    for (let b = 0; b < 4; b++) {
      const bh = 2 + ((i * 7 + b * 5 + Math.floor(t / 380)) % 9);
      ctx.fillRect(mx + 3 + b * 4, y + 12 - bh, 2, bh);
    }
  }
}
function drawAILabWall(x, y, w, t) {              // AI Lab: Claude/GPT/Gemini 대시보드 월
  const brands = [['Claude', '#D97757'], ['GPT', '#10A37F'], ['Gemini', '#4285F4']];
  const pw = Math.floor((w - 6) / 3);
  ctx.textAlign = 'center';
  for (let i = 0; i < 3; i++) {
    const bx = x + 3 + i * pw;
    ctx.fillStyle = C.outline; ctx.fillRect(bx, y, pw - 3, 17);
    ctx.fillStyle = '#0f1115'; ctx.fillRect(bx + 1, y + 1, pw - 5, 15);
    ctx.fillStyle = brands[i][1]; ctx.fillRect(bx + 1, y + 1, pw - 5, 3);     // 브랜드 헤더
    ctx.fillStyle = brands[i][1];
    for (let b = 0; b < 4; b++) { const bh = 2 + ((i * 5 + b * 4 + Math.floor(t / 360)) % 8); ctx.fillRect(bx + 3 + b * 3, y + 14 - bh, 2, bh); }
    ctx.fillStyle = '#cbd3e2'; ctx.font = '4.6px Pretendard, sans-serif';
    ctx.fillText(brands[i][0], bx + (pw - 3) / 2, y + 22.5);
  }
  ctx.textAlign = 'left';
}
function drawTokenBar(x, y, w, t) {               // AI Lab: Token Usage
  ctx.fillStyle = '#9aa3b5'; ctx.font = '4.4px Pretendard, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('Token', x, y + 3);
  const bx = x + 20, bw = w - 24;
  ctx.fillStyle = '#1b1d22'; ctx.fillRect(bx, y - 2, bw, 5);
  const p = 0.4 + 0.28 * Math.abs(Math.sin(t / 2200));
  ctx.fillStyle = '#F59E0B'; ctx.fillRect(bx + 1, y - 1, (bw - 2) * p, 3);
}
function drawAgentHealth(x, y, t) {               // AI Lab: Agent Health 모니터
  for (let i = 0; i < 6; i++) {
    const ok = (hash('ah' + i) + Math.floor(t / 1500)) % 6 !== 0;
    ctx.fillStyle = ok ? '#22C55E' : '#EF4444';
    ctx.fillRect(x + (i % 3) * 5, y + Math.floor(i / 3) * 5, 3, 3);
  }
}
function drawServerRack(x, y, t) {                // AI Lab: GPU 서버랙
  shadow(x + 8, y + 31, 18, 4);
  ctx.fillStyle = '#23252b'; ctx.fillRect(x, y, 16, 31);
  ctx.fillStyle = '#33363d'; ctx.fillRect(x + 1, y + 1, 14, 29);
  for (let u = 0; u < 6; u++) {
    const uy = y + 3 + u * 4;
    ctx.fillStyle = '#15171b'; ctx.fillRect(x + 2, uy, 12, 3);
    ctx.fillStyle = ((Math.floor(t / 300) + u) % 2) ? '#22C55E' : '#15632f';
    ctx.fillRect(x + 11, uy + 1, 1, 1);
    ctx.fillStyle = (u % 2) ? '#3B82F6' : '#F59E0B';
    ctx.fillRect(x + 3, uy + 1, 1, 1);
  }
}
function drawWhiteboard(x, y, w) {                // Collaboration: 화이트보드
  shadow(x + w / 2, y + 18, w, 3);
  ctx.fillStyle = C.aluDark; ctx.fillRect(x, y, w, 17);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 1, y + 1, w - 2, 14);
  ctx.fillStyle = '#3B82F6'; ctx.fillRect(x + 3, y + 3, w - 14, 1);
  ctx.fillStyle = '#EF4444'; ctx.fillRect(x + 3, y + 6, Math.round((w - 8) * 0.5), 1);
  ctx.fillStyle = '#22C55E'; ctx.fillRect(x + 3, y + 9, Math.round((w - 8) * 0.7), 1);
  ctx.fillStyle = '#FDE68A'; ctx.fillRect(x + w - 8, y + 3, 4, 4);   // 포스트잇
  ctx.fillStyle = '#BFDBFE'; ctx.fillRect(x + w - 8, y + 8, 4, 4);
  ctx.fillStyle = C.aluDark; ctx.fillRect(x + 2, y + 17, 2, 4); ctx.fillRect(x + w - 4, y + 17, 2, 4);
}
function drawCoffeeMachine(x, y, t) {             // Cafe: 에스프레소 머신
  shadow(x + 6, y + 16, 13, 3);
  ctx.fillStyle = '#3a3d44'; ctx.fillRect(x, y, 12, 15);
  ctx.fillStyle = '#4a4d55'; ctx.fillRect(x + 1, y + 1, 10, 5);
  ctx.fillStyle = '#22C55E'; ctx.fillRect(x + 2, y + 2, 2, 1);
  ctx.fillStyle = '#1d1f24'; ctx.fillRect(x + 3, y + 8, 6, 4);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 4, y + 12, 4, 3);
  if (Math.floor(t / 500) % 2) { ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(x + 5, y + 9, 1, 2); }
}

function drawFocusBooth(x, y) {                   // Focus Booth: 1인 방음 부스
  shadow(x + 11, y + 27, 22, 4);
  ctx.fillStyle = '#c2cad8'; ctx.fillRect(x, y, 22, 27);
  ctx.fillStyle = '#e3e9f1'; ctx.fillRect(x + 1, y + 1, 20, 25);
  ctx.fillStyle = '#aab4c4'; ctx.fillRect(x + 1, y + 1, 20, 2);
  ctx.fillStyle = '#8cc6e8'; ctx.fillRect(x + 4, y + 4, 14, 10);     // 방음 유리
  ctx.fillStyle = '#bde0f4'; ctx.fillRect(x + 4, y + 4, 6, 5);
  ctx.fillStyle = '#3B82F6'; ctx.fillRect(x + 5, y + 8, 5, 3);       // 작은 스크린
  ctx.fillStyle = C.aluDark; ctx.fillRect(x + 7, y + 23, 8, 4);
}
function drawPrinter(x, y) {                      // 프린터
  shadow(x + 7, y + 13, 15, 3);
  ctx.fillStyle = '#dfe3ea'; ctx.fillRect(x, y, 14, 12);
  ctx.fillStyle = '#f1f3f6'; ctx.fillRect(x + 1, y + 1, 12, 5);
  ctx.fillStyle = C.aluDark; ctx.fillRect(x + 2, y + 7, 10, 2);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 3, y + 8, 8, 3);
  ctx.fillStyle = '#22C55E'; ctx.fillRect(x + 11, y + 2, 1, 1);
}
function drawLocker(x, y) {                       // 락커
  shadow(x + 9, y + 30, 18, 3);
  ctx.fillStyle = '#aeb8c6'; ctx.fillRect(x, y, 18, 30);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i % 2 ? '#bcc4d0' : '#c6cdd9'; ctx.fillRect(x + 1, y + 1 + i * 10, 16, 9);
    ctx.fillStyle = '#8a93a3'; ctx.fillRect(x + 13, y + 5 + i * 10, 2, 2);
  }
}
function drawPhoneBooth(x, y) {                   // 전화 부스
  shadow(x + 8, y + 30, 16, 4);
  ctx.fillStyle = '#3B82F6'; ctx.fillRect(x, y, 16, 30);
  ctx.fillStyle = '#5b9bf8'; ctx.fillRect(x + 1, y + 1, 14, 2);
  ctx.fillStyle = '#bde0f4'; ctx.fillRect(x + 2, y + 4, 12, 18);
  ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(x + 3, y + 5, 4, 14);
  ctx.fillStyle = '#1D4ED8'; ctx.fillRect(x + 2, y + 24, 12, 6);
}
function drawDeviceStand(x, y, kind) {            // QA: 테스트 디바이스(폰/태블릿/안드로이드)
  shadow(x + 5, y + 17, 11, 3);
  ctx.fillStyle = C.aluDark; ctx.fillRect(x + 4, y + 11, 3, 6);
  ctx.fillRect(x + 1, y + 16, 9, 2);
  const w = kind === 'tablet' ? 9 : 6, h = kind === 'tablet' ? 7 : 10;
  const dx = Math.round(x + 5 - w / 2), dy = y - 2;
  ctx.fillStyle = C.outline; ctx.fillRect(dx - 1, dy - 1, w + 2, h + 2);
  ctx.fillStyle = kind === 'android' ? '#0f6b3a' : '#1d1f24'; ctx.fillRect(dx, dy, w, h);
  ctx.fillStyle = kind === 'android' ? '#22C55E' : '#3B82F6'; ctx.fillRect(dx + 1, dy + 1, w - 2, h - 3);
}
function drawLogDashboard(x, y, t) {              // Infra: 로그 대시보드(스크롤 로그)
  ctx.fillStyle = C.outline; ctx.fillRect(x - 1, y - 1, 30, 20);
  ctx.fillStyle = '#0f1115'; ctx.fillRect(x, y, 28, 18);
  for (let i = 0; i < 5; i++) {
    const w = 6 + ((i * 7 + Math.floor(t / 500)) % 18);
    ctx.fillStyle = ['#22C55E', '#94A3B8', '#F59E0B'][(i + Math.floor(t / 700)) % 3];
    ctx.fillRect(x + 2, y + 2 + i * 3, w, 1);
  }
}
function drawIncidentBoard(x, y, t) {             // Infra: 장애 현황판
  ctx.fillStyle = C.outline; ctx.fillRect(x - 1, y - 1, 22, 16);
  ctx.fillStyle = '#1b1d22'; ctx.fillRect(x, y, 20, 14);
  for (let i = 0; i < 6; i++) {
    const ok = (hash('inc' + i) + Math.floor(t / 1200)) % 5 !== 0;
    ctx.fillStyle = ok ? '#22C55E' : '#EF4444';
    ctx.fillRect(x + 2 + (i % 3) * 6, y + 2 + Math.floor(i / 3) * 6, 4, 4);
  }
}
function drawServerMonitor(x, y, t) {             // Infra: 서버 그래프 모니터
  ctx.fillStyle = C.outline; ctx.fillRect(x - 1, y - 1, 24, 16);
  ctx.fillStyle = '#0f1115'; ctx.fillRect(x, y, 22, 14);
  ctx.strokeStyle = '#3B82F6'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 11; i++) {
    const yy = y + 7 + Math.round(Math.sin(i * 0.8 + t / 400) * 4);
    if (i === 0) ctx.moveTo(x + 1 + i * 2, yy); else ctx.lineTo(x + 1 + i * 2, yy);
  }
  ctx.stroke();
}

// ---------- 존(zone) 공간 ----------
// 개방형 존: 위·좌·우 3면 벽, 아래(정면)는 열어 둠 → 좁은 문 없이 진입(벽 뚫기 방지)
function roomShell(x, y, w, h, floorFn) {
  floorFn(x, y, w, h);
  ctx.fillStyle = C.roomEdge;
  ctx.fillRect(x, y, w, 3);                  // 위
  ctx.fillRect(x, y, 3, h);                  // 좌
  ctx.fillRect(x + w - 3, y, 3, h);          // 우
}
// 존별 단색 바닥(+옅은 seam)
function zoneFloor(color) {
  return (rx, ry, rw, rh) => {
    ctx.fillStyle = color;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.fillStyle = 'rgba(30,40,60,.035)';
    for (let yy = ry + 12; yy < ry + rh; yy += 16) ctx.fillRect(rx, yy, rw, 1);
  };
}
// 부드러운 라운드 area rug (바닥 채움 + 애플 라운지 느낌)
function drawAreaRug(x, y, w, h, c1, c2) {
  ctx.fillStyle = c2; roundRect(x, y, w, h, 6);
  ctx.fillStyle = c1; roundRect(x + 2, y + 2, w - 4, h - 4, 5);
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x + 4, y + 3, w - 8, 1);
}
const ZONE_RUG = {
  ailab:  ['#E7DCF6', '#EFE7FB'], collab: ['#F2E5CC', '#F8F0DE'],
  cafe:   ['#D7E9D7', '#E3F0E3'], focus:  ['#DCE7F6', '#E8EFFB'],
};
// 존 타입별 가구 렌더 (cafe / ailab / collab / focus)
function drawZone(z, t) {
  const { x, y, w, h } = z;
  roomShell(x, y, w, h, zoneFloor(z.floor));
  const rug = ZONE_RUG[z.type];
  if (rug) drawAreaRug(x + 5, y + 5, w - 10, h - 10, rug[0], rug[1]);   // wall-to-wall 카펫
  const cx = x + w / 2;
  if (z.type === 'ailab') {
    drawAILabWall(x + 4, y + 5, w - 8, t);              // Claude/GPT/Gemini 대시보드
    drawTokenBar(x + 6, y + 30, w - 44, t);             // Token Usage
    drawAgentHealth(x + w - 32, y + 28, t);             // Agent Health
    drawServerRack(x + 8, y + 38, t);                   // GPU 클러스터
    drawServerRack(x + 27, y + 38, t);
    drawServerRack(x + w - 27, y + 38, t);
    drawPlant(x + w / 2 - 6, y + h - 22, false);
  } else if (z.type === 'collab') {
    drawWhiteboard(x + 8, y + 6, w - 16);               // 상단 화이트보드
    drawRoundTable(cx, y + 56);                         // 회의 테이블
    drawPlant(x + 8, y + h - 26, true);
    drawPlant(x + w - 14, y + h - 24, false);
  } else if (z.type === 'focus') {                      // 1인 방음 부스
    drawFocusBooth(x + 7, y + 6);
    drawFocusBooth(x + w - 29, y + 6);
    drawFocusBooth(x + 7, y + 40);
    drawFocusBooth(x + w - 29, y + 40);
    drawPlant(cx - 6, y + h - 24, false);
  } else { // cafe — 가구는 상단(y<60)에 모으고 하단은 개방(아래에서 진입)
    drawTV(x + 10, y + 5, t);
    drawVending(x + w - 40, y + 5, t);                  // 스낵 자판기
    drawCoffeeMachine(x + w - 20, y + 6, t);            // 커피머신
    drawSofa(x + 6, y + 26, 30);                        // 라운지 소파 2(가로 배치)
    drawSofa(x + 40, y + 26, 30);
    drawCoffeeTable(x + 26, y + 44);
    drawSnackShelf(x + w - 22, y + 40);
    drawRoundTable(cx, y + 52);
    drawPlant(x + 10, y + h - 24, true);
    drawPlant(x + w - 14, y + h - 22, false);
    drawWaterCooler(x + w - 16, y + h - 30);
  }
}

// ---------- 복도 데코 ----------
function drawCorridorDecor(layout) {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  const { W, podRows, workY } = layout;
  for (let r = 1; r <= podRows; r++) {
    const y = workY + r * (POD_H + AISLE_Y) - AISLE_Y + 6;
    const h = hash('cor' + r);
    for (let x = WALL + 24 + (h % 30); x < W - 46; x += 108) {   // 촘촘하게(빈 바닥↓)
      if (blocked(x + 9, y + 8)) continue;                       // 포드와 겹치면 스킵
      const v = (h >>> (x % 11)) % 4;
      if (v === 0) drawPlant(x, y, true);
      else if (v === 1) {
        shadow(x + 9, y + 14, 20, 3);
        ctx.fillStyle = C.oak; ctx.fillRect(x, y + 6, 18, 4);
        ctx.fillStyle = C.oakHi; ctx.fillRect(x, y + 6, 18, 1);
        ctx.fillStyle = C.aluDark; ctx.fillRect(x + 1, y + 10, 2, 4); ctx.fillRect(x + 15, y + 10, 2, 4);
      } else if (v === 2) drawWaterCooler(x, y);
      else drawPrinter(x, y + 4);
    }
  }
}

// 하단 Infrastructure 존: 서버 모니터/로그/장애판 + 서버랙 + 프린터
function drawInfraZone(x, y, w, h, t) {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  drawAreaRug(x + 6, y + 48, w - 12, h - 54, '#CFD7E4', '#DAE1EC');
  const mw = Math.min(w - 60, 96);
  drawMonitorWall(x + 6, y + 4, mw, t);                  // NOC 대형 모니터 월
  drawIncidentBoard(x + mw + 12, y + 5, t);             // 장애 현황
  drawServerMonitor(x + mw + 12, y + 24, t);            // 서버 상태 그래프
  drawServerRack(x + 10, y + 26, t);
  drawServerRack(x + 30, y + 26, t);
  drawLogDashboard(x + w - 36, y + 26, t);              // 로그 스트림
  drawPrinter(x + w - 20, y + h - 26);
  drawPlant(x + w - 16, y + h - 22, true);
}
// 하단 QA 존: 테스트 디바이스(폰/태블릿/안드로이드) 진열 + 락커 + 전화부스
function drawQAZone(x, y, w, h, t) {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  drawAreaRug(x + 6, y + 50, w - 12, h - 56, '#D3E2CE', '#DEEAD9');
  const bw = Math.min(w - 40, 150);
  ctx.fillStyle = C.oak; ctx.fillRect(x + 8, y + 26, bw, 4);          // 테스트 벤치
  ctx.fillStyle = C.aluDark; ctx.fillRect(x + 10, y + 30, 2, 4); ctx.fillRect(x + 8 + bw - 2, y + 30, 2, 4);
  const kinds = ['android', 'phone', 'tablet', 'phone', 'android', 'tablet'];
  const nDev = Math.min(6, Math.floor((bw - 6) / 26));
  for (let i = 0; i < nDev; i++) drawDeviceStand(x + 16 + i * 26, y + 10, kinds[i % kinds.length]);
  drawLocker(x + w - 24, y + 4);
  drawPlant(x + w - 16, y + h - 22, false);
}
// 좌우 벽면 페리미터 데코(빈 바닥 채움) — 포드와 겹치는 곳은 스킵
function drawPerimeterDecor(layout) {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  const { W, workY, bottomTop } = layout;
  const items = [
    (x, y) => drawBookshelf(x, y),
    (x, y) => drawLocker(x, y),
    (x, y) => drawPhoneBooth(x + 1, y),
    (x, y) => { drawPlant(x + 4, y + 8, true); drawPlant(x + 12, y + 16, false); },
  ];
  let i = 0;
  for (let y = workY + 4; y < bottomTop - 30; y += 38) {
    if (!blocked(WALL + 11, y + 14) && !blocked(WALL + 11, y + 26)) { items[i % items.length](WALL + 2, y); i++; }
    if (!blocked(W - WALL - 11, y + 14) && !blocked(W - WALL - 11, y + 26)) { items[i % items.length](W - WALL - 20, y); i++; }
  }
}

// ---------- iMac 모니터 ----------
function drawMonitorFront(mx, my, eff, t) {
  ctx.fillStyle = C.outline;
  ctx.fillRect(mx - 1, my - 1, 13, 12);
  ctx.fillStyle = C.screenBezel;                  // 블랙 베젤
  ctx.fillRect(mx, my, 11, 8);
  ctx.fillStyle = SCREEN[eff];
  ctx.fillRect(mx + 1, my + 1, 9, 6);
  if (eff === 'working') {
    ctx.fillStyle = 'rgba(20,110,55,.6)';
    const sc = Math.floor(t / 220) % 3;
    for (let i = 0; i < 3; i++) {
      if (i === sc) continue;
      ctx.fillRect(mx + 2, my + 2 + i * 2, 4 + ((i * 5) % 4), 1);
    }
  }
  ctx.fillStyle = C.alu;                          // 실버 친 + 스탠드
  ctx.fillRect(mx, my + 8, 11, 2);
  ctx.fillStyle = C.aluDark;
  ctx.fillRect(mx + 4, my + 10, 3, 2);
  ctx.fillRect(mx + 3, my + 12, 5, 1);
}
function drawLaptop(mx, my, eff) {
  // MacBook 풍
  ctx.fillStyle = C.outline;
  ctx.fillRect(mx - 1, my - 1, 12, 10);
  ctx.fillStyle = C.alu;
  ctx.fillRect(mx, my, 10, 7);
  ctx.fillStyle = SCREEN[eff];
  ctx.fillRect(mx + 1, my + 1, 8, 5);
  ctx.fillStyle = C.aluHi;
  ctx.fillRect(mx - 1, my + 7, 12, 2);
  ctx.fillStyle = C.aluDark;
  ctx.fillRect(mx + 3, my + 8, 4, 1);
}
function drawMonitorBack(mx, my, eff) {
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = SCREEN[eff];
  ctx.fillRect(mx - 2, my - 2, 15, 13);
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.outline;
  ctx.fillRect(mx - 1, my - 1, 13, 12);
  ctx.fillStyle = C.alu;                          // iMac 알루미늄 뒷면
  ctx.fillRect(mx, my, 11, 10);
  ctx.fillStyle = C.aluHi;
  ctx.fillRect(mx + 1, my + 1, 2, 8);
  ctx.fillStyle = C.aluDark;
  ctx.fillRect(mx + 4, my + 3, 3, 3);             // 로고 자리
  ctx.fillRect(mx + 4, my + 10, 3, 2);
}
function drawMonitorOff(mx, my, back) {       // 빈 좌석: 꺼진 모니터
  ctx.fillStyle = C.outline;
  ctx.fillRect(mx - 1, my - 1, 13, 12);
  if (back) {
    ctx.fillStyle = C.alu;
    ctx.fillRect(mx, my, 11, 10);
    ctx.fillStyle = C.aluHi;
    ctx.fillRect(mx + 1, my + 1, 2, 8);
    ctx.fillStyle = C.aluDark;
    ctx.fillRect(mx + 4, my + 3, 3, 3);
  } else {
    ctx.fillStyle = C.screenBezel;
    ctx.fillRect(mx, my, 11, 8);
    ctx.fillStyle = '#2a2d33';                 // 꺼진 화면
    ctx.fillRect(mx + 1, my + 1, 9, 6);
    ctx.fillStyle = C.alu;
    ctx.fillRect(mx, my + 8, 11, 2);
    ctx.fillStyle = C.aluDark;
    ctx.fillRect(mx + 4, my + 10, 3, 2);
  }
}
function drawMonitorSide(x, y, eff, face) {
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = SCREEN[eff];
  ctx.fillRect(face === 'left' ? x - 2 : x + 1, y - 1, 4, 10);
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.alu;
  ctx.fillRect(x, y, 3, 8);
  ctx.fillStyle = SCREEN[eff];
  ctx.fillRect(face === 'left' ? x : x + 2, y + 1, 1, 6);
  ctx.fillStyle = C.aluDark;
  ctx.fillRect(x - 1, y + 8, 5, 1);
}

// ---------- 데스크 (화이트 상판 + 알루미늄 프레임) ----------
function drawDeskH(cx, deskY, noShadow) {
  const dw = 38;
  if (!noShadow) shadow(cx, deskY + 14, dw + 6, 4);
  ctx.fillStyle = C.aluDark;
  ctx.fillRect(cx - dw / 2 - 1, deskY - 1, dw + 2, 12);
  ctx.fillStyle = '#ffffff';                      // 화이트 상판
  ctx.fillRect(cx - dw / 2, deskY, dw, 2);
  ctx.fillStyle = C.white;
  ctx.fillRect(cx - dw / 2, deskY + 2, dw, 6);
  ctx.fillStyle = C.whiteEdge;
  ctx.fillRect(cx - dw / 2, deskY + 8, dw, 3);
  ctx.fillStyle = C.aluDark;                      // 알루미늄 다리
  ctx.fillRect(cx - dw / 2 + 2, deskY + 11, 2, 4);
  ctx.fillRect(cx + dw / 2 - 4, deskY + 11, 2, 4);
  return dw;
}
function drawDeskV(dx, dy) {
  const dh = 32;
  shadow(dx + 7, dy + dh + 2, 16, 4);
  ctx.fillStyle = C.aluDark;
  ctx.fillRect(dx - 1, dy - 1, 14, dh + 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(dx, dy, 2, dh);
  ctx.fillStyle = C.white;
  ctx.fillRect(dx + 2, dy, 10, dh);
  ctx.fillStyle = C.whiteEdge;
  ctx.fillRect(dx + 10, dy, 2, dh);
  ctx.fillStyle = C.aluDark;
  ctx.fillRect(dx, dy + dh, 12, 2);
  return dh;
}
function deskClutterH(cx, deskY, eff, t) {
  ctx.fillStyle = C.whiteEdge;                    // 매직키보드
  ctx.fillRect(cx - 5, deskY + 3, 9, 3);
  ctx.fillStyle = C.aluDark;
  ctx.fillRect(cx - 4, deskY + 4, 7, 1);
  ctx.fillStyle = C.whiteEdge;                    // 마우스
  ctx.fillRect(cx + 6, deskY + 4, 2, 3);
  ctx.fillStyle = '#f2efe8';                      // 노트
  ctx.fillRect(cx + 10, deskY + 2, 5, 4);
  ctx.fillStyle = '#bb5555';                      // 머그
  ctx.fillRect(cx - 13, deskY + 2, 3, 3);
  if (eff === 'done') {
    const sf = Math.floor(t / 350) % 2;
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#8d929b';
    ctx.fillRect(cx - 12 + sf, deskY - 2, 1, 2);
    ctx.fillRect(cx - 11 - sf, deskY - 4, 1, 1);
    ctx.globalAlpha = 1;
  }
}

// ---------- 캐릭터 (디테일: 헤어스타일·안경·헤드폰·옷깃) ----------
function drawHead(hx, hy, look, dir, eff) {
  ctx.fillStyle = C.outline;
  ctx.fillRect(hx - 5, hy - 3, 10, 11);
  // 롱헤어 뒷머리 (모든 방향에서 어깨까지)
  if (look.hairStyle === 2 && dir !== 'up') {
    ctx.fillStyle = look.hair;
    ctx.fillRect(hx - 6, hy - 1, 2, 10);
    ctx.fillRect(hx + 4, hy - 1, 2, 10);
  }
  if (dir === 'up') {
    ctx.fillStyle = look.skin;
    ctx.fillRect(hx - 4, hy + 5, 8, 2);
    ctx.fillStyle = look.hair;
    ctx.fillRect(hx - 4, hy - 2, 8, 7);
    if (look.hairStyle === 2) ctx.fillRect(hx - 4, hy + 5, 8, 4);   // 롱헤어 등판
    ctx.fillStyle = look.hairHi;
    ctx.fillRect(hx - 3, hy - 2, 2, 2);
    if (look.hairStyle === 3) {                   // 똥머리
      ctx.fillStyle = C.outline;
      ctx.fillRect(hx - 2, hy - 6, 5, 5);
      ctx.fillStyle = look.hair;
      ctx.fillRect(hx - 1, hy - 5, 3, 3);
    }
    if (look.headphone) {
      ctx.fillStyle = '#2e3138';
      ctx.fillRect(hx - 5, hy - 1, 2, 4);
      ctx.fillRect(hx + 3, hy - 1, 2, 4);
      ctx.fillRect(hx - 4, hy - 3, 8, 1);
    }
    return;
  }
  // 얼굴
  ctx.fillStyle = look.skin;
  ctx.fillRect(hx - 4, hy, 8, 7);
  ctx.fillStyle = 'rgba(0,0,0,.06)';              // 턱 음영
  ctx.fillRect(hx - 4, hy + 6, 8, 1);
  // 헤어 (스타일별)
  ctx.fillStyle = look.hair;
  if (look.hairStyle === 1) {                     // 사이드 파트
    ctx.fillRect(hx - 4, hy - 2, 8, 2);
    ctx.fillRect(hx - 4, hy, 5, 1);
    ctx.fillRect(hx - 4, hy - 2, 1, 5);
    ctx.fillRect(hx + 3, hy - 2, 1, 3);
  } else {
    ctx.fillRect(hx - 4, hy - 2, 8, 3);
    ctx.fillRect(hx - 4, hy - 2, 1, 4);
    ctx.fillRect(hx + 3, hy - 2, 1, 4);
  }
  if (look.hairStyle === 3) {                     // 똥머리
    ctx.fillStyle = C.outline;
    ctx.fillRect(hx - 2, hy - 6, 5, 4);
    ctx.fillStyle = look.hair;
    ctx.fillRect(hx - 1, hy - 5, 3, 2);
  }
  ctx.fillStyle = look.hairHi;
  ctx.fillRect(hx - 3, hy - 2, 2, 1);
  if (dir === 'left') {
    ctx.fillStyle = look.hair;
    ctx.fillRect(hx + 1, hy - 2, 3, 6);
  } else if (dir === 'right') {
    ctx.fillStyle = look.hair;
    ctx.fillRect(hx - 4, hy - 2, 3, 6);
  }
  // 눈/안경
  const closed = eff === 'stalled' || eff === 'done';
  if (look.glasses) {
    ctx.fillStyle = '#2e3138';
    if (dir === 'left') {
      ctx.fillRect(hx - 4, hy + 2, 3, 3);
      ctx.fillStyle = closed ? '#2e3138' : '#cfe3f0';
      ctx.fillRect(hx - 3, hy + 3, 1, 1);
    } else if (dir === 'right') {
      ctx.fillRect(hx + 1, hy + 2, 3, 3);
      ctx.fillStyle = closed ? '#2e3138' : '#cfe3f0';
      ctx.fillRect(hx + 2, hy + 3, 1, 1);
    } else {
      ctx.fillRect(hx - 4, hy + 2, 3, 3);
      ctx.fillRect(hx + 1, hy + 2, 3, 3);
      ctx.fillRect(hx - 1, hy + 3, 2, 1);
      ctx.fillStyle = closed ? '#2e3138' : '#cfe3f0';
      ctx.fillRect(hx - 3, hy + 3, 1, 1);
      ctx.fillRect(hx + 2, hy + 3, 1, 1);
    }
  } else {
    ctx.fillStyle = '#26262c';
    if (dir === 'left') {
      if (closed) ctx.fillRect(hx - 3, hy + 3, 2, 1);
      else ctx.fillRect(hx - 3, hy + 2, 1, 2);
    } else if (dir === 'right') {
      if (closed) ctx.fillRect(hx + 1, hy + 3, 2, 1);
      else ctx.fillRect(hx + 2, hy + 2, 1, 2);
    } else if (closed) {
      ctx.fillRect(hx - 3, hy + 3, 2, 1);
      ctx.fillRect(hx + 1, hy + 3, 2, 1);
    } else {
      ctx.fillRect(hx - 3, hy + 2, 1, 2);
      ctx.fillRect(hx + 2, hy + 2, 1, 2);
    }
  }
  // 입
  if (dir === 'down') {
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(hx - 1, hy + 5, 2, 1);
  }
  // 헤드폰
  if (look.headphone) {
    ctx.fillStyle = '#2e3138';
    ctx.fillRect(hx - 4, hy - 3, 8, 1);
    if (dir !== 'right') ctx.fillRect(hx - 6, hy + 1, 2, 4);
    if (dir !== 'left') ctx.fillRect(hx + 4, hy + 1, 2, 4);
  }
}

function drawBody(cx, by, look, eff, t, dir) {
  const working = eff === 'working';
  ctx.fillStyle = C.outline;
  ctx.fillRect(cx - 6, by - 1, 12, 9);
  ctx.fillStyle = look.shirt;
  ctx.fillRect(cx - 5, by, 10, 7);
  ctx.fillStyle = 'rgba(0,0,0,.15)';
  ctx.fillRect(cx - 5, by + 5, 10, 2);
  // 옷깃 / 목둘레
  if (dir !== 'up') {
    if (look.collar) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 2, by, 4, 1);
      ctx.fillRect(cx - 1, by + 1, 2, 1);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.fillRect(cx - 2, by, 4, 1);
    }
  }

  if (eff === 'blocked') {
    const f = (Math.floor(t / 280)) % 2;
    ctx.fillStyle = look.shirt;
    ctx.fillRect(cx - 8, by - 6 + (f ? -1 : 0), 2, 7);
    ctx.fillRect(cx + 6, by + 1, 2, 5);
    ctx.fillStyle = look.skin;
    ctx.fillRect(cx - 8, by - 8 + (f ? -1 : 0), 2, 2);
    return;
  }
  if (working) {
    const f = (Math.floor(t / 160 + look.phase * 3)) % 2;
    ctx.fillStyle = look.shirt;
    if (dir === 'left') {
      ctx.fillRect(cx - 8, by + 1 + (f ? 1 : 0), 3, 2);
      ctx.fillStyle = look.skin;
      ctx.fillRect(cx - 10, by + 1 + (f ? 1 : 0), 2, 2);
    } else if (dir === 'right') {
      ctx.fillRect(cx + 5, by + 1 + (f ? 1 : 0), 3, 2);
      ctx.fillStyle = look.skin;
      ctx.fillRect(cx + 8, by + 1 + (f ? 1 : 0), 2, 2);
    } else if (dir === 'up') {
      ctx.fillRect(cx - 7, by - 2 + (f ? 1 : 0), 2, 5);
      ctx.fillRect(cx + 5, by - 2 + (f ? 0 : 1), 2, 5);
      ctx.fillStyle = look.skin;
      ctx.fillRect(cx - 7, by - 3 + (f ? 1 : 0), 2, 1);
      ctx.fillRect(cx + 5, by - 3 + (f ? 0 : 1), 2, 1);
    } else {
      ctx.fillRect(cx - 7, by + 1 + (f ? 1 : 0), 2, 5);
      ctx.fillRect(cx + 5, by + 1 + (f ? 0 : 1), 2, 5);
      ctx.fillStyle = look.skin;
      ctx.fillRect(cx - 7, by + 6 + (f ? 1 : 0), 2, 1);
      ctx.fillRect(cx + 5, by + 6 + (f ? 0 : 1), 2, 1);
    }
    return;
  }
  ctx.fillStyle = look.shirt;
  if (eff === 'done') {
    ctx.fillRect(cx - 8, by - 1, 3, 2);
    ctx.fillRect(cx + 5, by - 1, 3, 2);
  } else {
    ctx.fillRect(cx - 7, by + 1, 2, 5);
    ctx.fillRect(cx + 5, by + 1, 2, 5);
  }
}

// ---------- 이름표 (가독성: 큰 폰트 + 보더 + 그림자) ----------
function pushTag(s, cxLogical, yLogical, look) {
  tagJobs.push({ s, scx: cxLogical * S, sy: yLogical * S, look });
}
function drawTags(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);            // 백킹 픽셀 공간 — 고정 크기는 k(=dpr)로 스케일
  const k = S / DISP;
  const fontTag = `600 ${12 * k}px -apple-system, "Apple SD Gothic Neo", sans-serif`;
  tagPlaced = new Map();

  // 1) 측정
  const items = [];
  for (const j of tagJobs) {
    ctx.font = fontTag;
    let nm = j.s.name;
    while (nm.length > 4 && ctx.measureText(nm).width > 118 * k) nm = nm.slice(0, -2);
    if (nm !== j.s.name) nm += '…';
    const tw = ctx.measureText(nm).width;
    const working = j.s.effective === 'working';
    const bw = tw + (working ? 28 : 18) * k;
    items.push({ j, nm, working, bw, bh: 18 * k, cx: j.scx, y0: j.sy, y: j.sy });
  }

  // 2) 겹침 회피: y 오름차순으로 배치, 가로로 겹치면 위로 밀어 쌓기
  items.sort((a, b) => a.y0 - b.y0 || a.cx - b.cx);
  const placed = [];
  const padX = 3 * k, padY = 3 * k, minY = (TOP_WALL + 2) * S;   // 상단 벽 직하까지만(방 안 캐릭터도 태그가 따라 올라감)
  for (const it of items) {
    let y = it.y0, guard = 0, moved = true;
    while (moved && guard++ < 150) {
      moved = false;
      for (const p of placed) {
        const ox = (it.cx - it.bw / 2 - padX) < (p.cx + p.bw / 2) &&
                   (it.cx + it.bw / 2 + padX) > (p.cx - p.bw / 2);
        const oy = y < p.y + p.bh + padY && y + it.bh + padY > p.y;
        if (ox && oy) { y = p.y - it.bh - padY; moved = true; }
      }
      if (y <= minY) { y = Math.max(y, minY); break; }
    }
    it.y = y;
    placed.push({ cx: it.cx, bw: it.bw, y, bh: it.bh });
    tagPlaced.set(it.j.s.id, { cx: it.cx, y });   // 말풍선 배치용
  }

  // 3) 그리기 (밀려 올라간 경우 연결선으로 주인 표시)
  for (const it of items) {
    const j = it.j, bw = it.bw, bh = it.bh, bx = it.cx - bw / 2, by = it.y;
    const col = TAG_COLOR[j.s.effective] || TAG_COLOR.unknown;
    if (it.y < it.y0 - 1.5) {                     // 연결선(스템)
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.5 * k;
      ctx.beginPath();
      ctx.moveTo(it.cx, by + bh);
      ctx.lineTo(it.cx, it.y0 + bh + 2 * k);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(30,34,44,.25)';        // 그림자
    roundRect(bx + k, by + 2 * k, bw, bh, 8 * k);
    ctx.globalAlpha = 0.94;                       // 본체(상태색)
    ctx.fillStyle = col;
    roundRect(bx, by, bw, bh, 8 * k);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,.25)';    // 보더
    ctx.lineWidth = k;
    roundRectStroke(bx + 0.5 * k, by + 0.5 * k, bw - k, bh - k, 7.5 * k);
    if (it.working) {                             // 작업중: 흰 점 점멸
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(t / 300));
      ctx.beginPath(); ctx.arc(bx + 10 * k, by + 9 * k, 3.5 * k, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.font = fontTag;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(it.nm, bx + (it.working ? 18 : 9) * k, by + 9.5 * k);
  }

  for (const z of zoneLabels) {
    ctx.font = `600 ${10 * k}px -apple-system, "Apple SD Gothic Neo", sans-serif`;
    ctx.fillStyle = 'rgba(110,116,128,.85)';
    ctx.fillText(z.text, z.x * S, z.y * S);
  }
}

// ---------- 충돌 / 보행 시스템 ----------
function podVariantB(p, seats) {
  const h = hash('pod' + p);
  return ((h >>> 8) % 3 === 2) && seats.filter(Boolean).length === 4;
}

// pod별 인원수(1~4 다양) — 시드 고정으로 안정, 합 = n
function seatAssignment(n, pods) {
  const counts = new Array(pods).fill(0);
  if (n <= 0) return counts;
  let seed = (Math.imul(n, 2654435761) + Math.imul(pods, 40503)) >>> 0;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const choices = [1, 2, 2, 3, 3, 4];           // 2·3명 비중↑
  let remaining = n;
  for (let i = 0; i < pods && remaining > 0; i++) {
    const c = Math.min(choices[Math.floor(rnd() * choices.length)], remaining);
    counts[i] = c; remaining -= c;
  }
  let i = 0, guard = 0;
  while (remaining > 0 && guard++ < n + pods) {
    if (counts[i] < 4) { counts[i]++; remaining--; }
    i = (i + 1) % pods;
  }
  return counts;
}
function seatOrder(p) {                          // pod 내 좌석 슬롯 채우는 순서(다양화)
  const base = [0, 1, 2, 3];
  let seed = hash('seat' + p);
  for (let i = 3; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [base[i], base[j]] = [base[j], base[i]];
  }
  return base;
}
function buildSeatMap(vis, pods) {
  const counts = seatAssignment(vis.length, pods);
  const map = [];
  let idx = 0;
  for (let p = 0; p < pods; p++) {
    const slots = [undefined, undefined, undefined, undefined];
    const order = seatOrder(p);
    for (let j = 0; j < counts[p] && idx < vis.length; j++) slots[order[j]] = vis[idx++];
    map.push(slots);
  }
  for (let p = 0; p < pods && idx < vis.length; p++) {   // 안전: 남은 세션 채움
    for (let j = 0; j < 4 && idx < vis.length; j++) if (!map[p][j]) map[p][j] = vis[idx++];
  }
  return map;
}

// 통과 불가 영역 수집: 책상 + 빈슬롯 가구 + 방 벽(문 제외)·방 가구
function collectObstacles(layout) {
  obstacles = [];
  for (let p = 0; p < layout.pods; p++) {
    const { x: px, y: py } = layout.podPos[p];
    const seats = seatMap[p] || [];
    if (podVariantB(p, seats)) obstacles.push({ x: px + 30, y: py + 14, w: 30, h: POD_H - 26 });
    else obstacles.push({ x: px + 8, y: py + 30, w: POD_W - 16, h: 34 });
  }
  for (const e of layout.emptySlots) {
    obstacles.push({ x: e.x + POD_W / 2 - 22, y: e.y + 26, w: 44, h: 28 });
  }
  // 존: 위·좌·우 벽(두껍게, 아래는 열림) + 내부 가구(상단부) — 하단은 보행 공간
  const WT = 4;
  for (const r of rooms) {
    const cx = r.x + r.w / 2;
    obstacles.push({ x: r.x, y: r.y, w: r.w, h: WT });                   // 위
    obstacles.push({ x: r.x, y: r.y, w: WT, h: r.h });                   // 좌
    obstacles.push({ x: r.x + r.w - WT, y: r.y, w: WT, h: r.h });        // 우(공유 벽 포함)
    if (r.type === 'ailab') {
      obstacles.push({ x: r.x + 8, y: r.y + 38, w: 16, h: 31 });         // GPU 랙×3
      obstacles.push({ x: r.x + 27, y: r.y + 38, w: 16, h: 31 });
      obstacles.push({ x: r.x + r.w - 27, y: r.y + 38, w: 16, h: 31 });
    } else if (r.type === 'collab') {
      obstacles.push({ x: cx - 11, y: r.y + 48, w: 22, h: 18 });         // 회의 테이블
    } else if (r.type === 'focus') {
      obstacles.push({ x: r.x + 7, y: r.y + 6, w: 22, h: 27 });          // 부스 4개
      obstacles.push({ x: r.x + r.w - 29, y: r.y + 6, w: 22, h: 27 });
      obstacles.push({ x: r.x + 7, y: r.y + 40, w: 22, h: 27 });
      obstacles.push({ x: r.x + r.w - 29, y: r.y + 40, w: 22, h: 27 });
    } else { // cafe — 가구 상단 클러스터(y<60), 하단 개방
      obstacles.push({ x: r.x + 6, y: r.y + 26, w: 30, h: 14 });         // 소파L
      obstacles.push({ x: r.x + 40, y: r.y + 26, w: 30, h: 14 });        // 소파R
      obstacles.push({ x: r.x + 24, y: r.y + 44, w: 16, h: 9 });         // 커피테이블
      obstacles.push({ x: r.x + r.w - 42, y: r.y + 4, w: 38, h: 34 });   // 자판기+커피머신
      obstacles.push({ x: r.x + r.w - 22, y: r.y + 40, w: 18, h: 16 });  // 스낵선반
      obstacles.push({ x: cx - 9, y: r.y + 46, w: 18, h: 14 });          // 원형테이블
    }
  }
}

function blocked(x, y) {
  if (x < WALL + 3 || x > floorW - WALL - 3) return true;
  if (y < TOP_WALL + 4 || y > floorH - WALL - 3) return true;   // 상단 벽만 차단(방 내부는 진입 가능)
  for (const o of obstacles) {
    if (x > o.x - 4 && x < o.x + o.w + 4 && y > o.y - 4 && y < o.y + o.h + 4) return true;
  }
  return false;
}
function roomAt(x, y) {
  for (const r of rooms) if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return r;
  return null;
}
// 도착지: 가구 "바로 앞"(아래에서 곧장 걸어 올라가 가구에 붙어 섬) — 존 깊숙이
// kind: coffee/sofa/rest/work/talk — 상태별 행동 선택에 사용
function roomPOIs(r) {
  const cx = r.x + r.w / 2;
  if (r.type === 'ailab') return [
    { x: r.x + 24, y: r.y + 74, kind: 'work' },   // 좌 서버랙 앞
    { x: r.x + r.w - 22, y: r.y + 74, kind: 'work' }, // 우 서버랙 앞
    { x: cx, y: r.y + 88, kind: 'work' },         // 대시보드 앞(서서 보기)
    { x: cx - 18, y: r.y + 104, kind: 'work' },
    { x: cx + 20, y: r.y + 100, kind: 'work' },
  ];
  if (r.type === 'focus') return [
    { x: r.x + 18, y: r.y + 78, kind: 'work' },   // 좌 부스 앞
    { x: r.x + r.w - 18, y: r.y + 78, kind: 'work' }, // 우 부스 앞
    { x: cx, y: r.y + 92, kind: 'work' },
    { x: cx - 16, y: r.y + 106, kind: 'work' },
    { x: cx + 18, y: r.y + 104, kind: 'work' },
  ];
  if (r.type === 'collab') return [
    { x: cx, y: r.y + 84, kind: 'talk' },         // 회의 테이블 앞
    { x: cx - 22, y: r.y + 92, kind: 'talk' },
    { x: cx + 22, y: r.y + 90, kind: 'talk' },
    { x: r.x + 20, y: r.y + 104, kind: 'talk' },
    { x: r.x + r.w - 22, y: r.y + 102, kind: 'talk' },
  ];
  return [ // cafe — 가구는 상단, POI는 하단 개방부(아래에서 직진 진입)
    { x: r.x + 20, y: r.y + 66, kind: 'sofa' },   // 좌 소파 앞(완료=쉼)
    { x: r.x + 54, y: r.y + 66, kind: 'sofa' },   // 우 소파 앞
    { x: r.x + r.w - 26, y: r.y + 66, kind: 'coffee' }, // 커피머신/자판기 앞(입력대기)
    { x: r.x + r.w - 14, y: r.y + 72, kind: 'coffee' }, // 스낵선반 앞
    { x: cx, y: r.y + 84, kind: 'rest' },         // 원형테이블 앞
    { x: cx - 20, y: r.y + 104, kind: 'rest' },   // 라운지 중하단
    { x: r.x + 40, y: r.y + 104, kind: 'rest' },
  ];
}

// 격자 BFS 경로탐색 (장애물 우회 + 문 통과)
const GC = 5;                       // 격자 셀 크기(논리px) — 작을수록 가구 사이 통로 정밀
let grid = null, gridCols = 0, gridRows = 0, gridKey = '';
function buildGrid() {
  const key = `${floorW}x${floorH}x${obstacles.length}`;
  if (key === gridKey && grid) return;
  gridKey = key;
  gridCols = Math.ceil(floorW / GC);
  gridRows = Math.ceil(floorH / GC);
  grid = new Uint8Array(gridCols * gridRows);
  for (let r = 0; r < gridRows; r++)
    for (let c = 0; c < gridCols; c++)
      grid[r * gridCols + c] = blocked(c * GC + GC / 2, r * GC + GC / 2) ? 1 : 0;
}
function pathFind(sx, sy, gx, gy) {
  if (!grid) return null;
  const idx = (c, r) => r * gridCols + c;
  const inb = (c, r) => c >= 0 && r >= 0 && c < gridCols && r < gridRows;
  let sc = Math.max(0, Math.min(gridCols - 1, Math.floor(sx / GC)));
  let sr = Math.max(0, Math.min(gridRows - 1, Math.floor(sy / GC)));
  let gc = Math.floor(gx / GC), gr = Math.floor(gy / GC);
  if (!inb(gc, gr) || grid[idx(gc, gr)]) {     // 목표가 막힌 셀 → 근처 열린 셀
    let best = null, bd = 1e9;
    for (let r = Math.max(0, gr - 4); r <= Math.min(gridRows - 1, gr + 4); r++)
      for (let c = Math.max(0, gc - 4); c <= Math.min(gridCols - 1, gc + 4); c++)
        if (!grid[idx(c, r)]) { const dd = (c - gc) ** 2 + (r - gr) ** 2; if (dd < bd) { bd = dd; best = [c, r]; } }
    if (!best) return null; gc = best[0]; gr = best[1];
  }
  const prev = new Int32Array(gridCols * gridRows).fill(-1);
  const start = idx(sc, sr), goal = idx(gc, gr);
  prev[start] = start;
  const q = [start]; let head = 0, found = false;
  while (head < q.length) {
    const cur = q[head++]; if (cur === goal) { found = true; break; }
    const cc = cur % gridCols, cr = (cur / gridCols) | 0;
    const nb = [[cc + 1, cr], [cc - 1, cr], [cc, cr + 1], [cc, cr - 1]];
    for (const [nc, nr] of nb) {
      if (!inb(nc, nr)) continue;
      const ni = idx(nc, nr);
      if (prev[ni] !== -1 || grid[ni]) continue;
      prev[ni] = cur; q.push(ni);
    }
  }
  if (!found) return null;
  const cells = []; let cur = goal;
  while (cur !== prev[cur]) { cells.push(cur); cur = prev[cur]; }
  cells.reverse();
  // 방향 전환점만 유지 → 각 구간이 축정렬 직선(대각선 점프·모서리 끼임 방지)
  const cc = (i) => cells[i] % gridCols, cr = (i) => (cells[i] / gridCols) | 0;
  const pts = [];
  for (let i = 0; i < cells.length; i++) {
    if (i === 0 || i === cells.length - 1 ||
        (cc(i) - cc(i - 1)) !== (cc(i + 1) - cc(i)) ||
        (cr(i) - cr(i - 1)) !== (cr(i + 1) - cr(i))) {
      pts.push({ x: cc(i) * GC + GC / 2, y: cr(i) * GC + GC / 2 });
    }
  }
  pts.push({ x: gx, y: gy });                   // 최종 정확 위치
  return pts;
}

function ensureWalker(s, hx, hy, facing) {
  let w = walkers.get(s.id);
  if (!w) {
    w = { x: hx, y: hy, mode: 'sit', timer: 6000 + Math.random() * 18000,
          facing, walkF: 0, stuck: 0, path: null, roomRef: null, sid: s.id };
    walkers.set(s.id, w);
  }
  w.hx = hx; w.hy = hy;
  return w;
}
function walkerSeated(s) {
  const w = walkers.get(s.id);
  return !w || w.mode === 'sit';
}
function activeWalkerCount() {
  let n = 0;
  for (const w of walkers.values()) if (w.mode !== 'sit') n++;
  return n;
}
function pickRoamTarget(nearX, nearY, minDist) {
  for (let i = 0; i < 14; i++) {
    const x = WALL + 14 + Math.random() * (floorW - WALL * 2 - 28);
    const y = ROAM_TOP + 8 + Math.random() * (floorH - ROAM_TOP - WALL - 16);
    if (!blocked(x, y) && Math.hypot(x - nearX, y - nearY) > minDist) return { x, y };
  }
  return null;
}
function moveTo(w, tx, ty, dt) {
  const dx = tx - w.x, dy = ty - w.y, d = Math.hypot(dx, dy);
  if (d < 1.6) return true;
  const step = Math.min(WALK_SPEED * dt, d);
  const ux = dx / d, uy = dy / d;
  let moved = 0, rem = step;
  while (rem > 0.01) {                          // ≤1.2px 서브스텝 → 벽 관통 방지
    const s = Math.min(1.2, rem); rem -= s;
    if (!blocked(w.x + ux * s, w.y)) { w.x += ux * s; moved += Math.abs(ux * s); }
    if (!blocked(w.x, w.y + uy * s)) { w.y += uy * s; moved += Math.abs(uy * s); }
  }
  w.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
  w.walkF += dt;
  w.stuck = moved < 0.2 ? w.stuck + dt : 0;
  return Math.hypot(tx - w.x, ty - w.y) < 1.6;
}
// 경유점(path) 따라 이동 — 막히면 다음 경유점으로 건너뜀
function moveAlong(w, dt) {
  if (!w.path || !w.path.length) return true;
  const p = w.path[0];
  if (moveTo(w, p.x, p.y, dt)) { w.path.shift(); w.stuck = 0; return !w.path.length; }
  if (w.stuck > 700 && w.stuck < 3000) {        // 살짝 막힘 → 옆으로 살짝 비켜 우회(벽 관통 방지 위해 소폭)
    const s = Math.random() < 0.5 ? 2 : -2;
    if (!blocked(w.x + s, w.y)) w.x += s;
    else if (!blocked(w.x, w.y + s)) w.y += s;
  } else if (w.stuck > 3000) {                  // 오래 막힘 → 경유점 건너뜀(안전장치)
    w.path.shift(); w.stuck = 0;
    if (!w.path.length) return true;
  }
  return false;
}
function startBack(w) {
  w.path = pathFind(w.x, w.y, w.hx, w.hy) || [{ x: w.hx, y: w.hy }];
  w.mode = 'back'; w.stuck = 0;
  if (w.sid) speeches.delete(w.sid);   // 방 대사 버블이 복귀 중 잔류하지 않도록
}
function tickWalker(w, eff, dt) {
  const eligible = eff !== 'working';   // 작업중이면 자리 지킴
  if (w.mode === 'sit') {
    w.timer -= dt;
    if (w.timer <= 0) {
      let started = false;
      if (eligible && activeWalkerCount() < maxWalkers && Math.random() < 0.6) {
        if (rooms.length && Math.random() < 0.7) {     // 존 방문(상태별 목적지 편향)
          // 입력대기→커피머신, 완료→소파, 멈춤→휴식(cafe). 그 외/잔여는 랜덤 존(AI Lab/Collab 포함)
          const cafe = rooms.find((z) => z.type === 'cafe');
          let r, prefKind = null;
          if (cafe && (eff === 'blocked' || eff === 'done' || eff === 'stalled') && Math.random() < 0.7) {
            r = cafe;
            prefKind = eff === 'blocked' ? 'coffee' : eff === 'done' ? 'sofa' : 'rest';
          } else {
            r = rooms[Math.floor(Math.random() * rooms.length)];
          }
          let pois = roomPOIs(r).filter((p) => !blocked(p.x, p.y));
          if (prefKind) {
            const pref = pois.filter((p) => p.kind === prefKind);
            if (pref.length && Math.random() < 0.75) pois = pref;
          }
          if (pois.length) {
            const poi = pois[Math.floor(Math.random() * pois.length)];
            const jx = Math.random() * 10 - 5, jy = Math.random() * 8 - 4;   // 같은 지점 겹침 방지
            const path = pathFind(w.x, w.y, poi.x + jx, poi.y + jy);
            if (path) { w.roomRef = r; w.path = path; w.mode = 'out'; w.stuck = 0; started = true; }
          }
        }
        if (!started) {                                // 복도 산책
          const tgt = pickRoamTarget(w.hx, w.hy, 30);
          if (tgt) {
            const path = pathFind(w.x, w.y, tgt.x, tgt.y);
            if (path) { w.roomRef = null; w.path = path; w.mode = 'out'; w.stuck = 0; started = true; }
          }
        }
      }
      if (!started) w.timer = eligible ? 3000 : 12000 + Math.random() * 28000;
    }
  } else if (w.mode === 'out') {
    if (!eligible) startBack(w);
    else if (moveAlong(w, dt)) { w.mode = 'loiter'; w.timer = 5200 + Math.random() * 6000; }
  } else if (w.mode === 'loiter') {
    if (w.path && w.path.length) {            // 방 안 산책 이동 중(타이머 정지)
      moveAlong(w, dt);
    } else {
      w.timer -= dt;
      if (!eligible || w.timer <= 0) startBack(w);
      else if (w.roomRef && Math.random() < 0.015) {   // 가끔 방 안 다른 지점으로 걸어감
        const pois = roomPOIs(w.roomRef).filter((p) => !blocked(p.x, p.y));
        if (pois.length) {
          const poi = pois[Math.floor(Math.random() * pois.length)];
          const p = pathFind(w.x, w.y, poi.x + (Math.random() * 10 - 5), poi.y + (Math.random() * 8 - 4));
          if (p && p.length) w.path = p;
        }
      }
    }
  } else if (w.mode === 'back') {
    if (moveAlong(w, dt) || w.stuck > 4000) {
      w.x = w.hx; w.y = w.hy; w.roomRef = null; w.path = null;
      w.mode = 'sit'; w.timer = 12000 + Math.random() * 28000;
    }
  }
}

// 보행 캐릭터(서서/걷는 모습)
function drawWalkPerson(cx, topY, look, dir, t, moving) {
  cx = Math.round(cx); topY = Math.round(topY);
  shadow(cx, topY + 17, 13, 4);
  const f = moving ? Math.floor(t / 140) % 2 : 0;
  ctx.fillStyle = '#3a3d45';                     // 다리
  ctx.fillRect(cx - 3, topY + 13, 2, 4 - (f ? 1 : 0));
  ctx.fillRect(cx + 1, topY + 13, 2, 4 - (f ? 0 : 1));
  ctx.fillStyle = '#23252b';                     // 신발
  ctx.fillRect(cx - 4, topY + 16 - (f ? 1 : 0), 3, 1);
  ctx.fillRect(cx + 1, topY + 16 - (f ? 0 : 1), 3, 1);
  ctx.fillStyle = C.outline;                     // 몸통
  ctx.fillRect(cx - 6, topY + 5, 12, 9);
  ctx.fillStyle = look.shirt;
  ctx.fillRect(cx - 5, topY + 6, 10, 7);
  ctx.fillStyle = 'rgba(0,0,0,.15)';
  ctx.fillRect(cx - 5, topY + 11, 10, 2);
  ctx.fillStyle = look.shirt;                    // 팔(흔들림)
  ctx.fillRect(cx - 7, topY + 6 + (f ? 1 : 0), 2, 5);
  ctx.fillRect(cx + 5, topY + 6 + (f ? 0 : 1), 2, 5);
  drawHead(cx, topY, look, dir, 'working');
}

// ---------- 존 내 상주 캐릭터(ambient NPC) — 살아있는 오피스 ----------
function computeAmbient() {
  const out = [];
  let k = 0;
  const add = (x, y, face, act) => out.push({ x: Math.round(x), y: Math.round(y), look: lookOf('npc' + (k++)), face, act });
  for (const z of rooms) {
    const cx = z.x + z.w / 2;
    if (z.type === 'ailab') { add(z.x + 20, z.y + 78, 'up', 'work'); add(z.x + z.w - 20, z.y + 80, 'up', 'work'); }
    else if (z.type === 'collab') { add(cx - 15, z.y + 82, 'right', 'talk'); add(cx + 15, z.y + 82, 'left', 'talk'); add(cx, z.y + 100, 'up', 'talk'); }
    else if (z.type === 'cafe') { add(z.x + 26, z.y + 70, 'up', 'rest'); add(z.x + z.w - 28, z.y + 70, 'up', 'coffee'); }
    else if (z.type === 'focus') { add(z.x + 18, z.y + 80, 'up', 'focus'); add(z.x + z.w - 18, z.y + 82, 'up', 'focus'); }
  }
  return out;
}
function drawAmbientPerson(n, t) {
  const look = n.act === 'focus' ? { ...n.look, headphone: true } : n.look;
  drawWalkPerson(n.x, n.y, look, n.face, t, false);
  if (n.act === 'coffee') {                          // 커피잔
    ctx.fillStyle = '#fff'; ctx.fillRect(n.x + 6, n.y + 7, 3, 3);
    ctx.fillStyle = '#9a6b3a'; ctx.fillRect(n.x + 7, n.y + 8, 1, 1);
  }
  if (n.act === 'talk' && Math.floor(t / 1400) % 3 !== 2) {  // 토론 말풍선
    const bx = n.x + 6, by = n.y - 12;
    ctx.fillStyle = '#ffffff'; roundRect(bx, by, 13, 8, 3);
    ctx.fillStyle = '#94a3b8';
    for (let d = 0; d < 3; d++) ctx.fillRect(bx + 2 + d * 4, by + 3, 2, 2);
  }
}

// 보행 로직만 갱신(그리기는 깊이정렬 후 drawWalker 에서) — home 미설정 세션은 스킵
function tickWalkers(vis) {
  const ids = new Set(vis.map((s) => s.id));
  for (const id of walkers.keys()) if (!ids.has(id)) walkers.delete(id);
  maxWalkers = Math.max(1, Math.round(vis.length / 6));
  for (const s of vis) {
    const w = walkers.get(s.id);
    if (w) tickWalker(w, s.effective, dtFrame);
  }
}
function drawWalker(s, w, t) {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  const look = lookOf(s.id);
  drawWalkPerson(w.x, w.y, look, w.facing, t, w.mode === 'out' || w.mode === 'back');
  cellRects.push({ x: w.x - 11, y: w.y - 5, w: 22, h: 26, s });
  pushTag(s, w.x, w.y - 16, look);
}

// ---------- 상황별 대사 말풍선 ----------
function pickSpeechLine(s) {
  const w = walkers.get(s.id);
  let key;
  if (w && w.mode !== 'sit') {
    const r = roomAt(w.x, w.y);
    if (r) key = r.type === 'break' ? 'room_break' : 'room_pantry';
    else key = 'walk';
  } else {
    key = SAY[s.effective] ? s.effective : 'working';
  }
  const lines = SAY[key] || SAY.working;
  return lines[Math.floor(Math.random() * lines.length)];
}
function tickSpeech(vis, t) {
  for (const [id, sp] of speeches) if (sp.until < t) speeches.delete(id);
  speechCooldown -= dtFrame;
  if (speechCooldown > 0 || speeches.size >= 3) return;
  speechCooldown = 700 + Math.random() * 1500;
  // 후보 수집(이동 중인 캐릭터에 가중치)
  const pool = [];
  for (const s of vis) {
    if (speeches.has(s.id)) continue;
    const w = walkers.get(s.id);
    let weight = 1;
    if (w && w.mode !== 'sit') weight = roomAt(w.x, w.y) ? 6 : 4;
    pool.push({ s, weight });
  }
  if (!pool.length) return;
  let r = Math.random() * pool.reduce((a, b) => a + b.weight, 0);
  let pick = pool[0];
  for (const p of pool) { r -= p.weight; if (r <= 0) { pick = p; break; } }
  speeches.set(pick.s.id, { text: pickSpeechLine(pick.s), until: t + 2800 + Math.random() * 1800 });
}
function drawSpeech(t) {
  if (!speeches.size) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const k = S / DISP;
  ctx.font = `500 ${11 * k}px -apple-system, "Apple SD Gothic Neo", sans-serif`;
  ctx.textBaseline = 'middle';
  for (const [id, sp] of speeches) {
    const tp = tagPlaced.get(id);
    if (!tp) continue;
    const life = sp.until - t;
    const a = Math.max(0, Math.min(1, Math.min(life, 400) / 400)); // 사라질 때 페이드
    const tw = ctx.measureText(sp.text).width;
    const bw = tw + 14 * k, bh = 17 * k;
    const cx = tp.cx, by = tp.y - bh - 7 * k;
    const bx = cx - bw / 2;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(30,34,44,.22)';
    roundRect(bx + k, by + 1.5 * k, bw, bh, 8 * k);
    ctx.fillStyle = '#ffffff';
    roundRect(bx, by, bw, bh, 8 * k);
    ctx.beginPath();                              // 꼬리
    ctx.moveTo(cx - 3 * k, by + bh);
    ctx.lineTo(cx + 3 * k, by + bh);
    ctx.lineTo(cx, by + bh + 4 * k);
    ctx.fill();
    ctx.fillStyle = '#2a2d33';
    ctx.fillText(sp.text, bx + 7 * k, by + bh / 2 + 0.5 * k);
    ctx.globalAlpha = 1;
  }
}

// ---------- 클러스터 (깊이정렬용 밴드 분리: floor 러그 / back 뒷줄+책상 / front 앞줄) ----------
function drawPodAFloor(px, py, p) {
  const h = hash('pod' + p);
  const rug = C.rugs[h % C.rugs.length];
  ctx.fillStyle = rug[0];
  ctx.fillRect(px + 2, py + 8, POD_W - 4, POD_H - 10);
  ctx.fillStyle = rug[1];
  ctx.fillRect(px + 4, py + 10, POD_W - 8, POD_H - 14);
  ctx.fillStyle = C.rugLine;
  ctx.fillRect(px + 4, py + 10, POD_W - 8, 1);
}

// blocked 상태: 손들기(도움 요청) + "!" 표시
function drawRaiseHand(cx, topY, t) {
  const up = Math.floor(t / 350) % 2;                 // 손 흔들기
  ctx.fillStyle = '#e8b98a';
  ctx.fillRect(cx + 5, topY - 3 - up, 2, 6 + up);     // 든 팔
  ctx.fillRect(cx + 4, topY - 6 - up, 4, 3);          // 손
  ctx.fillStyle = '#F59E0B';                          // "!" 칩
  roundRect(cx + 8, topY - 12, 6, 7, 2);
  ctx.fillStyle = '#fff';
  ctx.fillRect(cx + 10, topY - 10, 2, 2);
  ctx.fillRect(cx + 10, topY - 7, 2, 1);
}

// 뒷줄 좌석 + 양쪽 책상/모니터 (변형 A)
function drawPodABack(px, py, seats, t) {
  const cxs = [px + 27, px + 65];
  const topDeskY = py + 34, botDeskY = py + 46;
  for (let k = 0; k < 2; k++) {
    const s = seats[k];
    const cx = cxs[k];
    ctx.fillStyle = C.chairDark;                 // 의자(항상)
    ctx.fillRect(cx - 6, py + 11, 12, 2);
    if (!s) continue;
    const w = ensureWalker(s, cx, py + 15, 'down');
    if (w.mode !== 'sit') continue;
    const look = lookOf(s.id);
    const eff = s.effective;
    const bob = eff === 'working' ? Math.round(Math.sin(t / 200 + look.phase)) : 0;
    const hy = py + 15 + bob;
    shadow(cx, hy + 18, 16, 4);
    drawHead(cx, hy, look, 'down', eff);
    drawBody(cx, hy + 8, look, eff, t, 'down');
    if (eff === 'blocked') drawRaiseHand(cx, hy, t);
    cellRects.push({ x: cx - 22, y: py + 2, w: 44, h: 42, s });
    pushTag(s, cx, py - 9 + (k ? 7 : 0), look);
  }
  shadow(px + 46, botDeskY + 14, 86, 5);
  // 윗줄: 사람이 아래(뷰어)를 향해 앉음 → 모니터 "뒷면"이 보임
  for (let k = 0; k < 2; k++) {
    drawDeskH(cxs[k], topDeskY, true);
    const s = seats[k];
    if (s) {
      drawMonitorBack(cxs[k] - 6, topDeskY - 9, s.effective);
      ctx.fillStyle = '#f2efe8';                    // 책상 위 노트
      ctx.fillRect(cxs[k] + 8, topDeskY + 3, 5, 4);
    } else {
      drawMonitorOff(cxs[k] - 6, topDeskY - 9, true);
    }
  }
  // 아랫줄: 사람이 위(뷰어 반대)를 향해 앉음 → 모니터 "앞면(화면)"이 보임
  for (let k = 0; k < 2; k++) {
    drawDeskH(cxs[k], botDeskY, true);
    const s = seats[k + 2];
    if (s) {
      const look = lookOf(s.id);
      if (look.deskKind === 2) drawLaptop(cxs[k] - 5, botDeskY - 8, s.effective);
      else drawMonitorFront(cxs[k] - 6, botDeskY - 10, s.effective, t);
      deskClutterH(cxs[k], botDeskY, s.effective, t);
    } else {
      drawMonitorOff(cxs[k] - 6, botDeskY - 10, false);
    }
  }
}

// 앞줄 좌석 (변형 A) — 책상보다 앞(아래)이므로 별도 밴드
function drawPodAFront(px, py, seats, t) {
  const cxs = [px + 27, px + 65];
  for (let k = 0; k < 2; k++) {
    const s = seats[k + 2];
    const cx = cxs[k];
    if (!s) {
      ctx.fillStyle = C.chairDark;
      ctx.fillRect(cx - 5, py + 83, 10, 2);
      continue;
    }
    const w = ensureWalker(s, cx, py + 67, 'up');
    if (w.mode !== 'sit') {
      ctx.fillStyle = C.chairDark;
      ctx.fillRect(cx - 5, py + 83, 10, 2);
      continue;
    }
    const look = lookOf(s.id);
    const eff = s.effective;
    const bob = eff === 'working' ? Math.round(Math.sin(t / 200 + look.phase)) : 0;
    const hy = py + 67 + bob;
    shadow(cx, hy + 18, 16, 4);
    drawBody(cx, hy + 8, look, eff, t, 'up');
    drawHead(cx, hy, look, 'up', eff);
    if (eff === 'blocked') drawRaiseHand(cx, hy, t);
    ctx.fillStyle = C.chairDark;
    ctx.fillRect(cx - 5, hy + 16, 10, 2);
    cellRects.push({ x: cx - 22, y: py + 52, w: 44, h: 44, s });
    pushTag(s, cx, py + 50 + (k ? 7 : 0), look);
  }
}

// 변형 B 한 줄(좌우 책상+좌석) 렌더 — back/front 공통
function drawPodBRow(px, py, seats, t, r) {
  const deskLX = px + 33, deskRX = px + 46;
  const dy = r === 0 ? py + 18 : py + 56;
  drawDeskV(deskLX, dy);
  drawDeskV(deskRX, dy);
  ctx.fillStyle = '#f2efe8';
  ctx.fillRect(deskLX + 4, dy + 22, 5, 4);
  ctx.fillRect(deskRX + 4, dy + 6, 5, 4);
  for (let c = 0; c < 2; c++) {
    const s = seats[r * 2 + c];
    const face = c === 0 ? 'right' : 'left';
    const cx = c === 0 ? px + 17 : px + 75;
    if (!s) { drawPlant(cx - 4, dy + 6, false); continue; }
    const w = ensureWalker(s, cx, dy + 8, face);
    const eff = s.effective;
    drawMonitorSide(c === 0 ? deskLX + 4 : deskRX + 4, dy + 10 + r * 2, eff, face);
    ctx.fillStyle = C.chairDark;
    ctx.fillRect(c === 0 ? cx - 8 : cx + 6, dy + 10, 2, 12);
    if (w.mode !== 'sit') continue;
    const look = lookOf(s.id);
    const bob = eff === 'working' ? Math.round(Math.sin(t / 200 + look.phase)) : 0;
    const hy = dy + 8 + bob;
    shadow(cx, hy + 18, 16, 4);
    drawHead(cx, hy, look, face, eff);
    drawBody(cx, hy + 8, look, eff, t, face);
    if (eff === 'blocked') drawRaiseHand(cx, hy, t);
    cellRects.push({ x: cx - 16, y: dy - 6, w: 34, h: 40, s });
    pushTag(s, cx, dy - 15 + (c ? 7 : 0), look);
  }
}

// band: 'floor' | 'back' | 'front'
function drawPod(p, px, py, seats, t, band) {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  const B = podVariantB(p, seats);
  if (band === 'floor') { drawPodAFloor(px, py, p); return; }
  if (band === 'back') {
    if (B) drawPodBRow(px, py, seats, t, 0);
    else drawPodABack(px, py, seats, t);
    return;
  }
  // front
  if (B) drawPodBRow(px, py, seats, t, 1);
  else drawPodAFront(px, py, seats, t);
  if ((hash('pod' + p) >>> 12) % 2) drawPlant(px + POD_W - 10, py + POD_H - 24, true);
}

// 빈 슬롯: 라운지 비네트 (자유 배치의 빈 공간 채움)
function drawEmptySlot(px, py, idx) {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  const h = hash('empty' + idx);
  const v = h % 5;
  const cx = px + POD_W / 2, cy = py + 34;
  drawAreaRug(px + 10, py + 14, POD_W - 20, POD_H - 30, '#DEE5F0', '#E8EDF6'); // 라운지 러그
  if (v === 0) {                       // 공용 라운지
    drawSofa(cx - 26, cy - 2, 28);
    drawCoffeeTable(cx - 6, cy + 16);
    drawPlant(cx + 22, cy - 6, true);
  } else if (v === 1) {                // 식물 그로브 + 암체어
    drawPlant(cx - 18, cy, true); drawPlant(cx + 2, cy + 12, false); drawPlant(cx + 16, cy - 4, false);
    drawArmchair(cx - 24, cy + 14);
  } else if (v === 2) {                // 서가 + 프린터
    drawBookshelf(cx - 12, cy - 6); drawPrinter(cx + 12, cy + 16); drawPlant(cx + 22, cy + 2, false);
  } else if (v === 3) {                // 작은 회의(라운드테이블)
    drawRoundTable(cx, cy + 8); drawPlant(cx - 24, cy + 12, false); drawPlant(cx + 22, cy + 12, false);
  } else {                             // 전화부스 + 락커
    drawPhoneBooth(cx - 20, cy - 6); drawLocker(cx + 2, cy - 6); drawPlant(cx + 24, cy + 10, false);
  }
}

// 좌석 단위 하이라이트
function drawHighlight() {
  if (!highlightId) return;
  ctx.setTransform(S, 0, 0, S, 0, 0);
  for (const c of cellRects) {
    if (c.s.id !== highlightId) continue;
    ctx.fillStyle = 'rgba(10,132,255,.12)';
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = '#0a84ff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.fill();
}
function roundRectStroke(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.stroke();
}

// ---------- 사무실 고양이 (충돌 회피) ----------
const cat = { x: 80, y: ROAM_TOP + 30, tx: 120, ty: ROAM_TOP + 60, flip: false, stuck: 0 };
function drawCat(t) {
  const dx = cat.tx - cat.x, dy = cat.ty - cat.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2 || cat.stuck > 1100) {
    const tgt = pickRoamTarget(cat.x, cat.y, 20);
    if (tgt) { cat.tx = tgt.x; cat.ty = tgt.y; }
    cat.stuck = 0;
  } else {
    const step = 0.45 * (dtFrame / 16);
    const ux = dx / dist * step, uy = dy / dist * step;
    let moved = 0;
    if (!blocked(cat.x + ux, cat.y)) { cat.x += ux; moved += Math.abs(ux); }
    if (!blocked(cat.x, cat.y + uy)) { cat.y += uy; moved += Math.abs(uy); }
    cat.flip = dx < 0;
    cat.stuck = moved < 0.1 ? cat.stuck + dtFrame : 0;
  }
  ctx.setTransform(S, 0, 0, S, 0, 0);
  const cx = Math.round(cat.x), cy = Math.round(cat.y);
  const f = dist >= 2 ? Math.floor(t / 180) % 2 : 0;
  shadow(cx, cy + 5, 10, 3);
  ctx.fillStyle = '#d8913c';
  ctx.fillRect(cx - 4, cy, 8, 4);
  const hx2 = cat.flip ? cx - 6 : cx + 3;
  ctx.fillRect(hx2, cy - 2, 4, 4);
  ctx.fillRect(hx2, cy - 4, 1, 2);
  ctx.fillRect(hx2 + 2, cy - 4, 1, 2);
  const tx2 = cat.flip ? cx + 4 : cx - 6;
  ctx.fillRect(tx2, cy - 2 + (Math.floor(t / 400) % 2), 2, 2);
  ctx.fillStyle = '#b3742c';
  ctx.fillRect(cx - 3, cy + 4, 1, 2 - f);
  ctx.fillRect(cx + 2, cy + 4, 1, 1 + f);
}

// ---------- 메인 루프 ----------
function frame(t) {
  dtFrame = lastT ? Math.min(60, t - lastT) : 16;
  lastT = t;
  // 고DPI 선명도: 백킹은 devicePixelRatio만큼 더 높게 렌더, 표시 크기는 DISP로 고정
  S = DISP * Math.min(window.devicePixelRatio || 1, 3);
  const vis = visible();
  const layout = computeLayout(vis.length);
  floorW = layout.W; floorH = layout.H;
  // 존 기하 — 상단을 4개 존(AI Lab / Collaboration / Cafe·Break / Focus Booth)이 밀착해 차지
  const innerW = layout.W - WALL * 2;
  const zAi = Math.round(innerW * 0.28), zCo = Math.round(innerW * 0.22), zCa = Math.round(innerW * 0.28);
  const zx = WALL;
  rooms = [
    { type: 'ailab',  label: 'AI Lab',        floor: '#F5EEFF', x: zx,                 y: TOP_WALL, w: zAi, h: ZONE_H },
    { type: 'collab', label: 'Collaboration', floor: '#FFF4E5', x: zx + zAi,           y: TOP_WALL, w: zCo, h: ZONE_H },
    { type: 'cafe',   label: 'Cafe · Break',  floor: '#EAF5EA', x: zx + zAi + zCo,     y: TOP_WALL, w: zCa, h: ZONE_H },
    { type: 'focus',  label: 'Focus Booth',   floor: '#EEF4FF', x: zx + zAi + zCo + zCa, y: TOP_WALL, w: layout.W - WALL - (zx + zAi + zCo + zCa), h: ZONE_H },
  ];
  seatMap = buildSeatMap(vis, layout.pods);   // 1~4명 다양한 좌석 배정
  collectObstacles(layout);
  buildGrid();                                // 경로탐색 격자(레이아웃 변경 시 갱신)
  const w = layout.W * S, h = layout.H * S;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
    canvas.style.width = (layout.W * DISP) + 'px';
    canvas.style.height = (layout.H * DISP) + 'px';
    ctx.imageSmoothingEnabled = false;
  }

  drawFloor(layout.W, layout.H);
  drawWalls(layout.W, layout.H);

  // Development Zone 바닥(작업 영역) — 상단 존 아래 ~ 하단 밴드 위
  ctx.setTransform(S, 0, 0, S, 0, 0);
  const devTop = TOP_WALL + ZONE_H + 2;
  const innerWf = layout.W - WALL * 2, midX = WALL + Math.round(innerWf / 2);
  ctx.fillStyle = '#EEF4FF';
  ctx.fillRect(WALL, devTop, innerWf, layout.bottomTop - devTop);
  drawAreaRug(WALL + 2, devTop, innerWf - 4, layout.bottomTop - devTop - 2, '#D6E0F0', '#DFE8F5'); // Dev 카펫(벽까지)

  // 하단 밴드: Infrastructure Zone(좌) / QA Zone(우)
  const by = layout.bottomTop, bh = layout.bottomH - WALL;
  ctx.fillStyle = '#EAEEF4'; ctx.fillRect(WALL, by, midX - WALL, bh);          // Infra 바닥
  ctx.fillStyle = '#F1F6EF'; ctx.fillRect(midX, by, layout.W - WALL - midX, bh); // QA 바닥
  ctx.fillStyle = 'rgba(120,130,150,.12)'; ctx.fillRect(midX - 1, by + 6, 2, bh - 12); // 구분선

  zoneLabels = [];
  for (const z of rooms) {                         // 상단 4개 존
    drawZone(z, t);
    zoneLabels.push({ text: z.label, x: z.x + 8, y: z.y + z.h - 7 });
  }
  zoneLabels.push({ text: 'Development Zone', x: WALL + 10, y: devTop + 14 });
  drawInfraZone(WALL, by, midX - WALL, bh, t);
  zoneLabels.push({ text: 'Infrastructure', x: WALL + 8, y: by + bh - 6 });
  drawQAZone(midX, by, layout.W - WALL - midX, bh, t);
  zoneLabels.push({ text: 'QA Zone', x: midX + 8, y: by + bh - 6 });

  drawCorridorDecor(layout);
  drawPerimeterDecor(layout);

  cellRects = [];
  tagJobs = [];
  for (let e = 0; e < layout.emptySlots.length; e++) {
    drawEmptySlot(layout.emptySlots[e].x, layout.emptySlots[e].y, e);
  }
  tickWalkers(vis);               // 보행 로직 갱신(그리기는 아래 깊이정렬에서)

  // 바닥 패스: pod 러그는 항상 모두의 아래(러그가 캐릭터를 덮는 현상 방지)
  for (let p = 0; p < layout.pods; p++) {
    drawPod(p, layout.podPos[p].x, layout.podPos[p].y, seatMap[p] || [], t, 'floor');
  }

  // 깊이정렬: pod를 back(뒷줄+책상)/front(앞줄) 밴드로 쪼개고 보행 캐릭터를 발끝 Y로 섞어 그림
  // → 책상 뒤(위쪽) 캐릭터는 가려지고, 앞(아래쪽)이면 위로. 러그/책상이 캐릭터를 묻는 현상 제거
  const actors = [];
  for (let p = 0; p < layout.pods; p++) {
    const pos = layout.podPos[p], seats = seatMap[p] || [];
    actors.push({ y: pos.y + 40, draw: () => drawPod(p, pos.x, pos.y, seats, t, 'back') });
    actors.push({ y: pos.y + 92, draw: () => drawPod(p, pos.x, pos.y, seats, t, 'front') });
  }
  for (const s of vis) {
    const w = walkers.get(s.id);
    if (w && w.mode !== 'sit') actors.push({ y: w.y + 17, draw: () => drawWalker(s, w, t) });
  }
  for (const n of computeAmbient()) {                // 존 상주 NPC(연구/회의/휴식/집중)
    actors.push({ y: n.y + 17, draw: () => drawAmbientPerson(n, t) });
  }
  actors.sort((a, b) => a.y - b.y);
  for (const a of actors) a.draw();

  tickSpeech(vis, t);             // 상황별 대사 스케줄
  drawHighlight();
  drawCat(t);
  drawTags(t);                    // tagPlaced 채움
  drawSpeech(t);                  // 말풍선(이름표 위)

  if (vis.length === 0) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#6b7280';
    ctx.font = `${16 * (S / DISP)}px -apple-system, "Apple SD Gothic Neo", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('표시할 세션이 없습니다 🌙', canvas.width / 2, canvas.height / 2);
    ctx.textAlign = 'left';
  }
  requestAnimationFrame(frame);
}

setInterval(renderPanel, 30000);
connect();
requestAnimationFrame(frame);

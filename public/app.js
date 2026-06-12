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
  tile: '#f1f2f4', tileAlt: '#ebedef', grout: 'rgba(130,136,148,.07)',
  wall: '#f4f5f7', wallShade: '#d8dade', wallDark: '#c2c6cc',
  glass: '#b5dcf2', glassDeep: '#8cc6e8',
  roomWood: '#ecd9b4', roomWoodAlt: '#e6d1a6', roomWoodSeam: 'rgba(160,120,60,.18)',
  roomB: '#eff0f1', roomBalt: '#e8e9eb',
  roomEdge: '#c2c6cc',
  rugs: [['#dde3ec', '#e5eaf1'], ['#dee8de', '#e6eee6'], ['#ece5da', '#f1ebe2']],
  rugLine: 'rgba(0,0,0,.05)',
  // 라이트 오크 데스크 + 알루미늄
  oakHi: '#f0dcae', oak: '#e7cd97', oakGrain: '#d4b67c', oakEdge: '#c9a96a',
  alu: '#d4d7dc', aluHi: '#e8eaee', aluDark: '#b2b6be',
  white: '#f8f9fa', whiteEdge: '#dfe2e6',
  chair: '#aeb3bb', chairSeat: '#c9ccd2', chairDark: '#8d929b',
  sofaBase: '#b4b9c1', sofaSeat: '#cdd1d7', sofaHi: '#dde0e5', sofaDark: '#969ba4',
  tan: '#d8b27e', tanDark: '#bb9560',
  potDark: '#c9ccd2', pot: '#eceef0', potHi: '#ffffff',
  leafDark: '#3a9457', leaf: '#4cb56c', leafHi: '#6cc986',
  outline: '#4a4d55', monitor: '#1d1f24', monitorHi: '#34373e',
  screenBezel: '#0f1115',
  shadow: 'rgba(60,65,78,.13)',
};

const SCREEN = {
  working: '#b8f0c4', done: '#9fc3ff', blocked: '#ffd28a',
  stalled: '#3a3d44', unknown: '#6b7078',
};

const STATE_META = {
  working: { color: '#30c158', label: '작업중',    emoji: null },
  done:    { color: '#0a84ff', label: '완료',      emoji: '✅' },
  blocked: { color: '#ff9f0a', label: '입력 대기', emoji: '⚠️' },
  stalled: { color: '#ff453a', label: '멈춤 의심', emoji: '💤' },
  unknown: { color: '#98989f', label: '알 수 없음', emoji: '❔' },
};

// 이름표 버블용 중간 톤 (밝은 바닥 대비 + 너무 어둡지 않게)
const TAG_COLOR = {
  working: '#2ba558', done: '#3b82d6', blocked: '#e2912a',
  stalled: '#dd4b42', unknown: '#747982',
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
function usageColor(p) { return p >= 85 ? '#ff5252' : p >= 60 ? '#ffb020' : '#43d675'; }
function renderUsage(u) {
  const box = document.getElementById('usage');
  if (!u || (u.fiveHourPct == null && u.weeklyPct == null)) { box.style.display = 'none'; return; }
  box.style.display = 'flex';
  const set = (itemId, pctId, fillId, label, pct, reset) => {
    const p = pct == null ? null : Math.round(pct);
    document.getElementById(pctId).textContent = p == null ? '–' : p + '%';
    const f = document.getElementById(fillId);
    f.style.width = (p == null ? 0 : Math.min(100, p)) + '%';
    f.style.background = usageColor(p || 0);
    const r = resetLabel(reset);
    document.getElementById(itemId).title = r ? `${label} ${p}% · ${r}` : `${label} ${p}%`;
  };
  set('u5item', 'u5pct', 'u5fill', '현재 세션·5시간', u.fiveHourPct, u.fiveHourResetsAt);
  set('uwitem', 'uwpct', 'uwfill', '주간(모든 모델)', u.weeklyPct, u.weeklyResetsAt);
  const cost = document.getElementById('ucost');
  cost.textContent = (u.costUSD != null) ? `$${Number(u.costUSD).toFixed(2)}` : '';
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
    li.className = 'item' + (s.id === highlightId ? ' hl' : '');
    li.innerHTML = `
      <div class="row1">
        <span class="dot ${s.effective}" style="background:${m.color}"></span>
        <span class="name"></span>
        <span class="badge ${s.effective}">${m.label}</span>
      </div>
      <div class="detail"></div>
      <div class="meta"><span>📁 ${s.project || '?'}</span><span>🕐 ${rel(s.lastActivity)}</span></div>`;
    li.querySelector('.name').textContent = s.name;
    li.querySelector('.detail').textContent = s.detail || '';
    li.title = s.detail || s.name;
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
  const H = workY + podRows * (POD_H + AISLE_Y) + 8;

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
  return { W, H, pods, podCols, podRows, podPos, emptySlots, workY };
}

// ---------- 바닥/벽 ----------
function drawFloor(W, H) {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  const T = 28;
  for (let ty = 0, r = 0; ty < H; ty += T, r++) {
    for (let tx = 0, c = 0; tx < W; tx += T, c++) {
      ctx.fillStyle = (r + c) % 2 ? C.tileAlt : C.tile;
      ctx.fillRect(tx, ty, T, T);
      ctx.fillStyle = C.grout;
      ctx.fillRect(tx, ty, T, 1);
      ctx.fillRect(tx, ty, 1, T);
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.fillRect(tx + 2, ty + 2, 6, 1);
    }
  }
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
  ctx.fillStyle = C.chairDark;
  for (const [dx, dy] of [[-11, 0], [11, 0]]) {
    ctx.fillRect(cx + dx - 3, cy + dy - 3, 6, 6);
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

// ---------- 휴게실 / 탕비실 ----------
// 개방형 방: 위·좌·우 3면 벽, 아래(정면)는 열어 둠 → 좁은 문 없이 진입(벽 뚫기 방지)
function roomShell(x, y, w, h, floorFn) {
  floorFn(x, y, w, h);
  ctx.fillStyle = C.roomEdge;
  ctx.fillRect(x, y, w, 3);                  // 위
  ctx.fillRect(x, y, 3, h);                  // 좌
  ctx.fillRect(x + w - 3, y, 3, h);          // 우
}

function drawBreakRoom(x, y, w, h, t) {
  roomShell(x, y, w, h, (rx, ry, rw, rh) => {
    // 라이트 오크 우드 플로어 (애플 라운지)
    for (let py = ry, r = 0; py < ry + rh; py += 6, r++) {
      ctx.fillStyle = r % 2 ? C.roomWood : C.roomWoodAlt;
      ctx.fillRect(rx, py, rw, Math.min(6, ry + rh - py));
      ctx.fillStyle = C.roomWoodSeam;
      ctx.fillRect(rx, py, rw, 1);
      const off = (r * 31) % 48;
      for (let px2 = rx + off; px2 < rx + rw; px2 += 48) ctx.fillRect(px2, py, 1, 5);
    }
  });
  drawTV(x + w / 2 - 11, y + 4, t);
  drawSofa(x + 8, y + 26, 28);
  drawSofa(x + w - 40, y + 26, 28);
  drawCoffeeTable(x + w / 2 - 7, y + 36);
  drawArmchair(x + 8, y + 50);
  drawPlant(x + w - 16, y + 50, true);
  drawPlant(x + w - 14, y + 6, false);
}

function drawPantry(x, y, w, h, t) {
  roomShell(x, y, w, h, (rx, ry, rw, rh) => {
    for (let ty = ry, r = 0; ty < ry + rh; ty += 8, r++) {
      for (let tx = rx, c2 = 0; tx < rx + rw; tx += 8, c2++) {
        ctx.fillStyle = (r + c2) % 2 ? C.roomB : C.roomBalt;
        ctx.fillRect(tx, ty, Math.min(8, rx + rw - tx), Math.min(8, ry + rh - ty));
      }
    }
  });
  drawCounter(x + 6, y + 10, Math.min(w - 60, 80), t);
  drawFridge(x + w - 46, y + 4);
  drawVending(x + w - 26, y + 4, t);
  drawSnackShelf(x + 6, y + 34);
  drawRoundTable(x + w / 2 + 6, y + 48);
  drawWaterCooler(x + w - 18, y + 40);
  drawPlant(x + 30, y + 52, false);
}

// ---------- 복도 데코 ----------
function drawCorridorDecor(layout) {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  const { W, podRows, workY } = layout;
  for (let r = 1; r <= podRows; r++) {
    const y = workY + r * (POD_H + AISLE_Y) - AISLE_Y + 6;
    const h = hash('cor' + r);
    for (let x = WALL + 30 + (h % 40); x < W - 50; x += 210) {
      const v = (h >>> (x % 7)) % 3;
      if (v === 0) drawPlant(x, y, true);
      else if (v === 1) {
        shadow(x + 9, y + 14, 20, 3);
        ctx.fillStyle = C.oak;                    // 오크 벤치
        ctx.fillRect(x, y + 6, 18, 4);
        ctx.fillStyle = C.oakHi;
        ctx.fillRect(x, y + 6, 18, 1);
        ctx.fillStyle = C.aluDark;
        ctx.fillRect(x + 1, y + 10, 2, 4);
        ctx.fillRect(x + 15, y + 10, 2, 4);
      } else drawWaterCooler(x, y);
    }
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
  // 방: 위·좌·우 벽(두껍게, 아래는 열림) + 내부 가구(상단부) — 하단은 보행 공간
  const WT = 4;
  for (const r of rooms) {
    obstacles.push({ x: r.x, y: r.y, w: r.w, h: WT });                   // 위
    obstacles.push({ x: r.x, y: r.y, w: WT, h: r.h });                   // 좌
    obstacles.push({ x: r.x + r.w - WT, y: r.y, w: WT, h: r.h });        // 우(가운데 공유 벽 포함)
    if (r.type === 'break') {
      obstacles.push({ x: r.x + 6, y: r.y + 24, w: 32, h: 20 });         // 소파L
      obstacles.push({ x: r.x + r.w - 42, y: r.y + 24, w: 34, h: 20 });  // 소파R
      obstacles.push({ x: r.x + r.w / 2 - 10, y: r.y + 34, w: 20, h: 12 });// 테이블
    } else {
      obstacles.push({ x: r.x + 4, y: r.y + 8, w: Math.min(r.w - 60, 84), h: 16 }); // 카운터
      obstacles.push({ x: r.x + r.w - 52, y: r.y + 2, w: 48, h: 32 });   // 냉장고/자판기
      obstacles.push({ x: r.x + 4, y: r.y + 34, w: 24, h: 24 });         // 스낵선반
      obstacles.push({ x: r.x + r.w / 2 + 2, y: r.y + 44, w: 20, h: 16 });// 원형테이블
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
// 도착지: 가구 "바로 앞"(아래에서 곧장 걸어 올라가 가구에 붙어 섬) — 방 깊숙이
function roomPOIs(r) {
  if (r.type === 'break') return [
    { x: r.x + 24, y: r.y + 72 },               // 좌측 소파 앞
    { x: r.x + r.w - 26, y: r.y + 72 },         // 우측 소파 앞
    { x: r.x + r.w / 2, y: r.y + 76 },          // 중앙 커피테이블 앞
  ];
  return [
    { x: r.x + r.w - 38, y: r.y + 46 },         // 냉장고 바로 앞
    { x: r.x + 22, y: r.y + 70 },               // 스낵선반 앞
    { x: r.x + r.w / 2 + 12, y: r.y + 72 },     // 원형테이블 앞
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
        if (rooms.length && Math.random() < 0.55) {    // 휴게실/탕비실 방문
          const r = rooms[Math.floor(Math.random() * rooms.length)];
          const pois = roomPOIs(r).filter((p) => !blocked(p.x, p.y));
          if (pois.length) {
            const poi = pois[Math.floor(Math.random() * pois.length)];
            const path = pathFind(w.x, w.y, poi.x, poi.y);
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
    w.timer -= dt;
    if (!eligible || w.timer <= 0) startBack(w);
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
    cellRects.push({ x: cx - 22, y: py + 2, w: 44, h: 42, s });
    pushTag(s, cx, py - 9 + (k ? 7 : 0), look);
  }
  shadow(px + 46, botDeskY + 14, 86, 5);
  for (let k = 0; k < 2; k++) {
    drawDeskH(cxs[k], topDeskY, true);
    const s = seats[k];
    if (s) {
      const look = lookOf(s.id);
      if (look.deskKind === 2) drawLaptop(cxs[k] - 5, topDeskY - 8, s.effective);
      else drawMonitorFront(cxs[k] - 6, topDeskY - 10, s.effective, t);
      deskClutterH(cxs[k], topDeskY, s.effective, t);
    } else {
      drawMonitorOff(cxs[k] - 6, topDeskY - 10, false);
    }
  }
  for (let k = 0; k < 2; k++) {
    drawDeskH(cxs[k], botDeskY, true);
    const s = seats[k + 2];
    if (s) {
      drawMonitorBack(cxs[k] - 6, botDeskY - 9, s.effective);
      ctx.fillStyle = '#f2efe8';
      ctx.fillRect(cxs[k] + 8, botDeskY + 3, 5, 4);
    } else {
      drawMonitorOff(cxs[k] - 6, botDeskY - 9, true);
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
  const v = h % 4;
  const cx = px + POD_W / 2, cy = py + 40;
  if (v === 0) {
    drawArmchair(cx - 18, cy);
    drawCoffeeTable(cx + 2, cy + 3);
    drawPlant(cx + 22, cy - 4, false);
  } else if (v === 1) {
    drawPlant(cx - 16, cy, true);
    drawPlant(cx + 2, cy + 10, false);
    drawPlant(cx + 14, cy - 2, false);
  } else if (v === 2) {
    drawBookshelf(cx - 9, cy);
    drawPlant(cx + 14, cy + 4, false);
  }
  // v === 3 → 빈 공간 (개방감)
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
  // 방 기하 — 상단 전체 폭을 두 방이 벽에 밀착해 차지(여백 없음, 가운데 공유 벽)
  const mid = Math.round(layout.W / 2);
  rooms = [
    { type: 'break', x: WALL, y: TOP_WALL, w: mid - WALL, h: ZONE_H },
    { type: 'pantry', x: mid, y: TOP_WALL, w: layout.W - WALL - mid, h: ZONE_H },
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

  zoneLabels = [];
  drawBreakRoom(rooms[0].x, rooms[0].y, rooms[0].w, rooms[0].h, t);
  zoneLabels.push({ text: '휴게실', x: rooms[0].x + 8, y: rooms[0].y + rooms[0].h - 7 });
  drawPantry(rooms[1].x, rooms[1].y, rooms[1].w, rooms[1].h, t);
  zoneLabels.push({ text: '탕비실 · 스낵코너', x: rooms[1].x + 8, y: rooms[1].y + rooms[1].h - 7 });

  drawCorridorDecor(layout);

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

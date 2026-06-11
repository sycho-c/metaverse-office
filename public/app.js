/* Claude Office — Canvas 픽셀 오피스 렌더러
 * 애플 스타일 오피스: 화이트+라이트 오크+알루미늄, iMac 데스크, 자유 배치 클러스터 */
'use strict';

// ---------- 레이아웃 상수 ----------
const S = 2;
const POD_W = 92;
const POD_H = 106;
const AISLE_X = 44;
const AISLE_Y = 40;
const WALL = 14;
const TOP_WALL = 22;
const ZONE_H = 96;
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
    try { update(JSON.parse(e.data).sessions || []); } catch (err) { /* skip */ }
  };
  es.onerror = () => {
    connEl.textContent = '● 재연결 중…'; connEl.className = 'off';
    es.close();
    setTimeout(connect, 3000);
  };
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
  const lx = (ev.clientX - r.left) / S, ly = (ev.clientY - r.top) / S;
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
  const availLogical = Math.max(460, (canvas.parentElement.clientWidth - 30) / S);
  const podCols = Math.max(2, Math.min(5,
    Math.floor((availLogical - WALL * 2 + AISLE_X) / (POD_W + AISLE_X))));
  const pods = Math.max(1, Math.ceil(n / 4));
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
function roomShell(x, y, w, h, floorFn, doorX) {
  floorFn(x, y, w, h);
  ctx.fillStyle = C.roomEdge;
  ctx.fillRect(x, y, w, 2);
  ctx.fillRect(x, y, 2, h);
  ctx.fillRect(x + w - 2, y, 2, h);
  ctx.fillRect(x, y + h - 2, doorX - x, 2);
  ctx.fillRect(doorX + 22, y + h - 2, x + w - doorX - 22, 2);
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
  }, x + w / 2 - 11);
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
  }, x + w / 2 - 11);
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
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const j of tagJobs) {
    ctx.font = '600 12px -apple-system, "Apple SD Gothic Neo", sans-serif';
    let nm = j.s.name;
    while (nm.length > 4 && ctx.measureText(nm).width > 118) nm = nm.slice(0, -2);
    if (nm !== j.s.name) nm += '…';
    const tw = ctx.measureText(nm).width;
    const working = j.s.effective === 'working';
    const bw = tw + (working ? 28 : 18), bh = 18, bx = j.scx - bw / 2, by = j.sy;
    // 상태색 버블: 그림자 → 본체(상태색) → 보더 (이모지 없음, 색상으로만 구분)
    ctx.fillStyle = 'rgba(30,34,44,.25)';
    roundRect(bx + 1, by + 2, bw, bh, 8);
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = TAG_COLOR[j.s.effective] || TAG_COLOR.unknown;
    roundRect(bx, by, bw, bh, 8);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = 1;
    roundRectStroke(bx + 0.5, by + 0.5, bw - 1, bh - 1, 7.5);
    if (working) {                               // 작업중: 흰 점 점멸
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(t / 300));
      ctx.beginPath(); ctx.arc(bx + 10, by + 9, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(nm, bx + (working ? 18 : 9), by + 9.5);
  }
  for (const z of zoneLabels) {
    ctx.font = '600 10px -apple-system, "Apple SD Gothic Neo", sans-serif';
    ctx.fillStyle = 'rgba(110,116,128,.85)';
    ctx.fillText(z.text, z.x * S, z.y * S);
  }
}

// ---------- 클러스터 ----------
function drawPodA(px, py, seats, t) {
  const cxs = [px + 27, px + 65];
  const topDeskY = py + 34;
  const botDeskY = py + 46;

  for (let k = 0; k < 2; k++) {
    const s = seats[k];
    const cx = cxs[k];
    if (!s) { drawPlant(cx - 4, py + 12, false); continue; }
    const look = lookOf(s.id);
    const eff = s.effective;
    const bob = eff === 'working' ? Math.round(Math.sin(t / 200 + look.phase)) : 0;
    const hy = py + 15 + bob;
    shadow(cx, hy + 18, 16, 4);
    ctx.fillStyle = C.chairDark;
    ctx.fillRect(cx - 6, hy - 4, 12, 2);
    drawHead(cx, hy, look, 'down', eff);
    drawBody(cx, hy + 8, look, eff, t, 'down');
    cellRects.push({ x: cx - 22, y: py + 2, w: 44, h: 42, s });
    pushTag(s, cx, py + 1 + (k ? 8 : 0), look);
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
      drawPlant(cxs[k] + 8, botDeskY - 6, false);
    }
  }
  for (let k = 0; k < 2; k++) {
    const s = seats[k + 2];
    const cx = cxs[k];
    if (!s) continue;
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
    pushTag(s, cx, py + 51 + (k ? 8 : 0), look);
  }
}

function drawPodB(px, py, seats, t) {
  const deskLX = px + 33, deskRX = px + 46;
  const rows = [py + 18, py + 56];
  for (let r = 0; r < 2; r++) {
    const dy = rows[r];
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
      const look = lookOf(s.id);
      const eff = s.effective;
      const bob = eff === 'working' ? Math.round(Math.sin(t / 200 + look.phase)) : 0;
      const hy = dy + 8 + bob;
      drawMonitorSide(c === 0 ? deskLX + 4 : deskRX + 4, dy + 10 + r * 2, eff, face);
      shadow(cx, hy + 18, 16, 4);
      ctx.fillStyle = C.chairDark;
      ctx.fillRect(c === 0 ? cx - 8 : cx + 6, hy + 2, 2, 12);
      drawHead(cx, hy, look, face, eff);
      drawBody(cx, hy + 8, look, eff, t, face);
      cellRects.push({ x: cx - 16, y: dy - 6, w: 34, h: 40, s });
      pushTag(s, cx, dy - 8 + (c ? 8 : 0), look);
    }
  }
}

function drawPod(p, px, py, seats, t) {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  const h = hash('pod' + p);
  const rug = C.rugs[h % C.rugs.length];
  ctx.fillStyle = rug[0];
  ctx.fillRect(px + 2, py + 8, POD_W - 4, POD_H - 10);
  ctx.fillStyle = rug[1];
  ctx.fillRect(px + 4, py + 10, POD_W - 8, POD_H - 14);
  ctx.fillStyle = C.rugLine;
  ctx.fillRect(px + 4, py + 10, POD_W - 8, 1);

  const full = seats.filter(Boolean).length === 4;
  if ((h >>> 8) % 3 === 2 && full) drawPodB(px, py, seats, t);
  else drawPodA(px, py, seats, t);

  if ((h >>> 12) % 2) drawPlant(px + POD_W - 10, py + POD_H - 24, true);
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

// ---------- 사무실 고양이 ----------
const cat = { x: 60, y: 60, tx: 200, ty: 200, flip: false };
function drawCat(t) {
  const W = canvas.width / S, H = canvas.height / S;
  const dx = cat.tx - cat.x, dy = cat.ty - cat.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) {
    if (Math.floor(t / 100) % 40 === 0) {
      cat.tx = 18 + Math.random() * (W - 36);
      cat.ty = TOP_WALL + 12 + Math.random() * (H - TOP_WALL - 32);
    }
  } else {
    cat.x += (dx / dist) * 0.45;
    cat.y += (dy / dist) * 0.45;
    cat.flip = dx < 0;
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
  const vis = visible();
  const layout = computeLayout(vis.length);
  const w = layout.W * S, h = layout.H * S;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
    ctx.imageSmoothingEnabled = false;
  }

  drawFloor(layout.W, layout.H);
  drawWalls(layout.W, layout.H);

  zoneLabels = [];
  const zy = TOP_WALL + 8;
  const zoneH = ZONE_H - 14;
  const halfW = Math.min(Math.floor(layout.W * 0.42), 230);
  drawBreakRoom(WALL + 2, zy, halfW, zoneH, t);
  zoneLabels.push({ text: '휴게실', x: WALL + 8, y: zy + zoneH + 8 });
  const px2 = layout.W - WALL - 2 - halfW;
  drawPantry(px2, zy, halfW, zoneH, t);
  zoneLabels.push({ text: '탕비실 · 스낵코너', x: px2 + 6, y: zy + zoneH + 8 });

  drawCorridorDecor(layout);

  cellRects = [];
  tagJobs = [];
  for (let e = 0; e < layout.emptySlots.length; e++) {
    drawEmptySlot(layout.emptySlots[e].x, layout.emptySlots[e].y, e);
  }
  for (let p = 0; p < layout.pods; p++) {
    const seats = [vis[p * 4], vis[p * 4 + 1], vis[p * 4 + 2], vis[p * 4 + 3]];
    drawPod(p, layout.podPos[p].x, layout.podPos[p].y, seats, t);
  }

  drawHighlight();
  drawCat(t);
  drawTags(t);

  if (vis.length === 0) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#6b7280';
    ctx.font = '16px -apple-system, "Apple SD Gothic Neo", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('표시할 세션이 없습니다 🌙', canvas.width / 2, canvas.height / 2);
    ctx.textAlign = 'left';
  }
  requestAnimationFrame(frame);
}

setInterval(renderPanel, 30000);
connect();
requestAnimationFrame(frame);

/* Claude Office — Canvas 픽셀 오피스 렌더러
 * 애플 스타일 오피스: 화이트+라이트 오크+알루미늄, iMac 데스크, 자유 배치 클러스터 */
'use strict';

// ---------- 순수 로직 모듈 (테스트 대상, public/lib/*.mjs) ----------
import { hash } from './lib/hash.mjs';
import { buildSeatMap, podVariantB } from './lib/seating.mjs';
import { sessionSig } from './lib/sig.mjs';
import { lookOf } from './lib/look.mjs';
import { rel, resetLabel, usageColor, freshnessLabel, fmtTime, toolShortName, fmtTokens, fmtElapsed } from './lib/format.mjs';

// ---------- 공유 렌더 컨텍스트 (core/gfx.mjs) ----------
// canvas/ctx/C/TH/S/lastT/dtFrame 는 gfx 가 소유하는 live binding. 재할당은 setter 경유.
import { canvas, ctx, S, C, TH, lastT, dtFrame, setScale, setTiming, applyPalette } from './core/gfx.mjs';
import { shadow, drawPlant, roundRect, roundRectStroke } from './render/primitives.mjs';

// ---------- 공유 가변 상태 허브 (core/world-state.mjs · core/app-state.mjs) ----------
import {
  floorW, floorH, setFloor, rooms, setRooms, seatMap, setSeatMap,
  walkers, speeches, speechOn, setSpeechOn,
  tagJobs, tagPlaced, cellRects, pushTag,
} from './core/world-state.mjs';
import {
  highlightId, setHighlightId, talking, setTalking, talkTarget, setTalkTarget,
  settingsOpen, setSettingsOpen, keys,
} from './core/app-state.mjs';

// ---------- 불변 상수 → constants.mjs ----------
import {
  DISP, POD_W, POD_H, AISLE_X, AISLE_Y, WALL, TOP_WALL, ZONE_H, CORRIDOR_H, ROAM_TOP, WALK_SPEED,
  STATE_META, TAG_COLOR, STATE_GLYPH, SAY,
} from './constants.mjs';

// ===== 테마 레지스트리 → themes.mjs =====
import { THEMES, resolveTheme } from './themes.mjs';
let activeTheme = resolveTheme();
applyPalette(THEMES[activeTheme]);     // gfx 의 TH/C 초기화(이후 import 한 TH/C 가 최신값 반영)
// 페이지 크롬(헤더·사이드바·캔버스 외부) CSS 변수 적용 — 상태 의미색은 건드리지 않음
function applyChrome(th) {
  const r = document.documentElement.style, c = th.chrome;
  r.setProperty('--bg', c.bg); r.setProperty('--panel', c.panel); r.setProperty('--panel2', c.panel2);
  r.setProperty('--line', c.line); r.setProperty('--text', c.text);
  r.setProperty('--secondary', c.secondary); r.setProperty('--dim', c.dim);
  r.setProperty('--outside', c.outside);
}
// 테마 전환 — 리로드 없이 즉시 반영(frame()이 매 프레임 C/TH 참조)
function setTheme(name) {
  if (!THEMES[name]) return false;
  activeTheme = name; applyPalette(THEMES[name]);
  applyChrome(THEMES[name]);
  const sel = document.getElementById('theme-select');
  if (sel && sel.value !== name) sel.value = name;   // 드롭다운 표시 동기화(프로그램/단축키 전환 대비)
  try { localStorage.setItem('office.theme', name); } catch (e) { /* */ }
  return true;
}
window.officeTheme = { list: () => Object.keys(THEMES).map((k) => ({ key: k, label: THEMES[k].label })), set: setTheme, current: () => activeTheme };

// SCREEN·STATE_META·TAG_COLOR·STATE_GLYPH·SKINS·HAIRS·HAIRHI·SHIRTS → constants.mjs

// ---------- 상태 ----------
// highlightId → app-state · floorW/floorH/rooms/seatMap/walkers/speeches/cellRects/tagJobs/tagPlaced → world-state
let sessions = [];
let prevEffective = new Map();
let hideDone = false;
let zoneLabels = [];

// 충돌/보행 (obstacles/maxWalkers/speechCooldown 은 Step C 에서 world.mjs 로 이동 예정)
let obstacles = [];                // 통과 불가 영역 (논리 AABB)
// lastT/dtFrame → core/gfx.mjs (setTiming 으로 갱신)
let maxWalkers = 2;                // 동시 보행 인원 상한
// ROAM_TOP/WALK_SPEED → constants.mjs
let speechCooldown = 1500;

// 상황별 랜덤 대사 SAY → constants.mjs

// canvas/ctx → core/gfx.mjs (import)
const listEl = document.getElementById('list');
let searchQuery = '';                          // 세션 검색어
let statusFilter = 'all';                       // 상태 필터(all/working/blocked/stalled/done)
function initPanelTools() {
  const search = document.getElementById('sess-search');
  if (search) search.addEventListener('input', (e) => { searchQuery = e.target.value || ''; renderPanel(); });
  const chips = document.getElementById('filter-chips');
  if (chips) chips.addEventListener('click', (e) => {
    const btn = e.target.closest('.fchip'); if (!btn) return;
    statusFilter = btn.dataset.f || 'all';
    chips.querySelectorAll('.fchip').forEach((b) => b.classList.toggle('on', b === btn));
    renderPanel();
  });
}
initPanelTools();
const connEl = document.getElementById('conn');

// ---------- 유틸 ----------
// hash() → lib/hash.mjs
// lookOf() → lib/look.mjs · rel() → lib/format.mjs
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
// resetLabel() · usageColor() · freshnessLabel() → lib/format.mjs
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
  setHighlightId(s && s.id !== highlightId ? s.id : null);
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
  const podCols = Math.max(2, Math.min(7,
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

// shadow() · drawPlant() → render/primitives.mjs

// ---------- 가구 (애플 라운지 스타일) ----------
// 가구·가전·존·데코·히어로 그리기 → render/furniture.mjs
import {
  drawSofa, drawArmchair, drawCoffeeTable, drawRoundTable, drawBookshelf,
  drawPrinter, drawLocker, drawPhoneBooth, drawAreaRug, drawZone,
  drawCorridorDecor, drawInfraZone, drawQAZone, drawPerimeterDecor, HERO,
} from './render/furniture.mjs';

// ---------- iMac 모니터 ----------
// iMac 모니터·데스크·캐릭터 그리기 → render/characters.mjs
import {
  drawMonitorFront, drawLaptop, drawMonitorBack, drawMonitorOff, drawMonitorSide,
  drawDeskH, drawDeskV, deskClutterH, drawHead, drawBody,
} from './render/characters.mjs';

// ---------- 이름표 (가독성: 큰 폰트 + 보더 + 그림자) ----------
// pushTag() → core/world-state.mjs
function drawTags(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);            // 백킹 픽셀 공간 — 고정 크기는 k(=dpr)로 스케일
  const k = S / DISP;
  const fontTag = `600 ${12 * k}px -apple-system, "Apple SD Gothic Neo", sans-serif`;
  tagPlaced.clear();

  // 1) 측정
  const items = [];
  for (const j of tagJobs) {
    ctx.font = fontTag;
    let nm = j.s.name;
    while (nm.length > 4 && ctx.measureText(nm).width > 118 * k) nm = nm.slice(0, -2);
    if (nm !== j.s.name) nm += '…';
    const tw = ctx.measureText(nm).width;
    const working = j.s.effective === 'working';
    const bw = tw + 28 * k;                        // 좌측 상태 표식(점/글리프) 공간 항상 확보
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
    } else {                                      // 그 외: 상태별 흰 글리프(색맹 안전 이중부호화)
      const g = STATE_GLYPH[j.s.effective] || STATE_GLYPH.unknown;
      if (g) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `800 ${12 * k}px -apple-system, "Apple SD Gothic Neo", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(g, bx + 10 * k, by + 9.5 * k);
        ctx.textAlign = 'left';
      }
    }
    ctx.font = fontTag;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(it.nm, bx + 18 * k, by + 9.5 * k);
  }

  for (const z of zoneLabels) {
    ctx.font = `600 ${10 * k}px -apple-system, "Apple SD Gothic Neo", sans-serif`;
    ctx.fillStyle = 'rgba(110,116,128,.85)';
    ctx.fillText(z.text, z.x * S, z.y * S);
  }
}

// ---------- 충돌 / 보행 시스템 ----------
// podVariantB() · buildSeatMap() (+ seatAssignment·seatOrder) → lib/seating.mjs

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
      // GPU 랙 2개를 양끝에 — 넓은 중앙 통로 확보(이전 3개는 간격 3px라 마진 합치며 좌측이 통째로 막혀 갇힘)
      obstacles.push({ x: r.x + 10, y: r.y + 38, w: 16, h: 31 });
      obstacles.push({ x: r.x + r.w - 26, y: r.y + 38, w: 16, h: 31 });
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
  if (r.type === 'ailab') return [   // 모두 양끝 랙을 피해 중앙·하단 개방부에 배치(갇힘 방지)
    { x: cx, y: r.y + 72, kind: 'work' },         // 대시보드 앞(서서 보기)
    { x: cx - 22, y: r.y + 94, kind: 'work' },
    { x: cx + 22, y: r.y + 94, kind: 'work' },
    { x: cx, y: r.y + 106, kind: 'work' },
    { x: cx - 6, y: r.y + 84, kind: 'work' },
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
function activeWalkerCount() {
  let n = 0;
  for (const w of walkers.values()) if (w.mode !== 'sit') n++;
  return n;
}
const ZONE_CAP = 1;                  // 존당 동시 방문 walker 상한 — 1명으로 제한해 한쪽 쏠림 방지(상주 NPC 별개)
function zoneOccupancy(r) {
  let n = 0;   // 존으로 향하거나(out) 머무는(loiter) walker만 — 떠나는(back) walker는 제외
  for (const w of walkers.values()) if (w.roomRef === r && (w.mode === 'out' || w.mode === 'loiter')) n++;
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
// 경유점(path) 따라 이동 — 끼이면 비켜서기 → 경로 재계산 → 경유점 스킵 순으로 빠르게 복구
// 끼임 판단은 '경유점까지 최단거리(bestD) 갱신 여부'로 한다. 가로가 막혀 세로로만
// 미끄러지는 제자리 진동은 새 최단거리를 만들지 못하므로 정상적으로 끼임으로 집계된다.
function moveAlong(w, dt) {
  if (!w.path || !w.path.length) return true;
  const p = w.path[0];
  if (moveTo(w, p.x, p.y, dt)) {               // 경유점 도달 → 다음으로, 복구 상태 리셋
    w.path.shift(); w.noProg = 0; w.bestD = undefined; w.repathed = false; w.side = 0;
    return !w.path.length;
  }
  const d = Math.hypot(p.x - w.x, p.y - w.y);
  if (w.bestD === undefined || d < w.bestD - 0.5) { w.bestD = d; w.noProg = 0; w.side = 0; }
  else w.noProg = (w.noProg || 0) + dt;        // 더 가까워지지 못하면 끼임 누적

  if (w.noProg > 350) {                          // 1) 진행 방향에 수직으로 비켜서기(모서리 끼임 해소)
    const dx = p.x - w.x, dy = p.y - w.y;
    if (!w.side) w.side = Math.random() < 0.5 ? 1 : -1;
    let nx = 0, ny = 0;
    if (Math.abs(dx) >= Math.abs(dy)) ny = w.side * 3; else nx = w.side * 3;
    if (!blocked(w.x + nx, w.y + ny)) { w.x += nx; w.y += ny; }
    else { w.side = -w.side; }                  // 막히면 반대쪽 시도
  }
  if (w.noProg > 900 && !w.repathed) {          // 2) 현재 위치 → 목적지로 경로 재계산
    const goal = w.path[w.path.length - 1];
    const np = pathFind(w.x, w.y, goal.x, goal.y);
    if (np && np.length) { w.path = np; w.repathed = true; w.noProg = 0; w.bestD = undefined; w.side = 0; }
  }
  if (w.noProg > 1700) {                         // 3) 최후: 경유점 건너뜀
    w.path.shift(); w.noProg = 0; w.bestD = undefined; w.repathed = false; w.side = 0;
    if (!w.path.length) return true;
  }
  return false;
}
function startBack(w) {
  w.path = pathFind(w.x, w.y, w.hx, w.hy) || [{ x: w.hx, y: w.hy }];
  w.mode = 'back'; w.stuck = 0; w.noProg = 0; w.bestD = undefined; w.repathed = false; w.side = 0;
  if (w.sid) speeches.delete(w.sid);   // 방 대사 버블이 복귀 중 잔류하지 않도록
}
function tickWalker(w, eff, dt) {
  const eligible = eff !== 'working';   // 작업중이면 자리 지킴
  // 탈출 안전망: 자리를 벗어난 채 너무 오래(28s) 헤매면(가구 틈에 갇혀 진동하는 경우 등)
  // 강제로 자리 복귀. 진동 시 w.stuck 이 리셋돼 못 잡는 케이스를 벽시계로 보강.
  if (w.mode !== 'sit') {
    w.outMs = (w.outMs || 0) + dt;
    if (w.outMs > 28000) {
      w.x = w.hx; w.y = w.hy; w.roomRef = null; w.path = null;
      w.mode = 'sit'; w.timer = 10000 + Math.random() * 22000; w.outMs = 0;
      if (w.sid) speeches.delete(w.sid);
      return;
    }
  } else { w.outMs = 0; }
  if (w.mode === 'sit') {
    w.timer -= dt;
    if (w.timer <= 0) {
      let started = false;
      if (eligible && activeWalkerCount() < maxWalkers && Math.random() < 0.6) {
        if (rooms.length && Math.random() < 0.7) {     // 존 방문
          // 존 선택: 정원 미달 존 중 '균등 랜덤' → 네 존(AI Lab/Collab/Cafe/Focus)에 고르게 분산.
          // (과거엔 done/blocked/stalled 대다수가 70% 확률로 cafe에 쏠리고 overflow가 인접
          //  AI Lab으로만 빠져 좌측 클러스터가 고착됐음. 동시 로밍 인원이 보통 1명이라
          //  상태 친화 보너스를 두면 매번 같은 존으로 수렴 → 편향 제거. cafe가 뽑히면 POI 취향만 반영)
          const cands = rooms.filter((z) => zoneOccupancy(z) < ZONE_CAP);   // 정원 미달 존만
          let r = null, prefKind = null;
          if (cands.length) {
            r = cands[Math.floor(Math.random() * cands.length)];
            if (r.type === 'cafe') prefKind = eff === 'blocked' ? 'coffee' : eff === 'done' ? 'sofa' : eff === 'stalled' ? 'rest' : null;
          }
          let pois = r ? roomPOIs(r).filter((p) => !blocked(p.x, p.y)) : [];
          if (prefKind) {
            const pref = pois.filter((p) => p.kind === prefKind);
            if (pref.length && Math.random() < 0.75) pois = pref;
          }
          if (pois.length) {
            const poi = pois[Math.floor(Math.random() * pois.length)];
            const jx = Math.random() * 10 - 5, jy = Math.random() * 8 - 4;   // 같은 지점 겹침 방지
            const path = pathFind(w.x, w.y, poi.x + jx, poi.y + jy);
            if (path) { w.roomRef = r; w.path = path; w.mode = 'out'; w.stuck = 0; w.noProg = 0; w.bestD = undefined; started = true; }
          }
        }
        if (!started) {                                // 복도 산책
          const tgt = pickRoamTarget(w.hx, w.hy, 30);
          if (tgt) {
            const path = pathFind(w.x, w.y, tgt.x, tgt.y);
            if (path) { w.roomRef = null; w.path = path; w.mode = 'out'; w.stuck = 0; w.noProg = 0; w.bestD = undefined; started = true; }
          }
        }
      }
      if (!started) w.timer = eligible ? 3000 : 12000 + Math.random() * 28000;
    }
  } else if (w.mode === 'out') {
    if (!eligible) startBack(w);
    else if (moveAlong(w, dt)) { w.mode = 'loiter'; w.timer = 5200 + Math.random() * 6000; }
  } else if (w.mode === 'loiter') {
    w.timer -= dt;                            // 체류시간 상한(산책 중에도 감소 → 오래 안 머묾)
    if (!eligible || w.timer <= 0) { startBack(w); }
    else if (w.path && w.path.length) {       // 방 안 산책 이동 중
      moveAlong(w, dt);
    } else if (w.roomRef && Math.random() < 0.01) {   // 가끔 방 안 다른 지점으로 걸어감
      const pois = roomPOIs(w.roomRef).filter((p) => !blocked(p.x, p.y));
      if (pois.length) {
        const poi = pois[Math.floor(Math.random() * pois.length)];
        const p = pathFind(w.x, w.y, poi.x + (Math.random() * 10 - 5), poi.y + (Math.random() * 8 - 4));
        if (p && p.length) { w.path = p; w.noProg = 0; w.bestD = undefined; w.repathed = false; w.side = 0; }
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
    if (z.type === 'ailab') { add(cx - 16, z.y + 84, 'up', 'work'); add(cx + 16, z.y + 86, 'up', 'work'); }
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
  if (!speechOn) { if (speeches.size) speeches.clear(); return; }
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

// 빈 슬롯 러그(바닥) — 데코/가구보다 먼저 깔아 오브젝트가 러그에 묻히지 않게 함
function drawEmptySlotFloor(px, py) {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  drawAreaRug(px + 10, py + 14, POD_W - 20, POD_H - 30, TH.bg.lounge[0], TH.bg.lounge[1]); // 라운지 러그
}
// 빈 슬롯 가구: 라운지 비네트 (자유 배치의 빈 공간 채움) — 러그 위에 그림
function drawEmptySlot(px, py, idx) {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  const cx = px + POD_W / 2, cy = py + 34;
  const h = hash('empty' + idx);
  const v = h % 5;
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

// roundRect() · roundRectStroke() → render/primitives.mjs

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
  setTiming(t, lastT ? Math.min(60, t - lastT) : 16);
  // 고DPI 선명도: 백킹은 devicePixelRatio만큼 더 높게 렌더, 표시 크기는 DISP로 고정
  setScale(DISP * Math.min(window.devicePixelRatio || 1, 3));
  const vis = visible();
  const layout = computeLayout(vis.length);
  setFloor(layout.W, layout.H);
  // 존 기하 — 상단을 4개 존(AI Lab / Collaboration / Cafe·Break / Focus Booth)이 밀착해 차지
  const innerW = layout.W - WALL * 2;
  const zAi = Math.round(innerW * 0.28), zCo = Math.round(innerW * 0.22), zCa = Math.round(innerW * 0.28);
  const zx = WALL;
  setRooms([
    { type: 'ailab',  label: 'AI Lab',        floor: TH.zoneFloors.ailab,  x: zx,                 y: TOP_WALL, w: zAi, h: ZONE_H },
    { type: 'collab', label: 'Collaboration', floor: TH.zoneFloors.collab, x: zx + zAi,           y: TOP_WALL, w: zCo, h: ZONE_H },
    { type: 'cafe',   label: 'Cafe · Break',  floor: TH.zoneFloors.cafe,   x: zx + zAi + zCo,     y: TOP_WALL, w: zCa, h: ZONE_H },
    { type: 'focus',  label: 'Focus Booth',   floor: TH.zoneFloors.focus,  x: zx + zAi + zCo + zCa, y: TOP_WALL, w: layout.W - WALL - (zx + zAi + zCo + zCa), h: ZONE_H },
  ]);
  setSeatMap(buildSeatMap(vis, layout.pods));   // 1~4명 다양한 좌석 배정
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
  ctx.fillStyle = TH.bg.dev;
  ctx.fillRect(WALL, devTop, innerWf, layout.bottomTop - devTop);
  drawAreaRug(WALL + 2, devTop, innerWf - 4, layout.bottomTop - devTop - 2, TH.bg.devRug[0], TH.bg.devRug[1]); // Dev 카펫(벽까지)

  // 하단 밴드: Infrastructure Zone(좌) / QA Zone(우)
  const by = layout.bottomTop, bh = layout.bottomH - WALL;
  ctx.fillStyle = TH.bg.infra; ctx.fillRect(WALL, by, midX - WALL, bh);          // Infra 바닥
  ctx.fillStyle = TH.bg.qa; ctx.fillRect(midX, by, layout.W - WALL - midX, bh); // QA 바닥
  ctx.fillStyle = TH.bg.divider; ctx.fillRect(midX - 1, by + 6, 2, bh - 12); // 구분선

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

  cellRects.length = 0;
  tagJobs.length = 0;

  // ── 바닥(러그) 패스 — 데코·가구보다 먼저 깔아 오브젝트가 러그에 묻히지 않게 함 ──
  // pod 러그 + 빈슬롯 러그를 모두 최하단에 둔다(좌우 페리미터/복도 데코를 덮던 버그 제거)
  for (let p = 0; p < layout.pods; p++) {
    drawPod(p, layout.podPos[p].x, layout.podPos[p].y, seatMap[p] || [], t, 'floor');
  }
  for (let e = 0; e < layout.emptySlots.length; e++) {
    drawEmptySlotFloor(layout.emptySlots[e].x, layout.emptySlots[e].y);
  }

  // ── 데코·가구 패스 — 러그 위에 ──
  drawCorridorDecor(layout, blocked);
  drawPerimeterDecor(layout, blocked);
  // 테마 히어로 오브젝트: 가장 중앙(수평)에 가까운 빈 슬롯에 큼직하게 배치(쇼피스 가시성↑)
  const heroFn = HERO[activeTheme];
  let heroIdx = -1;
  if (heroFn && layout.emptySlots.length) {
    const cxF = layout.W / 2; let best = Infinity;
    layout.emptySlots.forEach((s, i) => { const d = Math.abs(s.x + POD_W / 2 - cxF); if (d < best) { best = d; heroIdx = i; } });
  }
  for (let e = 0; e < layout.emptySlots.length; e++) {
    const s = layout.emptySlots[e];
    if (e === heroIdx) { ctx.setTransform(S, 0, 0, S, 0, 0); heroFn(s.x + POD_W / 2, s.y + 46); }
    else drawEmptySlot(s.x, s.y, e);
  }

  tickWalkers(vis);               // 보행 로직 갱신(그리기는 아래 깊이정렬에서)

  // 깊이정렬: pod를 back(뒷줄+책상)/front(앞줄) 밴드로 쪼개고 보행 캐릭터를 발끝 Y로 섞어 그림
  // → 책상 뒤(위쪽) 캐릭터는 가려지고, 앞(아래쪽)이면 위로. 러그/책상이 캐릭터를 묻는 현상 제거
  tickPlayer(dtFrame);            // 플레이어(방향키 조작) 이동

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
  if (player.spawned) actors.push({ y: player.y + 17, draw: () => drawPlayer(t) });
  actors.sort((a, b) => a.y - b.y);
  for (const a of actors) a.draw();

  updatePlayerTarget();           // 근접한 세션 캐릭터 탐색(cellRects 채워진 뒤)
  drawPlayerHint(t);              // 머리 위 안내(다가가면 'Enter: 말 걸기')

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

// ---------- 플레이어 아바타 (방향키 조작 + 세션에게 말 걸기) ----------
const player = { x: 0, y: 0, facing: 'down', spawned: false, near: null };
// keys/talking/talkTarget/settingsOpen → core/app-state.mjs
const PLAYER_LOOK = { skin: '#ffdbac', hair: '#1f1f24', hairHi: '#3a3a42', shirt: '#e84a8a', deskKind: 0, hairStyle: 3, glasses: false, headphone: false, collar: true, phase: 0 };
const PLAYER_SPEED = 0.08;           // 기준 논리px/ms (속도 설정 배수가 곱해짐)
// 이동 속도 프리셋 — 설정에서 선택, localStorage('office.speed') 영속. Shift=일시 질주(×1.6)
const SPEEDS = [
  { key: 'stroll', label: '🚶 산책', mul: 0.6 },
  { key: 'normal', label: '🚶‍♂️ 보통', mul: 1.0 },
  { key: 'fast', label: '🏃 빠름', mul: 1.8 },
  { key: 'turbo', label: '⚡ 질주', mul: 3.0 },
];
function resolveSpeed() {
  try { const k = localStorage.getItem('office.speed'); const f = SPEEDS.find((s) => s.key === k); if (f) return f; } catch (e) { /* */ }
  return SPEEDS[1];
}
let speedSetting = resolveSpeed();
function setSpeed(key) {
  const f = SPEEDS.find((s) => s.key === key);
  if (!f) return;
  speedSetting = f;
  try { localStorage.setItem('office.speed', key); } catch (e) { /* */ }
  const sel = document.getElementById('speed-select');
  if (sel && sel.value !== key) sel.value = key;
}

// 세션 패널 자동 갱신 주기 — 설정에서 선택, localStorage('office.refresh') 영속
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

function ensurePlayerVisible() {        // 이동 시 플레이어를 화면 안으로 스크롤(스폰이 화면 밖이어도 보이게)
  const wrap = document.getElementById('canvas-wrap');
  if (!wrap || !wrap.clientHeight) return;
  const mx = 90, my = 90, px = player.x * DISP, py = player.y * DISP;
  if (px < wrap.scrollLeft + mx) wrap.scrollLeft = px - mx;
  else if (px > wrap.scrollLeft + wrap.clientWidth - mx) wrap.scrollLeft = px - wrap.clientWidth + mx;
  if (py < wrap.scrollTop + my) wrap.scrollTop = py - my;
  else if (py > wrap.scrollTop + wrap.clientHeight - my) wrap.scrollTop = py - wrap.clientHeight + my;
}
function spawnPlayer() {
  const wrap = document.getElementById('canvas-wrap');
  let cx0 = floorW / 2, cy0 = floorH - 90;
  if (wrap && wrap.clientHeight) {       // 현재 보이는 영역 중앙 근처에 스폰
    cx0 = (wrap.scrollLeft + wrap.clientWidth / 2) / DISP;
    cy0 = (wrap.scrollTop + wrap.clientHeight / 2) / DISP;
  }
  for (let r = 0; r < 240; r += 7) {
    for (let a = 0; a < 12; a++) {
      const x = cx0 + Math.cos(a / 12 * Math.PI * 2) * r, y = cy0 + Math.sin(a / 12 * Math.PI * 2) * r;
      if (x > WALL + 6 && x < floorW - WALL - 6 && y > ROAM_TOP && y < floorH - WALL - 6 && !blocked(x, y)) {
        player.x = x; player.y = y; player.spawned = true; return;
      }
    }
  }
  player.x = WALL + 30; player.y = ROAM_TOP + 30; player.spawned = true;
}
function tickPlayer(dt) {
  if (!player.spawned) { if (floorW) { spawnPlayer(); ensurePlayerVisible(); } return; }
  player.x = Math.max(WALL + 4, Math.min(floorW - WALL - 4, player.x));   // 레이아웃 변경 대비 클램프
  player.y = Math.max(TOP_WALL + 6, Math.min(floorH - WALL - 4, player.y));
  if (talking || settingsOpen) return;
  let dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  let dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  if (!dx && !dy) return;
  const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
  player.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
  const spd = PLAYER_SPEED * speedSetting.mul * (keys.sprint ? 1.6 : 1);
  let rem = Math.min(spd * dt, 14);    // 프레임당 상한(긴 프레임 점프 방지; 서브스텝이 관통 막음)
  // 갇힘 탈출: 레이아웃 재계산으로 책상/가구가 현재 위치를 덮으면 주변이 모두 막혀 못 나옴.
  // 현재 위치가 막혀 있으면 충돌을 무시하고 요청 방향으로 자유 이동 → 빠져나오면 충돌 복구.
  const escaping = blocked(player.x, player.y);
  while (rem > 0.01) {                 // 서브스텝 충돌(벽 관통 방지)
    const s = Math.min(1.2, rem); rem -= s;
    if (escaping) { player.x += dx * s; player.y += dy * s; }   // 자유 이동(탈출)
    else {
      if (!blocked(player.x + dx * s, player.y)) player.x += dx * s;
      if (!blocked(player.x, player.y + dy * s)) player.y += dy * s;
    }
  }
  ensurePlayerVisible();               // 이동분을 화면 안으로 따라오게
}
function drawPlayer(t) {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  const moving = (keys.up || keys.down || keys.left || keys.right) && !talking;
  drawWalkPerson(player.x, player.y, PLAYER_LOOK, player.facing, t, moving);
  const cx = Math.round(player.x), ty = Math.round(player.y);   // 머리 위 핀(나)
  ctx.fillStyle = '#e84a8a'; ctx.fillRect(cx - 1, ty - 10, 2, 4);
  ctx.beginPath(); ctx.arc(cx, ty - 11, 2.5, 0, Math.PI * 2); ctx.fill();
}
function updatePlayerTarget() {        // cellRects(세션 캐릭터 박스)에서 최근접 탐색
  if (!player.spawned) { player.near = null; return; }
  let best = null, bd = 30 * 30;
  for (const c of cellRects) {
    const d = (c.x + c.w / 2 - player.x) ** 2 + (c.y + c.h / 2 - player.y) ** 2;
    if (d < bd) { bd = d; best = c.s; }
  }
  player.near = best;
}
function drawPlayerHint(t) {
  if (!player.spawned || talking || !player.near) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const k = S / DISP;
  const text = `Enter · ${player.near.name} 내용 보기`;
  ctx.font = `600 ${11 * k}px -apple-system, "Apple SD Gothic Neo", sans-serif`;
  const tw = ctx.measureText(text).width, bw = tw + 16 * k, bh = 19 * k;
  const bx = player.x * S - bw / 2, by = (player.y - 28) * S;
  ctx.fillStyle = 'rgba(18,20,26,.92)'; roundRect(bx, by, bw, bh, 9 * k);
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + 8 * k, by + bh / 2 + 0.5 * k);
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
// fmtTime() · toolShortName() · fmtTokens() · fmtElapsed() → lib/format.mjs
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
// 변화 감지용 시그니처(상태·현재작업·메시지 수·마지막 메시지 꼬리)
// sessionSig() → lib/sig.mjs
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
async function openTalk(s) {                 // (이름 유지) 세션 패널 열기 + 라이브 갱신 시작
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
function closeTalk() {                        // (이름 유지) 세션 패널 닫기 + 갱신 중지
  setTalking(false); setTalkTarget(null); sessionData = null;
  if (sessionTimer) { clearInterval(sessionTimer); sessionTimer = null; }
  const ov = document.getElementById('session');
  if (ov) ov.style.display = 'none';
}
// 설정 패널 — , 키 또는 헤더 ⚙ 버튼으로 토글(Mac 기본 Cmd+,와 충돌 없음). 설정 행은 index.html .set-row 추가.
function openSettings() {
  setSettingsOpen(true);
  keys.up = keys.down = keys.left = keys.right = keys.sprint = false;
  const ov = document.getElementById('settings'); if (ov) ov.style.display = 'flex';
}
function closeSettings() {
  setSettingsOpen(false);
  const ov = document.getElementById('settings'); if (ov) ov.style.display = 'none';
}
function isTyping(el) { return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'); }
// 물리 키(e.code) 우선 판정 → 한글 IME 등에서 e.key 가 자모로 바뀌어도 WASD/단축키 동작.
function keyId(e) {
  switch (e.code) {
    case 'ArrowUp': case 'KeyW': return 'up';
    case 'ArrowDown': case 'KeyS': return 'down';
    case 'ArrowLeft': case 'KeyA': return 'left';
    case 'ArrowRight': case 'KeyD': return 'right';
    case 'Enter': case 'NumpadEnter': case 'Space': return 'talk';
    case 'Comma': return 'settings';
    case 'ShiftLeft': case 'ShiftRight': return 'sprint';
    case 'Escape': return 'esc';
  }
  switch (e.key) {                       // e.code 미지원 환경 폴백
    case 'ArrowUp': return 'up'; case 'ArrowDown': return 'down';
    case 'ArrowLeft': return 'left'; case 'ArrowRight': return 'right';
    case 'Enter': case ' ': return 'talk'; case ',': return 'settings';
    case 'Shift': return 'sprint'; case 'Escape': return 'esc';
  }
  return null;
}
function initPlayerControls() {
  window.addEventListener('keydown', (e) => {
    const a = keyId(e);
    if (isTyping(document.activeElement)) {                       // 입력/셀렉트 포커스: 이동 차단
      if (a === 'esc' && settingsOpen) closeSettings();           // 설정 select 포커스 중 Esc 닫기
      return;
    }
    if (settingsOpen) {                                           // 설정 열림 → 닫기 키만
      if (a === 'settings' || a === 'esc') { e.preventDefault(); closeSettings(); }
      return;
    }
    if (talking) {                                                // 세션 패널 열림 → 닫기 키만(이동 차단)
      if (a === 'esc' || a === 'talk') { e.preventDefault(); closeTalk(); }
      return;
    }
    if (!a) return;
    if (a === 'up') keys.up = true;
    else if (a === 'down') keys.down = true;
    else if (a === 'left') keys.left = true;
    else if (a === 'right') keys.right = true;
    else if (a === 'sprint') { keys.sprint = true; return; }      // Shift 는 preventDefault 안 함
    else if (a === 'talk') { if (player.near) openTalk(player.near); }
    else if (a === 'settings') openSettings();
    else if (a === 'esc') return;
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    const a = keyId(e);
    if (a === 'up') keys.up = false;
    else if (a === 'down') keys.down = false;
    else if (a === 'left') keys.left = false;
    else if (a === 'right') keys.right = false;
    else if (a === 'sprint') keys.sprint = false;
  });
  // 속도 설정 드롭다운
  const sp = document.getElementById('speed-select');
  if (sp) {
    sp.innerHTML = '';
    for (const s of SPEEDS) { const o = document.createElement('option'); o.value = s.key; o.textContent = s.label; sp.appendChild(o); }
    sp.value = speedSetting.key;
    sp.addEventListener('change', (e) => setSpeed(e.target.value));
  }
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
initPlayerControls();

// ---------- 테마 초기화 + 드롭다운 ----------
function initThemeUI() {
  applyChrome(TH);                        // 저장된 테마의 페이지 크롬 적용
  const sel = document.getElementById('theme-select');
  if (!sel) return;
  sel.innerHTML = '';
  for (const t of window.officeTheme.list()) {
    const o = document.createElement('option');
    o.value = t.key; o.textContent = t.label;
    sel.appendChild(o);
  }
  sel.value = activeTheme;
  sel.addEventListener('change', (e) => { setTheme(e.target.value); });  // 캔버스는 매 프레임 C/TH 참조 → 즉시 반영
}
initThemeUI();

// Claude 서비스 상태 → claude-status.mjs (side-effect import: 자동 기동)
import './claude-status.mjs';

setInterval(renderPanel, 30000);
connect();
requestAnimationFrame(frame);

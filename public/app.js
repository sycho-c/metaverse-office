/* Claude Office — Canvas 픽셀 오피스 렌더러
 * 애플 스타일 오피스: 화이트+라이트 오크+알루미늄, iMac 데스크, 자유 배치 클러스터 */
'use strict';

// ---------- 순수 로직 모듈 (테스트 대상, public/lib/*.mjs) ----------
import { hash } from './lib/hash.mjs';
import { podVariantB } from './lib/seating.mjs';
import { sessionSig } from './lib/sig.mjs';
import { lookOf } from './lib/look.mjs';
import { rel, resetLabel, usageColor, freshnessLabel, fmtTime, toolShortName, fmtTokens, fmtElapsed } from './lib/format.mjs';

// ---------- 공유 렌더 컨텍스트 (core/gfx.mjs) ----------
// canvas/ctx/C/TH/S/lastT/dtFrame 는 gfx 가 소유하는 live binding. 재할당은 setter 경유.
import { canvas, ctx, S, C, TH, lastT, dtFrame, setScale, setTiming, applyPalette } from './core/gfx.mjs';
import { shadow, drawPlant, roundRect, roundRectStroke } from './render/primitives.mjs';

// ---------- 공유 가변 상태 허브 (core/world-state.mjs · core/app-state.mjs) ----------
import {
  rooms, seatMap, walkers, speeches, speechOn, setSpeechOn,
  tagJobs, tagPlaced, cellRects, pushTag,
} from './core/world-state.mjs';
import {
  highlightId, setHighlightId, talking, setTalking, talkTarget, setTalkTarget,
  settingsOpen, setSettingsOpen, keys,
} from './core/app-state.mjs';

// ---------- 월드 시뮬레이션 (world.mjs) ----------
import {
  rebuildWorld, blocked, ensureWalker,
  tickWalkers, drawWalker, computeAmbient, drawAmbientPerson,
  tickSpeech, drawSpeech, drawCat,
} from './world.mjs';

// ---------- 플레이어 아바타 (player.mjs) ----------
import {
  player, tickPlayer, drawPlayer, updatePlayerTarget, drawPlayerHint,
  SPEEDS, setSpeed, speedSetting, keyId, isTyping,
} from './player.mjs';

// ---------- 불변 상수 → constants.mjs ----------
import {
  DISP, POD_W, POD_H, AISLE_X, AISLE_Y, WALL, TOP_WALL, ZONE_H, CORRIDOR_H,
  STATE_META, TAG_COLOR, STATE_GLYPH,
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
// obstacles/maxWalkers/speechCooldown/grid/cat → world.mjs (월드 내부 상태)
let sessions = [];
let prevEffective = new Map();
let hideDone = false;
let zoneLabels = [];

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


// ---------- 메인 루프 ----------
function frame(t) {
  setTiming(t, lastT ? Math.min(60, t - lastT) : 16);
  // 고DPI 선명도: 백킹은 devicePixelRatio만큼 더 높게 렌더, 표시 크기는 DISP로 고정
  setScale(DISP * Math.min(window.devicePixelRatio || 1, 3));
  const vis = visible();
  const layout = computeLayout(vis.length);
  rebuildWorld(layout, vis);                   // 존 기하 + 좌석 배정 + 충돌영역 + 경로탐색 격자 갱신
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

// ---------- 플레이어 아바타 → player.mjs (입력 이벤트 배선은 initPlayerControls 가 main 에서 담당) ----------

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

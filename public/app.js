/* Claude Office — Canvas 픽셀 오피스 렌더러
 * 애플 스타일 오피스: 화이트+라이트 오크+알루미늄, iMac 데스크, 자유 배치 클러스터 */
'use strict';

// ---------- 순수 로직 모듈 (테스트 대상, public/lib/*.mjs) ----------
import { hash } from './lib/hash.mjs';
import { podVariantB } from './lib/seating.mjs';
import { lookOf } from './lib/look.mjs';

// ---------- 공유 렌더 컨텍스트 (core/gfx.mjs) ----------
// canvas/ctx/C/TH/S/lastT/dtFrame 는 gfx 가 소유하는 live binding. 재할당은 setter 경유.
import { canvas, ctx, S, C, TH, lastT, dtFrame, setScale, setTiming, applyPalette } from './core/gfx.mjs';
import { shadow, drawPlant, roundRect, roundRectStroke } from './render/primitives.mjs';

// ---------- 공유 가변 상태 허브 (core/world-state.mjs · core/app-state.mjs) ----------
import {
  rooms, seatMap, walkers, tagJobs, tagPlaced, cellRects, pushTag,
} from './core/world-state.mjs';
import {
  highlightId, setHighlightId, talking, settingsOpen, keys, sessions,
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

// ---------- UI 패널·설정·사용량·알림·SSE (ui/panel.mjs) ----------
import {
  connect, renderPanel, openTalk, closeTalk, openSettings, closeSettings, initPanelTools,
} from './ui/panel.mjs';

// ---------- 불변 상수 → constants.mjs ----------
import {
  DISP, POD_W, POD_H, AISLE_X, AISLE_Y, WALL, TOP_WALL, ZONE_H, CORRIDOR_H,
  TAG_COLOR, STATE_GLYPH,
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
// sessions/highlightId/talking/settingsOpen/keys → app-state · rooms/seatMap/walkers/cellRects/tagJobs/tagPlaced → world-state
// obstacles/maxWalkers/speechCooldown/grid/cat → world.mjs · 세션패널 상태(prevEffective 등) → ui/panel.mjs
let hideDone = false;
let zoneLabels = [];

// 상황별 랜덤 대사 SAY → constants.mjs

// canvas/ctx → core/gfx.mjs (import)

// ---------- 유틸 ----------
// hash() → lib/hash.mjs
// lookOf() → lib/look.mjs · rel() → lib/format.mjs
function visible() {
  return hideDone ? sessions.filter((s) => s.effective !== 'done') : sessions;
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
  // 속도 설정 드롭다운 (그 외 패널/설정/갱신/대사/알림 배선은 ui 의 initPanelTools)
  const sp = document.getElementById('speed-select');
  if (sp) {
    sp.innerHTML = '';
    for (const s of SPEEDS) { const o = document.createElement('option'); o.value = s.key; o.textContent = s.label; sp.appendChild(o); }
    sp.value = speedSetting.key;
    sp.addEventListener('change', (e) => setSpeed(e.target.value));
  }
}
initPanelTools();
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

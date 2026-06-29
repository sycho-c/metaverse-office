// world.mjs — 충돌 / 경로탐색 / 보행 / 앰비언트 NPC / 대사 / 고양이 (월드 시뮬레이션)
// 공유 상태(floor/rooms/seatMap/walkers/speeches/speechOn + 태그·셀 레이어)는 core/world-state.mjs 가 소유.
// obstacles/grid/maxWalkers/speechCooldown/cat 은 월드 내부 상태(이 모듈 전용).
import { ctx, C, TH, S, dtFrame } from './core/gfx.mjs';
import { WALL, TOP_WALL, ZONE_H, ROAM_TOP, WALK_SPEED, POD_W, POD_H, DISP, SAY } from './constants.mjs';
import { lookOf } from './lib/look.mjs';
import { buildSeatMap, podVariantB } from './lib/seating.mjs';
import { drawHead } from './render/characters.mjs';
import { shadow, roundRect } from './render/primitives.mjs';
import {
  floorW, floorH, setFloor, rooms, setRooms, setSeatMap,
  seatMap, walkers, speeches, speechOn, tagPlaced, cellRects, pushTag,
} from './core/world-state.mjs';

// ---------- 월드 내부 상태 ----------
let obstacles = [];                 // 통과 불가 영역 (논리 AABB)
let maxWalkers = 2;                 // 동시 보행 인원 상한
let speechCooldown = 1500;

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

export function blocked(x, y) {
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

export function ensureWalker(s, hx, hy, facing) {
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
export function drawWalkPerson(cx, topY, look, dir, t, moving) {
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
export function computeAmbient() {
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
export function drawAmbientPerson(n, t) {
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
export function tickWalkers(vis) {
  const ids = new Set(vis.map((s) => s.id));
  for (const id of walkers.keys()) if (!ids.has(id)) walkers.delete(id);
  maxWalkers = Math.max(1, Math.round(vis.length / 6));
  for (const s of vis) {
    const w = walkers.get(s.id);
    if (w) tickWalker(w, s.effective, dtFrame);
  }
}
export function drawWalker(s, w, t) {
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
export function tickSpeech(vis, t) {
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
export function drawSpeech(t) {
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

// ---------- 사무실 고양이 (충돌 회피) ----------
const cat = { x: 80, y: ROAM_TOP + 30, tx: 120, ty: ROAM_TOP + 60, flip: false, stuck: 0 };
export function drawCat(t) {
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

// ---------- 월드 재구성 (frame 이 매 프레임 1회 호출) ----------
// 존 기하 + 좌석 배정 + 충돌영역 + 경로탐색 격자를 한 번에 갱신.
// frame 은 이후 world-state 의 rooms/seatMap(live binding) 을 읽어 drawZone/drawPod.
export function rebuildWorld(layout, vis) {
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
  buildGrid();                                  // 경로탐색 격자(레이아웃 변경 시 갱신)
}

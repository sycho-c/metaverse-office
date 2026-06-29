// player.mjs — 플레이어 아바타(방향키 조작 + 세션 근접 탐색) 의 상태·이동·렌더.
// 입력 이벤트 배선(keydown/keyup·드롭다운)은 메인(부트)이 담당 — 이 모듈은 로직/렌더만 노출.
import { ctx, S } from './core/gfx.mjs';
import { WALL, TOP_WALL, ROAM_TOP, DISP } from './constants.mjs';
import { keys, talking, settingsOpen } from './core/app-state.mjs';
import { blocked, drawWalkPerson } from './world.mjs';
import { floorW, floorH, cellRects } from './core/world-state.mjs';
import { roundRect } from './render/primitives.mjs';

export const player = { x: 0, y: 0, facing: 'down', spawned: false, near: null };
const PLAYER_LOOK = { skin: '#ffdbac', hair: '#1f1f24', hairHi: '#3a3a42', shirt: '#e84a8a', deskKind: 0, hairStyle: 3, glasses: false, headphone: false, collar: true, phase: 0 };
const PLAYER_SPEED = 0.08;           // 기준 논리px/ms (속도 설정 배수가 곱해짐)
// 이동 속도 프리셋 — 설정에서 선택, localStorage('office.speed') 영속. Shift=일시 질주(×1.6)
export const SPEEDS = [
  { key: 'stroll', label: '🚶 산책', mul: 0.6 },
  { key: 'normal', label: '🚶‍♂️ 보통', mul: 1.0 },
  { key: 'fast', label: '🏃 빠름', mul: 1.8 },
  { key: 'turbo', label: '⚡ 질주', mul: 3.0 },
];
function resolveSpeed() {
  try { const k = localStorage.getItem('office.speed'); const f = SPEEDS.find((s) => s.key === k); if (f) return f; } catch (e) { /* */ }
  return SPEEDS[1];
}
export let speedSetting = resolveSpeed();
export function setSpeed(key) {
  const f = SPEEDS.find((s) => s.key === key);
  if (!f) return;
  speedSetting = f;
  try { localStorage.setItem('office.speed', key); } catch (e) { /* */ }
  const sel = document.getElementById('speed-select');
  if (sel && sel.value !== key) sel.value = key;
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
export function tickPlayer(dt) {
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
export function drawPlayer(t) {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  const moving = (keys.up || keys.down || keys.left || keys.right) && !talking;
  drawWalkPerson(player.x, player.y, PLAYER_LOOK, player.facing, t, moving);
  const cx = Math.round(player.x), ty = Math.round(player.y);   // 머리 위 핀(나)
  ctx.fillStyle = '#e84a8a'; ctx.fillRect(cx - 1, ty - 10, 2, 4);
  ctx.beginPath(); ctx.arc(cx, ty - 11, 2.5, 0, Math.PI * 2); ctx.fill();
}
export function updatePlayerTarget() {        // cellRects(세션 캐릭터 박스)에서 최근접 탐색
  if (!player.spawned) { player.near = null; return; }
  let best = null, bd = 30 * 30;
  for (const c of cellRects) {
    const d = (c.x + c.w / 2 - player.x) ** 2 + (c.y + c.h / 2 - player.y) ** 2;
    if (d < bd) { bd = d; best = c.s; }
  }
  player.near = best;
}
export function drawPlayerHint(t) {
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

export function isTyping(el) { return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'); }
// 물리 키(e.code) 우선 판정 → 한글 IME 등에서 e.key 가 자모로 바뀌어도 WASD/단축키 동작.
export function keyId(e) {
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

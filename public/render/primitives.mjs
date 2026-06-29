// render/primitives.mjs — 모든 그리기가 공유하는 leaf 헬퍼(둥근 사각형·그림자·화분).
// gfx 의 ctx/C 만 의존. 다른 그리기 모듈이 import 해 사용.
import { ctx, C } from '../core/gfx.mjs';

export function shadow(cx, cy, w, h) {
  ctx.fillStyle = C.shadow;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawPlant(x, y, big) {
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

export function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.fill();
}

export function roundRectStroke(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.stroke();
}

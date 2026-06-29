// render/characters.mjs — iMac 모니터·데스크·캐릭터(머리/몸) 그리기.
// gfx(ctx/C) + primitives(shadow) + 상태 의미색(SCREEN) 만 의존.
import { ctx, C } from '../core/gfx.mjs';
import { shadow } from './primitives.mjs';
import { SCREEN } from '../constants.mjs';

export function drawMonitorFront(mx, my, eff, t) {
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
export function drawLaptop(mx, my, eff) {
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
export function drawMonitorBack(mx, my, eff) {
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
export function drawMonitorOff(mx, my, back) {       // 빈 좌석: 꺼진 모니터
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
export function drawMonitorSide(x, y, eff, face) {
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
export function drawDeskH(cx, deskY, noShadow) {
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
export function drawDeskV(dx, dy) {
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
export function deskClutterH(cx, deskY, eff, t) {
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
export function drawHead(hx, hy, look, dir, eff) {
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

export function drawBody(cx, by, look, eff, t, dir) {
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

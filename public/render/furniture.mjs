// render/furniture.mjs — 가구·가전·테마 오브젝트·시그니처 데코·히어로 오브젝트 그리기.
// gfx(ctx/C/TH/S/lastT) + 레이아웃 상수 + primitives 만 의존. 월드 상태 비참조.
import { ctx, C, TH, S, lastT } from '../core/gfx.mjs';
import { POD_H, AISLE_Y, WALL } from '../constants.mjs';
import { shadow, drawPlant, roundRect } from './primitives.mjs';
import { hash } from '../lib/hash.mjs';

export function drawSofa(x, y, w) {
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

export function drawArmchair(x, y) {
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

export function drawCoffeeTable(x, y) {
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

export function drawRoundTable(cx, cy) {
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

export function drawBookshelf(x, y) {
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
export function drawPrinter(x, y) {                      // 프린터
  shadow(x + 7, y + 13, 15, 3);
  ctx.fillStyle = '#dfe3ea'; ctx.fillRect(x, y, 14, 12);
  ctx.fillStyle = '#f1f3f6'; ctx.fillRect(x + 1, y + 1, 12, 5);
  ctx.fillStyle = C.aluDark; ctx.fillRect(x + 2, y + 7, 10, 2);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 3, y + 8, 8, 3);
  ctx.fillStyle = '#22C55E'; ctx.fillRect(x + 11, y + 2, 1, 1);
}
export function drawLocker(x, y) {                       // 락커
  shadow(x + 9, y + 30, 18, 3);
  ctx.fillStyle = '#aeb8c6'; ctx.fillRect(x, y, 18, 30);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i % 2 ? '#bcc4d0' : '#c6cdd9'; ctx.fillRect(x + 1, y + 1 + i * 10, 16, 9);
    ctx.fillStyle = '#8a93a3'; ctx.fillRect(x + 13, y + 5 + i * 10, 2, 2);
  }
}
export function drawPhoneBooth(x, y) {                   // 전화 부스
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
export function drawAreaRug(x, y, w, h, c1, c2) {
  ctx.fillStyle = c2; roundRect(x, y, w, h, 6);
  ctx.fillStyle = c1; roundRect(x + 2, y + 2, w - 4, h - 4, 5);
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x + 4, y + 3, w - 8, 1);
}
// 존 타입별 가구 렌더 (cafe / ailab / collab / focus)
export function drawZone(z, t) {
  const { x, y, w, h } = z;
  roomShell(x, y, w, h, zoneFloor(z.floor));
  const rug = TH.zoneRug[z.type];      // 활성 테마의 존별 러그(gfx live binding)
  if (rug) drawAreaRug(x + 5, y + 5, w - 10, h - 10, rug[0], rug[1]);   // wall-to-wall 카펫
  const cx = x + w / 2;
  if (z.type === 'ailab') {
    drawAILabWall(x + 4, y + 5, w - 8, t);              // Claude/GPT/Gemini 대시보드
    drawTokenBar(x + 6, y + 30, w - 44, t);             // Token Usage
    drawAgentHealth(x + w - 32, y + 28, t);             // Agent Health
    drawServerRack(x + 10, y + 38, t);                  // GPU 클러스터(양끝 2개, 넓은 중앙 통로)
    drawServerRack(x + w - 26, y + 38, t);
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
// ---------- 테마별 시그니처 장식 오브젝트 (팔레트 토큰으로 그려 테마색 자동 적용) ----------
function drawCRT(x, y) {                       // 레트로 CRT 모니터(인광 화면)
  shadow(x + 9, y + 21, 20, 3);
  ctx.fillStyle = C.aluDark; ctx.fillRect(x + 5, y + 18, 9, 3);
  ctx.fillStyle = C.alu; ctx.fillRect(x, y, 19, 17);
  ctx.fillStyle = C.aluHi; ctx.fillRect(x, y, 19, 1);
  ctx.fillStyle = C.screenBezel; ctx.fillRect(x + 2, y + 2, 15, 12);
  ctx.fillStyle = C.leaf;
  for (let i = 0; i < 4; i++) ctx.fillRect(x + 4, y + 4 + i * 2, 4 + ((i * 5 + Math.floor(lastT / 400)) % 9), 1);
}
function drawServerTower(x, y) {               // 타워 PC + 점멸 LED
  shadow(x + 8, y + 27, 16, 3);
  ctx.fillStyle = C.monitor; ctx.fillRect(x + 3, y, 12, 26);
  ctx.fillStyle = C.monitorHi; ctx.fillRect(x + 3, y, 12, 2);
  for (let u = 0; u < 4; u++) { ctx.fillStyle = C.screenBezel; ctx.fillRect(x + 5, y + 5 + u * 4, 8, 2); }
  ctx.fillStyle = (Math.floor(lastT / 320) % 2) ? C.leafHi : C.leafDark; ctx.fillRect(x + 11, y + 5, 2, 2);
}
function drawBrickPlanter(x, y) {              // 노출 벽돌 화단 (NY)
  shadow(x + 9, y + 22, 20, 3);
  ctx.fillStyle = C.oakEdge; ctx.fillRect(x, y + 8, 19, 14);
  ctx.fillStyle = C.oak;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) ctx.fillRect(x + 1 + c * 6 + (r % 2 ? 3 : 0), y + 9 + r * 4, 5, 3);
  drawPlant(x + 5, y - 6, true);
}
function drawPipe(x, y) {                       // 산업용 파이프 (NY)
  ctx.fillStyle = C.aluDark; ctx.fillRect(x + 4, y, 4, 26);
  ctx.fillStyle = C.alu; ctx.fillRect(x + 5, y, 1, 26);
  ctx.fillStyle = C.aluDark; ctx.fillRect(x + 2, y + 6, 8, 2); ctx.fillRect(x + 2, y + 18, 8, 2);
  ctx.fillStyle = C.aluHi; ctx.fillRect(x + 2, y + 6, 8, 1);
}
function drawFloorLamp(x, y) {                  // 플로어 램프 (cozy)
  shadow(x + 7, y + 26, 12, 3);
  ctx.fillStyle = C.aluDark; ctx.fillRect(x + 6, y + 10, 2, 16);
  ctx.fillStyle = C.tan; ctx.beginPath(); ctx.moveTo(x + 2, y + 10); ctx.lineTo(x + 12, y + 10); ctx.lineTo(x + 10, y); ctx.lineTo(x + 4, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,228,160,.55)'; ctx.fillRect(x + 4, y + 9, 6, 2);
}
function drawBookStack(x, y) {                  // 쌓인 책 (cozy)
  shadow(x + 8, y + 22, 16, 3);
  const cols = ['#bb5555', '#4a78bb', '#46a468', '#c39247', '#8f68c4'];
  for (let i = 0; i < 5; i++) {
    const w = 15 - (i % 2) * 3, bx = x + (i % 2) * 2, by = y + 18 - i * 4;
    ctx.fillStyle = cols[i % 5]; ctx.fillRect(bx, by, w, 4);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(bx, by, w, 1);
  }
}
function drawBeanBag(x, y) {                    // 빈백 (SV)
  shadow(x + 9, y + 18, 20, 4);
  ctx.fillStyle = C.sofaDark; ctx.beginPath(); ctx.ellipse(x + 9, y + 12, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.sofaSeat; ctx.beginPath(); ctx.ellipse(x + 9, y + 10, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.sofaHi; ctx.beginPath(); ctx.ellipse(x + 7, y + 8, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
}
function drawCharger(x, y) {                    // EV 월 차저 (Tesla)
  shadow(x + 8, y + 24, 12, 3);
  ctx.fillStyle = C.white; ctx.fillRect(x + 3, y, 11, 20);
  ctx.fillStyle = C.whiteEdge; ctx.fillRect(x + 3, y, 11, 2);
  ctx.fillStyle = C.sofaBase; ctx.fillRect(x + 6, y + 5, 5, 5);
  ctx.fillStyle = C.aluDark; ctx.fillRect(x + 8, y + 12, 2, 10); ctx.fillRect(x + 8, y + 22, 5, 2);
}
// 데코 스타일별 좌우 페리미터 장식 세트 (애니메이션 props 는 lastT 사용)
const DECOR = {
  office: [(x, y) => drawBookshelf(x, y), (x, y) => drawLocker(x, y), (x, y) => drawPhoneBooth(x + 1, y),
           (x, y) => { drawPlant(x + 4, y + 8, true); drawPlant(x + 12, y + 16, false); }],
  terminal: [(x, y) => drawCRT(x, y), (x, y) => drawServerTower(x, y), (x, y) => drawBookshelf(x, y),
             (x, y) => { drawPlant(x + 4, y + 8, true); drawPlant(x + 12, y + 16, false); }],
  loft: [(x, y) => drawBrickPlanter(x, y), (x, y) => drawPipe(x, y), (x, y) => drawBookshelf(x, y), (x, y) => drawLocker(x, y)],
  cozy: [(x, y) => drawBookStack(x, y), (x, y) => drawFloorLamp(x, y), (x, y) => drawBookshelf(x, y),
         (x, y) => { drawPlant(x + 4, y + 6, true); drawPlant(x + 12, y + 16, true); }],
  svalley: [(x, y) => drawBeanBag(x, y), (x, y) => drawBookshelf(x, y), (x, y) => drawPhoneBooth(x + 1, y),
            (x, y) => { drawPlant(x + 4, y + 8, true); drawPlant(x + 12, y + 16, false); }],
  tesla: [(x, y) => drawCharger(x, y), (x, y) => drawLocker(x, y), (x, y) => drawPhoneBooth(x + 1, y),
          (x, y) => drawPlant(x + 6, y + 10, true)],
  openai: [(x, y) => drawServerTower(x, y), (x, y) => drawCRT(x, y), (x, y) => drawLocker(x, y),
           (x, y) => drawPlant(x + 6, y + 10, true)],
};

// ========== 테마 히어로 오브젝트 (파격적 대형 장식 — 빈 슬롯 한 곳에 배치) ==========
// 모두 중심좌표 (cx, cy) 기준. 약 70~80w × 60h 풋프린트.
function drawTeslaCar(cx, cy) {                 // 사이버트럭 풍 EV
  shadow(cx, cy + 15, 72, 7);
  ctx.fillStyle = '#aab0b8';                    // 각진 스틸 웨지(약간 진하게 — 밝은 바닥 대비)
  ctx.beginPath();
  ctx.moveTo(cx - 37, cy + 9); ctx.lineTo(cx - 30, cy - 1); ctx.lineTo(cx - 4, cy - 14);
  ctx.lineTo(cx + 17, cy - 14); ctx.lineTo(cx + 35, cy + 2); ctx.lineTo(cx + 37, cy + 9);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#2a2e35'; ctx.lineWidth = 1.5; ctx.stroke();   // 다크 외곽선
  ctx.fillStyle = '#e2e6eb';
  ctx.beginPath(); ctx.moveTo(cx - 4, cy - 14); ctx.lineTo(cx + 17, cy - 14); ctx.lineTo(cx + 13, cy - 9); ctx.lineTo(cx - 1, cy - 9); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#23262d';                    // 캐빈 글래스
  ctx.beginPath(); ctx.moveTo(cx - 23, cy - 2); ctx.lineTo(cx - 4, cy - 12); ctx.lineTo(cx + 15, cy - 12); ctx.lineTo(cx + 23, cy - 3); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3a3f47'; ctx.fillRect(cx - 37, cy + 7, 74, 3);
  ctx.fillStyle = '#eef3ff'; ctx.fillRect(cx + 31, cy + 1, 6, 2);   // 전조등
  ctx.fillStyle = '#ff5a4d'; ctx.fillRect(cx - 37, cy + 2, 4, 2);   // 후미등
  ctx.fillStyle = '#15171c';
  for (const wx of [cx - 22, cx + 23]) {
    ctx.beginPath(); ctx.arc(wx, cy + 10, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6b7079'; ctx.beginPath(); ctx.arc(wx, cy + 10, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#15171c';
  }
}
function drawTaxi(cx, cy) {                      // NY 옐로 캡
  shadow(cx, cy + 15, 66, 7);
  ctx.fillStyle = '#f7c948'; ctx.fillRect(cx - 32, cy - 6, 64, 15);          // 차체
  ctx.fillStyle = '#f7c948'; ctx.fillRect(cx - 20, cy - 14, 40, 9);          // 캐빈
  ctx.fillStyle = '#ffd95e'; ctx.fillRect(cx - 32, cy - 6, 64, 2);
  ctx.fillStyle = '#bfe3f0'; ctx.fillRect(cx - 17, cy - 12, 14, 6); ctx.fillRect(cx + 3, cy - 12, 14, 6);  // 창
  ctx.fillStyle = '#1d1f24';                    // 체커 띠
  for (let i = 0; i < 10; i++) { if (i % 2) ctx.fillRect(cx - 30 + i * 6, cy + 1, 6, 3); }
  ctx.fillStyle = '#1d1f24'; ctx.fillRect(cx - 6, cy - 19, 12, 4);           // TAXI 사인
  ctx.fillStyle = '#f7c948'; ctx.fillRect(cx - 4, cy - 18, 8, 2);
  ctx.fillStyle = '#fff'; ctx.fillRect(cx + 28, cy - 3, 4, 3);               // 전조등
  ctx.fillStyle = '#15171c';
  for (const wx of [cx - 20, cx + 21]) { ctx.beginPath(); ctx.arc(wx, cy + 10, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#9aa0a8'; ctx.beginPath(); ctx.arc(wx, cy + 10, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#15171c'; }
}
function drawRocket(cx, cy) {                    // 실리콘밸리 — 스타트업 로켓
  const flick = Math.floor(lastT / 120) % 2;
  shadow(cx, cy + 22, 34, 5);
  ctx.fillStyle = '#f5f7fa'; ctx.fillRect(cx - 9, cy - 18, 18, 34);          // 동체
  ctx.fillStyle = '#dde3ea'; ctx.fillRect(cx + 4, cy - 18, 5, 34);
  ctx.fillStyle = '#e0554a'; ctx.beginPath(); ctx.moveTo(cx - 9, cy - 18); ctx.lineTo(cx + 9, cy - 18); ctx.lineTo(cx, cy - 32); ctx.closePath(); ctx.fill();  // 노즈콘
  ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(cx, cy - 6, 4, 0, Math.PI * 2); ctx.fill();  // 창
  ctx.fillStyle = '#cfe3f0'; ctx.beginPath(); ctx.arc(cx - 1, cy - 7, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e0554a';                    // 핀
  ctx.beginPath(); ctx.moveTo(cx - 9, cy + 6); ctx.lineTo(cx - 18, cy + 16); ctx.lineTo(cx - 9, cy + 16); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx + 9, cy + 6); ctx.lineTo(cx + 18, cy + 16); ctx.lineTo(cx + 9, cy + 16); ctx.closePath(); ctx.fill();
  ctx.fillStyle = flick ? '#f59e0b' : '#fbbf24';                            // 화염
  ctx.beginPath(); ctx.moveTo(cx - 6, cy + 16); ctx.lineTo(cx + 6, cy + 16); ctx.lineTo(cx, cy + 16 + (flick ? 12 : 8)); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.moveTo(cx - 3, cy + 16); ctx.lineTo(cx + 3, cy + 16); ctx.lineTo(cx, cy + 16 + (flick ? 6 : 4)); ctx.closePath(); ctx.fill();
}
function drawArcade(cx, cy) {                    // 레트로 — 아케이드 캐비닛
  shadow(cx, cy + 22, 38, 5);
  ctx.fillStyle = '#16231a'; ctx.fillRect(cx - 17, cy - 22, 34, 44);        // 캐비닛
  ctx.fillStyle = '#0f1a12'; ctx.fillRect(cx - 17, cy - 22, 34, 2);
  ctx.fillStyle = '#2fb04c'; ctx.fillRect(cx - 15, cy - 20, 30, 4);         // 마퀴
  ctx.fillStyle = '#020a02'; ctx.fillRect(cx - 13, cy - 13, 26, 16);        // 스크린
  ctx.fillStyle = '#4cd069';
  for (let i = 0; i < 4; i++) ctx.fillRect(cx - 11, cy - 11 + i * 3, 4 + ((i * 7 + Math.floor(lastT / 300)) % 18), 1);  // 스캔라인
  ctx.fillStyle = '#1f5f1f'; ctx.fillRect(cx - 15, cy + 5, 30, 7);          // 컨트롤 패널
  ctx.fillStyle = '#e0554a'; ctx.beginPath(); ctx.arc(cx - 7, cy + 8, 2, 0, Math.PI * 2); ctx.fill();  // 버튼
  ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(cx, cy + 8, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(cx + 7, cy + 8, 2, 0, Math.PI * 2); ctx.fill();
}
function drawMascot(cx, cy, body, eye) {        // 마스코트 로봇 (OpenAI/Claude 색만 다름)
  const bob = Math.round(Math.sin(lastT / 500) * 1.5);
  cy += bob;
  shadow(cx, cy + 22, 30, 5);
  ctx.fillStyle = body; ctx.fillRect(cx - 12, cy + 2, 24, 18);              // 몸통
  ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(cx - 12, cy + 2, 24, 2);
  ctx.fillStyle = body; ctx.fillRect(cx - 13, cy - 16, 26, 18);            // 머리
  ctx.fillStyle = '#0f1115'; ctx.fillRect(cx - 9, cy - 11, 18, 9);         // 페이스 스크린
  ctx.fillStyle = eye;                                                      // 눈(글로우)
  const blink = Math.floor(lastT / 2400) % 8 === 0;
  if (blink) { ctx.fillRect(cx - 6, cy - 6, 4, 1); ctx.fillRect(cx + 2, cy - 6, 4, 1); }
  else { ctx.fillRect(cx - 6, cy - 8, 4, 4); ctx.fillRect(cx + 2, cy - 8, 4, 4); }
  ctx.fillStyle = '#9aa0a8'; ctx.fillRect(cx - 1, cy - 22, 2, 6);          // 안테나
  ctx.fillStyle = eye; ctx.beginPath(); ctx.arc(cx, cy - 23, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = body; ctx.fillRect(cx - 16, cy + 5, 4, 9); ctx.fillRect(cx + 12, cy + 5, 4, 9);  // 팔
}
function drawFireplace(cx, cy) {                // 웜 — 벽난로
  const f = Math.floor(lastT / 160) % 2;
  shadow(cx, cy + 20, 44, 5);
  ctx.fillStyle = C.oakEdge; ctx.fillRect(cx - 22, cy - 18, 44, 38);       // 벽돌 프레임
  ctx.fillStyle = C.oak;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) ctx.fillRect(cx - 20 + c * 9 + (r % 2 ? 4 : 0), cy - 16 + r * 7, 8, 6);
  ctx.fillStyle = '#1a120c'; ctx.fillRect(cx - 14, cy - 6, 28, 24);        // 화구
  ctx.fillStyle = '#b5502a'; ctx.fillRect(cx - 12, cy + 12, 24, 6);        // 장작
  ctx.fillStyle = f ? '#f59e0b' : '#fb923c';                              // 불꽃
  ctx.beginPath(); ctx.moveTo(cx - 8, cy + 14); ctx.lineTo(cx + 8, cy + 14); ctx.lineTo(cx, cy - 4 - (f ? 3 : 0)); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.moveTo(cx - 4, cy + 14); ctx.lineTo(cx + 4, cy + 14); ctx.lineTo(cx, cy + 2 + (f ? 0 : 2)); ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.oakHi; ctx.fillRect(cx - 24, cy - 20, 48, 3);          // 맨틀
}
function drawScooter(cx, cy) {                  // 서울 — 배달 스쿠터
  shadow(cx, cy + 14, 50, 6);
  ctx.fillStyle = '#e0554a'; ctx.fillRect(cx - 6, cy - 16, 18, 16);        // 배달통
  ctx.fillStyle = '#fff'; ctx.fillRect(cx - 3, cy - 12, 12, 8);            // 통 라벨
  ctx.fillStyle = '#e0554a'; ctx.fillRect(cx - 1, cy - 10, 8, 4);
  ctx.fillStyle = '#3b82f6'; ctx.fillRect(cx - 14, cy - 2, 26, 8);         // 차체
  ctx.fillStyle = '#5b9bf8'; ctx.fillRect(cx - 14, cy - 2, 26, 2);
  ctx.fillStyle = '#3a3f47'; ctx.fillRect(cx + 10, cy - 12, 3, 12);        // 핸들
  ctx.fillStyle = '#1d1f24'; ctx.fillRect(cx + 9, cy - 13, 7, 2);
  ctx.fillStyle = '#fde68a'; ctx.fillRect(cx + 13, cy - 1, 3, 3);          // 헤드라이트
  ctx.fillStyle = '#15171c';
  for (const wx of [cx - 12, cx + 12]) { ctx.beginPath(); ctx.arc(wx, cy + 8, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#6b7079'; ctx.beginPath(); ctx.arc(wx, cy + 8, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#15171c'; }
}
function drawWinLogo(cx, cy) {                  // MS — 윈도우 로고 모놀리스
  shadow(cx, cy + 22, 34, 5);
  ctx.fillStyle = '#e8eaee'; ctx.fillRect(cx - 13, cy - 22, 26, 44);       // 스탠드 패널
  ctx.fillStyle = '#c8ccd2'; ctx.fillRect(cx - 13, cy + 18, 26, 4);
  const q = [['#F25022', -10, -16], ['#7FBA00', 1, -16], ['#00A4EF', -10, -5], ['#FFB900', 1, -5]];
  for (const [col, dx, dy] of q) { ctx.fillStyle = col; ctx.fillRect(cx + dx, cy + dy, 9, 9); }
  ctx.fillStyle = '#9aa0a8'; ctx.fillRect(cx - 9, cy + 8, 18, 8);          // 받침 그림자칸
}
function drawNeonSign(cx, cy) {                 // 다크 — 네온 사인 "OPEN 24"
  const on = Math.floor(lastT / 700) % 5 !== 0;
  ctx.fillStyle = '#0c0f16'; ctx.fillRect(cx - 26, cy - 20, 52, 34);       // 백패널
  ctx.fillStyle = '#0a0d13'; ctx.fillRect(cx - 26, cy - 20, 52, 2);
  const neon = on ? '#ff3b6b' : '#5a1f30', neon2 = on ? '#22d3ee' : '#15464d';
  if (on) { ctx.shadowColor = '#ff3b6b'; ctx.shadowBlur = 8; }
  ctx.strokeStyle = neon; ctx.lineWidth = 2;
  ctx.strokeRect(cx - 20, cy - 14, 40, 12);                                // OPEN 박스
  ctx.fillStyle = neon; ctx.fillRect(cx - 16, cy - 11, 3, 6); ctx.fillRect(cx - 9, cy - 11, 3, 6); ctx.fillRect(cx - 2, cy - 11, 3, 6); ctx.fillRect(cx + 5, cy - 11, 3, 6);
  ctx.shadowBlur = 0;
  if (on) { ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 8; }
  ctx.fillStyle = neon2; ctx.fillRect(cx - 8, cy + 2, 16, 8);              // 24 칩
  ctx.shadowBlur = 0;
}
function drawGlassCube(cx, cy) {                // 애플 — 유리 큐브(부유 디바이스)
  const bob = Math.round(Math.sin(lastT / 600) * 2);
  shadow(cx, cy + 20, 40, 6);
  ctx.fillStyle = 'rgba(180,210,235,.28)'; ctx.fillRect(cx - 20, cy - 18, 40, 38);   // 유리
  ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5; ctx.strokeRect(cx - 20, cy - 18, 40, 38);
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(cx - 17, cy - 15, 6, 32);     // 반사
  ctx.fillStyle = '#f8f9fa'; ctx.fillRect(cx - 9, cy - 4 + bob, 18, 12);             // 부유 디바이스
  ctx.fillStyle = '#1d1f24'; ctx.fillRect(cx - 7, cy - 2 + bob, 14, 8);
  ctx.fillStyle = '#3b82f6'; ctx.fillRect(cx - 5, cy + bob, 10, 4);
}
function drawContrastSculpture(cx, cy) {        // 하이콘트라스트 — 흑백 구체 조형
  shadow(cx, cy + 18, 32, 5);
  ctx.fillStyle = '#0b0e16'; ctx.beginPath(); ctx.arc(cx, cy, 18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 8; i++) { if (i % 2) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 18, i * Math.PI / 4, (i + 1) * Math.PI / 4); ctx.closePath(); ctx.fill(); } }
  ctx.fillStyle = '#EF4444'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();  // 레드 포인트
  ctx.fillStyle = '#0b0e16'; ctx.fillRect(cx - 4, cy + 16, 8, 6);          // 받침
}
// 테마 키 → 히어로 렌더 (cx, cy 중심). 미정 테마는 히어로 없음.
export const HERO = {
  tesla: drawTeslaCar, newyork: drawTaxi, svalley: drawRocket, terminal: drawArcade,
  openai: (cx, cy) => drawMascot(cx, cy, '#10A37F', '#5fe6c4'),
  claude: (cx, cy) => drawMascot(cx, cy, '#cc6a44', '#ffd9a8'),
  warm: drawFireplace, seoul: drawScooter, microsoft: drawWinLogo,
  dark: drawNeonSign, apple: drawGlassCube, contrast: drawContrastSculpture,
};

export function drawCorridorDecor(layout, blocked) {
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
export function drawInfraZone(x, y, w, h, t) {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  drawAreaRug(x + 6, y + 48, w - 12, h - 54, TH.bg.infraRug[0], TH.bg.infraRug[1]);
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
export function drawQAZone(x, y, w, h, t) {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  drawAreaRug(x + 6, y + 50, w - 12, h - 56, TH.bg.qaRug[0], TH.bg.qaRug[1]);
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
export function drawPerimeterDecor(layout, blocked) {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  const { W, workY, bottomTop } = layout;
  const items = DECOR[TH.decorStyle] || DECOR.office;   // 테마별 시그니처 장식 세트
  let i = 0;
  for (let y = workY + 4; y < bottomTop - 30; y += 38) {
    if (!blocked(WALL + 11, y + 14) && !blocked(WALL + 11, y + 26)) { items[i % items.length](WALL + 2, y); i++; }
    if (!blocked(W - WALL - 11, y + 14) && !blocked(W - WALL - 11, y + 26)) { items[i % items.length](W - WALL - 20, y); i++; }
  }
}

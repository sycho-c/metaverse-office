// core/gfx.mjs — 공유 렌더 컨텍스트(캔버스 · 2D ctx · 팔레트 · 스케일 · 타이밍).
// 그리기/월드 모듈이 import 하는 단일 소스. 가변값은 live binding + setter 로 노출한다
// (이 모듈에서만 재할당 → import 측은 항상 최신값을 읽는다. ESM live binding).
const canvas = document.getElementById('office');
export { canvas };
export const ctx = canvas.getContext('2d');

export let S = 2;            // 백킹 렌더 배율 = DISP × devicePixelRatio (프레임마다 갱신)
export let TH = null;        // 활성 테마 객체
export let C = null;         // 월드 팔레트(TH.C) — 매 프레임 참조
export let lastT = 0;        // 직전 프레임 타임스탬프
export let dtFrame = 16;     // 프레임 간격(ms)

export function setScale(s) { S = s; }
export function setTiming(t, dt) { lastT = t; dtFrame = dt; }
export function applyPalette(th) { TH = th; C = th.C; }   // 테마 전환 시 호출

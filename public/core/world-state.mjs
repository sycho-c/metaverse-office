// core/world-state.mjs — 월드 시뮬레이션 + 이름표/셀 레이어가 공유하는 가변 상태 허브.
// frame(메인) 과 world.mjs 가 함께 읽고 쓰는 상태를 이곳이 소유한다(gfx 패턴).
// 원칙: 재할당 스칼라는 setter, in-place 변경 컨테이너(Map/array)는 export const.
import { S } from './gfx.mjs';

// ── 바닥 논리 크기 (frame 이 매 프레임 산출 → blocked/buildGrid/pickRoamTarget/player 가 읽음) ──
export let floorW = 0, floorH = 0;
export function setFloor(w, h) { floorW = w; floorH = h; }

// ── 존 기하 / 좌석 배정 (frame 이 산출 → 충돌·POI·좌석 렌더가 읽음) ──
export let rooms = [];                 // 휴게실/탕비실 기하 {type,label,floor,x,y,w,h}
export function setRooms(r) { rooms = r; }
export let seatMap = [];               // pod별 좌석 배정 [pods][4] (세션 or undefined)
export function setSeatMap(s) { seatMap = s; }

// ── 보행/대사 상태 (월드 시뮬이 in-place 갱신) ──
export const walkers = new Map();      // sessionId → 보행 상태
export const speeches = new Map();     // sessionId → { text, until }
export let speechOn = (() => { try { return localStorage.getItem('office.speech') !== 'off'; } catch (e) { return true; } })();
export function setSpeechOn(v) { speechOn = !!v; }

// ── 이름표/셀 레이어 (drawPod*·drawWalker 가 채우고 drawTags·drawHighlight·클릭판정이 읽음) ──
export const tagJobs = [];             // 프레임당 이름표 배치 잡 — frame 이 length=0 으로 리셋
export const tagPlaced = new Map();    // sessionId → 최종 이름표 위치 {cx,y} (말풍선 배치용)
export const cellRects = [];           // 클릭/근접 판정용 캐릭터 박스 — frame 이 length=0 으로 리셋

// 이름표 배치 잡 추가 — 논리좌표를 백킹 픽셀(×S)로 환산해 push
export function pushTag(s, cxLogical, yLogical, look) {
  tagJobs.push({ s, scx: cxLogical * S, sy: yLogical * S, look });
}

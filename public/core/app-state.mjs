// core/app-state.mjs — UI·플레이어가 공유하는 화면 상태 플래그(leaf, 외부 의존 없음).
// 재할당 스칼라는 setter 경유, in-place 컨테이너(keys)는 export const.
// world.mjs 는 이 상태를 읽지 않는다(월드 시뮬과 분리) → 순환 의존 차단.

export let highlightId = null;        // 선택/하이라이트된 세션 id (패널·캔버스 공통)
export function setHighlightId(v) { highlightId = v; }

export let talking = false;           // 세션 내용 패널 열림 → 플레이어 이동 정지
export function setTalking(v) { talking = v; }

export let talkTarget = null;         // 현재 패널에 띄운 세션
export function setTalkTarget(v) { talkTarget = v; }

export let settingsOpen = false;      // 설정 패널 열림 → 플레이어 이동 정지
export function setSettingsOpen(v) { settingsOpen = v; }

export const keys = { up: false, down: false, left: false, right: false, sprint: false };

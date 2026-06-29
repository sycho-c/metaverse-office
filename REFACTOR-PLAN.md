# 메타버스 오피스 — 모듈 분리(P0) 남은 작업 설계

> app.js(classic 단일 파일)를 책임별 ESM 모듈로 분리하는 작업의 **남은 phase 2** 설계.
> 완료분(렌더 레이어 + 순수 로직)은 `README.md` "코드 구조" 참조.

## 현재 상태 (2026-06)

- app.js **3369 → 1741줄 (48%↓)**, ESM 모듈 14개 + `node --test` 34개(그린)
- 분리 완료: `lib/*`(hash·color·seating·sig·format·look) · `core/gfx`(공유 렌더 컨텍스트) ·
  `constants` · `themes` · `render/`(primitives·furniture·characters) · `claude-status`
- 핵심: 공유 렌더 상태(ctx 792·C 173 참조)를 `core/gfx.mjs` live binding + setter 로 해소

## 남은 것 — 상태 강결합 코어 (app.js ~1741줄)

남은 코드는 **공유 가변 상태**에 얽혀 있어, 분리하려면 `gfx` 처럼 **상태 소유 모듈**을 먼저 세워야 한다.

### 1) `core/world-state.mjs` (선행) — 월드 시뮬 공유 상태

frame() 과 월드 함수가 공유하는 상태를 소유. live binding + setter (gfx 패턴).

| 상태 | 갱신 주체 | 읽는 곳 | 노출 |
|---|---|---|---|
| `floorW`/`floorH` | frame | blocked·buildGrid | `setFloor(w,h)` |
| `rooms` | frame | drawZone·roomAt·roomPOIs·collectObstacles | `setRooms(r)` |
| `seatMap` | frame | drawPod·collectObstacles | `setSeatMap(s)` |
| `walkers`(Map) | 월드 | frame(`.get`)·월드 | `export const`(in-place) |
| `speeches`/`tagPlaced`(Map) | 월드 | 월드 | `export const` |
| `obstacles` | collectObstacles | blocked | world 내부(`.length=0`로 clear) |
| `grid`/`gridCols`/`gridRows`/`gridKey` | buildGrid | pathFind | world 내부 |
| `maxWalkers` | tickWalkers | 월드 | world 내부 |
| `cat` | drawCat | 월드 | world 내부 |

### 2) `world.mjs` — 충돌·경로탐색·보행·앰비언트·대사·고양이

이동 대상 함수(현 app.js 465~892 연속 + drawCat 1113):
collectObstacles · blocked · roomAt · roomPOIs · buildGrid · pathFind ·
ensureWalker · walkerSeated · activeWalkerCount · zoneOccupancy · pickRoamTarget ·
moveTo · moveAlong · startBack · tickWalker · drawWalkPerson · computeAmbient ·
drawAmbientPerson · tickWalkers · drawWalker · pickSpeechLine · tickSpeech · drawSpeech · drawCat

- **imports**: gfx(ctx·C·S·lastT·TH) · constants(WALL·TOP_WALL·ZONE_H·ROAM_TOP·POD_W·POD_H·WALK_SPEED·GC·ZONE_CAP·SAY) ·
  lib(hash·lookOf) · render/characters(drawHead·drawBody) · render/primitives(roundRect·shadow) · world-state
- **신규 `rebuildWorld(layout, vis)`**: frame 의 1133~1146 로직 흡수
  (floorW/floorH/rooms/seatMap 셋업 + collectObstacles + buildGrid). frame 은 이 한 줄 호출 후
  `rooms`/`seatMap`(live binding) 을 읽어 drawZone/drawPod.
- **exports**: rebuildWorld · tickWalkers · drawWalker · computeAmbient · drawAmbientPerson ·
  tickSpeech · drawSpeech · drawCat · blocked(furniture DI 용) · rooms · seatMap · walkers
- **함정**: `blocked` 는 현재 furniture(drawCorridorDecor/drawPerimeterDecor)에 파라미터 주입 중 →
  world 의 blocked 를 app.js 가 import 해 계속 주입하거나, furniture 가 world 에서 직접 import.

### 3) `ui/panel.mjs` — 세션 패널·설정·사용량·알림 (~500줄, DOM)

renderPanel · openTalk · loadSession · renderSession · renderMeta · closeTalk · setBadge ·
renderUsage · toast · toastMsg · openSettings · closeSettings · setSpeed · setRefresh ·
setSpeech · setNotify · beep · maybeNotify · applyPanelTimer · initPanelTools · initThemeUI

- **선행 `app-state.mjs`** 필요: sessions · highlightId · hideDone · searchQuery · statusFilter ·
  sessionData · sessionTimer · sessionLimit · loadMoreFlag · talking · talkTarget (UI↔player↔frame 공유)
- 캔버스/월드 비의존(순수 DOM) → 월드보다 위험 낮음. 단 player(talking/keys)·sessions 결합.

### 4) `player.mjs` — 아바타 + 입력

player · keys · spawnPlayer · tickPlayer · drawPlayer · updatePlayerTarget · drawPlayerHint ·
ensurePlayerVisible · initPlayerControls · keyId. gfx + characters(drawHead/drawBody) +
app-state(cellRects·talking) + ui(openTalk) 결합.

### 5) `app.js` → `main.mjs` (최종)

남는 것: visible · update · connect(SSE) · computeLayout · cellAt · drawFloor/Walls ·
drawPod 클러스터 · drawHighlight · pushTag/drawTags(이름표) · **frame 루프**(오케스트레이터) · 부트.

## 권장 순서

1. `core/world-state.mjs` + `world.mjs` (rebuildWorld 로 frame 재배선) — **위험 최고, 신중히**
2. `app-state.mjs` + `ui/panel.mjs` (DOM, 위험 중)
3. `player.mjs`
4. app.js 정리 → main.mjs

각 단계: `node --test` 그린 + 브라우저(렌더·콘솔에러0) + 커밋 + push.
공유 상태는 **in-place 변경 컨테이너(Map/array)는 `export const`**, **재할당 스칼라는 setter** 원칙.

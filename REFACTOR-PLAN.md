# 메타버스 오피스 — 모듈 분리(P0) 완료 기록

> `app.js`(classic 단일 파일, **3369줄**)를 책임별 ESM 모듈로 분리하는 작업 — **완료**.
> 모듈별 책임 표는 `README.md` "코드 구조" 참조.

## 최종 상태

- 진입점 **`main.mjs` (≈688줄)** — 순수 오케스트레이터(frame 루프 + 레이아웃 + 플로어/포드
  렌더 + 이름표 + 테마 + 부트). 나머지는 14개 모듈로 분리.
- `node --test` 34개(그린) — 순수 로직(lib/*) 회귀 안전망. 캔버스/DOM 모듈은 브라우저 검증.
- 핵심 난제(공유 가변 상태)는 **leaf 허브 + live binding + setter** 로 해소:
  - `core/gfx.mjs` — 렌더 컨텍스트(ctx 792·C 173 참조)
  - `core/world-state.mjs` — 월드+이름표 상태(floor/rooms/seatMap/walkers/speeches/tag*·cellRects/pushTag)
  - `core/app-state.mjs` — UI/플레이어 플래그(sessions/highlightId/talking/talkTarget/settingsOpen/keys)
- 원칙: **in-place 변경 컨테이너(Map/array)는 `export const`**, **재할당 스칼라는 setter**.

## 분리 단계 (커밋 순서)

| 단계 | 산출물 | 핵심 |
|---|---|---|
| (이전) | `lib/*` · `core/gfx` · `constants` · `themes` · `render/*` · `claude-status` | 순수 로직 + 렌더 레이어 |
| A | `core/world-state.mjs` · `core/app-state.mjs` | 공유 상태 허브 선추출(배선만 검증) |
| C | `world.mjs` | 충돌·경로탐색·보행·앰비언트·대사·고양이 + `rebuildWorld` |
| D | `player.mjs` | 아바타 이동·근접 탐색·렌더·속도 설정 |
| E | `ui/panel.mjs` | 세션 패널·사용량·토스트·알림·세션내용·설정·SSE |
| F | `app.js → main.mjs` | 엔트리 리네임(오케스트레이터 확정) |

각 단계: `node --test` 그린 + 브라우저(렌더·콘솔에러0) + 커밋 + push 로 검증.

## 의존 방향 (순환 없음)

```
lib/* · constants ──┐
core/gfx ───────────┤
core/world-state ───┼──→ render/* ──→ world.mjs ──→ player.mjs ──┐
core/app-state ─────┘                      └──→ ui/panel.mjs ────┼──→ main.mjs
                                                                  ┘
```
- `world` 는 `app-state` 를 읽지 않음(월드 시뮬과 UI 분리).
- `ui/panel` 은 `player` 를 import 하지 않음(입력 배선은 main 이 조립).
- `main` 만 모든 모듈을 조립(composition root).

## 후속(선택) — 계획 범위 밖

- `render/pods.mjs`: main 의 drawPod 클러스터(≈250줄, 포드/좌석/빈슬롯/하이라이트 렌더) 추출 시
  main 은 frame+레이아웃+이름표+부트만 남아 더 얇아짐. 현재는 main 의 "씬 조립" 책임으로 유지.

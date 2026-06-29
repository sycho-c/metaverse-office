# 🏢 Claude Office — 세션 메타버스 모니터

Claude Code agent view 의 백그라운드 세션들을 **애플 스타일 픽셀 오피스**로 한눈에 모니터링한다.
세션마다 캐릭터 1명이 책상에 앉고, 머리 위 이름표(상태색) 로 진행 상황이 보인다.
비작업 세션은 가끔 일어나 휴게실·탕비실을 돌아다니며 상황별 대사를 말한다.

| 상태 | 판정 | 이름표(색 + 글리프) |
|---|---|---|
| 작업중 (working) | `state.json` → `working` | 초록 + 흰 점 점멸 `●` + 타이핑/코드 흐름 |
| 완료 (done) | `state.json` → `done` | 파랑 + `✓` + 편안한 자세 |
| 입력 대기 (blocked) | `state.json` → `blocked` | 주황 + `!` + 손 들기 |
| 멈춤 의심 (stalled) | working 인데 N분(기본 5) 무활동 | 빨강 + `z` + 꾸벅 졸기 |

> `state.json` 의 `state` 필드는 **working/done/blocked 3종**만 저장된다.
> "멈춤 의심"은 트랜스크립트 무활동으로 파생, 재가동(done→작업중)도 자동 감지한다.
> 이름표 색은 **WCAG AA(흰 글씨 4.5:1↑)** 음영이고, 색맹 대비로 **형태 글리프**(`●`/`✓`/`!`/`z`)를 함께 표시한다.

## 실행

```bash
node server.js
# → http://localhost:4848
```

의존성 없음 (Node 내장 모듈만 사용). 모든 동작이 **읽기 전용**이라 세션에 영향 없음.

## 환경변수

| 변수 | 기본 | 설명 |
|---|---|---|
| `PORT` | 4848 | 서버 포트 |
| `STALL_MIN` | 5 | working 상태에서 이 분수만큼 무활동이면 "멈춤 의심" |
| `ACTIVE_MIN` | 2 | done/blocked 이후 트랜스크립트가 이 분 내 다시 자라면 재가동(working) 판정 |
| `POLL_MS` | 2500 | 파일 폴링 주기(ms) |

## 데이터 소스 (읽기만 함)

- `~/.claude/jobs/<id>/state.json` — `state`/`name`/`detail`/`updatedAt`/`cwd`/`sessionId`
- `~/.claude/projects/<프로젝트>/<sessionId>.jsonl` — mtime 으로 무활동(stall) 보조 판정

변경 감지는 서버가 2.5초 간격 폴링 → 변화가 있을 때만 SSE(`/events`)로 브라우저에 푸시.

**API (모두 읽기 전용)**

| 엔드포인트 | 설명 |
|---|---|
| `GET /events` | SSE 라이브 스트림(상태 변화 시 스냅샷 푸시) |
| `GET /api/sessions` | 현재 세션 스냅샷(디버깅용) |
| `GET /api/transcript?id=<jobId>&limit=N` | 세션 내용 보기용 — 상태·현재작업·지표(tokens/inFlight)·목표(intent)·실행중(fan)·산출물(children)·최근 대화(툴 단계 포함, 시각/성공·실패)·`claude --resume` 명령 |

## 코드 구조 (프론트엔드 ESM 모듈)

`public/app.js`(classic script, 단일 거대 파일)를 책임별 ES 모듈로 분리 중이다.
브라우저 네이티브 ESM(`<script type="module">`)이라 번들러 없이 의존성 0 유지.

| 모듈 | 책임 |
|---|---|
| `lib/{hash,color,seating,sig,format}.mjs` | 순수 로직(외형 해시·색 연산·좌석 배정·시그니처·포매터). `node --test` 대상 |
| `core/gfx.mjs` | 공유 렌더 컨텍스트(canvas·2D ctx·팔레트 C/TH·스케일 S·타이밍). live binding + setter |
| `constants.mjs` | 불변 데이터(레이아웃·상태 의미색·캐릭터 팔레트·대사) |
| `themes.mjs` | 테마 레지스트리 12종 + 활성 테마 해석 |
| `render/primitives.mjs` | 그리기 leaf 헬퍼(roundRect·shadow·drawPlant) |
| `claude-status.mjs` | status.claude.com 폴링 위젯(자족 side-effect) |
| `app.js` | (분리 진행 중) 월드 시뮬·렌더 오케스트레이션·세션 패널·플레이어·SSE |

**테스트**: `npm test` (= `node --test test/*.test.mjs`, 의존성 0). 순수 로직 회귀 안전망.

## UI 기능

- **애플 스타일 오피스**: 화이트 사각 타일 바닥, iMac/맥북 데스크, 휴게실·탕비실/스낵코너·복도
- **팀 클러스터**: 4인 책상 포드(백투백/마주보기), 테이블마다 1~4명 다양한 조합 + 여유 빈 좌석
- **캐릭터 디테일**: 헤어 4종·안경·헤드폰·옷깃 등 세션 ID 해시로 고정, 4방향(정면/등/좌/우)
- **생동감**: 비작업 세션이 가끔 자리를 떠나 휴게실/탕비실/복도를 배회(BFS 경로탐색으로 책상·벽 우회)하고 상황별 랜덤 대사 말풍선을 띄움. 사무실 고양이 🐈 도 충돌을 피해 돌아다님
- **이름표**: 상태색 버블, 겹치면 자동으로 위로 쌓고 연결선 표시, 좌석 클릭 시 하이라이트
- **고DPI**: devicePixelRatio 만큼 백킹 렌더 → 레티나에서 선명
- 헤더: 상태별 카운트 칩, **Claude 서비스 상태**(status.claude.com 60초 갱신), "완료 숨기기" 토글, SSE 연결 상태
- 우측 패널: 멈춤→대기→작업중→완료 순 정렬 목록 (작업 요약 + 경과 시간) + 상태 변경 토스트
- **테마 12종**: Apple Light · Night · Warm · High Contrast · Retro Terminal · Claude · Seoul · New York · Silicon Valley · Tesla · Microsoft · OpenAI (테마별 시그니처 장식·히어로 오브젝트)
- **키보드 플레이어**: 방향키/WASD 로 내 아바타 이동(Shift 질주), 세션 캐릭터에 다가가 `Enter` → **세션 내용 보기**(읽기 전용) 패널
- **세션 내용 보기 패널**: 상태 뱃지 + 현재 작업 + **지표 칩**(🪙토큰·⏱경과·⚙실행중) + 🎯목표 + ⚙지금 실행 + 🔗산출물(PR/이슈 링크) + 최근 대화(나/Claude/🔧툴 단계, 시각·성공/실패 표시) + "이전 더 보기" + 이어가기용 `claude --resume` 복사. **5초 라이브 갱신**(주기 설정 가능). 명령 실행은 CLI 터미널에서.
- **알림**: 세션이 입력 대기(blocked)/멈춤(stalled)으로 전이 시 **데스크톱 알림 + 소리**(세션별 3분 쿨다운으로 스팸 억제)
- **설정**(헤더 ⚙ 또는 `,`): 테마 · 이동 속도 · 패널 자동 갱신 주기 · 대사 말풍선 · 알림 (모두 localStorage 영속)
- **접근성**: 상태를 색만이 아닌 **형태 글리프**로 이중부호화(색맹 대비), 이름표 흰 글씨 **WCAG AA** 대비

## 주의

`state.json` 은 Claude Code 내부 포맷이라 버전 업데이트로 스키마가 바뀔 수 있다.
서버 파싱은 방어적으로 작성되어 있어 깨진 잡은 조용히 스킵한다.

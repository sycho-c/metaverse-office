# 🏢 Claude Office — 세션 메타버스 모니터

Claude Code agent view 의 백그라운드 세션들을 **픽셀 오피스** 화면으로 한눈에 모니터링한다.
세션마다 캐릭터 1명이 책상에 앉아 있고, 머리 위 이름표 + 상태 말풍선으로 진행 상황이 보인다.

| 상태 | 판정 | 화면 표현 |
|---|---|---|
| 작업중 (working) | `state.json` → `working` | 초록 점 깜빡임 + 타이핑 애니메이션 + 모니터에 코드 흐름 |
| 완료 (done) | `state.json` → `done` | ✅ 말풍선 + 편안한 자세 + 커피 김 |
| 입력 대기 (blocked) | `state.json` → `blocked` | ⚠️ 말풍선 + 손 들고 흔들기 |
| 멈춤 의심 (stalled) | working 인데 N분(기본 5) 무활동 | 💤 말풍선 + 꾸벅 졸기 + 모니터 꺼짐 |

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
| `POLL_MS` | 2500 | 파일 폴링 주기(ms) |

## 데이터 소스 (읽기만 함)

- `~/.claude/jobs/<id>/state.json` — `state`/`name`/`detail`/`updatedAt`/`cwd`/`sessionId`
- `~/.claude/projects/<프로젝트>/<sessionId>.jsonl` — mtime 으로 무활동(stall) 보조 판정

변경 감지는 서버가 2.5초 간격 폴링 → 변화가 있을 때만 SSE(`/events`)로 브라우저에 푸시.
디버깅용 스냅샷: `GET /api/sessions`

## UI 기능

- 헤더: 상태별 카운트 칩, "완료 숨기기" 토글, SSE 연결 상태
- 캔버스: 세션별 큐비클(캐릭터 외형·소품은 세션 ID 해시로 고정), 클릭 시 하이라이트, 호버 시 툴팁
- 우측 패널: 멈춤→대기→작업중→완료 순 정렬 목록 (작업 요약 + 경과 시간)
- 상태가 바뀌면 우하단 토스트 알림 + 사무실 고양이 🐈

## 주의

`state.json` 은 Claude Code 내부 포맷이라 버전 업데이트로 스키마가 바뀔 수 있다.
서버 파싱은 방어적으로 작성되어 있어 깨진 잡은 조용히 스킵한다.

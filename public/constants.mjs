// constants.mjs — 불변 레이아웃·상태·캐릭터 데이터. render/world/ui 모듈이 공유.
// 상태 의미색(SCREEN/STATE_META/TAG_COLOR/STATE_GLYPH)은 테마와 무관하게 고정.

// ---------- 레이아웃 상수 ----------
export const DISP = 2;                    // 화면 표시 배율 (CSS px per 논리 px)
export const POD_W = 92;
export const POD_H = 106;
export const AISLE_X = 44;
export const AISLE_Y = 40;
export const WALL = 14;
export const TOP_WALL = 22;
export const ZONE_H = 124;                // 방 깊이(캐릭터가 방 안 깊숙이 서도록)
export const CORRIDOR_H = 26;
export const ROAM_TOP = TOP_WALL + ZONE_H + 2;   // 코어 보행 영역 상단(복도)
export const WALK_SPEED = 0.05;           // 논리px/ms

// ---------- 상태 의미색 (디자인 시스템 시맨틱, 테마 무관) ----------
// success #22C55E / warning #F59E0B / danger #EF4444 / info #3B82F6 / neutral #64748B
export const SCREEN = {
  working: '#bbf7d0', done: '#bfdbfe', blocked: '#fed7aa',
  stalled: '#334155', unknown: '#64748b',
};

export const STATE_META = {
  working: { color: '#22C55E', label: '작업중',    emoji: null },
  done:    { color: '#3B82F6', label: '완료',      emoji: '✅' },
  blocked: { color: '#F59E0B', label: '입력 대기', emoji: '⚠️' },
  stalled: { color: '#EF4444', label: '멈춤 의심', emoji: '💤' },
  unknown: { color: '#64748B', label: '알 수 없음', emoji: '❔' },
};

// 이름표 버블 배경(흰 글씨) — WCAG AA(흰 글씨 4.5:1↑) 통과 음영.
// 우측 목록 점(STATE_META.color)은 밝은 색 유지(라벨 텍스트가 있어 접근성 OK).
export const TAG_COLOR = {
  working: '#15803D', done: '#2563EB', blocked: '#B45309',
  stalled: '#DC2626', unknown: '#64748B',
};
// 색맹 안전: 상태를 색만이 아니라 형태(흰 글리프)로도 구분 (WCAG 1.4.1 이중부호화)
// working 은 기존 점멸 점이 표식 → 글리프 없음. 나머지는 형태가 서로 뚜렷한 단색 기호.
export const STATE_GLYPH = { working: null, done: '✓', blocked: '!', stalled: 'z', unknown: '?' };

// ---------- 캐릭터 외형 팔레트 (세션 ID 해시로 고정 선택) ----------
export const SKINS  = ['#f1c27d', '#e0ac69', '#ffdbac', '#d9a066'];
export const HAIRS  = ['#2d2235', '#4a3320', '#7b4a12', '#26262c', '#8c2f2f', '#3a4a8c', '#62656d', '#c75b8a'];
export const HAIRHI = ['#4a3a58', '#65482e', '#9e6420', '#3f3f48', '#aa4848', '#5163ab', '#83868f', '#d878a4'];
export const SHIRTS = ['#4a78bb', '#bb5555', '#46a468', '#8f68c4', '#c39247', '#46a8a2', '#7a8694', '#a85f86'];

// ---------- 상황별 랜덤 대사 ----------
export const SAY = {
  room_break: ['커피 한 잔 ☕', '잠깐 쉬자', '휴~ 당 떨어졌다', '소파 최고야', '5분만 쉴게요', '리프레시 🌿'],
  room_pantry: ['간식 타임 🍪', '물 좀 마시고', '당 충전! 🍫', '냉장고에 내 거…', '커피 리필', '컵라면 ㄱ?'],
  walk: ['스트레칭 좀…', '다리 저려', '잠깐 산책', '머리 식히자', '어디 가지~', '한 바퀴 돌고 올게'],
  working: ['음… 왜 안 되지', '거의 다 됐다', '빌드 도는 중 ⏳', '이거 커밋!', '집중 모드 🔥', '로그 어디 갔어', '한 줄만 더…'],
  done: ['끝났다! 🎉', '오늘도 수고', 'PR 올렸어요', '리뷰 ㄱㄱ', '깔끔하네 ✨', '머지 완료'],
  blocked: ['확인 부탁해요 🙏', '입력 대기 중…', '음, 어떻게 할까', '잠깐 멈춤', '결정만 해주시면!'],
  stalled: ['음…', '어? 멈췄나', 'zzz', '응답이 없네', '뭔가 이상한데'],
};

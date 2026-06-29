// ===== 테마 레지스트리 (환경색 데이터 + 활성 테마 해석) =====
// 환경색(바닥·벽·가구·러그·존 배경)만 테마로 분리. 상태 의미색은 app.js 의 SCREEN/STATE_META/TAG_COLOR 가 보유.
// 새 테마 추가 = THEMES 에 makeTheme(...) 한 줄. 활성 테마는 localStorage('office.theme').
import { darken } from './lib/color.mjs';

// ===== 테마 레지스트리 =====
// 환경색(바닥·벽·가구·러그·존 배경)만 테마로 분리한다. 상태 의미색(작업중/완료/대기/멈춤 =
// SCREEN·STATE_META·TAG_COLOR)은 의미 보존을 위해 테마와 무관하게 공유한다.
// 새 테마 추가 = THEMES 에 객체 1개 추가(같은 키 모양). 활성 테마는 localStorage('office.theme').
export const THEMES = {
  apple: {
    label: 'Apple Light',
    // 월드 팔레트 (화이트 · 라이트오크 · 알루미늄 · 소프트 그레이)
    C: {
      // 작업 영역 바닥: 매끄러운 단색 블루그레이(체크·흰점 없음, 시안 스와치 매칭)
      tile: '#a7b3c6', tileAlt: '#a2aec2', grout: 'rgba(60,72,96,.05)',
      wall: '#cdd5e0', wallShade: '#b3bdcb', wallDark: '#9ba6b6',
      glass: '#b5dcf2', glassDeep: '#8cc6e8',
      roomWood: '#ecd9b4', roomWoodAlt: '#e6d1a6', roomWoodSeam: 'rgba(160,120,60,.18)',
      roomB: '#f1ece3', roomBalt: '#eae4d8',          // 탕비실: 따뜻한 크림 타일
      roomEdge: '#c2c6cc',
      rugs: [['#dde3ec', '#e5eaf1'], ['#dee8de', '#e6eee6'], ['#ece5da', '#f1ebe2']],
      rugLine: 'rgba(0,0,0,.05)',
      // 라이트 오크 데스크 + 알루미늄
      oakHi: '#f0dcae', oak: '#e7cd97', oakGrain: '#d4b67c', oakEdge: '#c9a96a',
      alu: '#d4d7dc', aluHi: '#e8eaee', aluDark: '#b2b6be',
      white: '#f8f9fa', whiteEdge: '#dfe2e6',
      chair: '#aeb3bb', chairSeat: '#c9ccd2', chairDark: '#8d929b',
      sofaBase: '#8fb98a', sofaSeat: '#a8cca0', sofaHi: '#c4ddba', sofaDark: '#6e9b6b',  // 세이지 그린 라운지
      tan: '#d8b27e', tanDark: '#bb9560',
      potDark: '#c9ccd2', pot: '#eceef0', potHi: '#ffffff',
      leafDark: '#3a9457', leaf: '#4cb56c', leafHi: '#6cc986',
      outline: '#4a4d55', monitor: '#1d1f24', monitorHi: '#34373e',
      screenBezel: '#0f1115',
      shadow: 'rgba(60,65,78,.13)',
    },
    // 상단 4개 존 바닥색
    zoneFloors: { ailab: '#F5EEFF', collab: '#FFF4E5', cafe: '#EAF5EA', focus: '#EEF4FF' },
    // 존별 area rug [c1(안), c2(테)]
    zoneRug: {
      ailab: ['#E7DCF6', '#EFE7FB'], collab: ['#F2E5CC', '#F8F0DE'],
      cafe: ['#D7E9D7', '#E3F0E3'], focus: ['#DCE7F6', '#E8EFFB'],
    },
    // Development/Infrastructure/QA 존 바닥·러그·구분선·빈슬롯 라운지 러그
    bg: {
      dev: '#EEF4FF', devRug: ['#D6E0F0', '#DFE8F5'],
      infra: '#EAEEF4', infraRug: ['#CFD7E4', '#DAE1EC'],
      qa: '#F1F6EF', qaRug: ['#D3E2CE', '#DEEAD9'],
      lounge: ['#DEE5F0', '#E8EDF6'], divider: 'rgba(120,130,150,.12)',
    },
    // 페이지 크롬(헤더·사이드바·캔버스 외부). 상태 의미색(--working 등)은 테마 무관 고정.
    chrome: {
      bg: '#F0F3F8', panel: '#FFFFFF', panel2: '#F8FAFC', line: '#CBD5E1',
      text: '#0F172A', secondary: '#334155', dim: '#64748B', outside: '#aab0ba',
    },
    decorStyle: 'office',
  },
};
// 새 테마는 apple 베이스에 차이값만 덮어써 정의(누락 토큰 방지). 다크 계열은 outline/shadow도 함께 보정.
// darken() → lib/color.mjs
// zoneRug 미지정 테마는 바닥색에서 러그를 파생(바닥 위 살짝 어두운 톤) → 자동 톤 일치
function deriveRugs(zf) {
  const out = {};
  for (const k of Object.keys(zf)) out[k] = [darken(zf[k], 0.07), darken(zf[k], 0.035)];
  return out;
}
function makeTheme(label, o) {
  o = o || {};
  const zoneFloors = { ...THEMES.apple.zoneFloors, ...(o.zoneFloors || {}) };
  return {
    label,
    C: { ...THEMES.apple.C, ...(o.C || {}) },
    zoneFloors,
    // 러그를 명시하면 그대로, 아니면 바닥에서 파생(테마 바닥에 애플 파스텔 러그가 덮이던 문제 방지)
    zoneRug: o.zoneRug ? { ...THEMES.apple.zoneRug, ...o.zoneRug } : deriveRugs(zoneFloors),
    bg: { ...THEMES.apple.bg, ...(o.bg || {}) },
    chrome: { ...THEMES.apple.chrome, ...(o.chrome || {}) },
    decorStyle: o.decorStyle || 'office',   // 좌우 페리미터 장식 세트(DECOR 키)
  };
}

// ── Night Office (다크) ── 어두운 표면 + 밝은 외곽선/옅은 그림자 보정
THEMES.dark = makeTheme('Night Office', {
  C: {
    tile: '#2b3142', tileAlt: '#262c3b', grout: 'rgba(0,0,0,.18)',
    wall: '#3a4154', wallShade: '#2e3343', wallDark: '#222634',
    glass: '#3d6f8f', glassDeep: '#2c536b',
    roomWood: '#6b5836', roomWoodAlt: '#5c4b2d', roomWoodSeam: 'rgba(0,0,0,.25)',
    roomB: '#3b4254', roomBalt: '#333a4a', roomEdge: '#1e2230',
    rugs: [['#323a4d', '#3a4356'], ['#2f3d3a', '#374843'], ['#3d3a31', '#47433a']],
    rugLine: 'rgba(0,0,0,.25)',
    oakHi: '#9a7c4a', oak: '#876a3c', oakGrain: '#6f5530', oakEdge: '#5a4527',
    alu: '#5a606e', aluHi: '#737a8a', aluDark: '#454a57',
    white: '#cfd5e0', whiteEdge: '#aab0bd',
    chair: '#586070', chairSeat: '#6a7384', chairDark: '#3f4655',
    sofaBase: '#4a7a52', sofaSeat: '#5d9266', sofaHi: '#79b283', sofaDark: '#356040',
    tan: '#b88a52', tanDark: '#8c6638',
    potDark: '#4a5160', pot: '#5e6678', potHi: '#7b8395',
    leafDark: '#2e7a47', leaf: '#3fa05c', leafHi: '#5cc079',
    outline: '#0f1320', monitor: '#10131c', monitorHi: '#262c3a',
    screenBezel: '#05070d', shadow: 'rgba(0,0,0,.32)',
  },
  zoneFloors: { ailab: '#2a2440', collab: '#3a3220', cafe: '#22331f', focus: '#1f2a40' },
  zoneRug: {
    ailab: ['#352c52', '#3f3560'], collab: ['#433a22', '#4d4329'],
    cafe: ['#243d24', '#2c472c'], focus: ['#243650', '#2a3f5e'],
  },
  bg: {
    dev: '#1f2940', devRug: ['#28324a', '#2f3a55'],
    infra: '#222a38', infraRug: ['#2a3344', '#323d50'],
    qa: '#1f2a25', qaRug: ['#28352c', '#2f3f34'], lounge: ['#2a3346', '#313c52'],
    divider: 'rgba(0,0,0,.3)',
  },
  chrome: {
    bg: '#11151f', panel: '#1b2130', panel2: '#161b27', line: '#2c3444',
    text: '#E5EAF2', secondary: '#AEB6C6', dim: '#7C8698', outside: '#0b0e16',
  },
});

// ── Warm Cozy (웜/코지) ── 우드 + 따뜻한 크림 (현재와 같은 라이트 계열, 팔레트만 교체)
THEMES.warm = makeTheme('Warm Cozy', {
  C: {
    tile: '#cdbfa6', tileAlt: '#c6b89e', grout: 'rgba(120,90,50,.06)',
    wall: '#e3d3b8', wallShade: '#d3c2a4', wallDark: '#bda988',
    roomWood: '#e6c896', roomWoodAlt: '#dcbb84',
    rugs: [['#ece0cc', '#f3ead9'], ['#e7d8c4', '#efe2d1'], ['#e4d3bd', '#eee2d2']],
    oakHi: '#e9c98c', oak: '#d9b06f', oakGrain: '#c39455', oakEdge: '#a87b41',
    white: '#fbf6ec', whiteEdge: '#e9dccb',
    chair: '#baa888', chairSeat: '#cfbf9f', chairDark: '#9a8568',
  },
  zoneFloors: { ailab: '#F3E9DA', collab: '#FBEFD7', cafe: '#EEF0DC', focus: '#F4ECDD' },
  zoneRug: {
    ailab: ['#EBDCC4', '#F3E8D4'], collab: ['#F4E6C8', '#FBF0DA'],
    cafe: ['#E3E6C8', '#EEF0D8'], focus: ['#ECE0CC', '#F4EBDA'],
  },
  bg: {
    dev: '#F5EEDF', devRug: ['#E6D8BF', '#EFE4CF'],
    infra: '#EFE6D4', infraRug: ['#E0D2B8', '#EADDC8'],
    qa: '#EFEEDB', qaRug: ['#DDE0C2', '#E9EAD2'], lounge: ['#EDE3CF', '#F4ECDB'],
    divider: 'rgba(150,120,80,.14)',
  },
  chrome: {
    bg: '#F4ECDD', panel: '#FFFBF3', panel2: '#F7F0E2', line: '#D8C8A8',
    text: '#3D3220', secondary: '#5C4B30', dim: '#8A7654', outside: '#b8a98a',
  },
});

// ── High Contrast (하이콘트라스트) ── 가독성·접근성 강조
THEMES.contrast = makeTheme('High Contrast', {
  C: {
    tile: '#dfe3ea', tileAlt: '#d6dbe4', grout: 'rgba(0,0,0,.1)',
    wall: '#ffffff', wallShade: '#c8ced8', wallDark: '#0f172a',
    roomEdge: '#0f172a',
    rugs: [['#eef1f6', '#ffffff'], ['#eaf1ea', '#ffffff'], ['#f1ece4', '#ffffff']],
    rugLine: 'rgba(0,0,0,.18)',
    outline: '#0b0e16', screenBezel: '#000000', shadow: 'rgba(15,23,42,.28)',
    chairDark: '#475569',
  },
  zoneFloors: { ailab: '#F3ECFF', collab: '#FFF6E6', cafe: '#EAF7EA', focus: '#EAF1FF' },
  bg: {
    dev: '#EEF4FF', devRug: ['#CCD9EE', '#D9E3F4'],
    infra: '#E6ECF4', infraRug: ['#C4D0E2', '#D2DCEC'],
    qa: '#EDF4EB', qaRug: ['#CBE0C6', '#D9E9D3'], lounge: ['#D6E0F0', '#E4ECF8'],
    divider: 'rgba(15,23,42,.25)',
  },
  chrome: {
    bg: '#FFFFFF', panel: '#FFFFFF', panel2: '#F1F5F9', line: '#0F172A',
    text: '#000000', secondary: '#1E293B', dim: '#475569', outside: '#64748B',
  },
});

// ── Retro Terminal (레트로 터미널) ── 검정 배경 + 그린 인광 CRT 감성
THEMES.terminal = makeTheme('Retro Terminal', {
  C: {
    tile: '#0a120a', tileAlt: '#0c150c', grout: 'rgba(0,255,90,.05)',
    wall: '#0e1a0e', wallShade: '#0a140a', wallDark: '#061006',
    glass: '#163a16', glassDeep: '#0e2a0e',
    roomWood: '#143314', roomWoodAlt: '#0f290f', roomWoodSeam: 'rgba(0,255,90,.08)',
    roomB: '#0f1f0f', roomBalt: '#0c1a0c', roomEdge: '#1f4a1f',
    rugs: [['#0e1f0e', '#123012'], ['#0d1d0d', '#112c11'], ['#0f210f', '#133313']],
    rugLine: 'rgba(0,255,90,.1)',
    oakHi: '#2a7a2a', oak: '#1f5f1f', oakGrain: '#174a17', oakEdge: '#103a10',
    alu: '#2c5c2c', aluHi: '#3f7f3f', aluDark: '#1d401d',
    white: '#9effa0', whiteEdge: '#5fbf61',
    chair: '#2a5a2a', chairSeat: '#357035', chairDark: '#1a3f1a',
    sofaBase: '#1f6f3a', sofaSeat: '#2a8a4a', sofaHi: '#3faf63', sofaDark: '#144f28',
    tan: '#3a8a3a', tanDark: '#256025',
    potDark: '#1d401d', pot: '#2a5c2a', potHi: '#3f7f3f',
    leafDark: '#1f8a3a', leaf: '#2fb04c', leafHi: '#4cd069',
    outline: '#031003', monitor: '#020a02', monitorHi: '#0f2f0f',
    screenBezel: '#000000', shadow: 'rgba(0,40,0,.4)',
  },
  zoneFloors: { ailab: '#0c1a0c', collab: '#0e1c0e', cafe: '#0a1a0a', focus: '#0c1c10' },
  zoneRug: {
    ailab: ['#102a10', '#143514'], collab: ['#0f280f', '#133313'],
    cafe: ['#0d240d', '#112e11'], focus: ['#0e2814', '#13351a'],
  },
  bg: {
    dev: '#081408', devRug: ['#0e220e', '#123012'],
    infra: '#0a160a', infraRug: ['#0e220e', '#122e12'],
    qa: '#081608', qaRug: ['#0d240d', '#113011'], lounge: ['#0e220e', '#133313'],
    divider: 'rgba(0,255,90,.12)',
  },
  chrome: {
    bg: '#030a03', panel: '#081408', panel2: '#061006', line: '#1a4a1a',
    text: '#7dff80', secondary: '#4fbf52', dim: '#359638', outside: '#010401',
  },
});

// ── Claude (브랜드) ── 테라코타 + 크림 (Anthropic 톤)
THEMES.claude = makeTheme('Claude', {
  C: {
    tile: '#e8ddd0', tileAlt: '#e1d5c6', grout: 'rgba(150,90,60,.05)',
    wall: '#efe6da', wallShade: '#ddd0c0', wallDark: '#c8b6a2',
    roomWood: '#e6c79c', roomWoodAlt: '#dcb988',
    rugs: [['#f1e6d8', '#f7efe4'], ['#eaddcc', '#f2e8da'], ['#ecdfd0', '#f3e9dc']],
    oakHi: '#e8c897', oak: '#d9b078', oakGrain: '#c2945c', oakEdge: '#a87a44',
    white: '#faf4ea', whiteEdge: '#e8dccb',
    sofaBase: '#cc7a52', sofaSeat: '#dd9470', sofaHi: '#ecb295', sofaDark: '#a85f3a',
    tan: '#d99a6a', tanDark: '#b87440',
    leafDark: '#9a6b3a', leaf: '#bb884c', leafHi: '#d6a868',
  },
  zoneFloors: { ailab: '#F3E6DA', collab: '#FBEEDD', cafe: '#EFEADC', focus: '#F4EADD' },
  bg: {
    dev: '#F5EBDD', devRug: ['#E9D8C2', '#F1E4D2'],
    infra: '#EFE4D4', infraRug: ['#E2D0B9', '#ECDDC9'],
    qa: '#F0EBD9', qaRug: ['#DFD9BF', '#EAE5D0'], lounge: ['#EEE0CF', '#F5EBDB'],
    divider: 'rgba(180,120,80,.14)',
  },
  chrome: {
    bg: '#F0E9DD', panel: '#FFFBF4', panel2: '#F5EDE0', line: '#D9C3A8',
    text: '#3A2E22', secondary: '#5C4632', dim: '#8A6E54', outside: '#bca588',
  },
});

// ── Seoul Office (플레이스) ── 밝고 청량한 한국 IT 오피스: 쿨 블루그레이 + 메이플 + 스카이 액센트
THEMES.seoul = makeTheme('Seoul Office', {
  C: {
    tile: '#c2cdda', tileAlt: '#bcc7d5', wall: '#e2e9f1', wallShade: '#cdd6e2', wallDark: '#aab6c6',
    oakHi: '#f3e2bd', oak: '#ecd2a2', oakGrain: '#d8bd82', oakEdge: '#c4a468',
    sofaBase: '#5b94c9', sofaSeat: '#79abdc', sofaHi: '#9fc8ec', sofaDark: '#3f6f9e',
  },
  zoneFloors: { ailab: '#EAF0FB', collab: '#FFF6E8', cafe: '#EAF6F0', focus: '#EAF1FB' },
  bg: {
    dev: '#EDF3FC', devRug: ['#D4E1F2', '#DFE9F6'], infra: '#E8EEF6', infraRug: ['#CDD9EA', '#DAE3F0'],
    qa: '#EBF4F0', qaRug: ['#CFE3D8', '#DCEAE2'], lounge: ['#DCE7F4', '#E8EFF9'], divider: 'rgba(90,120,160,.14)',
  },
  chrome: { bg: '#EEF3FA', panel: '#FFFFFF', panel2: '#F4F8FD', line: '#C7D4E4', text: '#16263b', secondary: '#33506e', dim: '#6781a0', outside: '#9fb0c6' },
});

// ── New York Loft (플레이스) ── 인더스트리얼 로프트: 벽돌·콘크리트 + 앰버
THEMES.newyork = makeTheme('New York Loft', {
  C: {
    tile: '#b0a79c', tileAlt: '#a89f93', grout: 'rgba(60,45,30,.08)',
    wall: '#cabfb0', wallShade: '#b3a796', wallDark: '#8f8474',
    oakHi: '#caa06a', oak: '#b5854f', oakGrain: '#996c3c', oakEdge: '#7d5630',
    sofaBase: '#a45040', sofaSeat: '#bf6a58', sofaHi: '#d68f7e', sofaDark: '#7d3a2d',
    tan: '#c69a68', tanDark: '#9c7546',
  },
  zoneFloors: { ailab: '#E9E2D6', collab: '#EFE6D2', cafe: '#E6E6D4', focus: '#E8E3D8' },
  bg: {
    dev: '#ECE5D9', devRug: ['#D8CBB4', '#E2D7C4'], infra: '#E6DDCE', infraRug: ['#D2C4AC', '#DDD1BD'],
    qa: '#E8E6D5', qaRug: ['#D4CDB2', '#E0DAC6'], lounge: ['#E4DAC8', '#ECE3D4'], divider: 'rgba(90,70,45,.16)',
  },
  chrome: { bg: '#E8E1D4', panel: '#F7F2E9', panel2: '#EEE7DA', line: '#CBBBA2', text: '#33291d', secondary: '#544532', dim: '#82705a', outside: '#9c8f7c' },
});

// ── Silicon Valley (플레이스) ── 밝은 스타트업: 화이트 + 그린 에너지
THEMES.svalley = makeTheme('Silicon Valley', {
  C: {
    tile: '#dfe6e2', tileAlt: '#d7dfdb', wall: '#eef2ef', wallShade: '#d8e0db', wallDark: '#b6c2bb',
    oakHi: '#eadfb8', oak: '#ddcb95',
    sofaBase: '#3fae6a', sofaSeat: '#5cc585', sofaHi: '#85dba6', sofaDark: '#2c8a4f',
  },
  zoneFloors: { ailab: '#EFEAFB', collab: '#FBF4E2', cafe: '#E6F6E8', focus: '#E8F1FA' },
  bg: {
    dev: '#EDF5EF', devRug: ['#D2E6D8', '#DEEDE2'], infra: '#E9F0EB', infraRug: ['#CCE0D2', '#D9E9DD'],
    qa: '#E8F5EA', qaRug: ['#CBE6CF', '#D9EEDC'], lounge: ['#DCEAE0', '#E8F2EB'], divider: 'rgba(80,140,90,.14)',
  },
  chrome: { bg: '#EEF4F0', panel: '#FFFFFF', panel2: '#F4F9F5', line: '#CBDBD0', text: '#16291d', secondary: '#2f5640', dim: '#5e8770', outside: '#a3b3a8' },
});

// ── Tesla (브랜드) ── 미니멀 모노크롬: 화이트·그래파이트 + 레드 액센트
THEMES.tesla = makeTheme('Tesla', {
  C: {
    tile: '#dfe1e5', tileAlt: '#d7d9de', grout: 'rgba(0,0,0,.05)',
    wall: '#f0f1f3', wallShade: '#d6d8dd', wallDark: '#a9adb5',
    oakHi: '#d6d8dd', oak: '#c2c5cc', oakGrain: '#aab0b8', oakEdge: '#8e949d',   // 무광 그래파이트 데스크
    sofaBase: '#cc3d39', sofaSeat: '#e05a52', sofaHi: '#ee8079', sofaDark: '#9e2a28',
    tan: '#b0b4bb', tanDark: '#8a8f98',
  },
  zoneFloors: { ailab: '#EEEFF2', collab: '#F2F3F5', cafe: '#EDF0EF', focus: '#EBEEF2' },
  bg: {
    dev: '#EFF1F4', devRug: ['#DADDE3', '#E5E8ED'], infra: '#E9EBEF', infraRug: ['#D2D6DD', '#DEE2E8'],
    qa: '#EDEFF1', qaRug: ['#D6DBD9', '#E2E6E4'], lounge: ['#E0E3E9', '#EAEDF1'], divider: 'rgba(40,44,52,.14)',
  },
  chrome: { bg: '#F2F3F5', panel: '#FFFFFF', panel2: '#EEEFF2', line: '#C8CCD3', text: '#16181c', secondary: '#3a3e46', dim: '#6b7079', outside: '#9a9ea6' },
});

// ── Microsoft (브랜드) ── Fluent 라이트 + 블루
THEMES.microsoft = makeTheme('Microsoft', {
  C: {
    tile: '#cdd6e3', tileAlt: '#c6cfdd', wall: '#e6ecf4', wallShade: '#d2dae6', wallDark: '#aeb9ca',
    oakHi: '#eedfba', oak: '#e2cd98',
    sofaBase: '#3a78c4', sofaSeat: '#5a95da', sofaHi: '#86b6ec', sofaDark: '#285a9b',
  },
  zoneFloors: { ailab: '#EBE9FA', collab: '#FBF3E0', cafe: '#E7F4EA', focus: '#E6EFFB' },
  bg: {
    dev: '#EBF1FB', devRug: ['#D2DEF1', '#DEE8F6'], infra: '#E7EDF6', infraRug: ['#CBD8EA', '#D8E2F0'],
    qa: '#E9F3EC', qaRug: ['#CDE4D1', '#DBEDDE'], lounge: ['#DAE6F4', '#E7EFF9'], divider: 'rgba(60,110,180,.14)',
  },
  chrome: { bg: '#EDF2F9', panel: '#FFFFFF', panel2: '#F3F7FC', line: '#C6D3E4', text: '#16243a', secondary: '#30496e', dim: '#5f7a9f', outside: '#9fadc2' },
});

// ── OpenAI (브랜드) ── 다크 + 틸 그린 (dark 베이스에서 파생)
THEMES.openai = makeTheme('OpenAI', {
  C: {
    ...THEMES.dark.C,
    tile: '#22302c', tileAlt: '#1e2b28', glass: '#1f6b5e', glassDeep: '#134d44',
    sofaBase: '#0e8c6e', sofaSeat: '#13a583', sofaHi: '#2bc49e', sofaDark: '#0a6b55',
    leafDark: '#0e8c6e', leaf: '#13a583', leafHi: '#2bc49e',
  },
  zoneFloors: { ...THEMES.dark.zoneFloors, cafe: '#173a30', focus: '#1c2e2a' },
  zoneRug: { ...THEMES.dark.zoneRug, cafe: ['#1c3d30', '#23493a'] },
  bg: { ...THEMES.dark.bg, dev: '#16241f', devRug: ['#1e3029', '#243a31'], qa: '#16241d' },
  chrome: { ...THEMES.dark.chrome, bg: '#0a1411', panel: '#10201b', panel2: '#0c1813', line: '#1d3a32', text: '#d6f0e6', secondary: '#9fc9bb', dim: '#6b9688', outside: '#06100d' },
});

// 테마별 시그니처 장식 세트 연결(나머지는 'office' 기본)
THEMES.terminal.decorStyle = 'terminal';
THEMES.newyork.decorStyle = 'loft';
THEMES.warm.decorStyle = 'cozy';
THEMES.svalley.decorStyle = 'svalley';
THEMES.tesla.decorStyle = 'tesla';
THEMES.openai.decorStyle = 'openai';

export function resolveTheme() {
  try { const t = localStorage.getItem('office.theme'); if (t && THEMES[t]) return t; } catch (e) { /* */ }
  return 'apple';
}

// 표시용 포매터 모음 — 시간·토큰·사용량 라벨. Date.now()/Intl 외 의존 없음. 순수 함수.

// 상대 시각: "방금"/"N분 전"/"N시간 전"/"N일 전"
export function rel(ms) {
  if (!ms) return '—';
  const d = Date.now() - ms;
  if (d < 60e3) return '방금';
  if (d < 3600e3) return Math.floor(d / 60e3) + '분 전';
  if (d < 86400e3) return Math.floor(d / 3600e3) + '시간 전';
  return Math.floor(d / 86400e3) + '일 전';
}

// rate limit 재설정까지 남은 시간 + 절대 시각
export function resetLabel(epochSec) {
  if (!epochSec) return '';
  const ms = epochSec * 1000 - Date.now();
  if (ms <= 0) return '곧 재설정';
  const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
  const when = new Date(epochSec * 1000).toLocaleString('ko-KR',
    { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  return h >= 1 ? `${h}시간 ${m}분 후 재설정 · ${when}` : `${m}분 후 재설정 · ${when}`;
}

// 사용량 % → 신호색(빨강/주황/초록)
export function usageColor(p) { return p >= 85 ? '#EF4444' : p >= 60 ? '#F59E0B' : '#22C55E'; }

// 스냅샷 신선도: office-usage.json 은 statusline 렌더 시점에만 갱신됨(라이브 아님)
export function freshnessLabel(tsMs) {
  if (!tsMs) return '';
  const age = Date.now() - tsMs;
  if (age < 90e3) return '방금 기준';
  const m = Math.round(age / 60e3);
  if (m < 60) return `${m}분 전 기준`;
  const h = Math.floor(m / 60);
  return `${h}시간 ${m % 60}분 전 기준`;
}

// ISO → "15:42"
export function fmtTime(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }); } catch (e) { return ''; }
}

// mcp__chrome-devtools__take_screenshot → take_screenshot
export function toolShortName(name) {
  if (typeof name !== 'string') return 'tool';
  if (name.startsWith('mcp__')) { const p = name.split('__'); return p[p.length - 1] || name; }
  return name;
}

// 1228318 → "1.2M"
export function fmtTokens(n) {
  if (n == null || isNaN(n)) return null;
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'K';
  return String(n);
}

// 생성 후 경과 → "2시간"/"15분"/"3일"
export function fmtElapsed(createdAt) {
  if (!createdAt) return null;
  const ms = Date.now() - new Date(createdAt).getTime();
  if (isNaN(ms) || ms < 0) return null;
  const m = Math.floor(ms / 60000);
  if (m < 60) return m + '분';
  const h = Math.floor(m / 60);
  if (h < 24) return h + '시간';
  return Math.floor(h / 24) + '일';
}

// ---------- Claude 서비스 상태 (status.claude.com, 주기 갱신) ----------
// Statuspage 공개 API는 CORS 허용(*) → 브라우저에서 직접 폴링.
// 헤더의 #claude-status 엘리먼트에만 의존하는 자족 모듈(side-effect import 로 자동 기동).
const CSTATUS_META = {
  none: { color: '#22C55E', label: '정상' },
  minor: { color: '#F59E0B', label: '일부 저하' },
  major: { color: '#F97316', label: '장애' },
  critical: { color: '#EF4444', label: '심각 장애' },
  maintenance: { color: '#3B82F6', label: '점검 중' },
};
const COMP_STATUS_KO = {
  operational: '정상', degraded_performance: '성능 저하', partial_outage: '부분 장애',
  major_outage: '전면 장애', under_maintenance: '점검 중',
};
async function fetchClaudeStatus() {
  const el = document.getElementById('claude-status');
  if (!el) return;
  const dot = el.querySelector('.cstatus-dot'), lbl = el.querySelector('.cstatus-label');
  try {
    const res = await fetch('https://status.claude.com/api/v2/summary.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('http ' + res.status);
    const d = await res.json();
    const ind = (d.status && d.status.indicator) || 'none';
    const m = CSTATUS_META[ind] || CSTATUS_META.none;
    dot.style.background = m.color;
    lbl.textContent = 'Claude ' + m.label;
    el.classList.add('live');
    const comps = (d.components || []).filter((c) => !c.group && c.showcase !== false)
      .map((c) => `${c.status === 'operational' ? '●' : '▲'} ${c.name}: ${COMP_STATUS_KO[c.status] || c.status}`);
    const inc = (d.incidents || []).filter((i) => i.status !== 'resolved').map((i) => `⚠ ${i.name} (${i.status})`);
    const upd = (d.page && d.page.updated_at) ? new Date(d.page.updated_at).toLocaleString('ko-KR') : '';
    el.title = [(d.status && d.status.description) || 'Claude 서비스 상태', inc.length ? '' : null, ...inc, '', ...comps, '', upd ? `갱신: ${upd}` : '']
      .filter((x) => x !== null).join('\n');
  } catch (e) {
    dot.style.background = '#94A3B8';
    lbl.textContent = 'Claude 상태 확인 불가';
    el.classList.remove('live');
    el.title = '상태를 불러오지 못했습니다 (네트워크/차단). 클릭하면 status.claude.com 으로 이동합니다.';
  }
}
fetchClaudeStatus();
setInterval(fetchClaudeStatus, 60000);   // 60초마다 갱신

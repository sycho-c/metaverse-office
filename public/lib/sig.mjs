// 세션 패널 변화 감지 시그니처 — 상태·현재작업·메시지수·지표·마지막 메시지 꼬리. 순수 함수.
export function sessionSig(d) {
  const last = d.messages && d.messages.length ? d.messages[d.messages.length - 1].text : '';
  const fanSig = (d.fan || []).map((f) => f.label).join(',');
  return (d.state || '') + '|' + (d.detail || '') + '|' + (d.messages ? d.messages.length : 0) + '|' +
    (d.tokens || 0) + '|' + ((d.inFlight && d.inFlight.tasks) || 0) + '|' + ((d.children || []).length) + '|' + fanSig + '|' + last.slice(-48);
}

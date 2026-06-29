// 결정적 FNV-1a 해시 — 세션 ID → 외형/좌석 시드. 순수 함수.
export function hash(s) {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

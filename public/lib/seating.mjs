// 좌석 배정 — pod별 인원수와 좌석 채우는 순서를 시드 고정으로 안정 산출. 순수 함수.
import { hash } from './hash.mjs';

// pod별 인원수(1~4 다양) — 시드 고정으로 안정, 합 = n
export function seatAssignment(n, pods) {
  const counts = new Array(pods).fill(0);
  if (n <= 0) return counts;
  let seed = (Math.imul(n, 2654435761) + Math.imul(pods, 40503)) >>> 0;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const choices = [1, 2, 2, 3, 3, 4];           // 2·3명 비중↑
  let remaining = n;
  for (let i = 0; i < pods && remaining > 0; i++) {
    const c = Math.min(choices[Math.floor(rnd() * choices.length)], remaining);
    counts[i] = c; remaining -= c;
  }
  let i = 0, guard = 0;
  while (remaining > 0 && guard++ < n + pods) {
    if (counts[i] < 4) { counts[i]++; remaining--; }
    i = (i + 1) % pods;
  }
  return counts;
}

export function seatOrder(p) {                          // pod 내 좌석 슬롯 채우는 순서(다양화)
  const base = [0, 1, 2, 3];
  let seed = hash('seat' + p);
  for (let i = 3; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [base[i], base[j]] = [base[j], base[i]];
  }
  return base;
}

// pod 변형 B(좌우 책상 마주보기) 여부 — 4인 만석 + 시드. 좌석 배치/충돌/그리기 공통.
export function podVariantB(p, seats) {
  const h = hash('pod' + p);
  return ((h >>> 8) % 3 === 2) && seats.filter(Boolean).length === 4;
}

// 가시 세션을 pod별 좌석 배열[pods][4]에 배정(시드 고정). 빈칸은 undefined.
export function buildSeatMap(vis, pods) {
  const counts = seatAssignment(vis.length, pods);
  const map = [];
  let idx = 0;
  for (let p = 0; p < pods; p++) {
    const slots = [undefined, undefined, undefined, undefined];
    const order = seatOrder(p);
    for (let j = 0; j < counts[p] && idx < vis.length; j++) slots[order[j]] = vis[idx++];
    map.push(slots);
  }
  for (let p = 0; p < pods && idx < vis.length; p++) {   // 안전: 남은 세션 채움
    for (let j = 0; j < 4 && idx < vis.length; j++) if (!map[p][j]) map[p][j] = vis[idx++];
  }
  return map;
}

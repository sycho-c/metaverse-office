import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seatAssignment, seatOrder, buildSeatMap, podVariantB } from '../public/lib/seating.mjs';

test('seatAssignment: 인원 0 → 전부 0', () => {
  assert.deepEqual(seatAssignment(0, 4), [0, 0, 0, 0]);
});

test('seatAssignment: 합이 정확히 n (수용 가능 범위)', () => {
  for (const [n, pods] of [[1, 1], [3, 2], [5, 3], [8, 4], [16, 8]]) {
    const counts = seatAssignment(n, pods);
    assert.equal(counts.reduce((a, b) => a + b, 0), n, `n=${n} pods=${pods}`);
  }
});

test('seatAssignment: 좌석은 pod당 0~4', () => {
  const counts = seatAssignment(12, 5);
  for (const c of counts) assert.ok(c >= 0 && c <= 4);
  assert.equal(counts.length, 5);
});

test('seatAssignment: 결정적', () => {
  assert.deepEqual(seatAssignment(7, 3), seatAssignment(7, 3));
});

test('seatOrder: [0,1,2,3]의 순열', () => {
  for (let p = 0; p < 6; p++) {
    const order = seatOrder(p);
    assert.deepEqual([...order].sort((a, b) => a - b), [0, 1, 2, 3], `pod ${p}`);
  }
});

test('seatOrder: 결정적', () => {
  assert.deepEqual(seatOrder(2), seatOrder(2));
});

test('buildSeatMap: pods×4 형태 + 가시 세션 전원 배정', () => {
  const vis = Array.from({ length: 7 }, (_, i) => ({ id: 's' + i }));
  const map = buildSeatMap(vis, 3);
  assert.equal(map.length, 3);
  for (const slots of map) assert.equal(slots.length, 4);
  const placed = map.flat().filter(Boolean);
  assert.equal(placed.length, 7);                       // 전원 배정
  assert.equal(new Set(placed.map((s) => s.id)).size, 7); // 중복 없음
});

test('buildSeatMap: 결정적', () => {
  const vis = Array.from({ length: 5 }, (_, i) => ({ id: 'x' + i }));
  assert.deepEqual(buildSeatMap(vis, 2), buildSeatMap(vis, 2));
});

test('podVariantB: 4인 만석 아니면 항상 false', () => {
  assert.equal(podVariantB(0, [{}, {}, undefined, undefined]), false);
  assert.equal(podVariantB(1, []), false);
});

test('podVariantB: 결정적', () => {
  const seats = [{}, {}, {}, {}];
  assert.equal(podVariantB(3, seats), podVariantB(3, seats));
});

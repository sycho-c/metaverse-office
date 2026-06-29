import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookOf } from '../public/lib/look.mjs';
import { SKINS, HAIRS, HAIRHI, SHIRTS } from '../public/constants.mjs';

test('lookOf: 결정적(같은 id → 같은 외형)', () => {
  assert.deepEqual(lookOf('session-1'), lookOf('session-1'));
});

test('lookOf: 팔레트 멤버십 + 타입', () => {
  const lk = lookOf('abc');
  assert.ok(SKINS.includes(lk.skin));
  assert.ok(HAIRS.includes(lk.hair));
  assert.ok(HAIRHI.includes(lk.hairHi));
  assert.ok(SHIRTS.includes(lk.shirt));
  assert.ok(lk.deskKind >= 0 && lk.deskKind < 3);
  assert.ok(lk.hairStyle >= 0 && lk.hairStyle < 4);
  assert.equal(typeof lk.glasses, 'boolean');
  assert.equal(typeof lk.headphone, 'boolean');
  assert.equal(typeof lk.collar, 'boolean');
  assert.ok(lk.phase >= 0 && lk.phase <= Math.PI * 2);
});

test('lookOf: 헤어 색과 하이라이트 인덱스 일치', () => {
  const lk = lookOf('xyz');
  assert.equal(HAIRS.indexOf(lk.hair), HAIRHI.indexOf(lk.hairHi));
});

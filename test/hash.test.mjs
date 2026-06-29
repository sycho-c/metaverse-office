import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash } from '../public/lib/hash.mjs';

test('hash: 결정적(같은 입력 → 같은 값)', () => {
  assert.equal(hash('abc'), hash('abc'));
  assert.equal(hash('session-123'), hash('session-123'));
});

test('hash: 입력이 다르면 값도 다름', () => {
  assert.notEqual(hash('abc'), hash('abd'));
  assert.notEqual(hash('a'), hash('b'));
});

test('hash: uint32 범위 정수 반환', () => {
  for (const s of ['', 'x', 'long-session-id-9999', '한글ID']) {
    const h = hash(s);
    assert.ok(Number.isInteger(h), `정수: ${s}`);
    assert.ok(h >= 0 && h < 2 ** 32, `범위: ${s}`);
  }
});

test('hash: 빈 문자열은 FNV offset basis', () => {
  assert.equal(hash(''), 2166136261);
});

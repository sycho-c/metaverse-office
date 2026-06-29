import { test } from 'node:test';
import assert from 'node:assert/strict';
import { darken } from '../public/lib/color.mjs';

test('darken: f=0 이면 색 불변', () => {
  assert.equal(darken('#ffffff', 0), '#ffffff');
  assert.equal(darken('#808080', 0), '#808080');
});

test('darken: f=1 이면 검정', () => {
  assert.equal(darken('#ffffff', 1), '#000000');
  assert.equal(darken('#abcdef', 1), '#000000');
});

test('darken: 3자리 hex 확장', () => {
  assert.equal(darken('#fff', 0), '#ffffff');
  assert.equal(darken('#fff', 0.5), darken('#ffffff', 0.5));
});

test('darken: 절반 어둡게', () => {
  assert.equal(darken('#808080', 0.5), '#404040');
});

test('darken: 항상 #rrggbb 7자 반환', () => {
  for (const c of ['#000000', '#ffffff', '#123abc', '#0a0b0c']) {
    const out = darken(c, 0.3);
    assert.match(out, /^#[0-9a-f]{6}$/);
  }
});

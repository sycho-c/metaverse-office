import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionSig } from '../public/lib/sig.mjs';

const base = () => ({
  state: 'working', detail: '작업 중', messages: [{ text: 'hello' }],
  tokens: 1000, inFlight: { tasks: 2 }, children: [{ href: 'x' }], fan: [{ label: 'a' }],
});

test('sessionSig: 같은 데이터 → 같은 시그니처', () => {
  assert.equal(sessionSig(base()), sessionSig(base()));
});

test('sessionSig: 빈 객체도 안전', () => {
  assert.equal(typeof sessionSig({}), 'string');
});

test('sessionSig: 각 추적 필드 변화 감지', () => {
  const sig0 = sessionSig(base());
  const mutate = (k, v) => { const d = base(); d[k] = v; return sessionSig(d); };
  assert.notEqual(sig0, mutate('state', 'done'));
  assert.notEqual(sig0, mutate('detail', '다른 작업'));
  assert.notEqual(sig0, mutate('tokens', 2000));
  assert.notEqual(sig0, mutate('messages', [{ text: 'hello' }, { text: 'more' }]));
  assert.notEqual(sig0, mutate('inFlight', { tasks: 3 }));
  assert.notEqual(sig0, mutate('children', []));
  assert.notEqual(sig0, mutate('fan', [{ label: 'b' }]));
});

test('sessionSig: 마지막 메시지 본문 변화 감지', () => {
  const d1 = base(); const d2 = base();
  d2.messages = [{ text: 'completely different message tail' }];
  assert.notEqual(sessionSig(d1), sessionSig(d2));
});

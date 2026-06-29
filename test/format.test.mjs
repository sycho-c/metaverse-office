import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rel, resetLabel, usageColor, freshnessLabel,
  fmtTime, toolShortName, fmtTokens, fmtElapsed,
} from '../public/lib/format.mjs';

test('usageColor: 임계값 신호색', () => {
  assert.equal(usageColor(90), '#EF4444');
  assert.equal(usageColor(85), '#EF4444');   // 85 이상 빨강
  assert.equal(usageColor(84), '#F59E0B');
  assert.equal(usageColor(60), '#F59E0B');   // 60 이상 주황
  assert.equal(usageColor(59), '#22C55E');
  assert.equal(usageColor(0), '#22C55E');
});

test('fmtTokens: 단위 축약', () => {
  assert.equal(fmtTokens(null), null);
  assert.equal(fmtTokens(NaN), null);
  assert.equal(fmtTokens(999), '999');
  assert.equal(fmtTokens(1000), '1K');
  assert.equal(fmtTokens(1500), '2K');       // 반올림
  assert.equal(fmtTokens(1228318), '1.2M');
});

test('toolShortName: mcp 접두 제거', () => {
  assert.equal(toolShortName('mcp__chrome-devtools__take_screenshot'), 'take_screenshot');
  assert.equal(toolShortName('Bash'), 'Bash');
  assert.equal(toolShortName(123), 'tool');
  assert.equal(toolShortName(null), 'tool');
  assert.equal(toolShortName('mcp__x__'), 'mcp__x__');  // 끝이 빈 세그먼트면 원본 유지
});

test('fmtTime: 빈 입력은 빈 문자열, 유효 ISO는 HH:MM', () => {
  assert.equal(fmtTime(''), '');
  assert.equal(fmtTime(null), '');
  assert.match(fmtTime('2026-06-26T15:42:00'), /^\d{1,2}:\d{2}$/);
});

test('rel: 상대 시각', () => {
  const now = Date.now();
  assert.equal(rel(0), '—');
  assert.equal(rel(now), '방금');
  assert.equal(rel(now - 2 * 60e3), '2분 전');
  assert.equal(rel(now - 2 * 3600e3), '2시간 전');
  assert.equal(rel(now - 3 * 86400e3), '3일 전');
});

test('fmtElapsed: 경과 표기', () => {
  const now = Date.now();
  assert.equal(fmtElapsed(null), null);
  assert.equal(fmtElapsed(new Date(now + 60e3).toISOString()), null);  // 미래
  assert.equal(fmtElapsed(new Date(now - 30 * 60e3).toISOString()), '30분');
  assert.equal(fmtElapsed(new Date(now - 2 * 3600e3).toISOString()), '2시간');
  assert.equal(fmtElapsed(new Date(now - 3 * 86400e3).toISOString()), '3일');
});

test('resetLabel: 빈 입력/과거/미래', () => {
  assert.equal(resetLabel(0), '');
  assert.equal(resetLabel(Math.floor(Date.now() / 1000) - 100), '곧 재설정');
  const future = Math.floor(Date.now() / 1000) + 2 * 3600 + 5 * 60;
  assert.match(resetLabel(future), /후 재설정/);
});

test('freshnessLabel: 신선도 표기', () => {
  const now = Date.now();
  assert.equal(freshnessLabel(0), '');
  assert.equal(freshnessLabel(now), '방금 기준');
  assert.equal(freshnessLabel(now - 5 * 60e3), '5분 전 기준');
  assert.match(freshnessLabel(now - 2 * 3600e3), /시간.*기준/);
});

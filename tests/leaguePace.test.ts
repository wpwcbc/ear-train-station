import test from 'node:test';
import assert from 'node:assert/strict';

import { computeXpPace } from '../src/lib/league.ts';

test('computeXpPace: 0 xp => 0 pace', () => {
  assert.deepEqual(computeXpPace(0, 1234), { perDay: 0, perHour: 0 });
});

test('computeXpPace: 0 ms => returns xp (immediate)', () => {
  const p = computeXpPace(120, 0);
  assert.equal(Math.round(p.perHour), 120);
  assert.equal(Math.round(p.perDay), 120);
});

test('computeXpPace: basic day/hour math', () => {
  // 240 XP needed over 2 days => 120/day
  const p = computeXpPace(240, 2 * 24 * 60 * 60 * 1000);
  assert.equal(Math.round(p.perDay), 120);
  assert.equal(Math.round(p.perHour), 5);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { leagueWeekWindow, msUntilLeagueWeekEnds } from '../src/lib/league.ts';

test('leagueWeekWindow: Monday 00:00 to next Monday 00:00 (local time)', () => {
  const now = new Date('2026-02-28T12:00:00+08:00'); // Sat
  const { start, end } = leagueWeekWindow(now);

  assert.equal(start.toISOString(), new Date('2026-02-22T16:00:00.000Z').toISOString());
  assert.equal(end.toISOString(), new Date('2026-03-01T16:00:00.000Z').toISOString());
});

test('msUntilLeagueWeekEnds: clamps at >= 0 and shrinks over time', () => {
  const a = new Date('2026-02-28T12:00:00+08:00');
  const b = new Date('2026-03-01T23:59:00+08:00');
  const msA = msUntilLeagueWeekEnds(a);
  const msB = msUntilLeagueWeekEnds(b);

  assert.ok(msA > msB);
  assert.ok(msB > 0);

  // Right at the boundary, a new league week begins, so the countdown resets.
  const boundary = new Date('2026-03-02T00:00:00+08:00');
  assert.equal(msUntilLeagueWeekEnds(boundary), 7 * 24 * 60 * 60 * 1000);
});

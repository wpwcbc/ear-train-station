import test from 'node:test';
import assert from 'node:assert/strict';

import { computeWorkoutWeekSummary } from '../src/lib/workoutWeekSummary.ts';

function makeGetSessionDone(done: Record<string, { s1?: boolean; s2?: boolean }>) {
  return (dayKey: string, session: 1 | 2) => {
    const d = done[dayKey] || {};
    return session === 1 ? Boolean(d.s1) : Boolean(d.s2);
  };
}

test('computeWorkoutWeekSummary: counts active days (>=1 session) and total sessions', () => {
  const todayKey = '2026-03-05';
  const getSessionDone = makeGetSessionDone({
    '2026-03-05': { s1: true, s2: true },
    '2026-03-04': { s1: true },
    '2026-03-03': { s2: true },
  });

  const s = computeWorkoutWeekSummary({ todayKey, getSessionDone });
  assert.equal(s.days.length, 7);
  assert.equal(s.activeDays, 3);
  assert.equal(s.totalSessions, 4);
});

test('computeWorkoutWeekSummary: prev window delta and pct', () => {
  const todayKey = '2026-03-14';
  const getSessionDone = makeGetSessionDone({
    // current window (2026-03-08..2026-03-14): 2 active days
    '2026-03-14': { s1: true },
    '2026-03-11': { s2: true },

    // previous window (2026-03-01..2026-03-07): 4 active days
    '2026-03-07': { s1: true },
    '2026-03-06': { s1: true },
    '2026-03-03': { s1: true },
    '2026-03-01': { s2: true },
  });

  const s = computeWorkoutWeekSummary({ todayKey, getSessionDone });
  assert.equal(s.activeDays, 2);
  assert.equal(s.prevActiveDays, 4);
  assert.equal(s.deltaDays, -2);
  assert.equal(s.deltaPct, -50);
});

test('computeWorkoutWeekSummary: deltaPct is null when prevActiveDays=0', () => {
  const s = computeWorkoutWeekSummary({ todayKey: '2026-03-05', getSessionDone: makeGetSessionDone({}) });
  assert.equal(s.prevActiveDays, 0);
  assert.equal(s.deltaPct, null);
});

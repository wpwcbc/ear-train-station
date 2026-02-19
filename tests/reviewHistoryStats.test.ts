import test from 'node:test';
import assert from 'node:assert/strict';
import { computeReviewHistoryStats } from '../src/lib/reviewHistoryStats.ts';

function mk(at: number, station: string, right: number, wrong: number, mode: 'review' | 'warmup' | 'drill' = 'review') {
  return { v: 1 as const, at, mode, station, n: 10, hard: false, right, wrong, skip: 0, xp: 4 };
}

test('computeReviewHistoryStats: avg10/avg50 ignore drills', () => {
  const entries = [
    mk(1, 'T3_INTERVALS', 8, 2, 'review'), // 80%
    mk(2, 'T3_INTERVALS', 9, 1, 'drill'), // 90% (ignored)
    mk(3, 'T3_INTERVALS', 5, 5, 'warmup'), // 50%
  ];

  const s = computeReviewHistoryStats(entries);
  // last10 includes only non-drill (2 sessions): 80% + 50% = 65%
  assert.equal(Math.round(s.avg10 * 100), 65);
  assert.equal(s.last10.length, 2);
  assert.equal(s.count, 2);
});

test('computeReviewHistoryStats: needsLove orders by avgAcc (min 2 sessions)', () => {
  const entries = [
    mk(1, 'T3_INTERVALS', 8, 2), // 80%
    mk(2, 'T3_INTERVALS', 7, 3), // 70% => avg 75%
    mk(3, 'E3_TRIADS', 4, 6), // 40%
    mk(4, 'E3_TRIADS', 5, 5), // 50% => avg 45%
    mk(5, 'E3_NOTES', 9, 1), // only 1 session => excluded from needsLove
  ];

  const s = computeReviewHistoryStats(entries);
  assert.ok(s.stationsNeedsLove.length >= 2);
  assert.equal(s.stationsNeedsLove[0].station, 'E3_TRIADS');
  assert.equal(s.stationsNeedsLove[1].station, 'T3_INTERVALS');
});

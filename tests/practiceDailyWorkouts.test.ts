import assert from 'node:assert/strict';
import test from 'node:test';
import { pickPracticeDailyWorkouts } from '../src/lib/practiceDailyWorkouts.ts';

function baseReviewHistoryStats(overrides?: Partial<Parameters<typeof pickPracticeDailyWorkouts>[0]['reviewHistoryStats']>) {
  return {
    count: 0,
    avg10: 0,
    avg50: 0,
    last10: [],
    stationsMost: [],
    stationsNeedsLove: [],
    ...overrides,
  };
}

test('Practice daily workouts: warm-up sometimes focuses Needs love station when queued', () => {
  const workouts = pickPracticeDailyWorkouts({
    dayKey: '2026-03-25', // parity 1
    sched: { dueNow: 0, total: 5 },
    stationCountsAll: [
      { id: 'intervals', title: 'Intervals', due: 0, queued: 3 },
      { id: 'triads', title: 'Triads', due: 0, queued: 2 },
    ],
    intervalStatsTop: [{ weight: 10 }],
    triadStatsTop: [],
    continueLessonId: null,
    reviewHistoryStats: baseReviewHistoryStats({
      stationsNeedsLove: [{ station: 'triads', stationName: 'Triads', sessions: 2, avgAcc: 0.4, avgXp: 10, lastAt: 0 }],
    }) as any,
    wideRegisterRangeText: '≥ G2',
  });

  // rotate parity 1 means we should NOT always pick needs-love (it alternates)
  // so session1 might focus top queued station (intervals) on odd days.
  assert.ok(workouts.session1.to.startsWith('/review?warmup=1'), 'warm-up should use warmup route');
});

test('Practice daily workouts: warm-up on even parity focuses Needs love station when available', () => {
  const workouts = pickPracticeDailyWorkouts({
    dayKey: '2026-03-26', // parity 0
    sched: { dueNow: 0, total: 5 },
    stationCountsAll: [
      { id: 'intervals', title: 'Intervals', due: 0, queued: 3 },
      { id: 'triads', title: 'Triads', due: 0, queued: 2 },
    ],
    intervalStatsTop: [{ weight: 10 }],
    triadStatsTop: [],
    continueLessonId: null,
    reviewHistoryStats: baseReviewHistoryStats({
      stationsNeedsLove: [{ station: 'triads', stationName: 'Triads', sessions: 2, avgAcc: 0.4, avgXp: 10, lastAt: 0 }],
    }) as any,
    wideRegisterRangeText: '≥ G2',
  });

  assert.ok(workouts.session1.to.includes('station=triads'), 'even-day warm-up should focus needs-love station');
});

test('Practice daily workouts: session2 includes top-miss semitones when picking interval drill', () => {
  const workouts = pickPracticeDailyWorkouts({
    dayKey: '2026-03-26',
    sched: { dueNow: 2, total: 10 },
    stationCountsAll: [{ id: 'intervals', title: 'Intervals', due: 2, queued: 6 }],
    intervalStatsTop: [
      { weight: 20, semitones: 3 },
      { weight: 10, semitones: 7 },
    ],
    triadStatsTop: [{ weight: 1, quality: 'maj' }],
    continueLessonId: null,
    reviewHistoryStats: baseReviewHistoryStats() as any,
    wideRegisterRangeText: '≥ G2',
  });

  assert.ok(workouts.session2.to.includes('drill=1'), 'session2 should be drill');
  assert.ok(workouts.session2.to.includes('kind=interval'), 'should pick interval drill');
  assert.ok(workouts.session2.to.includes('semitones='), 'should deep-link semitones');
  assert.ok(decodeURIComponent(workouts.session2.to).includes('semitones=3,7'), 'should include top semitone list');
});

test('Practice daily workouts: session2 picks triad drill when triad mistakes dominate (and deep-links qualities)', () => {
  const workouts = pickPracticeDailyWorkouts({
    dayKey: '2026-03-26',
    sched: { dueNow: 2, total: 10 },
    stationCountsAll: [{ id: 'intervals', title: 'Intervals', due: 2, queued: 6 }],
    intervalStatsTop: [{ weight: 10, semitones: 7 }],
    triadStatsTop: [
      { weight: 40, quality: 'min' },
      { weight: 30, quality: 'dim' },
    ],
    continueLessonId: 'intervals-1',
    reviewHistoryStats: baseReviewHistoryStats() as any,
    wideRegisterRangeText: '≥ G2',
  });

  assert.ok(workouts.session2.to.startsWith('/review'), 'session2 should be a review-based route');
  assert.ok(workouts.session2.to.includes('drill=1'), 'session2 should be drill');
  assert.ok(workouts.session2.to.includes('kind=triad'), 'should pick triad drill');
  assert.ok(workouts.session2.to.includes('qualities='), 'should deep-link qualities');
  assert.ok(decodeURIComponent(workouts.session2.to).includes('qualities=min,dim'), 'should include top quality list');
});

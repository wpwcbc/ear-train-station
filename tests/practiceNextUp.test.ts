import test from 'node:test';
import assert from 'node:assert/strict';
import { computePracticeNextUp } from '../src/lib/practiceNextUp.ts';

test('computePracticeNextUp: dueNow dominates', () => {
  const r = computePracticeNextUp({ dueNow: 3, totalQueued: 10, topDueStationId: 'T3_INTERVALS', needsLoveTop: null, continueLessonId: 'L1' });
  assert.equal(r.to, '/review?station=T3_INTERVALS');
  assert.match(r.label, /Review/);
});

test('computePracticeNextUp: needsLove when nothing due', () => {
  const r = computePracticeNextUp({
    dueNow: 0,
    totalQueued: 10,
    topDueStationId: null,
    needsLoveTop: { station: 'E3_TRIADS', stationName: 'Triads', avgAcc: 0.45 },
    continueLessonId: 'L1',
  });
  assert.equal(r.to, '/review?station=E3_TRIADS');
  assert.match(r.reason, /Triads/);
});

test('computePracticeNextUp: warmup when queued but no due + no needsLove', () => {
  const r = computePracticeNextUp({ dueNow: 0, totalQueued: 4, topDueStationId: null, needsLoveTop: null, continueLessonId: 'L1' });
  assert.equal(r.to, '/review?warmup=1&n=5');
});

test('computePracticeNextUp: continue lesson when no queue', () => {
  const r = computePracticeNextUp({ dueNow: 0, totalQueued: 0, topDueStationId: null, needsLoveTop: null, continueLessonId: 'L42' });
  assert.equal(r.to, '/lesson/L42');
});

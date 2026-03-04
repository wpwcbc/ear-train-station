import test from 'node:test';
import assert from 'node:assert/strict';
import { computeReviewWeekSummary } from '../src/lib/reviewWeekSummary.ts';
import type { ReviewSessionHistoryEntryV1 } from '../src/lib/reviewSessionHistory.ts';

function ymdFromLocalDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mk(at: number, right: number, wrong: number, skip: number, xp: number): ReviewSessionHistoryEntryV1 {
  return { v: 1, at, mode: 'review', station: 'T3_INTERVALS', n: 10, hard: false, right, wrong, skip, xp };
}

test('computeReviewWeekSummary: aggregates current 7-day window', () => {
  const base = new Date('2026-03-05T12:00:00');

  const atToday = new Date(base);
  atToday.setHours(13, 0, 0, 0);

  const atMinus3 = new Date(base);
  atMinus3.setDate(atMinus3.getDate() - 3);
  atMinus3.setHours(13, 0, 0, 0);

  const entries = [mk(atToday.getTime(), 8, 2, 0, 12), mk(atMinus3.getTime(), 5, 5, 0, 7)];

  const s = computeReviewWeekSummary(entries, base);
  assert.equal(s.totalSessions, 2);
  assert.equal(s.totalXp, 19);
  assert.equal(Math.round((s.avgAcc || 0) * 100), 65); // 13/20

  const yToday = ymdFromLocalDate(atToday);
  const dayToday = s.days.find((d) => d.ymd === yToday);
  assert.ok(dayToday);
  assert.equal(dayToday.sessions, 1);
  assert.equal(dayToday.xp, 12);
});

test('computeReviewWeekSummary: prev window deltas', () => {
  const base = new Date('2026-03-05T12:00:00');

  const atPrev = new Date(base);
  atPrev.setDate(atPrev.getDate() - 8); // previous window
  atPrev.setHours(13, 0, 0, 0);

  const atCur = new Date(base);
  atCur.setDate(atCur.getDate() - 1);
  atCur.setHours(13, 0, 0, 0);

  const entries = [mk(atPrev.getTime(), 9, 1, 0, 10), mk(atCur.getTime(), 6, 4, 0, 8)];

  const s = computeReviewWeekSummary(entries, base);
  assert.equal(s.totalSessions, 1);
  assert.equal(s.prevTotalSessions, 1);
  assert.equal(s.deltaSessions, 0);
  assert.equal(s.totalXp, 8);
  assert.equal(s.prevTotalXp, 10);
  assert.equal(s.deltaXp, -2);
});

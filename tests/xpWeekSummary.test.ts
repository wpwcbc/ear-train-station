import test from 'node:test';
import assert from 'node:assert/strict';

import { computeXpWeekSummary } from '../src/lib/xpWeekSummary.ts';

test('computeXpWeekSummary: totals and delta vs previous 7 days', () => {
  const by: Record<string, number> = {
    // Current window (2026-02-28 back to 2026-02-22)
    '2026-02-28': 20,
    '2026-02-27': 10,
    '2026-02-26': 0,
    '2026-02-25': 5,
    '2026-02-24': 5,
    '2026-02-23': 0,
    '2026-02-22': 10,

    // Previous window (2026-02-21 back to 2026-02-15)
    '2026-02-21': 10,
    '2026-02-20': 10,
    '2026-02-19': 0,
    '2026-02-18': 0,
    '2026-02-17': 0,
    '2026-02-16': 0,
    '2026-02-15': 0,
  };

  const base = new Date('2026-02-28T01:00:00+08:00');
  const s = computeXpWeekSummary(by, base);

  assert.equal(s.totalXp, 50);
  assert.equal(s.prevTotalXp, 20);
  assert.equal(s.deltaXp, 30);
  assert.equal(s.deltaPct, 150);
  assert.equal(s.activeDays, 5);
  assert.equal(s.days.length, 7);
});

test('computeXpWeekSummary: deltaPct null when prevTotalXp is 0', () => {
  const by: Record<string, number> = {
    '2026-02-28': 10,
  };

  const base = new Date('2026-02-28T12:00:00+08:00');
  const s = computeXpWeekSummary(by, base);

  assert.equal(s.prevTotalXp, 0);
  assert.equal(s.deltaPct, null);
});

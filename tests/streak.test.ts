import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bumpDailyStreak,
  defaultStreakState,
  loadStreakState,
  recordQuestChestOpened,
  saveStreakState,
  STREAK_KEY_V1,
  ymdToday,
  ymdYesterday,
} from '../src/lib/streak.ts';

function makeMemStorage() {
  const m = new Map<string, string>();
  return {
    getItem(k: string) {
      return m.has(k) ? (m.get(k) as string) : null;
    },
    setItem(k: string, v: string) {
      m.set(k, String(v));
    },
    removeItem(k: string) {
      m.delete(k);
    },
    clear() {
      m.clear();
    },
    _dump() {
      return new Map(m);
    },
  };
}

test('bumpDailyStreak: first claim sets streak=1', () => {
  const prev = defaultStreakState();
  const next = bumpDailyStreak(prev, '2026-03-02', '2026-03-01');
  assert.equal(next.streak, 1);
  assert.equal(next.best, 1);
  assert.equal(next.lastYmd, '2026-03-02');
});

test('bumpDailyStreak: same-day claim is idempotent', () => {
  const prev = { v: 1 as const, lastYmd: '2026-03-02', streak: 5, best: 7 };
  const next = bumpDailyStreak(prev, '2026-03-02', '2026-03-01');
  assert.deepEqual(next, prev);
});

test('bumpDailyStreak: consecutive day increments streak and updates best', () => {
  const prev = { v: 1 as const, lastYmd: '2026-03-01', streak: 3, best: 3 };
  const next = bumpDailyStreak(prev, '2026-03-02', '2026-03-01');
  assert.equal(next.streak, 4);
  assert.equal(next.best, 4);
  assert.equal(next.lastYmd, '2026-03-02');
});

test('bumpDailyStreak: gap resets streak to 1 but keeps best', () => {
  const prev = { v: 1 as const, lastYmd: '2026-02-28', streak: 10, best: 10 };
  const next = bumpDailyStreak(prev, '2026-03-02', '2026-03-01');
  assert.equal(next.streak, 1);
  assert.equal(next.best, 10);
  assert.equal(next.lastYmd, '2026-03-02');
});

test('load/save/recordQuestChestOpened: writes ets_streak_v1 and increments across days', () => {
  const storage = makeMemStorage();
  // @ts-expect-error test shim
  globalThis.localStorage = storage;

  const d1 = new Date('2026-03-01T12:00:00.000+08:00');
  recordQuestChestOpened(d1);

  const s1 = loadStreakState(storage);
  assert.equal(s1.streak, 1);
  assert.equal(s1.lastYmd, ymdToday(d1));

  // Same day: idempotent
  recordQuestChestOpened(new Date('2026-03-01T23:59:00.000+08:00'));
  const s1b = loadStreakState(storage);
  assert.equal(s1b.streak, 1);

  // Next day: increment
  const d2 = new Date('2026-03-02T09:00:00.000+08:00');
  recordQuestChestOpened(d2);
  const s2 = loadStreakState(storage);
  assert.equal(s2.streak, 2);
  assert.equal(s2.lastYmd, ymdToday(d2));

  // Save writes to key
  saveStreakState(s2, storage);
  assert.ok(storage.getItem(STREAK_KEY_V1));

  // Sanity: yesterday helper
  assert.equal(ymdYesterday(d2), '2026-03-01');
});

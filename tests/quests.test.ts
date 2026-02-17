import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeQuestProgress,
  defaultQuestState,
  loadQuestState,
  normalizeQuestStateForYmd,
  saveQuestState,
  ymdFromDate,
} from '../src/lib/quests.ts';

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

test('ymdFromDate formats local YYYY-MM-DD', () => {
  const d = new Date('2026-02-17T00:00:00.000+08:00');
  assert.equal(ymdFromDate(d), '2026-02-17');
});

test('normalizeQuestStateForYmd resets counters when date changes', () => {
  const q = {
    ...defaultQuestState(),
    ymd: '2026-02-16',
    reviewAttemptsToday: 5,
    stationsCompletedToday: 1,
    chestClaimedToday: true,
  };

  const next = normalizeQuestStateForYmd(q, '2026-02-17');
  assert.equal(next.ymd, '2026-02-17');
  assert.equal(next.reviewAttemptsToday, 0);
  assert.equal(next.stationsCompletedToday, 0);
  assert.equal(next.chestClaimedToday, false);
});

test('computeQuestProgress: chestReady only when allDone and not claimed', () => {
  const progress = { dailyGoalXp: 20, dailyXpToday: 20 } as any;

  const allDoneNotClaimed = {
    ...defaultQuestState(),
    ymd: '2026-02-17',
    reviewAttemptsToday: 6,
    stationsCompletedToday: 1,
    chestClaimedToday: false,
  };
  const c1 = computeQuestProgress(progress, allDoneNotClaimed);
  assert.equal(c1.allDone, true);
  assert.equal(c1.chestReady, true);
  assert.equal(c1.hasWork, true);

  const allDoneClaimed = { ...allDoneNotClaimed, chestClaimedToday: true };
  const c2 = computeQuestProgress(progress, allDoneClaimed);
  assert.equal(c2.allDone, true);
  assert.equal(c2.chestReady, false);
  assert.equal(c2.hasWork, false);

  const notAllDone = { ...allDoneNotClaimed, reviewAttemptsToday: 0 };
  const c3 = computeQuestProgress(progress, notAllDone);
  assert.equal(c3.allDone, false);
  assert.equal(c3.chestReady, false);
  assert.equal(c3.hasWork, true);
});

test('loadQuestState migrates ets_quests_v1 to ets_quests_v2 (best-effort)', () => {
  const storage = makeMemStorage();
  // @ts-expect-error test shim
  globalThis.localStorage = storage;

  // Seed old key.
  const v1 = {
    ...defaultQuestState(),
    ymd: ymdFromDate(new Date()),
    reviewAttemptsToday: 3,
  };
  storage.setItem('ets_quests_v1', JSON.stringify(v1));

  const loaded = loadQuestState();
  assert.equal(loaded.reviewAttemptsToday, 3);

  const migrated = storage.getItem('ets_quests_v2');
  assert.ok(migrated, 'expected v2 key to be written');
  assert.equal(storage.getItem('ets_quests_v1'), null);
});

test('saveQuestState writes to ets_quests_v2', () => {
  const storage = makeMemStorage();
  // @ts-expect-error test shim
  globalThis.localStorage = storage;

  const q = { ...defaultQuestState(), ymd: ymdFromDate(new Date()), reviewAttemptsToday: 2 };
  saveQuestState(q);

  assert.ok(storage.getItem('ets_quests_v2'));
  assert.equal(storage.getItem('ets_quests_v1'), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { applyStudyReward, defaultProgress, loadProgress, saveProgress, type Progress } from '../src/lib/progress.ts';

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
  };
}

function withMockedNow(iso: string, fn: () => void) {
  const RealDate = globalThis.Date;
  class MockDate extends RealDate {
    constructor(...args: any[]) {
      if (args.length === 0) super(iso);
      else super(...(args as [any]));
    }
    static now() {
      return new RealDate(iso).getTime();
    }
  }
  // @ts-expect-error test shim
  globalThis.Date = MockDate;
  try {
    fn();
  } finally {
    // @ts-expect-error test shim
    globalThis.Date = RealDate;
  }
}

test('applyStudyReward increments dailyXpByYmd bucket (today)', () => {
  withMockedNow('2026-02-28T01:02:03.000+08:00', () => {
    let p: Progress = defaultProgress();
    p = applyStudyReward(p, 10);
    p = applyStudyReward(p, 3);

    assert.equal(p.dailyXpToday, 13);
    assert.equal(p.dailyXpByYmd['2026-02-28'], 13);
  });
});

test('dailyXpByYmd prunes to rolling window (14 days) when saving', () => {
  const storage = makeMemStorage();
  // @ts-expect-error test shim
  globalThis.localStorage = storage;

  withMockedNow('2026-03-15T12:00:00.000+08:00', () => {
    const p: Progress = {
      ...defaultProgress(),
      dailyXpByYmd: {
        '2026-02-20': 5,
        '2026-03-01': 7,
        '2026-03-02': 2,
        '2026-03-14': 9,
        '2026-03-15': 1,
      },
      dailyYmd: '2026-03-15',
      dailyXpToday: 1,
    };

    saveProgress(p);
    const raw = storage.getItem('ets_progress_v3');
    assert.ok(raw);
    const saved = JSON.parse(raw as string) as Progress;

    assert.equal(saved.dailyXpByYmd['2026-02-20'], undefined);
    assert.equal(saved.dailyXpByYmd['2026-03-01'], undefined);
    assert.equal(saved.dailyXpByYmd['2026-03-02'], 2);
    assert.equal(saved.dailyXpByYmd['2026-03-14'], 9);
    assert.equal(saved.dailyXpByYmd['2026-03-15'], 1);
  });
});

test('loadProgress migrates v2 -> v3 and seeds dailyXpByYmd from dailyYmd/dailyXpToday', () => {
  const storage = makeMemStorage();
  // @ts-expect-error test shim
  globalThis.localStorage = storage;

  withMockedNow('2026-02-28T12:00:00.000+08:00', () => {
    const v2 = {
      version: 2,
      xp: 100,
      streakDays: 3,
      lastStudyYmd: '2026-02-28',
      dailyGoalXp: 20,
      dailyXpToday: 12,
      dailyYmd: '2026-02-28',
      stationDone: { ...defaultProgress().stationDone },
    };
    storage.setItem('ets_progress_v2', JSON.stringify(v2));

    const loaded = loadProgress();
    assert.equal(loaded.version, 3);
    assert.equal(loaded.dailyXpByYmd['2026-02-28'], 12);

    const migrated = storage.getItem('ets_progress_v3');
    assert.ok(migrated, 'expected v3 key to be written');
  });
});

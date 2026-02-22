import test from 'node:test';
import assert from 'node:assert/strict';

import {
  type Mistake,
  applyReviewResult,
  loadMistakes,
  MISTAKES_CHANGED_EVENT,
  nextLocalTimeAt,
  requiredClearStreak,
  saveMistakes,
} from '../src/lib/mistakes.ts';

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

test('loadMistakes migrates ets_mistakes_v1 → ets_mistakes_v2 (fills review fields)', () => {
  const storage = makeMemStorage();
  // @ts-expect-error test shim
  globalThis.localStorage = storage;

  const v1 = [
    {
      id: 'old1',
      kind: 'intervalLabel',
      sourceStationId: 'T3_INTERVALS',
      rootMidi: 48,
      semitones: 7,
      addedAt: 123,
    },
  ];

  storage.setItem('ets_mistakes_v1', JSON.stringify(v1));

  const loaded = loadMistakes();
  assert.equal(loaded.length, 1);

  const m0 = loaded[0];
  assert.equal(m0.kind, 'intervalLabel');
  if (m0.kind === 'intervalLabel') {
    assert.equal(m0.rootMidi, 48);
  }
  assert.equal(typeof m0.dueAt, 'number');
  assert.equal(typeof m0.correctStreak, 'number');
  assert.equal(typeof m0.wrongCount, 'number');

  assert.ok(storage.getItem('ets_mistakes_v2'), 'expected v2 key to be written');
  assert.equal(storage.getItem('ets_mistakes_v1'), null);
});

test('saveMistakes writes to ets_mistakes_v2 (and emits ets_mistakes_changed in-tab)', () => {
  const storage = makeMemStorage();
  // @ts-expect-error test shim
  globalThis.localStorage = storage;

  // Minimal window shim: EventTarget supports addEventListener/dispatchEvent.
  const win = new EventTarget();
  // @ts-expect-error test shim
  globalThis.window = win;

  let fired = 0;
  win.addEventListener(MISTAKES_CHANGED_EVENT, () => {
    fired += 1;
  });

  const m1: Mistake = {
    id: 'm1',
    kind: 'noteName',
    sourceStationId: 'S1_NOTES',
    midi: 60,
    addedAt: 1,
    dueAt: 1,
    correctStreak: 0,
    wrongCount: 0,
  };

  saveMistakes([m1]);

  assert.ok(storage.getItem('ets_mistakes_v2'));
  assert.equal(fired, 1);
});

test('applyReviewResult wrong → resets streak, increments wrongCount, and schedules retry soon (not immediate)', () => {
  const m: Mistake = {
    id: 'm1',
    kind: 'noteName',
    sourceStationId: 'S1_NOTES',
    midi: 60,
    addedAt: 0,
    dueAt: 0,
    correctStreak: 1,
    wrongCount: 0,
  };

  const now = 1_000_000;
  const next = applyReviewResult(m, 'wrong', now);
  assert.ok(next);
  if (next) {
    assert.equal(next.correctStreak, 0);
    assert.equal(next.wrongCount, 1);
    assert.ok(next.dueAt > now);
    assert.ok(next.dueAt <= now + 5 * 60_000, 'expected a small retry delay');
  }
});

test('nextLocalTimeAt returns the next occurrence of a local clock time', () => {
  const nowAfter = new Date(2026, 1, 22, 16, 0, 0, 0).getTime();
  const tAfter = nextLocalTimeAt(8, 0, nowAfter);
  assert.ok(tAfter > nowAfter);
  assert.ok(tAfter - nowAfter <= 24 * 60 * 60_000);
  const dAfter = new Date(tAfter);
  assert.equal(dAfter.getHours(), 8);
  assert.equal(dAfter.getMinutes(), 0);

  const nowBefore = new Date(2026, 1, 22, 7, 30, 0, 0).getTime();
  const tBefore = nextLocalTimeAt(8, 0, nowBefore);
  assert.ok(tBefore > nowBefore);
  const dBefore = new Date(tBefore);
  assert.equal(dBefore.getHours(), 8);
  assert.equal(dBefore.getMinutes(), 0);
  assert.equal(dBefore.getDate(), new Date(nowBefore).getDate(), 'expected same-day 08:00 when now is before 08:00');
});

test('applyReviewResult correct → schedules next rep; clears after required streak', () => {
  const base: Mistake = {
    id: 'm1',
    kind: 'intervalLabel',
    sourceStationId: 'T3_INTERVALS',
    rootMidi: 48,
    semitones: 7,
    addedAt: 0,
    dueAt: 0,
    correctStreak: 0,
    wrongCount: 0,
  };

  const now = 2_000_000;
  const after1 = applyReviewResult(base, 'correct', now);
  assert.ok(after1);
  if (after1) {
    assert.equal(after1.correctStreak, 1);
    assert.ok(after1.dueAt > now);

    const after2 = applyReviewResult(after1, 'correct', now);
    // default required streak is 2 → should clear on second correct
    assert.equal(after2, null);
  }

  const hard: Mistake = { ...base, wrongCount: 3, correctStreak: 2 };
  assert.equal(requiredClearStreak(hard), 3);
  const clearedHard = applyReviewResult(hard, 'correct', now);
  assert.equal(clearedHard, null);
});

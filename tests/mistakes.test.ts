import test from 'node:test';
import assert from 'node:assert/strict';

import { loadMistakes, saveMistakes } from '../src/lib/mistakes.ts';

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

  const m0: any = loaded[0];
  assert.equal(m0.kind, 'intervalLabel');
  assert.equal(m0.rootMidi, 48);
  assert.equal(typeof m0.dueAt, 'number');
  assert.equal(typeof m0.correctStreak, 'number');
  assert.equal(typeof m0.wrongCount, 'number');

  assert.ok(storage.getItem('ets_mistakes_v2'), 'expected v2 key to be written');
  assert.equal(storage.getItem('ets_mistakes_v1'), null);
});

test('saveMistakes writes to ets_mistakes_v2', () => {
  const storage = makeMemStorage();
  // @ts-expect-error test shim
  globalThis.localStorage = storage;

  saveMistakes([
    {
      id: 'm1',
      kind: 'noteName',
      sourceStationId: 'S1_NOTES',
      midi: 60,
      addedAt: 1,
      dueAt: 1,
      correctStreak: 0,
      wrongCount: 0,
    } as any,
  ]);

  assert.ok(storage.getItem('ets_mistakes_v2'));
});

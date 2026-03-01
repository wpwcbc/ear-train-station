import test from 'node:test';
import assert from 'node:assert/strict';

import { makeIntervalLabelQuestion } from '../src/exercises/interval.ts';
import { STABLE_REGISTER_MIN_MIDI, WIDE_REGISTER_MIN_MIDI } from '../src/lib/registerPolicy.ts';

test('makeIntervalLabelQuestion defaults to stable register policy', () => {
  const q = makeIntervalLabelQuestion({ seed: 123 });
  assert.ok(q.rootMidi >= STABLE_REGISTER_MIN_MIDI);
});

test('makeIntervalLabelQuestion wide policy defaults rootMinMidi to >= G2', () => {
  const q = makeIntervalLabelQuestion({ seed: 456, registerPolicy: 'wide' });
  assert.ok(q.rootMidi >= WIDE_REGISTER_MIN_MIDI);
});

test('makeIntervalLabelQuestion wide policy throws if rootMinMidi violates G2 floor', () => {
  assert.throws(
    () => makeIntervalLabelQuestion({ seed: 789, registerPolicy: 'wide', rootMinMidi: WIDE_REGISTER_MIN_MIDI - 1 }),
    /wide register policy requires rootMinMidi >=/,
  );
});

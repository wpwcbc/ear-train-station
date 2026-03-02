import test from 'node:test';
import assert from 'node:assert/strict';

import { WIDE_REGISTER_MIN_MIDI } from '../src/lib/registerPolicy.ts';
import { makeDiatonicTriadQualityQuestion } from '../src/exercises/diatonicTriad.ts';
import { makeFunctionFamilyQuestion } from '../src/exercises/functionFamily.ts';

test('makeDiatonicTriadQualityQuestion throws if tonicMinMidi violates wide-register floor', () => {
  assert.throws(
    () =>
      makeDiatonicTriadQualityQuestion({
        seed: 1,
        mode: 'test',
        tonicMinMidi: WIDE_REGISTER_MIN_MIDI - 1,
        tonicMaxMidi: WIDE_REGISTER_MIN_MIDI + 12,
      }),
    /wide register policy requires minMidi >=/,
  );
});

test('makeFunctionFamilyQuestion throws if tonicMinMidi violates wide-register floor', () => {
  assert.throws(
    () =>
      makeFunctionFamilyQuestion({
        seed: 2,
        tonicMinMidi: WIDE_REGISTER_MIN_MIDI - 1,
        tonicMaxMidi: WIDE_REGISTER_MIN_MIDI + 12,
      }),
    /wide register policy requires minMidi >=/,
  );
});

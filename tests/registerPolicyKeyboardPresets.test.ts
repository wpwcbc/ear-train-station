import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_WIDE_REGISTER_MAX_MIDI,
  STABLE_KEYBOARD_PROPS,
  STABLE_REGISTER_MAX_MIDI,
  STABLE_REGISTER_MIN_MIDI,
  WIDE_KEYBOARD_PROPS,
  WIDE_REGISTER_MIN_MIDI,
  keyboardOctavesForRange,
} from '../src/lib/registerPolicy.ts';

test('keyboardOctavesForRange returns a sane minimum (>=1)', () => {
  assert.equal(keyboardOctavesForRange(60, 60), 1);
  assert.equal(keyboardOctavesForRange(60, 59), 1);
});

test('STABLE_KEYBOARD_PROPS matches stable register bounds', () => {
  assert.equal(STABLE_KEYBOARD_PROPS.startMidi, STABLE_REGISTER_MIN_MIDI);
  assert.equal(STABLE_KEYBOARD_PROPS.minMidi, STABLE_REGISTER_MIN_MIDI);
  assert.equal(STABLE_KEYBOARD_PROPS.maxMidi, STABLE_REGISTER_MAX_MIDI);
  // Stable register spans one octave (C4..B4) so 1 octave view is enough.
  assert.equal(STABLE_KEYBOARD_PROPS.octaves, 1);
});

test('WIDE_KEYBOARD_PROPS matches wide register min and default max', () => {
  assert.equal(WIDE_KEYBOARD_PROPS.startMidi, WIDE_REGISTER_MIN_MIDI);
  assert.equal(WIDE_KEYBOARD_PROPS.minMidi, WIDE_REGISTER_MIN_MIDI);
  assert.equal(WIDE_KEYBOARD_PROPS.maxMidi, DEFAULT_WIDE_REGISTER_MAX_MIDI);
  assert.equal(
    WIDE_KEYBOARD_PROPS.octaves,
    keyboardOctavesForRange(WIDE_REGISTER_MIN_MIDI, DEFAULT_WIDE_REGISTER_MAX_MIDI),
  );
});

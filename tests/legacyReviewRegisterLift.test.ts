import test from 'node:test';
import assert from 'node:assert/strict';

import { WIDE_REGISTER_MIN_MIDI, liftMidiToWideFloor } from '../src/lib/registerPolicy.ts';
import { makeIntervalLabelReviewQuestion } from '../src/exercises/interval.ts';
import { makeTriadQualityReviewQuestion } from '../src/exercises/triad.ts';
import { makeFunctionFamilyQuestion } from '../src/exercises/functionFamily.ts';
import { makeNoteNameReviewQuestion } from '../src/exercises/noteName.ts';

test('liftMidiToWideFloor preserves pitch-class and lifts by octaves until ≥ G2', () => {
  const low = 30; // F#1
  const lifted = liftMidiToWideFloor(low);
  assert.ok(lifted >= WIDE_REGISTER_MIN_MIDI);
  assert.equal(lifted % 12, low % 12);

  const alreadyOk = 60; // C4
  assert.equal(liftMidiToWideFloor(alreadyOk), alreadyOk);
});

test('makeIntervalLabelReviewQuestion lifts legacy low rootMidi to wide floor', () => {
  const q = makeIntervalLabelReviewQuestion({
    seed: 1,
    rootMidi: 40, // E2 (below floor)
    semitones: 7,
    choiceCount: 6,
  });

  assert.ok(q.rootMidi >= WIDE_REGISTER_MIN_MIDI);
  assert.equal(q.targetMidi - q.rootMidi, 7);
  assert.equal(q.rootMidi % 12, 40 % 12);
});

test('makeTriadQualityReviewQuestion lifts legacy low rootMidi to wide floor', () => {
  const q = makeTriadQualityReviewQuestion({
    seed: 2,
    rootMidi: 41, // F2 (below floor)
    quality: 'minor',
    choiceCount: 3,
  });

  assert.ok(q.rootMidi >= WIDE_REGISTER_MIN_MIDI);
  assert.equal(q.rootMidi % 12, 41 % 12);
  assert.equal(q.chordMidis[0] % 12, q.rootMidi % 12);
});

test('makeFunctionFamilyQuestion lifts legacy low tonicMidi to wide floor', () => {
  const q = makeFunctionFamilyQuestion({
    seed: 3,
    key: 'C',
    degree: 5,
    tonicMidi: 40, // legacy too-low
  });

  assert.ok(q.tonicMidi >= WIDE_REGISTER_MIN_MIDI);
  assert.equal(q.tonicMidi % 12, 40 % 12);
});

test('makeNoteNameReviewQuestion lifts legacy low midi to wide floor', () => {
  const q = makeNoteNameReviewQuestion({ seed: 4, midi: 35, choiceCount: 4 });
  assert.ok(q.midi >= WIDE_REGISTER_MIN_MIDI);
  assert.equal(q.midi % 12, 35 % 12);
});

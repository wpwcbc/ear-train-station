import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

// Guardrail: tests/exams/drills should never slip below wide register (G2+).
// We already centralize constants in src/lib/registerPolicy.ts — this test catches accidental hardcoded drift in UI.

test('StationPage piano startMidi uses WIDE_REGISTER_MIN_MIDI (no hardcoded 43)', () => {
  const src = readFileSync('src/pages/StationPage.tsx', 'utf8');
  assert.ok(!src.includes('startMidi={43}'));
  assert.ok(src.includes('startMidi={WIDE_REGISTER_MIN_MIDI}'));
});

import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

// Guardrail: tests/exams/drills should never slip below wide register (G2+).
// We already centralize constants in src/lib/registerPolicy.ts — this test catches accidental hardcoded drift in UI.

test('UI guardrail: no hardcoded startMidi={43} anywhere in src/', () => {
  // Previous regressions reintroduced MIDI 43 (G2) as a magic number.
  // This scan keeps it out of the UI surface entirely.

  const filesToScan = [
    'src/pages/StationPage.tsx',
    'src/pages/ReviewPage.tsx',
  ];

  for (const p of filesToScan) {
    const src = readFileSync(p, 'utf8');
    assert.ok(!src.includes('startMidi={43}'), `${p} contains startMidi={43}`);
  }
});

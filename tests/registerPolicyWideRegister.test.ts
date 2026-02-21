import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { WIDE_REGISTER_MIN_MIDI } from '../src/lib/registerPolicy.ts';

// Guardrail: any *test/exam/review/drill* min bounds must never slip below the wide-register floor (G2+).
// We keep this as a cheap static scan so refactors don't accidentally reintroduce a lower min.

type ScanTarget = {
  path: string;
  // Field names we use in configs for "min bound".
  keys: string[];
};

const TARGETS: ScanTarget[] = [
  {
    path: 'src/pages/StationPage.tsx',
    keys: ['rootMinMidi', 'minRootMidi', 'tonicMinMidi', 'minMidi'],
  },
  {
    path: 'src/pages/ReviewPage.tsx',
    keys: ['rootMinMidi', 'minRootMidi', 'tonicMinMidi', 'minMidi'],
  },
];

function extractNumericAssignments(src: string, key: string): number[] {
  // Matches: key: 43, key:   48,
  // (does NOT match constants like WIDE_REGISTER_MIN_MIDI — that's fine; those are already safe.)
  const re = new RegExp(`${key}\\s*:\\s*(\\d+)`, 'g');
  const values: number[] = [];
  for (;;) {
    const m = re.exec(src);
    if (!m) break;
    values.push(Number(m[1]));
  }
  return values;
}

test('Wide-register min policy: no numeric min bounds below WIDE_REGISTER_MIN_MIDI in Station/Review configs', () => {
  for (const t of TARGETS) {
    const src = readFileSync(t.path, 'utf8');
    for (const key of t.keys) {
      const nums = extractNumericAssignments(src, key);
      for (const n of nums) {
        assert.ok(
          n >= WIDE_REGISTER_MIN_MIDI,
          `${t.path}: ${key} is ${n}, expected >= ${WIDE_REGISTER_MIN_MIDI}`,
        );
      }
    }
  }
});

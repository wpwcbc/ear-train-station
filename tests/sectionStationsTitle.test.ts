import test from 'node:test';
import assert from 'node:assert/strict';

import { titleForStationId } from '../src/lib/sectionStations.ts';

test('titleForStationId prefers human titles (no id leakage)', () => {
  assert.equal(titleForStationId('S1_NOTES'), 'Station 1 — Note names & accidentals');
});

test('titleForStationId falls back to the id if unknown (safe default)', () => {
  const unknown = 'S999_NOPE' as any;
  assert.equal(titleForStationId(unknown), unknown);
});

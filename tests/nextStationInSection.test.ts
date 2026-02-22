import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultProgress, markStationDone } from '../src/lib/progress.ts';
import { nextStationInSection, sectionStations } from '../src/lib/sectionStations.ts';

test('nextStationInSection returns the first missing station in the section', () => {
  const p = defaultProgress();
  assert.equal(nextStationInSection(p, 'NOTES'), 'S1_NOTES');

  const p2 = markStationDone(p, 'S1_NOTES');
  assert.equal(nextStationInSection(p2, 'NOTES'), 'S1B_STAFF');
});

test('nextStationInSection returns the exam/capstone when everything is done', () => {
  const plan = sectionStations('NOTES');
  let p = defaultProgress();
  for (const sid of plan.stationIds) {
    p = markStationDone(p, sid);
  }
  assert.equal(nextStationInSection(p, 'NOTES'), plan.examId);
});

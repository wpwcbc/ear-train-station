import test from 'node:test';
import assert from 'node:assert/strict';
import { appendReviewSessionHistory } from '../src/lib/reviewSessionHistory.ts';

test('appendReviewSessionHistory caps to last N entries', () => {
  const mk = (i: number) => ({ v: 1 as const, at: i, mode: 'review' as const, n: 10, hard: false, right: 1, wrong: 0, skip: 0, xp: 4 });
  const prev = [mk(1), mk(2), mk(3)];
  const next = appendReviewSessionHistory(prev, mk(4), 3);
  assert.equal(next.length, 3);
  assert.deepEqual(
    next.map((x) => x.at),
    [2, 3, 4]
  );
});

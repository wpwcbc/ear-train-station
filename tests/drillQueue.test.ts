import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDrillQueue, insertDrillRetry } from '../src/lib/drillQueue.ts';

test('buildDrillQueue(interval) is deterministic and avoids immediate repeats when possible', () => {
  const q1 = buildDrillQueue({ kind: 'interval', focus: [0, 3, 4, 7], total: 40, seed: 123 });
  const q2 = buildDrillQueue({ kind: 'interval', focus: [0, 3, 4, 7], total: 40, seed: 123 });
  assert.deepEqual(q1, q2);

  for (let i = 1; i < q1.length; i++) {
    // Not a strict guarantee, but with 4 items it should never repeat immediately.
    assert.notEqual(q1[i], q1[i - 1]);
  }
});

test('buildDrillQueue(triad) returns only focused qualities', () => {
  const q = buildDrillQueue({ kind: 'triad', focus: ['maj', 'min'], total: 25, seed: 5 });
  assert.ok(q.length === 25);
  for (const id of q) {
    assert.ok(id === 'triad:maj' || id === 'triad:min');
  }
});

test('insertDrillRetry inserts a retry a few steps later and respects max repeats', () => {
  const base = ['interval:3', 'interval:4', 'interval:7', 'interval:0', 'interval:4'];
  const q1 = insertDrillRetry({ queue: base, pos: 1, id: 'interval:4', afterSteps: 2, maxRepeatsInQueue: 3 });
  // Inserted at pos+2 = index 3 (0-based), but avoid duplicates.
  assert.ok(q1.length === base.length + 1);
  assert.equal(q1[3], 'interval:4');

  const q2 = insertDrillRetry({ queue: ['x', 'x', 'x'], pos: 0, id: 'x', maxRepeatsInQueue: 3 });
  assert.deepEqual(q2, ['x', 'x', 'x']);
});

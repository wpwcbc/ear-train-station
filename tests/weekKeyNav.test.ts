import test from 'node:test';
import assert from 'node:assert/strict';

import { weekKeyNavNextIndex } from '../src/lib/weekKeyNav.ts';

test('weekKeyNavNextIndex: ArrowLeft clamps at 0', () => {
  assert.equal(weekKeyNavNextIndex({ key: 'ArrowLeft', idx: 0, len: 7 }), null);
  assert.equal(weekKeyNavNextIndex({ key: 'ArrowLeft', idx: 3, len: 7 }), 2);
});

test('weekKeyNavNextIndex: ArrowRight clamps at len-1', () => {
  assert.equal(weekKeyNavNextIndex({ key: 'ArrowRight', idx: 6, len: 7 }), null);
  assert.equal(weekKeyNavNextIndex({ key: 'ArrowRight', idx: 3, len: 7 }), 4);
});

test('weekKeyNavNextIndex: Home/End jump', () => {
  assert.equal(weekKeyNavNextIndex({ key: 'Home', idx: 4, len: 7 }), 0);
  assert.equal(weekKeyNavNextIndex({ key: 'End', idx: 2, len: 7 }), 6);
});

test('weekKeyNavNextIndex: ignores unknown keys', () => {
  assert.equal(weekKeyNavNextIndex({ key: 'Enter', idx: 2, len: 7 }), null);
});

test('weekKeyNavNextIndex: rejects invalid idx/len', () => {
  assert.equal(weekKeyNavNextIndex({ key: 'Home', idx: -1, len: 7 }), null);
  assert.equal(weekKeyNavNextIndex({ key: 'Home', idx: 0, len: 0 }), null);
  assert.equal(weekKeyNavNextIndex({ key: 'Home', idx: 999, len: 7 }), null);
});

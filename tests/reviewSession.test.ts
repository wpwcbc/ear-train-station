import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewSessionSignature } from '../src/lib/reviewSession.ts';

test('reviewSessionSignature: param order does not matter', () => {
  const a = reviewSessionSignature({ search: '?n=10&station=S1B_NOTES&hard=1' });
  const b = reviewSessionSignature({ search: '?hard=1&station=S1B_NOTES&n=10' });
  assert.equal(a, b);
});

test('reviewSessionSignature: ignores unrelated params', () => {
  const a = reviewSessionSignature({ search: '' });
  const b = reviewSessionSignature({ search: '?foo=bar&x=1' });
  assert.equal(a, b);
});

test('reviewSessionSignature: hash manage toggles signature', () => {
  const a = reviewSessionSignature({ search: '?station=S1B_NOTES', hash: '' });
  const b = reviewSessionSignature({ search: '?station=S1B_NOTES', hash: '#manage' });
  assert.notEqual(a, b);
});

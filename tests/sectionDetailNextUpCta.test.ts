import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

// Guardrail: the section detail page should never be a dead-end when the exam is locked.
// If the exam is locked, we must show a clear “Next up” CTA that deep-links to the first missing station.

test('SectionDetailPage guardrail: exam-locked state includes a Next up deep-link', () => {
  const src = readFileSync('src/pages/SectionDetailPage.tsx', 'utf8');

  assert.ok(src.includes('Next up'), 'SectionDetailPage should render “Next up” copy');
  assert.ok(
    src.includes('to={`/lesson/${nextUpStationId}`}'),
    'SectionDetailPage should link Next up CTA to `/lesson/${nextUpStationId}`'
  );
  assert.ok(
    src.includes('nextStationInSection'),
    'SectionDetailPage should use nextStationInSection() to compute the Next up target'
  );
});

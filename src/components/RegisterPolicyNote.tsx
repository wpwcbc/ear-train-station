import type { CSSProperties } from 'react';

import { STABLE_REGISTER_RANGE_TEXT, WIDE_REGISTER_RANGE_TEXT } from '../lib/registerPolicy';

export function RegisterPolicyNote({ mode }: { mode: 'lesson' | 'test' | 'both' }) {
  const baseStyle: CSSProperties = { fontSize: 12, opacity: 0.8, marginTop: 10 };

  if (mode === 'lesson') {
    return (
      <div style={baseStyle}>
        Lesson register: <b>{STABLE_REGISTER_RANGE_TEXT}</b>.
      </div>
    );
  }

  if (mode === 'test') {
    return (
      <div style={baseStyle}>
        Test register: <b>≥ {WIDE_REGISTER_RANGE_TEXT}</b>.
      </div>
    );
  }

  return (
    <div style={baseStyle}>
      Lessons stay in a stable register (<b>{STABLE_REGISTER_RANGE_TEXT}</b>); tests roam wider (
      <b>≥ {WIDE_REGISTER_RANGE_TEXT}</b>).
    </div>
  );
}

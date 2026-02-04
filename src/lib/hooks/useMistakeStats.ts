import { useEffect, useMemo, useState } from 'react';
import { loadMistakes } from '../mistakes';

export type MistakeStats = {
  due: number;
  total: number;
  nextDueAt: number | null;
};

/**
 * Lightweight, reactive mistake counts for the Map header.
 * - Reads localStorage once per refresh.
 * - Refreshes on window focus + storage updates (multi-tab).
 */
export function useMistakeStats(nowMs?: number): MistakeStats {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    function bump() {
      setTick((x) => x + 1);
    }

    window.addEventListener('focus', bump);
    window.addEventListener('storage', bump);
    return () => {
      window.removeEventListener('focus', bump);
      window.removeEventListener('storage', bump);
    };
  }, []);

  const now = nowMs ?? Date.now();

  return useMemo(() => {
    const mistakes = loadMistakes();
    let due = 0;
    let nextDueAt: number | null = null;

    for (const m of mistakes) {
      const at = m.dueAt ?? m.addedAt;
      if (at <= now) due += 1;
      if (nextDueAt == null || at < nextDueAt) nextDueAt = at;
    }

    return { due, total: mistakes.length, nextDueAt };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, now]);
}

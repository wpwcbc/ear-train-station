import { useEffect, useMemo, useState } from 'react';
import { loadMistakes } from '../mistakes';

export type MistakeStats = {
  due: number;
  total: number;
  nextDueAt: number | null;
  /** Internal: the "now" used for computing due counts (useful for countdown UI). */
  now: number;
};

/**
 * Lightweight, reactive mistake counts for the Map header.
 * - Reads localStorage once per refresh.
 * - Refreshes on window focus + storage updates (multi-tab).
 * - If you don't pass nowMs, it will automatically wake up when the next item becomes due.
 */
export function useMistakeStats(nowMs?: number): MistakeStats {
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(() => nowMs ?? Date.now());

  // Keep internal clock in sync if a caller provides nowMs.
  useEffect(() => {
    if (typeof nowMs === 'number') setNow(nowMs);
  }, [nowMs]);

  useEffect(() => {
    function bump() {
      setTick((x) => x + 1);
      setNow(Date.now());
    }

    window.addEventListener('focus', bump);
    window.addEventListener('storage', bump);
    return () => {
      window.removeEventListener('focus', bump);
      window.removeEventListener('storage', bump);
    };
  }, []);

  const stats = useMemo(() => {
    const mistakes = loadMistakes();
    let due = 0;
    let nextDueAt: number | null = null;

    for (const m of mistakes) {
      const at = m.dueAt ?? m.addedAt;
      if (at <= now) due += 1;
      if (nextDueAt == null || at < nextDueAt) nextDueAt = at;
    }

    return { due, total: mistakes.length, nextDueAt, now };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, now]);

  // If we're using real time, schedule a single wakeup when the next item becomes due.
  useEffect(() => {
    if (typeof nowMs === 'number') return;

    const at = stats.nextDueAt;
    if (at == null) return;

    // If already due, no timer needed.
    if (at <= Date.now()) return;

    const delay = Math.max(0, at - Date.now()) + 25;
    const t = window.setTimeout(() => {
      setNow(Date.now());
    }, delay);

    return () => window.clearTimeout(t);
  }, [nowMs, stats.nextDueAt]);

  return stats;
}

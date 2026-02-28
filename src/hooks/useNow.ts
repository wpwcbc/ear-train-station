import { useEffect, useState } from 'react';

/**
 * A tiny ticking clock for UI countdowns.
 *
 * We intentionally update at a coarse cadence (default 30s) to avoid battery drain.
 */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);

  return now;
}

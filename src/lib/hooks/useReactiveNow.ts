import { useEffect, useState } from 'react';

/**
 * Small helper for pages that want a "live" clock that refreshes on:
 * - window focus
 * - localStorage changes (cross-tab)
 * - optional custom in-tab events (e.g. ets_mistakes_changed)
 */
export function useReactiveNow(extraEvents: string[] = []): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    function bump() {
      setNow(Date.now());
    }

    window.addEventListener('focus', bump);
    window.addEventListener('storage', bump);
    for (const ev of extraEvents) window.addEventListener(ev, bump);

    return () => {
      window.removeEventListener('focus', bump);
      window.removeEventListener('storage', bump);
      for (const ev of extraEvents) window.removeEventListener(ev, bump);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraEvents.join('|')]);

  return now;
}

import { useEffect, useState } from 'react';

/**
 * Mirrors the OS/browser accessibility preference.
 *
 * We use this to avoid non-essential animations / haptics (Duolingo also offers a reduce-motion mode).
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(Boolean(mq.matches));

    apply();

    // Safari < 14 uses addListener/removeListener.
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }

    // eslint-disable-next-line deprecation/deprecation
    mq.addListener(apply);
    // eslint-disable-next-line deprecation/deprecation
    return () => mq.removeListener(apply);
  }, []);

  return reduced;
}

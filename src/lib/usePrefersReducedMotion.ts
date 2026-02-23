import { useEffect, useState } from 'react';

/**
 * Lightweight prefers-reduced-motion hook.
 * Default: false (animate), but updates immediately on mount.
 */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;

    const apply = () => setReduced(!!mq.matches);
    apply();

    // Safari < 14 uses addListener/removeListener.
    // eslint-disable-next-line deprecation/deprecation
    if (mq.addEventListener) mq.addEventListener('change', apply);
    // eslint-disable-next-line deprecation/deprecation
    else mq.addListener(apply);

    return () => {
      // eslint-disable-next-line deprecation/deprecation
      if (mq.removeEventListener) mq.removeEventListener('change', apply);
      // eslint-disable-next-line deprecation/deprecation
      else mq.removeListener(apply);
    };
  }, []);

  return reduced;
}

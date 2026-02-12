import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Progress, StationId } from '../lib/progress';
import { ConfigDrawer } from './ConfigDrawer';
import { FocusUIContext, type FocusUIContextValue, type FocusTopBarState } from './focusUI';

export function FocusShell(props: { children?: ReactNode; progress: Progress; setProgress: (p: Progress) => void }) {
  const navigate = useNavigate();
  const loc = useLocation();
  const [configOpen, setConfigOpen] = useState(false);
  const [topBar, setTopBar] = useState<FocusTopBarState>({});

  function clamp01(n: number) {
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  // Avoid “stuck drawer” when navigating between focus routes (esp. mobile back/exit).
  useEffect(() => {
    if (!configOpen) return;
    const t = window.setTimeout(() => setConfigOpen(false), 0);
    return () => window.clearTimeout(t);
  }, [loc.pathname, loc.search, configOpen]);

  const ctx = useMemo<FocusUIContextValue>(() => ({ topBar, setTopBar }), [topBar]);

  const progressPct = topBar.progress == null ? null : Math.round(clamp01(topBar.progress) * 100);

  function onExit() {
    // Special case: in Review drill mode, "X" should return to the review list
    // (instead of exiting the entire Focus flow).
    if (loc.pathname === '/review') {
      const p = new URLSearchParams(loc.search);
      if (p.get('drill') === '1') {
        const station = p.get('station');
        navigate(station ? `/review?station=${station}` : '/review', {
          replace: true,
          state: { from: `${loc.pathname}${loc.search}` },
        });
        return;
      }
    }

    const s = loc.state as unknown as { exitTo?: string } | null;
    const exitTo = s?.exitTo;

    // If caller provided an explicit exit target (e.g. back to section), honor it.
    if (exitTo && typeof exitTo === 'string' && exitTo !== loc.pathname) {
      navigate(exitTo, { replace: true, state: { from: `${loc.pathname}${loc.search}` } });
      return;
    }

    // Prefer a deterministic exit: Learn.
    // (History-based exits can be flaky in PWAs / after SW updates.)
    navigate('/learn', { replace: true, state: { from: `${loc.pathname}${loc.search}` } });
  }

  return (
    <FocusUIContext.Provider value={ctx}>
      <div className="focusShell">
        <header className="focusTop" aria-label="lesson header">
          <button
            type="button"
            className="focusExit"
            onClick={onExit}
            onPointerDown={(e) => {
              // Some mobile browsers can be flaky with click on sticky headers.
              e.currentTarget.setPointerCapture?.(e.pointerId);
            }}
            aria-label="Exit"
          >
            ✕
          </button>

          <div className="focusProgress" aria-label="progress">
            <div className="focusProgressTrack">
              <div className="focusProgressFill" style={{ width: progressPct == null ? '0%' : `${progressPct}%` }} />
            </div>
            {topBar.statusText ? <div className="focusStatus">{topBar.statusText}</div> : null}
          </div>

          <div className="focusRight">
            {topBar.badge ? (
              <div className="focusBadge" title={topBar.badge.title} aria-label="mode">
                {topBar.badge.text}
              </div>
            ) : null}

            {topBar.hearts ? (
              <div className="focusHearts" aria-label="hearts">
                <span aria-hidden>❤</span>
                <span className="focusHeartsText">
                  {topBar.hearts.current}/{topBar.hearts.max}
                </span>
              </div>
            ) : null}

            <button
              type="button"
              className="focusConfig"
              onClick={() => setConfigOpen(true)}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture?.(e.pointerId);
              }}
              aria-label="Open settings"
            >
              ⚙
            </button>
          </div>
        </header>

        <main className="focusContent">
          {props.children}
          <Outlet />
        </main>

        <ConfigDrawer
          open={configOpen}
          onClose={() => setConfigOpen(false)}
          progress={props.progress}
          setProgress={props.setProgress}
          stationId={(() => {
            const m = loc.pathname.match(/^\/lesson\/([^/?#]+)/);
            // Route guarantees this is a valid StationId; keep runtime simple.
            return m?.[1] ? (decodeURIComponent(m[1]) as unknown as StationId) : null;
          })()}
        />
      </div>
    </FocusUIContext.Provider>
  );
}

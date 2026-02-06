import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ConfigDrawer } from './ConfigDrawer';

export type FocusTopBarState = {
  /** 0..1 */
  progress?: number;
  /** Optional small status text (e.g. "Twist", "Mid-test", etc.) */
  statusText?: string;
  /** Hearts only when applicable. */
  hearts?: { current: number; max: number };
};

type FocusUIContextValue = {
  topBar: FocusTopBarState;
  setTopBar: (next: FocusTopBarState) => void;
};

const FocusUIContext = createContext<FocusUIContextValue | null>(null);

export function useFocusUI() {
  const ctx = useContext(FocusUIContext);
  if (!ctx) throw new Error('useFocusUI must be used inside <FocusShell>.');
  return ctx;
}

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function FocusShell(props: { children?: ReactNode }) {
  const navigate = useNavigate();
  const loc = useLocation();
  const [configOpen, setConfigOpen] = useState(false);
  const [topBar, setTopBar] = useState<FocusTopBarState>({});

  const ctx = useMemo<FocusUIContextValue>(() => ({ topBar, setTopBar }), [topBar]);

  const progressPct = topBar.progress == null ? null : Math.round(clamp01(topBar.progress) * 100);

  function onExit() {
    const s = loc.state as unknown as { exitTo?: string } | null;
    const exitTo = s?.exitTo;

    // If caller provided an explicit exit target (e.g. back to section), honor it.
    if (exitTo && typeof exitTo === 'string') {
      navigate(exitTo, { replace: true, state: { from: loc.pathname } });
      return;
    }

    // Prefer going back (like Duolingo), but fall back to Learn if direct-open.
    if (window.history.length > 1) navigate(-1);
    else navigate('/learn', { replace: true, state: { from: loc.pathname } });
  }

  return (
    <FocusUIContext.Provider value={ctx}>
      <div className="focusShell">
        <header className="focusTop" aria-label="lesson header">
          <button className="focusExit" onClick={onExit} aria-label="Exit">
            ✕
          </button>

          <div className="focusProgress" aria-label="progress">
            <div className="focusProgressTrack">
              <div className="focusProgressFill" style={{ width: progressPct == null ? '0%' : `${progressPct}%` }} />
            </div>
            {topBar.statusText ? <div className="focusStatus">{topBar.statusText}</div> : null}
          </div>

          <div className="focusRight">
            {topBar.hearts ? (
              <div className="focusHearts" aria-label="hearts">
                <span aria-hidden>❤</span>
                <span className="focusHeartsText">
                  {topBar.hearts.current}/{topBar.hearts.max}
                </span>
              </div>
            ) : null}

            <button className="focusConfig" onClick={() => setConfigOpen(true)} aria-label="Open settings">
              ⚙
            </button>
          </div>
        </header>

        <main className="focusContent">
          {props.children}
          <Outlet />
        </main>

        <ConfigDrawer open={configOpen} onClose={() => setConfigOpen(false)} />
      </div>
    </FocusUIContext.Provider>
  );
}

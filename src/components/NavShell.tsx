import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useHotkeys } from '../lib/hooks/useHotkeys';
import type { Progress } from '../lib/progress';
import { computeQuestProgress, loadQuestState, msUntilLocalMidnight, QUESTS_CHANGED_EVENT, type QuestComputed } from '../lib/quests';
import { ConfigDrawer } from './ConfigDrawer';
import { HotkeysOverlay } from './HotkeysOverlay';

type Tab = { to: string; label: string; icon: string; accent: string };

function formatResetsInShort(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}


const TABS: Tab[] = [
  { to: '/learn', label: 'Learn', icon: '●', accent: 'var(--route-blue)' },
  { to: '/practice', label: 'Practice', icon: '▶', accent: 'var(--route-green)' },
  { to: '/quests', label: 'Quests', icon: '◆', accent: 'var(--route-purple)' },
  { to: '/leaderboard', label: 'League', icon: '▦', accent: 'var(--route-yellow)' },
  { to: '/profile', label: 'Profile', icon: '◉', accent: 'var(--route-red)' },
];

export function NavShell({
  progress,
  setProgress,
}: {
  progress: Progress;
  setProgress: (p: Progress) => void;
}) {
  const [configOpen, setConfigOpen] = useState(false);
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  const [quests, setQuests] = useState<QuestComputed | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const loc = useLocation();
  const navigate = useNavigate();

  const onQuests = loc.pathname === '/quests' || loc.pathname.startsWith('/quests/');

  const questsBadgeTitle = useMemo(() => {
    if (!quests?.hasWork) return null;
    const resetsIn = formatResetsInShort(msUntilLocalMidnight(new Date(nowMs)));
    if (quests.chestReady) return `Quest chest ready — resets in ${resetsIn}`;
    return `Quests in progress — resets in ${resetsIn}`;
  }, [nowMs, quests?.chestReady, quests?.hasWork]);

  // Avoid double-binding on pages that already manage their own hotkeys overlay.
  const enableShellHotkeys = !loc.pathname.startsWith('/review') && !loc.pathname.startsWith('/practice');

  useHotkeys({
    enabled: enableShellHotkeys,
    keyMap: {
      '?': () => setHotkeysOpen(true),
    },
  });

  useEffect(() => {
    function bump() {
      try {
        const q = loadQuestState();
        setQuests(computeQuestProgress(progress, q));
      } catch {
        setQuests(null);
      }
    }
    bump();
    window.addEventListener('focus', bump);
    window.addEventListener('storage', bump);
    window.addEventListener(QUESTS_CHANGED_EVENT, bump);
    return () => {
      window.removeEventListener('focus', bump);
      window.removeEventListener('storage', bump);
      window.removeEventListener(QUESTS_CHANGED_EVENT, bump);
    };
  }, [progress]);

  // Keep the Quests badge tooltip countdown fresh.
  useEffect(() => {
    if (!quests?.hasWork) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [quests?.hasWork]);

  const activeTab = useMemo(() => {
    // Match by prefix, so /learn/section/* still maps to Learn.
    return TABS.find((t) => loc.pathname === t.to || loc.pathname.startsWith(`${t.to}/`)) ?? TABS[0];
  }, [loc.pathname]);

  const shellStyle = { '--tab-accent': activeTab.accent } as CSSProperties;

  return (
    <div className="shell" style={shellStyle}>
      <aside className="sideNav" aria-label="primary">
        <div className="brandBlock">
          <div className="brandRow">
            <div>
              <div className="brandName">Ear Train Station</div>
              <div className="brandSub">scales • intervals • chords</div>
            </div>
            <div className="brandActions" aria-label="quick actions">
              <button
                className="quickPracticeBtn"
                onClick={() => navigate('/review?warmup=1&n=5')}
                aria-label="Quick practice"
                title="Quick practice (warm‑up, 5 items)"
              >
                ❤
              </button>
              <button
                className="configBtn"
                onClick={() => setHotkeysOpen(true)}
                aria-label="Keyboard shortcuts"
                aria-keyshortcuts="?"
                title="Keyboard shortcuts (?)"
              >
                ?
              </button>
              <button className="configBtn" onClick={() => setConfigOpen(true)} aria-label="Open settings">
                ⚙
              </button>
            </div>
          </div>
        </div>
        <nav className="navList">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              style={{ '--item-accent': t.accent } as CSSProperties}
              className={({ isActive }) => `navItem ${isActive ? 'active' : ''}`}
            >
              <span className="navIconWrap">
                <span className="navIcon" aria-hidden>
                  {t.icon}
                </span>
                {t.to === '/quests' && quests?.hasWork && !onQuests ? (
                  <span
                    className={`navBadge ${quests.chestReady ? 'navBadge--ready' : ''}`}
                    aria-label={quests.chestReady ? 'Quest chest ready' : 'Quests in progress'}
                    title={questsBadgeTitle ?? (quests.chestReady ? 'Quest chest ready' : 'Quests in progress')}
                  />
                ) : null}
              </span>
              <span className="navLabel">{t.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="mainCol">
        <div className="floatingActions" aria-label="quick actions">
          <button
            className="configBtnFloating"
            onClick={() => setHotkeysOpen(true)}
            aria-label="Keyboard shortcuts"
            aria-keyshortcuts="?"
            title="Keyboard shortcuts (?)"
          >
            ?
          </button>
          <button className="configBtnFloating" onClick={() => setConfigOpen(true)} aria-label="Open settings" title="Settings">
            ⚙
          </button>
        </div>

        <div className="content">
          <Outlet />
        </div>

        <nav className="bottomNav" aria-label="primary">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              style={{ '--item-accent': t.accent } as CSSProperties}
              className={({ isActive }) => `bottomItem ${isActive ? 'active' : ''}`}
            >
              <span className="bottomIconWrap">
                <span className="bottomIcon" aria-hidden>
                  {t.icon}
                </span>
                {t.to === '/quests' && quests?.hasWork && !onQuests ? (
                  <span
                    className={`navBadge navBadge--bottom ${quests.chestReady ? 'navBadge--ready' : ''}`}
                    aria-label={quests.chestReady ? 'Quest chest ready' : 'Quests in progress'}
                    title={questsBadgeTitle ?? (quests.chestReady ? 'Quest chest ready' : 'Quests in progress')}
                  />
                ) : null}
              </span>
              <span className="bottomLabel">{t.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <ConfigDrawer open={configOpen} onClose={() => setConfigOpen(false)} progress={progress} setProgress={setProgress} />
      <HotkeysOverlay open={hotkeysOpen} onClose={() => setHotkeysOpen(false)} context="global" />
    </div>
  );
}

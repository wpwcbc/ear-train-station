import { useMemo, useState, type CSSProperties } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import type { Progress } from '../lib/progress';
import { ConfigDrawer } from './ConfigDrawer';

type Tab = { to: string; label: string; icon: string; accent: string };

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
  const loc = useLocation();

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
            <button className="configBtn" onClick={() => setConfigOpen(true)} aria-label="Open settings">
              ⚙
            </button>
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
              <span className="navIcon" aria-hidden>
                {t.icon}
              </span>
              <span className="navLabel">{t.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="mainCol">
        <button className="configBtnFloating" onClick={() => setConfigOpen(true)} aria-label="Open settings">
          ⚙
        </button>

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
              <span className="bottomIcon" aria-hidden>
                {t.icon}
              </span>
              <span className="bottomLabel">{t.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <ConfigDrawer open={configOpen} onClose={() => setConfigOpen(false)} progress={progress} setProgress={setProgress} />
    </div>
  );
}

import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ConfigDrawer } from './ConfigDrawer';

type Tab = { to: string; label: string; icon: string };

const TABS: Tab[] = [
  { to: '/learn', label: 'Learn', icon: '●' },
  { to: '/practice', label: 'Practice', icon: '▶' },
  { to: '/quests', label: 'Quests', icon: '◆' },
  { to: '/leaderboard', label: 'League', icon: '▦' },
  { to: '/profile', label: 'Profile', icon: '◉' },
];

export function NavShell() {
  const [configOpen, setConfigOpen] = useState(false);

  return (
    <div className="shell">
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
            <NavLink key={t.to} to={t.to} className={({ isActive }) => `navItem ${isActive ? 'active' : ''}`}>
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
            <NavLink key={t.to} to={t.to} className={({ isActive }) => `bottomItem ${isActive ? 'active' : ''}`}>
              <span className="bottomIcon" aria-hidden>
                {t.icon}
              </span>
              <span className="bottomLabel">{t.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <ConfigDrawer open={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  );
}

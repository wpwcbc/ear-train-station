import { Link } from 'react-router-dom';
import { STATIONS, nextUnlockedIncomplete } from '../lib/stations';
import type { Progress } from '../lib/progress';
import { useMistakeStats } from '../lib/hooks/useMistakeStats';

export function MapPage({
  progress,
  setProgress,
}: {
  progress: Progress;
  setProgress: (p: Progress) => void;
}) {
  const stats = useMistakeStats();

  function formatIn(ms: number): string {
    const s = Math.ceil(ms / 1000);
    if (s <= 59) return `${s}s`;
    const m = Math.ceil(s / 60);
    if (m <= 59) return `${m}m`;
    const h = Math.ceil(m / 60);
    return `${h}h`;
  }

  const nextDueIn =
    stats.nextDueAt != null && stats.nextDueAt > stats.now ? formatIn(stats.nextDueAt - stats.now) : null;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div>
          <h1 className="title">Train Line</h1>
          <p className="sub">Complete stations in order. Short lessons, frequent tests.</p>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, opacity: 0.85 }}>
          <div>XP: {progress.xp}</div>
          <div>
            Today: {Math.min(progress.dailyXpToday, progress.dailyGoalXp)}/{progress.dailyGoalXp}
          </div>
          <div>Streak: {progress.streakDays} day(s)</div>
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.85, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>
            Review due: {stats.due} (total {stats.total})
            {stats.due === 0 && nextDueIn ? <span style={{ opacity: 0.75 }}> · next in {nextDueIn}</span> : null}
          </span>
          <span style={{ opacity: 0.65 }}>•</span>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <span>Daily goal</span>
            <select
              value={progress.dailyGoalXp}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                if (!Number.isFinite(n) || n <= 0) return;
                setProgress({ ...progress, dailyGoalXp: n });
              }}
            >
              {[10, 20, 40, 60].map((n) => (
                <option key={n} value={n}>
                  {n} XP
                </option>
              ))}
            </select>
          </label>
          {progress.dailyXpToday >= progress.dailyGoalXp ? (
            <span style={{ opacity: 0.95 }}>• Daily goal reached</span>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(() => {
            const nextId = nextUnlockedIncomplete(progress);
            return nextId ? (
              <Link className="linkBtn" to={`/station/${nextId}`}>Continue</Link>
            ) : null;
          })()}
          <Link className={stats.due > 0 ? 'linkBtn primaryLink' : 'linkBtn'} to="/review">
            Review{stats.due > 0 ? ` (${stats.due})` : ''}
          </Link>
        </div>
      </div>

      <div className="line">
        {STATIONS.map((s, idx) => {
          const done = progress.stationDone[s.id];
          const unlocked = idx === 0 ? true : STATIONS.slice(0, idx).every((p) => progress.stationDone[p.id]);

          return (
            <div key={s.id} className="stationRow">
              <div className={`stationDot ${done ? 'done' : ''} ${unlocked ? '' : 'locked'}`}>{idx + 1}</div>
              <div className="stationBody">
                <div className="stationTitle">
                  {s.title}{' '}
                  {done ? <span className="tinyDone">DONE</span> : unlocked ? null : <span className="tinyLocked">LOCKED</span>}
                </div>
                <div className="stationBlurb">{s.blurb}</div>
                <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {unlocked ? (
                    <Link className="linkBtn" to={`/station/${s.id}`}>Start</Link>
                  ) : (
                    <span style={{ fontSize: 12, opacity: 0.75 }}>Finish previous station(s) to unlock.</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, fontSize: 12, opacity: 0.8 }}>
        Install tip: in Chrome, open menu → “Install app”.
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { STATIONS, nextUnlockedIncompleteIn, isStationUnlockedIn, type Station } from '../lib/stations';
import type { Progress } from '../lib/progress';
import { useMistakeStats } from '../lib/hooks/useMistakeStats';

export function MapPage({
  progress,
  stations,
}: {
  progress: Progress;
  stations?: ReadonlyArray<Station>;
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

  const list = stations ?? STATIONS;

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
          <span>
            Daily goal: {progress.dailyGoalXp} XP <span style={{ opacity: 0.7 }}>(edit in ⚙️)</span>
          </span>
          {progress.dailyXpToday >= progress.dailyGoalXp ? (
            <span style={{ opacity: 0.95 }}>• Daily goal reached</span>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(() => {
            const nextId = nextUnlockedIncompleteIn(progress, list);
            return nextId ? (
              <Link className="linkBtn" to={`/lesson/${nextId}`} state={{ exitTo: '/learn' }}>
                Continue
              </Link>
            ) : null;
          })()}
          <Link className={stats.due > 0 ? 'linkBtn primaryLink' : 'linkBtn'} to="/review" state={{ exitTo: '/learn' }}>
            Review{stats.due > 0 ? ` (${stats.due})` : ''}
          </Link>
        </div>
      </div>

      <div className="line">
        {list.map((s, idx) => {
          const done = progress.stationDone[s.id];
          const unlocked = isStationUnlockedIn(progress, s.id, list);

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
                    <Link className="linkBtn" to={`/lesson/${s.id}`} state={{ exitTo: '/learn' }}>
                      Start
                    </Link>
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

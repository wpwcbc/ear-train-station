import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Progress } from '../lib/progress';
import { nextUnlockedIncomplete } from '../lib/stations';
import { dueMistakeCount, mistakeCount, mistakeCountForStation, nextDueAt } from '../lib/mistakes';
import { STATIONS } from '../lib/stations';
import { getABVariant } from '../lib/ab';

function msToHuman(ms: number): string {
  if (ms <= 0) return 'now';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

function localDayKey(ts = Date.now()): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function PracticePage({ progress }: { progress: Progress }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    function bump() {
      setNow(Date.now());
    }
    window.addEventListener('focus', bump);
    window.addEventListener('storage', bump);
    return () => {
      window.removeEventListener('focus', bump);
      window.removeEventListener('storage', bump);
    };
  }, []);

  const due = dueMistakeCount();
  const total = mistakeCount();
  const nextDue = nextDueAt();

  const workoutCopyVariant = getABVariant('practice_today_workout_copy_v1');

  const continueId = nextUnlockedIncomplete(progress);

  const goal = Math.max(1, progress.dailyGoalXp);
  const today = Math.max(0, progress.dailyXpToday);
  const pct = Math.min(100, Math.round((today / goal) * 100));

  // Surface the most actionable review sources first.
  const stationDueCounts = STATIONS.map((s) => ({
    id: s.id,
    title: s.title,
    due: mistakeCountForStation(s.id, { dueOnly: true }),
  }))
    .filter((x) => x.due > 0)
    .sort((a, b) => b.due - a.due);

  return (
    <div className="page">
      <h1 className="h1">Practice</h1>
      <p className="sub">Daily workout + spaced review (Duolingo-ish).</p>

      <div className="card" style={{ marginTop: 12 }} data-ab={workoutCopyVariant}>
        <h2 className="h2">{workoutCopyVariant === 'A' ? 'Today’s workout' : 'Daily drills'}</h2>
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          {workoutCopyVariant === 'A'
            ? 'Two focused sessions that rotate daily (inspired by Duolingo’s Practice Hub).'
            : 'Two quick sessions picked for you — rotates daily.'}
        </div>

        {(() => {
          const dayKey = localDayKey();
          const topDueStation = stationDueCounts[0]?.id ?? null;

          // Deterministic-ish daily rotation: alternate the “top due station” suggestion
          // with a general review, so it doesn’t feel stuck forever.
          const rotate = (Number(dayKey.replaceAll('-', '')) || 0) % 2;
          const reviewTo = topDueStation && rotate === 0 ? `/review?station=${topDueStation}` : '/review';
          const reviewLabel = topDueStation && rotate === 0 ? `Targeted review (${topDueStation})` : 'Targeted review';
          const reviewLabelB = topDueStation && rotate === 0 ? `Fix weak spots (${topDueStation})` : 'Fix weak spots';

          const newLabel = continueId ? 'New material (continue)' : 'New material (pick a section)';
          const newLabelB = continueId ? 'Learn something new (continue)' : 'Learn something new';
          const newTo = continueId ? `/lesson/${continueId}` : '/learn';

          return (
            <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link className="linkBtn" to={reviewTo} state={{ exitTo: '/practice' }} title={dayKey}>
                {workoutCopyVariant === 'A' ? reviewLabel : reviewLabelB}
              </Link>
              <Link className="linkBtn" to={newTo} state={{ exitTo: '/practice' }}>
                {workoutCopyVariant === 'A' ? newLabel : newLabelB}
              </Link>
            </div>
          );
        })()}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h2 className="h2">Daily goal</h2>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
          <div style={{ fontSize: 14, opacity: 0.9 }}>
            Today: <b>{today}</b> / {goal} XP
          </div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>{pct}%</div>
        </div>
        <div
          aria-label="daily goal progress"
          style={{
            marginTop: 8,
            height: 10,
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 999,
            overflow: 'hidden',
          }}
        >
          <div style={{ width: `${pct}%`, height: '100%', background: 'rgba(92, 231, 158, 0.9)' }} />
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {continueId ? (
            <Link className="linkBtn" to={`/lesson/${continueId}`} state={{ exitTo: '/practice' }}>
              Continue
            </Link>
          ) : (
            <Link className="linkBtn" to="/learn">
              Pick a section
            </Link>
          )}
          <Link className="linkBtn" to="/learn">
            Map
          </Link>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h2 className="h2">Review queue</h2>
        <div style={{ fontSize: 14, opacity: 0.9 }}>
          Due: <b>{due}</b> / {total}
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <Link className="linkBtn" to="/review" state={{ exitTo: '/practice' }}>
            Review now
          </Link>
          <Link className="linkBtn" to="/review?drill=1" state={{ exitTo: '/practice' }} title="Auto-picks your top 3 missed interval labels">
            Top misses drill
          </Link>
          {due === 0 && nextDue ? (
            <span style={{ fontSize: 12, opacity: 0.75 }}>Next due in {msToHuman(nextDue - now)}</span>
          ) : null}
        </div>

        {stationDueCounts.length ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Most due by station</div>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              {stationDueCounts.slice(0, 6).map((s) => (
                <Link key={s.id} className="pill" to={`/review?station=${s.id}`} state={{ exitTo: '/practice' }}>
                  {s.id} · {s.due}
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
            No items due. Miss something in a lesson/test and it’ll show up here.
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h2 className="h2">Quick picks</h2>
        <div style={{ fontSize: 12, opacity: 0.8 }}>Tip: If you fail a test, use Review to clear weak spots, then retry.</div>
        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link className="linkBtn" to="/learn">
            Lessons
          </Link>
          <Link className="linkBtn" to="/review" state={{ exitTo: '/practice' }}>
            Review
          </Link>
        </div>
      </div>
    </div>
  );
}

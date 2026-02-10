import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { Progress } from '../lib/progress';
import { nextUnlockedIncomplete } from '../lib/stations';
import { intervalMistakeStatsFrom, loadMistakes, mistakeCountForStation, mistakeScheduleSummary } from '../lib/mistakes';
import { STATIONS } from '../lib/stations';
import { SEMITONE_TO_LABEL } from '../exercises/interval';
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

function workoutLsKey(dayKey: string, session: 1 | 2): string {
  return `kuku:practiceWorkout:${dayKey}:${session}`;
}

function getWorkoutDone(dayKey: string, session: 1 | 2): boolean {
  try {
    return window.localStorage.getItem(workoutLsKey(dayKey, session)) === '1';
  } catch {
    return false;
  }
}

function setWorkoutDone(dayKey: string, session: 1 | 2) {
  try {
    window.localStorage.setItem(workoutLsKey(dayKey, session), '1');
  } catch {
    // ignore
  }
}

function subDays(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split('-').map((x) => Number(x));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() - days);
  return localDayKey(dt.getTime());
}

function getWorkoutDayDone(dayKey: string): boolean {
  // Treat 1+ sessions as “done for the day” (Duolingo-like: forgiving).
  // The per-session checkmarks still preserve the 2-session “workout” framing.
  return getWorkoutDone(dayKey, 1) || getWorkoutDone(dayKey, 2);
}

function getWorkoutStreak(todayKey: string, maxDays = 365): number {
  let n = 0;
  for (let i = 0; i < maxDays; i++) {
    const k = subDays(todayKey, i);
    if (!getWorkoutDayDone(k)) break;
    n++;
  }
  return n;
}

export function PracticePage({ progress }: { progress: Progress }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

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

  // If we return from Focus routes with a workout completion flag, persist it for today
  // and clean the URL (so refresh doesn't re-apply).
  useEffect(() => {
    const raw = (searchParams.get('workoutDone') || '').trim();
    const session = raw === '1' ? 1 : raw === '2' ? 2 : null;
    if (!session) return;

    const dayKey = localDayKey();
    setWorkoutDone(dayKey, session);
    navigate('/practice', { replace: true });
  }, [navigate, searchParams]);

  const sched = mistakeScheduleSummary(now);
  const intervalStatsTop = intervalMistakeStatsFrom(loadMistakes()).slice(0, 3);

  const workoutCopyVariant = getABVariant('practice_today_workout_copy_v1');

  const dayKey = localDayKey(now);
  const workout1Done = getWorkoutDone(dayKey, 1);
  const workout2Done = getWorkoutDone(dayKey, 2);
  const workoutDoneCount = (workout1Done ? 1 : 0) + (workout2Done ? 1 : 0);

  const workoutStreak = getWorkoutStreak(dayKey);
  const workoutWeek = Array.from({ length: 7 }, (_, i) => {
    const k = subDays(dayKey, 6 - i);
    return {
      key: k,
      done: getWorkoutDayDone(k),
      isToday: k === dayKey,
    };
  });

  const continueId = nextUnlockedIncomplete(progress);

  const goal = Math.max(1, progress.dailyGoalXp);
  const today = Math.max(0, progress.dailyXpToday);
  const pct = Math.min(100, Math.round((today / goal) * 100));

  // Surface the most actionable review sources first.
  // If nothing is due right now, still show where your queue is concentrated.
  const stationCounts = STATIONS.map((s) => ({
    id: s.id,
    title: s.title,
    due: mistakeCountForStation(s.id, { dueOnly: true }),
    queued: mistakeCountForStation(s.id),
  }))
    .filter((x) => (sched.dueNow > 0 ? x.due > 0 : x.queued > 0))
    .sort((a, b) => b.due - a.due || b.queued - a.queued);

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

        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
          Workout progress: <b>{workoutDoneCount}/2</b> done{workoutDoneCount === 2 ? <span style={{ opacity: 0.9 }}> • Nice.</span> : null}
        </div>

        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, opacity: 0.8 }} title="Counts days with at least 1 workout session done.">
            Workout streak: <b>{workoutStreak}</b> day{workoutStreak === 1 ? '' : 's'}
          </div>
          <div aria-label="workout last 7 days" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {workoutWeek.map((d) => (
              <span
                key={d.key}
                title={`${d.key}${d.isToday ? ' (today)' : ''}${d.done ? ' ✓' : ''}`}
                aria-label={`${d.key} ${d.done ? 'done' : 'not done'}`}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  display: 'inline-block',
                  background: d.done ? 'rgba(92, 231, 158, 0.92)' : 'rgba(255,255,255,0.18)',
                  outline: d.isToday ? '2px solid rgba(255,255,255,0.55)' : 'none',
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </div>

        {(() => {
          const topDueStation = stationCounts[0]?.id ?? null;

          // Deterministic-ish daily rotation:
          // - Session #1 is always “Review”, but becomes Warm-up when nothing is due yet.
          // - Session #2 alternates between a Drill and New material (if available)
          const rotate = (Number(dayKey.replaceAll('-', '')) || 0) % 2;

          const hasDue = sched.dueNow > 0;
          const hasQueue = sched.total > 0;

          const withWorkout = (to: string, session: 1 | 2) => {
            if (!to.startsWith('/review')) return to;
            return `${to}${to.includes('?') ? '&' : '?'}workout=${session}`;
          };

          const reviewBase = hasDue ? '/review' : hasQueue ? '/review?warmup=1' : '/review';
          const reviewToBase = topDueStation && rotate === 0 ? `${reviewBase}${reviewBase.includes('?') ? '&' : '?'}station=${topDueStation}` : reviewBase;
          const reviewTo = withWorkout(reviewToBase, 1);
          const reviewLabel = hasDue
            ? topDueStation && rotate === 0
              ? `Review (${sched.dueNow} due · ${topDueStation})`
              : `Review (${sched.dueNow} due)`
            : hasQueue
              ? topDueStation && rotate === 0
                ? `Warm‑up (${topDueStation})`
                : 'Warm‑up review'
              : 'Review';
          const reviewLabelB = hasDue
            ? topDueStation && rotate === 0
              ? `Review now (${topDueStation})`
              : 'Review now'
            : hasQueue
              ? topDueStation && rotate === 0
                ? `Warm up (${topDueStation})`
                : 'Warm up'
              : 'Review';

          const hasNew = Boolean(continueId);
          const newTo = continueId ? `/lesson/${continueId}` : '/learn';
          const newLabel = continueId ? 'New material (continue)' : 'New material (pick a section)';
          const newLabelB = continueId ? 'Learn something new (continue)' : 'Learn something new';

          // If the user has a review queue, prioritize a drill. Otherwise, steer to new material.
          // Alternate daily so it feels less repetitive.
          const drillTo = '/review?drill=1';
          const drillLabel = 'Top misses drill';
          const drillLabelB = 'Quick drill';

          const pickSecond = () => {
            if (!hasQueue) return { to: newTo, labelA: newLabel, labelB: newLabelB, title: 'Learn something new' };
            if (rotate === 0) return { to: drillTo, labelA: drillLabel, labelB: drillLabelB, title: 'A fast interval drill from your mistakes (wide register: G2+).' };
            // Rotate to “new material” even when you have a queue, so the app doesn’t nag forever.
            if (hasNew) return { to: newTo, labelA: newLabel, labelB: newLabelB, title: 'Keep moving forward — you can always Review after.' };
            return { to: drillTo, labelA: drillLabel, labelB: drillLabelB, title: 'A fast interval drill from your mistakes (wide register: G2+).' };
          };

          const second = pickSecond();
          const secondTo = withWorkout(second.to, 2);
          const secondExitTo = second.to.startsWith('/lesson/') ? '/practice?workoutDone=2' : '/practice';

          return (
            <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link
                className="linkBtn"
                to={reviewTo}
                state={{ exitTo: '/practice' }}
                title={hasDue ? 'Clear items that are due now' : hasQueue && sched.nextDueAt ? `Nothing due yet — next due in ${msToHuman(sched.nextDueAt - now)}` : hasQueue ? 'A short warm‑up set from your queue (even if nothing is due yet)' : dayKey}
              >
                {workoutCopyVariant === 'A' ? reviewLabel : reviewLabelB}{workout1Done ? ' ✓' : ''}
              </Link>
              <Link className="linkBtn" to={secondTo} state={{ exitTo: secondExitTo }} title={second.title}>
                {workoutCopyVariant === 'A' ? second.labelA : second.labelB}{workout2Done ? ' ✓' : ''}
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
          Due now: <b>{sched.dueNow}</b> / {sched.total}
          {sched.hard ? (
            <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.8 }} title="Hard = items you’ve missed 3+ times (need 3 clears)">
              · Hard {sched.hard}
            </span>
          ) : null}
        </div>
        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
          Review unlocks by spaced repetition — warm‑up is optional.
        </div>

        {sched.total ? (
          <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <span className="pill" title="Eligible now">
              Now · {sched.dueNow}
            </span>
            <span className="pill" title="Becomes eligible within 1 hour">
              ≤1h · {sched.within1h}
            </span>
            <span className="pill" title="Becomes eligible later today">
              Today · {sched.today}
            </span>
            <span className="pill" title="Not today">
              Later · {sched.later}
            </span>
            {sched.dueNow === 0 && sched.nextDueAt ? (
              <span style={{ fontSize: 12, opacity: 0.75 }}>Next due in {msToHuman(sched.nextDueAt - now)}</span>
            ) : null}
          </div>
        ) : null}

        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
          {(() => {
            const hasDue = sched.dueNow > 0;
            const hasQueue = sched.total > 0;
            const to = hasDue ? '/review' : hasQueue ? '/review?warmup=1' : '/review';
            const label = hasDue ? `Review (${sched.dueNow} due)` : hasQueue ? 'Warm‑up review' : 'Review';
            const title = hasDue
              ? 'Clear items that are due now'
              : hasQueue && sched.nextDueAt
                ? `Nothing due yet — next due in ${msToHuman(sched.nextDueAt - now)}`
                : hasQueue
                  ? 'A short warm‑up set from your queue (even if nothing is due yet)'
                  : 'Review your mistakes as you make them';

            return (
              <Link className="linkBtn" to={to} state={{ exitTo: '/practice' }} title={title}>
                {label}
              </Link>
            );
          })()}

          <Link
            className="linkBtn"
            to="/review?drill=1"
            state={{ exitTo: '/practice' }}
            title={
              intervalStatsTop.length
                ? `Auto-picks your top missed interval labels: ${intervalStatsTop
                    .map((x) => SEMITONE_TO_LABEL[x.semitones] ?? `${x.semitones}st`)
                    .join(', ')}`
                : 'Auto-picks your top 3 missed interval labels'
            }
          >
            Top misses drill
            {intervalStatsTop.length ? (
              <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.8 }}>
                ({intervalStatsTop
                  .map((x) => SEMITONE_TO_LABEL[x.semitones] ?? `${x.semitones}st`)
                  .join(', ')})
              </span>
            ) : null}
          </Link>
          <Link className="linkBtn" to="/review?manage=1#manage" state={{ exitTo: '/practice' }} title="Browse and manage your Review queue (on-demand)">
            Manage mistakes
          </Link>
          {sched.total === 0 ? <span style={{ fontSize: 12, opacity: 0.75 }}>No mistakes yet — nice.</span> : null}
        </div>

        {stationCounts.length ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>{sched.dueNow > 0 ? 'Most due by station' : 'Most queued by station'}</div>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              {stationCounts.slice(0, 6).map((s) => {
                const hasDue = sched.dueNow > 0;
                const base = hasDue ? '/review' : '/review?warmup=1';
                const to = `${base}${base.includes('?') ? '&' : '?'}station=${s.id}`;
                const count = hasDue ? s.due : s.queued;
                return (
                  <Link key={s.id} className="pill" to={to} state={{ exitTo: '/practice' }} title={s.title}>
                    {s.id} · {count}
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
            {sched.total === 0
              ? 'No mistakes queued yet. Miss something in a lesson/test and it’ll show up here.'
              : sched.nextDueAt
                ? `Nothing due right now — next due in ${msToHuman(sched.nextDueAt - now)}.`
                : 'Nothing due right now.'}
            {sched.total > 0 ? <span style={{ marginLeft: 6, opacity: 0.8 }}>Warm‑up is optional.</span> : null}
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

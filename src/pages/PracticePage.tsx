import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useReactiveNow } from '../lib/hooks/useReactiveNow';
import { CopyLinkButton } from '../components/CopyLinkButton';
import type { Progress } from '../lib/progress';
import { nextUnlockedIncomplete } from '../lib/stations';
import {
  intervalMistakeStatsFrom,
  loadMistakes,
  MISTAKES_CHANGED_EVENT,
  mistakeCountForStation,
  mistakeScheduleSummary,
  triadMistakeStatsFrom,
} from '../lib/mistakes';
import { STATIONS } from '../lib/stations';
import { SEMITONE_TO_LABEL } from '../exercises/interval';
import { triadQualityLabel } from '../exercises/triad';
import { getABVariant } from '../lib/ab';
import { loadReviewSessionHistory } from '../lib/reviewSessionHistory';
import { computeReviewHistoryStats } from '../lib/reviewHistoryStats';
import { getWorkoutDayDone, getWorkoutDone, getWorkoutStreak, localDayKey, setWorkoutDone, subDays } from '../lib/workout';

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

// workout helpers moved to src/lib/workout.ts

export function PracticePage({ progress }: { progress: Progress }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const now = useReactiveNow([MISTAKES_CHANGED_EVENT]);

  const [workoutToast, setWorkoutToast] = useState<null | { session: 1 | 2; at: number }>(null);

  // If we return from Focus routes with a workout completion flag, persist it for today
  // and clean the URL (so refresh doesn't re-apply).
  useEffect(() => {
    const raw = (searchParams.get('workoutDone') || '').trim();
    const session = raw === '1' ? 1 : raw === '2' ? 2 : null;
    if (!session) return;

    const dayKey = localDayKey();
    setWorkoutDone(dayKey, session);

    // Small Duolingo-ish reinforcement: show a quick “done” toast.
    // (Defer state updates to avoid cascading renders inside effects.)
    let t1: number | undefined;
    const t0 = window.setTimeout(() => {
      setWorkoutToast({ session, at: Date.now() });
      t1 = window.setTimeout(() => setWorkoutToast(null), 4500);
    }, 0);

    navigate('/practice', { replace: true });
    return () => {
      window.clearTimeout(t0);
      if (t1) window.clearTimeout(t1);
    };
  }, [navigate, searchParams]);

  const sched = mistakeScheduleSummary(now);
  const mistakes = loadMistakes();
  const intervalStatsTop = intervalMistakeStatsFrom(mistakes).slice(0, 3);
  const triadStatsTop = triadMistakeStatsFrom(mistakes).slice(0, 2);
  const hasIntervalMistakes = intervalStatsTop.length > 0;
  const hasTriadMistakes = triadStatsTop.length > 0;

  const reviewHistoryStats = (() => {
    // Best-effort: Practice page reads history, but does not expose raw data here.
    const entries = loadReviewSessionHistory();
    return computeReviewHistoryStats(entries);
  })();

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

      {workoutToast ? (
        <div
          className="card"
          role="status"
          aria-live="polite"
          style={{
            marginTop: 12,
            border: '1px solid rgba(92, 231, 158, 0.35)',
            background: 'linear-gradient(180deg, rgba(92,231,158,0.14), rgba(255,255,255,0.02))',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <div>
              <b>Workout session {workoutToast.session} complete.</b> Nice.
            </div>
            <button className="ghost" onClick={() => setWorkoutToast(null)} title="Dismiss">
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

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

          const reviewBase = hasDue ? '/review' : hasQueue ? '/review?warmup=1&n=5' : '/review';
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

          // If the user has a review queue, prioritize a drill.
          // BUT: only if they actually have mistakes for that drill — otherwise it would be empty.
          // Tiny heuristic: if triad mistakes dominate (by weight), pick a triad drill sometimes.
          // (Still deterministic-ish via day rotation, so it won’t feel random.)
          const intervalWeight = intervalStatsTop.reduce((acc, s) => acc + s.weight, 0);
          const triadWeight = triadStatsTop.reduce((acc, s) => acc + s.weight, 0);

          const preferTriadDrill = hasTriadMistakes && triadWeight > intervalWeight * 1.15;

          const drillKind: 'interval' | 'triad' = preferTriadDrill ? 'triad' : 'interval';
          const hasChosenMistakes = drillKind === 'triad' ? hasTriadMistakes : hasIntervalMistakes;

          const drillTo = hasChosenMistakes ? (drillKind === 'triad' ? '/review?drill=1&kind=triad' : '/review?drill=1') : '/review?warmup=1&n=5';
          const drillLabel = hasChosenMistakes ? (drillKind === 'triad' ? 'Triad misses drill' : 'Top misses drill') : 'Quick warm‑up';
          const drillLabelB = hasChosenMistakes ? 'Quick drill' : 'Warm up';

          const drillTitle = hasChosenMistakes
            ? drillKind === 'triad'
              ? 'A fast triad-quality drill from your mistakes (wide register: G2+).'
              : 'A fast interval drill from your mistakes (wide register: G2+).'
            : 'No mistakes yet for a drill — do a quick warm‑up from your queue instead.';

          const pickSecond = () => {
            if (!hasQueue) return { to: newTo, labelA: newLabel, labelB: newLabelB, title: 'Learn something new' };
            if (rotate === 0) return { to: drillTo, labelA: drillLabel, labelB: drillLabelB, title: drillTitle };
            // Rotate to “new material” even when you have a queue, so the app doesn’t nag forever.
            if (hasNew) return { to: newTo, labelA: newLabel, labelB: newLabelB, title: 'Keep moving forward — you can always Review after.' };
            return { to: drillTo, labelA: drillLabel, labelB: drillLabelB, title: drillTitle };
          };

          const second = pickSecond();
          const secondTo = withWorkout(second.to, 2);
          const secondExitTo = second.to.startsWith('/lesson/') ? '/practice?workoutDone=2' : '/practice';

          return (
            <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <Link
                className="linkBtn"
                to={reviewTo}
                state={{ exitTo: '/practice' }}
                title={hasDue ? 'Clear items that are due now' : hasQueue && sched.nextDueAt ? `Nothing due yet — next due in ${msToHuman(sched.nextDueAt - now)}` : hasQueue ? 'A short warm‑up set from your queue (even if nothing is due yet)' : dayKey}
              >
                {workoutCopyVariant === 'A' ? reviewLabel : reviewLabelB}{workout1Done ? ' ✓' : ''}
              </Link>
              <CopyLinkButton to={reviewTo} label="Copy workout session 1 link" />

              <Link className="linkBtn" to={secondTo} state={{ exitTo: secondExitTo }} title={second.title}>
                {workoutCopyVariant === 'A' ? second.labelA : second.labelB}{workout2Done ? ' ✓' : ''}
              </Link>
              <CopyLinkButton to={secondTo} label="Copy workout session 2 link" />
            </div>
          );
        })()}
      </div>

      {reviewHistoryStats.count ? (
        <div className="card" style={{ marginTop: 12 }}>
          <h2 className="h2">Recent performance</h2>
          <div style={{ fontSize: 12, opacity: 0.8 }}>From your last Review sessions (not drills).</div>

          <div style={{ marginTop: 6, fontSize: 14, opacity: 0.9 }}>
            Avg accuracy (last 10): <b>{Math.round(reviewHistoryStats.avg10 * 100)}%</b>
            {reviewHistoryStats.count >= 50 ? (
              <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.8 }} title="Average accuracy over your last 50 recorded sessions.">
                · last 50: {Math.round(reviewHistoryStats.avg50 * 100)}%
              </span>
            ) : null}
          </div>

          {reviewHistoryStats.stationsNeedsLove.length ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Needs love</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {reviewHistoryStats.stationsNeedsLove.slice(0, 3).map((r) => (
                  <Link
                    key={r.station}
                    className="pill"
                    to={`/review?station=${encodeURIComponent(r.station)}`}
                    state={{ exitTo: '/practice' }}
                    title={`Avg accuracy: ${Math.round(r.avgAcc * 100)}% across ${r.sessions} sessions`}
                  >
                    {r.stationName} · {Math.round(r.avgAcc * 100)}%
                  </Link>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                Tip: if accuracy is low, do a quick Review session for that station, then retry a lesson/test.
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

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
          <span
            style={{ marginLeft: 6, opacity: 0.85, textDecoration: 'underline dotted', cursor: 'help' }}
            title="Warm‑up = a short set from your Review queue even when nothing is due yet. Great for a quick tune‑up."
          >
            What is Warm‑up?
          </span>
          <span style={{ marginLeft: 6, opacity: 0.85 }} title="Deep-link override: add ?n=5 (or 3–30) to change the session length.">
            Sessions are up to <b>10</b> items by default.
          </span>
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
            const to = hasDue ? '/review' : hasQueue ? '/review?warmup=1&n=5' : '/review';
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

          {sched.hard ? (
            <Link
              className="linkBtn"
              to="/review?hard=1"
              state={{ exitTo: '/practice' }}
              title="Hard focus = only items you’ve missed 3+ times (wrongCount≥3)."
            >
              Hard focus ({sched.hard})
            </Link>
          ) : null}

          {(() => {
            const to = hasIntervalMistakes
              ? `/review?drill=1&semitones=${encodeURIComponent(intervalStatsTop.map((x) => x.semitones).join(','))}`
              : '/review?warmup=1&n=5';

            return (
              <>
                <Link
                  className="linkBtn"
                  to={to}
                  state={{ exitTo: '/practice' }}
                  title={
                    hasIntervalMistakes
                      ? `Drill focuses your top missed interval labels: ${intervalStatsTop
                          .map((x) => SEMITONE_TO_LABEL[x.semitones] ?? `${x.semitones}st`)
                          .join(', ')}`
                      : 'No interval mistakes yet — warm‑up is the fastest way to practice your queue.'
                  }
                >
                  {hasIntervalMistakes ? 'Top misses drill' : 'Quick warm‑up'}
                  {hasIntervalMistakes && intervalStatsTop.length ? (
                    <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.8 }}>
                      ({intervalStatsTop
                        .map((x) => SEMITONE_TO_LABEL[x.semitones] ?? `${x.semitones}st`)
                        .join(', ')})
                    </span>
                  ) : null}
                </Link>
                <CopyLinkButton to={to} label="Copy interval drill link" />
              </>
            );
          })()}

          {hasTriadMistakes ? (() => {
            const to = `/review?drill=1&kind=triad&qualities=${encodeURIComponent(triadStatsTop.map((x) => x.quality).join(','))}`;
            return (
              <>
                <Link
                  className="linkBtn"
                  to={to}
                  state={{ exitTo: '/practice' }}
                  title={`Triad-quality drill from your mistakes: ${triadStatsTop.map((x) => triadQualityLabel(x.quality)).join(', ')} (wide register: G2+).`}
                >
                  Triad misses drill
                  {triadStatsTop.length ? (
                    <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.8 }}>({triadStatsTop.map((x) => triadQualityLabel(x.quality)).join(', ')})</span>
                  ) : null}
                </Link>
                <CopyLinkButton to={to} label="Copy triad drill link" />
              </>
            );
          })() : null}

          {hasTriadMistakes ? (
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, opacity: 0.75 }}>Triad shortcuts:</span>
              {(['major', 'minor', 'diminished'] as const).map((q) => (
                <Link
                  key={q}
                  className="pill"
                  to={`/review?drill=1&kind=triad&qualities=${encodeURIComponent(q)}`}
                  state={{ exitTo: '/practice' }}
                  title={`Drill ${triadQualityLabel(q)} only (wide register: G2+)`}
                >
                  {triadQualityLabel(q)}
                </Link>
              ))}
            </div>
          ) : null}

          {hasIntervalMistakes && intervalStatsTop.length ? (
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, opacity: 0.75 }}>Drill shortcuts:</span>
              {intervalStatsTop.map((x) => {
                const label = SEMITONE_TO_LABEL[x.semitones] ?? `${x.semitones}st`;
                return (
                  <Link
                    key={x.semitones}
                    className="pill"
                    to={`/review?drill=1&semitones=${encodeURIComponent(String(x.semitones))}`}
                    state={{ exitTo: '/practice' }}
                    title={`Drill ${label} only (wide register: G2+)`}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          ) : null}

          <Link className="linkBtn" to="/review?manage=1#manage" state={{ exitTo: '/practice' }} title="Browse and manage your Review queue (on-demand)">
            Manage mistakes
            {sched.total ? (
              <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.8 }} aria-label={`review queue ${sched.dueNow} due now out of ${sched.total} queued`}>
                ({sched.dueNow} due / {sched.total})
              </span>
            ) : null}
          </Link>
          {sched.total === 0 ? <span style={{ fontSize: 12, opacity: 0.75 }}>No mistakes yet — nice.</span> : null}
        </div>

        {stationCounts.length ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>{sched.dueNow > 0 ? 'Most due by station' : 'Most queued by station'}</div>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              {stationCounts.slice(0, 6).map((s) => {
                const hasDue = sched.dueNow > 0;
                const base = hasDue ? '/review' : '/review?warmup=1&n=5';
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

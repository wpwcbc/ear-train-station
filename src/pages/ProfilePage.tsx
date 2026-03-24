import { useEffect, useMemo, useState } from 'react';
import type { Progress } from '../lib/progress';
import { loadStreakState, STREAK_CHANGED_EVENT, type StreakStateV1 } from '../lib/streak';
import { QUEST_BEST_TITLE, QUEST_STREAK_FOOTNOTE, QUEST_STREAK_TITLE } from '../lib/streakCopy';
import { loadReviewSessionHistory, REVIEW_SESSION_HISTORY_CHANGED_EVENT, type ReviewSessionHistoryEntryV1 } from '../lib/reviewSessionHistory';
import { computeReviewWeekSummary } from '../lib/reviewWeekSummary';
import { computeXpWeekSummary } from '../lib/xpWeekSummary';
import { DeltaChip } from '../components/DeltaChip';
import { WORKOUT_CHANGED_EVENT, getWorkoutStreak, localDayKey } from '../lib/workout';
import { computeWorkoutWeekSummary } from '../lib/workoutWeekSummary';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function ymdFromLocalDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shortDow(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

export function ProfilePage({ progress }: { progress: Progress; setProgress: (p: Progress) => void }) {
  const [questStreak, setQuestStreak] = useState<StreakStateV1>(() => loadStreakState());
  const [reviewHistory, setReviewHistory] = useState<ReviewSessionHistoryEntryV1[]>(() => loadReviewSessionHistory());
  const [workoutTick, setWorkoutTick] = useState(0);

  useEffect(() => {
    function bump() {
      setQuestStreak(loadStreakState());
    }
    window.addEventListener('focus', bump);
    window.addEventListener('storage', bump);
    window.addEventListener(STREAK_CHANGED_EVENT, bump);
    return () => {
      window.removeEventListener('focus', bump);
      window.removeEventListener('storage', bump);
      window.removeEventListener(STREAK_CHANGED_EVENT, bump);
    };
  }, []);

  useEffect(() => {
    function bump() {
      setReviewHistory(loadReviewSessionHistory());
    }
    window.addEventListener('focus', bump);
    window.addEventListener('storage', bump);
    window.addEventListener(REVIEW_SESSION_HISTORY_CHANGED_EVENT, bump);
    return () => {
      window.removeEventListener('focus', bump);
      window.removeEventListener('storage', bump);
      window.removeEventListener(REVIEW_SESSION_HISTORY_CHANGED_EVENT, bump);
    };
  }, []);

  useEffect(() => {
    function bump() {
      setWorkoutTick((n) => n + 1);
    }
    window.addEventListener('focus', bump);
    window.addEventListener('storage', bump);
    window.addEventListener(WORKOUT_CHANGED_EVENT, bump);
    return () => {
      window.removeEventListener('focus', bump);
      window.removeEventListener('storage', bump);
      window.removeEventListener(WORKOUT_CHANGED_EVENT, bump);
    };
  }, []);

  const goal = clamp(progress.dailyGoalXp || 20, 5, 200);
  const today = Math.max(0, progress.dailyXpToday || 0);
  const pct = useMemo(() => {
    if (goal <= 0) return 0;
    return clamp(Math.round((today / goal) * 100), 0, 100);
  }, [today, goal]);

  const week = useMemo(() => {
    const s = computeXpWeekSummary(progress.dailyXpByYmd);
    const days = s.days.map((d) => ({ ...d, label: shortDow(new Date(`${d.ymd}T12:00:00`)) }));
    return { ...s, days };
  }, [progress.dailyXpByYmd]);

  const [selectedYmd, setSelectedYmd] = useState<string | null>(null);
  const selectedDay = useMemo(() => {
    if (!selectedYmd) return null;
    return week.days.find((d) => d.ymd === selectedYmd) || null;
  }, [selectedYmd, week.days]);

  function handleWeekKeyNav(
    e: React.KeyboardEvent,
    days: { ymd: string }[],
    curYmd: string,
    setYmd: (ymd: string) => void,
    idPrefix: string,
  ) {
    const idx = days.findIndex((d) => d.ymd === curYmd);
    if (idx < 0) return;

    let nextIdx: number | null = null;
    if (e.key === 'ArrowLeft') nextIdx = Math.max(0, idx - 1);
    if (e.key === 'ArrowRight') nextIdx = Math.min(days.length - 1, idx + 1);
    if (e.key === 'Home') nextIdx = 0;
    if (e.key === 'End') nextIdx = days.length - 1;
    if (nextIdx == null || nextIdx === idx) return;

    e.preventDefault();
    const nextYmd = days[nextIdx].ymd;
    setYmd(nextYmd);
    requestAnimationFrame(() => {
      const el = document.getElementById(`${idPrefix}-${nextYmd}`) as HTMLElement | null;
      el?.focus();
    });
  }

  const reviewWeek = useMemo(() => {
    const s = computeReviewWeekSummary(reviewHistory);
    const days = s.days.map((d) => ({ ...d, label: shortDow(new Date(`${d.ymd}T12:00:00`)) }));
    return { ...s, days };
  }, [reviewHistory]);

  const [selectedReviewYmd, setSelectedReviewYmd] = useState<string | null>(null);
  const selectedReviewDay = useMemo(() => {
    if (!selectedReviewYmd) return null;
    return reviewWeek.days.find((d) => d.ymd === selectedReviewYmd) || null;
  }, [selectedReviewYmd, reviewWeek.days]);


  const bestReviewDay = useMemo(() => {
    if (!reviewWeek.bestDayYmd) return null;
    return reviewWeek.days.find((d) => d.ymd === reviewWeek.bestDayYmd) || null;
  }, [reviewWeek.bestDayYmd, reviewWeek.days]);

  const workoutWeek = useMemo(() => {
    return computeWorkoutWeekSummary({ todayKey: localDayKey() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutTick]);

  const workoutStreak = useMemo(() => getWorkoutStreak(localDayKey()), [workoutTick]);

  const [selectedWorkoutYmd, setSelectedWorkoutYmd] = useState<string | null>(null);
  const selectedWorkoutDay = useMemo(() => {
    if (!selectedWorkoutYmd) return null;
    return workoutWeek.days.find((d) => d.ymd === selectedWorkoutYmd) || null;
  }, [selectedWorkoutYmd, workoutWeek.days]);

  return (
    <div className="page">
      <h1 className="h1">Profile</h1>
      <p className="sub">Stats. (Settings live behind ⚙️.)</p>

      <div className="callout">
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <div style={{ border: '3px solid var(--ink)', borderRadius: 16, padding: 12, background: 'var(--card)' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Total XP</div>
              <div style={{ fontSize: 22, fontWeight: 850 }}>{progress.xp}</div>
            </div>
            <div style={{ border: '3px solid var(--ink)', borderRadius: 16, padding: 12, background: 'var(--card)' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>XP streak (study)</div>
              <div style={{ fontSize: 22, fontWeight: 850 }}>
                {progress.streakDays} day{progress.streakDays === 1 ? '' : 's'}
              </div>
            </div>
            <div
              style={{ border: '3px solid var(--ink)', borderRadius: 16, padding: 12, background: 'var(--card)' }}
              title={QUEST_STREAK_TITLE}
            >
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Quest streak</div>
              <div style={{ fontSize: 22, fontWeight: 850 }}>
                {questStreak.streak} day{questStreak.streak === 1 ? '' : 's'}
              </div>
            </div>
            <div
              style={{ border: '3px solid var(--ink)', borderRadius: 16, padding: 12, background: 'var(--card)' }}
              title={QUEST_BEST_TITLE}
            >
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Quest best</div>
              <div style={{ fontSize: 22, fontWeight: 850 }}>{questStreak.best}</div>
            </div>
            <div style={{ border: '3px solid var(--ink)', borderRadius: 16, padding: 12, background: 'var(--card)' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Today</div>
              <div style={{ fontSize: 22, fontWeight: 850 }}>
                {today}/{goal} XP
              </div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{QUEST_STREAK_FOOTNOTE}</div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Daily goal</div>
            <div
              aria-label="daily goal progress"
              style={{ height: 14, borderRadius: 999, border: '3px solid var(--ink)', overflow: 'hidden', background: '#fff' }}
            >
              <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #8dd4ff, #b6f2d8)' }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              Edit daily goal + other knobs in <b>⚙️ Settings</b>.
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="rowBetween" style={{ gap: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 850 }}>XP this week</div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
              {week.totalXp} XP • {week.activeDays}/7 active days
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 10,
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            gap: 8,
            alignItems: 'end',
            height: 86,
          }}
          aria-label="XP bars for the last 7 days"
        >
          {week.days.map((d) => {
            const h = Math.round((d.xp / week.maxXp) * 68);
            const isToday = d.ymd === ymdFromLocalDate(new Date());
            const isSelected = d.ymd === selectedYmd;
            return (
              <div key={d.ymd} style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
                <button
                  id={`xp-${d.ymd}`}
                  type="button"
                  onClick={() => setSelectedYmd((cur) => (cur === d.ymd ? null : d.ymd))}
                  onKeyDown={(e) => {
                    if (!selectedYmd) return;
                    handleWeekKeyNav(e, week.days, d.ymd, setSelectedYmd, 'xp');
                  }}
                  aria-pressed={isSelected}
                  aria-label={`${d.label} ${d.xp} XP. ${isSelected ? 'Selected.' : 'Tap to select.'}`}
                  title={`${d.ymd}: ${d.xp} XP`}
                  style={{
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    padding: 0,
                    margin: 0,
                    cursor: 'pointer',
                    width: '100%',
                    display: 'grid',
                    justifyItems: 'center',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 18,
                      height: 68,
                      borderRadius: 999,
                      border: '2px solid var(--ink)',
                      background: '#fff',
                      overflow: 'hidden',
                      boxShadow: isSelected
                        ? '0 0 0 3px rgba(255, 209, 102, 0.45)'
                        : isToday
                          ? '0 0 0 3px rgba(141, 212, 255, 0.35)'
                          : undefined,
                    }}
                  >
                    <div
                      style={{
                        height: h,
                        marginTop: 68 - h,
                        background: isToday ? 'linear-gradient(180deg, #7fc9ff, #b6f2d8)' : 'linear-gradient(180deg, #cfeeff, #dff8ee)',
                      }}
                    />
                  </div>
                </button>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{d.label}</div>
              </div>
            );
          })}
        </div>

        {selectedDay ? (
          <>
            <div style={{ marginTop: 10, fontSize: 12 }}>
              <b>{selectedDay.label}</b> ({selectedDay.ymd}) — <b>{selectedDay.xp} XP</b>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.65 }}>
              Keyboard: use <b>←/→</b> (Home/End) to move day selection.
            </div>
          </>
        ) : null}

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {week.prevTotalXp > 0 ? (
            <>
              <span>vs previous 7 days:</span>
              <DeltaChip contextLabel="vs previous 7 days" delta={week.deltaXp} unit="XP" pct={week.deltaPct} />
            </>
          ) : (
            <>vs previous 7 days: —</>
          )}
          <span>Tip: consistency &gt; spikes.</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="rowBetween" style={{ gap: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 850 }}>Workout this week</div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
              {workoutWeek.activeDays}/7 active days • {workoutWeek.totalSessions} session{workoutWeek.totalSessions === 1 ? '' : 's'} • streak: {workoutStreak} day{workoutStreak === 1 ? '' : 's'}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.65 }}>Counts Today’s workout sessions (1 or 2) on this device.</div>
          </div>
        </div>

        <div
          style={{
            marginTop: 10,
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            gap: 8,
            alignItems: 'end',
            height: 70,
          }}
          aria-label="Workout completion for the last 7 days"
        >
          {workoutWeek.days.map((d) => {
            const isToday = d.ymd === ymdFromLocalDate(new Date());
            const isSelected = d.ymd === selectedWorkoutYmd;
            const label = d.sessionsDone === 0 ? '0/2 sessions' : d.sessionsDone === 1 ? '1/2 sessions' : '2/2 sessions';
            const fill = d.sessionsDone === 0 ? 0 : d.sessionsDone === 1 ? 0.55 : 1;
            return (
              <div key={d.ymd} style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
                <button
                  id={`workout-${d.ymd}`}
                  type="button"
                  onClick={() => setSelectedWorkoutYmd((cur) => (cur === d.ymd ? null : d.ymd))}
                  onKeyDown={(e) => {
                    if (!selectedWorkoutYmd) return;
                    handleWeekKeyNav(e, workoutWeek.days, d.ymd, setSelectedWorkoutYmd, 'workout');
                  }}
                  aria-pressed={isSelected}
                  aria-label={`${shortDow(new Date(`${d.ymd}T12:00:00`))} ${d.ymd}: ${label}${isToday ? '. Today.' : '.'}${isSelected ? ' Selected.' : ''}`}
                  title={`${d.ymd}: ${label}`}
                  style={{
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    padding: 0,
                    margin: 0,
                    cursor: 'pointer',
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    border: '2px solid var(--ink)',
                    background: '#fff',
                    overflow: 'hidden',
                    boxShadow: isSelected
                      ? '0 0 0 3px rgba(255, 209, 102, 0.45)'
                      : isToday
                        ? '0 0 0 3px rgba(141, 212, 255, 0.35)'
                        : undefined,
                  }}
                >
                  <div
                    style={{
                      width: `${Math.round(fill * 100)}%`,
                      height: '100%',
                      background: isToday ? 'linear-gradient(90deg, #7fc9ff, #b6f2d8)' : 'linear-gradient(90deg, #cfeeff, #dff8ee)',
                    }}
                  />
                </button>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{shortDow(new Date(`${d.ymd}T12:00:00`))}</div>
              </div>
            );
          })}
        </div>

        {selectedWorkoutDay ? (
          <>
            <div style={{ marginTop: 10, fontSize: 12 }}>
              <b>{shortDow(new Date(`${selectedWorkoutDay.ymd}T12:00:00`))}</b> ({selectedWorkoutDay.ymd}) —{' '}
              <b>{selectedWorkoutDay.sessionsDone}/2</b> session{selectedWorkoutDay.sessionsDone === 1 ? '' : 's'}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.65 }}>
              Keyboard: use <b>←/→</b> (Home/End) to move day selection.
            </div>
          </>
        ) : null}

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {workoutWeek.prevActiveDays > 0 ? (
            <>
              <span>vs previous 7 days:</span>
              <DeltaChip contextLabel="vs previous 7 days" delta={workoutWeek.deltaDays} unit="days" pct={workoutWeek.deltaPct} />
            </>
          ) : (
            <>vs previous 7 days: —</>
          )}
          <span>Tip: 1 session still counts.</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="rowBetween" style={{ gap: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 850 }}>Review this week</div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
              {reviewWeek.totalSessions} session{reviewWeek.totalSessions === 1 ? '' : 's'} • {reviewWeek.totalXp} XP • {reviewWeek.activeDays}/7 active days
              {reviewWeek.avgAcc != null ? <> • {Math.round(reviewWeek.avgAcc * 100)}% accuracy</> : null}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.65 }}>
              Counts Review / Warm-up / Drill sessions on this device.
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 10,
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            gap: 8,
            alignItems: 'end',
            height: 86,
          }}
          aria-label="Review sessions bars for the last 7 days"
        >
          {reviewWeek.days.map((d) => {
            const h = Math.round((d.sessions / reviewWeek.maxSessions) * 68);
            const isToday = d.ymd === ymdFromLocalDate(new Date());
            const isSelected = d.ymd === selectedReviewYmd;
            const accLabel = d.acc != null ? `${Math.round(d.acc * 100)}% accuracy` : 'no attempts';
            return (
              <div key={d.ymd} style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
                <button
                  id={`review-${d.ymd}`}
                  type="button"
                  onClick={() => setSelectedReviewYmd((cur) => (cur === d.ymd ? null : d.ymd))}
                  onKeyDown={(e) => {
                    if (!selectedReviewYmd) return;
                    handleWeekKeyNav(e, reviewWeek.days, d.ymd, setSelectedReviewYmd, 'review');
                  }}
                  aria-pressed={isSelected}
                  aria-label={`${d.label}: ${d.sessions} session${d.sessions === 1 ? '' : 's'}, ${d.xp} XP, ${accLabel}. ${isSelected ? 'Selected.' : 'Tap to select.'}`}
                  title={`${d.ymd}: ${d.sessions} sessions, ${d.xp} XP`}
                  style={{
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    margin: 0,
                    cursor: 'pointer',
                    width: '100%',
                    display: 'grid',
                    justifyItems: 'center',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 18,
                      height: 68,
                      borderRadius: 999,
                      border: '2px solid var(--ink)',
                      background: '#fff',
                      overflow: 'hidden',
                      boxShadow: isSelected
                        ? '0 0 0 3px rgba(255, 209, 102, 0.45)'
                        : isToday
                          ? '0 0 0 3px rgba(141, 212, 255, 0.35)'
                          : undefined,
                    }}
                  >
                    <div
                      style={{
                        height: h,
                        marginTop: 68 - h,
                        background: isToday ? 'linear-gradient(180deg, #7fc9ff, #b6f2d8)' : 'linear-gradient(180deg, #f7d38b, #ffe9bf)',
                      }}
                    />
                  </div>
                </button>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{d.label}</div>
              </div>
            );
          })}
        </div>

        {selectedReviewDay ? (
          <>
            <div style={{ marginTop: 10, fontSize: 12 }}>
              <b>{selectedReviewDay.label}</b> ({selectedReviewDay.ymd}) — <b>{selectedReviewDay.sessions}</b> session{selectedReviewDay.sessions === 1 ? '' : 's'}
              {selectedReviewDay.attempts > 0 ? (
                <>
                  {' '}
                  • {selectedReviewDay.right}/{selectedReviewDay.attempts} right ({Math.round((selectedReviewDay.acc || 0) * 100)}%)
                </>
              ) : (
                <> • no attempts</>
              )}
              {' '}
              • <b>{selectedReviewDay.xp} XP</b>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.65 }}>
              Keyboard: use <b>←/→</b> (Home/End) to move day selection.
            </div>
          </>
        ) : null}

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {reviewWeek.prevTotalSessions > 0 ? (
            <>
              <span>vs previous 7 days:</span>
              <DeltaChip
                contextLabel="vs previous 7 days"
                delta={reviewWeek.deltaSessions}
                unit={reviewWeek.deltaSessions === 1 || reviewWeek.deltaSessions === -1 ? 'session' : 'sessions'}
                pct={reviewWeek.deltaSessionsPct}
              />
              <DeltaChip contextLabel="vs previous 7 days" delta={reviewWeek.deltaXp} unit="XP" pct={reviewWeek.deltaXpPct} />
            </>
          ) : (
            <>vs previous 7 days: —</>
          )}
          {bestReviewDay ? (
            <span>
              Best day: {bestReviewDay.label} ({bestReviewDay.sessions} session{bestReviewDay.sessions === 1 ? '' : 's'})
            </span>
          ) : null}
          <span>Tip: short daily review &gt; rare marathons.</span>
        </div>
      </div>
    </div>
  );
}

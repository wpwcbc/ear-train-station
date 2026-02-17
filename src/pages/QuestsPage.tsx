import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import type { Progress } from '../lib/progress';
import { applyStudyReward } from '../lib/progress';
import { computeQuestProgress, loadQuestState, markChestClaimed, type QuestState } from '../lib/quests';
import { useMistakeStats } from '../lib/hooks/useMistakeStats';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function ProgressBar({ pct }: { pct: number }) {
  const p = clamp(Math.round(pct), 0, 100);
  return (
    <div style={{ height: 12, borderRadius: 999, border: '3px solid var(--ink)', overflow: 'hidden', background: '#fff' }}>
      <div style={{ width: `${p}%`, height: '100%', background: 'linear-gradient(90deg, #8dd4ff, #b6f2d8)' }} />
    </div>
  );
}

export function QuestsPage({
  progress,
  setProgress,
}: {
  progress: Progress;
  setProgress: Dispatch<SetStateAction<Progress>>;
}) {
  const stats = useMistakeStats();
  const [q, setQ] = useState<QuestState>(() => loadQuestState());
  const [toast, setToast] = useState<null | { text: string }>(null);

  useEffect(() => {
    function bump() {
      setQ(loadQuestState());
    }
    window.addEventListener('focus', bump);
    window.addEventListener('storage', bump);
    return () => {
      window.removeEventListener('focus', bump);
      window.removeEventListener('storage', bump);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Quests are intentionally simple: they push the loop (learn → review → streak).
  const qp = useMemo(() => computeQuestProgress(progress, q), [progress, q]);

  const questDailyXp = useMemo(() => {
    const pct = qp.dailyXpGoal > 0 ? (qp.dailyXpToday / qp.dailyXpGoal) * 100 : 0;
    return { goal: qp.dailyXpGoal, today: qp.dailyXpToday, pct, done: qp.dailyXpDone };
  }, [qp.dailyXpGoal, qp.dailyXpToday, qp.dailyXpDone]);

  const questReview = useMemo(() => {
    const pct = qp.reviewGoal > 0 ? (qp.reviewToday / qp.reviewGoal) * 100 : 0;
    return { goal: qp.reviewGoal, today: qp.reviewToday, pct, done: qp.reviewDone };
  }, [qp.reviewGoal, qp.reviewToday, qp.reviewDone]);

  const questStations = useMemo(() => {
    const pct = qp.stationsGoal > 0 ? (qp.stationsToday / qp.stationsGoal) * 100 : 0;
    return { goal: qp.stationsGoal, today: qp.stationsToday, pct, done: qp.stationsDone };
  }, [qp.stationsGoal, qp.stationsToday, qp.stationsDone]);

  const allDone = qp.allDone;

  const CHEST_XP = 10;
  const canClaimChest = qp.chestReady;

  return (
    <div className="page">
      {toast ? (
        <div className="pwaToast" role="status" aria-live="polite">
          <span className="pwaToast__text">{toast.text}</span>
        </div>
      ) : null}
      <div className="rowBetween">
        <div>
          <h1 className="h1">Quests</h1>
          <p className="sub">Daily mini-goals to keep the streak alive. Small on purpose — consistency wins.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link className={stats.due > 0 ? 'btnPrimary' : 'btn'} to="/review">
            Review{stats.due > 0 ? ` (${stats.due} due)` : ''}
          </Link>
          <Link className="btn" to="/learn">
            Learn
          </Link>
        </div>
      </div>

      {allDone ? (
        <div className="callout" style={{ marginTop: 12 }}>
          <b>All quests cleared for today.</b> If you feel spicy: clear your oldest Review items first.
        </div>
      ) : (
        <div className="callout" style={{ marginTop: 12 }}>
          Tip: if you’re short on time, do Review first — it’s the fastest XP and makes tomorrow easier.
        </div>
      )}

      <div
        className={`card questChestCard ${canClaimChest ? 'questChestCard--ready' : ''} ${q.chestClaimedToday ? 'questChestCard--claimed' : ''}`}
        style={{ marginTop: 12, border: allDone ? '1px solid rgba(92, 231, 158, 0.35)' : undefined }}
      >
        <div style={{ fontSize: 14, fontWeight: 850 }}>Quest chest</div>
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
          Clear all 3 quests to unlock a one-time XP bonus.
        </div>
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            Reward: <b>+{CHEST_XP} XP</b>
            {q.chestClaimedToday ? <span style={{ marginLeft: 8, opacity: 0.9 }}>✓ claimed</span> : null}
          </div>
          <button
            className={canClaimChest ? 'btnPrimary' : 'btn'}
            disabled={!canClaimChest}
            title={
              q.chestClaimedToday
                ? 'Already claimed today'
                : allDone
                  ? 'Claim your daily Quest reward'
                  : 'Finish all quests to unlock'
            }
            onClick={() => {
              if (!canClaimChest) return;
              markChestClaimed();
              setQ(loadQuestState());
              setProgress((p) => applyStudyReward(p, CHEST_XP));
              setToast({ text: `Quest chest opened — +${CHEST_XP} XP` });
            }}
          >
            {q.chestClaimedToday ? 'Claimed' : allDone ? `Open (+${CHEST_XP} XP)` : 'Locked'}
          </button>
        </div>
      </div>

      <div className="gridCards" style={{ marginTop: 12 }}>
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 850 }}>Daily goal</div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
            Earn <b>{questDailyXp.goal} XP</b> today.
          </div>
          <div style={{ marginTop: 10 }}>
            <ProgressBar pct={questDailyXp.pct} />
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
              {questDailyXp.today}/{questDailyXp.goal} XP {questDailyXp.done ? '✓' : ''}
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 850 }}>Review reps</div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
            Attempt <b>{questReview.goal}</b> Review items.
          </div>
          <div style={{ marginTop: 10 }}>
            <ProgressBar pct={questReview.pct} />
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
              {questReview.today}/{questReview.goal} attempts {questReview.done ? '✓' : ''}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>({stats.due} due right now)</div>
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 850 }}>Station clear</div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
            Complete <b>{questStations.goal}</b> station (lesson/test).
          </div>
          <div style={{ marginTop: 10 }}>
            <ProgressBar pct={questStations.pct} />
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
              {questStations.today}/{questStations.goal} stations {questStations.done ? '✓' : ''}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 850 }}>Bonus</div>
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
          Clear streak-boosters: <b>{q.reviewClearsToday}</b> review items fully cleared today.
        </div>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
          (Clears are tracked when you clear an item from Review — 2 correct reviews in a row.)
        </div>
      </div>
    </div>
  );
}

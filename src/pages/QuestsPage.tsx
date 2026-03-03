import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import { useNow } from '../hooks/useNow';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import type { Progress } from '../lib/progress';
import { applyStudyReward } from '../lib/progress';
import {
  computeQuestProgress,
  loadQuestState,
  markChestClaimed,
  msUntilLocalMidnight,
  QUESTS_CHANGED_EVENT,
  type QuestState,
} from '../lib/quests';
import { useMistakeStats } from '../lib/hooks/useMistakeStats';
import { loadStreakState, STREAK_CHANGED_EVENT, type StreakStateV1 } from '../lib/streak';
import { QUEST_BEST_TITLE, QUEST_STREAK_TITLE, QUESTS_SUBTITLE } from '../lib/streakCopy';

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

function formatResetsIn(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function ConfettiBurst({ show, reducedMotion }: { show: boolean; reducedMotion: boolean }) {
  if (!show || reducedMotion) return null;

  const pieces = Array.from({ length: 14 }, (_, i) => i);
  const colors = ['#ff7aa2', '#ffd36e', '#7ee3ff', '#86f2b7', '#b6a8ff'];

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      <style>{`
        @keyframes etsConfettiPop {
          0% { transform: translate(-50%, -50%) scale(0.6); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) rotate(var(--rot)); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          /* Hide this entire non-essential effect if the user asks for reduced motion. */
          .etsConfettiPiece { display: none !important; animation: none !important; }
        }
      `}</style>
      {pieces.map((i) => {
        const angle = (i / pieces.length) * Math.PI * 2;
        const radius = 110 + (i % 4) * 18;
        const dx = Math.cos(angle) * radius;
        const dy = Math.sin(angle) * radius - 20;
        const rot = (i * 37) % 360;
        const delay = (i % 7) * 10;
        return (
          <span
            key={i}
            className="etsConfettiPiece"
            style={{
              position: 'absolute',
              left: '50%',
              top: '22%',
              width: 10,
              height: 6,
              borderRadius: 999,
              background: colors[i % colors.length],
              boxShadow: '0 2px 0 rgba(0,0,0,0.18)',
              transform: 'translate(-50%, -50%)',
              opacity: 0,
              animation: `etsConfettiPop 720ms cubic-bezier(.2,.8,.2,1) ${delay}ms both`,
              ['--dx' as any]: `${dx}px`,
              ['--dy' as any]: `${dy}px`,
              ['--rot' as any]: `${rot}deg`,
            }}
          />
        );
      })}
    </div>
  );
}

function RewardSheet({
  open,
  reducedMotion,
  xp,
  streak,
  best,
  onDismiss,
}: {
  open: boolean;
  reducedMotion: boolean;
  xp: number;
  streak: number;
  best: number;
  onDismiss: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [shownXp, setShownXp] = useState(() => (open ? xp : 0));

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = (document.activeElement as HTMLElement | null) ?? null;
    // Prevent background scroll while the modal is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move initial focus into the dialog.
    btnRef.current?.focus();

    return () => {
      document.body.style.overflow = prevOverflow;
      // Restore focus to the element that opened the sheet.
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    // Tiny Duolingo-ish “count up” moment.
    if (!open) {
      setShownXp(0);
      return;
    }
    if (reducedMotion) {
      setShownXp(xp);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const dur = 420;

    function tick(now: number) {
      const t = Math.max(0, Math.min(1, (now - start) / dur));
      // Ease-out.
      const eased = 1 - Math.pow(1 - t, 3);
      setShownXp(Math.round(xp * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, reducedMotion, xp]);

  useEffect(() => {
    if (!open) return;

    function getFocusable(): HTMLElement[] {
      const root = sheetRef.current;
      if (!root) return [];
      const els = root.querySelectorAll<HTMLElement>(
        'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
      );
      return Array.from(els).filter((el) => !el.hasAttribute('disabled') && !el.getAttribute('aria-disabled'));
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusable = getFocusable();
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const active = document.activeElement as HTMLElement | null;
      const i = active ? focusable.indexOf(active) : -1;

      // Cycle focus within the dialog.
      if (e.shiftKey) {
        const next = i <= 0 ? focusable[focusable.length - 1] : focusable[i - 1];
        e.preventDefault();
        next.focus();
      } else {
        const next = i === -1 || i === focusable.length - 1 ? focusable[0] : focusable[i + 1];
        e.preventDefault();
        next.focus();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="etsRewardTitle"
      aria-describedby="etsRewardDesc"
      onClick={onDismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'grid',
        placeItems: 'center',
        padding: 18,
        background: 'rgba(0,0,0,0.35)',
      }}
    >
      <style>{`
        @keyframes etsRewardPop {
          0% { transform: scale(0.92); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)',
          borderRadius: 16,
          border: '3px solid var(--ink)',
          background: '#fff',
          boxShadow: '0 12px 0 rgba(0,0,0,0.12)',
          padding: 16,
          textAlign: 'center',
          animation: reducedMotion ? undefined : 'etsRewardPop 180ms cubic-bezier(.2,.9,.2,1) both',
        }}
      >
        <div id="etsRewardTitle" style={{ fontSize: 12, opacity: 0.75, fontWeight: 850, letterSpacing: 0.4 }}>
          QUEST CHEST
        </div>
        <div style={{ marginTop: 8, fontSize: 22, fontWeight: 950 }} aria-hidden="true">
          +{shownXp} XP
        </div>
        <div
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
          aria-live="polite"
        >
          Quest chest opened. You earned {xp} XP. Quest streak {streak}. Best {best}.
        </div>
        <div id="etsRewardDesc" style={{ marginTop: 6, fontSize: 13, opacity: 0.85 }}>
          Quest streak: <b>{streak}</b> · Best: <b>{best}</b>
        </div>
        <button ref={btnRef} className="btn" style={{ marginTop: 12 }} onClick={onDismiss}>
          Nice
        </button>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>Tip: press Esc or tap outside to dismiss.</div>
      </div>
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
  const reducedMotion = usePrefersReducedMotion();
  const [q, setQ] = useState<QuestState>(() => loadQuestState());
  const [streak, setStreak] = useState<StreakStateV1>(() => loadStreakState());
  const [toast, setToast] = useState<null | { text: string }>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [rewardSheet, setRewardSheet] = useState<null | { xp: number; streak: number; best: number }>(null);

  useEffect(() => {
    function bumpQuests() {
      setQ(loadQuestState());
    }
    function bumpStreak() {
      setStreak(loadStreakState());
    }

    function bumpAll() {
      bumpQuests();
      bumpStreak();
    }

    window.addEventListener('focus', bumpAll);
    window.addEventListener('storage', bumpAll);
    window.addEventListener(QUESTS_CHANGED_EVENT, bumpQuests);
    window.addEventListener(STREAK_CHANGED_EVENT, bumpStreak);
    return () => {
      window.removeEventListener('focus', bumpAll);
      window.removeEventListener('storage', bumpAll);
      window.removeEventListener(QUESTS_CHANGED_EVENT, bumpQuests);
      window.removeEventListener(STREAK_CHANGED_EVENT, bumpStreak);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!celebrate) return;
    const t = window.setTimeout(() => setCelebrate(false), 900);
    return () => window.clearTimeout(t);
  }, [celebrate]);

  // Reward sheet stays open until dismissed (tap outside / button / Esc).

  // Quests are intentionally simple: they push the loop (learn → review → streak).
  // Fairness: if you have 0 Review items due/available, the Review quest auto-completes.
  // We approximate “available today” as (due right now + clears already done today), so the goal doesn’t shrink as you clear.
  const reviewAvailableToday = Math.max(0, stats.due + q.reviewClearsToday);
  const qp = useMemo(() => computeQuestProgress(progress, q, reviewAvailableToday), [progress, q, reviewAvailableToday]);

  // Tick the reset countdown (Duolingo-ish, but minimal). Coarse cadence keeps it cheap.
  const now = useNow(30_000);
  const resetsIn = formatResetsIn(msUntilLocalMidnight(now));

  const questDailyXp = useMemo(() => {
    const pct = qp.dailyXpGoal > 0 ? (qp.dailyXpToday / qp.dailyXpGoal) * 100 : 0;
    return { goal: qp.dailyXpGoal, today: qp.dailyXpToday, pct, done: qp.dailyXpDone };
  }, [qp.dailyXpGoal, qp.dailyXpToday, qp.dailyXpDone]);

  const questReview = useMemo(() => {
    const pct = qp.reviewGoal > 0 ? (qp.reviewToday / qp.reviewGoal) * 100 : qp.reviewDone ? 100 : 0;
    return { goal: qp.reviewGoal, today: qp.reviewToday, pct, done: qp.reviewDone };
  }, [qp.reviewGoal, qp.reviewToday, qp.reviewDone]);

  const questStations = useMemo(() => {
    const pct = qp.stationsGoal > 0 ? (qp.stationsToday / qp.stationsGoal) * 100 : 0;
    return { goal: qp.stationsGoal, today: qp.stationsToday, pct, done: qp.stationsDone };
  }, [qp.stationsGoal, qp.stationsToday, qp.stationsDone]);

  const reviewTitle = questReview.goal === 0 ? 'Review (nothing due)' : 'Clear Review backlog';
  const reviewDesc =
    questReview.goal === 0
      ? 'No Review items are due right now — nice. (This quest auto-clears.)'
      : `Clear ${questReview.goal} items from Review (backlog).`;

  const allDone = qp.allDone;

  const CHEST_XP = 10;
  const canClaimChest = qp.chestReady;

  return (
    <div className="page">
      <ConfettiBurst show={celebrate} reducedMotion={reducedMotion} />
      <RewardSheet
        open={!!rewardSheet}
        reducedMotion={reducedMotion}
        xp={rewardSheet?.xp ?? 0}
        streak={rewardSheet?.streak ?? streak.streak}
        best={rewardSheet?.best ?? streak.best}
        onDismiss={() => setRewardSheet(null)}
      />
      {toast ? (
        <div className="pwaToast" role="status" aria-live="polite">
          <span className="pwaToast__text">{toast.text}</span>
        </div>
      ) : null}
      <div className="rowBetween">
        <div>
          <h1 className="h1">Quests</h1>
          <p className="sub">
            {QUESTS_SUBTITLE} · Resets in <b>{resetsIn}</b>
          </p>
          <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="pill" title={QUEST_STREAK_TITLE}>
              Quest streak: <b>{streak.streak}</b> day{streak.streak === 1 ? '' : 's'}
            </span>
            <span className="pill" title={QUEST_BEST_TITLE}>
              Best: <b>{streak.best}</b>
            </span>
            <span style={{ fontSize: 12, opacity: 0.75 }}>(counts when you open the chest)</span>
          </div>
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
          <b>All quests cleared for today.</b> If you want extra credit: clear your oldest Review items (backlog) first.
        </div>
      ) : (
        <div className="callout" style={{ marginTop: 12 }}>
          Tip: short on time? Clear Review first — it’s quick XP and shrinks your backlog for tomorrow.
        </div>
      )}

      <div
        className={`card questChestCard ${canClaimChest ? 'questChestCard--ready' : ''} ${q.chestClaimedToday ? 'questChestCard--claimed' : ''}`}
        style={{ marginTop: 12, border: allDone ? '1px solid rgba(92, 231, 158, 0.35)' : undefined }}
      >
        <div style={{ fontSize: 14, fontWeight: 850 }}>Quest chest</div>
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
          Clear all 3 quests to unlock a one-time XP bonus. Opening the chest extends your <b>Quest streak</b>.
          {canClaimChest ? <span style={{ marginLeft: 8, opacity: 0.9 }}>(ready — tap to open)</span> : null}
        </div>
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            Reward: <b>+{CHEST_XP} XP</b>
            {q.chestClaimedToday ? <span style={{ marginLeft: 8, opacity: 0.9 }}>✓ claimed</span> : null}
          </div>
          <button
            className={canClaimChest ? 'btnPrimary' : 'btn'}
            disabled={!canClaimChest}
            aria-label={
              q.chestClaimedToday
                ? 'Quest chest claimed'
                : allDone
                  ? `Open quest chest for ${CHEST_XP} XP`
                  : 'Quest chest locked'
            }
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

              // Refresh storage-backed state (quests + streak) after the write.
              setQ(loadQuestState());
              const nextStreak = loadStreakState();
              setStreak(nextStreak);

              setProgress((p) => applyStudyReward(p, CHEST_XP));

              if (!reducedMotion) {
                setCelebrate(true);
                try {
                  navigator.vibrate?.(20);
                } catch {
                  // ignore
                }
              }

              // Duolingo-ish: a tiny “reward sheet” beats a toast for this moment.
              setRewardSheet({ xp: CHEST_XP, streak: nextStreak.streak, best: nextStreak.best });
              if (reducedMotion) setToast({ text: `Quest chest opened — +${CHEST_XP} XP` });
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
          <div style={{ fontSize: 14, fontWeight: 850 }}>{reviewTitle}</div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>{reviewDesc}</div>
          <div style={{ marginTop: 10 }}>
            <ProgressBar pct={questReview.pct} />
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
              {questReview.goal === 0 ? (
                <>
                  Auto-cleared {questReview.done ? '✓' : ''}
                </>
              ) : (
                <>
                  {questReview.today}/{questReview.goal} clears {questReview.done ? '✓' : ''}
                </>
              )}
            </div>
            {questReview.goal === 0 ? null : (
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>({stats.due} due right now)</div>
            )}
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
        <div style={{ fontSize: 14, fontWeight: 850 }}>Backlog bonus</div>
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
          Cleared today: <b>{q.reviewClearsToday}</b> Review items fully cleared.
        </div>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
          (A “clear” means you removed an item from Review — 2 correct reviews in a row.)
        </div>
      </div>
    </div>
  );
}

import type { ReviewHistoryStats } from './reviewHistoryStats.ts';

export type PracticeWorkoutSched = {
  dueNow: number;
  total: number;
};

export type PracticeWorkoutStationCount = {
  id: string;
  title: string;
  due: number;
  queued: number;
};

export type PracticeWorkoutMistakeRow = {
  weight: number;
  // Optional fields available on mistake rollups.
  semitones?: number;
  quality?: string;
};

export type PracticeWorkoutPick = {
  /** The raw destination (no `workout=` param). */
  to: string;
  /** Primary label used by copy variant A. */
  labelA: string;
  /** Alternate label used by copy variant B. */
  labelB: string;
  title: string;
  /** Optional exit target (used for lesson routes). */
  exitTo?: string;
};

export type PracticeDailyWorkouts = {
  session1: PracticeWorkoutPick;
  session2: PracticeWorkoutPick;
};

function rotateParity(dayKey: string) {
  // Deterministic-ish daily rotation.
  return (Number(dayKey.replaceAll('-', '')) || 0) % 2;
}

function withWorkout(to: string, session: 1 | 2) {
  if (!to.startsWith('/review')) return to;
  return `${to}${to.includes('?') ? '&' : '?'}workout=${session}`;
}

function pickFocusStationId(opts: {
  rotate: number;
  hasDue: boolean;
  hasQueue: boolean;
  topDueStationId: string | null;
  stationsNeedsLoveId: string | null;
  stationCountsAll: PracticeWorkoutStationCount[];
}) {
  const { rotate, hasDue, hasQueue, topDueStationId, stationsNeedsLoveId, stationCountsAll } = opts;

  // When items are due now, keep the existing behavior: sometimes focus the top-due station.
  if (hasDue) return topDueStationId && rotate === 0 ? topDueStationId : null;

  if (!hasQueue) return null;

  // When nothing is due yet (warm-up), it's more helpful to occasionally steer toward
  // the station you historically struggle with — but only if you actually have items queued for it.
  if (stationsNeedsLoveId) {
    const row = stationCountsAll.find((x) => x.id === stationsNeedsLoveId);
    if (row && row.queued > 0) {
      // Rotate between “hotspot” and “needs love” so it doesn't feel like nagging.
      return rotate === 0 ? stationsNeedsLoveId : topDueStationId;
    }
  }

  return topDueStationId;
}

export function pickPracticeDailyWorkouts(opts: {
  dayKey: string;
  sched: PracticeWorkoutSched;
  stationCountsAll: PracticeWorkoutStationCount[];
  // Already-top-sliced lists from mistake rollups.
  intervalStatsTop: PracticeWorkoutMistakeRow[];
  triadStatsTop: PracticeWorkoutMistakeRow[];
  continueLessonId: string | null;
  reviewHistoryStats: ReviewHistoryStats;
  wideRegisterRangeText: string;
}): PracticeDailyWorkouts {
  const rotate = rotateParity(opts.dayKey);

  const hasDue = opts.sched.dueNow > 0;
  const hasQueue = opts.sched.total > 0;

  const stationCounts = opts.stationCountsAll
    .filter((x) => (hasDue ? x.due > 0 : x.queued > 0))
    .sort((a, b) => b.due - a.due || b.queued - a.queued);

  const topDue = stationCounts[0] ?? null;
  const topDueStationId = topDue?.id ?? null;
  const topDueStationTitle = topDue?.title ?? null;

  const needsLoveId = opts.reviewHistoryStats.stationsNeedsLove[0]?.station ?? null;

  const focusStationId = pickFocusStationId({
    rotate,
    hasDue,
    hasQueue,
    topDueStationId,
    stationsNeedsLoveId: needsLoveId,
    stationCountsAll: opts.stationCountsAll,
  });

  const reviewBase = hasDue ? '/review' : hasQueue ? '/review?warmup=1&n=5' : '/review';
  const reviewToBase = focusStationId ? `${reviewBase}${reviewBase.includes('?') ? '&' : '?'}station=${encodeURIComponent(focusStationId)}` : reviewBase;
  const reviewTo = withWorkout(reviewToBase, 1);

  const stationTag = (focusStationId ? (opts.stationCountsAll.find((x) => x.id === focusStationId)?.title ?? focusStationId) : null) ?? (topDueStationTitle || topDueStationId);

  const reviewLabelA = hasDue
    ? focusStationId
      ? `Review (${opts.sched.dueNow} due · ${stationTag})`
      : `Review (${opts.sched.dueNow} due)`
    : hasQueue
      ? focusStationId
        ? `Warm‑up (${stationTag})`
        : 'Warm‑up review'
      : 'Review';

  const reviewLabelB = hasDue
    ? focusStationId
      ? `Review now (${stationTag})`
      : 'Review now'
    : hasQueue
      ? focusStationId
        ? `Warm up (${stationTag})`
        : 'Warm up'
      : 'Review';

  const session1: PracticeWorkoutPick = {
    to: reviewTo,
    labelA: reviewLabelA,
    labelB: reviewLabelB,
    title: hasDue ? 'Clear items that are due now' : hasQueue ? 'A short warm‑up set from your queue (even if nothing is due yet)' : opts.dayKey,
  };

  const hasNew = Boolean(opts.continueLessonId);
  const newTo = opts.continueLessonId ? `/lesson/${opts.continueLessonId}` : '/learn';
  const newPick: PracticeWorkoutPick = {
    to: newTo,
    labelA: opts.continueLessonId ? 'New material (continue)' : 'New material (pick a section)',
    labelB: opts.continueLessonId ? 'Learn something new (continue)' : 'Learn something new',
    title: opts.continueLessonId ? 'Keep moving forward — you can always Review after.' : 'Learn something new',
    exitTo: opts.continueLessonId ? '/practice?workoutDone=2' : undefined,
  };

  const intervalWeight = opts.intervalStatsTop.reduce((acc, s) => acc + (s.weight || 0), 0);
  const triadWeight = opts.triadStatsTop.reduce((acc, s) => acc + (s.weight || 0), 0);
  const hasIntervalMistakes = opts.intervalStatsTop.length > 0;
  const hasTriadMistakes = opts.triadStatsTop.length > 0;

  const preferTriadDrill = hasTriadMistakes && triadWeight > intervalWeight * 1.15;
  const drillKind: 'interval' | 'triad' = preferTriadDrill ? 'triad' : 'interval';
  const hasChosenMistakes = drillKind === 'triad' ? hasTriadMistakes : hasIntervalMistakes;

  const uniqueTop = <T,>(xs: T[], max: number) => {
    const out: T[] = [];
    const seen = new Set<T>();
    for (const x of xs) {
      if (seen.has(x)) continue;
      seen.add(x);
      out.push(x);
      if (out.length >= max) break;
    }
    return out;
  };

  // Keep deep-links short and intentional: a handful of targets is more Duolingo-ish
  // than blasting an entire long tail into the URL.
  const intervalSemitonesTop = uniqueTop(
    opts.intervalStatsTop
      .map((x) => x.semitones)
      .filter((x): x is number => typeof x === 'number' && Number.isFinite(x)),
    4,
  );

  const triadQualitiesTop = uniqueTop(
    opts.triadStatsTop
      .map((x) => x.quality)
      .filter((x): x is string => typeof x === 'string' && x.length > 0),
    4,
  );

  const drillToBase = hasChosenMistakes
    ? drillKind === 'triad'
      ? triadQualitiesTop.length
        ? `/review?drill=1&kind=triad&qualities=${encodeURIComponent(triadQualitiesTop.join(','))}`
        : '/review?drill=1&kind=triad'
      : intervalSemitonesTop.length
        ? `/review?drill=1&kind=interval&semitones=${encodeURIComponent(intervalSemitonesTop.join(','))}`
        : '/review?drill=1'
    : '/review?warmup=1&n=5';

  const drillTo = withWorkout(drillToBase, 2);

  const drillTitle = hasChosenMistakes
    ? drillKind === 'triad'
      ? `A fast triad-quality drill from your mistakes (wide register: ${opts.wideRegisterRangeText}).`
      : `A fast interval drill from your mistakes (wide register: ${opts.wideRegisterRangeText}).`
    : 'No mistakes yet for a drill — do a quick warm‑up from your queue instead.';

  const drillPick: PracticeWorkoutPick = {
    to: drillTo,
    labelA: hasChosenMistakes ? (drillKind === 'triad' ? 'Triad misses drill' : 'Top misses drill') : 'Quick warm‑up',
    labelB: hasChosenMistakes ? 'Quick drill' : 'Warm up',
    title: drillTitle,
  };

  const pickSecond = () => {
    if (!hasQueue) return newPick;
    if (rotate === 0) return drillPick;
    if (hasNew) return newPick;
    return drillPick;
  };

  const secondRaw = pickSecond();

  // Ensure session2 keeps the previous UX: lesson completions return you to /practice?workoutDone=2.
  const session2: PracticeWorkoutPick = {
    ...secondRaw,
    exitTo: secondRaw.to.startsWith('/lesson/') ? '/practice?workoutDone=2' : undefined,
  };

  return { session1, session2 };
}

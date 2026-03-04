import type { ReviewHistoryStats } from './reviewHistoryStats.ts';

export type NextUp = {
  to: string;
  label: string;
  reason: string;
};

export type NextUpInputs = {
  dueNow: number;
  /** Items queued in the review system (due now + due later). */
  totalQueued: number;
  topDueStationId?: string | null;
  topDueStationName?: string | null;
  /** If available: count of items that will become due within ~1 hour. */
  within1h?: number;
  /** If available: count of items that will become due later today (excluding dueNow/within1h buckets). */
  dueToday?: number;
  /** If available: ms until the next item becomes due (from “now”). */
  nextDueInMs?: number | null;
  needsLoveTop?: { station: string; stationName: string; avgAcc: number } | null;
  continueLessonId?: string | null;
};

/**
 * Pick a single “next up” recommendation.
 *
 * Goals:
 * - deterministic
 * - not spammy
 * - knowledge-only (no settings surface)
 */
export function computePracticeNextUp(i: NextUpInputs): NextUp {
  const dueNow = Math.max(0, i.dueNow || 0);
  const total = Math.max(0, i.totalQueued || 0);

  if (dueNow > 0) {
    const stationId = (i.topDueStationId || '').trim();
    const stationName = (i.topDueStationName || '').trim();
    const to = stationId ? `/review?station=${encodeURIComponent(stationId)}` : '/review';

    const n = dueNow;
    const label = stationName ? `Review now — ${stationName}` : n >= 5 ? `Review now (${n} due)` : 'Review now';

    const reason = stationName
      ? `You’ve got ${n} item${n === 1 ? '' : 's'} due now — focus on ${stationName}.`
      : `You’ve got ${n} item${n === 1 ? '' : 's'} due now.`;

    return { to, label, reason };
  }

  const needsLove = i.needsLoveTop;
  if (needsLove && needsLove.station) {
    const to = `/review?station=${encodeURIComponent(needsLove.station)}`;
    const label = 'Needs love (quick review)';
    const pct = Math.round((needsLove.avgAcc || 0) * 100);
    const reason = `Recent accuracy in ${needsLove.stationName}: ${pct}%.`;
    return { to, label, reason };
  }

  // If there’s a queue but nothing due, a short warm-up keeps the habit going.
  if (total > 0) {
    const within1h = Math.max(0, i.within1h || 0);
    const dueToday = Math.max(0, i.dueToday || 0);
    const nextMs = i.nextDueInMs == null ? null : Math.max(0, i.nextDueInMs);

    const nextIn = (() => {
      if (nextMs == null) return null;
      if (nextMs <= 0) return 'now';
      const m = Math.round(nextMs / 60000);
      if (m < 60) return `${Math.max(1, m)}m`;
      const h = Math.round(m / 60);
      return `${Math.max(1, h)}h`;
    })();

    // If we know something is coming due soon, make the “warm up” suggestion feel intentional.
    const soonHint = within1h > 0 && nextIn ? ` Next item due in ~${nextIn}.` : dueToday > 0 ? ' More items are due later today.' : '';

    return {
      to: '/review?warmup=1&n=5',
      label: within1h > 0 && nextIn ? `Warm up (5) — next due in ~${nextIn}` : 'Warm up (5)',
      reason: `Nothing due right now — do a quick warm-up from your queue.${soonHint}`,
    };
  }

  const continueId = (i.continueLessonId || '').trim();
  if (continueId) {
    return {
      to: `/lesson/${encodeURIComponent(continueId)}`,
      label: 'Learn (continue)',
      reason: 'No review queued — keep moving forward with a new lesson.',
    };
  }

  return {
    to: '/learn',
    label: 'Learn something new',
    reason: 'Pick a section and start learning.',
  };
}

export function computePracticeNextUpFromStats(params: {
  dueNow: number;
  totalQueued: number;
  within1h?: number;
  dueToday?: number;
  nextDueInMs?: number | null;
  topDueStationId?: string | null;
  topDueStationName?: string | null;
  reviewHistoryStats?: ReviewHistoryStats | null;
  continueLessonId?: string | null;
}): NextUp {
  const needsLoveTop = params.reviewHistoryStats?.stationsNeedsLove?.[0]
    ? {
        station: params.reviewHistoryStats.stationsNeedsLove[0].station,
        stationName: params.reviewHistoryStats.stationsNeedsLove[0].stationName,
        avgAcc: params.reviewHistoryStats.stationsNeedsLove[0].avgAcc,
      }
    : null;

  return computePracticeNextUp({
    dueNow: params.dueNow,
    totalQueued: params.totalQueued,
    within1h: params.within1h,
    dueToday: params.dueToday,
    nextDueInMs: params.nextDueInMs,
    topDueStationId: params.topDueStationId,
    topDueStationName: params.topDueStationName,
    needsLoveTop,
    continueLessonId: params.continueLessonId,
  });
}

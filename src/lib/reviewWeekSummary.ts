import type { ReviewSessionHistoryEntryV1 } from './reviewSessionHistory';

export type ReviewWeekDay = {
  ymd: string;
  sessions: number;
  xp: number;
  right: number;
  wrong: number;
  skip: number;
  attempts: number;
  acc: number | null; // 0..1
};

export type ReviewWeekSummary = {
  days: ReviewWeekDay[];
  maxSessions: number;
  totalSessions: number;
  totalXp: number;
  avgAcc: number | null; // weighted by attempts
  prevTotalSessions: number;
  prevTotalXp: number;
  deltaSessions: number;
  deltaXp: number;
  deltaSessionsPct: number | null;
  deltaXpPct: number | null;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function ymdFromLocalDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addToDay(m: Map<string, Omit<ReviewWeekDay, 'ymd' | 'acc'>>, ymd: string, e: ReviewSessionHistoryEntryV1) {
  const cur = m.get(ymd) || { sessions: 0, xp: 0, right: 0, wrong: 0, skip: 0, attempts: 0 };
  const right = clamp(Math.floor(e.right), 0, 1_000_000);
  const wrong = clamp(Math.floor(e.wrong), 0, 1_000_000);
  const skip = clamp(Math.floor(e.skip), 0, 1_000_000);
  const xp = clamp(Math.floor(e.xp), 0, 1_000_000);
  const attempts = right + wrong + skip;

  m.set(ymd, {
    sessions: cur.sessions + 1,
    xp: cur.xp + xp,
    right: cur.right + right,
    wrong: cur.wrong + wrong,
    skip: cur.skip + skip,
    attempts: cur.attempts + attempts,
  });
}

export function computeReviewWeekSummary(entries: ReviewSessionHistoryEntryV1[] | undefined, baseDate: Date = new Date()): ReviewWeekSummary {
  // Use noon local time to reduce DST weirdness.
  const base = new Date(baseDate);
  base.setHours(12, 0, 0, 0);

  const byYmd = new Map<string, Omit<ReviewWeekDay, 'ymd' | 'acc'>>();
  for (const e of entries || []) {
    if (!e || typeof e !== 'object') continue;
    const d = new Date(typeof e.at === 'number' ? e.at : Date.now());
    const ymd = ymdFromLocalDate(d);
    addToDay(byYmd, ymd, e);
  }

  const days: ReviewWeekDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const ymd = ymdFromLocalDate(d);
    const agg = byYmd.get(ymd) || { sessions: 0, xp: 0, right: 0, wrong: 0, skip: 0, attempts: 0 };
    const acc = agg.attempts > 0 ? agg.right / agg.attempts : null;
    days.push({ ymd, ...agg, acc });
  }

  const maxSessions = Math.max(1, ...days.map((d) => d.sessions));
  const totalSessions = days.reduce((sum, d) => sum + d.sessions, 0);
  const totalXp = days.reduce((sum, d) => sum + d.xp, 0);

  const totalAttempts = days.reduce((sum, d) => sum + d.attempts, 0);
  const totalRight = days.reduce((sum, d) => sum + d.right, 0);
  const avgAcc = totalAttempts > 0 ? totalRight / totalAttempts : null;

  // Previous 7-day window.
  let prevTotalSessions = 0;
  let prevTotalXp = 0;
  for (let i = 13; i >= 7; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const ymd = ymdFromLocalDate(d);
    const agg = byYmd.get(ymd);
    if (!agg) continue;
    prevTotalSessions += agg.sessions;
    prevTotalXp += agg.xp;
  }

  const deltaSessions = totalSessions - prevTotalSessions;
  const deltaXp = totalXp - prevTotalXp;
  const deltaSessionsPct = prevTotalSessions > 0 ? Math.round((deltaSessions / prevTotalSessions) * 100) : null;
  const deltaXpPct = prevTotalXp > 0 ? Math.round((deltaXp / prevTotalXp) * 100) : null;

  return {
    days,
    maxSessions,
    totalSessions,
    totalXp,
    avgAcc,
    prevTotalSessions,
    prevTotalXp,
    deltaSessions,
    deltaXp,
    deltaSessionsPct,
    deltaXpPct,
  };
}

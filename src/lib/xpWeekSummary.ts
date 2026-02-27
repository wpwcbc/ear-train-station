export type XpWeekSummary = {
  days: { ymd: string; xp: number }[];
  maxXp: number;
  totalXp: number;
  activeDays: number;
  prevTotalXp: number;
  deltaXp: number;
  deltaPct: number | null;
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

export function computeXpWeekSummary(
  dailyXpByYmd: Record<string, number> | undefined,
  baseDate: Date = new Date(),
): XpWeekSummary {
  // Use noon local time to reduce DST weirdness.
  const base = new Date(baseDate);
  base.setHours(12, 0, 0, 0);

  const days: { ymd: string; xp: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const ymd = ymdFromLocalDate(d);
    const raw = dailyXpByYmd?.[ymd] ?? 0;
    const xp = clamp(Math.floor(raw), 0, 1_000_000);
    days.push({ ymd, xp });
  }

  const maxXp = Math.max(10, ...days.map((d) => d.xp));
  const totalXp = days.reduce((sum, d) => sum + d.xp, 0);
  const activeDays = days.reduce((n, d) => n + (d.xp > 0 ? 1 : 0), 0);

  // Previous 7-day window (the 7 days immediately before the current window).
  let prevTotalXp = 0;
  for (let i = 13; i >= 7; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const ymd = ymdFromLocalDate(d);
    const raw = dailyXpByYmd?.[ymd] ?? 0;
    prevTotalXp += clamp(Math.floor(raw), 0, 1_000_000);
  }

  const deltaXp = totalXp - prevTotalXp;
  const deltaPct = prevTotalXp > 0 ? Math.round((deltaXp / prevTotalXp) * 100) : null;

  return { days, maxXp, totalXp, activeDays, prevTotalXp, deltaXp, deltaPct };
}

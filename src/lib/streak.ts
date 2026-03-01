export type StreakStateV1 = {
  v: 1;
  /** YYYY-MM-DD local day of the last successful streak action (quest chest opened). */
  lastYmd: string | null;
  /** Current consecutive-days streak. */
  streak: number;
  /** Best streak observed. */
  best: number;
};

export const STREAK_KEY_V1 = 'ets_streak_v1';

// Note: like quests/mistakes, we emit an in-tab event because `storage` doesn't fire in the same tab.
export const STREAK_CHANGED_EVENT = 'ets_streak_changed';

function emitStreakChanged() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(STREAK_CHANGED_EVENT));
  } catch {
    // ignore
  }
}

export function defaultStreakState(): StreakStateV1 {
  return { v: 1, lastYmd: null, streak: 0, best: 0 };
}

function ymdFromDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ymdToday(now = new Date()) {
  return ymdFromDate(now);
}

export function ymdYesterday(now = new Date()) {
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return ymdFromDate(y);
}

function clampInt(n: unknown, fallback: number) {
  const x = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(x) ? Math.trunc(x) : fallback;
}

export function normalizeStreakStateV1(input: Partial<StreakStateV1>): StreakStateV1 {
  const streak = Math.max(0, clampInt(input.streak, 0));
  const best = Math.max(0, clampInt(input.best, 0));
  const lastYmd = typeof input.lastYmd === 'string' ? input.lastYmd : null;
  return {
    v: 1,
    lastYmd,
    streak,
    best: Math.max(best, streak),
  };
}

export function loadStreakState(storage: Pick<Storage, 'getItem'> = localStorage): StreakStateV1 {
  try {
    const raw = storage.getItem(STREAK_KEY_V1);
    if (!raw) return defaultStreakState();
    const parsed = JSON.parse(raw) as StreakStateV1;
    if (!parsed || parsed.v !== 1) return defaultStreakState();
    return normalizeStreakStateV1(parsed);
  } catch {
    return defaultStreakState();
  }
}

export function saveStreakState(state: StreakStateV1, storage: Pick<Storage, 'setItem'> = localStorage) {
  storage.setItem(STREAK_KEY_V1, JSON.stringify(normalizeStreakStateV1(state)));
  emitStreakChanged();
}

/**
 * Apply a “daily streak” update for a successful action on `todayYmd`.
 *
 * Rules:
 * - First claim ever => streak=1
 * - Claim again same day => no change (idempotent)
 * - Claim on next consecutive day => streak++
 * - Otherwise => streak=1 (reset)
 */
export function bumpDailyStreak(prev: StreakStateV1, todayYmd: string, yesterdayYmd: string): StreakStateV1 {
  const cur = normalizeStreakStateV1(prev);

  if (cur.lastYmd === todayYmd) return cur;

  const nextStreak = cur.lastYmd === yesterdayYmd ? Math.max(1, cur.streak + 1) : 1;
  const best = Math.max(cur.best, nextStreak);
  return {
    v: 1,
    lastYmd: todayYmd,
    streak: nextStreak,
    best,
  };
}

export function recordQuestChestOpened(now = new Date()) {
  const today = ymdToday(now);
  const yesterday = ymdYesterday(now);
  const prev = loadStreakState();
  const next = bumpDailyStreak(prev, today, yesterday);
  saveStreakState(next);
}

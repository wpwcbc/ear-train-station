import type { Progress } from './progress';

export type QuestState = {
  version: 2;
  /** YYYY-MM-DD in local time. */
  ymd: string | null;
  reviewAttemptsToday: number;
  reviewClearsToday: number;
  stationsCompletedToday: number;
  /** One-time daily reward guard (Quest chest). */
  chestClaimedToday: boolean;
};

export type QuestComputed = {
  dailyXpGoal: number;
  dailyXpToday: number;
  dailyXpDone: boolean;
  reviewGoal: number;
  reviewToday: number;
  reviewDone: boolean;
  stationsGoal: number;
  stationsToday: number;
  stationsDone: boolean;
  allDone: boolean;
  chestReady: boolean;
  hasWork: boolean;
};

export function computeQuestProgress(progress: Progress, q: QuestState): QuestComputed {
  const dailyXpGoal = Math.max(5, progress.dailyGoalXp || 20);
  const dailyXpToday = Math.max(0, progress.dailyXpToday || 0);
  const dailyXpDone = dailyXpToday >= dailyXpGoal;

  const reviewGoal = 6;
  const reviewToday = q.reviewAttemptsToday;
  const reviewDone = reviewToday >= reviewGoal;

  const stationsGoal = 1;
  const stationsToday = q.stationsCompletedToday;
  const stationsDone = stationsToday >= stationsGoal;

  const allDone = dailyXpDone && reviewDone && stationsDone;
  const chestReady = allDone && !q.chestClaimedToday;
  const hasWork = chestReady || !allDone;

  return {
    dailyXpGoal,
    dailyXpToday,
    dailyXpDone,
    reviewGoal,
    reviewToday,
    reviewDone,
    stationsGoal,
    stationsToday,
    stationsDone,
    allDone,
    chestReady,
    hasWork,
  };
}

// Storage key versioning:
// - v1 existed briefly with the same shape/version=2, but the key name was misleading.
// - v2 is the canonical key going forward; we migrate v1 → v2 on load.
const KEY_V1 = 'ets_quests_v1';
const KEY_V2 = 'ets_quests_v2';

// Note: the browser "storage" event does NOT fire in the same tab that writes localStorage.
// To keep UI (nav badge / quests page) in sync in-tab, we emit a tiny custom event.
export const QUESTS_CHANGED_EVENT = 'ets_quests_changed';

function emitQuestsChanged() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(QUESTS_CHANGED_EVENT));
  } catch {
    // Ignore: UI will update on focus / next render.
  }
}

export function defaultQuestState(): QuestState {
  return {
    version: 2,
    ymd: null,
    reviewAttemptsToday: 0,
    reviewClearsToday: 0,
    stationsCompletedToday: 0,
    chestClaimedToday: false,
  };
}

export function ymdFromDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayYmd() {
  return ymdFromDate(new Date());
}

export function normalizeQuestStateForYmd(q: QuestState, ymd: string): QuestState {
  if (q.ymd !== ymd) return { ...defaultQuestState(), ymd };
  return q;
}

function parseMaybeQuestState(raw: string | null): QuestState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as QuestState;
    if (!parsed || parsed.version !== 2) return null;
    return { ...defaultQuestState(), ...parsed };
  } catch {
    return null;
  }
}

export function loadQuestState(): QuestState {
  const ymd = todayYmd();

  // Prefer v2.
  const v2 = parseMaybeQuestState(localStorage.getItem(KEY_V2));
  if (v2) return normalizeQuestStateForYmd(v2, ymd);

  // Migrate v1 → v2 (best-effort).
  const v1 = parseMaybeQuestState(localStorage.getItem(KEY_V1));
  if (v1) {
    const normalized = normalizeQuestStateForYmd(v1, ymd);
    try {
      localStorage.setItem(KEY_V2, JSON.stringify(normalized));
      localStorage.removeItem(KEY_V1);
      emitQuestsChanged();
    } catch {
      // Ignore migration failures; caller still gets the normalized data.
    }
    return normalized;
  }

  return normalizeQuestStateForYmd(defaultQuestState(), ymd);
}

export function saveQuestState(q: QuestState) {
  localStorage.setItem(KEY_V2, JSON.stringify(q));
  emitQuestsChanged();
}

export function updateQuestState(fn: (q: QuestState) => QuestState) {
  const cur = loadQuestState();
  const next = normalizeQuestStateForYmd(fn(cur), todayYmd());
  saveQuestState(next);
}

export function bumpReviewAttempt(n = 1) {
  updateQuestState((q) => ({ ...q, reviewAttemptsToday: Math.max(0, q.reviewAttemptsToday + n) }));
}

export function bumpReviewClear(n = 1) {
  updateQuestState((q) => ({ ...q, reviewClearsToday: Math.max(0, q.reviewClearsToday + n) }));
}

export function bumpStationCompleted(n = 1) {
  updateQuestState((q) => ({ ...q, stationsCompletedToday: Math.max(0, q.stationsCompletedToday + n) }));
}

export function markChestClaimed() {
  updateQuestState((q) => ({ ...q, chestClaimedToday: true }));
}

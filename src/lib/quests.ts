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

const KEY = 'ets_quests_v1';

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

function normalizeForToday(q: QuestState): QuestState {
  const ymd = todayYmd();
  if (q.ymd !== ymd) {
    return { ...defaultQuestState(), ymd };
  }
  return q;
}

export function loadQuestState(): QuestState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return normalizeForToday(defaultQuestState());
    const parsed = JSON.parse(raw) as QuestState;
    if (!parsed || parsed.version !== 2) return normalizeForToday(defaultQuestState());
    return normalizeForToday({ ...defaultQuestState(), ...parsed });
  } catch {
    return normalizeForToday(defaultQuestState());
  }
}

export function saveQuestState(q: QuestState) {
  localStorage.setItem(KEY, JSON.stringify(q));
}

export function updateQuestState(fn: (q: QuestState) => QuestState) {
  const cur = loadQuestState();
  const next = normalizeForToday(fn(cur));
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

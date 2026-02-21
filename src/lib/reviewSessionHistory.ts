export type ReviewSessionMode = 'review' | 'warmup' | 'drill';

export type ReviewSessionHistoryEntryV1 = {
  v: 1;
  at: number; // ms epoch
  mode: ReviewSessionMode;
  station?: string; // station id (optional)
  n: number;
  hard: boolean;
  // Result
  right: number;
  wrong: number;
  skip: number;
  xp: number; // total xp incl bonuses
};

export const REVIEW_SESSION_HISTORY_KEY = 'ets_review_session_history_v1';

export function clampInt(n: unknown, fallback: number): number {
  const x = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(x) ? Math.trunc(x) : fallback;
}

type ReviewSessionHistoryEntryV1Like = {
  v: 1;
  at: unknown;
  mode: ReviewSessionMode;
  station?: unknown;
  n: unknown;
  hard: unknown;
  right: unknown;
  wrong: unknown;
  skip: unknown;
  xp: unknown;
};

export function normalizeHistoryEntryV1(input: ReviewSessionHistoryEntryV1Like): ReviewSessionHistoryEntryV1 {
  return {
    v: 1,
    at: clampInt(input.at, Date.now()),
    mode: input.mode,
    station: typeof input.station === 'string' ? input.station : undefined,
    n: Math.max(1, clampInt(input.n, 10)),
    hard: !!input.hard,
    right: Math.max(0, clampInt(input.right, 0)),
    wrong: Math.max(0, clampInt(input.wrong, 0)),
    skip: Math.max(0, clampInt(input.skip, 0)),
    xp: Math.max(0, clampInt(input.xp, 0)),
  };
}

export function appendReviewSessionHistory(prev: ReviewSessionHistoryEntryV1[], entry: ReviewSessionHistoryEntryV1, cap = 50): ReviewSessionHistoryEntryV1[] {
  const safeCap = Math.max(1, Math.min(500, Math.trunc(cap)));
  const next = [...prev, normalizeHistoryEntryV1(entry)];
  if (next.length <= safeCap) return next;
  return next.slice(next.length - safeCap);
}

export function loadReviewSessionHistory(storage: Pick<Storage, 'getItem'> = localStorage): ReviewSessionHistoryEntryV1[] {
  try {
    const raw = storage.getItem(REVIEW_SESSION_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Best-effort normalize; discard unknown shapes.
    const out: ReviewSessionHistoryEntryV1[] = [];
    for (const x of parsed) {
      if (!x || typeof x !== 'object') continue;
      const obj = x as Record<string, unknown>;
      if (obj.v !== 1) continue;
      if (obj.mode !== 'review' && obj.mode !== 'warmup' && obj.mode !== 'drill') continue;
      const mode = obj.mode as ReviewSessionMode;
      out.push(
        normalizeHistoryEntryV1({
          v: 1,
          at: obj.at,
          mode,
          station: typeof obj.station === 'string' ? obj.station : undefined,
          n: obj.n,
          hard: !!obj.hard,
          right: obj.right,
          wrong: obj.wrong,
          skip: obj.skip,
          xp: obj.xp,
        })
      );
    }
    return out;
  } catch {
    return [];
  }
}

export function saveReviewSessionHistory(entries: ReviewSessionHistoryEntryV1[], storage: Pick<Storage, 'setItem'> = localStorage) {
  storage.setItem(REVIEW_SESSION_HISTORY_KEY, JSON.stringify(entries));
}

export function recordReviewSession(entry: ReviewSessionHistoryEntryV1, cap = 50) {
  const prev = loadReviewSessionHistory();
  const next = appendReviewSessionHistory(prev, entry, cap);
  saveReviewSessionHistory(next);
}

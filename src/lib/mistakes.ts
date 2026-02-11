import type { StationId } from './progress';

export type MistakeKind =
  | 'noteName'
  | 'intervalLabel'
  | 'triadQuality'
  | 'scaleDegreeName'
  | 'majorScaleDegree'
  | 'functionFamily';

type ReviewFields = {
  /** When this item is eligible to appear in the review queue. */
  dueAt: number;
  /** Consecutive correct answers in review. */
  correctStreak: number;
  /** Total wrong answers in review (for future analytics/weighting). */
  wrongCount: number;
};

export type NoteNameMistake = {
  id: string;
  kind: 'noteName';
  sourceStationId: StationId;
  midi: number;
  addedAt: number;
} & ReviewFields;

export type IntervalLabelMistake = {
  id: string;
  kind: 'intervalLabel';
  sourceStationId: StationId;
  rootMidi: number;
  semitones: number;
  addedAt: number;
} & ReviewFields;

export type ScaleDegreeNameMistake = {
  id: string;
  kind: 'scaleDegreeName';
  sourceStationId: StationId;
  key: string;
  degree: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  addedAt: number;
} & ReviewFields;

export type MajorScaleDegreeMistake = {
  id: string;
  kind: 'majorScaleDegree';
  sourceStationId: StationId;
  key: string;
  degree: 2 | 3 | 4 | 5 | 6 | 7;
  addedAt: number;
} & ReviewFields;

export type TriadQualityMistake = {
  id: string;
  kind: 'triadQuality';
  sourceStationId: StationId;
  rootMidi: number;
  quality: 'major' | 'minor' | 'diminished';
  addedAt: number;
} & ReviewFields;

export type FunctionFamilyMistake = {
  id: string;
  kind: 'functionFamily';
  sourceStationId: StationId;
  key: string;
  degree: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  tonicMidi: number;
  addedAt: number;
} & ReviewFields;

export type Mistake =
  | NoteNameMistake
  | IntervalLabelMistake
  | ScaleDegreeNameMistake
  | MajorScaleDegreeMistake
  | TriadQualityMistake
  | FunctionFamilyMistake;

type MistakeV1 = Omit<Mistake, keyof ReviewFields>;

const KEY_V2 = 'ets_mistakes_v2';
const KEY_V1 = 'ets_mistakes_v1';
const MAX = 50;

function normalize(m: Mistake | MistakeV1): Mistake {
  const now = Date.now();
  const dueAt = typeof (m as Mistake).dueAt === 'number' ? (m as Mistake).dueAt : (m as MistakeV1).addedAt ?? now;
  const correctStreak = typeof (m as Mistake).correctStreak === 'number' ? (m as Mistake).correctStreak : 0;
  const wrongCount = typeof (m as Mistake).wrongCount === 'number' ? (m as Mistake).wrongCount : 0;
  return { ...(m as Mistake), dueAt, correctStreak, wrongCount };
}

function safeParse(raw: string | null): Mistake[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(Boolean).map((x) => normalize(x as Mistake | MistakeV1));
  } catch {
    return [];
  }
}

export function loadMistakes(): Mistake[] {
  const v2 = localStorage.getItem(KEY_V2);
  if (v2) return safeParse(v2);

  // migrate v1 → v2 (best-effort; fill review fields)
  const v1 = localStorage.getItem(KEY_V1);
  if (v1) {
    const migrated = safeParse(v1);
    saveMistakes(migrated);
    return migrated;
  }

  return [];
}

export function saveMistakes(m: Mistake[]) {
  localStorage.setItem(KEY_V2, JSON.stringify(m.slice(0, MAX)));
}

function deDupeKey(m: Mistake): string {
  if (m.kind === 'noteName') return `noteName:${m.midi}`;
  if (m.kind === 'intervalLabel') return `intervalLabel:${m.rootMidi}:${m.semitones}`;
  if (m.kind === 'scaleDegreeName') return `scaleDegreeName:${m.key}:${m.degree}`;
  if (m.kind === 'majorScaleDegree') return `majorScaleDegree:${m.key}:${m.degree}`;
  if (m.kind === 'functionFamily') return `functionFamily:${m.key}:${m.degree}:${m.tonicMidi}`;
  return `triadQuality:${m.rootMidi}:${m.quality}`;
}

export function addMistake(
  m:
    | Omit<NoteNameMistake, 'id' | 'addedAt' | keyof ReviewFields>
    | Omit<IntervalLabelMistake, 'id' | 'addedAt' | keyof ReviewFields>
    | Omit<ScaleDegreeNameMistake, 'id' | 'addedAt' | keyof ReviewFields>
    | Omit<MajorScaleDegreeMistake, 'id' | 'addedAt' | keyof ReviewFields>
    | Omit<TriadQualityMistake, 'id' | 'addedAt' | keyof ReviewFields>
    | Omit<FunctionFamilyMistake, 'id' | 'addedAt' | keyof ReviewFields>,
) {
  const now = Date.now();
  const entry: Mistake = {
    ...(m as Mistake),
    id: `${now}_${Math.random().toString(16).slice(2)}`,
    addedAt: now,
    dueAt: now,
    correctStreak: 0,
    wrongCount: 0,
  };

  const existing = loadMistakes();
  const key = deDupeKey(entry);

  // Remove any older duplicate then prepend.
  const next = [entry, ...existing.filter((x) => deDupeKey(x) !== key)].slice(0, MAX);
  saveMistakes(next);
}

export function removeMistake(id: string) {
  const existing = loadMistakes();
  const next = existing.filter((x) => x.id !== id);
  saveMistakes(next);
}

export function updateMistake(id: string, updater: (m: Mistake) => Mistake | null) {
  const existing = loadMistakes();
  const next: Mistake[] = [];
  for (const m of existing) {
    if (m.id !== id) {
      next.push(m);
      continue;
    }
    const updated = updater(m);
    if (updated) next.push(updated);
  }
  saveMistakes(next);
}

/**
 * Snoozes an item (Duolingo-style “skip for now”).
 * Keeps the item in the queue, but makes it ineligible until later.
 */
export function snoozeMistake(id: string, snoozeMs = 5 * 60_000, now = Date.now()) {
  updateMistake(id, (m) => ({ ...m, dueAt: now + snoozeMs }));
}

/**
 * Bulk snooze helper (avoids repeated localStorage load/save loops).
 * Returns how many items were updated.
 */
export function snoozeMistakes(ids: string[], snoozeMs = 5 * 60_000, now = Date.now()): number {
  if (!ids.length) return 0;
  const set = new Set(ids);
  const existing = loadMistakes();
  let changed = 0;
  const next = existing.map((m) => {
    if (!set.has(m.id)) return m;
    changed += 1;
    return { ...m, dueAt: now + snoozeMs };
  });
  if (changed > 0) saveMistakes(next);
  return changed;
}

export function dueMistakes(now = Date.now()): Mistake[] {
  const all = loadMistakes();
  return all
    .filter((m) => (m.dueAt ?? 0) <= now)
    .sort((a, b) => a.dueAt - b.dueAt || b.addedAt - a.addedAt);
}

export function nextDueAt(): number | null {
  const all = loadMistakes();
  if (all.length === 0) return null;
  let min = Number.POSITIVE_INFINITY;
  for (const m of all) min = Math.min(min, m.dueAt ?? m.addedAt);
  return Number.isFinite(min) ? min : null;
}

export type MistakeScheduleSummary = {
  total: number;
  dueNow: number;
  within1h: number;
  today: number;
  later: number;
  hard: number;
  nextDueAt: number | null;
};

/**
 * Small read-only summary for UI (Practice/Review).
 * Buckets are mutually exclusive.
 */
export function mistakeScheduleSummaryFrom(mistakes: Mistake[], now = Date.now()): MistakeScheduleSummary {
  const total = mistakes.length;

  let dueNow = 0;
  let within1h = 0;
  let today = 0;
  let later = 0;
  let hard = 0;

  let minNext = Number.POSITIVE_INFINITY;

  for (const m of mistakes) {
    const dueAt = m.dueAt ?? m.addedAt;
    minNext = Math.min(minNext, dueAt);

    if ((m.wrongCount ?? 0) >= 3) hard += 1;

    const dt = dueAt - now;
    if (dt <= 0) {
      dueNow += 1;
    } else if (dt <= 60 * 60_000) {
      within1h += 1;
    } else if (dt <= 24 * 60 * 60_000) {
      today += 1;
    } else {
      later += 1;
    }
  }

  const nextDueAt = total ? (Number.isFinite(minNext) ? minNext : null) : null;

  return { total, dueNow, within1h, today, later, hard, nextDueAt };
}

export function mistakeScheduleSummary(now = Date.now()): MistakeScheduleSummary {
  return mistakeScheduleSummaryFrom(loadMistakes(), now);
}

/**
 * Applies a small spaced-repetition schedule.
 * - wrong → retry soon
 * - correct streak clears the item (usually 2; harder items require 3)
 */
export function requiredClearStreak(m: Mistake): number {
  // If you’ve missed this item a lot, demand one extra “clean” rep before clearing.
  const wc = m.wrongCount ?? 0;
  return wc >= 3 ? 3 : 2;
}

export function applyReviewResult(m: Mistake, result: 'correct' | 'wrong', now = Date.now()): Mistake | null {
  if (result === 'wrong') {
    return {
      ...m,
      correctStreak: 0,
      wrongCount: (m.wrongCount ?? 0) + 1,
      dueAt: now,
    };
  }

  const nextStreak = (m.correctStreak ?? 0) + 1;
  const need = requiredClearStreak(m);
  if (nextStreak >= need) return null;

  // Tiny Leitner-ish schedule: first win = soon; then spread out.
  // (Kept intentionally short so review feels “snappy”, not a flashcard app.)
  const delayMs = nextStreak === 1 ? 10 * 60_000 : nextStreak === 2 ? 60 * 60_000 : 6 * 60 * 60_000;
  return {
    ...m,
    correctStreak: nextStreak,
    dueAt: now + delayMs,
  };
}

export function mistakeCount(): number {
  return loadMistakes().length;
}

export function dueMistakeCount(now = Date.now()): number {
  return dueMistakes(now).length;
}

export function mistakeCountForStation(sourceStationId: StationId, opts?: { dueOnly?: boolean; now?: number }): number {
  const now = opts?.now ?? Date.now();
  return loadMistakes().filter((m) => m.sourceStationId === sourceStationId && (!opts?.dueOnly || (m.dueAt ?? 0) <= now)).length;
}

export type IntervalMistakeStat = { semitones: number; count: number; weight: number };

/**
 * Lightweight stats used to power “Top misses” drill affordances.
 * Weight favors intervals you miss repeatedly.
 */
export function intervalMistakeStatsFrom(mistakes: Mistake[]): IntervalMistakeStat[] {
  const map = new Map<number, IntervalMistakeStat>();
  for (const m of mistakes) {
    if (m.kind !== 'intervalLabel') continue;
    const w = 1 + (m.wrongCount ?? 0) * 2;
    const cur = map.get(m.semitones) ?? { semitones: m.semitones, count: 0, weight: 0 };
    cur.count += 1;
    cur.weight += w;
    map.set(m.semitones, cur);
  }
  return [...map.values()].sort((a, b) => b.weight - a.weight || b.count - a.count || a.semitones - b.semitones);
}

export function intervalMistakeStats(now = Date.now()): IntervalMistakeStat[] {
  // now is unused for now but kept for future due-weighting.
  void now;
  return intervalMistakeStatsFrom(loadMistakes());
}

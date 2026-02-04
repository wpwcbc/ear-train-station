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

/**
 * Applies a small spaced-repetition schedule.
 * - wrong → retry soon
 * - correct 2x in a row → clear
 */
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
  if (nextStreak >= 2) return null;

  const delayMs = nextStreak === 1 ? 10 * 60_000 : 60 * 60_000;
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

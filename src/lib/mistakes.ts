import type { StationId } from './progress';

export type MistakeKind = 'noteName' | 'intervalLabel' | 'triadQuality';

export type NoteNameMistake = {
  id: string;
  kind: 'noteName';
  sourceStationId: StationId;
  midi: number;
  addedAt: number;
};

export type IntervalLabelMistake = {
  id: string;
  kind: 'intervalLabel';
  sourceStationId: StationId;
  rootMidi: number;
  semitones: number;
  addedAt: number;
};

export type TriadQualityMistake = {
  id: string;
  kind: 'triadQuality';
  sourceStationId: StationId;
  rootMidi: number;
  quality: 'major' | 'minor' | 'diminished';
  addedAt: number;
};

export type Mistake = NoteNameMistake | IntervalLabelMistake | TriadQualityMistake;

const KEY = 'ets_mistakes_v1';
const MAX = 50;

function safeParse(raw: string | null): Mistake[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(Boolean) as Mistake[];
  } catch {
    return [];
  }
}

export function loadMistakes(): Mistake[] {
  return safeParse(localStorage.getItem(KEY));
}

export function saveMistakes(m: Mistake[]) {
  localStorage.setItem(KEY, JSON.stringify(m.slice(0, MAX)));
}

function deDupeKey(m: Mistake): string {
  if (m.kind === 'noteName') return `noteName:${m.midi}`;
  if (m.kind === 'intervalLabel') return `intervalLabel:${m.rootMidi}:${m.semitones}`;
  return `triadQuality:${m.rootMidi}:${m.quality}`;
}

export function addMistake(
  m:
    | Omit<NoteNameMistake, 'id' | 'addedAt'>
    | Omit<IntervalLabelMistake, 'id' | 'addedAt'>
    | Omit<TriadQualityMistake, 'id' | 'addedAt'>,
) {
  const now = Date.now();
  const entry: Mistake = { ...(m as Mistake), id: `${now}_${Math.random().toString(16).slice(2)}`, addedAt: now };

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

export function mistakeCount(): number {
  return loadMistakes().length;
}

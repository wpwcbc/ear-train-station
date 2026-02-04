import { mulberry32 } from '../lib/rng';

export type IntervalQuestion = {
  id: string;
  kind: 'interval';
  rootMidi: number;
  targetMidi: number;
  semitones: number;
};

export type IntervalLabel =
  | 'P1'
  | 'm2'
  | 'M2'
  | 'm3'
  | 'M3'
  | 'P4'
  | 'TT'
  | 'P5'
  | 'm6'
  | 'M6'
  | 'm7'
  | 'M7'
  | 'P8';

export const SEMITONE_TO_LABEL: Record<number, IntervalLabel> = {
  0: 'P1',
  1: 'm2',
  2: 'M2',
  3: 'm3',
  4: 'M3',
  5: 'P4',
  6: 'TT',
  7: 'P5',
  8: 'm6',
  9: 'M6',
  10: 'm7',
  11: 'M7',
  12: 'P8',
};

export function intervalLabel(semitones: number): IntervalLabel {
  return SEMITONE_TO_LABEL[Math.max(0, Math.min(12, semitones))] ?? 'P1';
}

export function intervalLongName(l: IntervalLabel): string {
  switch (l) {
    case 'P1':
      return 'Perfect unison';
    case 'm2':
      return 'Minor 2nd';
    case 'M2':
      return 'Major 2nd';
    case 'm3':
      return 'Minor 3rd';
    case 'M3':
      return 'Major 3rd';
    case 'P4':
      return 'Perfect 4th';
    case 'TT':
      return 'Tritone';
    case 'P5':
      return 'Perfect 5th';
    case 'm6':
      return 'Minor 6th';
    case 'M6':
      return 'Major 6th';
    case 'm7':
      return 'Minor 7th';
    case 'M7':
      return 'Major 7th';
    case 'P8':
      return 'Perfect octave';
  }
}

export function makeIntervalQuestion(opts: {
  seed: number;
  rootMidi?: number;
  minSemitones?: number;
  maxSemitones?: number;
}): IntervalQuestion {
  const rootMidi = opts.rootMidi ?? 60; // C4
  const min = opts.minSemitones ?? 0;
  const max = opts.maxSemitones ?? 12;
  const rng = mulberry32(opts.seed);
  const span = Math.max(1, max - min + 1);
  const semitones = min + Math.floor(rng() * span);

  return {
    id: `iq_seed_${opts.seed}`,
    kind: 'interval',
    rootMidi,
    targetMidi: rootMidi + semitones,
    semitones,
  };
}

export type IntervalLabelQuestion = {
  id: string;
  kind: 'intervalLabel';
  rootMidi: number;
  targetMidi: number;
  semitones: number;
  correct: IntervalLabel;
  choices: IntervalLabel[];
  prompt: string;
};

const ALL_INTERVAL_LABELS: IntervalLabel[] = ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'];

export function makeIntervalLabelQuestion(opts: {
  seed: number;
  rootMinMidi?: number;
  rootMaxMidi?: number;
  minSemitones?: number;
  maxSemitones?: number;
  choiceCount?: number;
}): IntervalLabelQuestion {
  const rng = mulberry32(opts.seed);

  const rootMin = opts.rootMinMidi ?? 60;
  const rootMax = opts.rootMaxMidi ?? 72;
  const rootSpan = Math.max(1, rootMax - rootMin + 1);
  const rootMidi = rootMin + Math.floor(rng() * rootSpan);

  const min = opts.minSemitones ?? 0;
  const max = opts.maxSemitones ?? 12;
  const span = Math.max(1, max - min + 1);
  const semitones = min + Math.floor(rng() * span);

  const targetMidi = rootMidi + semitones;
  const correct = intervalLabel(semitones);

  const want = Math.max(2, Math.min(opts.choiceCount ?? 6, ALL_INTERVAL_LABELS.length));

  // pick distractors by shuffling label list deterministically
  const pool = ALL_INTERVAL_LABELS.filter((x) => x !== correct);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const choices = [correct, ...pool.slice(0, want - 1)];
  // shuffle choices
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }

  return {
    id: `ilq_seed_${opts.seed}`,
    kind: 'intervalLabel',
    rootMidi,
    targetMidi,
    semitones,
    correct,
    choices,
    prompt: 'What interval is this? (listen to root → target)',
  };
}

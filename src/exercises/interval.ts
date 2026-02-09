import { mulberry32 } from '../lib/rng';
import { DEFAULT_WIDE_REGISTER_MAX_MIDI } from '../lib/registerPolicy';

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

export const LABEL_TO_SEMITONE: Record<IntervalLabel, number> = Object.fromEntries(
  Object.entries(SEMITONE_TO_LABEL).map(([k, v]) => [v, Number(k)]),
) as Record<IntervalLabel, number>;

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

function buildIntervalLabelChoices(opts: { seed: number; correct: IntervalLabel; choiceCount: number }) {
  const rng = mulberry32(opts.seed);
  const want = Math.max(2, Math.min(opts.choiceCount, ALL_INTERVAL_LABELS.length));

  // pick distractors by shuffling label list deterministically
  const pool = ALL_INTERVAL_LABELS.filter((x) => x !== opts.correct);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const choices = [opts.correct, ...pool.slice(0, want - 1)];
  // shuffle choices
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }

  return choices;
}

export function makeIntervalLabelQuestion(opts: {
  seed: number;
  rootMinMidi?: number;
  rootMaxMidi?: number;
  minSemitones?: number;
  maxSemitones?: number;
  /** If provided, the question will sample semitones from this allowlist (still respecting min/max if set). */
  allowedSemitones?: number[];
  choiceCount?: number;
}): IntervalLabelQuestion {
  const rng = mulberry32(opts.seed);

  const rootMin = opts.rootMinMidi ?? 60;
  const rootMax = opts.rootMaxMidi ?? DEFAULT_WIDE_REGISTER_MAX_MIDI;
  const rootSpan = Math.max(1, rootMax - rootMin + 1);
  const rootMidi = rootMin + Math.floor(rng() * rootSpan);

  const min = opts.minSemitones ?? 0;
  const max = opts.maxSemitones ?? 12;

  const allowed = (opts.allowedSemitones ?? [])
    .map((s) => Math.round(s))
    .filter((s) => s >= min && s <= max);

  const semitones =
    allowed.length > 0
      ? allowed[Math.floor(rng() * allowed.length)]
      : (() => {
          const span = Math.max(1, max - min + 1);
          return min + Math.floor(rng() * span);
        })();

  const targetMidi = rootMidi + semitones;
  const correct = intervalLabel(semitones);

  const choices = buildIntervalLabelChoices({ seed: opts.seed, correct, choiceCount: opts.choiceCount ?? 6 });

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

export function makeIntervalLabelReviewQuestion(opts: {
  seed: number;
  rootMidi: number;
  semitones: number;
  choiceCount?: number;
}): IntervalLabelQuestion {
  const correct = intervalLabel(opts.semitones);
  const choices = buildIntervalLabelChoices({ seed: opts.seed, correct, choiceCount: opts.choiceCount ?? 6 });

  return {
    id: `ilq_review_${opts.rootMidi}_${opts.semitones}_${opts.seed}`,
    kind: 'intervalLabel',
    rootMidi: opts.rootMidi,
    targetMidi: opts.rootMidi + opts.semitones,
    semitones: opts.semitones,
    correct,
    choices,
    prompt: 'Review: what interval is this? (listen to root → target)',
  };
}

export type IntervalDeriveQuestion = {
  id: string;
  kind: 'intervalDerive';
  base: IntervalLabel;
  delta: -1 | 1;
  correct: IntervalLabel;
  choices: IntervalLabel[];
  prompt: string;
};

function buildDeriveChoices(opts: { seed: number; correct: IntervalLabel; choiceCount: number }) {
  // Bias distractors toward “nearby” interval labels to teach semitone adjacency.
  const rng = mulberry32(opts.seed);
  const want = Math.max(2, Math.min(opts.choiceCount, ALL_INTERVAL_LABELS.length));

  const correctSemi = LABEL_TO_SEMITONE[opts.correct];
  const near: IntervalLabel[] = [];
  for (const d of [-2, -1, 1, 2]) {
    const s = correctSemi + d;
    if (s >= 0 && s <= 12) near.push(intervalLabel(s));
  }

  const pool = Array.from(new Set([...near, ...ALL_INTERVAL_LABELS])).filter((x) => x !== opts.correct);

  // shuffle pool
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const choices = [opts.correct, ...pool.slice(0, want - 1)];
  // shuffle choices
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }

  return choices;
}

export function makeIntervalDeriveQuestion(opts: { seed: number; choiceCount?: number }): IntervalDeriveQuestion {
  const rng = mulberry32(opts.seed);

  // Pick a base semitone where ±1 stays within 0..12.
  const baseSemi = 1 + Math.floor(rng() * 11); // 1..11
  const delta: -1 | 1 = rng() < 0.5 ? -1 : 1;
  const targetSemi = Math.max(0, Math.min(12, baseSemi + delta));

  const base = intervalLabel(baseSemi);
  const correct = intervalLabel(targetSemi);

  const dirWord = delta === 1 ? 'larger' : 'smaller';
  const prompt = `If ${base} becomes 1 semitone ${dirWord}, what interval is it?`;

  const choices = buildDeriveChoices({ seed: opts.seed * 33 + 7, correct, choiceCount: opts.choiceCount ?? 4 });

  return {
    id: `idq_seed_${opts.seed}`,
    kind: 'intervalDerive',
    base,
    delta,
    correct,
    choices,
    prompt,
  };
}

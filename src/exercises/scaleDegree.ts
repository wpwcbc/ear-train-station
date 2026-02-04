import { MAJOR_KEYS, MAJOR_OFFSETS, PC, pickTestTonicMidi } from '../lib/theory/major';
import { mulberry32, shuffle } from '../lib/rng';

export type ScaleDegreeName =
  | 'tonic'
  | 'supertonic'
  | 'mediant'
  | 'subdominant'
  | 'dominant'
  | 'submediant'
  | 'leading tone';

export const DEGREE_NAMES: ScaleDegreeName[] = [
  'tonic',
  'supertonic',
  'mediant',
  'subdominant',
  'dominant',
  'submediant',
  'leading tone',
];

export function degreeNameFor(degree: 1 | 2 | 3 | 4 | 5 | 6 | 7): ScaleDegreeName {
  return DEGREE_NAMES[degree - 1] ?? 'tonic';
}

export type ScaleDegreeQuestion = {
  key: string;
  degree: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  correct: ScaleDegreeName;
  choices: ScaleDegreeName[];
  tonicMidi: number;
  targetMidi: number;
  prompt: string;
};

export function makeScaleDegreeNameQuestion(opts: {
  seed: number;
  choiceCount: 4 | 6 | 7;
  mode: 'lesson' | 'test';
}): ScaleDegreeQuestion {
  const rng = mulberry32(opts.seed);

  const key = MAJOR_KEYS[Math.floor(rng() * MAJOR_KEYS.length)] ?? MAJOR_KEYS[0];
  const degree = (1 + Math.floor(rng() * 7)) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
  const correct = degreeNameFor(degree);

  const tonicPc = PC[key.key];
  const tonicMidi =
    opts.mode === 'test' ? pickTestTonicMidi(tonicPc, rng) : 60 + tonicPc; // stable register for lessons

  const targetMidi = tonicMidi + MAJOR_OFFSETS[degree - 1];

  const wrongPool = DEGREE_NAMES.filter((x) => x !== correct);
  const pickedWrongs = shuffle(wrongPool, rng).slice(0, Math.max(0, opts.choiceCount - 1));
  const choices = shuffle([correct, ...pickedWrongs], rng);

  const prompt = `In ${key.key} major, what do we call scale degree ${degree}?`;

  return {
    key: key.key,
    degree,
    correct,
    choices,
    tonicMidi,
    targetMidi,
    prompt,
  };
}

export function makeScaleDegreeNameReviewQuestion(opts: {
  seed: number;
  key: string;
  degree: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  choiceCount: 4 | 6 | 7;
}): ScaleDegreeQuestion {
  const rng = mulberry32(opts.seed);

  const degree = opts.degree;
  const correct = degreeNameFor(degree);

  const tonicPc = PC[opts.key];
  const tonicMidi = 60 + tonicPc; // keep review in a stable register
  const targetMidi = tonicMidi + MAJOR_OFFSETS[degree - 1];

  const wrongPool = DEGREE_NAMES.filter((x) => x !== correct);
  const pickedWrongs = shuffle(wrongPool, rng).slice(0, Math.max(0, opts.choiceCount - 1));
  const choices = shuffle([correct, ...pickedWrongs], rng);

  const prompt = `Review: in ${opts.key} major, what do we call scale degree ${degree}?`;

  return {
    key: opts.key,
    degree,
    correct,
    choices,
    tonicMidi,
    targetMidi,
    prompt,
  };
}

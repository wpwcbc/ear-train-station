import { mulberry32, shuffle, uniq } from '../lib/rng';

// Sound-first major scale work, but with correct spelling (letters ascend).
// We start with a small set of friendly keys.
const MAJOR_KEYS = [
  { key: 'C', scale: ['C', 'D', 'E', 'F', 'G', 'A', 'B'] },
  { key: 'G', scale: ['G', 'A', 'B', 'C', 'D', 'E', 'F#'] },
  { key: 'D', scale: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'] },
  { key: 'A', scale: ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'] },
  { key: 'E', scale: ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'] },
  { key: 'F', scale: ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'] },
  { key: 'Bb', scale: ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A'] },
  { key: 'Eb', scale: ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'] },
] as const;

export type MajorScaleSession = {
  key: (typeof MAJOR_KEYS)[number]['key'];
  scale: string[]; // 7 notes
  tonicPc: number;
  tonicMidi: number; // stable register (C4..B4)
};

export type MajorScaleStepQuestion = {
  key: string;
  stepIndex: number; // 1..6 (the next note after tonic)
  prompt: string;
  choices: string[];
  correct: string;
  // for audio: play the tonic + then the target note within the scale
  tonicMidi: number;
  targetMidi: number;
  shownSoFar: string[]; // includes tonic + already-correct steps
};

const PC: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

const MAJOR_OFFSETS = [0, 2, 4, 5, 7, 9, 11];

export function makeMajorScaleSession(opts: { seed: number }): MajorScaleSession {
  const rng = mulberry32(opts.seed);
  const i = Math.floor(rng() * MAJOR_KEYS.length);
  const k = MAJOR_KEYS[i];
  const tonicPc = PC[k.key];
  const tonicMidi = 60 + tonicPc; // stable: C4..B4

  return { key: k.key, scale: k.scale.slice(), tonicPc, tonicMidi };
}

export function makeMajorScaleStepQuestion(opts: {
  seed: number;
  session: MajorScaleSession;
  stepIndex: number; // 1..6
  shownSoFar: string[];
  choiceCount?: number;
}): MajorScaleStepQuestion {
  const rng = mulberry32(opts.seed);
  const choiceCount = opts.choiceCount ?? 4;

  const stepIndex = Math.min(6, Math.max(1, opts.stepIndex));
  const correct = opts.session.scale[stepIndex];

  const pool: string[] = [correct];

  // distractors: other notes in the scale + a few common accidentals.
  const distractorPool = uniq([
    ...opts.session.scale,
    'C#',
    'F#',
    'G#',
    'Bb',
    'Eb',
    'Ab',
  ]).filter((x) => x !== correct);

  for (const d of shuffle(distractorPool, rng)) {
    pool.push(d);
    if (uniq(pool).length >= choiceCount) break;
  }

  const choices = shuffle(uniq(pool).slice(0, choiceCount), rng);

  const targetMidi = opts.session.tonicMidi + MAJOR_OFFSETS[stepIndex];

  const prompt = `Key: ${opts.session.key} major — pick scale step ${stepIndex + 1} of 7.`;

  return {
    key: opts.session.key,
    stepIndex,
    prompt,
    choices,
    correct,
    tonicMidi: opts.session.tonicMidi,
    targetMidi,
    shownSoFar: opts.shownSoFar,
  };
}

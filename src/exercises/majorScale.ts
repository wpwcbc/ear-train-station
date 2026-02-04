import { mulberry32, shuffle, uniq } from '../lib/rng';
import { MAJOR_KEYS, MAJOR_OFFSETS, PC, pickTestTonicMidi } from '../lib/theory/major';

// Sound-first major scale work, but with correct spelling (letters ascend).
// We start with a small set of friendly keys.

export type StepType = 'W' | 'H';

/** Between degrees 1→2, 2→3, ... 7→8 (octave). */
export const MAJOR_STEP_TYPES: StepType[] = ['W', 'W', 'H', 'W', 'W', 'W', 'H'];

export type MajorScaleStepTypeQuestion = {
  stepIndex: number; // 0..6 (degree n → n+1, ending with 7→8)
  prompt: string;
  choices: StepType[];
  correct: StepType;
};

export function makeMajorScaleStepTypeQuestion(opts: { seed: number; stepIndex: number }): MajorScaleStepTypeQuestion {
  const rng = mulberry32(opts.seed);
  const stepIndex = Math.min(6, Math.max(0, opts.stepIndex));
  const correct = MAJOR_STEP_TYPES[stepIndex];
  const choices = shuffle(['W', 'H'] as StepType[], rng);

  return {
    stepIndex,
    correct,
    choices,
    prompt: `Major scale step ${stepIndex + 1} of 7: is the next move a whole tone (W) or semitone (H)?`,
  };
}

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

export type MajorScaleTestQuestion = {
  key: string;
  degree: number; // 2..7
  prompt: string;
  choices: string[];
  correct: string;
  tonicMidi: number;
  targetMidi: number;
};

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
  const distractorPool = uniq([...opts.session.scale, 'C#', 'F#', 'G#', 'Bb', 'Eb', 'Ab']).filter((x) => x !== correct);

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

export function makeMajorScaleTestQuestion(opts: {
  seed: number;
  degree?: number; // 2..7
  choiceCount?: number;
}): MajorScaleTestQuestion {
  const rng = mulberry32(opts.seed);
  const choiceCount = opts.choiceCount ?? 6;

  const i = Math.floor(rng() * MAJOR_KEYS.length);
  const k = MAJOR_KEYS[i];
  const tonicPc = PC[k.key];
  const tonicMidi = pickTestTonicMidi(tonicPc, rng);

  const degree = Math.min(7, Math.max(2, opts.degree ?? (2 + Math.floor(rng() * 6))));
  const stepIndex = degree - 1;
  const correct = k.scale[stepIndex];

  const pool: string[] = [correct];

  const distractorPool = uniq([...k.scale, 'C#', 'F#', 'G#', 'D#', 'A#', 'Bb', 'Eb', 'Ab']).filter((x) => x !== correct);

  for (const d of shuffle(distractorPool, rng)) {
    pool.push(d);
    if (uniq(pool).length >= choiceCount) break;
  }

  const choices = shuffle(uniq(pool).slice(0, choiceCount), rng);
  const targetMidi = tonicMidi + MAJOR_OFFSETS[stepIndex];

  return {
    key: k.key,
    degree,
    prompt: `Test: ${k.key} major — which note is degree ${degree} (of 7)?`,
    choices,
    correct,
    tonicMidi,
    targetMidi,
  };
}

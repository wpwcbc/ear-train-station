import { MAJOR_KEYS, MAJOR_OFFSETS, PC, pickTestTonicMidi } from '../lib/theory/major';
import { mulberry32, shuffle } from '../lib/rng';
import { intervalLabel, type IntervalLabel } from './interval';

/**
 * Train the mapping: in a major scale, each scale degree is a fixed interval above tonic.
 * (1=P1, 2=M2, 3=M3, 4=P4, 5=P5, 6=M6, 7=M7)
 */
export type DegreeIntervalQuestion = {
  id: string;
  kind: 'degreeInterval';
  key: string;
  degree: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  tonicMidi: number;
  targetMidi: number;
  semitones: number;
  correct: IntervalLabel;
  choices: IntervalLabel[];
  prompt: string;
};

const MAJOR_SCALE_INTERVALS: IntervalLabel[] = ['P1', 'M2', 'M3', 'P4', 'P5', 'M6', 'M7'];

export function makeDegreeIntervalQuestion(opts: {
  seed: number;
  choiceCount: 4 | 6 | 7;
  mode: 'lesson' | 'test';
}): DegreeIntervalQuestion {
  const rng = mulberry32(opts.seed);

  const key = MAJOR_KEYS[Math.floor(rng() * MAJOR_KEYS.length)] ?? MAJOR_KEYS[0];
  const degree = (1 + Math.floor(rng() * 7)) as 1 | 2 | 3 | 4 | 5 | 6 | 7;

  const tonicPc = PC[key.key];
  const tonicMidi =
    opts.mode === 'test' ? pickTestTonicMidi(tonicPc, rng) : 60 + tonicPc; // stable register for lessons

  const semitones = MAJOR_OFFSETS[degree - 1] ?? 0;
  const targetMidi = tonicMidi + semitones;

  const correct = intervalLabel(semitones);

  const wrongPool = MAJOR_SCALE_INTERVALS.filter((x) => x !== correct);
  const pickedWrongs = shuffle(wrongPool, rng).slice(0, Math.max(0, opts.choiceCount - 1));
  const choices = shuffle([correct, ...pickedWrongs], rng);

  const prompt = `In ${key.key} major, what interval is scale degree ${degree} above tonic? (listen tonic → target)`;

  return {
    id: `diq_seed_${opts.seed}`,
    kind: 'degreeInterval',
    key: key.key,
    degree,
    tonicMidi,
    targetMidi,
    semitones,
    correct,
    choices,
    prompt,
  };
}

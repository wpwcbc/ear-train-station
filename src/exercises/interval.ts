import { mulberry32 } from '../lib/rng';

export type IntervalQuestion = {
  id: string;
  kind: 'interval';
  rootMidi: number;
  targetMidi: number;
  semitones: number;
};

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

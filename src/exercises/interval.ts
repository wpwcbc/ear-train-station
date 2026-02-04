export type IntervalQuestion = {
  id: string;
  kind: 'interval';
  rootMidi: number;
  targetMidi: number;
  semitones: number;
};

export function makeIntervalQuestion(opts?: {
  rootMidi?: number;
  minSemitones?: number;
  maxSemitones?: number;
}): IntervalQuestion {
  const rootMidi = opts?.rootMidi ?? 60; // C4
  const min = opts?.minSemitones ?? 0;
  const max = opts?.maxSemitones ?? 12;
  const semitones = randInt(min, max);
  return {
    id: `iq_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    kind: 'interval',
    rootMidi,
    targetMidi: rootMidi + semitones,
    semitones,
  };
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

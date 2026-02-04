export const MAJOR_KEYS = [
  { key: 'C', scale: ['C', 'D', 'E', 'F', 'G', 'A', 'B'] },
  { key: 'G', scale: ['G', 'A', 'B', 'C', 'D', 'E', 'F#'] },
  { key: 'D', scale: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'] },
  { key: 'A', scale: ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'] },
  { key: 'E', scale: ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'] },
  { key: 'F', scale: ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'] },
  { key: 'Bb', scale: ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A'] },
  { key: 'Eb', scale: ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'] },
] as const;

export type MajorKey = (typeof MAJOR_KEYS)[number];

export const PC: Record<string, number> = {
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

export const MAJOR_OFFSETS = [0, 2, 4, 5, 7, 9, 11] as const;

export function pickTestTonicMidi(tonicPc: number, rng: () => number) {
  // Lessons stay in a stable register; tests can roam (but keep >= G2).
  const base = 60 + tonicPc;
  const candidates = [base - 24, base - 12, base].filter((m) => m >= 43 && m <= 72);
  return candidates[Math.floor(rng() * candidates.length)] ?? base;
}

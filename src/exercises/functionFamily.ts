import { mulberry32, shuffle } from '../lib/rng';
import { MAJOR_KEYS, PC } from '../lib/theory/major';
import { buildDiatonicTriadMidis } from './diatonicTriad';

export type FunctionFamily = 'tonic' | 'subdominant' | 'dominant';

export type FunctionFamilyQuestion = {
  id: string;
  kind: 'function-family';
  key: (typeof MAJOR_KEYS)[number]['key'];
  degree: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  roman: string;
  family: FunctionFamily;
  chordMidis: [number, number, number];
  prompt: string;
  choices: FunctionFamily[];
};

const DEGREE_FAMILY: Record<1 | 2 | 3 | 4 | 5 | 6 | 7, FunctionFamily> = {
  1: 'tonic',
  2: 'subdominant',
  3: 'tonic',
  4: 'subdominant',
  5: 'dominant',
  6: 'tonic',
  7: 'dominant',
};

const DEGREE_QUALITY: Record<1 | 2 | 3 | 4 | 5 | 6 | 7, 'major' | 'minor' | 'diminished'> = {
  1: 'major',
  2: 'minor',
  3: 'minor',
  4: 'major',
  5: 'major',
  6: 'minor',
  7: 'diminished',
};

function degreeToRoman(deg: 1 | 2 | 3 | 4 | 5 | 6 | 7, quality: 'major' | 'minor' | 'diminished') {
  const base = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][deg - 1] as string;
  if (quality === 'major') return base;
  if (quality === 'minor') return base.toLowerCase();
  return base.toLowerCase() + '°';
}

export function makeFunctionFamilyQuestion(opts: {
  seed: number;
  /** Lessons: keep stable register (C4..B4 tonic). */
  stableTonicMidi?: number;
  degree?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}): FunctionFamilyQuestion {
  const rng = mulberry32(opts.seed);

  const k = MAJOR_KEYS[Math.floor(rng() * MAJOR_KEYS.length)];
  const degree = (opts.degree ?? (1 + Math.floor(rng() * 7))) as 1 | 2 | 3 | 4 | 5 | 6 | 7;

  const tonicPc = PC[k.key];
  const tonicMidi = opts.stableTonicMidi ?? 60 + tonicPc; // stable: C4..B4

  const quality = DEGREE_QUALITY[degree];
  const roman = degreeToRoman(degree, quality);

  const chordMidis = buildDiatonicTriadMidis({ tonicMidi, degree });
  const family = DEGREE_FAMILY[degree];

  const choices = shuffle(['tonic', 'subdominant', 'dominant'] as FunctionFamily[], rng);

  return {
    id: `ff_seed_${opts.seed}`,
    kind: 'function-family',
    key: k.key,
    degree,
    roman,
    family,
    chordMidis,
    prompt: `Key: ${k.key} major — what FUNCTION family does ${roman} belong to?`,
    choices,
  };
}

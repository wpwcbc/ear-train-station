import { mulberry32, shuffle } from '../lib/rng';
import { DEFAULT_WIDE_REGISTER_MAX_MIDI, WIDE_REGISTER_MIN_MIDI } from '../lib/registerPolicy';
import { MAJOR_KEYS, MAJOR_OFFSETS, PC } from '../lib/theory/major';
import type { TriadQuality } from './triad';

export type DiatonicTriadQuestion = {
  id: string;
  kind: 'diatonic-triad-quality';
  key: (typeof MAJOR_KEYS)[number]['key'];
  degree: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  rootName: string;
  quality: TriadQuality;
  chordMidis: [number, number, number];
  prompt: string;
  choices: TriadQuality[];
};

const DEGREE_QUALITY: Record<1 | 2 | 3 | 4 | 5 | 6 | 7, TriadQuality> = {
  1: 'major',
  2: 'minor',
  3: 'minor',
  4: 'major',
  5: 'major',
  6: 'minor',
  7: 'diminished',
};

function degreeToRoman(deg: 1 | 2 | 3 | 4 | 5 | 6 | 7, quality: TriadQuality) {
  const base = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][deg - 1] as string;
  if (quality === 'major') return base;
  if (quality === 'minor') return base.toLowerCase();
  return base.toLowerCase() + '°';
}

export function buildDiatonicTriadMidis(opts: {
  tonicMidi: number;
  degree: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}): [number, number, number] {
  // Use scale degrees: (deg, deg+2, deg+4), wrapping with +12.
  const d0 = opts.degree - 1;
  const degreeIndex = (i: number) => ((i % 7) + 7) % 7;

  const rootOffset = MAJOR_OFFSETS[d0];

  const thirdIndex = degreeIndex(d0 + 2);
  const fifthIndex = degreeIndex(d0 + 4);

  const thirdOffset = MAJOR_OFFSETS[thirdIndex] + (thirdIndex <= d0 ? 12 : 0);
  const fifthOffset = MAJOR_OFFSETS[fifthIndex] + (fifthIndex <= d0 ? 12 : 0);

  const root = opts.tonicMidi + rootOffset;
  const third = opts.tonicMidi + thirdOffset;
  const fifth = opts.tonicMidi + fifthOffset;

  return [root, third, fifth];
}

export function makeDiatonicTriadQualityQuestion(opts: {
  seed: number;
  mode?: 'lesson' | 'test';
  /** Lessons: keep stable register (C4..B4 tonic). */
  stableTonicMidi?: number;
  /** Tests: tonic range (will be adjusted per key pitch-class). */
  tonicMinMidi?: number;
  tonicMaxMidi?: number;
  degree?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  choiceCount?: number;
}): DiatonicTriadQuestion {
  const rng = mulberry32(opts.seed);

  const k = MAJOR_KEYS[Math.floor(rng() * MAJOR_KEYS.length)];
  const degree = (opts.degree ?? (1 + Math.floor(rng() * 7))) as 1 | 2 | 3 | 4 | 5 | 6 | 7;

  const tonicPc = PC[k.key];
  const mode = opts.mode ?? (opts.tonicMinMidi != null || opts.tonicMaxMidi != null ? 'test' : 'lesson');

  let tonicMidi: number;
  if (mode === 'test') {
    const minTonic = opts.tonicMinMidi ?? WIDE_REGISTER_MIN_MIDI; // G2
    const maxTonic = opts.tonicMaxMidi ?? Math.min(65, DEFAULT_WIDE_REGISTER_MAX_MIDI); // F4-ish
    // Choose a tonic in [minTonic, maxTonic] while respecting the key pitch-class.
    const minBase = minTonic - tonicPc;
    const maxBase = maxTonic - tonicPc;
    const span = Math.max(1, maxBase - minBase + 1);
    const base = minBase + Math.floor(rng() * span);
    tonicMidi = base + tonicPc;
  } else {
    tonicMidi = opts.stableTonicMidi ?? 60 + tonicPc; // stable: C4..B4
  }

  const rootName = k.scale[degree - 1];
  const quality = DEGREE_QUALITY[degree];
  const roman = degreeToRoman(degree, quality);

  const chordMidis = buildDiatonicTriadMidis({ tonicMidi, degree });

  const qualities: TriadQuality[] = ['major', 'minor', 'diminished'];
  const choiceCount = Math.max(2, Math.min(opts.choiceCount ?? 3, qualities.length));
  const distractors = shuffle(
    qualities.filter((x) => x !== quality),
    rng,
  ).slice(0, Math.max(0, choiceCount - 1));

  const choices = shuffle([quality, ...distractors], rng);

  return {
    id: `dtq_seed_${opts.seed}`,
    kind: 'diatonic-triad-quality',
    key: k.key,
    degree,
    rootName,
    quality,
    chordMidis,
    prompt: `Key: ${k.key} major — build the ${roman} triad (root: ${rootName}). What quality is it?`,
    choices,
  };
}

import { STABLE_REGISTER_MAX_MIDI, STABLE_REGISTER_MIN_MIDI } from '../lib/registerPolicy';
import { mulberry32, shuffle } from '../lib/rng';

export type TriadQuality = 'major' | 'minor' | 'diminished';

export type TriadQuestion = {
  id: string;
  kind: 'triad-quality';
  rootMidi: number;
  quality: TriadQuality;
  chordMidis: [number, number, number];
  prompt: string;
  choices: TriadQuality[];
};

const QUALITY_LABEL: Record<TriadQuality, string> = {
  major: 'Major',
  minor: 'Minor',
  diminished: 'Diminished',
};

const QUALITY_INTERVALS: Record<TriadQuality, [number, number, number]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
};

export function triadQualityLabel(q: TriadQuality) {
  return QUALITY_LABEL[q];
}

export function triadQualityIntervals(q: TriadQuality) {
  return QUALITY_INTERVALS[q];
}

export function makeTriadQualityQuestion(opts: {
  seed: number;
  /** Lessons: keep stable register. */
  minRootMidi?: number;
  maxRootMidi?: number;
  choiceCount?: number;
}): TriadQuestion {
  const rng = mulberry32(opts.seed);

  // Stable lesson register by default.
  // Keep the whole triad inside the stable register (root..root+7).
  const maxTriadInterval = 7;
  const minRootMidi = opts.minRootMidi ?? STABLE_REGISTER_MIN_MIDI;
  const maxRootMidi = opts.maxRootMidi ?? Math.max(minRootMidi, STABLE_REGISTER_MAX_MIDI - maxTriadInterval);
  const span = Math.max(1, maxRootMidi - minRootMidi + 1);
  const rootMidi = minRootMidi + Math.floor(rng() * span);

  const qualities: TriadQuality[] = ['major', 'minor', 'diminished'];
  const quality = qualities[Math.floor(rng() * qualities.length)];

  const intervals = QUALITY_INTERVALS[quality];
  const chordMidis: [number, number, number] = [
    rootMidi + intervals[0],
    rootMidi + intervals[1],
    rootMidi + intervals[2],
  ];

  const choiceCount = Math.max(2, Math.min(opts.choiceCount ?? 3, qualities.length));
  const distractors = shuffle(
    qualities.filter((x) => x !== quality),
    rng,
  ).slice(0, Math.max(0, choiceCount - 1));

  const choices = shuffle([quality, ...distractors], rng);

  return {
    id: `tq_seed_${opts.seed}`,
    kind: 'triad-quality',
    rootMidi,
    quality,
    chordMidis,
    prompt: 'Which triad quality is this?',
    choices,
  };
}

export function makeTriadQualityReviewQuestion(opts: {
  seed: number;
  rootMidi: number;
  quality: TriadQuality;
  choiceCount?: number;
}): TriadQuestion {
  const rng = mulberry32(opts.seed);

  const qualities: TriadQuality[] = ['major', 'minor', 'diminished'];
  const quality = opts.quality;

  const intervals = QUALITY_INTERVALS[quality];
  const chordMidis: [number, number, number] = [
    opts.rootMidi + intervals[0],
    opts.rootMidi + intervals[1],
    opts.rootMidi + intervals[2],
  ];

  const choiceCount = Math.max(2, Math.min(opts.choiceCount ?? 3, qualities.length));
  const distractors = shuffle(
    qualities.filter((x) => x !== quality),
    rng,
  ).slice(0, Math.max(0, choiceCount - 1));

  const choices = shuffle([quality, ...distractors], rng);

  return {
    id: `tq_review_${opts.rootMidi}_${quality}`,
    kind: 'triad-quality',
    rootMidi: opts.rootMidi,
    quality,
    chordMidis,
    prompt: 'Review: which triad quality is this?',
    choices,
  };
}

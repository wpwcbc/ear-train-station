import type { StationId } from './progress';

export type StationCopy = {
  /** Short, Duolingo-style primer shown above the exercise. */
  primer: string[];
  /** Optional extra tip shown under the exercise. */
  tips?: string[];
};

const COPY: Partial<Record<StationId, StationCopy>> = {
  S1_NOTES: {
    primer: [
      'Goal: instantly name single notes (including black keys).',
      'Black keys have two names: a sharp or a flat (e.g. C# = Db).',
      'Lesson range stays stable so your ear locks to one register.',
    ],
    tips: ['If you miss one, it goes into Review so you can clear it later.'],
  },
  S1B_STAFF: {
    primer: [
      'Goal: connect note names to staff positions (Middle C anchor).',
      'Same stable register + white keys first (C D E F G A B).',
      'You can still press Play — but try to read before you hear.',
    ],
    tips: ['Middle C is the anchor. From there, step up/down by letters.'],
  },
  T1_NOTES: {
    primer: ['10 questions. Wider register (G2 and up). Need 8/10 to pass.'],
  },
  S2_MAJOR_SCALE: {
    primer: [
      'Major scale formula: W W H W W W H.',
      'Warm-up: drill each step as Whole tone (W) or semitone (H).',
      'Spelling rule: letter names must ascend (no skipping letters).',
      'Listen for the target degree, answer with correct note spelling.',
    ],
  },
  T2_MAJOR_SCALE: {
    primer: ['10 questions. Identify the prompted scale degree with correct spelling. Need 8/10.'],
  },
  S3_INTERVALS: {
    primer: [
      'Intervals are distance from a root note, measured in semitones.',
      'Learn them as labels (m3, M3, P5…) but also as “how far” you feel.',
    ],
  },
  T3_INTERVALS: {
    primer: ['10 questions. Name the interval by ear across a wider register. Need 8/10.'],
  },
  S4_TRIADS: {
    primer: [
      'Triads = root + 3rd + 5th.',
      'Quality is determined by the intervals from the root:',
      'Major = 0-4-7 · Minor = 0-3-7 · Diminished = 0-3-6.',
    ],
  },
  T5_TRIADS: {
    primer: ['10 questions. Identify triad quality by ear in a wider register. Need 8/10.'],
  },
  S5_DIATONIC_TRIADS: {
    primer: [
      'In a major key, stacking 1-3-5 on each scale degree yields fixed qualities:',
      'I maj · ii min · iii min · IV maj · V maj · vi min · vii° dim.',
    ],
  },
  T6_DIATONIC_TRIADS: {
    primer: ['10 questions. Mixed keys + wider register (G2 and up). Need 8/10 to pass.'],
  },
  S6_FUNCTIONS: {
    primer: [
      'Function families (major key):',
      'Tonic = I iii vi (rest) · Subdominant = ii IV (move) · Dominant = V vii° (tension).',
      'We want fast grouping — not perfect theory debates.',
    ],
  },
  T7_FUNCTIONS: {
    primer: ['10 questions. Mixed keys + wider register (G2 and up). Need 8/10 to pass.'],
  },
  S7_DEGREES: {
    primer: [
      'Scale degrees have names (roles):',
      '1 tonic · 2 supertonic · 3 mediant · 4 subdominant · 5 dominant · 6 submediant · 7 leading tone.',
      'These names are also “jobs” — a tiny hint helps your ear stick faster.',
    ],
    tips: [
      'tonic = home/rest · dominant = tension→tonic · leading tone = half-step magnet into tonic',
      'subdominant = move away · supertonic = sets up dominant · mediant/submediant = color/tonic-substitute',
    ],
  },
  T4_DEGREES: {
    primer: ['10 questions. Identify degree names across a wider register. Need 8/10.'],
  },
  S8_DEGREE_INTERVALS: {
    primer: [
      'In a major scale, each degree is a fixed interval above tonic:',
      '1=P1 · 2=M2 · 3=M3 · 4=P4 · 5=P5 · 6=M6 · 7=M7.',
      'Listen tonic → target and name the interval label.',
    ],
    tips: ['This is the bridge between “degrees in a key” and “intervals from any root”.'],
  },
  T8_DEGREE_INTERVALS: {
    primer: ['10 questions. Mixed keys + wider register (G2 and up). Need 8/10 to pass.'],
  },
};

export function stationCopy(id: StationId): StationCopy | null {
  return COPY[id] ?? null;
}

import type { StationId } from './progress';

export type Station = {
  id: StationId;
  title: string;
  blurb: string;
  kind: 'lesson' | 'test';
};

export const STATIONS: Station[] = [
  {
    id: 'S1_NOTES',
    title: 'Station 1 — Note names & accidentals',
    blurb: 'Single notes, sharps/flats, and reading as “piano geometry”.',
    kind: 'lesson',
  },
  {
    id: 'T1_NOTES',
    title: 'Test 1 — Notes & accidentals',
    blurb: 'Mixed-register check: name notes across a wider range.',
    kind: 'test',
  },
  {
    id: 'S2_MAJOR_SCALE',
    title: 'Station 2 — Major scale by sound',
    blurb: 'WWHWWWH + build scale notes with correct spelling rules.',
    kind: 'lesson',
  },
  {
    id: 'T2_MAJOR_SCALE',
    title: 'Test 2 — Major scale spelling',
    blurb: 'Quick check: identify scale degrees in different keys.',
    kind: 'test',
  },
  {
    id: 'S3_INTERVALS',
    title: 'Station 3 — Intervals',
    blurb: 'Intervals from the root + minor/aug/dim as ± semitones.',
    kind: 'lesson',
  },
  {
    id: 'T3_INTERVALS',
    title: 'Test 3 — Interval recognition',
    blurb: 'Name the interval by ear (m3, P5, etc.) across a wider range.',
    kind: 'test',
  },
  {
    id: 'S4_TRIADS',
    title: 'Station 4 — Triad qualities',
    blurb: 'Build triads; major/minor/dim; recognize by ear.',
    kind: 'lesson',
  },
  {
    id: 'S5_DIATONIC_TRIADS',
    title: 'Station 5 — Diatonic triads in a key',
    blurb: 'Stack 1-3-5 inside the scale: I ii iii IV V vi vii°.',
    kind: 'lesson',
  },
  {
    id: 'S6_FUNCTIONS',
    title: 'Station 6 — Chord function families',
    blurb: 'Group diatonic triads into tonic / subdominant / dominant (tension).',
    kind: 'lesson',
  },
  {
    id: 'S7_DEGREES',
    title: 'Station 7 — Scale degree roles',
    blurb: 'Tonic, supertonic, mediant… learn the names and “job” of each degree.',
    kind: 'lesson',
  },
  {
    id: 'T4_DEGREES',
    title: 'Test 4 — Degree names',
    blurb: 'Quick check: identify degree names in different keys (wider register).',
    kind: 'test',
  },
];

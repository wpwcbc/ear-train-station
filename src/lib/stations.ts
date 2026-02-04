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
    id: 'S4_TRIADS',
    title: 'Station 4 — Triad qualities',
    blurb: 'Build triads; major/minor/dim; recognize by ear.',
    kind: 'lesson',
  },
];

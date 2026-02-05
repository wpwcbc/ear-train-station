export type SectionId = 'NOTES' | 'MAJOR_SCALE' | 'INTERVALS' | 'TRIADS' | 'FUNCTION';

export type Section = {
  id: SectionId;
  title: string;
  blurb: string;
  color: string; // mini-metro inspired route color
};

export const SECTIONS: Section[] = [
  {
    id: 'NOTES',
    title: 'Notes — listening, reading, playing',
    blurb: 'Start from zero: names, staff, accidentals. End with a section exam.',
    color: '#E84C3D',
  },
  {
    id: 'MAJOR_SCALE',
    title: 'Major scale',
    blurb: 'Sound-first major scale, WWHWWWH, and correct spelling rules.',
    color: '#2D7DD2',
  },
  {
    id: 'INTERVALS',
    title: 'Intervals',
    blurb: 'Hear + name intervals; derive by ± semitones; in-key recognition.',
    color: '#27AE60',
  },
  {
    id: 'TRIADS',
    title: 'Triads & qualities',
    blurb: 'Build triads, diatonic triads in key, and quality recognition.',
    color: '#F2C94C',
  },
  {
    id: 'FUNCTION',
    title: 'Chord functions',
    blurb: 'Tonic / Subdominant / Dominant families and tension → resolution.',
    color: '#9B51E0',
  },
];

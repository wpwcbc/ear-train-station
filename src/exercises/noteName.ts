import { mulberry32, shuffle, uniq } from '../lib/rng';

export type NoteSpelling = {
  sharp: string;
  flat: string;
  isEnharmonic: boolean;
};

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

export function spellPitchClass(pc: number): NoteSpelling {
  const i = ((pc % 12) + 12) % 12;
  const sharp = SHARP_NAMES[i];
  const flat = FLAT_NAMES[i];
  return { sharp, flat, isEnharmonic: sharp !== flat };
}

export type NoteNameQuestion = {
  midi: number;
  pc: number;
  acceptedAnswers: string[]; // e.g. ["C#", "Db"]
  promptLabel: string; // for feedback
  choices: string[]; // multiple-choice options, includes at least one accepted answer
};

function buildChoicesForPitchClass(opts: { seed: number; pc: number; choiceCount: number }) {
  const rng = mulberry32(opts.seed);
  const pc = ((opts.pc % 12) + 12) % 12;

  const spell = spellPitchClass(pc);
  const acceptedAnswers = spell.isEnharmonic ? [spell.sharp, spell.flat] : [spell.sharp];
  const promptLabel = spell.isEnharmonic ? `${spell.sharp} / ${spell.flat}` : spell.sharp;

  // Build distractors from pitch classes (so labels remain musically meaningful).
  const pcs = Array.from({ length: 12 }, (_, i) => i);
  const distractorPcs = shuffle(
    pcs.filter((x) => x !== pc),
    rng,
  );

  const choicePool: string[] = [];
  // Include at least one correct spelling in the visible choices.
  choicePool.push(acceptedAnswers[Math.floor(rng() * acceptedAnswers.length)]);

  for (const dpc of distractorPcs) {
    const s = spellPitchClass(dpc);
    // Mix sharps/flats in options to teach that both exist.
    const label = rng() < 0.5 ? s.sharp : s.flat;
    choicePool.push(label);
    if (uniq(choicePool).length >= opts.choiceCount) break;
  }

  const choices = shuffle(uniq(choicePool).slice(0, opts.choiceCount), rng);
  return { pc, acceptedAnswers, promptLabel, choices };
}

export function makeNoteNameQuestion(opts: {
  seed: number;
  minMidi: number;
  maxMidi: number;
  choiceCount?: number;
}): NoteNameQuestion {
  const { seed, minMidi, maxMidi } = opts;
  const choiceCount = opts.choiceCount ?? 4;
  const rng = mulberry32(seed);

  const span = Math.max(1, maxMidi - minMidi + 1);
  const midi = minMidi + Math.floor(rng() * span);
  const pc = ((midi % 12) + 12) % 12;

  const built = buildChoicesForPitchClass({ seed, pc, choiceCount });
  return { midi, ...built };
}

export function makeNoteNameReviewQuestion(opts: { seed: number; midi: number; choiceCount?: number }): NoteNameQuestion {
  const choiceCount = opts.choiceCount ?? 4;
  const midi = opts.midi;
  const pc = ((midi % 12) + 12) % 12;

  const built = buildChoicesForPitchClass({ seed: opts.seed, pc, choiceCount });
  return { midi, ...built };
}

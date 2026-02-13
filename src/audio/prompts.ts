import { piano } from './piano';

export async function playNoteSequence(
  midis: number[],
  opts?: {
    durationSec?: number;
    velocity?: number;
    gapMs?: number;
  },
) {
  const durationSec = opts?.durationSec ?? 0.55;
  const velocity = opts?.velocity ?? 0.9;
  const gapMs = opts?.gapMs ?? 120;

  for (let i = 0; i < midis.length; i++) {
    const m = midis[i];
    if (m == null) continue;
    await piano.playMidi(m, { durationSec, velocity });
    if (i !== midis.length - 1) await new Promise((r) => setTimeout(r, gapMs));
  }
}


export async function playIntervalPrompt(
  rootMidi: number,
  targetMidi: number,
  opts?: {
    mode?: 'melodic' | 'harmonic';
    rootDurationSec?: number;
    targetDurationSec?: number;
    velocity?: number;
    gapMs?: number;
  },
) {
  const mode = opts?.mode ?? 'melodic';
  const rootDurationSec = opts?.rootDurationSec ?? 0.7;
  const targetDurationSec = opts?.targetDurationSec ?? 0.95;
  const velocity = opts?.velocity ?? 0.9;
  const gapMs = opts?.gapMs ?? 320;

  if (mode === 'harmonic') {
    // Harmonic interval: play both notes at once.
    await piano.playChord([rootMidi, targetMidi], { mode: 'block', durationSec: targetDurationSec, velocity });
    return;
  }

  // Melodic interval: root then target.
  await piano.playMidi(rootMidi, { durationSec: rootDurationSec, velocity });
  await new Promise((r) => setTimeout(r, gapMs));
  await piano.playMidi(targetMidi, { durationSec: targetDurationSec, velocity });
}

export async function playTonicTargetPrompt(
  tonicMidi: number,
  targetMidi: number,
  opts?: {
    tonicDurationSec?: number;
    targetDurationSec?: number;
    velocity?: number;
    gapMs?: number;
  },
) {
  const tonicDurationSec = opts?.tonicDurationSec ?? 0.7;
  const targetDurationSec = opts?.targetDurationSec ?? 0.9;
  const velocity = opts?.velocity ?? 0.9;
  const gapMs = opts?.gapMs ?? 260;

  await piano.playMidi(tonicMidi, { durationSec: tonicDurationSec, velocity });
  await new Promise((r) => setTimeout(r, gapMs));
  await piano.playMidi(targetMidi, { durationSec: targetDurationSec, velocity: Math.min(1, velocity + 0.02) });
}

export async function playRootThenChordPrompt(
  chordMidis: number[],
  opts?: {
    mode?: 'block' | 'arp';
    rootDurationSec?: number;
    chordDurationSec?: number;
    velocity?: number;
    gapBeforeChordMs?: number;
    gapMs?: number;
  },
) {
  const rootMidi = chordMidis[0];
  const rootDurationSec = opts?.rootDurationSec ?? 0.65;
  const chordDurationSec = opts?.chordDurationSec ?? 1.1;
  const velocity = opts?.velocity ?? 0.92;
  const gapBeforeChordMs = opts?.gapBeforeChordMs ?? 240;
  const mode = opts?.mode ?? 'arp';
  const gapMs = opts?.gapMs ?? 130;

  await piano.playMidi(rootMidi, { durationSec: rootDurationSec, velocity: Math.min(1, velocity) });
  await new Promise((r) => setTimeout(r, gapBeforeChordMs));
  await piano.playChord(chordMidis, { mode, durationSec: chordDurationSec, velocity, gapMs });
}

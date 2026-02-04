import Soundfont from 'soundfont-player';

// Minimal piano wrapper.
// Uses Soundfont (WebAudio) so we can swap to Tone.Sampler later if desired.

export type Piano = {
  playMidi: (midi: number, opts?: { durationSec?: number; velocity?: number }) => Promise<void>;
  playChord: (
    midis: number[],
    opts?: { durationSec?: number; velocity?: number; mode?: 'block' | 'arp'; gapMs?: number },
  ) => Promise<void>;
};

let pianoPromise: Promise<Soundfont.Player> | null = null;

async function getPianoPlayer() {
  if (pianoPromise) return pianoPromise;

  const w = window as unknown as { webkitAudioContext?: typeof AudioContext };
  const AudioContextCtor = window.AudioContext || w.webkitAudioContext;
  if (!AudioContextCtor) throw new Error('WebAudio AudioContext not available');
  const ctx: AudioContext = new AudioContextCtor();

  // Common, permissive CDN location. If this breaks, we can vendor the .js/.sf2 later.
  const soundfontUrl = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/';

  pianoPromise = Soundfont.instrument(ctx, 'acoustic_grand_piano', {
    soundfont: 'FluidR3_GM',
    nameToUrl: (name: string, _sf: string, format: string) => {
      // soundfont-player passes format like 'mp3'/'ogg'
      // The midi-js-soundfonts repo uses: <instrument>-<format>.js that loads base64 samples.
      return `${soundfontUrl}${name}-${format}.js`;
    },
  });

  return pianoPromise;
}

export const piano: Piano = {
  async playMidi(midi, opts) {
    const p = await getPianoPlayer();
    const durationSec = opts?.durationSec ?? 1.0;
    const velocity = opts?.velocity ?? 0.9;
    // Ensure context is started (some browsers require a user gesture; our UI uses clicks).
    try {
      const ctx = (p as unknown as { context?: AudioContext }).context;
      if (ctx && ctx.state === 'suspended') await ctx.resume();
    } catch {
      // ignore
    }
    (p as unknown as { play: (midi: number, when: number, opts: { gain: number; duration: number }) => void }).play(
      midi,
      0,
      { gain: velocity, duration: durationSec },
    );
  },

  async playChord(midis, opts) {
    const p = await getPianoPlayer();
    const durationSec = opts?.durationSec ?? 1.2;
    const velocity = opts?.velocity ?? 0.9;
    const mode = opts?.mode ?? 'block';
    const gapMs = opts?.gapMs ?? 120;

    try {
      const ctx = (p as unknown as { context?: AudioContext }).context;
      if (ctx && ctx.state === 'suspended') await ctx.resume();
    } catch {
      // ignore
    }

    const play = (p as unknown as {
      play: (midi: number, when: number, opts: { gain: number; duration: number }) => void;
    }).play;

    if (mode === 'block') {
      for (const m of midis) play(m, 0, { gain: velocity, duration: durationSec });
      return;
    }

    // Arpeggiate (root->3rd->5th) with a small gap.
    for (let i = 0; i < midis.length; i++) {
      play(midis[i], 0, { gain: velocity, duration: Math.max(0.2, durationSec - i * 0.1) });
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, gapMs));
    }
  },
};

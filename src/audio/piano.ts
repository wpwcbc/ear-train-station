import Soundfont from 'soundfont-player';

// Minimal piano wrapper.
// Uses Soundfont (WebAudio) so we can swap to Tone.Sampler later if desired.

export type Piano = {
  playMidi: (midi: number, opts?: { durationSec?: number; velocity?: number }) => Promise<void>;
};

let pianoPromise: Promise<Soundfont.Player> | null = null;

async function getPianoPlayer() {
  if (pianoPromise) return pianoPromise;

  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
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
      const ctx = (p as any).context as AudioContext | undefined;
      if (ctx && ctx.state === 'suspended') await ctx.resume();
    } catch {
      // ignore
    }
    (p as any).play(midi, 0, { gain: velocity, duration: durationSec });
  },
};

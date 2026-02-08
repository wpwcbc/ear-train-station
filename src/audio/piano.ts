import Soundfont from 'soundfont-player';
import { loadSettings } from '../lib/settings';

// Minimal piano wrapper.
// Uses Soundfont (WebAudio) so we can swap to Tone.Sampler later if desired.

export type Piano = {
  playMidi: (midi: number, opts?: { durationSec?: number; velocity?: number }) => Promise<void>;
  playChord: (
    midis: number[],
    opts?: { durationSec?: number; velocity?: number; mode?: 'block' | 'arp'; gapMs?: number },
  ) => Promise<void>;
};

// Trigger instrument fetch/parse early (best-effort). Useful for first-tap latency on mobile.
export async function warmupPiano(): Promise<void> {
  const p = await getPianoPlayer();
  try {
    const ctx = (p as unknown as { context?: AudioContext }).context;
    if (ctx && ctx.state === 'suspended') await ctx.resume();
  } catch {
    // ignore
  }
}

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
    const volume = loadSettings().volume;
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
      { gain: Math.max(0, Math.min(1, velocity * volume)), duration: durationSec },
    );
  },

  async playChord(midis, opts) {
    const p = await getPianoPlayer();
    const durationSec = opts?.durationSec ?? 1.2;
    const velocity = opts?.velocity ?? 0.9;
    const volume = loadSettings().volume;
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

    const gain = (v: number) => Math.max(0, Math.min(1, v * volume));

    if (mode === 'block') {
      for (const m of midis) play(m, 0, { gain: gain(velocity), duration: durationSec });
      return;
    }

    // Arpeggiate (root->3rd->5th) with a small gap.
    // Use WebAudio scheduling ("when" offsets) instead of awaiting between notes,
    // so timing stays stable even if the main thread stutters.
    const gapSec = gapMs / 1000;
    let lastStartSec = 0;

    for (let i = 0; i < midis.length; i++) {
      const m = midis[i];
      if (m == null) continue;
      const when = i * gapSec;
      lastStartSec = Math.max(lastStartSec, when);
      play(m, when, { gain: gain(velocity), duration: Math.max(0.2, durationSec - i * 0.1) });
    }

    // Resolve after the last note has had time to play out.
    const totalMs = Math.max(0, Math.round((lastStartSec + durationSec) * 1000));
    await new Promise((r) => setTimeout(r, totalMs));
  },
};

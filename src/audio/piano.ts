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

type PrefetchResult = {
  urls: string[];
  fetched: string[];
  cached: string[];
  errors: Array<{ url: string; error: string }>;
};

function dispatchAudioLocked(reason?: string) {
  try {
    window.dispatchEvent(new CustomEvent('kuku:audiolocked', { detail: { reason } }));
  } catch {
    // ignore
  }
}

async function ensureContextRunning(p: Soundfont.Player): Promise<boolean> {
  try {
    const ctx = (p as unknown as { context?: AudioContext }).context;
    if (!ctx) return true;
    if (ctx.state === 'suspended') await ctx.resume();
    if (ctx.state !== 'running') {
      dispatchAudioLocked(`AudioContext state: ${ctx.state}`);
      return false;
    }
    return true;
  } catch (e) {
    dispatchAudioLocked(e instanceof Error ? e.message : 'AudioContext resume failed');
    return false;
  }
}

function getPianoSoundfontUrls(): string[] {
  // We cache both formats. soundfont-player will choose the right one at runtime.
  // Prefetching both increases the chance of offline readiness across browsers.
  const base = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/';
  const name = 'acoustic_grand_piano';
  return [`${base}${name}-mp3.js`, `${base}${name}-ogg.js`];
}

export async function getPianoSoundfontCacheStatus(): Promise<{ cached: number; total: number; urls: string[] }> {
  const urls = getPianoSoundfontUrls();
  try {
    if (!('caches' in window)) return { cached: 0, total: urls.length, urls };
    const cache = await caches.open('soundfonts');
    let cached = 0;
    for (const url of urls) {
      const res = await cache.match(url);
      if (res) cached++;
    }
    return { cached, total: urls.length, urls };
  } catch {
    // Cache name may differ per Workbox revision; best-effort only.
    return { cached: 0, total: urls.length, urls };
  }
}

export async function clearPianoSoundfontCache(): Promise<boolean> {
  try {
    if (!('caches' in window)) return false;
    // We use a dedicated cache for these soundfont payloads.
    // Deleting and recreating keeps behavior deterministic.
    const ok = await caches.delete('soundfonts');
    return ok;
  } catch {
    return false;
  }
}

// Trigger instrument fetch/parse early (best-effort). Useful for first-tap latency on mobile.
export async function warmupPiano(): Promise<void> {
  const p = await getPianoPlayer();
  await ensureContextRunning(p);
}

// Explicitly prefetch and cache the piano soundfont payload(s) so offline sessions work.
// Uses Cache API directly so it works even before Workbox routes are hit.
export async function prefetchPianoSoundfonts(): Promise<PrefetchResult> {
  const urls = getPianoSoundfontUrls();
  const result: PrefetchResult = { urls, fetched: [], cached: [], errors: [] };

  let cache: Cache | null = null;
  try {
    if ('caches' in window) cache = await caches.open('soundfonts');
  } catch {
    cache = null;
  }

  await Promise.all(
    urls.map(async (url) => {
      try {
        // Try cache first.
        if (cache) {
          const hit = await cache.match(url);
          if (hit) {
            result.cached.push(url);
            return;
          }
        }

        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        result.fetched.push(url);

        // Store a clone in cache (if available). If SW is active, it may also populate.
        if (cache) {
          await cache.put(url, res.clone());
          result.cached.push(url);
        }
      } catch (e) {
        result.errors.push({ url, error: e instanceof Error ? e.message : String(e) });
      }
    }),
  );

  return result;
}

let pianoPromise: Promise<Soundfont.Player> | null = null;
let pianoCtx: AudioContext | null = null;

export function getPianoContextState(): AudioContextState | 'uninitialized' {
  return pianoCtx?.state ?? 'uninitialized';
}

export async function resumePianoContextBestEffort(): Promise<boolean> {
  try {
    const ctx = pianoCtx;
    if (!ctx) return true;
    if (ctx.state === 'suspended') await ctx.resume();
    if (ctx.state !== 'running') {
      dispatchAudioLocked(`AudioContext state: ${ctx.state}`);
      return false;
    }
    return true;
  } catch (e) {
    dispatchAudioLocked(e instanceof Error ? e.message : 'AudioContext resume failed');
    return false;
  }
}

async function getPianoPlayer() {
  if (pianoPromise) return pianoPromise;

  const w = window as unknown as { webkitAudioContext?: typeof AudioContext };
  const AudioContextCtor = window.AudioContext || w.webkitAudioContext;
  if (!AudioContextCtor) throw new Error('WebAudio AudioContext not available');
  const ctx: AudioContext = new AudioContextCtor();
  pianoCtx = ctx;

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
    // Ensure context is started (some browsers require a user gesture).
    const ok = await ensureContextRunning(p);
    if (!ok) return;

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

    const ok = await ensureContextRunning(p);
    if (!ok) return;

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

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

type PrefetchOpts = {
  // If true, re-fetch even if entries already exist in Cache API.
  // Useful when the CDN payload updates or the cache became corrupted.
  force?: boolean;
};

const PIANO_SOUNDFONT_META_KEY = 'kuku:pianoSoundfontCacheMeta';

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

function getPreferredAudioFormats(): Array<'mp3' | 'ogg'> {
  // Keep this conservative. iOS Safari in particular can be weird with canPlayType()
  // and definitely won’t play .ogg JS payloads from midi-js-soundfonts.
  //
  // In practice:
  // - Safari/iOS: mp3
  // - Chromium/Firefox: ogg is usually fine (smaller) but mp3 is also fine.
  try {
    if (typeof document === 'undefined') return ['mp3', 'ogg'];
    const a = document.createElement('audio');

    const ogg = a.canPlayType('audio/ogg; codecs="vorbis"');
    if (ogg === 'probably' || ogg === 'maybe') return ['ogg', 'mp3'];

    const mp3 = a.canPlayType('audio/mpeg; codecs="mp3"') || a.canPlayType('audio/mpeg');
    if (mp3 === 'probably' || mp3 === 'maybe') return ['mp3'];

    // Last resort: try both.
    return ['mp3', 'ogg'];
  } catch {
    return ['mp3', 'ogg'];
  }
}

function getPianoSoundfontUrls(): string[] {
  // Only prefetch the formats the browser is likely to actually use.
  // This reduces storage pressure (important on iOS PWA) while keeping a fallback.
  const base = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/';
  const name = 'acoustic_grand_piano';
  const formats = getPreferredAudioFormats();
  return formats.map((fmt) => `${base}${name}-${fmt}.js`);
}

const PIANO_SOUNDFONT_CACHE = 'kuku-soundfonts-v1';
// Before 2026-02-09, Workbox runtimeCaching used this cache name. Keep it for migration.
const LEGACY_PIANO_SOUNDFONT_CACHE = 'soundfonts';

export function getPianoSoundfontCacheMeta(): { updatedAtMs: number } | null {
  try {
    const raw = window.localStorage.getItem(PIANO_SOUNDFONT_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { updatedAtMs?: unknown };
    if (typeof parsed.updatedAtMs !== 'number') return null;
    return { updatedAtMs: parsed.updatedAtMs };
  } catch {
    return null;
  }
}

function setPianoSoundfontCacheMeta(meta: { updatedAtMs: number } | null) {
  try {
    if (!meta) window.localStorage.removeItem(PIANO_SOUNDFONT_META_KEY);
    else window.localStorage.setItem(PIANO_SOUNDFONT_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore
  }
}

export async function getPianoSoundfontCacheStatus(): Promise<{ cached: number; total: number; urls: string[] }> {
  const urls = getPianoSoundfontUrls();
  try {
    if (!('caches' in window)) return { cached: 0, total: urls.length, urls };

    // Prefer the versioned cache, but count legacy entries too so older installs still show status.
    const cache = await caches.open(PIANO_SOUNDFONT_CACHE);
    let legacy: Cache | null = null;
    try {
      legacy = await caches.open(LEGACY_PIANO_SOUNDFONT_CACHE);
    } catch {
      legacy = null;
    }

    let cached = 0;
    for (const url of urls) {
      const res = (await cache.match(url)) ?? (legacy ? await legacy.match(url) : undefined);
      if (res) cached++;
    }

    return { cached, total: urls.length, urls };
  } catch {
    // Best-effort only.
    return { cached: 0, total: urls.length, urls };
  }
}

export async function getPianoSoundfontCacheSizeBytes(): Promise<number | null> {
  const urls = getPianoSoundfontUrls();
  try {
    if (!('caches' in window)) return null;

    const cache = await caches.open(PIANO_SOUNDFONT_CACHE);
    let legacy: Cache | null = null;
    try {
      legacy = await caches.open(LEGACY_PIANO_SOUNDFONT_CACHE);
    } catch {
      legacy = null;
    }

    let total = 0;
    for (const url of urls) {
      const res = (await cache.match(url)) ?? (legacy ? await legacy.match(url) : undefined);
      if (!res) continue;
      // These are small in count (2 files), so blob() is acceptable in Settings UI.
      const b = await res.clone().blob();
      total += b.size;
    }

    return total;
  } catch {
    return null;
  }
}

export async function clearPianoSoundfontCache(): Promise<boolean> {
  try {
    setPianoSoundfontCacheMeta(null);
    if (!('caches' in window)) return false;
    // Deterministic clear; also cleans up the legacy cache name.
    const [ok1, ok2] = await Promise.all([
      caches.delete(PIANO_SOUNDFONT_CACHE),
      caches.delete(LEGACY_PIANO_SOUNDFONT_CACHE),
    ]);
    return ok1 || ok2;
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
export async function prefetchPianoSoundfonts(opts?: PrefetchOpts): Promise<PrefetchResult> {
  const urls = getPianoSoundfontUrls();
  const result: PrefetchResult = { urls, fetched: [], cached: [], errors: [] };
  const force = opts?.force ?? false;

  let cache: Cache | null = null;
  let legacy: Cache | null = null;
  try {
    if ('caches' in window) {
      cache = await caches.open(PIANO_SOUNDFONT_CACHE);
      try {
        legacy = await caches.open(LEGACY_PIANO_SOUNDFONT_CACHE);
      } catch {
        legacy = null;
      }
    }
  } catch {
    cache = null;
    legacy = null;
  }

  // If an older install has entries in the legacy Workbox cache, migrate them forward so:
  // - Settings status is accurate
  // - the current SW/runtimeCaching (which now uses PIANO_SOUNDFONT_CACHE) can serve them offline.
  if (cache && legacy) {
    await Promise.all(
      urls.map(async (url) => {
        try {
          const already = await cache.match(url);
          if (already) return;
          const hit = await legacy.match(url);
          if (hit) await cache.put(url, hit);
        } catch {
          // Best-effort only.
        }
      }),
    );
  }

  await Promise.all(
    urls.map(async (url) => {
      try {
        // Try cache first (unless forced). Fall back to legacy cache if present.
        if (!force) {
          if (cache) {
            const hit = await cache.match(url);
            if (hit) {
              result.cached.push(url);
              return;
            }
          }
          if (legacy) {
            const hit = await legacy.match(url);
            if (hit) {
              // Also copy it forward so future loads use the new cache name.
              if (cache) await cache.put(url, hit);
              result.cached.push(url);
              return;
            }
          }
        }

        const res = await fetch(url, { mode: 'cors', cache: force ? 'reload' : 'default' });
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

  // If we made it here, consider the cache “updated” even if some URLs were already present.
  // (This timestamp is mainly a UX hint in Settings.)
  if (result.errors.length === 0 && result.cached.length > 0) {
    setPianoSoundfontCacheMeta({ updatedAtMs: Date.now() });
  }

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

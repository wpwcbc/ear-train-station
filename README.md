# Ear Train Station

A small web ear‑training app built with **React + TypeScript + Vite**.

## Dev

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Quality checks

```bash
npm run lint
npm run audit:register
```

## Pedagogy notes (current)

### Chord prompts: arpeggios first, block chords for checks

- **Lessons** default to **arpeggiated** chord prompts (broken chords), because it’s easier to hear chord tones one-by-one.
- **Tests / exams / review** default to **block chords** (simultaneous), to check true harmonic recognition.

Quick definitions (nice phrasing from Theta Music Trainer): arpeggios are chord tones played one after another; block chords are all notes at once.
- https://trainer.thetamusic.com/en/content/arpeggios

### Register rules

- **Lessons:** stable register (one octave around middle C).
- **Tests / exams / drills:** wider register (and **never below G2**).

Source of truth lives in `src/lib/registerPolicy.ts`:
- `STABLE_REGISTER_MIN_MIDI` / `STABLE_REGISTER_MAX_MIDI`
- `stableTonicMidi(tonicPc)` (lesson tonic aligned to stable register)
- `stableRegisterWhiteMidis()` (for beginner-friendly note-name lessons)
- `WIDE_REGISTER_MIN_MIDI` (G2)

Rule of thumb: avoid hardcoding `60–71` or other magic MIDI ranges inside stations/exercises; import the policy constants instead.

## UI constraints

- Keep *knowledge-only* surfaces clean.
- Settings live behind the **⚙️** config icon.
- Review is spaced by default; if nothing is due you can still run a short **Warm‑up** set (practice early) from your queue.
- Review → **Manage mistakes** shows examples with due/streak meta; you can **Snooze 1h** (defer) or Remove (with Undo) to keep the queue healthy.

## Mobile / iOS notes

- We use `env(safe-area-inset-*)` for Focus Mode + bottom UI spacing.
- iOS needs `viewport-fit=cover` in the viewport meta tag for those safe-area insets to work reliably.
- WebAudio can get **suspended** when the tab is backgrounded; on return we do a best-effort resume, and if it stays paused we show a subtle toast (“Sound is paused — tap anywhere to enable”).

## PWA icons

- Manifest includes the minimal **192x192** + **512x512** PNG icons + an `apple-touch-icon`.
- Regenerate via:

```bash
npm run gen:icons
```

## PWA behavior (updates + caching)

- We use an **in-app update prompt** ("Update available → Reload") so the app doesn’t silently refresh mid-lesson.
- The service worker also **runtime-caches** the external **piano soundfont JS** payloads (FluidR3 GM from `gleitz.github.io`) to make repeat sessions faster and more offline-friendly.
- In **⚙️ Settings → Audio**, there’s an **Offline piano** section:
  - **Download**: prefetches the **preferred format** payloads into a versioned Cache API bucket (usually `*-ogg.js` on Chromium/Firefox; `*-mp3.js` on Safari/iOS). This is user-initiated, so we don’t auto-download large assets on first load.
  - **Update**: re-downloads and overwrites cached payloads (useful if the cache is corrupted or the CDN payload changed).
  - **Clear**: deletes the cache so you can start fresh.
  - **Keep**: requests **persistent storage** (`navigator.storage.persist()`), which helps prevent eviction in some browsers (support varies; iOS may ignore it).
  - UI also shows **approx cache size** + (when available) the browser’s **storage usage/quota**.
  - Note: on iOS, PWA storage can be **evicted by the OS** (especially if the app isn’t used for a while), so Offline piano is a best-effort acceleration — not a guarantee.

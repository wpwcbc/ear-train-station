# Ear Train Station

[![CI](https://github.com/wpwcbc/ear-train-station/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/wpwcbc/ear-train-station/actions/workflows/ci.yml)

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
npm test
```

## CI (GitHub Actions)

The CI workflow runs on every push/PR:
- `npm ci`
- `npm run lint`
- `npm run audit:register`
- `npm test`
- `npm run build`

To reproduce locally:

```bash
npm ci
npm run lint
npm run audit:register
npm test
npm run build
```

## Pedagogy notes (current)

### Chord prompts: arpeggios first, block chords for checks

- **Lessons** default to **arpeggiated** chord prompts (broken chords), because it’s easier to hear chord tones one-by-one.
- **Tests / exams / review** default to **block chords** (simultaneous), to check true harmonic recognition.

Quick definitions (nice phrasing from Theta Music Trainer): arpeggios are chord tones played one after another; block chords are all notes at once.
- https://trainer.thetamusic.com/en/content/arpeggios

### Immediate correction replay (interval stations)

When you miss an interval identification item (tests/exams/drills), the app **auto-replays the correct interval once** after a short delay.

Optional (⚙️): you can also enable **replay correct + retry the same question once** after a miss (a short, GuitarOrb-ish correction loop).

Why:
- Fast error-correction loop: the ear immediately hears the “right” reference, not just a red X.
- A single immediate retest helps you “close the loop” while the sound is still in working memory.
- Keeps the surface knowledge-only (no extra modals), but still nudges learning.

Comparable patterns / references:
- GuitarOrb interval trainer mentions a mode to “Play Mistake then Try Again”: 
  - https://www.guitarorb.com/interval-ear-trainer
- EarMaster emphasizes real-time feedback and targeted practice:
  - https://www.earmaster.com/
- Musical U interval drills: hear the correct answer + get a chance to hear the interval again:
  - https://www.musical-u.com/learn/topic/ear-training/intervals/
- Duolingo on learning science (active recall + spaced repetition):
  - https://blog.duolingo.com/spaced-repetition-for-learning/

Implementation notes:
- Interval stations keep a lightweight **miss histogram** (+ last-missed timestamp) in `localStorage` (separate from the capped/de-duped review queue).
- This powers the end-of-test “most missed” summary and the **Targeted mix** (weighted practice). Recency gets a tiny boost so targeted practice feels responsive, while long-term frequency still dominates.
- In practice mode, correct answers gently **cool down** that interval’s miss count (−1) so targeted mixes can adapt as you improve.
- If ⚙️ “Intervals: replay correct + retry once” is enabled, the **first miss** replays the correction and offers one immediate retest; we only advance the question / increment wrong-hearts after the retest is used.
- End-of-test now also has an **All miss stats** expander: one-tap drill any interval you’ve missed (top 12 shown), plus a **Review top 5** shortcut to practice your biggest misses as a focused set.
- When you enter practice from the end-of-test summary, the header shows what mode you’re in (focused vs targeted) + gives you **Clear focus** and **Exit practice**.
- If the weighting feels stale after you improve, you can **clear interval miss stats** from ⚙️ (station-scoped).

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
- Lessons can optionally enable **Retry once on mistakes** (Twist items) from **⚙️**.
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

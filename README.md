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

### Learn path UX (Duolingo-ish)

- Section exam pages can be **locked** until prerequisite stations are complete.
- When an exam is locked, the section page shows a clear **Next up** CTA (deep-link to the first missing station), so the Learn flow never becomes a dead-end.

### Review completion screen (Duolingo-ish)

- Review/Warm‑up/Drill sessions end with a small **completion recap** (accuracy, XP, top misses, and a clear next CTA).
- Keyboard: when the completion card appears, focus moves to the **primary CTA**; chips/CTAs have visible `:focus-visible` styles.
- Keyboard shortcuts (press **?** anywhere — on hub pages it shows the basics; on training screens it shows the full list):
  - **Space / Enter** = Play / Hear
  - **Backspace** = Skip (Review) / Next or Restart (stations)
  - **1–9** = choose an answer
  - **?** = show keyboard shortcuts help (also available via the top-left **?** button on desktop, and the floating **?** button on mobile)
  - **Esc** = close the shortcuts/help overlay
- On short mobile viewports, the completion card body may **scroll internally** so the CTAs remain reachable.

### Chord prompts: arpeggios first, block chords for checks

- **Lessons** default to **arpeggiated** chord prompts (broken chords), because it’s easier to hear chord tones one-by-one.
- **Tests / exams / review** default to **block chords** (simultaneous), to check true harmonic recognition.

Quick definitions (nice phrasing from Theta Music Trainer): arpeggios are chord tones played one after another; block chords are all notes at once.
- https://trainer.thetamusic.com/en/content/arpeggios

### Immediate correction replay (interval stations)

When you miss an interval identification item (tests/exams/drills), the app **auto-replays the correct interval once** after a short delay.

Optional (⚙️): you can also enable **replay correct + retry the same question once** after a miss (a short, GuitarOrb-ish correction loop).

Optional (⚙️): you can choose **interval prompt style**:
- **Melodic** (two notes in sequence)
- **Harmonic** (both notes together)

Harmonic tips (quick): harmonic intervals often feel harder because you hear one fused “sonority”. Try anchoring the bottom note, then sing/hum the top note to separate the sound.

In interval stations, when you’re in **Harmonic** prompt style, you can tap **Harmonic tips** (or press **H**) for a short trainer-style cheat sheet.

References:
- Musical U (harmonic interval practice tips): https://www.musical-u.com/learn/how-can-i-improve-at-harmonic-intervals/
- Theta Music Trainer (harmonic interval drill): https://trainer.thetamusic.com/en/content/html5-harmonic-intervals

Optional (⚙️): **Harmonic helper** — when prompt style is Harmonic, also play a quick melodic version after the chord (a common “bridge” pattern in interval trainers).

Optional (⚙️): **Harmonic helper timing** — choose whether the melodic replay happens **always** or **only after mistakes** (during correction replay).

Optional (⚙️): **Harmonic helper delay** — control the pause between the harmonic chord and the melodic replay (helps if it feels rushed).

Comparable exercises:
- ToneDear interval ID (melodic/harmonic variants are common):
  - https://tonedear.com/ear-training/intervals
- ToneGym interval exercise (ascending/descending/harmonic/mix):
  - https://www.tonegym.co/exercise/intervals

Why:
- Fast error-correction loop: the ear immediately hears the “right” reference, not just a red X.
- A single immediate retest helps you “close the loop” while the sound is still in working memory.
- Keeps the surface knowledge-only (no extra modals), but still nudges learning.

Comparable patterns / references:
- GuitarOrb interval trainer mentions a mode to “Play Mistake then Try Again”: 
  - https://www.guitarorb.com/interval-ear-trainer
- EarMaster emphasizes real-time feedback and targeted practice:
  - https://www.earmaster.com/
- Musical U: tips for getting better at **harmonic** intervals (incl. the idea of “very short melodic” as a bridge):
  - https://www.musical-u.com/learn/how-can-i-improve-at-harmonic-intervals/
- Musical U interval drills overview:
  - https://www.musical-u.com/learn/topic/ear-training/intervals/
- Duolingo on learning science (active recall + spaced repetition):
  - https://blog.duolingo.com/spaced-repetition-for-learning/
- Duolingo: adaptive / mistakes-focused sessions (“frontier of learning”):
  - https://blog.duolingo.com/keeping-you-at-the-frontier-of-learning-with-adaptive-lessons/

Implementation notes:
- Review mistake queue is stored in `localStorage` under `ets_mistakes_v2` (best-effort migration from `ets_mistakes_v1`).
- Because browser `storage` events don’t fire in-tab, we also emit a tiny `ets_mistakes_changed` custom event on writes so Map/Practice/Review counts update immediately.
- Interval stations keep a lightweight **miss histogram** (+ last-missed timestamp) in `localStorage` (separate from the capped/de-duped review queue).
- This powers the end-of-test “most missed” summary (now also shows roughly when you last missed each top interval) and the **Targeted mix** (weighted practice). For practice weighting, older misses gently **decay over time** (7‑day half-life) so the mix doesn’t stay anchored to ancient mistakes; recency still gets a tiny extra bump so practice feels responsive.
- In interval **tests/exams**, once you’ve missed something, a small **Targeted mix** button appears in the top meta row (near Review/Harmonic tips) for one-tap “practice your mistakes” — inspired by Duolingo’s Practice Hub idea of targeted review: https://blog.duolingo.com/how-duolingo-works-with-learners/
- In practice mode, correct answers gently **cool down** that interval’s miss count (−1) so targeted mixes can adapt as you improve.
- If ⚙️ “Intervals: replay correct + retry once” is enabled, the **first miss** replays the correction and offers one immediate retest; we only advance the question / increment wrong-hearts after the retest is used.
- End-of-test now also has an **All miss stats** expander: one-tap drill any interval you’ve missed (top 12 shown), plus a **Review top 5** shortcut to practice your biggest misses as a focused set.
- When you enter practice from the end-of-test summary, the header shows what mode you’re in (focused vs targeted) + gives you **Clear focus** and **Exit practice**.
- If the weighting feels stale after you improve, you can **clear interval miss stats** from ⚙️ (station-scoped).

### Quests: daily mini-goals + chest

- Quests are intentionally simple: they push the loop **learn → review → streak**.
- When you’ve completed all 3 quests, the **Quest chest** becomes claimable **once per day** (anti-farm).
- The Quests tab shows a small badge when there’s quest progress to do, and a stronger badge when the chest is ready (badge is hidden while you’re already on Quests).
- Quest state is stored in `localStorage` under `ets_quests_v2` (with a best-effort migration from the old `ets_quests_v1` key).
- The **Review quest** measures actual progress by counting **clears** (items removed from your due/available pool), not just attempts.
- If you have **0 Review items due/available today**, the Review quest **auto-clears** (no “impossible quest” days).
- When you open the chest, we show a tiny **reward sheet** (instead of a toast): XP count-up (disabled for **Reduce Motion**) + screen reader announces the **final** XP once (no aria-live spam).

### Register rules

- **Lessons:** stable register (one octave around middle C).
- **Tests / exams / drills:** wider register (and **never below G2** — i.e. **≥ G2**).

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
- Practice Hub links are **deep-linkable**; the UI also offers **Copy link** buttons next to workout sessions / drills so you can share or bookmark a specific practice set.
- Completing a **workout session** from Practice Hub grants a small **XP bonus** (once per session per day) — Duolingo-ish, but anti-farm.
- Review sessions show a tiny **session summary** (accuracy + right/wrong/skip + XP earned), and switching URL params (hard/station/n/warmup/drill) resets the counters so each deep-link feels like a fresh set.
- When the session completes, we show a simple **end-screen recap** (results + XP + top misses) with a one-tap **targeted drill** CTA — Duolingo-ish “what next” without adding new settings surface.
- On completion, Review/Warm‑up/Drill writes a lightweight session log to `localStorage` under `ets_review_session_history_v1` (capped, best-effort). The Profile page uses it for a tiny **Review this week** dashboard (sessions/XP/accuracy) + small “vs previous 7 days” delta chips.
- Practice workout completion is stored per day/session in `localStorage` (keys like `kuku:practiceWorkout:YYYY-MM-DD:1`). Profile surfaces a tiny **Workout this week** card (active days + streak + delta vs previous 7 days).
- Profile week charts are **keyboard friendly**: after selecting a day, use **←/→** (Home/End) to move the selection (focus follows).
- Review → **Manage mistakes** shows examples with due/streak meta; you can **Snooze 1h** (defer) or Remove (with Undo) to keep the queue healthy.

## Mobile / iOS notes

- We use `env(safe-area-inset-*)` for Focus Mode + bottom UI spacing.
- iOS needs `viewport-fit=cover` in the viewport meta tag for those safe-area insets to work reliably.
- For app-height shells, we prefer **dynamic viewport units** (`100dvh` when supported) via `--app-vh`. For older browsers, we fall back to a small JS viewport-height polyfill (`--app-vh: <innerHeight>px`) to avoid iOS Safari URL-bar overlap.
- Mobile quick actions (⚙️ + `?`) live **bottom-right above the bottom tabs** (safe-area aware) — inspired by Duolingo’s use of bottom-right floating affordances on long-scroll screens.
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

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

## Pedagogy notes (current)

### Chord prompts: arpeggios first, block chords for checks

- **Lessons** default to **arpeggiated** chord prompts (broken chords), because it’s easier to hear chord tones one-by-one.
- **Tests / exams / review** default to **block chords** (simultaneous), to check true harmonic recognition.

Quick definitions (nice phrasing from Theta Music Trainer): arpeggios are chord tones played one after another; block chords are all notes at once.
- https://trainer.thetamusic.com/en/content/arpeggios

### Register rules

- **Lessons:** stable register.
- **Tests / exams / drills:** wider register (>= G2).

## UI constraints

- Keep *knowledge-only* surfaces clean.
- Settings live behind the **⚙️** config icon.

## Mobile / iOS notes

- We use `env(safe-area-inset-*)` for Focus Mode + bottom UI spacing.
- iOS needs `viewport-fit=cover` in the viewport meta tag for those safe-area insets to work reliably.

## PWA icons

- Manifest includes the minimal **192x192** + **512x512** PNG icons + an `apple-touch-icon`.
- Regenerate via:

```bash
npm run gen:icons
```

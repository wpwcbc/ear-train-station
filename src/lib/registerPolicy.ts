// Register policy: keep lessons stable; keep tests/exams/drills wider (>= G2).
// Centralizing these constants prevents accidental drift.

// MIDI 43 == G2
export const WIDE_REGISTER_MIN_MIDI = 43;

// Keep some headroom for wider prompts while staying realistic on small speakers.
// (Not a strict rule; stations can tighten max as needed.)
export const DEFAULT_WIDE_REGISTER_MAX_MIDI = 72; // C5

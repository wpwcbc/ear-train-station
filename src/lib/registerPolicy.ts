// Register policy: keep lessons stable; keep tests/exams/drills wider (>= G2).
// Centralizing these constants prevents accidental drift.

// Stable lesson register: one octave around middle C.
// (Keeps early recognition drills consistent; later tests can widen.)
export const STABLE_REGISTER_MIN_MIDI = 60; // C4
export const STABLE_REGISTER_MAX_MIDI = 71; // B4

// Wide register: tests/exams/drills should not go below this.
// MIDI 43 == G2
export const WIDE_REGISTER_MIN_MIDI = 43;

// Keep some headroom for wider prompts while staying realistic on small speakers.
// (Not a strict rule; stations can tighten max as needed.)
export const DEFAULT_WIDE_REGISTER_MAX_MIDI = 72; // C5

import { useEffect } from 'react';

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el.isContentEditable) return true;
  return false;
}

export type HotkeyHandlers = {
  /** Space or Enter; good default for "Play". */
  onPrimary?: () => void;
  /** Optional secondary action (e.g. Next / Restart). */
  onSecondary?: () => void;
  /** Digit 1-9 answers; index is 0-based. */
  onChoiceIndex?: (idx: number) => void;
  enabled?: boolean;
};

/**
 * Lightweight Duolingo-style hotkeys:
 * - Space / Enter → primary action (usually Play)
 * - Backspace → secondary action (usually Next/Restart)
 * - 1..9 → choice buttons
 */
export function useHotkeys(handlers: HotkeyHandlers) {
  const { enabled = true, onPrimary, onSecondary, onChoiceIndex } = handlers;

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      const k = e.key;

      if ((k === ' ' || k === 'Enter') && onPrimary) {
        e.preventDefault();
        onPrimary();
        return;
      }

      if (k === 'Backspace' && onSecondary) {
        e.preventDefault();
        onSecondary();
        return;
      }

      // Digit choices
      if (/^[1-9]$/.test(k) && onChoiceIndex) {
        const idx = Number.parseInt(k, 10) - 1;
        e.preventDefault();
        onChoiceIndex(idx);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, onPrimary, onSecondary, onChoiceIndex]);
}

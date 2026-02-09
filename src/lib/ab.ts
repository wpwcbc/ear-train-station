// Tiny local-only A/B helper.
// Goal: allow copy experiments without introducing settings knobs.

export type ABVariant = 'A' | 'B';

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export function getABVariant(key: string): ABVariant {
  const storageKey = `ab:${key}`;

  type Stored = { v: ABVariant; ts: number };
  const stored = safeJsonParse<Stored>(localStorage.getItem(storageKey));
  if (stored?.v === 'A' || stored?.v === 'B') return stored.v;

  const v: ABVariant = Math.random() < 0.5 ? 'A' : 'B';
  try {
    localStorage.setItem(storageKey, JSON.stringify({ v, ts: Date.now() } satisfies Stored));
  } catch {
    // ignore (private mode / quota)
  }
  return v;
}

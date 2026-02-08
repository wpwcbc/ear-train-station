import { createContext, useContext } from 'react';

export type FocusTopBarState = {
  /** 0..1 */
  progress?: number;
  /** Optional small status text (e.g. "Twist", "Mid-test", etc.) */
  statusText?: string;
  /** Optional extra context badge (e.g. "Lesson: ARP"). */
  badge?: { text: string; title?: string };
  /** Hearts only when applicable. */
  hearts?: { current: number; max: number };
};

export type FocusUIContextValue = {
  topBar: FocusTopBarState;
  setTopBar: (next: FocusTopBarState) => void;
};

export const FocusUIContext = createContext<FocusUIContextValue | null>(null);

export function useFocusUI() {
  const ctx = useContext(FocusUIContext);
  if (!ctx) throw new Error('useFocusUI must be used inside <FocusShell>.');
  return ctx;
}

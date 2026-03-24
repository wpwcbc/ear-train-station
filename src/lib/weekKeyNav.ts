export type WeekKey = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

export function weekKeyNavNextIndex(args: { key: string; idx: number; len: number }): number | null {
  const { key, idx, len } = args;
  if (!Number.isFinite(idx) || !Number.isFinite(len)) return null;
  if (len <= 0) return null;
  if (idx < 0 || idx >= len) return null;

  let nextIdx: number | null = null;
  if (key === 'ArrowLeft') nextIdx = Math.max(0, idx - 1);
  if (key === 'ArrowRight') nextIdx = Math.min(len - 1, idx + 1);
  if (key === 'Home') nextIdx = 0;
  if (key === 'End') nextIdx = len - 1;

  if (nextIdx == null || nextIdx === idx) return null;
  return nextIdx;
}

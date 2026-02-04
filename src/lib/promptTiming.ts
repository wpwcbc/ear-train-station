import type { Settings } from './settings';

export type PromptSpeed = Settings['promptSpeed'];

export function promptSpeedLabel(s: PromptSpeed): string {
  if (s === 'slow') return 'Slow';
  if (s === 'fast') return 'Fast';
  return 'Normal';
}

export function promptSpeedFactors(speed: PromptSpeed): { dur: number; gap: number } {
  if (speed === 'slow') return { dur: 1.25, gap: 1.35 };
  if (speed === 'fast') return { dur: 0.85, gap: 0.8 };
  return { dur: 1, gap: 1 };
}

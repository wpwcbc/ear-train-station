import type { StationId } from './progress';

/**
 * Persistent lightweight stats for interval-label stations.
 *
 * Why separate from mistakes.ts?
 * - Mistake queue is capped + de-duped for review UX.
 * - For "targeted mix" we want a long-lived histogram of what the user tends to miss.
 */

type IntervalMissesBySemitone = Record<string, number>; // key is semitone number as string
type IntervalStatsV1 = Partial<Record<StationId, IntervalMissesBySemitone>>;

const KEY_V1 = 'ets_interval_stats_v1';

function safeParse(raw: string | null): IntervalStatsV1 {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object') return {};
    return v as IntervalStatsV1;
  } catch {
    return {};
  }
}

function loadAll(): IntervalStatsV1 {
  return safeParse(localStorage.getItem(KEY_V1));
}

function saveAll(v: IntervalStatsV1) {
  localStorage.setItem(KEY_V1, JSON.stringify(v));
}

export function recordIntervalMiss(stationId: StationId, semitones: number) {
  const all = loadAll();
  const bySemi: IntervalMissesBySemitone = { ...(all[stationId] ?? {}) };
  const key = String(semitones);
  const prev = typeof bySemi[key] === 'number' ? bySemi[key] : 0;
  bySemi[key] = prev + 1;
  saveAll({ ...all, [stationId]: bySemi });
}

export function loadIntervalMissHistogram(stationId: StationId): Map<number, number> {
  const all = loadAll();
  const bySemi = all[stationId] ?? {};
  const m = new Map<number, number>();
  for (const [k, v] of Object.entries(bySemi)) {
    const semi = Number(k);
    if (!Number.isFinite(semi)) continue;
    const count = typeof v === 'number' && Number.isFinite(v) ? v : 0;
    if (count > 0) m.set(semi, count);
  }
  return m;
}

export function clearIntervalMissHistogram(stationId: StationId) {
  const all = loadAll();
  const next: IntervalStatsV1 = { ...all };
  delete next[stationId];
  saveAll(next);
}

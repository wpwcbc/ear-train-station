import type { StationId } from './progress';

/**
 * Persistent lightweight stats for interval-label stations.
 *
 * Why separate from mistakes.ts?
 * - Mistake queue is capped + de-duped for review UX.
 * - For "targeted mix" we want a long-lived histogram of what the user tends to miss.
 */

type IntervalMissesBySemitoneV1 = Record<string, number>; // key is semitone number as string
type IntervalStatsV1 = Partial<Record<StationId, IntervalMissesBySemitoneV1>>;

type IntervalMissEntryV2 = { c: number; t: number }; // c=count, t=lastMissAtMs
type IntervalMissesBySemitoneV2 = Record<string, IntervalMissEntryV2>;
type IntervalStatsV2 = Partial<Record<StationId, IntervalMissesBySemitoneV2>>;

const KEY_V1 = 'ets_interval_stats_v1';
const KEY_V2 = 'ets_interval_stats_v2';

function safeParse<T>(raw: string | null): T {
  if (!raw) return {} as T;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object') return {} as T;
    return v as T;
  } catch {
    return {} as T;
  }
}

function loadAllV2(): IntervalStatsV2 {
  const v2 = safeParse<IntervalStatsV2>(localStorage.getItem(KEY_V2));
  if (Object.keys(v2).length > 0) return v2;

  // One-time migration from v1 → v2.
  const v1 = safeParse<IntervalStatsV1>(localStorage.getItem(KEY_V1));
  if (Object.keys(v1).length === 0) return {};

  const migrated: IntervalStatsV2 = {};
  for (const [sid, bySemi] of Object.entries(v1) as [StationId, IntervalMissesBySemitoneV1][]) {
    const next: IntervalMissesBySemitoneV2 = {};
    for (const [k, v] of Object.entries(bySemi ?? {})) {
      const semi = Number(k);
      if (!Number.isFinite(semi)) continue;
      const c = typeof v === 'number' && Number.isFinite(v) ? v : 0;
      if (c <= 0) continue;
      next[String(semi)] = { c, t: 0 };
    }
    if (Object.keys(next).length > 0) migrated[sid] = next;
  }

  localStorage.setItem(KEY_V2, JSON.stringify(migrated));
  return migrated;
}

function saveAllV2(v: IntervalStatsV2) {
  localStorage.setItem(KEY_V2, JSON.stringify(v));
}

export function recordIntervalMiss(stationId: StationId, semitones: number) {
  const all = loadAllV2();
  const bySemi: IntervalMissesBySemitoneV2 = { ...(all[stationId] ?? {}) };
  const key = String(semitones);
  const prev = bySemi[key];
  const cPrev = prev && typeof prev.c === 'number' && Number.isFinite(prev.c) ? prev.c : 0;
  bySemi[key] = { c: cPrev + 1, t: Date.now() };
  saveAllV2({ ...all, [stationId]: bySemi });
}

export function loadIntervalMissDetails(stationId: StationId): Map<number, { count: number; lastMissAtMs: number }> {
  const all = loadAllV2();
  const bySemi = all[stationId] ?? {};
  const m = new Map<number, { count: number; lastMissAtMs: number }>();

  for (const [k, v] of Object.entries(bySemi)) {
    const semi = Number(k);
    if (!Number.isFinite(semi)) continue;
    const count = v && typeof v.c === 'number' && Number.isFinite(v.c) ? v.c : 0;
    const lastMissAtMs = v && typeof v.t === 'number' && Number.isFinite(v.t) ? v.t : 0;
    if (count > 0) m.set(semi, { count, lastMissAtMs });
  }

  return m;
}

export function loadIntervalMissHistogram(stationId: StationId): Map<number, number> {
  const details = loadIntervalMissDetails(stationId);
  const m = new Map<number, number>();
  for (const [semi, { count }] of details.entries()) m.set(semi, count);
  return m;
}

export function clearIntervalMissHistogram(stationId: StationId) {
  const all = loadAllV2();
  const next: IntervalStatsV2 = { ...all };
  delete next[stationId];
  saveAllV2(next);
}

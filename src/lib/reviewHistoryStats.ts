import type { ReviewSessionHistoryEntryV1 } from './reviewSessionHistory';
import { STATIONS } from './stations.ts';

export type ReviewHistoryStationRow = {
  station: string;
  stationName: string;
  sessions: number;
  avgAcc: number;
  avgXp: number;
  lastAt: number;
};

export type ReviewHistoryStats = {
  count: number;
  avg10: number; // 0..1
  avg50: number; // 0..1
  last10: ReviewSessionHistoryEntryV1[];
  stationsMost: ReviewHistoryStationRow[];
  stationsNeedsLove: ReviewHistoryStationRow[];
};

function acc(e: ReviewSessionHistoryEntryV1) {
  const denom = e.right + e.wrong;
  return denom > 0 ? e.right / denom : 0;
}

function stationLabel(id: string): string {
  const s = STATIONS.find((x) => x.id === id);
  return s?.title ?? id;
}

/**
 * Computes lightweight stats from Review session history entries.
 *
 * Notes:
 * - Station rollups ignore drills (they are targeted follow-ups and would bias the rollup).
 * - `stationsNeedsLove` requires at least 2 sessions per station to reduce noise.
 */
export function computeReviewHistoryStats(entries: ReviewSessionHistoryEntryV1[]): ReviewHistoryStats {
  const noDrill = entries.filter((e) => e.mode !== 'drill');

  const last10 = noDrill.slice(-10);
  const last50 = noDrill.slice(-50);
  const avg10 = last10.length ? last10.reduce((s, e) => s + acc(e), 0) / last10.length : 0;
  const avg50 = last50.length ? last50.reduce((s, e) => s + acc(e), 0) / last50.length : 0;

  const stationRows = new Map<
    string,
    { station: string; stationName: string; sessions: number; sumAcc: number; sumXp: number; lastAt: number }
  >();

  for (const e of last50) {
    if (e.mode === 'drill') continue;
    if (!e.station) continue;

    const key = e.station;
    const row = stationRows.get(key) ?? {
      station: key,
      stationName: stationLabel(key),
      sessions: 0,
      sumAcc: 0,
      sumXp: 0,
      lastAt: 0,
    };

    row.sessions += 1;
    row.sumAcc += acc(e);
    row.sumXp += e.xp;
    row.lastAt = Math.max(row.lastAt, e.at);
    stationRows.set(key, row);
  }

  const stationsMost = Array.from(stationRows.values())
    .map((r) => ({
      station: r.station,
      stationName: r.stationName,
      sessions: r.sessions,
      avgAcc: r.sessions ? r.sumAcc / r.sessions : 0,
      avgXp: r.sessions ? r.sumXp / r.sessions : 0,
      lastAt: r.lastAt,
    }))
    .sort((a, b) => b.sessions - a.sessions || b.lastAt - a.lastAt || a.stationName.localeCompare(b.stationName));

  const stationsNeedsLove = stationsMost
    .filter((r) => r.sessions >= 2)
    .slice()
    .sort((a, b) => a.avgAcc - b.avgAcc || b.sessions - a.sessions || b.lastAt - a.lastAt);

  return {
    count: noDrill.length,
    avg10,
    avg50,
    last10,
    stationsMost: stationsMost.slice(0, 5),
    stationsNeedsLove: stationsNeedsLove.slice(0, 5),
  };
}

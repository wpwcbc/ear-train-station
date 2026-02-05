import type { Station } from './stations';
import { STATIONS } from './stations';
import type { StationId } from './progress';
import type { SectionId } from './sections';
import { sectionStations } from './sectionStations';

export type SectionNodeKind = 'lesson' | 'test' | 'exam';

export type SectionNode = {
  kind: SectionNodeKind;
  stationId: StationId;
  station: Station;
};

/**
 * Per-section ordered node list.
 *
 * Today this is derived from `sectionStations` (which is already the canonical list of station ids).
 * Keeping a dedicated node model lets the UI evolve toward Duolingo-like “path” behaviors
 * (teach cards → test → twist, gating, bonuses, etc.) without rewriting section config again.
 */
export function sectionNodes(sectionId: SectionId): SectionNode[] {
  const plan = sectionStations(sectionId);

  const byId = new Map<StationId, Station>();
  for (const s of STATIONS) byId.set(s.id, s);

  return plan.stationIds.map((stationId) => {
    const station = byId.get(stationId);
    if (!station) {
      throw new Error(`Unknown station id in section ${sectionId}: ${stationId}`);
    }

    const kind: SectionNodeKind = stationId === plan.examId ? 'exam' : station.kind;
    return { kind, stationId, station };
  });
}

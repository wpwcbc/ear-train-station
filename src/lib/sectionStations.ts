import type { Progress, StationId } from './progress';
import { STATIONS, type Station } from './stations';
import type { SectionId } from './sections';

export type SectionStations = {
  /** Ordered stations shown for this section (subset of the global line). */
  stationIds: StationId[];
  /** The section's "exam" station (usually the last test). */
  examId: StationId;
};

const SECTION_STATIONS: Record<SectionId, SectionStations> = {
  NOTES: {
    stationIds: ['S1_NOTES', 'S1B_STAFF', 'S1C_ACCIDENTALS', 'T1_NOTES'],
    examId: 'T1_NOTES',
  },
  MAJOR_SCALE: {
    stationIds: ['S2_MAJOR_SCALE', 'T2_MAJOR_SCALE'],
    examId: 'T2_MAJOR_SCALE',
  },
  INTERVALS: {
    stationIds: ['S3_INTERVALS', 'T3_INTERVALS', 'S8_DEGREE_INTERVALS', 'T8_DEGREE_INTERVALS'],
    examId: 'T8_DEGREE_INTERVALS',
  },
  TRIADS: {
    stationIds: ['S4_TRIADS', 'T5_TRIADS', 'S5_DIATONIC_TRIADS', 'T6_DIATONIC_TRIADS'],
    examId: 'T6_DIATONIC_TRIADS',
  },
  FUNCTION: {
    stationIds: ['S6_FUNCTIONS', 'T7_FUNCTIONS', 'S7_DEGREES', 'T4_DEGREES'],
    examId: 'T4_DEGREES',
  },
};

export function sectionStations(sectionId: SectionId): SectionStations {
  return SECTION_STATIONS[sectionId];
}

export function sectionStationList(sectionId: SectionId): Station[] {
  const ids = new Set(sectionStations(sectionId).stationIds);
  return STATIONS.filter((s) => ids.has(s.id));
}

/**
 * If a station id is a section exam (usually the last test), return all station ids in that section.
 * Used for “test out” style flow: passing an exam can auto-complete the section.
 */
export function sectionStationsByExamId(examId: StationId): StationId[] | null {
  for (const s of Object.values(SECTION_STATIONS)) {
    if (s.examId === examId) return s.stationIds;
  }
  return null;
}

export function sectionMissingForExam(progress: Progress, sectionId: SectionId): StationId[] {
  const { stationIds, examId } = sectionStations(sectionId);
  const examIdx = stationIds.indexOf(examId);
  const prereqIds = (examIdx >= 0 ? stationIds.slice(0, examIdx) : stationIds).filter((sid) => sid !== examId);
  return prereqIds.filter((sid) => !progress.stationDone[sid]);
}

export function isSectionExamUnlocked(progress: Progress, sectionId: SectionId): boolean {
  return sectionMissingForExam(progress, sectionId).length === 0;
}

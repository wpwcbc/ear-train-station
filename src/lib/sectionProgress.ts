import type { Progress } from './progress';
import type { SectionId } from './sections';
import { SECTIONS } from './sections';
import { sectionStations } from './sectionStations';

export function isSectionComplete(progress: Progress, sectionId: SectionId): boolean {
  const { examId } = sectionStations(sectionId);
  return Boolean(progress.stationDone[examId]);
}

/**
 * Sections unlock linearly: a section is unlocked if all previous section exams are completed.
 * (This is separate from per-station unlocking inside a section.)
 */
export function isSectionUnlocked(progress: Progress, sectionId: SectionId): boolean {
  const idx = SECTIONS.findIndex((s) => s.id === sectionId);
  if (idx <= 0) return idx === 0;
  for (let i = 0; i < idx; i++) {
    const prev = SECTIONS[i];
    if (!isSectionComplete(progress, prev.id)) return false;
  }
  return true;
}

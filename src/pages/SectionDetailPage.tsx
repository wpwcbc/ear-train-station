import { Link, useParams } from 'react-router-dom';
import type { Progress } from '../lib/progress';
import { SECTIONS, type SectionId } from '../lib/sections';
import { MapPage } from './MapPage';

export function SectionDetailPage({ progress, setProgress }: { progress: Progress; setProgress: (p: Progress) => void }) {
  const { sectionId } = useParams();
  const id = (sectionId ?? 'NOTES') as SectionId;
  const section = SECTIONS.find((s) => s.id === id);

  if (!section) {
    return (
      <div className="page">
        <h1 className="h1">Unknown section</h1>
        <Link className="btn" to="/learn">Back</Link>
      </div>
    );
  }

  // Temporary bridge:
  // Today we render the existing station map here.
  // Next step: section-specific nodes + exams + skip-by-exam.
  return (
    <div className="page">
      <div className="rowBetween">
        <div>
          <h1 className="h1">{section.title}</h1>
          <p className="sub">{section.blurb}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link className="btn" to="/learn">All sections</Link>
          <button className="btnPrimary" disabled title="Exam page next">Jump to exam</button>
        </div>
      </div>

      <div className="sectionRoute" aria-label="route" />

      <MapPage progress={progress} setProgress={setProgress} />
    </div>
  );
}

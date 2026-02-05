import { Link, useParams } from 'react-router-dom';
import type { Progress } from '../lib/progress';
import { SECTIONS, type SectionId } from '../lib/sections';
import { sectionStationList, sectionStations } from '../lib/sectionStations';
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

  const list = sectionStationList(id);
  const plan = sectionStations(id);

  return (
    <div className="page">
      <div className="rowBetween">
        <div>
          <h1 className="h1">{section.title}</h1>
          <p className="sub">{section.blurb}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link className="btn" to="/learn">All sections</Link>
          <Link className="btnPrimary" to={`/learn/section/${id}/exam`} title={`Exam: ${plan.examId}`}>
            Jump to exam
          </Link>
        </div>
      </div>

      <div className="sectionRoute" aria-label="route" />

      <MapPage progress={progress} setProgress={setProgress} stations={list} />
    </div>
  );
}

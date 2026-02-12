import { Link, useParams } from 'react-router-dom';
import type { Progress } from '../lib/progress';
import { SECTIONS, type SectionId } from '../lib/sections';
import { sectionNodes } from '../lib/sectionNodes';
import { isSectionExamUnlocked, sectionStations } from '../lib/sectionStations';
import { SectionRoute } from '../components/SectionRoute';
import { WIDE_REGISTER_RANGE_TEXT } from '../lib/registerPolicy';

export function SectionDetailPage({ progress, setProgress: _setProgress }: { progress: Progress; setProgress: (p: Progress) => void }) {
  void _setProgress;
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

  const plan = sectionStations(id);
  const nodes = sectionNodes(id);
  const examUnlocked = isSectionExamUnlocked(progress, id);

  return (
    <div className="page sectionPage">
      <div className="rowBetween">
        <div>
          <h1 className="h1">{section.title}</h1>
          <p className="sub">{section.blurb}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link className="btn" to="/learn">All sections</Link>
          {examUnlocked ? (
            <Link
              className="btnPrimary"
              to={`/learn/section/${id}/exam`}
              state={{ exitTo: `/learn/section/${id}` }}
              title={`Exam: ${plan.examId}`}
            >
              Jump to exam
            </Link>
          ) : (
            <span
              className="btnPrimary"
              style={{ opacity: 0.55, cursor: 'not-allowed' }}
              title="Finish the earlier stations in this section to unlock the exam."
            >
              Exam locked
            </span>
          )}
        </div>
      </div>

      <SectionRoute sectionId={id} nodes={nodes} progress={progress} />

      <div className="sub" style={{ marginTop: 10 }}>
        Tip: tap a station on the line to see details. Lessons stay in a stable register; tests/exams go wider (≥ {WIDE_REGISTER_RANGE_TEXT}).
      </div>
    </div>
  );
}

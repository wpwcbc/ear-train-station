import { Link, useParams } from 'react-router-dom';
import { SECTIONS, type SectionId } from '../lib/sections';
import { sectionStations, sectionStationList } from '../lib/sectionStations';

export function SectionExamPage() {
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
  const list = sectionStationList(id);
  const examStation = list.find((s) => s.id === plan.examId) ?? null;

  return (
    <div className="page">
      <div className="rowBetween">
        <div>
          <h1 className="h1">{section.title} — Exam</h1>
          <p className="sub">
            A quick, focused test to check you can move on. (Passing doesn’t auto-skip stations yet — that’s next.)
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link className="btn" to={`/learn/section/${id}`}>Back to section</Link>
          <Link className="btn" to="/learn">All sections</Link>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Exam station</div>
        <div style={{ marginTop: 6, opacity: 0.85 }}>{examStation ? examStation.title : plan.examId}</div>
        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link className="linkBtn primaryLink" to={`/lesson/${plan.examId}`}>Start exam</Link>
          <Link className="linkBtn" to={`/review?station=${plan.examId}`}>Review mistakes for this exam</Link>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>What’s in this section</div>
        <ul style={{ marginTop: 8 }}>
          {list.map((s) => (
            <li key={s.id} style={{ marginBottom: 6 }}>
              <span style={{ opacity: 0.75 }}>{s.kind === 'test' ? 'Test' : 'Lesson'}:</span> {s.title}{' '}
              <Link style={{ marginLeft: 8 }} to={`/lesson/${s.id}`}>
                Open
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

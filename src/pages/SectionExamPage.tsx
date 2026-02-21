import { Link, useParams } from 'react-router-dom';
import type { Progress } from '../lib/progress';
import { SECTIONS, type SectionId } from '../lib/sections';
import {
  isSectionExamUnlocked,
  sectionMissingForExam,
  sectionStations,
  sectionStationList,
  titleForStationId,
} from '../lib/sectionStations';

export function SectionExamPage({ progress }: { progress: Progress }) {
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

  const examUnlocked = isSectionExamUnlocked(progress, id);
  const missing = sectionMissingForExam(progress, id);

  const examIdx = plan.stationIds.indexOf(plan.examId);
  const prereqIds = (examIdx >= 0 ? plan.stationIds.slice(0, examIdx) : plan.stationIds).filter((sid) => sid !== plan.examId);
  const prereqDone = prereqIds.filter((sid) => progress.stationDone[sid]).length;

  return (
    <div className="page">
      <div className="rowBetween">
        <div>
          <h1 className="h1">{section.title} — Exam</h1>
          <p className="sub">
            A quick, focused test to check you can move on. If you pass, we’ll mark this section as completed (Duolingo-style “test out”).
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

        {!examUnlocked ? (
          <div className="callout" style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 700 }}>Locked</div>
            <div style={{ marginTop: 4, opacity: 0.85 }}>
              Finish the stations before this exam to unlock it.
              <span style={{ marginLeft: 8, opacity: 0.75 }}>
                ({prereqDone}/{prereqIds.length} done)
              </span>
            </div>
            <ul style={{ marginTop: 8 }}>
              {missing.map((sid) => (
                <li key={sid}>
                  <Link to={`/lesson/${sid}`} state={{ exitTo: `/learn/section/${id}/exam` }}>
                    {titleForStationId(sid)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {examUnlocked ? (
            <Link className="linkBtn primaryLink" to={`/lesson/${plan.examId}`} state={{ exitTo: `/learn/section/${id}/exam` }}>
              Start exam
            </Link>
          ) : (
            <span className="linkBtn primaryLink" style={{ opacity: 0.55, cursor: 'not-allowed' }}>
              Start exam
            </span>
          )}
          <Link className="linkBtn" to={`/review?station=${plan.examId}`} state={{ exitTo: `/learn/section/${id}/exam` }}>
            Review mistakes for this exam
          </Link>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>What’s in this section</div>
        <ul style={{ marginTop: 8 }}>
          {list.map((s) => (
            <li key={s.id} style={{ marginBottom: 6 }}>
              <span style={{ opacity: 0.75 }}>{s.kind === 'test' ? 'Test' : 'Lesson'}:</span> {s.title}{' '}
              <Link style={{ marginLeft: 8 }} to={`/lesson/${s.id}`} state={{ exitTo: `/learn/section/${id}/exam` }}>
                Open
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

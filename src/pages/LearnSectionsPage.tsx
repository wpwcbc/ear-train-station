import { Link } from 'react-router-dom';
import { SECTIONS } from '../lib/sections';

export function LearnSectionsPage() {
  return (
    <div className="page">
      <h1 className="h1">Learn</h1>
      <p className="sub">Pick a section. Each section ends with an exam you can jump to.</p>

      <div className="gridCards">
        {SECTIONS.map((s) => (
          <Link key={s.id} to={`/learn/section/${s.id}`} className="cardLink">
            <div className="sectionCard">
              <div className="sectionBar" style={{ background: s.color }} />
              <div className="sectionBody">
                <div className="sectionTitle">{s.title}</div>
                <div className="sectionBlurb">{s.blurb}</div>
                <div className="sectionCta">Open →</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

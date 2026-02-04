import { Link } from 'react-router-dom';
import { STATIONS } from '../lib/stations';
import type { Progress } from '../lib/progress';

export function MapPage({ progress }: { progress: Progress }) {
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div>
          <h1 className="title">Train Line</h1>
          <p className="sub">Complete stations in order. Short lessons, frequent tests.</p>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, opacity: 0.85 }}>
          <div>XP: {progress.xp}</div>
          <div>Streak: {progress.streakDays} day(s)</div>
        </div>
      </div>

      <div className="line">
        {STATIONS.map((s, idx) => {
          const done = progress.stationDone[s.id];
          return (
            <div key={s.id} className="stationRow">
              <div className={`stationDot ${done ? 'done' : ''}`}>{idx + 1}</div>
              <div className="stationBody">
                <div className="stationTitle">
                  {s.title} {done ? <span className="tinyDone">DONE</span> : null}
                </div>
                <div className="stationBlurb">{s.blurb}</div>
                <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Link className="linkBtn" to={`/station/${s.id}`}>Start</Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, fontSize: 12, opacity: 0.8 }}>
        Install tip: in Chrome, open menu → “Install app”.
      </div>
    </div>
  );
}

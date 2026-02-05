import { Link } from 'react-router-dom';
import type { Progress } from '../lib/progress';
import { isStationUnlockedIn, type Station } from '../lib/stations';
import type { SectionNode } from '../lib/sectionNodes';

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

export function SectionRoute({
  nodes,
  progress,
}: {
  nodes: ReadonlyArray<SectionNode>;
  progress: Progress;
}) {
  const stations: Station[] = nodes.map((n) => n.station);

  const W = 900;
  const H = 86;
  const P = 34;
  const n = Math.max(nodes.length, 1);

  return (
    <div className="sectionRouteWrap">
      <svg
        className="sectionRouteSvg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Section route"
        preserveAspectRatio="none"
      >
        <path
          d={`M ${P} ${H / 2} L ${W - P} ${H / 2}`}
          className="routeLine"
        />

        {nodes.map((node, idx) => {
          const t = n === 1 ? 0.5 : idx / (n - 1);
          const x = P + t * (W - P * 2);
          const y = H / 2;

          const done = !!progress.stationDone[node.stationId];
          const unlocked = isStationUnlockedIn(progress, node.stationId, stations);

          const r = 16;
          const dotClass = [
            'routeDot',
            done ? 'done' : '',
            unlocked ? '' : 'locked',
            node.kind === 'exam' ? 'exam' : '',
          ]
            .filter(Boolean)
            .join(' ');

          const label = node.kind === 'exam' ? 'Exam' : node.kind === 'test' ? 'Test' : 'Lesson';

          // Click target: a small pill button below the dot.
          const btnW = clamp(110, 90, 130);
          const btnH = 28;
          const btnX = x - btnW / 2;
          const btnY = y + 22;

          return (
            <g key={node.stationId}>
              <circle cx={x} cy={y} r={r} className={dotClass} />
              {node.kind === 'exam' ? (
                <circle cx={x} cy={y} r={r + 6} className="routeHalo" />
              ) : null}

              <foreignObject x={btnX} y={btnY} width={btnW} height={btnH}>
                <div className="routeBtnWrap">
                  {unlocked ? (
                    <Link className="routeBtn" to={`/lesson/${node.stationId}`}>
                      {label}
                    </Link>
                  ) : (
                    <span className="routeBtn routeBtnLocked">Locked</span>
                  )}
                </div>
              </foreignObject>

              <text x={x} y={y - 26} textAnchor="middle" className="routeTitle">
                {idx + 1}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

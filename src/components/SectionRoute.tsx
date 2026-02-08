import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Progress } from '../lib/progress';
import { isStationUnlockedIn, nextUnlockedIncompleteIn, type Station } from '../lib/stations';
import type { SectionNode } from '../lib/sectionNodes';

function shortTitle(full: string): string {
  // Keep the “station-sign” header compact: take the prefix before the em dash.
  const parts = full.split('—');
  return (parts[0] ?? full).trim();
}

function useIsMobile(breakpointPx: number): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= breakpointPx;
  });

  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth <= breakpointPx);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpointPx]);

  return isMobile;
}

export function SectionRoute({
  sectionId,
  nodes,
  progress,
}: {
  sectionId: string;
  nodes: ReadonlyArray<SectionNode>;
  progress: Progress;
}) {
  const stations: Station[] = useMemo(() => nodes.map((n) => n.station), [nodes]);
  const isMobile = useIsMobile(640);

  const defaultSelected = useMemo(() => {
    const next = nextUnlockedIncompleteIn(progress, stations);
    return next ?? nodes[0]?.stationId ?? null;
  }, [nodes, progress, stations]);

  const [selectedId, setSelectedId] = useState<string | null>(defaultSelected);

  // If progress changes (e.g. after completing a station), gently move selection to the next target.
  useEffect(() => {
    const t = window.setTimeout(() => setSelectedId((cur) => cur ?? defaultSelected), 0);
    return () => window.clearTimeout(t);
  }, [defaultSelected]);

  const selectedNode = nodes.find((n) => n.stationId === selectedId) ?? null;
  const selectedUnlocked = selectedNode ? isStationUnlockedIn(progress, selectedNode.stationId, stations) : false;
  const selectedDone = selectedNode ? !!progress.stationDone[selectedNode.stationId] : false;

  const W = 900;
  const H = 90;
  const P = 34;
  const n = Math.max(nodes.length, 1);

  function selectStation(id: string) {
    setSelectedId(id);
  }

  function onDotKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectStation(id);
    }
  }

  const card = selectedNode ? (
    <div className={isMobile ? 'routeSheet' : 'routeCard'} role={isMobile ? 'dialog' : undefined} aria-modal={isMobile ? true : undefined}>
      <div className="routeCardHeader">
        <div className="routeCardKicker">{shortTitle(selectedNode.station.title)}</div>
        <div className="routeCardTitle">{selectedNode.station.title}</div>
      </div>

      <div className="routeCardBody">
        <div className="routeCardBlurb">{selectedNode.station.blurb}</div>

        <div className="routeCardMeta">
          <span className={selectedNode.kind === 'lesson' ? 'pill' : selectedNode.kind === 'exam' ? 'pill warn' : 'pill strong'}>
            {selectedNode.kind === 'exam' ? 'Exam' : selectedNode.kind === 'test' ? 'Test' : 'Lesson'}
          </span>
          {selectedDone ? <span className="pill ok">Done</span> : null}
          {!selectedUnlocked ? <span className="pill muted">Locked</span> : null}
        </div>

        <div className="routeCardActions">
          {selectedUnlocked ? (
            <Link className="btnPrimary" to={`/lesson/${selectedNode.stationId}`} state={{ exitTo: `/learn/section/${sectionId}` }}>
              {selectedDone ? 'Redo' : 'Start'}
            </Link>
          ) : (
            <div className="sub" style={{ margin: 0 }}>
              {(() => {
                const idx = stations.findIndex((s) => s.id === selectedNode.stationId);
                const prev = idx > 0 ? stations[idx - 1] : null;
                return prev ? `Complete “${shortTitle(prev.title)}” first to unlock.` : 'Finish the previous station(s) to unlock.';
              })()}
            </div>
          )}

          {isMobile ? (
            <button className="btn" onClick={() => setSelectedId(null)}>
              Close
            </button>
          ) : null}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="sectionRouteWrap">
      <svg
        className="sectionRouteSvg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Section route"
        preserveAspectRatio="xMidYMid meet"
      >
        <path d={`M ${P} ${H / 2} L ${W - P} ${H / 2}`} className="routeLine" />

        {nodes.map((node, idx) => {
          const t = n === 1 ? 0.5 : idx / (n - 1);
          const x = P + t * (W - P * 2);
          const y = H / 2;

          const done = !!progress.stationDone[node.stationId];
          const unlocked = isStationUnlockedIn(progress, node.stationId, stations);
          const selected = node.stationId === selectedId;

          const r = 16;
          const dotClass = ['routeDot', done ? 'done' : '', unlocked ? '' : 'locked', node.kind === 'exam' ? 'exam' : '', selected ? 'selected' : '']
            .filter(Boolean)
            .join(' ');

          const label = shortTitle(node.station.title);

          return (
            <g
              key={node.stationId}
              className={unlocked ? 'routeDotGroup' : 'routeDotGroup locked'}
              role="button"
              tabIndex={0}
              aria-label={node.station.title}
              onClick={() => selectStation(node.stationId)}
              onKeyDown={(e) => onDotKeyDown(e, node.stationId)}
            >
              <circle cx={x} cy={y} r={r} className={dotClass} />
              {node.kind === 'exam' ? <circle cx={x} cy={y} r={r + 6} className="routeHalo" /> : null}
              {/* Larger invisible hit target */}
              <circle cx={x} cy={y} r={r + 10} className="routeHit" />

              <text x={x} y={y - 28} textAnchor="middle" className="routeTitle">
                {label}
              </text>
            </g>
          );
        })}
      </svg>

      {isMobile && selectedNode ? (
        <div className="routeSheetOverlay" onClick={() => setSelectedId(null)} aria-hidden="true" />
      ) : null}

      {card}
    </div>
  );
}

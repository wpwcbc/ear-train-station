import { useEffect, useMemo, useState } from 'react';
import { StationSignCard } from './StationSignCard';
import type { Progress } from '../lib/progress';
import { isStationUnlockedIn, nextUnlockedIncompleteIn, type Station } from '../lib/stations';
import type { SectionNode } from '../lib/sectionNodes';

function displayTitle(full: string): string {
  // Prefer the content after the em dash: "Station 1 — Note names & accidentals" → "Note names & accidentals".
  const parts = full.split('—');
  const core = (parts.length > 1 ? parts.slice(1).join('—') : full).trim();
  // Keep it short: take the part before '&' if present.
  const short = core.split('&')[0]?.trim();
  return short || core;
}

// (unused)
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
    <div
      className={isMobile ? 'routeSheet' : 'routeCard'}
      role={isMobile ? 'dialog' : undefined}
      aria-modal={isMobile ? true : undefined}
    >
      {(() => {
        const idx = stations.findIndex((s) => s.id === selectedNode.stationId);
        const prev = idx > 0 ? stations[idx - 1] : null;
        const next = idx >= 0 && idx < stations.length - 1 ? stations[idx + 1] : null;

        const kindLabel = selectedNode.kind === 'exam' ? 'EXAM' : selectedNode.kind === 'test' ? 'TEST' : 'LESSON';
        const code = selectedNode.kind === 'exam' ? 'EX' : String(idx + 1);

        const lockText = !selectedUnlocked
          ? prev
            ? `Complete “${displayTitle(prev.title)}” first to unlock.`
            : 'Finish the previous station(s) to unlock.'
          : undefined;

        return (
          <StationSignCard
            accent={selectedNode.kind === 'exam' ? 'var(--route-yellow)' : 'var(--route-blue)'}
            code={code}
            title={displayTitle(selectedNode.station.title)}
            subtitle={lockText ?? selectedNode.station.blurb}
            leftLabel={prev ? displayTitle(prev.title) : undefined}
            rightLabel={next ? displayTitle(next.title) : undefined}
            statusRight={`${kindLabel}${selectedDone ? ' · DONE' : !selectedUnlocked ? ' · LOCKED' : ''}`}
            actions={
              selectedUnlocked
                ? [
                    {
                      label: selectedDone ? 'Redo' : 'Start',
                      to: `/lesson/${selectedNode.stationId}`,
                      state: { exitTo: `/learn/section/${sectionId}` },
                      variant: 'primary',
                    },
                    ...(isMobile
                      ? [{ label: 'Close', disabled: true }]
                      : []),
                  ]
                : isMobile
                  ? [{ label: 'Close', disabled: true }]
                  : undefined
            }
          />
        );
      })()}

      {isMobile ? (
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => setSelectedId(null)}>
            Close
          </button>
        </div>
      ) : null}
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

          const label = displayTitle(node.station.title);

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

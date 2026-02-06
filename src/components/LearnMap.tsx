import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Progress } from '../lib/progress';
import { SECTIONS, type SectionId } from '../lib/sections';
import { isSectionComplete, isSectionUnlocked } from '../lib/sectionProgress';

export function LearnMap({ progress }: { progress: Progress }) {
  const [selected, setSelected] = useState<SectionId>(SECTIONS[0].id);

  const selectedIndex = useMemo(() => Math.max(0, SECTIONS.findIndex((s) => s.id === selected)), [selected]);
  const selectedSection = useMemo(() => SECTIONS.find((s) => s.id === selected) ?? SECTIONS[0], [selected]);

  const width = 860;
  const height = 220;
  const padX = 60;
  const y = 110;
  const n = SECTIONS.length;

  const xFor = (i: number) => {
    if (n <= 1) return width / 2;
    const t = i / (n - 1);
    return padX + t * (width - padX * 2);
  };

  return (
    <div className="learnMapWrap">
      <svg className="learnMapSvg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Learn map">
        {/* route (base) */}
        <path
          d={`M ${xFor(0)} ${y} L ${xFor(n - 1)} ${y}`}
          stroke="#111"
          strokeOpacity={0.12}
          strokeWidth={10}
          strokeLinecap="round"
          fill="none"
        />

        {/* route (active segment up to selection) */}
        <path
          d={`M ${xFor(0)} ${y} L ${xFor(selectedIndex)} ${y}`}
          stroke={selectedSection.color}
          strokeOpacity={0.45}
          strokeWidth={10}
          strokeLinecap="round"
          fill="none"
        />

        {SECTIONS.map((s, i) => {
          const unlocked = isSectionUnlocked(progress, s.id);
          const done = isSectionComplete(progress, s.id);
          const isSel = s.id === selected;

          return (
            <g
              key={s.id}
              role="button"
              tabIndex={unlocked ? 0 : -1}
              aria-label={`${s.title} ${done ? '(completed)' : unlocked ? '(unlocked)' : '(locked)'}`}
              style={{ cursor: unlocked ? 'pointer' : 'not-allowed' }}
              onMouseEnter={() => unlocked && setSelected(s.id)}
              onTouchStart={() => unlocked && setSelected(s.id)}
              onClick={() => unlocked && setSelected(s.id)}
              onKeyDown={(e) => {
                if (!unlocked) return;
                if (e.key === 'Enter' || e.key === ' ') setSelected(s.id);
              }}
            >
              <circle
                cx={xFor(i)}
                cy={y}
                r={22}
                fill={unlocked ? '#fff' : '#f3f3f3'}
                stroke={s.color}
                strokeWidth={6}
                opacity={unlocked ? 1 : 0.35}
              />
              <circle cx={xFor(i)} cy={y} r={8} fill={done ? s.color : '#fff'} stroke={s.color} strokeWidth={2} opacity={unlocked ? 1 : 0.45} />
              {isSel ? <circle cx={xFor(i)} cy={y} r={30} fill="none" stroke="#111" strokeOpacity={0.25} strokeWidth={2} /> : null}

              <text x={xFor(i)} y={y + 54} textAnchor="middle" fontSize={12} fill="#111" opacity={unlocked ? 0.9 : 0.45}>
                {s.title.split('—')[0].trim()}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="learnMapCard" style={{ borderLeftColor: selectedSection.color }}>
        <div className="learnMapCardRail" aria-hidden="true">
          <span className="learnMapCardDot" style={{ background: selectedSection.color }} />
          <span className="learnMapCardRailLine" />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
          <div>
            <div className="learnMapCardTitle">{selectedSection.title}</div>
            <div className="learnMapCardBlurb">{selectedSection.blurb}</div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.75, textAlign: 'right' }}>
            {isSectionComplete(progress, selectedSection.id) ? 'Completed' : isSectionUnlocked(progress, selectedSection.id) ? 'Unlocked' : 'Locked'}
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {isSectionUnlocked(progress, selectedSection.id) ? (
            <Link className="btnPrimary" to={`/learn/section/${selectedSection.id}`}>
              Open
            </Link>
          ) : (
            <span className="btnPrimary" style={{ opacity: 0.55, cursor: 'not-allowed' }}>
              Locked
            </span>
          )}
          <Link className="btn" to="/review">
            Review
          </Link>
        </div>
      </div>
    </div>
  );
}

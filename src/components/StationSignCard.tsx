import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';

export type StationSignCardAction = {
  label: string;
  to?: string;
  /** react-router state (used for FocusShell exit targets) */
  state?: unknown;
  disabled?: boolean;
  variant?: 'primary' | 'default';
};

export function StationSignCard(props: {
  accent: string;
  code?: string;
  title: string;
  subtitle?: string;
  leftLabel?: string;
  rightLabel?: string;
  statusRight?: string;
  actions?: StationSignCardAction[];
}) {
  const { accent, code, title, subtitle, leftLabel, rightLabel, statusRight, actions } = props;

  const signStyle = { '--sign-accent': accent } as CSSProperties;

  return (
    <div className="stationSign" style={signStyle}>
      <div className="stationSignTop">
        {code ? <div className="stationSignCode" aria-label={`Code ${code}`}>{code}</div> : null}
        <div className="stationSignLine" aria-hidden="true" />
        <div className="stationSignStatus" aria-label={statusRight ? `Status: ${statusRight}` : undefined}>
          {statusRight}
        </div>
      </div>

      <div className="stationSignMain">
        <div className="stationSignTitle">{title}</div>
        {subtitle ? <div className="stationSignSubtitle">{subtitle}</div> : null}
      </div>

      {leftLabel || rightLabel ? (
        <div className="stationSignNav" aria-label="neighbors">
          <div className="stationSignNavSide">{leftLabel ? <><span className="arrow">←</span>{leftLabel}</> : null}</div>
          <div className="stationSignNavMid" aria-hidden="true" />
          <div className="stationSignNavSide right">{rightLabel ? <>{rightLabel}<span className="arrow">→</span></> : null}</div>
        </div>
      ) : null}

      {actions?.length ? (
        <div className="stationSignActions">
          {actions.map((a) => {
            const className = a.variant === 'primary' ? 'btnPrimary' : 'btn';
            if (a.disabled || !a.to) {
              return (
                <span key={a.label} className={className} style={{ opacity: 0.55, cursor: 'not-allowed' }}>
                  {a.label}
                </span>
              );
            }
            return (
              <Link key={a.label} className={className} to={a.to} state={a.state}>
                {a.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

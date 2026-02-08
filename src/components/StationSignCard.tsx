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
  title: string;
  subtitle?: string;
  statusRight?: string;
  actions?: StationSignCardAction[];
}) {
  const { accent, title, subtitle, statusRight, actions } = props;

  const signStyle = { '--sign-accent': accent } as CSSProperties;

  return (
    <div className="stationSign" style={signStyle}>
      <div className="stationSignTop">
        <div className="stationSignLine" aria-hidden="true" />
        <div className="stationSignStatus" aria-label={statusRight ? `Status: ${statusRight}` : undefined}>
          {statusRight}
        </div>
      </div>

      <div className="stationSignMain">
        <div className="stationSignTitle">{title}</div>
        {subtitle ? <div className="stationSignSubtitle">{subtitle}</div> : null}
      </div>

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

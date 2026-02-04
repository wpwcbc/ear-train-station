import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function TestHeader(props: {
  playLabel: string;
  onPlay: () => void;
  onRestart: () => void;
  leftExtras?: ReactNode;
  /** Optional review link (typically shown once the test ends). */
  reviewHref?: string;
  reviewLabel?: string;
  rightStatus?: string;
}) {
  return (
    <div className="row">
      <button className="primary" onClick={props.onPlay}>
        {props.playLabel}
      </button>
      {props.leftExtras}
      <button className="ghost" onClick={props.onRestart}>
        Restart
      </button>
      {props.reviewHref ? (
        <Link className="linkBtn" to={props.reviewHref}>
          {props.reviewLabel ?? 'Review mistakes'}
        </Link>
      ) : null}
      {props.rightStatus ? (
        <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>{props.rightStatus}</div>
      ) : (
        <div style={{ marginLeft: 'auto' }} />
      )}
    </div>
  );
}

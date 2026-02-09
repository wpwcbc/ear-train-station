import type { ReactNode } from 'react';

export function DuoBottomBar(props: {
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="duoBottomBar" role="group" aria-label="actions">
      <div className="duoBottomBarInner">
        <div className="duoBottomLeft">{props.left}</div>
        <div className="duoBottomRight">{props.right}</div>
      </div>
    </div>
  );
}

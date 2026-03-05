function fmtSignedInt(n: number): string {
  if (n > 0) return `+${n}`;
  return `${n}`;
}

export function DeltaChip({
  contextLabel,
  delta,
  unit,
  pct,
}: {
  /** e.g. "vs previous 7 days" */
  contextLabel: string;
  delta: number;
  unit: string;
  /** e.g. +12 or -8, already rounded */
  pct?: number | null;
}) {
  const isUp = delta > 0;
  const isDown = delta < 0;

  const fg = isUp ? '#166534' : isDown ? '#7f1d1d' : 'var(--ink)';
  const bg = isUp ? '#dcfce7' : isDown ? '#fee2e2' : '#f3f4f6';
  const border = isUp ? '#86efac' : isDown ? '#fecaca' : 'rgba(0,0,0,0.10)';

  const arrow = isUp ? '▲' : isDown ? '▼' : '•';
  const mainText = `${fmtSignedInt(delta)} ${unit}`;
  const pctText = pct != null ? ` (${pct}%)` : '';

  // A11y: make the chip self-describing so it’s not just “+12”.
  const aria = `${contextLabel}: ${isUp ? 'up' : isDown ? 'down' : 'no change'} ${Math.abs(delta)} ${unit}${pct != null ? `, ${Math.abs(pct)} percent` : ''}.`;

  return (
    <span
      aria-label={aria}
      title={`${contextLabel}: ${mainText}${pctText}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 10px',
        borderRadius: 999,
        border: `1px solid ${border}`,
        background: bg,
        color: fg,
        fontSize: 12,
        fontWeight: 800,
        lineHeight: '18px',
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 10, opacity: 0.9 }}>
        {arrow}
      </span>
      <span>
        {mainText}
        {pctText}
      </span>
    </span>
  );
}

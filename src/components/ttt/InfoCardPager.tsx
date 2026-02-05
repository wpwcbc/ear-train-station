import { useMemo, useState } from 'react';

export type InfoPage = {
  title: string;
  body: string | React.ReactNode;
  footnote?: string;
};

export function InfoCardPager({
  pages,
  onDone,
  doneLabel = 'Start',
}: {
  pages: InfoPage[];
  onDone: () => void;
  doneLabel?: string;
}) {
  const [i, setI] = useState(0);
  const page = pages[i];
  const total = pages.length;

  const progressLabel = useMemo(() => {
    if (total <= 1) return '';
    return `${i + 1}/${total}`;
  }, [i, total]);

  return (
    <div className="card" style={{ padding: 14, borderRadius: 16, border: '1px solid rgba(255,255,255,0.10)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
        <div style={{ fontWeight: 800, letterSpacing: 0.2 }}>{page?.title}</div>
        {progressLabel ? <div style={{ fontSize: 12, opacity: 0.75 }}>{progressLabel}</div> : null}
      </div>

      <div style={{ marginTop: 10, fontSize: 13, opacity: 0.92, lineHeight: 1.55 }}>
        {typeof page?.body === 'string' ? <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{page.body}</p> : page?.body}
      </div>

      {page?.footnote ? (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, lineHeight: 1.45 }}>{page.footnote}</div>
      ) : null}

      <div className="row" style={{ marginTop: 14, gap: 10, flexWrap: 'wrap' }}>
        <button
          className="ghost"
          onClick={() => setI((x) => Math.max(0, x - 1))}
          disabled={i <= 0}
          style={i <= 0 ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
        >
          Back
        </button>

        {i + 1 < total ? (
          <button className="primary" onClick={() => setI((x) => Math.min(total - 1, x + 1))}>
            Next
          </button>
        ) : (
          <button className="primary" onClick={onDone}>
            {doneLabel}
          </button>
        )}

        <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.75 }}>Teach</div>
      </div>
    </div>
  );
}

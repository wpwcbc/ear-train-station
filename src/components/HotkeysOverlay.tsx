import { HintOverlay } from './ttt/HintOverlay';

function K({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      style={{
        display: 'inline-block',
        padding: '2px 6px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.14)',
        background: 'rgba(255,255,255,0.06)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: 12,
      }}
    >
      {children}
    </kbd>
  );
}

export function HotkeysOverlay({
  open,
  onClose,
  context = 'practice',
}: {
  open: boolean;
  onClose: () => void;
  context?: 'station' | 'review' | 'practice';
}) {
  return (
    <HintOverlay open={open} onClose={onClose} title="Keyboard shortcuts">
      <div style={{ display: 'grid', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>Core</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <K>Space</K>
            <span style={{ opacity: 0.85 }}>or</span>
            <K>Enter</K>
            <span style={{ opacity: 0.85 }}>Play / Hear</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 6 }}>
            <K>Backspace</K>
            <span style={{ opacity: 0.85 }}>{context === 'review' ? 'Skip / Next' : 'Next / Restart'}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 6 }}>
            <K>1</K>
            <span style={{ opacity: 0.85 }}>…</span>
            <K>9</K>
            <span style={{ opacity: 0.85 }}>Pick answer</span>
          </div>
        </div>

        {context === 'station' ? (
          <div>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Station extras</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <K>H</K>
              <span style={{ opacity: 0.85 }}>Open harmonic interval trainer tips (where available)</span>
            </div>
          </div>
        ) : null}

        <div style={{ opacity: 0.88, fontSize: 12, lineHeight: 1.45 }}>
          Tip: shortcuts won’t fire while you’re typing in an input field.
        </div>
      </div>
    </HintOverlay>
  );
}

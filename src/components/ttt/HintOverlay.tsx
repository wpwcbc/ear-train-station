export function HintOverlay({
  open,
  onClose,
  title = 'Hint',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-end',
        padding: 14,
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(680px, 100%)',
          borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(22,22,28,0.96)',
          padding: 14,
          boxShadow: '0 18px 60px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
          <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>{title}</div>
          <button className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.92, lineHeight: 1.55 }}>{children}</div>
      </div>
    </div>
  );
}

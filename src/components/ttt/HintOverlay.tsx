import { useEffect, useId, useMemo, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusFirst(el: HTMLElement | null) {
  if (!el) return;
  const list = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => !n.hasAttribute('disabled'));
  (list[0] ?? el).focus?.();
}

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
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  const overlayStyle = useMemo(
    () => ({
      position: 'fixed' as const,
      inset: 0,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-end',
      padding: 14,
      zIndex: 50,
    }),
    [],
  );

  const cardStyle = useMemo(
    () => ({
      width: 'min(680px, 100%)',
      borderRadius: 18,
      border: '1px solid rgba(255,255,255,0.12)',
      background: 'rgba(22,22,28,0.96)',
      padding: 14,
      boxShadow: '0 18px 60px rgba(0,0,0,0.45)',
      outline: 'none',
    }),
    [],
  );

  useEffect(() => {
    if (!open) return;

    prevFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the first focusable element (Close button typically).
    queueMicrotask(() => focusFirst(cardRef.current));

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== 'Tab') return;
      const card = cardRef.current;
      if (!card) return;
      const focusables = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => !n.hasAttribute('disabled') && n.tabIndex !== -1,
      );
      if (focusables.length === 0) {
        e.preventDefault();
        card.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !card.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      // Restore previous focus best-effort.
      queueMicrotask(() => prevFocusRef.current?.focus?.());
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={onClose} style={overlayStyle}>
      <div
        ref={cardRef}
        role="document"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={cardStyle}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
          <div id={titleId} style={{ fontWeight: 900, letterSpacing: 0.2 }}>
            {title}
          </div>
          <button className="ghost" onClick={onClose} aria-keyshortcuts="Escape" title="Close (Esc)">
            Close
          </button>
        </div>
        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.92, lineHeight: 1.55 }}>{children}</div>
      </div>
    </div>
  );
}

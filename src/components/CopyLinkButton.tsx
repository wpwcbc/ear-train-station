import { useMemo, useState } from 'react';

function absUrlFor(to: string): string {
  // Vite BASE_URL supports deployments under a sub-path (e.g. GitHub Pages).
  const base = String(import.meta.env.BASE_URL || '/');
  const basePath = base.endsWith('/') ? base.slice(0, -1) : base;
  const fullPath = `${basePath}${to.startsWith('/') ? to : `/${to}`}`;
  return `${window.location.origin}${fullPath}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers / denied permissions
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

export function CopyLinkButton({ to, label = 'Copy link' }: { to: string; label?: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const abs = useMemo(() => absUrlFor(to), [to]);

  return (
    <button
      className="ghost"
      type="button"
      onClick={async () => {
        const ok = await copyText(abs);
        setStatus(ok ? 'copied' : 'failed');
        window.setTimeout(() => setStatus('idle'), 1200);
      }}
      title={status === 'copied' ? 'Copied' : status === 'failed' ? 'Could not copy — select and copy manually' : abs}
      aria-label={label}
      style={{ paddingInline: 10, whiteSpace: 'nowrap' }}
    >
      {status === 'copied' ? 'Copied' : 'Copy'}
    </button>
  );
}

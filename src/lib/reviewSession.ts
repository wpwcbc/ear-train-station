export type ReviewSessionSignatureInput = {
  search: string; // e.g. "?station=S1&warmup=1" or "station=S1"
  hash?: string; // e.g. "#manage"
};

// Keep this list small and explicit so we only reset per-session counters
// when *session-defining* URL params change.
const SESSION_KEYS = [
  'station',
  'drill',
  'kind',
  'warmup',
  'hard',
  'n',
  'workout',
  'semitones',
  'qualities',
  'manage',
] as const;

export function reviewSessionSignature(input: ReviewSessionSignatureInput): string {
  const raw = (input.search || '').startsWith('?') ? (input.search || '').slice(1) : input.search || '';
  const sp = new URLSearchParams(raw);

  // Canonicalize order by iterating in a fixed key order.
  const parts: string[] = [];
  for (const k of SESSION_KEYS) {
    const v = (sp.get(k) || '').trim();
    if (v) parts.push(`${k}=${v}`);
  }

  // Hash-based Manage deep-link should also reset the session.
  const manageHash = ((input.hash || '').trim().toLowerCase() === '#manage') ? '1' : '0';
  parts.push(`hashManage=${manageHash}`);

  return parts.join('&');
}

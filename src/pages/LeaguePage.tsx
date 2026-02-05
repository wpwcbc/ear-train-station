import { useMemo } from 'react';
import type { Progress } from '../lib/progress';
import { loadLeagueState, makeLeagueTable } from '../lib/league';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function LeaguePage({ progress }: { progress: Progress }) {
  const league = useMemo(() => loadLeagueState(progress.xp, new Date()), [progress.xp]);

  const weeklyXp = Math.max(0, progress.xp - league.weekStartXp);
  const weekId = league.weekId;

  const table = useMemo(() => makeLeagueTable({ weekId: weekId || 'week', yourWeeklyXp: weeklyXp, size: 30 }), [weekId, weeklyXp]);

  const youIndex = table.findIndex((r) => r.isYou);
  const youRank = youIndex >= 0 ? youIndex + 1 : null;

  const PROMOTE_TOP = 10;
  const youInPromote = youRank != null && youRank <= PROMOTE_TOP;

  const youRow = table.find((r) => r.isYou);
  const thresholdXp = useMemo(() => {
    const cutoff = table[PROMOTE_TOP - 1];
    return cutoff ? cutoff.weeklyXp : 0;
  }, [table]);

  const gapToPromote = Math.max(0, thresholdXp - (youRow?.weeklyXp ?? 0));

  // Show a slice around the player (Duolingo-ish), but include top ranks.
  const windowed = useMemo(() => {
    const head = table.slice(0, 7);
    if (youIndex < 0) return head;
    const start = clamp(youIndex - 3, 0, Math.max(0, table.length - 1));
    const tail = table.slice(start, start + 7);

    // Merge, de-dupe by name.
    const seen = new Set<string>();
    const merged = [...head, ...tail].filter((r) => {
      if (seen.has(r.name)) return false;
      seen.add(r.name);
      return true;
    });

    // Keep stable ordering by rank.
    return merged
      .map((r) => ({ r, idx: table.findIndex((x) => x.name === r.name) }))
      .sort((a, b) => a.idx - b.idx)
      .map((x) => x.r);
  }, [table, youIndex]);

  return (
    <div className="page">
      <h1 className="h1">League</h1>
      <p className="sub">Weekly XP ladder (client-only for now). Week: <b>{weekId || '—'}</b></p>

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Your weekly XP</div>
            <div style={{ fontSize: 22, fontWeight: 850 }}>{weeklyXp}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Rank</div>
            <div style={{ fontSize: 22, fontWeight: 850 }}>{youRank ? `#${youRank}` : '—'}</div>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
          {youInPromote ? (
            <span>
              Promotion zone ✅ (top {PROMOTE_TOP}). Keep it up.
            </span>
          ) : (
            <span>
              Promotion zone: top {PROMOTE_TOP}. You need <b>{gapToPromote}</b> more XP to reach the cutoff.
            </span>
          )}
        </div>

        <div style={{ marginTop: 12, borderTop: '2px dashed rgba(0,0,0,0.25)', paddingTop: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>Preview ladder</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {windowed.map((r) => {
              const rank = table.findIndex((x) => x.name === r.name) + 1;
              return (
                <div
                  key={r.name}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 14,
                    border: '2px solid var(--ink)',
                    background: r.isYou ? 'linear-gradient(90deg, #fff, rgba(141, 212, 255, 0.28))' : 'var(--card)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                    <div style={{ width: 36, fontVariantNumeric: 'tabular-nums', opacity: 0.8 }}>#{rank}</div>
                    <div style={{ fontWeight: r.isYou ? 900 : 700 }}>{r.name}</div>
                    {rank <= PROMOTE_TOP ? (
                      <span style={{ fontSize: 12, opacity: 0.85, border: '2px solid var(--ink)', borderRadius: 999, padding: '2px 8px', background: '#fff' }}>
                        PROMOTE
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 850 }}>{r.weeklyXp} XP</div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
            Note: This is a deterministic mock league (no server yet). When we add accounts, this page can become real.
          </div>
        </div>
      </div>
    </div>
  );
}

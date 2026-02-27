import { useMemo } from 'react';
import type { Progress } from '../lib/progress';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function ymdFromLocalDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shortDow(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

export function ProfilePage({ progress }: { progress: Progress; setProgress: (p: Progress) => void }) {
  const goal = clamp(progress.dailyGoalXp || 20, 5, 200);
  const today = Math.max(0, progress.dailyXpToday || 0);
  const pct = useMemo(() => {
    if (goal <= 0) return 0;
    return clamp(Math.round((today / goal) * 100), 0, 100);
  }, [today, goal]);

  const week = useMemo(() => {
    // Last 7 local days (including today).
    const days: { ymd: string; label: string; xp: number }[] = [];
    const base = new Date();
    base.setHours(12, 0, 0, 0); // reduce DST edge weirdness

    for (let i = 6; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(d.getDate() - i);
      const ymd = ymdFromLocalDate(d);
      const xp = Math.max(0, Math.floor(progress.dailyXpByYmd?.[ymd] ?? 0));
      days.push({ ymd, label: shortDow(d), xp });
    }

    const max = Math.max(10, ...days.map((d) => d.xp));
    const total = days.reduce((sum, d) => sum + d.xp, 0);
    return { days, max, total };
  }, [progress.dailyXpByYmd]);

  return (
    <div className="page">
      <h1 className="h1">Profile</h1>
      <p className="sub">Stats. (Settings live behind ⚙️.)</p>

      <div className="callout">
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
            <div style={{ border: '3px solid var(--ink)', borderRadius: 16, padding: 12, background: 'var(--card)' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Total XP</div>
              <div style={{ fontSize: 22, fontWeight: 850 }}>{progress.xp}</div>
            </div>
            <div style={{ border: '3px solid var(--ink)', borderRadius: 16, padding: 12, background: 'var(--card)' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>XP streak</div>
              <div style={{ fontSize: 22, fontWeight: 850 }}>
                {progress.streakDays} day{progress.streakDays === 1 ? '' : 's'}
              </div>
            </div>
            <div style={{ border: '3px solid var(--ink)', borderRadius: 16, padding: 12, background: 'var(--card)' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Today</div>
              <div style={{ fontSize: 22, fontWeight: 850 }}>
                {today}/{goal} XP
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Daily goal</div>
            <div
              aria-label="daily goal progress"
              style={{ height: 14, borderRadius: 999, border: '3px solid var(--ink)', overflow: 'hidden', background: '#fff' }}
            >
              <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #8dd4ff, #b6f2d8)' }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              Edit daily goal + other knobs in <b>⚙️ Settings</b>.
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="rowBetween" style={{ gap: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 850 }}>XP this week</div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
              {week.total} XP • last 7 days
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 10,
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            gap: 8,
            alignItems: 'end',
            height: 86,
          }}
          aria-label="XP bars for the last 7 days"
        >
          {week.days.map((d) => {
            const h = Math.round((d.xp / week.max) * 68);
            const isToday = d.ymd === ymdFromLocalDate(new Date());
            return (
              <div key={d.ymd} style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
                <div
                  title={`${d.ymd}: ${d.xp} XP`}
                  aria-label={`${d.label} ${d.xp} XP`}
                  style={{
                    width: '100%',
                    maxWidth: 18,
                    height: 68,
                    borderRadius: 999,
                    border: '2px solid var(--ink)',
                    background: '#fff',
                    overflow: 'hidden',
                    boxShadow: isToday ? '0 0 0 3px rgba(141, 212, 255, 0.35)' : undefined,
                  }}
                >
                  <div
                    style={{
                      height: h,
                      marginTop: 68 - h,
                      background: isToday ? 'linear-gradient(180deg, #7fc9ff, #b6f2d8)' : 'linear-gradient(180deg, #cfeeff, #dff8ee)',
                    }}
                  />
                </div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{d.label}</div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          Tip: Duolingo-style — the point is consistency, not spikes.
        </div>
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import type { Progress } from '../lib/progress';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function ProfilePage({ progress }: { progress: Progress; setProgress: (p: Progress) => void }) {
  const goal = clamp(progress.dailyGoalXp || 20, 5, 200);
  const today = Math.max(0, progress.dailyXpToday || 0);
  const pct = useMemo(() => {
    if (goal <= 0) return 0;
    return clamp(Math.round((today / goal) * 100), 0, 100);
  }, [today, goal]);

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
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Streak</div>
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
    </div>
  );
}

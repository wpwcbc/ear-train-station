import { useEffect, useMemo, useState } from 'react';
import type { Progress } from '../lib/progress';
import { defaultProgress, loadProgress, saveProgress } from '../lib/progress';
import { defaultSettings, loadSettings, saveSettings, type Settings } from '../lib/settings';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function ProfilePage({ progress, setProgress }: { progress: Progress; setProgress: (p: Progress) => void }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const goal = clamp(progress.dailyGoalXp || 20, 5, 200);
  const today = Math.max(0, progress.dailyXpToday || 0);
  const pct = useMemo(() => {
    if (goal <= 0) return 0;
    return clamp(Math.round((today / goal) * 100), 0, 100);
  }, [today, goal]);

  function setDailyGoalXp(nextGoal: number) {
    setProgress({ ...progress, dailyGoalXp: clamp(nextGoal, 5, 200) });
  }

  function resetEverything() {
    const ok = window.confirm('Reset all progress, XP, streak, and settings? This cannot be undone.');
    if (!ok) return;

    // Progress + settings
    const p = defaultProgress();
    setProgress(p);
    saveProgress(p);

    const s = defaultSettings();
    setSettings(s);
    saveSettings(s);

    // Local review queue / study history (best-effort)
    try {
      localStorage.removeItem('ets_mistakes_v1');
      localStorage.removeItem('ets_mistakes_v2');
      localStorage.removeItem('ets_progress_v1');
      localStorage.removeItem('ets_progress_v2');
      localStorage.removeItem('ets_settings_v1');
      localStorage.removeItem('ets_settings_v2');
    } catch {
      // ignore
    }

    // Re-load once to ensure normalization for today happens.
    setProgress(loadProgress());
    setSettings(loadSettings());
  }

  return (
    <div className="page">
      <h1 className="h1">Profile</h1>
      <p className="sub">Stats + settings. (Duolingo-style stickiness: daily goal + streak.)</p>

      <div className="callout">
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
            <div style={{ border: '3px solid var(--ink)', borderRadius: 16, padding: 12, background: 'var(--card)' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Total XP</div>
              <div style={{ fontSize: 22, fontWeight: 850 }}>{progress.xp}</div>
            </div>
            <div style={{ border: '3px solid var(--ink)', borderRadius: 16, padding: 12, background: 'var(--card)' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Streak</div>
              <div style={{ fontSize: 22, fontWeight: 850 }}>{progress.streakDays} day{progress.streakDays === 1 ? '' : 's'}</div>
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {[10, 20, 30, 50].map((g) => (
                <button
                  key={g}
                  className={g === goal ? 'btnPrimary' : 'btn'}
                  onClick={() => setDailyGoalXp(g)}
                  type="button"
                  aria-pressed={g === goal}
                >
                  {g} XP
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Chord playback</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(
                  [
                    { k: 'arp', label: 'Arpeggio' },
                    { k: 'block', label: 'Block chord' },
                  ] as const
                ).map((x) => (
                  <button
                    key={x.k}
                    className={settings.chordPlayback === x.k ? 'btnPrimary' : 'btn'}
                    onClick={() => setSettings({ ...settings, chordPlayback: x.k })}
                    type="button"
                    aria-pressed={settings.chordPlayback === x.k}
                  >
                    {x.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Prompt speed</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(
                  [
                    { k: 'slow', label: 'Slow' },
                    { k: 'normal', label: 'Normal' },
                    { k: 'fast', label: 'Fast' },
                  ] as const
                ).map((x) => (
                  <button
                    key={x.k}
                    className={settings.promptSpeed === x.k ? 'btnPrimary' : 'btn'}
                    onClick={() => setSettings({ ...settings, promptSpeed: x.k })}
                    type="button"
                    aria-pressed={settings.promptSpeed === x.k}
                  >
                    {x.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ borderTop: '2px dashed rgba(0,0,0,0.25)', paddingTop: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <button className="btn" type="button" onClick={resetEverything}>
                Reset everything
              </button>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Use only if you want a fresh start.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

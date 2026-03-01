import { useEffect, useMemo, useState } from 'react';
import type { Progress } from '../lib/progress';
import { loadStreakState, STREAK_CHANGED_EVENT, type StreakStateV1 } from '../lib/streak';
import { computeXpWeekSummary } from '../lib/xpWeekSummary';

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
  const [questStreak, setQuestStreak] = useState<StreakStateV1>(() => loadStreakState());

  useEffect(() => {
    function bump() {
      setQuestStreak(loadStreakState());
    }
    window.addEventListener('focus', bump);
    window.addEventListener('storage', bump);
    window.addEventListener(STREAK_CHANGED_EVENT, bump);
    return () => {
      window.removeEventListener('focus', bump);
      window.removeEventListener('storage', bump);
      window.removeEventListener(STREAK_CHANGED_EVENT, bump);
    };
  }, []);

  const goal = clamp(progress.dailyGoalXp || 20, 5, 200);
  const today = Math.max(0, progress.dailyXpToday || 0);
  const pct = useMemo(() => {
    if (goal <= 0) return 0;
    return clamp(Math.round((today / goal) * 100), 0, 100);
  }, [today, goal]);

  const week = useMemo(() => {
    const s = computeXpWeekSummary(progress.dailyXpByYmd);
    const days = s.days.map((d) => ({ ...d, label: shortDow(new Date(`${d.ymd}T12:00:00`)) }));
    return { ...s, days };
  }, [progress.dailyXpByYmd]);

  const [selectedYmd, setSelectedYmd] = useState<string | null>(null);
  const selectedDay = useMemo(() => {
    if (!selectedYmd) return null;
    return week.days.find((d) => d.ymd === selectedYmd) || null;
  }, [selectedYmd, week.days]);

  return (
    <div className="page">
      <h1 className="h1">Profile</h1>
      <p className="sub">Stats. (Settings live behind ⚙️.)</p>

      <div className="callout">
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <div style={{ border: '3px solid var(--ink)', borderRadius: 16, padding: 12, background: 'var(--card)' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Total XP</div>
              <div style={{ fontSize: 22, fontWeight: 850 }}>{progress.xp}</div>
            </div>
            <div style={{ border: '3px solid var(--ink)', borderRadius: 16, padding: 12, background: 'var(--card)' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>XP streak (study)</div>
              <div style={{ fontSize: 22, fontWeight: 850 }}>
                {progress.streakDays} day{progress.streakDays === 1 ? '' : 's'}
              </div>
            </div>
            <div
              style={{ border: '3px solid var(--ink)', borderRadius: 16, padding: 12, background: 'var(--card)' }}
              title="Days in a row you opened the Quest chest"
            >
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Quest streak</div>
              <div style={{ fontSize: 22, fontWeight: 850 }}>
                {questStreak.streak} day{questStreak.streak === 1 ? '' : 's'}
              </div>
            </div>
            <div
              style={{ border: '3px solid var(--ink)', borderRadius: 16, padding: 12, background: 'var(--card)' }}
              title="Your best Quest streak so far"
            >
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Quest best</div>
              <div style={{ fontSize: 22, fontWeight: 850 }}>{questStreak.best}</div>
            </div>
            <div style={{ border: '3px solid var(--ink)', borderRadius: 16, padding: 12, background: 'var(--card)' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Today</div>
              <div style={{ fontSize: 22, fontWeight: 850 }}>
                {today}/{goal} XP
              </div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Quest streak only counts when you open the <b>Quest chest</b> (anti-farm).
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
              {week.totalXp} XP • {week.activeDays}/7 active days
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
            const h = Math.round((d.xp / week.maxXp) * 68);
            const isToday = d.ymd === ymdFromLocalDate(new Date());
            const isSelected = d.ymd === selectedYmd;
            return (
              <div key={d.ymd} style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setSelectedYmd((cur) => (cur === d.ymd ? null : d.ymd))}
                  aria-pressed={isSelected}
                  aria-label={`${d.label} ${d.xp} XP. ${isSelected ? 'Selected.' : 'Tap to select.'}`}
                  title={`${d.ymd}: ${d.xp} XP`}
                  style={{
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    margin: 0,
                    cursor: 'pointer',
                    width: '100%',
                    display: 'grid',
                    justifyItems: 'center',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 18,
                      height: 68,
                      borderRadius: 999,
                      border: '2px solid var(--ink)',
                      background: '#fff',
                      overflow: 'hidden',
                      boxShadow: isSelected
                        ? '0 0 0 3px rgba(255, 209, 102, 0.45)'
                        : isToday
                          ? '0 0 0 3px rgba(141, 212, 255, 0.35)'
                          : undefined,
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
                </button>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{d.label}</div>
              </div>
            );
          })}
        </div>

        {selectedDay ? (
          <div style={{ marginTop: 10, fontSize: 12 }}>
            <b>{selectedDay.label}</b> ({selectedDay.ymd}) — <b>{selectedDay.xp} XP</b>
          </div>
        ) : null}

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          {week.prevTotalXp > 0 ? (
            <>
              vs previous 7 days: {week.deltaXp >= 0 ? '+' : ''}
              {week.deltaXp} XP ({week.deltaPct}%){' '}
            </>
          ) : (
            <>vs previous 7 days: —</>
          )}
          <span style={{ marginLeft: 8 }}>Tip: consistency &gt; spikes.</span>
        </div>
      </div>
    </div>
  );
}

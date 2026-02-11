export type WorkoutSession = 1 | 2;

export function localDayKey(ts = Date.now()): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function workoutLsKey(dayKey: string, session: WorkoutSession): string {
  return `kuku:practiceWorkout:${dayKey}:${session}`;
}

export function getWorkoutDone(dayKey: string, session: WorkoutSession): boolean {
  try {
    return window.localStorage.getItem(workoutLsKey(dayKey, session)) === '1';
  } catch {
    return false;
  }
}

export function setWorkoutDone(dayKey: string, session: WorkoutSession) {
  try {
    window.localStorage.setItem(workoutLsKey(dayKey, session), '1');
  } catch {
    // ignore
  }
}

export function subDays(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split('-').map((x) => Number(x));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() - days);
  return localDayKey(dt.getTime());
}

export function getWorkoutDayDone(dayKey: string): boolean {
  // Treat 1+ sessions as “done for the day” (Duolingo-like: forgiving).
  // The per-session checkmarks still preserve the 2-session “workout” framing.
  return getWorkoutDone(dayKey, 1) || getWorkoutDone(dayKey, 2);
}

export function getWorkoutStreak(todayKey: string, maxDays = 365): number {
  let n = 0;
  for (let i = 0; i < maxDays; i++) {
    const k = subDays(todayKey, i);
    if (!getWorkoutDayDone(k)) break;
    n++;
  }
  return n;
}

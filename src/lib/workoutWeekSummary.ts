import { getWorkoutDone, localDayKey, subDays, type WorkoutSession } from './workout.ts';

export type WorkoutWeekSummaryDay = {
  ymd: string;
  sessionsDone: number; // 0..2
  done: boolean;
};

export type WorkoutWeekSummary = {
  days: WorkoutWeekSummaryDay[];
  activeDays: number; // days with >=1 session
  totalSessions: number; // total sessions done (0..14)
  prevActiveDays: number;
  deltaDays: number;
  deltaPct: number | null;
};

type GetSessionDone = (dayKey: string, session: WorkoutSession) => boolean;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function computeDay(dayKey: string, getSessionDone: GetSessionDone): WorkoutWeekSummaryDay {
  const s1 = getSessionDone(dayKey, 1);
  const s2 = getSessionDone(dayKey, 2);
  const sessionsDone = (s1 ? 1 : 0) + (s2 ? 1 : 0);
  return { ymd: dayKey, sessionsDone, done: sessionsDone > 0 };
}

/**
 * Duolingo-ish “workout” summary: last 7 days (incl. today) vs the previous 7.
 * A day counts as “active” if the user completes >= 1 session.
 */
export function computeWorkoutWeekSummary(opts?: { todayKey?: string; getSessionDone?: GetSessionDone }): WorkoutWeekSummary {
  const todayKey = opts?.todayKey ?? localDayKey();
  const getSessionDone = opts?.getSessionDone ?? getWorkoutDone;

  const days: WorkoutWeekSummaryDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const k = subDays(todayKey, i);
    days.push(computeDay(k, getSessionDone));
  }

  const activeDays = days.reduce((n, d) => n + (d.done ? 1 : 0), 0);
  const totalSessions = days.reduce((n, d) => n + d.sessionsDone, 0);

  let prevActiveDays = 0;
  for (let i = 13; i >= 7; i--) {
    const k = subDays(todayKey, i);
    const d = computeDay(k, getSessionDone);
    prevActiveDays += d.done ? 1 : 0;
  }

  const deltaDays = activeDays - prevActiveDays;
  const deltaPct = prevActiveDays > 0 ? clamp(Math.round((deltaDays / prevActiveDays) * 100), -999, 999) : null;

  return { days, activeDays, totalSessions, prevActiveDays, deltaDays, deltaPct };
}

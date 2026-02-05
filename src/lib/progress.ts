export type StationId =
  | 'S1_NOTES'
  | 'S1B_STAFF'
  | 'S1C_ACCIDENTALS'
  | 'T1B_NOTES'
  | 'T1_NOTES'
  | 'E1_NOTES'
  | 'S2_MAJOR_SCALE'
  | 'T2_MAJOR_SCALE'
  | 'S3_INTERVALS'
  | 'T3B_INTERVALS'
  | 'T3_INTERVALS'
  | 'E3_INTERVALS'
  | 'S4_TRIADS'
  | 'T5_TRIADS'
  | 'S5_DIATONIC_TRIADS'
  | 'T6_DIATONIC_TRIADS'
  | 'S6_FUNCTIONS'
  | 'T7_FUNCTIONS'
  | 'S7_DEGREES'
  | 'T4_DEGREES'
  | 'S8_DEGREE_INTERVALS'
  | 'T8_DEGREE_INTERVALS';

type ProgressV1 = {
  version: 1;
  xp: number;
  streakDays: number;
  lastStudyYmd: string | null;
  stationDone: Record<StationId, boolean>;
};

export type Progress = {
  version: 2;
  xp: number;
  streakDays: number;
  lastStudyYmd: string | null;
  /** Daily goal tracking (Duolingo-ish stickiness). */
  dailyGoalXp: number;
  dailyXpToday: number;
  dailyYmd: string | null;
  stationDone: Record<StationId, boolean>;
};

const KEY_V2 = 'ets_progress_v2';
const KEY_V1 = 'ets_progress_v1';

function normalizeProgressForToday(p: Progress): Progress {
  const ymd = todayYmd();
  // If the user opens the app on a new day but doesn't study yet,
  // we still want "Today" to show 0/goal rather than yesterday's XP.
  if (p.dailyYmd !== ymd) {
    return { ...p, dailyYmd: ymd, dailyXpToday: 0 };
  }
  return p;
}

export function loadProgress(): Progress {
  try {
    const rawV2 = localStorage.getItem(KEY_V2);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as Progress;
      if (parsed?.version === 2) {
        const merged: Progress = {
          ...defaultProgress(),
          ...parsed,
          stationDone: { ...defaultProgress().stationDone, ...(parsed.stationDone ?? {}) },
        };
        return normalizeProgressForToday(merged);
      }
    }

    // migrate v1 → v2 (keep streak/xp/stations)
    const rawV1 = localStorage.getItem(KEY_V1);
    if (rawV1) {
      const parsed1 = JSON.parse(rawV1) as ProgressV1;
      if (parsed1?.version === 1) {
        const migrated: Progress = normalizeProgressForToday({
          ...defaultProgress(),
          xp: parsed1.xp ?? 0,
          streakDays: parsed1.streakDays ?? 0,
          lastStudyYmd: parsed1.lastStudyYmd ?? null,
          stationDone: { ...defaultProgress().stationDone, ...(parsed1.stationDone ?? {}) },
        });
        // Save immediately so next load is v2.
        localStorage.setItem(KEY_V2, JSON.stringify(migrated));
        return migrated;
      }
    }

    return normalizeProgressForToday(defaultProgress());
  } catch {
    return normalizeProgressForToday(defaultProgress());
  }
}


export function saveProgress(p: Progress) {
  localStorage.setItem(KEY_V2, JSON.stringify(p));
}

export function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(ymd);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function dayIndexUtc(ymd: string): number | null {
  const p = parseYmd(ymd);
  if (!p) return null;
  // Use UTC to avoid DST/timezone drift when computing streak gaps.
  return Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 86_400_000);
}

export function applyStudyReward(p: Progress, xpGain: number): Progress {
  const ymd = todayYmd();
  const wasToday = p.lastStudyYmd === ymd;

  // Streak
  let streakDays = p.streakDays;
  if (!wasToday) {
    const todayIdx = dayIndexUtc(ymd);
    const lastIdx = p.lastStudyYmd ? dayIndexUtc(p.lastStudyYmd) : null;

    if (todayIdx != null && lastIdx != null) {
      const gap = todayIdx - lastIdx;
      if (gap === 1) streakDays = Math.max(1, streakDays + 1);
      else streakDays = 1; // missed a day (or time travel) → reset streak
    } else {
      streakDays = Math.max(1, streakDays + 1);
    }
  }

  // Daily goal progress (reset on day boundary).
  const dailyReset = p.dailyYmd !== ymd;
  const dailyXpToday = (dailyReset ? 0 : p.dailyXpToday) + xpGain;

  return {
    ...p,
    xp: p.xp + xpGain,
    streakDays,
    lastStudyYmd: ymd,
    dailyYmd: ymd,
    dailyXpToday,
  };
}

export function markStationDone(p: Progress, stationId: StationId): Progress {
  return {
    ...p,
    stationDone: { ...p.stationDone, [stationId]: true },
  };
}

export function defaultProgress(): Progress {
  return {
    version: 2,
    xp: 0,
    streakDays: 0,
    lastStudyYmd: null,
    dailyGoalXp: 20,
    dailyXpToday: 0,
    dailyYmd: null,
    stationDone: {
      S1_NOTES: false,
      S1B_STAFF: false,
      S1C_ACCIDENTALS: false,
      T1B_NOTES: false,
      T1_NOTES: false,
      E1_NOTES: false,
      S2_MAJOR_SCALE: false,
      T2_MAJOR_SCALE: false,
      S3_INTERVALS: false,
      T3B_INTERVALS: false,
      T3_INTERVALS: false,
      E3_INTERVALS: false,
      S4_TRIADS: false,
      T5_TRIADS: false,
      S5_DIATONIC_TRIADS: false,
      T6_DIATONIC_TRIADS: false,
      S6_FUNCTIONS: false,
      T7_FUNCTIONS: false,
      S7_DEGREES: false,
      T4_DEGREES: false,
      S8_DEGREE_INTERVALS: false,
      T8_DEGREE_INTERVALS: false,
    },
  };
}

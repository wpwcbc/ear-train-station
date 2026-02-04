export type StationId =
  | 'S1_NOTES'
  | 'T1_NOTES'
  | 'S2_MAJOR_SCALE'
  | 'T2_MAJOR_SCALE'
  | 'S3_INTERVALS'
  | 'T3_INTERVALS'
  | 'S4_TRIADS'
  | 'T5_TRIADS'
  | 'S5_DIATONIC_TRIADS'
  | 'S6_FUNCTIONS'
  | 'S7_DEGREES'
  | 'T4_DEGREES';

export type Progress = {
  version: 1;
  xp: number;
  streakDays: number;
  lastStudyYmd: string | null;
  stationDone: Record<StationId, boolean>;
};

const KEY = 'ets_progress_v1';

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProgress();
    const parsed = JSON.parse(raw) as Progress;
    if (parsed?.version !== 1) return defaultProgress();
    return {
      ...defaultProgress(),
      ...parsed,
      stationDone: { ...defaultProgress().stationDone, ...(parsed.stationDone ?? {}) },
    };
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p: Progress) {
  localStorage.setItem(KEY, JSON.stringify(p));
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

  return {
    ...p,
    xp: p.xp + xpGain,
    streakDays,
    lastStudyYmd: ymd,
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
    version: 1,
    xp: 0,
    streakDays: 0,
    lastStudyYmd: null,
    stationDone: {
      S1_NOTES: false,
      T1_NOTES: false,
      S2_MAJOR_SCALE: false,
      T2_MAJOR_SCALE: false,
      S3_INTERVALS: false,
      T3_INTERVALS: false,
      S4_TRIADS: false,
      T5_TRIADS: false,
      S5_DIATONIC_TRIADS: false,
      S6_FUNCTIONS: false,
      S7_DEGREES: false,
      T4_DEGREES: false,
    },
  };
}

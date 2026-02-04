export type StationId =
  | 'S1_NOTES'
  | 'T1_NOTES'
  | 'S2_MAJOR_SCALE'
  | 'T2_MAJOR_SCALE'
  | 'S3_INTERVALS'
  | 'S4_TRIADS'
  | 'S5_DIATONIC_TRIADS';

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

export function applyStudyReward(p: Progress, xpGain: number): Progress {
  const ymd = todayYmd();
  const wasToday = p.lastStudyYmd === ymd;

  let streakDays = p.streakDays;
  if (!wasToday) {
    // simple streak: if you didn't study today yet, +1
    streakDays = Math.max(1, streakDays + 1);
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
      S4_TRIADS: false,
      S5_DIATONIC_TRIADS: false,
    },
  };
}

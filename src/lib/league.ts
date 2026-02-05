import { mulberry32, shuffle } from './rng';

export type LeagueState = {
  version: 1;
  /** Week identifier, e.g. 2026-W06 */
  weekId: string;
  /** Total XP snapshot at the start of this week. */
  weekStartXp: number;
};

const KEY = 'ets_league_v1';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

/**
 * ISO-ish week number using local time, Monday as week start.
 * Good enough for a client-only “league”.
 */
export function currentWeekId(d = new Date()): string {
  // Convert to date at midnight local.
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  // Monday = 0..Sunday = 6
  const day = (dt.getDay() + 6) % 7;

  // Thursday of this week decides the year (ISO rule-of-thumb).
  dt.setDate(dt.getDate() - day + 3);
  const weekYear = dt.getFullYear();

  // First Thursday of the year.
  const firstThu = new Date(weekYear, 0, 4);
  const firstThuDay = (firstThu.getDay() + 6) % 7;
  firstThu.setDate(firstThu.getDate() - firstThuDay + 3);

  const week = 1 + Math.round((dt.getTime() - firstThu.getTime()) / 604_800_000);
  return `${weekYear}-W${pad2(week)}`;
}

export function loadLeagueState(totalXp: number, now = new Date()): LeagueState {
  const weekId = currentWeekId(now);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LeagueState;
      if (parsed?.version === 1 && parsed.weekId === weekId && typeof parsed.weekStartXp === 'number') {
        return parsed;
      }
    }
  } catch {
    // ignore
  }

  const fresh: LeagueState = { version: 1, weekId, weekStartXp: totalXp };
  saveLeagueState(fresh);
  return fresh;
}

export function saveLeagueState(s: LeagueState) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export type LeagueRow = {
  name: string;
  weeklyXp: number;
  isYou?: boolean;
};

function hashStringToSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const BOT_NAMES = [
  'ArpAndy',
  'ScaleSally',
  'ChordCora',
  'IntervalIvy',
  'TonicTom',
  'DominantDan',
  'SubDomSue',
  'MetroMika',
  'StaffStan',
  'KeySigKai',
  'TriadTess',
  'SemitoneSam',
  'WholeToneWill',
  'FermataFaye',
  'OctaveOllie',
  'MediantMina',
  'CadenceCal',
  'DiminishedDee',
  'MajorMae',
  'MinorMoe',
  'PianoPia',
  'EarEli',
  'TempoTaro',
  'HarmonyHana',
  'ScaleDegreeSid',
  'SightReadRin',
  'ChordChef',
  'V7Vera',
  'RhythmRex',
];

/**
 * Client-only fake league table (Duolingo-style): gives a sense of rank + promotion zone.
 * Deterministic per-week, so it feels consistent.
 */
export function makeLeagueTable(opts: { weekId: string; yourWeeklyXp: number; size?: number }): LeagueRow[] {
  const size = Math.max(10, Math.min(50, opts.size ?? 30));
  const seed = hashStringToSeed(opts.weekId);
  const rng = mulberry32(seed);

  // Create bots with a mildly-skewed distribution.
  const names = shuffle(BOT_NAMES.slice(), rng).slice(0, size - 1);
  const bots: LeagueRow[] = names.map((name, idx) => {
    // Base target grows a bit with rank index.
    const base = 8 + idx * 3;
    // Skew: square to make a longer tail.
    const skew = Math.pow(rng(), 0.55);
    const weeklyXp = Math.round(base + skew * 140);
    return { name, weeklyXp };
  });

  const rows: LeagueRow[] = [{ name: 'You', weeklyXp: Math.max(0, Math.round(opts.yourWeeklyXp)), isYou: true }, ...bots];
  rows.sort((a, b) => b.weeklyXp - a.weeklyXp || (a.isYou ? -1 : 1));

  // Ensure user isn't accidentally duplicated.
  return rows.slice(0, size);
}

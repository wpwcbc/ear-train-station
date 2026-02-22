import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CopyLinkButton } from '../components/CopyLinkButton';
import { useHotkeys } from '../lib/hooks/useHotkeys';
import type { Progress } from '../lib/progress';
import { applyStudyReward } from '../lib/progress';
import {
  applyReviewResult,
  loadMistakes,
  MISTAKES_CHANGED_EVENT,
  mistakeScheduleSummaryFrom,
  requiredClearStreak,
  saveMistakes,
  snoozeMistake,
  snoozeMistakeUntilLocalTime,
  snoozeMistakes,
  snoozeMistakesUntilLocalTime,
  updateMistake,
  type Mistake,
} from '../lib/mistakes';
import { bumpReviewAttempt, bumpReviewClear } from '../lib/quests';
import { SETTINGS_EVENT, loadSettings } from '../lib/settings';
import { promptSpeedFactors } from '../lib/promptTiming';
import { getWorkoutDone, localDayKey, setWorkoutDone } from '../lib/workout';
import { piano } from '../audio/piano';
import { playIntervalPrompt, playRootThenChordPrompt, playTonicTargetPrompt } from '../audio/prompts';
import { makeNoteNameReviewQuestion } from '../exercises/noteName';
import { SEMITONE_TO_LABEL, makeIntervalLabelQuestion, makeIntervalLabelReviewQuestion, intervalLongName, type IntervalLabel } from '../exercises/interval';
import { makeTriadQualityReviewQuestion, triadQualityLabel, type TriadQuality } from '../exercises/triad';
import { degreeMeaning, makeScaleDegreeNameReviewQuestion, type ScaleDegreeName } from '../exercises/scaleDegree';
import { makeMajorScaleDegreeReviewQuestion } from '../exercises/majorScale';
import { makeFunctionFamilyQuestion, type FunctionFamily } from '../exercises/functionFamily';
import { MAJOR_KEYS } from '../lib/theory/major';
import { DEFAULT_WIDE_REGISTER_MAX_MIDI, WIDE_REGISTER_MIN_MIDI, WIDE_REGISTER_RANGE_TEXT } from '../lib/registerPolicy';
import { STATIONS } from '../lib/stations';
import { mulberry32 } from '../lib/rng';
import { reviewSessionSignature } from '../lib/reviewSession';
import { recordReviewSession } from '../lib/reviewSessionHistory';

function msToHuman(ms: number): string {
  if (ms <= 0) return 'now';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

type UndoState = {
  prev: Mistake[];
  text: string;
  expiresAt: number;
};

function mistakeShortLabel(m: Mistake): string {
  if (m.kind === 'noteName') return `Note: MIDI ${m.midi}`;
  if (m.kind === 'intervalLabel') return `Interval: ${(SEMITONE_TO_LABEL[m.semitones] ?? `${m.semitones}st`)} (root MIDI ${m.rootMidi})`;
  if (m.kind === 'triadQuality') return `Triad: ${triadQualityLabel(m.quality)} (root MIDI ${m.rootMidi})`;
  if (m.kind === 'scaleDegreeName') return `Scale degree: ${m.key} — ${m.degree}`;
  if (m.kind === 'majorScaleDegree') return `Major scale: ${m.key} — ${m.degree}`;
  return `Function: ${m.key} — ${m.degree}`;
}

type SessionMissKey = string;

function sessionMissKeyFromMistake(m: Mistake): SessionMissKey {
  if (m.kind === 'intervalLabel') return `interval:${m.semitones}`;
  if (m.kind === 'triadQuality') return `triad:${m.quality}`;
  return `kind:${m.kind}`;
}

function sessionMissLabel(key: SessionMissKey): string {
  const [kind, value] = key.split(':', 2);
  if (kind === 'interval') {
    const semis = parseInt(value ?? '', 10);
    const label = SEMITONE_TO_LABEL[semis] ?? `${semis}st`;
    return `Interval ${label}`;
  }
  if (kind === 'triad') return `Triad ${triadQualityLabel((value ?? 'major') as TriadQuality)}`;
  if (kind === 'kind') return `${value}`;
  return key;
}

function topSessionMisses(misses: Record<string, number>, limit = 3): Array<{ key: SessionMissKey; count: number }> {
  return Object.entries(misses)
    .map(([key, count]) => ({ key, count }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function stationLabel(id: string): string {
  const s = STATIONS.find((x) => x.id === id);
  if (!s) return id;
  // Keep labels compact in Review.
  return s.title.replace(/^Station\s+/, 'S').replace(/^Test\s+/, 'T').replace(/^Mid-test\s+/, 'T').replace(/^\w+\s+Exam\s+—\s+/, 'Exam — ');
}

export function ReviewPage({ progress, setProgress }: { progress: Progress; setProgress: (p: Progress) => void }) {
  const loc = useLocation();
  const navigate = useNavigate();
  const inheritedState = loc.state;

  const shareTo = `${loc.pathname}${loc.search}${loc.hash || ''}`;

  const [seed, setSeed] = useState(1);
  const [searchParams] = useSearchParams();
  const stationFilter = (searchParams.get('station') || '').trim();
  const drill = (searchParams.get('drill') || '').trim();
  const drillModeRaw = drill === '1' || drill === 'true' || drill === 'yes';
  const drillKindRaw = (searchParams.get('kind') || '').trim().toLowerCase();
  const drillKind: 'interval' | 'triad' = ['triad', 'triads', 'chord', 'chords'].includes(drillKindRaw) ? 'triad' : 'interval';
  const warmup = (searchParams.get('warmup') || '').trim();
  const warmupModeRaw = warmup === '1' || warmup === 'true' || warmup === 'yes';

  const manage = (searchParams.get('manage') || '').trim();
  const manageParam = manage === '1' || manage === 'true' || manage === 'yes';
  const manageHash = (loc.hash || '').trim().toLowerCase() === '#manage';
  const manageMode = manageParam || manageHash;

  function setManageUrl(open: boolean) {
    const next = new URLSearchParams(searchParams);
    if (open) {
      next.set('manage', '1');
    } else {
      next.delete('manage');
    }

    const qs = next.toString();
    const hash = open ? '#manage' : '';
    navigate({ pathname: '/review', search: qs ? `?${qs}` : '', hash }, { replace: true, state: inheritedState });
  }

  // Deep-linking into Manage should never be blocked by drill/warm-up query params.
  const drillMode = drillModeRaw && !manageMode;
  const warmupMode = warmupModeRaw && !manageMode;

  // Optional “hard-focus”: practice only harder items (wrongCount>=3).
  // Kept as a deep-link param (knowledge-only; no new settings surface).
  const hardRaw = (searchParams.get('hard') || '').trim();
  const hardModeRaw = hardRaw === '1' || hardRaw === 'true' || hardRaw === 'yes';
  const hardMode = hardModeRaw && !manageMode && !drillMode;

  // Optional session length (e.g. “quick warm‑up”):
  // - Default stays 10 (Duolingo-ish mistakes sessions often cap at ~10 items).
  // - Clamp to avoid huge accidental values.
  const nRaw = (searchParams.get('n') || '').trim();
  const sessionN = (() => {
    const n = parseInt(nRaw, 10);
    if (!Number.isFinite(n)) return 10;
    return Math.max(3, Math.min(30, n));
  })();
  const nQS = nRaw ? `&n=${sessionN}` : '';

  // Convenience: quick deep-link session sizes (knowledge-only; no UI settings).
  const reviewLinkWithN = (n: number) => {
    const next = new URLSearchParams(searchParams);
    // Avoid accidentally forcing Manage open when the user is just changing set size.
    next.delete('manage');
    next.set('n', String(n));
    const qs = next.toString();
    return `/review${qs ? `?${qs}` : ''}`;
  };

  const reviewLinkWithHard = (on: boolean) => {
    const next = new URLSearchParams(searchParams);
    next.delete('manage');
    if (on) next.set('hard', '1');
    else next.delete('hard');
    const qs = next.toString();
    return `/review${qs ? `?${qs}` : ''}`;
  };

  const workoutRaw = (searchParams.get('workout') || '').trim();
  const workoutSession: 1 | 2 | null = workoutRaw === '1' ? 1 : workoutRaw === '2' ? 2 : null;
  const practiceDoneTo = workoutSession ? `/practice?workoutDone=${workoutSession}` : null;

  const drillSemisRaw = (searchParams.get('semitones') || '').trim();
  const drillQualRaw = (searchParams.get('qualities') || '').trim();
  const drillSemitones = drillSemisRaw
    ? drillSemisRaw
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n >= 0 && n <= 24)
    : [];
  const [settings, setSettings] = useState(() => loadSettings());
  const chordMode: 'block' | 'arp' = 'block';
  const speed = settings.promptSpeed;
  const timing = useMemo(() => promptSpeedFactors(speed), [speed]);
  const dur = (sec: number) => sec * timing.dur;
  const gap = (ms: number) => Math.round(ms * timing.gap);
  const [result, setResult] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [doneCount, setDoneCount] = useState(0);
  const [sessionRight, setSessionRight] = useState(0);
  const [sessionWrong, setSessionWrong] = useState(0);
  const [sessionSkip, setSessionSkip] = useState(0);
  const [sessionXp, setSessionXp] = useState(0);
  const [sessionMisses, setSessionMisses] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());
  const [mistakes, setMistakes] = useState<Mistake[]>(() => loadMistakes());
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [expandedKinds, setExpandedKinds] = useState<Record<string, boolean>>({});
  const [workoutBonusAwarded, setWorkoutBonusAwarded] = useState(0);

  const manageRef = useRef<HTMLDetailsElement | null>(null);
  const recordedSessionSigRef = useRef<string | null>(null);
  const [manageOpen, setManageOpen] = useState<boolean>(() => manageMode);

  useEffect(() => {
    if (!manageMode) return;
    // If we were deep-linked here, ensure it’s open and visible.
    setManageOpen(true);
    // Let layout settle before scrolling.
    const t = window.setTimeout(() => {
      manageRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 50);
    return () => window.clearTimeout(t);
  }, [manageMode]);

  // Keep the review queue reactive: update on focus/storage, and wake up when the next item becomes due.
  useEffect(() => {
    function bump() {
      setNow(Date.now());
      setMistakes(loadMistakes());
      setSettings(loadSettings());
    }

    window.addEventListener('focus', bump);
    window.addEventListener('storage', bump);
    window.addEventListener(SETTINGS_EVENT, bump);
    window.addEventListener(MISTAKES_CHANGED_EVENT, bump);
    return () => {
      window.removeEventListener('focus', bump);
      window.removeEventListener('storage', bump);
      window.removeEventListener(SETTINGS_EVENT, bump);
      window.removeEventListener(MISTAKES_CHANGED_EVENT, bump);
    };
  }, []);

  const sessionSig = useMemo(() => reviewSessionSignature({ search: loc.search, hash: loc.hash }), [loc.search, loc.hash]);

  const sessionAttempts = sessionRight + sessionWrong;
  const sessionAccuracyPct = sessionAttempts > 0 ? Math.round((100 * sessionRight) / sessionAttempts) : 0;
  const topMisses = useMemo(() => topSessionMisses(sessionMisses, 3), [sessionMisses]);

  const topMissDrillTo = useMemo(() => {
    if (topMisses.length === 0) return null as string | null;
    const keys = topMisses.map((x) => x.key);
    const stationQS = stationFilter ? `&station=${encodeURIComponent(stationFilter)}` : '';

    const interval = keys.filter((k) => k.startsWith('interval:')).map((k) => parseInt(k.split(':')[1] ?? '', 10)).filter((n) => Number.isFinite(n));
    if (interval.length === keys.length) {
      return `/review?drill=1&kind=interval&semitones=${interval.join(',')}${stationQS}&n=${sessionN}`;
    }

    const triad = keys.filter((k) => k.startsWith('triad:')).map((k) => (k.split(':')[1] ?? '').trim()).filter(Boolean);
    if (triad.length === keys.length) {
      return `/review?drill=1&kind=triad&qualities=${triad.join(',')}${stationQS}&n=${sessionN}`;
    }

    return `/review?drill=1${stationQS}&n=${sessionN}`;
  }, [topMisses, stationFilter, sessionN]);

  // Reset per-session counters when *session-defining* URL params change
  // (so switching filters/modes starts a fresh set, but unrelated query params won't).
  useEffect(() => {
    setResult('idle');
    setDoneCount(0);
    setSessionRight(0);
    setSessionWrong(0);
    setSessionSkip(0);
    setSessionXp(0);
    setSessionMisses({});
    recordedSessionSigRef.current = null;

    // Drill-only state
    setDrillIndex(0);
    setDrillCorrect(0);
    setDrillWrong(0);

    // New random seed so the first prompt changes when toggling filters.
    setSeed((x) => x + 1);
  }, [sessionSig]);

  // Auto-clear the Undo window after ~15s so we don't keep stale actions around.
  useEffect(() => {
    if (!undo) return;
    const ms = Math.max(0, undo.expiresAt - Date.now());
    const t = window.setTimeout(() => setUndo(null), ms);
    return () => window.clearTimeout(t);
  }, [undo]);

  function armUndo(prev: Mistake[], text: string) {
    setUndo({ prev, text, expiresAt: Date.now() + 15_000 });
  }

  const filtered = useMemo(() => {
    if (!stationFilter) return mistakes;
    return mistakes.filter((m) => m.sourceStationId === stationFilter);
  }, [mistakes, stationFilter]);

  const due = useMemo(() => {
    return filtered
      .filter((m) => (m.dueAt ?? 0) <= now)
      .sort((a, b) => (a.dueAt ?? a.addedAt) - (b.dueAt ?? b.addedAt) || b.addedAt - a.addedAt);
  }, [filtered, now]);

  const dueHard = useMemo(() => due.filter((m) => (m.wrongCount ?? 0) >= 3), [due]);

  const hardClearsRemaining = useMemo(() => {
    // “Hard” items need a longer correct streak to clear (currently 3 in a row).
    // Surface the remaining clears so Review feels more “live” and less mysterious.
    return dueHard.reduce((acc, m) => {
      const need = requiredClearStreak(m);
      const have = m.correctStreak ?? 0;
      return acc + Math.max(0, need - have);
    }, 0);
  }, [dueHard]);

  // Warm-up: when nothing is due, let users optionally practice a short set early.
  // Inspired by Duolingo's behavior: if you have no "new" mistakes, you can still run a short session with older ones.
  const warmupQueue = useMemo(() => {
    if (!warmupMode) return [] as Mistake[];
    // Prefer "hard" mistakes (wrongCount) and items due sooner.
    return filtered
      .slice()
      .sort((a, b) => {
        const aw = a.wrongCount ?? 0;
        const bw = b.wrongCount ?? 0;
        if (bw !== aw) return bw - aw;
        return (a.dueAt ?? a.addedAt) - (b.dueAt ?? b.addedAt);
      })
      .slice(0, sessionN);
  }, [filtered, warmupMode, sessionN]);

  const warmupHardQueue = useMemo(() => warmupQueue.filter((m) => (m.wrongCount ?? 0) >= 3), [warmupQueue]);

  const intervalStats = useMemo(() => {
    const map = new Map<number, { semitones: number; count: number; weight: number }>();
    for (const m of filtered) {
      if (m.kind !== 'intervalLabel') continue;
      const w = 1 + (m.wrongCount ?? 0) * 2;
      const cur = map.get(m.semitones) ?? { semitones: m.semitones, count: 0, weight: 0 };
      cur.count += 1;
      cur.weight += w;
      map.set(m.semitones, cur);
    }
    return [...map.values()].sort((a, b) => b.weight - a.weight || b.count - a.count || a.semitones - b.semitones);
  }, [filtered]);


  const triadStats = useMemo(() => {
    const map = new Map<TriadQuality, { quality: TriadQuality; count: number; weight: number }>();
    for (const m of filtered) {
      if (m.kind !== 'triadQuality') continue;
      const key = m.quality;
      const prev = map.get(key) ?? { quality: key, count: 0, weight: 0 };
      const w = 1 + Math.min(5, m.wrongCount ?? 0);
      prev.count += 1;
      prev.weight += w;
      map.set(key, prev);
    }

    return [...map.values()].sort((a, b) => b.weight - a.weight || b.count - a.count);
  }, [filtered]);

  const mistakeKindStats = useMemo(() => {
    const map = new Map<Mistake['kind'], { kind: Mistake['kind']; total: number; due: number }>();
    for (const m of filtered) {
      const cur = map.get(m.kind) ?? { kind: m.kind, total: 0, due: 0 };
      cur.total += 1;
      if ((m.dueAt ?? 0) <= now) cur.due += 1;
      map.set(m.kind, cur);
    }
    const order: Mistake['kind'][] = ['intervalLabel', 'noteName', 'triadQuality', 'scaleDegreeName', 'majorScaleDegree', 'functionFamily'];
    return [...map.values()].sort((a, b) => {
      const ai = order.indexOf(a.kind);
      const bi = order.indexOf(b.kind);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || b.due - a.due || b.total - a.total;
    });
  }, [filtered, now]);

  const drillFocusSemitones = useMemo(() => {
    if (!drillMode) return [] as number[];
    if (drillSemitones.length > 0) return drillSemitones;
    return intervalStats.slice(0, 3).map((x) => x.semitones);
  }, [drillMode, drillSemitones, intervalStats]);


  const drillFocusQualities = useMemo(() => {
    if (!drillMode) return [] as TriadQuality[];
    if (drillKind !== 'triad') return [] as TriadQuality[];

    if (drillQualRaw) {
      const items = drillQualRaw
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
      const allowed = items.filter((x): x is TriadQuality => x === 'major' || x === 'minor' || x === 'diminished');
      // de-dup preserving order
      const seen = new Set<string>();
      const out: TriadQuality[] = [];
      for (const x of allowed) {
        if (seen.has(x)) continue;
        seen.add(x);
        out.push(x);
      }
      return out;
    }

    return triadStats.slice(0, 2).map((x) => x.quality);
  }, [drillMode, drillKind, drillQualRaw, triadStats]);

  const DRILL_TOTAL = sessionN;
  const [drillIndex, setDrillIndex] = useState(0);
  const [drillCorrect, setDrillCorrect] = useState(0);
  const [drillWrong, setDrillWrong] = useState(0);

  useEffect(() => {
    if (!drillMode) return;
    setResult('idle');
    setDrillIndex(0);
    setDrillCorrect(0);
    setDrillWrong(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drillMode, drillKind, drillSemisRaw, drillQualRaw, stationFilter, sessionN]);

  const drillIlQ = useMemo(() => {
    if (!drillMode) return null;
    if (drillKind !== 'interval') return null;
    if (drillFocusSemitones.length === 0) return null;
    if (drillIndex >= DRILL_TOTAL) return null;
    // Tests/exams: wide register (>= G2). Keep drills aligned with that.
    return makeIntervalLabelQuestion({
      seed: seed * 10_000 + 7000 + drillIndex,
      rootMinMidi: WIDE_REGISTER_MIN_MIDI, // G2
      rootMaxMidi: DEFAULT_WIDE_REGISTER_MAX_MIDI,
      allowedSemitones: drillFocusSemitones,
      choiceCount: 6,
    });
  }, [drillMode, drillKind, drillFocusSemitones, drillIndex, seed]);

  const drillTriadQ = useMemo(() => {
    if (!drillMode) return null;
    if (drillKind !== 'triad') return null;
    if (drillFocusQualities.length === 0) return null;
    if (drillIndex >= DRILL_TOTAL) return null;

    // Tests/exams: wide register (>= G2). Keep drills aligned with that.
    const maxTriadInterval = 7;
    const span = Math.max(1, (DEFAULT_WIDE_REGISTER_MAX_MIDI - maxTriadInterval) - WIDE_REGISTER_MIN_MIDI + 1);

    // Use deterministic RNG (instead of modulo cycling) so roots feel less “patterny” across sessions.
    const rng = mulberry32(seed * 10_000 + 7100 + drillIndex);
    const rootMidi = WIDE_REGISTER_MIN_MIDI + Math.floor(rng() * span);

    const q = drillFocusQualities[(seed + drillIndex) % drillFocusQualities.length] ?? drillFocusQualities[0]!;

    return makeTriadQualityReviewQuestion({
      seed: seed * 10_000 + 7200 + drillIndex,
      rootMidi,
      quality: q,
      choiceCount: 3,
    });
  }, [drillMode, drillKind, drillFocusQualities, drillIndex, seed, DRILL_TOTAL]);

  const active = (drillMode
    ? undefined
    : ((warmupMode
        ? (hardMode ? (warmupHardQueue[0] ?? warmupQueue[0]) : warmupQueue[0])
        : (hardMode ? (dueHard[0] ?? due[0]) : due[0])) as Mistake | undefined)) as Mistake | undefined;

  // Persist a lightweight session history (best-effort) once the session completes.
  useEffect(() => {
    const attemptsNonDrill = sessionRight + sessionWrong + sessionSkip;
    const completed = drillMode ? drillIndex >= DRILL_TOTAL && (drillCorrect + drillWrong > 0) : !active && attemptsNonDrill > 0;
    if (!completed) return;
    if (recordedSessionSigRef.current === sessionSig) return;

    recordedSessionSigRef.current = sessionSig;

    const mode = drillMode ? 'drill' : warmupMode ? 'warmup' : 'review';
    const xpTotal = sessionXp + workoutBonusAwarded;

    recordReviewSession({
      v: 1,
      at: Date.now(),
      mode,
      station: stationFilter || undefined,
      n: sessionN,
      hard: hardMode,
      right: drillMode ? drillCorrect : sessionRight,
      wrong: drillMode ? drillWrong : sessionWrong,
      skip: drillMode ? 0 : sessionSkip,
      xp: xpTotal,
    });
  }, [
    active,
    drillMode,
    warmupMode,
    hardMode,
    stationFilter,
    sessionN,
    sessionSig,
    DRILL_TOTAL,
    drillIndex,
    drillCorrect,
    drillWrong,
    sessionRight,
    sessionWrong,
    sessionSkip,
    sessionXp,
    workoutBonusAwarded,
  ]);

  const noteQ = useMemo(() => {
    if (!active || active.kind !== 'noteName') return null;
    return makeNoteNameReviewQuestion({ seed: seed * 1000 + 901, midi: active.midi, choiceCount: 4 });
  }, [active, seed]);

  const ilQ = useMemo(() => {
    if (!active || active.kind !== 'intervalLabel') return null;
    return makeIntervalLabelReviewQuestion({
      seed: seed * 1000 + 902,
      rootMidi: active.rootMidi,
      semitones: active.semitones,
      choiceCount: 6,
    });
  }, [active, seed]);

  const triadQ = useMemo(() => {
    if (!active || active.kind !== 'triadQuality') return null;
    return makeTriadQualityReviewQuestion({
      seed: seed * 1000 + 903,
      rootMidi: active.rootMidi,
      quality: active.quality,
      choiceCount: 3,
    });
  }, [active, seed]);

  const degQ = useMemo(() => {
    if (!active || active.kind !== 'scaleDegreeName') return null;
    return makeScaleDegreeNameReviewQuestion({
      seed: seed * 1000 + 904,
      key: active.key,
      degree: active.degree,
      choiceCount: 6,
    });
  }, [active, seed]);

  const msQ = useMemo(() => {
    if (!active || active.kind !== 'majorScaleDegree') return null;
    const key = (MAJOR_KEYS.find((k) => k.key === active.key)?.key ?? MAJOR_KEYS[0]?.key ?? 'C') as (typeof MAJOR_KEYS)[number]['key'];
    return makeMajorScaleDegreeReviewQuestion({
      seed: seed * 1000 + 9041,
      key,
      degree: active.degree,
      choiceCount: 6,
    });
  }, [active, seed]);

  const ffQ = useMemo(() => {
    if (!active || active.kind !== 'functionFamily') return null;
    const key = (MAJOR_KEYS.find((k) => k.key === active.key)?.key ?? MAJOR_KEYS[0]?.key ?? 'C') as (typeof MAJOR_KEYS)[number]['key'];
    return makeFunctionFamilyQuestion({
      seed: seed * 1000 + 905,
      key,
      degree: active.degree,
      tonicMidi: active.tonicMidi,
    });
  }, [active, seed]);

  async function playPrompt() {
    setResult('idle');

    const intervalPromptMode = settings.intervalPromptMode;
    const intervalHarmonicAlsoMelodic = settings.intervalHarmonicAlsoMelodic;
    const intervalHarmonicHelperWhen = settings.intervalHarmonicHelperWhen;
    const intervalHarmonicHelperDelayMs = settings.intervalHarmonicHelperDelayMs;

    const harmonicAlsoMelodic = intervalPromptMode === 'harmonic' && intervalHarmonicAlsoMelodic && intervalHarmonicHelperWhen !== 'onMiss';

    if (drillMode) {
      if (drillKind === 'interval') {
        if (!drillIlQ) return;
        await playIntervalPrompt(drillIlQ.rootMidi, drillIlQ.targetMidi, {
          mode: intervalPromptMode,
          harmonicAlsoMelodic: harmonicAlsoMelodic,
          harmonicHelperDelayMs: gap(intervalHarmonicHelperDelayMs),
          gapMs: gap(320),
          rootDurationSec: dur(0.7),
          targetDurationSec: dur(0.95),
        });
        return;
      }

      if (!drillTriadQ) return;
      await playRootThenChordPrompt(drillTriadQ.chordMidis, {
        mode: chordMode,
        rootDurationSec: dur(0.65),
        chordDurationSec: dur(1.1),
        gapBeforeChordMs: gap(240),
        gapMs: gap(130),
      });
      return;
    }

    if (!active) return;

    if (active.kind === 'noteName') {
      await piano.playMidi(active.midi, { durationSec: dur(0.9), velocity: 0.95 });
      return;
    }

    if (active.kind === 'intervalLabel') {
      await playIntervalPrompt(active.rootMidi, active.rootMidi + active.semitones, {
        mode: intervalPromptMode,
        harmonicAlsoMelodic: harmonicAlsoMelodic,
        harmonicHelperDelayMs: gap(intervalHarmonicHelperDelayMs),
        gapMs: gap(320),
        rootDurationSec: dur(0.7),
        targetDurationSec: dur(0.95),
      });
      return;
    }

    if (active.kind === 'scaleDegreeName' && degQ) {
      await playTonicTargetPrompt(degQ.tonicMidi, degQ.targetMidi, { gapMs: gap(260), tonicDurationSec: dur(0.7), targetDurationSec: dur(0.9) });
      return;
    }

    if (active.kind === 'majorScaleDegree' && msQ) {
      await playTonicTargetPrompt(msQ.tonicMidi, msQ.targetMidi, { gapMs: gap(260), tonicDurationSec: dur(0.7), targetDurationSec: dur(0.9) });
      return;
    }

    if (active.kind === 'functionFamily' && ffQ) {
      await playRootThenChordPrompt(ffQ.chordMidis, {
        mode: chordMode,
        rootDurationSec: dur(0.65),
        chordDurationSec: dur(1.1),
        gapBeforeChordMs: gap(240),
        gapMs: gap(130),
      });
      return;
    }

    // triadQuality
    if (triadQ) {
      await playRootThenChordPrompt(triadQ.chordMidis, {
        mode: chordMode,
        rootDurationSec: dur(0.65),
        chordDurationSec: dur(1.1),
        gapBeforeChordMs: gap(240),
        gapMs: gap(130),
      });
    }
  }

  function refresh() {
    setResult('idle');
    setNow(() => Date.now());
    setSeed((x) => x + 1);
    setMistakes(loadMistakes());
  }

  function applyOutcome(outcome: 'correct' | 'wrong') {
    if (!active) return;

    // Quests: count the attempt regardless of correctness.
    bumpReviewAttempt(1);

    if (outcome === 'correct') {
      setSessionRight((n) => n + 1);
    } else {
      setSessionWrong((n) => n + 1);
      const key = sessionMissKeyFromMistake(active);
      setSessionMisses((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
    }

    let cleared = false;
    updateMistake(active.id, (m) => {
      const next = applyReviewResult(m, outcome, Date.now());
      cleared = next == null;
      return next;
    });

    if (outcome === 'correct' && cleared) {
      bumpReviewClear(1);
      setProgress(applyStudyReward(progress, 4));
      setSessionXp((x) => x + 4);
      setResult('correct');
      setDoneCount((n) => n + 1);
    } else {
      setResult(outcome);
    }

    // Force a fresh localStorage read.
    refresh();
  }

  function applyDrillOutcome(outcome: 'correct' | 'wrong') {
    if (!drillMode) return;

    if (outcome === 'correct') {
      setDrillCorrect((n) => n + 1);
      setResult('correct');
    } else {
      setDrillWrong((n) => n + 1);
      setResult('wrong');

      if (drillKind === 'interval' && drillIlQ) {
        const key = `interval:${drillIlQ.semitones}`;
        setSessionMisses((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
      }
      if (drillKind === 'triad' && drillTriadQ) {
        const key = `triad:${drillTriadQ.quality}`;
        setSessionMisses((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
      }
    }

    // Advance immediately; drills are fast + continuous.
    setTimeout(() => {
      setResult('idle');
      setSeed((x) => x + 1);
      setDrillIndex((i) => i + 1);
    }, 80);
  }

  async function chooseNote(choice: string) {
    if (!noteQ || !active || active.kind !== 'noteName') return;
    const ok = noteQ.acceptedAnswers.includes(choice);
    applyOutcome(ok ? 'correct' : 'wrong');
  }

  async function chooseInterval(choice: IntervalLabel) {
    if (drillMode) {
      if (!drillIlQ) return;
      const ok = choice === drillIlQ.correct;
      applyDrillOutcome(ok ? 'correct' : 'wrong');
      return;
    }

    if (!ilQ || !active || active.kind !== 'intervalLabel') return;
    const ok = choice === ilQ.correct;
    applyOutcome(ok ? 'correct' : 'wrong');
  }

  async function chooseTriad(choice: TriadQuality) {
    if (drillMode) {
      if (!drillTriadQ) return;
      const ok = choice === drillTriadQ.quality;
      applyDrillOutcome(ok ? 'correct' : 'wrong');
      return;
    }

    if (!triadQ || !active || active.kind !== 'triadQuality') return;
    const ok = choice === triadQ.quality;
    applyOutcome(ok ? 'correct' : 'wrong');
  }

  async function chooseDegree(choice: ScaleDegreeName) {
    if (!degQ || !active || active.kind !== 'scaleDegreeName') return;
    const ok = choice === degQ.correct;
    applyOutcome(ok ? 'correct' : 'wrong');
  }

  async function chooseMajorScale(choice: string) {
    if (!msQ || !active || active.kind !== 'majorScaleDegree') return;
    const ok = choice === msQ.correct;
    applyOutcome(ok ? 'correct' : 'wrong');
  }

  async function chooseFamily(choice: FunctionFamily) {
    if (!ffQ || !active || active.kind !== 'functionFamily') return;
    const ok = choice === ffQ.family;
    applyOutcome(ok ? 'correct' : 'wrong');
  }

  const dueCount = due.length;
  const totalCount = filtered.length;

  const sched = useMemo(() => mistakeScheduleSummaryFrom(filtered, now), [filtered, now]);
  const nextDue = sched.nextDueAt;

  // If Review was launched as a “workout session” from Practice Hub,
  // mark it as done once the user reaches a natural completion state.
  // (So the Practice Hub checkmark doesn't depend on a specific exit link.)
  const workoutComplete =
    (drillMode &&
      ((drillKind === 'interval' && drillFocusSemitones.length > 0 && drillIndex >= DRILL_TOTAL && !drillIlQ) ||
        (drillKind === 'triad' && drillFocusQualities.length > 0 && drillIndex >= DRILL_TOTAL && !drillTriadQ))) ||
    (!drillMode && warmupMode && !active && warmupQueue.length > 0 && doneCount > 0) ||
    (!drillMode && !warmupMode && !active && dueCount === 0 && doneCount > 0);

  // “End screen” completion state (Duolingo-ish): only show once the user actually attempted something.
  const attemptsNonDrill = sessionRight + sessionWrong + sessionSkip;
  const sessionComplete = drillMode
    ? drillIndex >= DRILL_TOTAL && drillCorrect + drillWrong > 0
    : !active && attemptsNonDrill > 0;

  const sessionXpTotal = sessionXp + workoutBonusAwarded;

  const sessionCompleteTitle = drillMode ? 'Drill complete' : warmupMode ? 'Warm‑up complete' : 'Review complete';
  const sessionCompleteSubtitle = drillMode
    ? 'Nice work — keep it fast and focused.'
    : warmupMode
      ? 'That’s a clean warm‑up. Small reps add up.'
      : 'Nice work — consistency beats intensity.';

  const nextDueIn = nextDue != null ? msToHuman(nextDue - now) : null;

  // Duolingo-ish: completing a workout session grants a small XP bonus once per session per day.
  const WORKOUT_BONUS_XP = 8;

  useEffect(() => {
    if (!workoutSession) return;
    if (!workoutComplete) return;

    const dayKey = localDayKey();
    const already = getWorkoutDone(dayKey, workoutSession);

    // Always mark as done (idempotent).
    setWorkoutDone(dayKey, workoutSession);

    // Only award once per (day, session).
    if (!already) {
      setProgress(applyStudyReward(progress, WORKOUT_BONUS_XP));
      setWorkoutBonusAwarded(WORKOUT_BONUS_XP);
    }
  }, [workoutComplete, workoutSession, progress, setProgress]);

  useEffect(() => {
    if (nextDue == null) return;
    const at = nextDue;
    const delay = Math.max(0, at - Date.now()) + 25;

    const t = window.setTimeout(() => {
      setNow(Date.now());
      setMistakes(loadMistakes());
    }, delay);
    return () => window.clearTimeout(t);
  }, [nextDue]);

  // Hotkeys: Space/Enter = Play, Backspace = Skip, 1..9 = choose.
  useHotkeys({
    enabled: true,
    onPrimary: () => {
      void playPrompt();
    },
    onSecondary: () => {
      if (drillMode) {
        if (drillKind === 'interval' && !drillIlQ) return;
        if (drillKind === 'triad' && !drillTriadQ) return;
        setResult('idle');
        setSeed((x) => x + 1);
        setDrillIndex((i) => i + 1);
        return;
      }

      if (!active) return;
      snoozeMistake(active.id, 5 * 60_000);
      refresh();
    },
    onChoiceIndex: (idx) => {
      if (drillMode) {
        if (drillKind === 'interval') {
          if (!drillIlQ) return;
          const c = drillIlQ.choices[idx];
          if (c) void chooseInterval(c);
          return;
        }

        if (!drillTriadQ) return;
        const c = drillTriadQ.choices[idx];
        if (c) void chooseTriad(c);
        return;
      }

      if (!active) return;
      if (active.kind === 'noteName' && noteQ) {
        const c = noteQ.choices[idx];
        if (c) void chooseNote(c);
        return;
      }
      if (active.kind === 'intervalLabel' && ilQ) {
        const c = ilQ.choices[idx];
        if (c) void chooseInterval(c);
        return;
      }
      if (active.kind === 'triadQuality' && triadQ) {
        const c = triadQ.choices[idx];
        if (c) void chooseTriad(c);
        return;
      }
      if (active.kind === 'scaleDegreeName' && degQ) {
        const c = degQ.choices[idx];
        if (c) void chooseDegree(c);
        return;
      }
      if (active.kind === 'majorScaleDegree' && msQ) {
        const c = msQ.choices[idx];
        if (c) void chooseMajorScale(c);
        return;
      }
      if (active.kind === 'functionFamily' && ffQ) {
        const c = ffQ.choices[idx];
        if (c) void chooseFamily(c);
      }
    },
  });

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div>
          <h1 className="title">{drillMode ? 'Review Drill' : warmupMode ? 'Warm‑up Review' : 'Review'}</h1>
          <p className="sub">
            {drillMode
              ? drillKind === 'triad'
                ? `Targeted triad-quality drills from your mistakes (wide register: ${WIDE_REGISTER_RANGE_TEXT}).`
                : `Targeted interval drills from your mistakes (wide register: ${WIDE_REGISTER_RANGE_TEXT}).`
              : warmupMode
                ? 'A quick warm‑up set from your queue (even if nothing is due yet).'
                : 'Spaced review of missed items. Clear an item by getting it right twice in a row (streak 2/2).'}
          </p>
          {drillMode ? (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
              Tip: lessons stay stable; drills/tests roam wider so your ears generalize.
            </div>
          ) : null}
          {stationFilter ? (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
              Filter: <b title={stationFilter}>{stationLabel(stationFilter)}</b> · <Link to="/review">Show all</Link>
            </div>
          ) : null}
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, opacity: 0.85 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
            <CopyLinkButton to={shareTo} label="Copy this review link" />
          </div>
          {drillMode ? (
            <>
              <div>
                Progress: {Math.min(drillIndex, DRILL_TOTAL)} / {DRILL_TOTAL}
              </div>
              <div>
                Score: {drillCorrect} ✓ · {drillWrong} ✗
              </div>
            </>
          ) : (
            <>
              {warmupMode ? (
                <div>
                  Warm‑up: {Math.min(doneCount, warmupQueue.length)} / {warmupQueue.length}
                </div>
              ) : (
                <div>
                  Due: {dueCount} / {totalCount}
                </div>
              )}
              {!drillMode && !warmupMode && dueHard.length ? (
                <div title="Hard = wrongCount≥3. Each hard item needs 3 correct clears in a row.">
                  Hard due: {dueHard.length} · Clears left: {hardClearsRemaining}
                </div>
              ) : null}
              <div>Cleared: {doneCount}</div>
              <div style={{ opacity: 0.85 }} title="This session">
                Session: {sessionAccuracyPct}% · {sessionRight} ✓ · {sessionWrong} ✗ · {sessionSkip} skip · +{sessionXp} XP
              </div>
            </>
          )}
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="primary" disabled={drillMode ? (drillKind === 'interval' ? !drillIlQ : !drillTriadQ) : !active} onClick={playPrompt}>
            {(drillMode && drillKind === 'interval') || active?.kind === 'intervalLabel'
              ? `Play (${settings.intervalPromptMode === 'harmonic' ? 'Harmonic' : 'Melodic'})`
              : 'Play'}
          </button>
          <div style={{ fontSize: 12, opacity: 0.78, display: 'inline-flex', alignItems: 'center' }}>
            Settings live behind ⚙️
          </div>
          <button
            className="ghost"
            onClick={() => {
              if (drillMode) {
                setResult('idle');
                setSeed((x) => x + 1);
                setDrillIndex(0);
                setDrillCorrect(0);
                setDrillWrong(0);
                return;
              }
              refresh();
            }}
          >
            Refresh
          </button>
          <button
            className="ghost"
            onClick={() => {
              if (drillMode) {
                if (!drillIlQ) return;
                setResult('idle');
                setSeed((x) => x + 1);
                setDrillIndex((i) => i + 1);
                return;
              }
              if (!active) return;
              setSessionSkip((n) => n + 1);
              // Push it back a bit so the next due item can surface.
              snoozeMistake(active.id, 5 * 60_000);
              refresh();
            }}
            disabled={drillMode ? (drillKind === 'interval' ? !drillIlQ : !drillTriadQ) : !active}
            title={drillMode ? 'Skip (next drill question)' : 'Skip this item for now (snooze 5 minutes)'}
          >
            Skip
          </button>
        </div>
        <Link className="linkBtn" to="/">
          Back
        </Link>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
        Hotkeys: Space/Enter = Play • 1–9 = Answer • Backspace = Skip
      </div>

      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.78, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span title="Deep-link override: ?n=5 (or 3–30) to change the session length.">Session size:</span>
        {[5, 10, 20].map((n) => (
          <Link
            key={n}
            className="pill"
            to={reviewLinkWithN(n)}
            state={inheritedState}
            style={{ fontSize: 12 }}
            title={`Start a ${n}-item set (shareable link)`}
          >
            {n}{sessionN === n ? ' ✓' : ''}
          </Link>
        ))}
        <span style={{ opacity: 0.5 }}>•</span>
        <Link
          className="pill"
          to={reviewLinkWithHard(!hardMode)}
          state={inheritedState}
          style={{ fontSize: 12 }}
          title={hardMode ? 'Disable hard-focus (show full queue)' : 'Hard-focus: only items with wrongCount≥3'}
        >
          {hardMode ? 'Hard ✓' : 'Hard'}
        </Link>
        {nRaw ? (
          <span style={{ opacity: 0.85 }} title="You’re currently using a custom n=… in the URL.">
            (n={sessionN})
          </span>
        ) : null}
      </div>

      {sessionComplete ? (
        <div className="card" style={{ marginTop: 12, border: '1px solid rgba(141, 212, 255, 0.6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900 }}>{sessionCompleteTitle}</div>
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.85 }}>{sessionCompleteSubtitle}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 12, opacity: 0.85 }}>
              <div>
                Accuracy: <b>{sessionAccuracyPct}%</b>
              </div>
              <div>
                {drillMode ? (
                  <span>
                    {drillCorrect} ✓ · {drillWrong} ✗
                  </span>
                ) : (
                  <span>
                    {sessionRight} ✓ · {sessionWrong} ✗ · {sessionSkip} skip
                  </span>
                )}
              </div>
              <div>
                XP: <b>+{sessionXpTotal}</b>
                {workoutBonusAwarded ? <span style={{ marginLeft: 6, opacity: 0.8 }}>(incl. +{workoutBonusAwarded} workout)</span> : null}
              </div>
            </div>
          </div>

          {!drillMode && !warmupMode ? (
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
              {dueCount === 0 ? (
                <span>
                  Queue cleared ✅ {nextDueIn ? <span style={{ marginLeft: 6, opacity: 0.8 }}>(next due {nextDueIn})</span> : null}
                </span>
              ) : (
                <span>
                  Remaining due: <b>{dueCount}</b> {nextDueIn ? <span style={{ marginLeft: 6, opacity: 0.8 }}>(next due {nextDueIn})</span> : null}
                </span>
              )}
            </div>
          ) : null}

          {topMisses.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Top misses (this session)</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {topMisses.map((m) => (
                  <span key={m.key} className="pill" style={{ fontSize: 12 }} title="Most-missed patterns in this run">
                    {sessionMissLabel(m.key)} ×{m.count}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {topMissDrillTo ? (
                <Link className="btnPrimary" to={topMissDrillTo} state={inheritedState} title="Do a short targeted drill based on your misses">
                  Drill these
                </Link>
              ) : null}
              <Link className="btn" to={practiceDoneTo || '/practice'} state={inheritedState} title="Back to Practice hub">
                Back to Practice
              </Link>
              <Link className="btn" to={drillMode ? '/review' : shareTo} state={inheritedState} title="Run another set">
                Another set
              </Link>
            </div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Next up: keep it daily — even 5 items counts.</div>
          </div>
        </div>
      ) : null}

      {stationFilter ? (
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, opacity: 0.85 }}>Filtered:</span>
          <span className="pill" style={{ fontSize: 12 }} title={stationFilter}>
            {stationLabel(stationFilter)}
          </span>
          <Link className="pill" to="/review" state={inheritedState} style={{ fontSize: 12 }} title="Clear station filter">
            Clear
          </Link>
        </div>
      ) : null}

      {!drillMode ? (
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>On‑demand:</span>
          <button
            className="pill"
            onClick={() => {
              setManageOpen(true);
              setManageUrl(true);
              window.setTimeout(() => manageRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 30);
            }}
            title="Browse/remove items in your Review queue"
          >
            Manage
          </button>
          <Link
            className="pill"
            to={`/review?drill=1${stationFilter ? `&station=${stationFilter}` : ''}${nQS}`}
            state={inheritedState}
            title={`A fast interval drill from your mistakes (wide register: ${WIDE_REGISTER_RANGE_TEXT}).`}
          >
            Interval drill
          </Link>
          {triadStats.length > 0 ? (
            <Link
              className="pill"
              to={`/review?drill=1&kind=triad${stationFilter ? `&station=${stationFilter}` : ''}${nQS}`}
              state={inheritedState}
              title={`A fast triad-quality drill from your mistakes (wide register: ${WIDE_REGISTER_RANGE_TEXT}).`}
            >
              Triad drill
            </Link>
          ) : null}
          <Link
            className="pill"
            to={`/review?warmup=1${stationFilter ? `&station=${stationFilter}` : ''}${nQS}`}
            state={inheritedState}
            title="Warm‑up set (even if nothing is due yet)"
          >
            Warm‑up
          </Link>
        </div>
      ) : null}

      {!drillMode && intervalStats.length > 0 ? (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ opacity: 0.9 }}>Quick drills:</span>
          <Link
            className="pill"
            to={`/review?drill=1&semitones=${intervalStats
              .slice(0, 3)
              .map((x) => x.semitones)
              .join(',')}${stationFilter ? `&station=${stationFilter}` : ''}${nQS}`}
            state={inheritedState}
          >
            Top interval misses ({intervalStats
              .slice(0, 3)
              .map((x) => SEMITONE_TO_LABEL[x.semitones] ?? `${x.semitones}st`)
              .join(', ')})
          </Link>
          {intervalStats.slice(0, 3).map((x) => (
            <Link
              key={x.semitones}
              className="pill"
              to={`/review?drill=1&semitones=${x.semitones}${stationFilter ? `&station=${stationFilter}` : ''}${nQS}`}
              state={inheritedState}
            >
              {SEMITONE_TO_LABEL[x.semitones] ?? `${x.semitones}st`} ×{x.count}
            </Link>
          ))}
        </div>
      ) : null}

      {!drillMode && triadStats.length > 0 ? (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ opacity: 0.9 }}>Triad drills:</span>
          <Link
            className="pill"
            to={`/review?drill=1&kind=triad&qualities=${triadStats
              .slice(0, 2)
              .map((x) => x.quality)
              .join(',')}${stationFilter ? `&station=${stationFilter}` : ''}${nQS}`}
            state={inheritedState}
          >
            Top misses ({triadStats
              .slice(0, 2)
              .map((x) => triadQualityLabel(x.quality))
              .join(', ')})
          </Link>
          {triadStats.slice(0, 3).map((x) => (
            <Link
              key={x.quality}
              className="pill"
              to={`/review?drill=1&kind=triad&qualities=${x.quality}${stationFilter ? `&station=${stationFilter}` : ''}${nQS}`}
              state={inheritedState}
            >
              {triadQualityLabel(x.quality)} ×{x.count}
            </Link>
          ))}
        </div>
      ) : null}

      {!drillMode && mistakeKindStats.length > 0 ? (
        <details
          id="manage"
          ref={manageRef}
          open={manageOpen}
          onToggle={(e) => {
            // Keep React state in sync with the native <details> element + URL (so refresh/share keeps state).
            const el = e.currentTarget as HTMLDetailsElement;
            setManageOpen(!!el.open);
            setManageUrl(!!el.open);
          }}
          style={{ marginTop: 10, scrollMarginTop: 80 }}
        >
          <summary style={{ cursor: 'pointer', fontSize: 12, opacity: 0.85 }}>Manage mistakes</summary>
          <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
            {mistakeKindStats.map((s) => {
              const kindLabel: Record<Mistake['kind'], string> = {
                noteName: 'Note names',
                intervalLabel: 'Intervals',
                triadQuality: 'Triad quality',
                scaleDegreeName: 'Scale degrees (names)',
                majorScaleDegree: 'Major scale degrees',
                functionFamily: 'Function families',
              };

              const expanded = !!expandedKinds[s.kind];
              const maxItems = expanded ? 12 : 3;
              const kindItems = filtered
                .filter((m) => m.kind === s.kind)
                .slice()
                .sort((a, b) => (a.dueAt ?? a.addedAt) - (b.dueAt ?? b.addedAt) || b.addedAt - a.addedAt);

              return (
                <div key={s.kind} style={{ display: 'grid', gap: 6, padding: '6px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 12, opacity: 0.9 }}>
                      <b>{kindLabel[s.kind] ?? s.kind}</b> — {s.due} due / {s.total} total
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {kindItems.length > 3 ? (
                        <button
                          className="ghost"
                          onClick={() => setExpandedKinds((m) => ({ ...m, [s.kind]: !expanded }))}
                          title={expanded ? 'Show fewer items' : 'Show more items'}
                        >
                          {expanded ? 'Show less' : `Show more (+${kindItems.length - 3})`}
                        </button>
                      ) : null}

                      {(() => {
                        const dueIds = kindItems.filter((m) => (m.dueAt ?? 0) <= now).map((m) => m.id);
                        if (dueIds.length === 0) return null;
                        return (
                          <>
                            {(
                              [
                                { label: 'Snooze due 1h', ms: 60 * 60_000 },
                                { label: 'Snooze due 6h', ms: 6 * 60 * 60_000 },
                                { label: 'Snooze due 1d', ms: 24 * 60 * 60_000 },
                              ] as const
                            ).map((x) => (
                              <button
                                key={x.label}
                                className="ghost"
                                onClick={() => {
                                  const prev = loadMistakes();
                                  const changed = snoozeMistakes(dueIds, x.ms);
                                  if (changed <= 0) return;
                                  armUndo(prev, `Snoozed ${changed} due item${changed === 1 ? '' : 's'} for ${x.label.replace('Snooze due ', '')}.`);
                                  refresh();
                                }}
                                title={`Snooze all due ${kindLabel[s.kind] ?? s.kind} items (respecting your current filters)`}
                              >
                                {x.label} ({dueIds.length})
                              </button>
                            ))}

                            <button
                              className="ghost"
                              onClick={() => {
                                const prev = loadMistakes();
                                const changed = snoozeMistakesUntilLocalTime(dueIds, 8, 0, now);
                                if (changed <= 0) return;
                                armUndo(prev, `Snoozed ${changed} due item${changed === 1 ? '' : 's'} until tomorrow morning.`);
                                refresh();
                              }}
                              title={`Snooze all due ${kindLabel[s.kind] ?? s.kind} items until 08:00 local time (great for “done for today”)`}
                            >
                              Snooze due → tomorrow (08:00) ({dueIds.length})
                            </button>
                          </>
                        );
                      })()}

                      <button
                        className="ghost"
                        onClick={() => {
                          // Remove items of this kind (and respect station filter, if any).
                          const prev = loadMistakes();
                          const next = prev.filter((m) => {
                            if (m.kind !== s.kind) return true;
                            if (stationFilter && m.sourceStationId !== stationFilter) return true;
                            return false;
                          });
                          const removed = prev.length - next.length;
                          if (removed <= 0) return;

                          // Extra guard for bulk destructive actions (Undo is available either way).
                          if (removed >= 6) {
                            const ok = window.confirm(`Remove ${removed} ${(kindLabel[s.kind] ?? s.kind).toLowerCase()} item${removed === 1 ? '' : 's'} from Review?\n\n(You can Undo right after.)`);
                            if (!ok) return;
                          }

                          saveMistakes(next);
                          setMistakes(next);
                          armUndo(prev, `Removed ${removed} ${(kindLabel[s.kind] ?? s.kind).toLowerCase()} item${removed === 1 ? '' : 's'}.`);
                          refresh();
                        }}
                        title="Remove items of this kind from your Review queue"
                      >
                        Remove ({kindItems.length})
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 6 }}>
                    {kindItems.slice(0, maxItems).map((m) => (
                        <div
                          key={m.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 10,
                            flexWrap: 'wrap',
                            border: '2px solid var(--ink)',
                            borderRadius: 14,
                            padding: '6px 8px',
                            background: 'rgba(255,255,255,0.6)',
                          }}
                        >
                          <div style={{ fontSize: 12, opacity: 0.85 }}>
                            {mistakeShortLabel(m)}
                            <span style={{ marginLeft: 8, opacity: 0.75 }}>• from </span>
                            <Link
                              className="pill"
                              to={`/review?station=${encodeURIComponent(m.sourceStationId)}`}
                              state={inheritedState}
                              style={{ fontSize: 12, padding: '1px 8px' }}
                              title="Filter Review to this station"
                            >
                              {stationLabel(m.sourceStationId)}
                            </Link>
                            <span style={{ marginLeft: 8, opacity: 0.75 }}>
                              • {(m.dueAt ?? 0) <= now ? 'due' : `due in ${msToHuman((m.dueAt ?? m.addedAt) - now)}`}
                            </span>
                            <span style={{ marginLeft: 8, opacity: 0.75 }}>
                              • streak {m.correctStreak}/{requiredClearStreak(m)}
                              {requiredClearStreak(m) >= 3 ? <span style={{ marginLeft: 6, opacity: 0.9 }}>Hard</span> : null}
                            </span>
                            <span style={{ marginLeft: 8, opacity: 0.75 }}>• wrongs {m.wrongCount ?? 0}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {(
                              [
                                { label: 'Snooze 1h', ms: 60 * 60_000, title: 'Snooze this item for 1 hour', undo: 'Snoozed 1 item for 1 hour.' },
                                { label: 'Snooze 6h', ms: 6 * 60 * 60_000, title: 'Snooze this item for 6 hours', undo: 'Snoozed 1 item for 6 hours.' },
                                { label: 'Snooze 1d', ms: 24 * 60 * 60_000, title: 'Snooze this item for 1 day', undo: 'Snoozed 1 item for 1 day.' },
                              ] as const
                            ).map((s) => (
                              <button
                                key={s.label}
                                className="ghost"
                                onClick={() => {
                                  // Give it breathing room without nuking it from the queue.
                                  const prev = loadMistakes();
                                  snoozeMistake(m.id, s.ms);
                                  armUndo(prev, s.undo);
                                  refresh();
                                }}
                                title={s.title}
                              >
                                {s.label}
                              </button>
                            ))}

                            <button
                              className="ghost"
                              onClick={() => {
                                const prev = loadMistakes();
                                snoozeMistakeUntilLocalTime(m.id, 8, 0, now);
                                armUndo(prev, 'Snoozed 1 item until tomorrow morning.');
                                refresh();
                              }}
                              title="Snooze this item until 08:00 local time (done for today)"
                            >
                              Snooze → tomorrow (08:00)
                            </button>

                            <button
                              className="ghost"
                              onClick={() => {
                                const prev = loadMistakes();
                                const next = prev.filter((x) => x.id !== m.id);
                                if (next.length == prev.length) return;
                                saveMistakes(next);
                                setMistakes(next);
                                armUndo(prev, 'Removed 1 item.');
                                refresh();
                              }}
                              title="Remove this item from your Review queue"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}

            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75, display: 'grid', gap: 4 }}>
              <div>Tip: Tap a station pill to filter Review to that station.</div>
              <div>Snooze = “skip for now” (1h / 6h / 1d) without removing the item.</div>
              <div>“Hard” items need 3 clears (a clean 3/3 streak) before they disappear.</div>
            </div>

            {active ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.82, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>Current: <b>{active.kind}</b> from</span>
                  <Link className="pill" to={`/review?station=${encodeURIComponent(active.sourceStationId)}`} state={inheritedState} style={{ fontSize: 12, padding: '1px 8px' }}>
                    {stationLabel(active.sourceStationId)}
                  </Link>
                </div>
                <button
                  className="ghost"
                  onClick={() => {
                    const prev = loadMistakes();
                    const next = prev.filter((m) => m.id !== active.id);
                    if (next.length === prev.length) return;
                    saveMistakes(next);
                    setMistakes(next);
                    armUndo(prev, 'Removed current item.');
                    refresh();
                  }}
                  title="Remove the current item from your Review queue"
                >
                  Remove current
                </button>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      {undo ? (
        <div className="pwaToast pwaToast--action">
          <div className="pwaToast__text">{undo.text}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              className="pwaToast__btn"
              onClick={() => {
                saveMistakes(undo.prev);
                setMistakes(undo.prev);
                setUndo(null);
                refresh();
              }}
            >
              Undo
            </button>
            <button className="pwaToast__btn pwaToast__btn--ghost" onClick={() => setUndo(null)}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {drillMode ? (
        drillKind === 'interval' ? (
          drillIlQ ? (
            <>
              <div className={`result r_${result}`}>
                {result === 'idle' && drillIlQ.prompt}
                {result === 'correct' && `Nice — ${drillIlQ.correct} (${intervalLongName(drillIlQ.correct)})`}
                {result === 'wrong' && `Not quite — it was ${drillIlQ.correct} (${intervalLongName(drillIlQ.correct)}).`}
              </div>

              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                {drillIlQ.choices.map((c) => (
                  <button key={c} className="secondary" onClick={() => chooseInterval(c)}>
                    {c}
                  </button>
                ))}
              </div>

              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
                Focus: {drillFocusSemitones.map((s) => SEMITONE_TO_LABEL[s] ?? `${s}st`).join(', ')}
              </div>
            </>
          ) : drillFocusSemitones.length === 0 ? (
            <div className="result r_idle">No interval mistakes yet. Do a test/exam, miss something, then come back for a drill.</div>
          ) : (
            <div className="result r_correct">
              <div style={{ fontSize: 14, opacity: 0.95 }}>Drill complete — {drillCorrect}/{DRILL_TOTAL} correct.</div>
            {workoutBonusAwarded > 0 ? (
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>Workout bonus: +{workoutBonusAwarded} XP.</div>
            ) : null}
              <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <Link
                  className="linkBtn"
                  to={`/review?drill=1&semitones=${drillFocusSemitones.join(',')}${stationFilter ? `&station=${stationFilter}` : ''}${nQS}`}
                  state={inheritedState}
                >
                  Restart drill
                </Link>
                <Link className="linkBtn" to={`/review?warmup=1${stationFilter ? `&station=${stationFilter}` : ''}${nQS}`} state={inheritedState}>
                  Warm‑up
                </Link>
                <Link className="linkBtn" to={`/review?manage=1${stationFilter ? `&station=${stationFilter}` : ''}#manage`} state={inheritedState}>
                  Manage mistakes
                </Link>
                {practiceDoneTo ? (
                  <Link className="linkBtn primaryLink" to={practiceDoneTo}>
                    Back to practice
                  </Link>
                ) : null}
                <Link className="linkBtn" to={stationFilter ? `/review?station=${stationFilter}` : '/review'} state={inheritedState}>
                  Back to review
                </Link>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.78 }}>
                {sched.nextDueAt ? `Next due in ${msToHuman(sched.nextDueAt - now)}.` : 'Nothing due right now.'}
              </div>
            </div>
          )
        ) : drillTriadQ ? (
          <>
            <div className={`result r_${result}`}>
              {result === 'idle' && drillTriadQ.prompt}
              {result === 'correct' && `Nice — ${triadQualityLabel(drillTriadQ.quality)}.`}
              {result === 'wrong' && `Not quite — it was ${triadQualityLabel(drillTriadQ.quality)}.`}
            </div>

            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              {drillTriadQ.choices.map((c) => (
                <button key={c} className="secondary" onClick={() => chooseTriad(c)}>
                  {triadQualityLabel(c)}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
              Focus: {drillFocusQualities.map((q) => triadQualityLabel(q)).join(', ')}
            </div>
          </>
        ) : drillFocusQualities.length === 0 ? (
          <div className="result r_idle">No triad-quality mistakes yet. Do a test/exam, miss something, then come back for a drill.</div>
        ) : (
          <div className="result r_correct">
            <div style={{ fontSize: 14, opacity: 0.95 }}>Drill complete — {drillCorrect}/{DRILL_TOTAL} correct.</div>
            {workoutBonusAwarded > 0 ? (
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>Workout bonus: +{workoutBonusAwarded} XP.</div>
            ) : null}
            <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <Link
                className="linkBtn"
                to={`/review?drill=1&kind=triad&qualities=${drillFocusQualities.join(',')}${stationFilter ? `&station=${stationFilter}` : ''}${nQS}`}
                state={inheritedState}
              >
                Restart drill
              </Link>
              <Link className="linkBtn" to={`/review?warmup=1${stationFilter ? `&station=${stationFilter}` : ''}${nQS}`} state={inheritedState}>
                Warm‑up
              </Link>
              <Link className="linkBtn" to={`/review?manage=1${stationFilter ? `&station=${stationFilter}` : ''}#manage`} state={inheritedState}>
                Manage mistakes
              </Link>
              {practiceDoneTo ? (
                <Link className="linkBtn primaryLink" to={practiceDoneTo}>
                  Back to practice
                </Link>
              ) : null}
              <Link className="linkBtn" to={stationFilter ? `/review?station=${stationFilter}` : '/review'} state={inheritedState}>
                Back to review
              </Link>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.78 }}>
              {sched.nextDueAt ? `Next due in ${msToHuman(sched.nextDueAt - now)}.` : 'Nothing due right now.'}
            </div>
          </div>
        )
      ) : !active ? (

        <div className={`result ${warmupMode && warmupQueue.length > 0 && doneCount > 0 ? 'r_correct' : 'r_idle'}`}>
          {totalCount === 0 ? (
            'No mistakes queued. Go do a station and come back if you miss something.'
          ) : warmupMode && warmupQueue.length > 0 && doneCount > 0 ? (
            <>
              <div style={{ fontSize: 14, opacity: 0.95 }}>
                Warm‑up complete — cleared <b>{Math.min(doneCount, warmupQueue.length)}</b> / {warmupQueue.length}.
              </div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                Session: {sessionAccuracyPct}% · {sessionRight} ✓ · {sessionWrong} ✗ · {sessionSkip} skip · +{sessionXp} XP
              </div>
              {topMisses.length ? (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.82 }}>
                  Top misses: {topMisses.map((x) => `${sessionMissLabel(x.key)}×${x.count}`).join(' · ')}
                </div>
              ) : null}
              {workoutBonusAwarded > 0 ? (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>Workout bonus: +{workoutBonusAwarded} XP.</div>
              ) : null}
              <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <Link className="linkBtn" to={`/review?warmup=1${stationFilter ? `&station=${stationFilter}` : ''}${nQS}`} state={inheritedState}>
                  Restart warm‑up
                </Link>
                {topMissDrillTo ? (
                  <Link className="linkBtn" to={topMissDrillTo} state={inheritedState}>
                    Practice misses
                  </Link>
                ) : null}
                <Link className="linkBtn" to={`/review?drill=1${stationFilter ? `&station=${stationFilter}` : ''}${nQS}`} state={inheritedState}>
                  Drill top misses
                </Link>
                <Link className="linkBtn" to={`/review?manage=1${stationFilter ? `&station=${stationFilter}` : ''}#manage`} state={inheritedState}>
                  Manage mistakes
                </Link>
                {practiceDoneTo ? (
                  <Link className="linkBtn primaryLink" to={practiceDoneTo}>
                    Back to practice
                  </Link>
                ) : null}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.78 }}>
                {sched.nextDueAt ? `Next due in ${msToHuman(sched.nextDueAt - now)}.` : 'Nothing due right now.'}
              </div>
            </>
          ) : !warmupMode && dueCount === 0 && doneCount > 0 ? (
            <>
              <div style={{ fontSize: 14, opacity: 0.95 }}>
                All caught up — cleared <b>{doneCount}</b> item{doneCount === 1 ? '' : 's'}.
              </div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                Session: {sessionAccuracyPct}% · {sessionRight} ✓ · {sessionWrong} ✗ · {sessionSkip} skip · +{sessionXp} XP
              </div>
              {topMisses.length ? (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.82 }}>
                  Top misses: {topMisses.map((x) => `${sessionMissLabel(x.key)}×${x.count}`).join(' · ')}
                </div>
              ) : null}
              {workoutBonusAwarded > 0 ? (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>Workout bonus: +{workoutBonusAwarded} XP.</div>
              ) : null}
              <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <Link className="linkBtn primaryLink" to={`/review?warmup=1${stationFilter ? `&station=${stationFilter}` : ''}${nQS}`} state={inheritedState}>
                  Continue (warm‑up)
                </Link>
                {topMissDrillTo ? (
                  <Link className="linkBtn" to={topMissDrillTo} state={inheritedState}>
                    Practice misses
                  </Link>
                ) : null}
                <Link className="linkBtn" to={`/review?drill=1${stationFilter ? `&station=${stationFilter}` : ''}${nQS}`} state={inheritedState}>
                  Drill top misses
                </Link>
                <Link className="linkBtn" to={`/review?manage=1${stationFilter ? `&station=${stationFilter}` : ''}#manage`} state={inheritedState}>
                  Manage mistakes
                </Link>
                {practiceDoneTo ? (
                  <Link className="linkBtn" to={practiceDoneTo}>
                    Back to practice
                  </Link>
                ) : null}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.78 }}>
                {sched.nextDueAt ? `Next due in ${msToHuman(sched.nextDueAt - now)}.` : 'Nothing due right now.'}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 14, opacity: 0.9 }}>
                Due now: <b>{sched.dueNow}</b> / {sched.total}
                {sched.hard ? (
                  <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.8 }} title="Hard = items you’ve missed 3+ times (need 3 clears)">
                    · Hard {sched.hard}
                  </span>
                ) : null}
              </div>

              <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <span className="pill" title="Eligible now">
                  Now · {sched.dueNow}
                </span>
                <span className="pill" title="Becomes eligible within 1 hour">
                  ≤1h · {sched.within1h}
                </span>
                <span className="pill" title="Becomes eligible later today">
                  Today · {sched.today}
                </span>
                <span className="pill" title="Not today">
                  Later · {sched.later}
                </span>
                {sched.dueNow === 0 && sched.nextDueAt ? (
                  <span style={{ fontSize: 12, opacity: 0.75 }}>Next due in {msToHuman(sched.nextDueAt - now)}</span>
                ) : null}
              </div>

              {dueCount === 0 ? (
                <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <Link className="linkBtn" to={`/review?warmup=1${stationFilter ? `&station=${stationFilter}` : ''}${nQS}`} state={inheritedState}>
                    Warm‑up (practice early)
                  </Link>
                  <Link className="linkBtn" to={`/review?drill=1${stationFilter ? `&station=${stationFilter}` : ''}${nQS}`} state={inheritedState}>
                    Drill top misses
                  </Link>
                  <span style={{ fontSize: 12, opacity: 0.75 }}>
                    {sched.nextDueAt ? `Nothing due right now — next due in ${msToHuman(sched.nextDueAt - now)}.` : 'Nothing due right now.'}
                    <span style={{ marginLeft: 6, opacity: 0.8 }}>Warm‑up is optional.</span>
                  </span>
                </div>
              ) : null}

              {practiceDoneTo && doneCount > 0 ? (
                <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <Link className="linkBtn primaryLink" to={practiceDoneTo}>
                    Back to practice
                  </Link>
                  <span style={{ fontSize: 12, opacity: 0.75 }}>Workout complete.</span>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : active.kind === 'noteName' && noteQ ? (
        <>
          <div className={`result r_${result}`}>
            {result === 'idle' && 'Review: name this note.'}
            {result === 'correct' && 'Cleared — +4 XP.'}
            {result === 'wrong' && `Not quite — it was ${noteQ.promptLabel}. (Try again or skip.)`}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {noteQ.choices.map((c) => (
              <button key={c} className="secondary" onClick={() => chooseNote(c)}>
                {c}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
            From: {active.sourceStationId} • Streak: {active.correctStreak}/{requiredClearStreak(active)}
            {requiredClearStreak(active) >= 3 ? <span style={{ marginLeft: 8, opacity: 0.9 }}>• Hard</span> : null}
          </div>
        </>
      ) : active.kind === 'intervalLabel' && ilQ ? (
        <>
          <div className={`result r_${result}`}>
            {result === 'idle' && ilQ.prompt}
            {result === 'correct' && `Cleared — +4 XP. (${intervalLongName(ilQ.correct)})`}
            {result === 'wrong' && `Not quite — it was ${ilQ.correct} (${intervalLongName(ilQ.correct)}).`}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {ilQ.choices.map((c) => (
              <button key={c} className="secondary" onClick={() => chooseInterval(c)}>
                {c}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
            From: {active.sourceStationId} • Streak: {active.correctStreak}/{requiredClearStreak(active)}
            {requiredClearStreak(active) >= 3 ? <span style={{ marginLeft: 8, opacity: 0.9 }}>• Hard</span> : null}
          </div>
        </>
      ) : active.kind === 'scaleDegreeName' && degQ ? (
        <>
          <div className={`result r_${result}`}>
            {result === 'idle' && degQ.prompt}
            {result === 'correct' && 'Cleared — +4 XP.'}
            {result === 'wrong' && `Not quite — it was ${degQ.correct}.`}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {degQ.choices.map((c) => (
              <button key={c} className="secondary" onClick={() => chooseDegree(c)}>
                {c}
              </button>
            ))}
          </div>

          {result !== 'idle' ? (
            <div style={{ fontSize: 12, opacity: 0.82, marginTop: 8 }}>
              Meaning: <span style={{ opacity: 0.95 }}>{degreeMeaning(degQ.correct)}</span>
            </div>
          ) : null}

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
            From: {active.sourceStationId} • Streak: {active.correctStreak}/{requiredClearStreak(active)}
            {requiredClearStreak(active) >= 3 ? <span style={{ marginLeft: 8, opacity: 0.9 }}>• Hard</span> : null}
          </div>
        </>
      ) : active.kind === 'majorScaleDegree' && msQ ? (
        <>
          <div className={`result r_${result}`}>
            {result === 'idle' && msQ.prompt}
            {result === 'correct' && 'Cleared — +4 XP.'}
            {result === 'wrong' && `Not quite — it was ${msQ.correct}.`}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {msQ.choices.map((c) => (
              <button key={c} className="secondary" onClick={() => chooseMajorScale(c)}>
                {c}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
            From: {active.sourceStationId} • Streak: {active.correctStreak}/{requiredClearStreak(active)}
            {requiredClearStreak(active) >= 3 ? <span style={{ marginLeft: 8, opacity: 0.9 }}>• Hard</span> : null}
          </div>
        </>
      ) : active.kind === 'functionFamily' && ffQ ? (
        <>
          <div className={`result r_${result}`}>
            {result === 'idle' && ffQ.prompt}
            {result === 'correct' && 'Cleared — +4 XP.'}
            {result === 'wrong' && `Not quite — it was ${ffQ.family}.`}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {ffQ.choices.map((c) => (
              <button key={c} className="secondary" onClick={() => chooseFamily(c)}>
                {c}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
            From: {active.sourceStationId} • Streak: {active.correctStreak}/{requiredClearStreak(active)}
            {requiredClearStreak(active) >= 3 ? <span style={{ marginLeft: 8, opacity: 0.9 }}>• Hard</span> : null}
          </div>
        </>
      ) : active.kind === 'triadQuality' && triadQ ? (
        <>
          <div className={`result r_${result}`}>
            {result === 'idle' && triadQ.prompt}
            {result === 'correct' && `Cleared — +4 XP. (${triadQualityLabel(triadQ.quality)})`}
            {result === 'wrong' && `Not quite — it was ${triadQualityLabel(triadQ.quality)}.`}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {triadQ.choices.map((c) => (
              <button key={c} className="secondary" onClick={() => chooseTriad(c)}>
                {triadQualityLabel(c)}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
            From: {active.sourceStationId} • Streak: {active.correctStreak}/{requiredClearStreak(active)}
            {requiredClearStreak(active) >= 3 ? <span style={{ marginLeft: 8, opacity: 0.9 }}>• Hard</span> : null}
          </div>
        </>
      ) : (
        <div className="result r_idle">This mistake type is not reviewable yet.</div>
      )}
    </div>
  );
}

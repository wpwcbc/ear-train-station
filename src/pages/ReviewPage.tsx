import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useHotkeys } from '../lib/hooks/useHotkeys';
import type { Progress } from '../lib/progress';
import { applyStudyReward } from '../lib/progress';
import {
  applyReviewResult,
  loadMistakes,
  mistakeScheduleSummaryFrom,
  requiredClearStreak,
  saveMistakes,
  snoozeMistake,
  updateMistake,
  type Mistake,
} from '../lib/mistakes';
import { bumpReviewAttempt, bumpReviewClear } from '../lib/quests';
import { SETTINGS_EVENT, loadSettings } from '../lib/settings';
import { promptSpeedFactors } from '../lib/promptTiming';
import { piano } from '../audio/piano';
import { playIntervalPrompt, playRootThenChordPrompt, playTonicTargetPrompt } from '../audio/prompts';
import { makeNoteNameReviewQuestion } from '../exercises/noteName';
import { SEMITONE_TO_LABEL, makeIntervalLabelQuestion, makeIntervalLabelReviewQuestion, intervalLongName, type IntervalLabel } from '../exercises/interval';
import { makeTriadQualityReviewQuestion, triadQualityLabel, type TriadQuality } from '../exercises/triad';
import { degreeMeaning, makeScaleDegreeNameReviewQuestion, type ScaleDegreeName } from '../exercises/scaleDegree';
import { makeMajorScaleDegreeReviewQuestion } from '../exercises/majorScale';
import { makeFunctionFamilyQuestion, type FunctionFamily } from '../exercises/functionFamily';
import { MAJOR_KEYS } from '../lib/theory/major';
import { DEFAULT_WIDE_REGISTER_MAX_MIDI, WIDE_REGISTER_MIN_MIDI } from '../lib/registerPolicy';
import { STATIONS } from '../lib/stations';

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

  const [seed, setSeed] = useState(1);
  const [searchParams] = useSearchParams();
  const stationFilter = (searchParams.get('station') || '').trim();
  const drill = (searchParams.get('drill') || '').trim();
  const drillModeRaw = drill === '1' || drill === 'true' || drill === 'yes';
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

  // Optional session length (e.g. “quick warm‑up”):
  // - Default stays 10 (Duolingo-ish mistakes sessions often cap at ~10 items).
  // - Clamp to avoid huge accidental values.
  const nRaw = (searchParams.get('n') || '').trim();
  const sessionN = (() => {
    const n = parseInt(nRaw, 10);
    if (!Number.isFinite(n)) return 10;
    return Math.max(3, Math.min(30, n));
  })();

  const workoutRaw = (searchParams.get('workout') || '').trim();
  const workoutSession: 1 | 2 | null = workoutRaw === '1' ? 1 : workoutRaw === '2' ? 2 : null;
  const practiceDoneTo = workoutSession ? `/practice?workoutDone=${workoutSession}` : null;

  const drillSemisRaw = (searchParams.get('semitones') || '').trim();
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
  const [now, setNow] = useState(() => Date.now());
  const [mistakes, setMistakes] = useState<Mistake[]>(() => loadMistakes());
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [expandedKinds, setExpandedKinds] = useState<Record<string, boolean>>({});

  const manageRef = useRef<HTMLDetailsElement | null>(null);
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
    return () => {
      window.removeEventListener('focus', bump);
      window.removeEventListener('storage', bump);
      window.removeEventListener(SETTINGS_EVENT, bump);
    };
  }, []);

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
  }, [filtered, warmupMode]);

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
  }, [drillMode, drillSemisRaw, stationFilter]);

  const drillIlQ = useMemo(() => {
    if (!drillMode) return null;
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
  }, [drillMode, drillFocusSemitones, drillIndex, seed]);

  const active = (drillMode
    ? undefined
    : ((warmupMode ? warmupQueue[0] : due[0]) as Mistake | undefined)) as Mistake | undefined;

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

    if (drillMode) {
      if (!drillIlQ) return;
      await playIntervalPrompt(drillIlQ.rootMidi, drillIlQ.targetMidi, {
        gapMs: gap(320),
        rootDurationSec: dur(0.7),
        targetDurationSec: dur(0.95),
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

    let cleared = false;
    updateMistake(active.id, (m) => {
      const next = applyReviewResult(m, outcome, Date.now());
      cleared = next == null;
      return next;
    });

    if (outcome === 'correct' && cleared) {
      bumpReviewClear(1);
      setProgress(applyStudyReward(progress, 4));
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
    if (!drillIlQ) return;

    if (outcome === 'correct') {
      setDrillCorrect((n) => n + 1);
      setResult('correct');
    } else {
      setDrillWrong((n) => n + 1);
      setResult('wrong');
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
        if (!drillIlQ) return;
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
        if (!drillIlQ) return;
        const c = drillIlQ.choices[idx];
        if (c) void chooseInterval(c);
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
              ? 'Targeted interval drills from your mistakes (wide register: G2+).'
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
              <div>Cleared: {doneCount}</div>
            </>
          )}
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="primary" disabled={drillMode ? !drillIlQ : !active} onClick={playPrompt}>
            Play
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
              // Push it back a bit so the next due item can surface.
              snoozeMistake(active.id, 5 * 60_000);
              refresh();
            }}
            disabled={drillMode ? !drillIlQ : !active}
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
          <Link className="pill" to={`/review?drill=1${stationFilter ? `&station=${stationFilter}` : ''}`} state={inheritedState} title="A fast interval drill from your mistakes (wide register: G2+).">
            Drill
          </Link>
          <Link className="pill" to={`/review?warmup=1${stationFilter ? `&station=${stationFilter}` : ''}`} state={inheritedState} title="Warm‑up set (even if nothing is due yet)">
            Warm‑up
          </Link>
        </div>
      ) : null}

      {!drillMode && intervalStats.length > 0 ? (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ opacity: 0.9 }}>Quick drills:</span>
          <Link
            className="pill"
            to={`/review?drill=1&semitones=${intervalStats.slice(0, 3).map((x) => x.semitones).join(',')}${stationFilter ? `&station=${stationFilter}` : ''}`}
            state={inheritedState}
          >
            Top misses ({intervalStats
              .slice(0, 3)
              .map((x) => SEMITONE_TO_LABEL[x.semitones] ?? `${x.semitones}st`)
              .join(', ')})
          </Link>
          {intervalStats.slice(0, 3).map((x) => (
            <Link
              key={x.semitones}
              className="pill"
              to={`/review?drill=1&semitones=${x.semitones}${stationFilter ? `&station=${stationFilter}` : ''}`}
              state={inheritedState}
            >
              {SEMITONE_TO_LABEL[x.semitones] ?? `${x.semitones}st`} ×{x.count}
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
                          if (next.length === prev.length) return;
                          saveMistakes(next);
                          setMistakes(next);
                          armUndo(prev, `Removed ${kindLabel[s.kind] ?? s.kind}.`);
                          refresh();
                        }}
                        title="Remove items of this kind from your Review queue"
                      >
                        Remove
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
                            <button
                              className="ghost"
                              onClick={() => {
                                // Give it breathing room without nuking it from the queue.
                                const prev = loadMistakes();
                                snoozeMistake(m.id, 60 * 60_000);
                                armUndo(prev, 'Snoozed 1 item for 1 hour.');
                                refresh();
                              }}
                              title="Snooze this item for 1 hour"
                            >
                              Snooze 1h
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
            Drill complete — {drillCorrect}/{DRILL_TOTAL} correct.
            <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link
                className="linkBtn"
                to={`/review?drill=1&semitones=${drillFocusSemitones.join(',')}${stationFilter ? `&station=${stationFilter}` : ''}`}
                state={inheritedState}
              >
                Restart drill
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
          </div>
        )
      ) : !active ? (
        <div className="result r_idle">
          {totalCount === 0 ? (
            'No mistakes queued. Go do a station and come back if you miss something.'
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
                  <Link className="linkBtn" to={`/review?warmup=1${stationFilter ? `&station=${stationFilter}` : ''}`} state={inheritedState}>
                    Warm‑up (practice early)
                  </Link>
                  <Link className="linkBtn" to={`/review?drill=1${stationFilter ? `&station=${stationFilter}` : ''}`} state={inheritedState}>
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

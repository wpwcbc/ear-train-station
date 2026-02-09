import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useHotkeys } from '../lib/hooks/useHotkeys';
import type { Progress } from '../lib/progress';
import { applyStudyReward } from '../lib/progress';
import {
  applyReviewResult,
  loadMistakes,
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

export function ReviewPage({ progress, setProgress }: { progress: Progress; setProgress: (p: Progress) => void }) {
  const loc = useLocation();
  const inheritedState = loc.state;

  const [seed, setSeed] = useState(1);
  const [searchParams] = useSearchParams();
  const stationFilter = (searchParams.get('station') || '').trim();
  const drill = (searchParams.get('drill') || '').trim();
  const drillMode = drill === '1' || drill === 'true' || drill === 'yes';
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

  const DRILL_TOTAL = 10;
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
      rootMinMidi: 43, // G2
      rootMaxMidi: 72, // C5-ish
      allowedSemitones: drillFocusSemitones,
      choiceCount: 6,
    });
  }, [drillMode, drillFocusSemitones, drillIndex, seed]);

  const active = (drillMode ? undefined : (due[0] as Mistake | undefined)) as Mistake | undefined;

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
  const nextDue = useMemo(() => {
    if (filtered.length === 0) return null;
    let min = Number.POSITIVE_INFINITY;
    for (const m of filtered) min = Math.min(min, m.dueAt ?? m.addedAt);
    return Number.isFinite(min) ? min : null;
  }, [filtered]);

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
          <h1 className="title">{drillMode ? 'Review Drill' : 'Review'}</h1>
          <p className="sub">
            {drillMode
              ? 'Targeted interval drills from your mistakes (wide register).'
              : 'Spaced review of missed items. Clear an item by getting it right twice in a row (streak 2/2).'}
          </p>
          {stationFilter ? (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
              Filter: <b>{stationFilter}</b> · <Link to="/review">Show all</Link>
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
              <div>
                Due: {dueCount} / {totalCount}
              </div>
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
        <details style={{ marginTop: 10 }}>
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

              return (
                <div key={s.kind} style={{ display: 'grid', gap: 6, padding: '6px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 12, opacity: 0.9 }}>
                      <b>{kindLabel[s.kind] ?? s.kind}</b> — {s.due} due / {s.total} total
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                    {filtered
                      .filter((m) => m.kind === s.kind)
                      .slice()
                      .sort((a, b) => (a.dueAt ?? a.addedAt) - (b.dueAt ?? b.addedAt) || b.addedAt - a.addedAt)
                      .slice(0, 3)
                      .map((m) => (
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
                            <span style={{ marginLeft: 8, opacity: 0.75 }}>• from {m.sourceStationId}</span>
                          </div>
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
                      ))}
                  </div>
                </div>
              );
            })}

            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
              Tip: “Hard” items need 3 clears (a clean 3/3 streak) before they disappear.
            </div>

            {active ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.82 }}>Current: <b>{active.kind}</b> from <b>{active.sourceStationId}</b></div>
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
              <Link className="linkBtn" to={stationFilter ? `/review?station=${stationFilter}` : '/review'} state={inheritedState}>
                Back to review
              </Link>
            </div>
          </div>
        )
      ) : !active ? (
        <div className="result r_idle">
          {totalCount === 0
            ? 'No mistakes queued. Go do a station and come back if you miss something.'
            : nextDue
              ? `Nothing due yet. Next item due in ${msToHuman(nextDue - now)}.`
              : 'Nothing due yet.'}
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

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

/* eslint-disable react-hooks/preserve-manual-memoization */
import { useFocusUI } from '../components/focusUI';
import type { StationId, Progress } from '../lib/progress';
import { applyStudyReward, markStationDone } from '../lib/progress';
import { hasShownDailyGoalReachedToast, markDailyGoalReachedToastShown } from '../lib/dailyGoalToast';
import { loadIntervalMissDetails, loadIntervalMissHistogram, recordIntervalMiss, recordIntervalPracticeHit } from '../lib/intervalStats';
import { addMistake, loadMistakes, mistakeCountForStation } from '../lib/mistakes';
import { bumpStationCompleted } from '../lib/quests';
import { STATIONS, nextStationId, isStationUnlocked } from '../lib/stations';
import { sectionIdByExamId, sectionStationsByExamId } from '../lib/sectionStations';
import { SECTIONS } from '../lib/sections';
import { stationCopy } from '../lib/stationCopy';
import { loadSettings } from '../lib/settings';
import { promptSpeedFactors } from '../lib/promptTiming';
import {
  DEFAULT_WIDE_REGISTER_MAX_MIDI,
  STABLE_REGISTER_MAX_MIDI,
  STABLE_REGISTER_MIN_MIDI,
  STABLE_REGISTER_RANGE_TEXT,
  WIDE_REGISTER_MIN_MIDI,
  WIDE_REGISTER_RANGE_TEXT,
  stableRegisterWhiteMidis,
} from '../lib/registerPolicy';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { StaffNote } from '../components/StaffNote';
import { RegisterPolicyNote } from '../components/RegisterPolicyNote';
import { TestHeader } from '../components/TestHeader';
import { ChoiceGrid } from '../components/ChoiceGrid';
import { DuoBottomBar } from '../components/DuoBottomBar';
import { HintOverlay, InfoCardPager, TTTRunner } from '../components/ttt';
// ConfigDrawer is handled by FocusShell in Focus Mode.
import { useHotkeys } from '../lib/hooks/useHotkeys';
import { piano } from '../audio/piano';
import { playIntervalPrompt, playNoteSequence, playRootThenChordPrompt, playTonicTargetPrompt } from '../audio/prompts';
import {
  makeIntervalQuestion,
  makeIntervalLabelQuestion,
  makeIntervalDeriveQuestion,
  intervalLabel,
  intervalLongName,
  LABEL_TO_SEMITONE,
  type IntervalLabel,
} from '../exercises/interval';
import { makeNoteNameQuestion, makeNoteNameQuestionFromMidis } from '../exercises/noteName';
import {
  makeMajorScaleSession,
  makeMajorScaleStepQuestion,
  makeMajorScaleTestQuestion,
  makeMajorScaleStepTypeQuestion,
  type StepType,
} from '../exercises/majorScale';
import { MAJOR_OFFSETS } from '../lib/theory/major';
import { makeTriadQualityQuestion, triadQualityIntervals, triadQualityLabel } from '../exercises/triad';
import { makeDiatonicTriadQualityQuestion } from '../exercises/diatonicTriad';
import { makeFunctionFamilyQuestion, type FunctionFamily } from '../exercises/functionFamily';
import { degreeMeaning, makeScaleDegreeNameQuestion, type ScaleDegreeName } from '../exercises/scaleDegree';
import { makeDegreeIntervalQuestion } from '../exercises/degreeInterval';

function computeIntervalMissCounts(stationId: StationId): Map<IntervalLabel, number> {
  const counts = new Map<IntervalLabel, number>();

  // Prefer a persistent histogram (not capped/de-duped like the review mistake queue).
  const hist = loadIntervalMissHistogram(stationId);
  for (const [semi, count] of hist.entries()) {
    const l = intervalLabel(semi);
    counts.set(l, (counts.get(l) ?? 0) + count);
  }

  // Fallback: also consider current mistake queue so the UI still works if stats are empty.
  if (counts.size === 0) {
    const all = loadMistakes().filter((m) => m.sourceStationId === stationId);
    for (const m of all) {
      if (m.kind !== 'intervalLabel') continue;
      const l = intervalLabel(m.semitones);
      counts.set(l, (counts.get(l) ?? 0) + 1);
    }
  }

  return counts;
}

function ageShort(nowMs: number, thenMs: number): string {
  const d = Math.max(0, nowMs - thenMs);
  const mins = Math.round(d / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function intervalMissList(
  stationId: StationId,
): { label: IntervalLabel; count: number; weight: number; lastMissAtMs: number }[] {
  const counts = computeIntervalMissCounts(stationId);

  // Sorting for UX:
  // - Long-term frequency matters most.
  // - But we also want "targeted" practice to feel responsive to recent mistakes.
  //
  // We do this in two layers:
  // 1) A gentle time-decay applied to the *weight* (used for sampling), so old misses naturally fade.
  // 2) A tiny recency bump in sorting, so fresh misses bubble up when counts are close.
  const details = loadIntervalMissDetails(stationId);
  const now = Date.now();

  const WEIGHT_DECAY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  const RECENCY_BUMP_HALF_LIFE_MS = 36 * 60 * 60 * 1000; // ~1.5 days
  const LN2 = Math.log(2);

  const rows = Array.from(counts.entries()).map(([label, count]) => {
    const semi = LABEL_TO_SEMITONE[label];
    const lastMissAtMs = details.get(semi)?.lastMissAtMs ?? 0;

    // If we don't know when this was last missed, treat it as "no decay".
    const age = lastMissAtMs > 0 ? Math.max(0, now - lastMissAtMs) : 0;

    const decayFactor = lastMissAtMs > 0 ? Math.exp((-LN2 * age) / WEIGHT_DECAY_HALF_LIFE_MS) : 1;
    const weight = Math.max(0, Math.round(count * decayFactor));

    const recencyBoost = lastMissAtMs > 0 ? Math.exp(-age / RECENCY_BUMP_HALF_LIFE_MS) : 0; // 1 → 0

    // Keep frequency dominant; recency is only a nudge.
    const score = weight + recencyBoost * 0.35;
    return { label, count, weight, lastMissAtMs, score };
  });

  // Hide fully-decayed entries (keeps UI clean without deleting localStorage data).
  const visible = rows.filter((x) => x.weight > 0);
  visible.sort((a, b) => b.score - a.score || b.weight - a.weight || b.count - a.count || a.label.localeCompare(b.label));
  return visible.map(({ label, count, weight, lastMissAtMs }) => ({ label, count, weight, lastMissAtMs }));
}

export function StationPage({ progress, setProgress }: { progress: Progress; setProgress: (p: Progress) => void }) {
  const navigate = useNavigate();
  const { stationId } = useParams();
  const id = (stationId ?? 'S3_INTERVALS') as StationId;
  const focus = useFocusUI();

  const station = STATIONS.find((s) => s.id === id);
  const done = progress.stationDone[id];
  const nextId = nextStationId(id);
  const nextUnlocked = nextId ? isStationUnlocked(progress, nextId) : false;

  const copy = stationCopy(id);
  void copy;

  const examSectionId = sectionIdByExamId(id);
  const examSection = examSectionId ? SECTIONS.find((s) => s.id === examSectionId) ?? null : null;
  const examSectionIndex = examSectionId ? SECTIONS.findIndex((s) => s.id === examSectionId) : -1;
  const nextSection = examSectionIndex >= 0 ? (SECTIONS[examSectionIndex + 1] ?? null) : null;

  const [now, setNow] = useState(() => Date.now());
  const [settings, setSettings] = useState(() => loadSettings());
  const [lessonRetryKey, setLessonRetryKey] = useState<string | null>(null);

  const [mistakesThisVisit, setMistakesThisVisit] = useState(0);

  const [harmonicTipsOpen, setHarmonicTipsOpen] = useState(false);

  const trackMistake = (m: Parameters<typeof addMistake>[0]) => {
    setMistakesThisVisit((n) => n + 1);
    addMistake(m);
  };

  useEffect(() => {
    const t = window.setTimeout(() => setMistakesThisVisit(0), 0);
    return () => window.clearTimeout(t);
  }, [id]);

  // Close harmonic tips when changing station or switching prompt mode.
  useEffect(() => {
    setHarmonicTipsOpen(false);
  }, [id, settings.intervalPromptMode]);

  useEffect(() => {
    function bump() {
      setNow(Date.now());
      setSettings(loadSettings());
    }
    window.addEventListener('focus', bump);
    window.addEventListener('storage', bump);
    return () => {
      window.removeEventListener('focus', bump);
      window.removeEventListener('storage', bump);
    };
  }, []);

  const stationMistakeCount = mistakeCountForStation(id);
  const stationMistakeDue = mistakeCountForStation(id, { dueOnly: true, now });

  const allIntervalMisses = useMemo(() => {
    if (id !== 'T3B_INTERVALS' && id !== 'T3_INTERVALS' && id !== 'E3_INTERVALS') {
      return [] as { label: IntervalLabel; count: number; weight: number; lastMissAtMs: number }[];
    }
    return intervalMissList(id);
  }, [id, now]);

  const topIntervalMisses = useMemo(() => allIntervalMisses.slice(0, 3), [allIntervalMisses]);

  const [seed, setSeed] = useState(1);
  // If a station is already completed, default to a “summary” view with an optional practice toggle.
  const [practice, setPractice] = useState(false);
  // Optional “focused practice” (e.g. practice only your most-missed intervals).
  const [practiceFocusIntervals, setPracticeFocusIntervals] = useState<IntervalLabel[] | null>(null);
  // “Targeted review” a la Duolingo Practice Hub: weight the RNG toward what you missed most.
  // We implement weighting by duplicating semitone values in the allowlist (simple + deterministic).
  const [practiceWeightedSemitones, setPracticeWeightedSemitones] = useState<number[] | null>(null);

  const practiceAllowedSemitones = useMemo(() => {
    if (practiceWeightedSemitones?.length) return practiceWeightedSemitones;
    if (!practiceFocusIntervals?.length) return undefined;
    return practiceFocusIntervals.map((l) => LABEL_TO_SEMITONE[l]);
  }, [practiceFocusIntervals, practiceWeightedSemitones]);

  function exitPractice() {
    setPractice(false);
    setPracticeFocusIntervals(null);
    setPracticeWeightedSemitones(null);
  }

  function clearPracticeFocus() {
    setPracticeFocusIntervals(null);
    setPracticeWeightedSemitones(null);
  }

  const practiceLeftExtras = practice ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ fontSize: 12, opacity: 0.85 }}>
        {practiceWeightedSemitones?.length
          ? 'Practice: targeted (weighted to your misses)'
          : practiceFocusIntervals?.length
            ? `Practice: focused (${practiceFocusIntervals.join(', ')})`
            : 'Practice: all intervals'}
      </div>
      {practiceFocusIntervals?.length || practiceWeightedSemitones?.length ? (
        <button className="ghost" onClick={clearPracticeFocus} title="Clear focused/targeted practice">
          Clear focus
        </button>
      ) : null}
      <button className="ghost" onClick={exitPractice} title="Exit practice mode">
        Exit practice
      </button>
    </div>
  ) : null;

  function renderIntervalMissStats(reset: () => void) {
    if (allIntervalMisses.length === 0) return null;

    const top = allIntervalMisses.slice(0, 3);
    const moreCount = Math.max(0, allIntervalMisses.length - top.length);

    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, opacity: 0.85 }}>
          Most missed:{' '}
          {top
            .map((x) => `${x.label}×${x.count}${x.lastMissAtMs ? ` (${ageShort(now, x.lastMissAtMs)})` : ''}`)
            .join(' · ')}
          {moreCount ? ` · +${moreCount} more` : ''}
        </div>

        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, opacity: 0.9 }}>All miss stats</summary>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className="ghost"
              onClick={() => {
                const topLabels = allIntervalMisses.slice(0, 5).map((x) => x.label);
                if (!topLabels.length) return;
                setPractice(true);
                setPracticeWeightedSemitones(null);
                setPracticeFocusIntervals(topLabels);
                reset();
              }}
              title="Practice your top 5 misses (focused set)"
            >
              Review top 5
            </button>
            {allIntervalMisses.slice(0, 12).map((x) => (
              <button
                key={x.label}
                className="pillBtn"
                onClick={() => {
                  setPractice(true);
                  setPracticeWeightedSemitones(null);
                  setPracticeFocusIntervals([x.label]);
                  reset();
                }}
                title={`Practice ${x.label} only${x.lastMissAtMs ? ` (last miss: ${ageShort(now, x.lastMissAtMs)})` : ''}`}
              >
                {x.label}×{x.count}
              </button>
            ))}
            {allIntervalMisses.length > 12 ? (
              <div style={{ fontSize: 12, opacity: 0.75, alignSelf: 'center' }}>Showing top 12.</div>
            ) : null}
          </div>
        </details>
      </div>
    );
  }

  // Tiny celebration when the user crosses their daily goal threshold.
  const [toast, setToast] = useState<null | { text: string }>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Settings UI lives in <FocusShell> (⚙️ in the top bar).
  // Pedagogy default: lessons teach with arps; tests/exams check with block chords.
  const chordMode: 'block' | 'arp' = id.startsWith('T') || id.startsWith('E') ? 'block' : 'arp';
  const speed = settings.promptSpeed;
  const timing = useMemo(() => promptSpeedFactors(speed), [speed]);
  const dur = (sec: number) => sec * timing.dur;
  const gap = (ms: number) => Math.round(ms * timing.gap);

  // When we schedule a short “correction replay” after a miss, we want it to be
  // cancelable (so it won't overlap if the user triggers another prompt).
  const correctionReplayTokenRef = useRef(0);
  const [correctionReplayBusy, setCorrectionReplayBusy] = useState(false);
  useEffect(() => {
    // Bump token on station change + unmount to invalidate any pending async work.
    correctionReplayTokenRef.current += 1;
    setCorrectionReplayBusy(false);
    return () => {
      correctionReplayTokenRef.current += 1;
      setCorrectionReplayBusy(false);
    };
  }, [id]);

  const intervalPromptMode = settings.intervalPromptMode;
  const intervalPromptModeLabel = intervalPromptMode === 'harmonic' ? 'Harmonic' : 'Melodic';
  const intervalHarmonicAlsoMelodic = settings.intervalHarmonicAlsoMelodic;
  const intervalHarmonicHelperWhen = settings.intervalHarmonicHelperWhen;
  const intervalHarmonicHelperDelayMs = settings.intervalHarmonicHelperDelayMs;

  const isIntervalStation = id === 'S3_INTERVALS' || id === 'T3B_INTERVALS' || id === 'T3_INTERVALS' || id === 'E3_INTERVALS';
  const showHarmonicTips = isIntervalStation && intervalPromptMode === 'harmonic';

  function harmonicHelperEnabled(isCorrection: boolean) {
    if (intervalPromptMode !== 'harmonic') return false;
    if (!intervalHarmonicAlsoMelodic) return false;
    if (intervalHarmonicHelperWhen === 'onMiss') return isCorrection;
    return true;
  }

  async function queueCorrectionReplay(rootMidi: number, targetMidi: number) {
    const token = ++correctionReplayTokenRef.current;
    await new Promise((r) => setTimeout(r, gap(240)));
    if (token !== correctionReplayTokenRef.current) return;

    await playIntervalPrompt(rootMidi, targetMidi, {
      mode: intervalPromptMode,
      harmonicAlsoMelodic: harmonicHelperEnabled(true),
      harmonicHelperDelayMs: gap(intervalHarmonicHelperDelayMs),
      gapMs: gap(260),
      rootDurationSec: dur(0.6),
      targetDurationSec: dur(0.85),
      velocity: 0.88,
    });
  }

  const HEARTS = 3;

  // Station 3: interval question (deterministic per seed)
  const intervalQ = useMemo(
    () =>
      makeIntervalQuestion({
        seed: seed * 1000 + 3,
        rootMidi: STABLE_REGISTER_MIN_MIDI,
        minSemitones: 0,
        maxSemitones: 12,
      }),
    [seed],
  );
  const [s3Correct, setS3Correct] = useState(0);
  const S3_GOAL = 6;

  // Station 3 warm-up: derive interval names by ±1 semitone.
  const [s3DeriveIndex, setS3DeriveIndex] = useState(0);
  const [s3DeriveCorrect, setS3DeriveCorrect] = useState(0);
  const S3_DERIVE_GOAL = 5;
  const s3WarmupDone = s3DeriveCorrect >= S3_DERIVE_GOAL;
  const [s3DeriveResult, setS3DeriveResult] = useState<'idle' | 'correct' | 'wrong'>('idle');

  const s3DeriveQ = useMemo(
    () => makeIntervalDeriveQuestion({ seed: seed * 1000 + 3000 + s3DeriveIndex, choiceCount: 4 }),
    [seed, s3DeriveIndex],
  );

  // S3 as a Duolingo-ish lesson: Teach → Test (stable) → Twist (wide, hearts)
  const [s3TeachDone, setS3TeachDone] = useState(false);
  const s3TestComplete = s3WarmupDone && s3Correct >= S3_GOAL;

  const [s3TwistIndex, setS3TwistIndex] = useState(0);
  const [s3TwistCorrect, setS3TwistCorrect] = useState(0);
  const [s3TwistWrong, setS3TwistWrong] = useState(0);
  const S3_TWIST_TOTAL = 10;
  const S3_TWIST_PASS = 8;
  const s3TwistDone = s3TwistIndex >= S3_TWIST_TOTAL || s3TwistWrong >= HEARTS;
  const s3TwistPassed = s3TwistDone && s3TwistCorrect >= S3_TWIST_PASS;

  const s3TwistQ = useMemo(
    () =>
      makeIntervalLabelQuestion({
        seed: seed * 1000 + 3030 + s3TwistIndex,
        rootMinMidi: WIDE_REGISTER_MIN_MIDI, // G2
        rootMaxMidi: DEFAULT_WIDE_REGISTER_MAX_MIDI, // C5
        minSemitones: 0,
        maxSemitones: 12,
        choiceCount: 6,
      }),
    [seed, s3TwistIndex],
  );

  // Station 1: note-name question (stable register, *white keys only* for beginner clarity)
  // Derived from the stable register policy to avoid hardcoded drift.
  const WHITE_MIDIS = useMemo(() => stableRegisterWhiteMidis(), []);

  const noteQ = useMemo(
    () =>
      makeNoteNameQuestionFromMidis({
        seed,
        midis: WHITE_MIDIS,
        choiceCount: 4,
      }),
    [seed],
  );


  const [result, setResult] = useState<'idle' | 'correct' | 'wrong'>('idle');
  // Duolingo-ish “combo” streak for lessons: keep a run of correct answers.
  const [combo, setCombo] = useState(0);
  const [highlighted, setHighlighted] = useState<Record<number, 'correct' | 'wrong' | 'active'>>({});

  // Mid-test 3B: interval label checkpoint (no hearts; narrower but still >= G2)
  const [t3bIndex, setT3bIndex] = useState(0);
  const [t3bCorrect, setT3bCorrect] = useState(0);
  const [t3bWrong, setT3bWrong] = useState(0);
  const [t3bRetryUsed, setT3bRetryUsed] = useState(false);
  const [t3bLastWrongChoice, setT3bLastWrongChoice] = useState<IntervalLabel | null>(null);
  useEffect(() => {
    setT3bRetryUsed(false);
    setT3bLastWrongChoice(null);
  }, [t3bIndex]);
  const T3B_TOTAL = 8;
  const T3B_PASS = 6;
  const t3bDone = t3bIndex >= T3B_TOTAL;
  const t3bQ = useMemo(
    () =>
      makeIntervalLabelQuestion({
        seed: seed * 1000 + 1290 + t3bIndex,
        rootMinMidi: WIDE_REGISTER_MIN_MIDI, // G2
        rootMaxMidi: 55, // G3 (tight range; still “test” register rule)
        minSemitones: 0,
        maxSemitones: 12,
        allowedSemitones: practice ? practiceAllowedSemitones : undefined,
        choiceCount: 6,
      }),
    [seed, t3bIndex],
  );

  // Test 3: interval recognition across a wider register (G2 and above).
  const [t3Index, setT3Index] = useState(0);
  const [t3Correct, setT3Correct] = useState(0);
  const [t3Wrong, setT3Wrong] = useState(0);
  const [t3RetryUsed, setT3RetryUsed] = useState(false);
  const [t3LastWrongChoice, setT3LastWrongChoice] = useState<IntervalLabel | null>(null);
  useEffect(() => {
    setT3RetryUsed(false);
    setT3LastWrongChoice(null);
  }, [t3Index]);
  const T3_TOTAL = 10;
  const T3_PASS = 8;
  const t3Done = t3Index >= T3_TOTAL || t3Wrong >= HEARTS;
  const t3Q = useMemo(
    () =>
      makeIntervalLabelQuestion({
        seed: seed * 1000 + 1300 + t3Index,
        rootMinMidi: WIDE_REGISTER_MIN_MIDI, // G2
        rootMaxMidi: DEFAULT_WIDE_REGISTER_MAX_MIDI, // C5 (keeps target <= C6 when +12)
        minSemitones: 0,
        maxSemitones: 12,
        allowedSemitones: practice ? practiceAllowedSemitones : undefined,
        choiceCount: 6,
      }),
    [seed, t3Index],
  );

  // INTERVALS Exam: interval recognition across a wider register (G2 and above).
  const [e3Index, setE3Index] = useState(0);
  const [e3Correct, setE3Correct] = useState(0);
  const [e3Wrong, setE3Wrong] = useState(0);
  const [e3RetryUsed, setE3RetryUsed] = useState(false);
  const [e3LastWrongChoice, setE3LastWrongChoice] = useState<IntervalLabel | null>(null);
  useEffect(() => {
    setE3RetryUsed(false);
    setE3LastWrongChoice(null);
  }, [e3Index]);
  const E3_TOTAL = 10;
  const E3_PASS = 8;
  const e3Done = e3Index >= E3_TOTAL || e3Wrong >= HEARTS;
  const e3Q = useMemo(
    () =>
      makeIntervalLabelQuestion({
        seed: seed * 1000 + 1313 + e3Index,
        rootMinMidi: WIDE_REGISTER_MIN_MIDI, // G2
        rootMaxMidi: DEFAULT_WIDE_REGISTER_MAX_MIDI, // C5
        minSemitones: 0,
        maxSemitones: 12,
        allowedSemitones: practice ? practiceAllowedSemitones : undefined,
        choiceCount: 7,
      }),
    [seed, e3Index],
  );

  // Station 4: triad-quality question (stable register)
  const triadQ = useMemo(() => makeTriadQualityQuestion({ seed: seed * 1000 + 4 }), [seed]);
  const [s4Correct, setS4Correct] = useState(0);
  const S4_GOAL = 6;

  // Test 5: triad quality recognition across a wider register (G2 and above).
  const [t5Index, setT5Index] = useState(0);
  const [t5Correct, setT5Correct] = useState(0);
  const [t5Wrong, setT5Wrong] = useState(0);
  const T5_TOTAL = 10;
  const T5_PASS = 8;
  const t5Q = useMemo(
    () =>
      makeTriadQualityQuestion({
        seed: seed * 1000 + 1500 + t5Index,
        minRootMidi: WIDE_REGISTER_MIN_MIDI, // G2
        maxRootMidi: 77, // F5 (keeps 5th <= C6-ish)
        choiceCount: 3,
      }),
    [seed, t5Index],
  );

  // Test 6: diatonic triad quality in key across a wider register (G2 and above).
  const [t6Index, setT6Index] = useState(0);
  const [t6Correct, setT6Correct] = useState(0);
  const [t6Wrong, setT6Wrong] = useState(0);
  const T6_TOTAL = 10;
  const T6_PASS = 8;
  const t6Q = useMemo(
    () =>
      makeDiatonicTriadQualityQuestion({
        seed: seed * 1000 + 1600 + t6Index,
        mode: 'test',
        tonicMinMidi: WIDE_REGISTER_MIN_MIDI, // G2
        tonicMaxMidi: 65, // F4-ish (keeps chord comfortably below C6)
        choiceCount: 3,
      }),
    [seed, t6Index],
  );

  // Station 5: diatonic triads inside a major key (stable register)
  const diatonicQ = useMemo(() => makeDiatonicTriadQualityQuestion({ seed: seed * 1000 + 5 }), [seed]);
  const [s5Correct, setS5Correct] = useState(0);
  const S5_GOAL = 7;

  // Station 6: chord function families (tonic / subdominant / dominant)
  const funcQ = useMemo(() => makeFunctionFamilyQuestion({ seed: seed * 1000 + 6 }), [seed]);
  const [s6Correct, setS6Correct] = useState(0);
  const S6_GOAL = 6;

  // Test 7: function families across a wider register (G2 and above).
  const [t7Index, setT7Index] = useState(0);
  const [t7Correct, setT7Correct] = useState(0);
  const [t7Wrong, setT7Wrong] = useState(0);
  const T7_TOTAL = 10;
  const T7_PASS = 8;
  const t7Q = useMemo(
    () =>
      makeFunctionFamilyQuestion({
        seed: seed * 1000 + 1700 + t7Index,
        tonicMinMidi: WIDE_REGISTER_MIN_MIDI, // G2
        tonicMaxMidi: 65, // F4-ish
      }),
    [seed, t7Index],
  );

  // Station 7: scale degree role names (tonic, supertonic, ...)
  const degreeQ = useMemo(
    () => makeScaleDegreeNameQuestion({ seed: seed * 1000 + 7, choiceCount: 4, mode: 'lesson' }),
    [seed],
  );
  const [s7Correct, setS7Correct] = useState(0);
  const [s7PrimerPlayed, setS7PrimerPlayed] = useState(false);
  const S7_GOAL = 7;

  // Don’t force the key primer to replay every time the user taps “Hear degree” on the same question.
  // (They can still replay it explicitly via the UI.)
  useEffect(() => {
    setS7PrimerPlayed(false);
  }, [degreeQ.tonicMidi, degreeQ.targetMidi]);

  // Test 4: degree names across a wider register (G2 and above).
  const [t4Index, setT4Index] = useState(0);
  const [t4Correct, setT4Correct] = useState(0);
  const [t4Wrong, setT4Wrong] = useState(0);
  const T4_TOTAL = 10;
  const T4_PASS = 8;
  const t4Q = useMemo(
    () =>
      makeScaleDegreeNameQuestion({
        seed: seed * 1000 + 1400 + t4Index,
        choiceCount: 6,
        mode: 'test',
      }),
    [seed, t4Index],
  );

  // Station 8: connect scale degrees to interval labels in a major key.
  const degreeIntervalQ = useMemo(
    () => makeDegreeIntervalQuestion({ seed: seed * 1000 + 8, choiceCount: 4, mode: 'lesson' }),
    [seed],
  );
  const [s8Correct, setS8Correct] = useState(0);
  const S8_GOAL = 7;

  // Test 8: degree → interval mapping across a wider register (G2 and above).
  const [t8Index, setT8Index] = useState(0);
  const [t8Correct, setT8Correct] = useState(0);
  const [t8Wrong, setT8Wrong] = useState(0);
  const T8_TOTAL = 10;
  const T8_PASS = 8;
  const t8Q = useMemo(
    () =>
      makeDegreeIntervalQuestion({
        seed: seed * 1000 + 1800 + t8Index,
        choiceCount: 6,
        mode: 'test',
      }),
    [seed, t8Index],
  );

  // Test 1: note names across a wider range (G2 and above).
  const [t1Index, setT1Index] = useState(0);
  const [t1Correct, setT1Correct] = useState(0);
  const [t1Wrong, setT1Wrong] = useState(0);
  const T1_TOTAL = 10;
  const T1_PASS = 8;
  const t1Q = useMemo(
    () =>
      makeNoteNameQuestion({
        seed: seed * 1000 + 1100 + t1Index,
        minMidi: WIDE_REGISTER_MIN_MIDI, // G2
        maxMidi: 84, // C6
        choiceCount: 6,
      }),
    [seed, t1Index],
  );

  // NOTES Exam: mixed note reading across a wider range (G2 and above).
  const [e1Index, setE1Index] = useState(0);
  const [e1Correct, setE1Correct] = useState(0);
  const [e1Wrong, setE1Wrong] = useState(0);
  const E1_TOTAL = 10;
  const E1_PASS = 8;
  const e1Q = useMemo(
    () =>
      makeNoteNameQuestion({
        seed: seed * 1000 + 1112 + e1Index,
        minMidi: WIDE_REGISTER_MIN_MIDI, // G2
        maxMidi: 88, // E6
        choiceCount: 7,
      }),
    [seed, e1Index],
  );

  // Mid-test 1B: notes & staff anchor (stable register, no hearts penalty; hints allowed)
  const [t1bIndex, setT1bIndex] = useState(0);
  const [t1bCorrect, setT1bCorrect] = useState(0);
  const [t1bWrong, setT1bWrong] = useState(0);
  const [t1bHintOpen, setT1bHintOpen] = useState(false);
  const T1B_TOTAL = 8;
  const T1B_PASS = 6;
  const t1bDone = t1bIndex >= T1B_TOTAL;
  const t1bQ = useMemo(
    () =>
      makeNoteNameQuestionFromMidis({
        seed: seed * 1000 + 1115 + t1bIndex,
        midis: WHITE_MIDIS,
        choiceCount: 6,
      }),
    [seed, t1bIndex],
  );

  // Test 2: major scale spelling (degrees) across a broader register.
  const [t2Index, setT2Index] = useState(0);
  const [t2Correct, setT2Correct] = useState(0);
  const [t2Wrong, setT2Wrong] = useState(0);
  const T2_TOTAL = 10;
  const T2_PASS = 8;
  const t2Q = useMemo(
    () =>
      makeMajorScaleTestQuestion({
        seed: seed * 1000 + 1200 + t2Index,
        choiceCount: 6,
      }),
    [seed, t2Index],
  );

  // S1: Notes (TTT runner)
  const [s1Correct, setS1Correct] = useState(0);
  const S1_GOAL = 8;
  const s1TestComplete = s1Correct >= S1_GOAL;
  const [s1TeachDone, setS1TeachDone] = useState(false);
  const [s1HintOpen, setS1HintOpen] = useState(false);

  // S1 Twist: a short scored round (still stable register; hearts apply here).
  const S1_TWIST_TOTAL = 10;
  const S1_TWIST_PASS = 8;
  const [s1TwistIndex, setS1TwistIndex] = useState(0);
  const [s1TwistCorrect, setS1TwistCorrect] = useState(0);
  const [s1TwistWrong, setS1TwistWrong] = useState(0);
  const s1TwistDone = s1TwistIndex >= S1_TWIST_TOTAL || s1TwistWrong >= HEARTS;
  const s1TwistPassed = s1TwistDone && s1TwistCorrect >= S1_TWIST_PASS;

  const s1TwistQ = useMemo(
    () =>
      makeNoteNameQuestionFromMidis({
        seed: seed * 1000 + 1110 + s1TwistIndex,
        midis: WHITE_MIDIS,
        choiceCount: 6,
      }),
    [seed, s1TwistIndex],
  );

  // S1B: Notes on staff (TTT runner)
  const [s1bCorrect, setS1bCorrect] = useState(0);
  const S1B_GOAL = 7;
  const s1bTestComplete = s1bCorrect >= S1B_GOAL;
  const [s1bTeachDone, setS1bTeachDone] = useState(false);
  const [s1bHintOpen, setS1bHintOpen] = useState(false);

  const s1bQ = useMemo(
    () =>
      makeNoteNameQuestion({
        seed: seed * 1000 + 1120,
        minMidi: STABLE_REGISTER_MIN_MIDI,
        maxMidi: STABLE_REGISTER_MAX_MIDI,
        choiceCount: 6,
      }),
    [seed],
  );

  // S1B Twist
  const S1B_TWIST_TOTAL = 10;
  const S1B_TWIST_PASS = 8;
  const [s1bTwistIndex, setS1bTwistIndex] = useState(0);
  const [s1bTwistCorrect, setS1bTwistCorrect] = useState(0);
  const [s1bTwistWrong, setS1bTwistWrong] = useState(0);
  const s1bTwistDone = s1bTwistIndex >= S1B_TWIST_TOTAL || s1bTwistWrong >= HEARTS;
  const s1bTwistPassed = s1bTwistDone && s1bTwistCorrect >= S1B_TWIST_PASS;

  const s1bTwistQ = useMemo(
    () =>
      makeNoteNameQuestion({
        seed: seed * 1000 + 1121 + s1bTwistIndex,
        minMidi: STABLE_REGISTER_MIN_MIDI,
        maxMidi: STABLE_REGISTER_MAX_MIDI,
        choiceCount: 6,
      }),
    [seed, s1bTwistIndex],
  );

  // S1C: Accidentals (black keys) — stable register, curated note set.
  const BLACK_MIDIS = [61, 63, 66, 68, 70]; // C# D# F# G# A# (one octave)

  const [s1cCorrect, setS1cCorrect] = useState(0);
  const S1C_GOAL = 7;
  const s1cTestComplete = s1cCorrect >= S1C_GOAL;
  const [s1cTeachDone, setS1cTeachDone] = useState(false);
  const [s1cHintOpen, setS1cHintOpen] = useState(false);

  const s1cQ = useMemo(
    () =>
      makeNoteNameQuestionFromMidis({
        seed: seed * 1000 + 1130,
        midis: BLACK_MIDIS,
        choiceCount: 6,
      }),
    [seed],
  );

  const S1C_TWIST_TOTAL = 10;
  const S1C_TWIST_PASS = 8;
  const [s1cTwistIndex, setS1cTwistIndex] = useState(0);
  const [s1cTwistCorrect, setS1cTwistCorrect] = useState(0);
  const [s1cTwistWrong, setS1cTwistWrong] = useState(0);
  const s1cTwistDone = s1cTwistIndex >= S1C_TWIST_TOTAL || s1cTwistWrong >= HEARTS;
  const s1cTwistPassed = s1cTwistDone && s1cTwistCorrect >= S1C_TWIST_PASS;

  const s1cTwistQ = useMemo(
    () =>
      makeNoteNameQuestionFromMidis({
        seed: seed * 1000 + 1131 + s1cTwistIndex,
        midis: BLACK_MIDIS,
        choiceCount: 6,
      }),
    [seed, s1cTwistIndex],
  );

  // S2 micro-goal: internalize WWHWWWH, then spell major scales in order (letters ascend; correct accidentals).
  const [s2PatternIndex, setS2PatternIndex] = useState(0); // 0..6 (7→8 ends the pattern)
  const [s2PatternDone, setS2PatternDone] = useState(false);
  const s2PatternQ = useMemo(
    () => makeMajorScaleStepTypeQuestion({ seed: seed * 1000 + 210, stepIndex: s2PatternIndex }),
    [seed, s2PatternIndex],
  );

  const s2Session = useMemo(() => makeMajorScaleSession({ seed: seed * 1000 + 2 }), [seed]);
  const [s2Step, setS2Step] = useState(1); // 1..6 (next note after tonic)
  const [s2CompletedScales, setS2CompletedScales] = useState(0);
  const S2_GOAL_SCALES = 2;

  const s2ShownSoFar = useMemo(() => s2Session.scale.slice(0, s2Step), [s2Session, s2Step]);

  const s2Q = useMemo(
    () =>
      makeMajorScaleStepQuestion({
        seed: seed * 1000 + 200 + s2Step,
        session: s2Session,
        stepIndex: s2Step,
        shownSoFar: s2ShownSoFar,
        choiceCount: 4,
      }),
    [seed, s2Session, s2Step, s2ShownSoFar],
  );

  const s2ScaleMidis = useMemo(() => MAJOR_OFFSETS.map((o) => s2Session.tonicMidi + o), [s2Session]);
  const s2ScaleSoFarMidis = useMemo(() => s2ScaleMidis.slice(0, s2Step), [s2ScaleMidis, s2Step]);

  function applySectionExamPass(p: Progress, passedStationId: StationId): Progress {
    const ids = sectionStationsByExamId(passedStationId);
    if (!ids) return p;
    let p2 = p;
    for (const sid of ids) {
      p2 = markStationDone(p2, sid);
    }
    return p2;
  }

  function commitProgress(next: Progress) {
    // Quests: count any newly-completed station(s) today.
    // (Exam “test out” can complete multiple stations at once.)
    let delta = 0;
    for (const [sid, doneNext] of Object.entries(next.stationDone)) {
      if (doneNext && !progress.stationDone[sid as StationId]) delta += 1;
    }
    if (delta > 0) bumpStationCompleted(delta);

    // Daily goal celebration: fire exactly when crossing the threshold.
    const goal = Math.max(1, next.dailyGoalXp || 0);
    const before = Math.max(0, progress.dailyXpToday || 0);
    const after = Math.max(0, next.dailyXpToday || 0);
    if (before < goal && after >= goal) {
      const ymd = next.dailyYmd ?? progress.dailyYmd ?? undefined;
      if (!hasShownDailyGoalReachedToast(ymd)) {
        markDailyGoalReachedToastShown(ymd);
        setToast({ text: 'Daily goal reached — nice.' });
      }
    }

    setProgress(next);
  }

  function rewardAndMaybeComplete(
    xpGain: number,
    extra?: { stationDone?: StationId; completionBonusXp?: number },
    opts?: { combo?: boolean },
  ) {
    const comboEnabled = opts?.combo ?? station?.kind === 'lesson';

    // “Combo” is intentionally tiny: it exists to encourage flow, not to inflate XP.
    // After 3 consecutive correct answers, every further correct gets +1 XP.
    let bonus = 0;
    if (comboEnabled) {
      const nextCombo = combo + 1;
      bonus = nextCombo >= 3 ? 1 : 0;
      setCombo(nextCombo);
    }

    let p2 = applyStudyReward(progress, xpGain + bonus);

    // S1 completion is handled by the TTT runner (Teach → Test → Twist), not by the warm-up test loop.

    // S3 completion is handled by the TTT runner (Twist pass), not by the warm-up/test loop.

    if (id === 'S4_TRIADS' && s4Correct + 1 >= S4_GOAL) {
      p2 = markStationDone(p2, id);
      p2 = applyStudyReward(p2, 10); // completion bonus
    }

    if (id === 'S5_DIATONIC_TRIADS' && s5Correct + 1 >= S5_GOAL) {
      p2 = markStationDone(p2, id);
      p2 = applyStudyReward(p2, 12); // completion bonus
    }

    if (id === 'S6_FUNCTIONS' && s6Correct + 1 >= S6_GOAL) {
      p2 = markStationDone(p2, id);
      p2 = applyStudyReward(p2, 12); // completion bonus
    }

    if (id === 'S7_DEGREES' && s7Correct + 1 >= S7_GOAL) {
      p2 = markStationDone(p2, id);
      p2 = applyStudyReward(p2, 10); // completion bonus
    }

    if (id === 'S8_DEGREE_INTERVALS' && s8Correct + 1 >= S8_GOAL) {
      p2 = markStationDone(p2, id);
      p2 = applyStudyReward(p2, 10); // completion bonus
    }

    if (extra?.stationDone) {
      p2 = markStationDone(p2, extra.stationDone);
      if (extra.completionBonusXp) {
        p2 = applyStudyReward(p2, extra.completionBonusXp);
      }
    }

    commitProgress(p2);
  }

  async function playPromptS3() {
    setResult('idle');
    setHighlighted({ [intervalQ.rootMidi]: 'active' });
    await piano.playMidi(intervalQ.rootMidi, { durationSec: dur(0.7), velocity: 0.9 });
    await new Promise((r) => setTimeout(r, gap(350)));
    setHighlighted({ [intervalQ.targetMidi]: 'active' });
    await piano.playMidi(intervalQ.targetMidi, { durationSec: dur(0.9), velocity: 0.9 });
    setHighlighted({});
  }

  async function onPressS3(midi: number) {
    if (!s3WarmupDone) return;

    setHighlighted({ [midi]: 'active' });
    await piano.playMidi(midi, { durationSec: dur(0.9), velocity: 0.9 });
    const ok = midi === intervalQ.targetMidi;

    setResult(ok ? 'correct' : 'wrong');
    setHighlighted({ [intervalQ.targetMidi]: 'correct', ...(ok ? {} : { [midi]: 'wrong' }) });

    if (!ok) {
      setCombo(0);
      return;
    }

    const nextCorrect = s3Correct + 1;
    setS3Correct(nextCorrect);

    // This is the “Test” phase of the lesson; completion happens after the Twist is passed.
    rewardAndMaybeComplete(10);
  }

  function chooseS3Derive(choice: IntervalLabel) {
    const ok = choice === s3DeriveQ.correct;
    setS3DeriveResult(ok ? 'correct' : 'wrong');

    if (!ok) {
      setCombo(0);
      return;
    }

    setS3DeriveCorrect((n) => n + 1);
    setProgress(applyStudyReward(progress, 1));

    // advance
    setS3DeriveIndex((i) => i + 1);
    setS3DeriveResult('idle');
  }

  async function playPromptS3Twist() {
    if (s3TwistDone) return;
    setResult('idle');
    setHighlighted({});
    await playIntervalPrompt(s3TwistQ.rootMidi, s3TwistQ.targetMidi, {
      mode: intervalPromptMode,
      harmonicAlsoMelodic: harmonicHelperEnabled(false),
      gapMs: gap(320),
      rootDurationSec: dur(0.7),
      targetDurationSec: dur(0.95),
    });
  }

  async function chooseS3Twist(choice: IntervalLabel) {
    if (s3TwistDone) return;

    const ok = choice === s3TwistQ.correct;
    setResult(ok ? 'correct' : 'wrong');

    if (!ok) {
      const key = `${id}:S3_TWIST:${s3TwistIndex}`;
      if (station?.kind === 'lesson' && settings.lessonRetryOnce && lessonRetryKey !== key) {
        setLessonRetryKey(key);
        return;
      }

      setLessonRetryKey(null);
      trackMistake({ kind: 'intervalLabel', sourceStationId: id, rootMidi: s3TwistQ.rootMidi, semitones: s3TwistQ.semitones });
      setS3TwistWrong((n) => n + 1);
      setS3TwistIndex((i) => i + 1);
      return;
    }

    setLessonRetryKey(null);

    setS3TwistCorrect((n) => n + 1);
    commitProgress(applyStudyReward(progress, 3));

    const nextIndex = s3TwistIndex + 1;
    if (nextIndex >= S3_TWIST_TOTAL) {
      setS3TwistIndex(S3_TWIST_TOTAL);
      return;
    }
    setS3TwistIndex(nextIndex);
  }

  function resetS3Twist() {
    setS3TwistIndex(0);
    setS3TwistCorrect(0);
    setS3TwistWrong(0);
    setResult('idle');
    setHighlighted({});
    setLessonRetryKey(null);
    setSeed((x) => x + 1);
  }

  // When the Twist is passed, mark the lesson complete.
  useEffect(() => {
    if (id !== 'S3_INTERVALS') return;
    if (!s3TwistPassed) return;
    if (progress.stationDone[id]) return;

    const t = window.setTimeout(() => {
      let p2 = progress;
      p2 = markStationDone(p2, id);
      p2 = applyStudyReward(p2, 10);
      commitProgress(p2);
    }, 0);

    return () => window.clearTimeout(t);
  }, [id, s3TwistPassed, progress]);

  async function playPromptS1() {
    setResult('idle');
    setHighlighted({ [noteQ.midi]: 'active' });
    await piano.playMidi(noteQ.midi, { durationSec: dur(0.9), velocity: 0.95 });
    setHighlighted({});
  }

  async function chooseS1(choice: string) {
    const ok = noteQ.acceptedAnswers.includes(choice);
    setResult(ok ? 'correct' : 'wrong');
    setHighlighted({ [noteQ.midi]: ok ? 'correct' : 'wrong' });

    if (!ok) {
      setCombo(0);
      trackMistake({ kind: 'noteName', sourceStationId: id, midi: noteQ.midi });
      return;
    }

    setS1Correct((x) => x + 1);
    rewardAndMaybeComplete(2);
  }

  async function playPromptS1Twist() {
    setResult('idle');
    setHighlighted({ [s1TwistQ.midi]: 'active' });
    await piano.playMidi(s1TwistQ.midi, { durationSec: dur(0.9), velocity: 0.95 });
    setHighlighted({});
  }

  async function chooseS1Twist(choice: string) {
    if (s1TwistDone) return;

    const ok = s1TwistQ.acceptedAnswers.includes(choice);
    setResult(ok ? 'correct' : 'wrong');
    setHighlighted({ [s1TwistQ.midi]: ok ? 'correct' : 'wrong' });

    if (!ok) {
      const key = `${id}:S1_TWIST:${s1TwistIndex}`;
      if (station?.kind === 'lesson' && settings.lessonRetryOnce && lessonRetryKey !== key) {
        setLessonRetryKey(key);
        return;
      }

      setLessonRetryKey(null);
      trackMistake({ kind: 'noteName', sourceStationId: id, midi: s1TwistQ.midi });
      setS1TwistWrong((n) => n + 1);
      setS1TwistIndex((i) => i + 1);
      return;
    }

    setLessonRetryKey(null);

    setS1TwistCorrect((n) => n + 1);
    commitProgress(applyStudyReward(progress, 3));

    const nextIndex = s1TwistIndex + 1;
    if (nextIndex >= S1_TWIST_TOTAL) {
      // finalize in render via s1TwistPassed
      setS1TwistIndex(S1_TWIST_TOTAL);
      return;
    }
    setS1TwistIndex(nextIndex);
  }

  function resetS1Twist() {
    setS1TwistIndex(0);
    setS1TwistCorrect(0);
    setS1TwistWrong(0);
    setResult('idle');
    setHighlighted({});
    setLessonRetryKey(null);
    setSeed((x) => x + 1);
  }

  async function playPromptS1B() {
    setResult('idle');
    setHighlighted({ [s1bQ.midi]: 'active' });
    await piano.playMidi(s1bQ.midi, { durationSec: dur(0.9), velocity: 0.95 });
    setHighlighted({});
  }

  function chooseS1B(choice: string) {
    const ok = s1bQ.acceptedAnswers.includes(choice);
    setResult(ok ? 'correct' : 'wrong');
    setHighlighted({ [s1bQ.midi]: ok ? 'correct' : 'wrong' });

    if (!ok) {
      setCombo(0);
      trackMistake({ kind: 'noteName', sourceStationId: id, midi: s1bQ.midi });
      return;
    }

    setS1bCorrect((x) => x + 1);
    rewardAndMaybeComplete(2);
  }

  async function playPromptS1BTwist() {
    setResult('idle');
    setHighlighted({ [s1bTwistQ.midi]: 'active' });
    await piano.playMidi(s1bTwistQ.midi, { durationSec: dur(0.9), velocity: 0.95 });
    setHighlighted({});
  }

  async function chooseS1BTwist(choice: string) {
    if (s1bTwistDone) return;

    const ok = s1bTwistQ.acceptedAnswers.includes(choice);
    setResult(ok ? 'correct' : 'wrong');
    setHighlighted({ [s1bTwistQ.midi]: ok ? 'correct' : 'wrong' });

    if (!ok) {
      const key = `${id}:S1B_TWIST:${s1bTwistIndex}`;
      if (station?.kind === 'lesson' && settings.lessonRetryOnce && lessonRetryKey !== key) {
        setLessonRetryKey(key);
        return;
      }

      setLessonRetryKey(null);
      trackMistake({ kind: 'noteName', sourceStationId: id, midi: s1bTwistQ.midi });
      setS1bTwistWrong((n) => n + 1);
      setS1bTwistIndex((i) => i + 1);
      return;
    }

    setLessonRetryKey(null);

    setS1bTwistCorrect((n) => n + 1);
    commitProgress(applyStudyReward(progress, 3));

    const nextIndex = s1bTwistIndex + 1;
    if (nextIndex >= S1B_TWIST_TOTAL) {
      setS1bTwistIndex(S1B_TWIST_TOTAL);
      return;
    }
    setS1bTwistIndex(nextIndex);
  }

  function resetS1BTwist() {
    setS1bTwistIndex(0);
    setS1bTwistCorrect(0);
    setS1bTwistWrong(0);
    setResult('idle');
    setHighlighted({});
    setLessonRetryKey(null);
    setSeed((x) => x + 1);
  }

  // When the Twist is passed, mark the lesson complete.
  useEffect(() => {
    if (id !== 'S1B_STAFF') return;
    if (!s1bTwistPassed) return;
    if (progress.stationDone[id]) return;

    const t = window.setTimeout(() => {
      let p2 = progress;
      p2 = markStationDone(p2, id);
      p2 = applyStudyReward(p2, 10);
      commitProgress(p2);
    }, 0);

    return () => window.clearTimeout(t);
  }, [id, s1bTwistPassed, progress]);

  // When the Twist is passed, mark the lesson complete (Duolingo-ish “earned it” moment).
  useEffect(() => {
    if (id !== 'S1_NOTES') return;
    if (!s1TwistPassed) return;
    if (progress.stationDone[id]) return;

    const t = window.setTimeout(() => {
      let p2 = progress;
      p2 = markStationDone(p2, id);
      p2 = applyStudyReward(p2, 10); // completion bonus
      commitProgress(p2);
    }, 0);

    return () => window.clearTimeout(t);
  }, [id, s1TwistPassed, progress]);

  async function playPromptS1C() {
    setResult('idle');
    setHighlighted({ [s1cQ.midi]: 'active' });
    await piano.playMidi(s1cQ.midi, { durationSec: dur(0.9), velocity: 0.95 });
    setHighlighted({});
  }

  function chooseS1C(choice: string) {
    const ok = s1cQ.acceptedAnswers.includes(choice);
    setResult(ok ? 'correct' : 'wrong');
    setHighlighted({ [s1cQ.midi]: ok ? 'correct' : 'wrong' });

    if (!ok) {
      setCombo(0);
      trackMistake({ kind: 'noteName', sourceStationId: id, midi: s1cQ.midi });
      return;
    }

    setS1cCorrect((x) => x + 1);
    rewardAndMaybeComplete(2);
  }

  async function playPromptS1CTwist() {
    setResult('idle');
    setHighlighted({ [s1cTwistQ.midi]: 'active' });
    await piano.playMidi(s1cTwistQ.midi, { durationSec: dur(0.9), velocity: 0.95 });
    setHighlighted({});
  }

  async function chooseS1CTwist(choice: string) {
    if (s1cTwistDone) return;

    const ok = s1cTwistQ.acceptedAnswers.includes(choice);
    setResult(ok ? 'correct' : 'wrong');
    setHighlighted({ [s1cTwistQ.midi]: ok ? 'correct' : 'wrong' });

    if (!ok) {
      const key = `${id}:S1C_TWIST:${s1cTwistIndex}`;
      if (station?.kind === 'lesson' && settings.lessonRetryOnce && lessonRetryKey !== key) {
        setLessonRetryKey(key);
        return;
      }

      setLessonRetryKey(null);
      trackMistake({ kind: 'noteName', sourceStationId: id, midi: s1cTwistQ.midi });
      setS1cTwistWrong((n) => n + 1);
      setS1cTwistIndex((i) => i + 1);
      return;
    }

    setLessonRetryKey(null);

    setS1cTwistCorrect((n) => n + 1);
    commitProgress(applyStudyReward(progress, 3));

    const nextIndex = s1cTwistIndex + 1;
    if (nextIndex >= S1C_TWIST_TOTAL) {
      setS1cTwistIndex(S1C_TWIST_TOTAL);
      return;
    }
    setS1cTwistIndex(nextIndex);
  }

  function resetS1CTwist() {
    setS1cTwistIndex(0);
    setS1cTwistCorrect(0);
    setS1cTwistWrong(0);
    setResult('idle');
    setHighlighted({});
    setLessonRetryKey(null);
    setSeed((x) => x + 1);
  }

  // When the Twist is passed, mark the lesson complete.
  useEffect(() => {
    if (id !== 'S1C_ACCIDENTALS') return;
    if (!s1cTwistPassed) return;
    if (progress.stationDone[id]) return;

    const t = window.setTimeout(() => {
      let p2 = progress;
      p2 = markStationDone(p2, id);
      p2 = applyStudyReward(p2, 10);
      commitProgress(p2);
    }, 0);

    return () => window.clearTimeout(t);
  }, [id, s1cTwistPassed, progress]);

  async function playS2Scale(kind: 'soFar' | 'full' | 'fullOctave') {
    setResult('idle');
    const base = kind === 'soFar' ? s2ScaleSoFarMidis : s2ScaleMidis;
    const seq = kind === 'fullOctave' ? [...base, base[0] + 12] : base;
    setHighlighted(Object.fromEntries(seq.map((m) => [m, 'active'])) as Record<number, 'active'>);
    await playNoteSequence(seq, { durationSec: dur(0.45), velocity: 0.9, gapMs: gap(90) });
    setHighlighted({});
  }

  async function playPromptS2() {
    setResult('idle');
    setHighlighted({ [s2Q.tonicMidi]: 'active' });
    await piano.playMidi(s2Q.tonicMidi, { durationSec: dur(0.65), velocity: 0.9 });
    await new Promise((r) => setTimeout(r, gap(250)));
    setHighlighted({ [s2Q.targetMidi]: 'active' });
    await piano.playMidi(s2Q.targetMidi, { durationSec: dur(0.85), velocity: 0.9 });
    setHighlighted({});
  }

  function chooseS2Pattern(choice: StepType) {
    if (s2PatternDone) return;

    const ok = choice === s2PatternQ.correct;
    setResult(ok ? 'correct' : 'wrong');

    if (!ok) {
      setCombo(0);
      return;
    }

    // Small reward per step; completion bonus for locking the formula in.
    rewardAndMaybeComplete(1);

    if (s2PatternIndex >= 6) {
      setS2PatternDone(true);
      rewardAndMaybeComplete(6, undefined, { combo: false });
      setResult('idle');
      return;
    }

    setS2PatternIndex((x) => Math.min(6, x + 1));
    setResult('idle');
  }

  async function chooseS2(choice: string) {
    const ok = choice === s2Q.correct;
    setResult(ok ? 'correct' : 'wrong');

    if (!ok) {
      setCombo(0);
      setHighlighted({ [s2Q.targetMidi]: 'correct' });
      trackMistake({
        kind: 'majorScaleDegree',
        sourceStationId: id,
        key: s2Q.key,
        degree: (s2Q.stepIndex + 1) as 2 | 3 | 4 | 5 | 6 | 7,
      });
      return;
    }

    // +2 XP per correct step.
    rewardAndMaybeComplete(2);

    // advance to next scale note; if finished, count a completed scale and rotate key.
    if (s2Step >= 6) {
      setS2CompletedScales((n) => n + 1);
      // completion bonus for finishing the scale.
      let completionBonus = 6;
      const willHitGoal = s2CompletedScales + 1 >= S2_GOAL_SCALES;
      if (willHitGoal) completionBonus += 10;

      rewardAndMaybeComplete(completionBonus, willHitGoal ? { stationDone: 'S2_MAJOR_SCALE' } : undefined, { combo: false });

      setS2Step(1);
      setSeed((x) => x + 1);
      setHighlighted({});
      setResult('idle');
      return;
    }

    setS2Step((x) => Math.min(6, x + 1));
  }

  function next() {
    setResult('idle');
    setHighlighted({});
    if (id === 'S7_DEGREES') setS7PrimerPlayed(false);
    setSeed((x) => x + 1);
  }

  async function playPromptS4() {
    setResult('idle');
    // root then chord (lesson default: arp)
    setHighlighted({ [triadQ.rootMidi]: 'active' });
    await piano.playMidi(triadQ.rootMidi, { durationSec: dur(0.65), velocity: 0.9 });
    await new Promise((r) => setTimeout(r, gap(250)));
    const active: Record<number, 'active'> = Object.fromEntries(triadQ.chordMidis.map((m) => [m, 'active'])) as Record<
      number,
      'active'
    >;
    setHighlighted(active);
    await piano.playChord(triadQ.chordMidis, { mode: chordMode, durationSec: dur(1.1), velocity: 0.92, gapMs: gap(130) });
    setHighlighted({});
  }

  async function playPromptS4BlockPreview() {
    // Explicit “block chord” intro: tests/exams use block chords by default.
    setResult('idle');
    setHighlighted({ [triadQ.rootMidi]: 'active' });
    await piano.playMidi(triadQ.rootMidi, { durationSec: dur(0.65), velocity: 0.9 });
    await new Promise((r) => setTimeout(r, gap(250)));
    const active: Record<number, 'active'> = Object.fromEntries(triadQ.chordMidis.map((m) => [m, 'active'])) as Record<
      number,
      'active'
    >;
    setHighlighted(active);
    await piano.playChord(triadQ.chordMidis, { mode: 'block', durationSec: dur(1.1), velocity: 0.92 });
    setHighlighted({});
  }

  async function playPromptS5() {
    setResult('idle');
    // root then chord (lesson default: arp)
    const rootMidi = diatonicQ.chordMidis[0];
    setHighlighted({ [rootMidi]: 'active' });
    await piano.playMidi(rootMidi, { durationSec: dur(0.65), velocity: 0.9 });
    await new Promise((r) => setTimeout(r, gap(240)));
    const active: Record<number, 'active'> = Object.fromEntries(diatonicQ.chordMidis.map((m) => [m, 'active'])) as Record<
      number,
      'active'
    >;
    setHighlighted(active);
    await piano.playChord(diatonicQ.chordMidis, { mode: chordMode, durationSec: dur(1.1), velocity: 0.92, gapMs: gap(130) });
    setHighlighted({});
  }

  async function playPromptS5BlockPreview() {
    // Preview how tests/exams will sound (block chord).
    setResult('idle');
    const rootMidi = diatonicQ.chordMidis[0];
    setHighlighted({ [rootMidi]: 'active' });
    await piano.playMidi(rootMidi, { durationSec: dur(0.65), velocity: 0.9 });
    await new Promise((r) => setTimeout(r, gap(240)));
    const active: Record<number, 'active'> = Object.fromEntries(diatonicQ.chordMidis.map((m) => [m, 'active'])) as Record<
      number,
      'active'
    >;
    setHighlighted(active);
    await piano.playChord(diatonicQ.chordMidis, { mode: 'block', durationSec: dur(1.1), velocity: 0.92 });
    setHighlighted({});
  }

  async function playPromptS6() {
    setResult('idle');
    // root then chord (lesson default: arp)
    const rootMidi = funcQ.chordMidis[0];
    setHighlighted({ [rootMidi]: 'active' });
    await piano.playMidi(rootMidi, { durationSec: dur(0.65), velocity: 0.9 });
    await new Promise((r) => setTimeout(r, gap(240)));
    const active: Record<number, 'active'> = Object.fromEntries(funcQ.chordMidis.map((m) => [m, 'active'])) as Record<
      number,
      'active'
    >;
    setHighlighted(active);
    await piano.playChord(funcQ.chordMidis, { mode: chordMode, durationSec: dur(1.1), velocity: 0.92, gapMs: gap(130) });
    setHighlighted({});
  }

  async function playPromptS6BlockPreview() {
    // Preview how tests/exams will sound (block chord).
    setResult('idle');
    const rootMidi = funcQ.chordMidis[0];
    setHighlighted({ [rootMidi]: 'active' });
    await piano.playMidi(rootMidi, { durationSec: dur(0.65), velocity: 0.9 });
    await new Promise((r) => setTimeout(r, gap(240)));
    const active: Record<number, 'active'> = Object.fromEntries(funcQ.chordMidis.map((m) => [m, 'active'])) as Record<
      number,
      'active'
    >;
    setHighlighted(active);
    await piano.playChord(funcQ.chordMidis, { mode: 'block', durationSec: dur(1.1), velocity: 0.92 });
    setHighlighted({});
  }

  async function playKeyPrimerTriad(tonicMidi: number) {
    // A quick “this is the key” outline: do–mi–sol–do.
    // Kept intentionally short so it doesn't feel like extra waiting.
    setHighlighted({ [tonicMidi]: 'active' });
    await piano.playMidi(tonicMidi, { durationSec: dur(0.35), velocity: 0.86 });
    await new Promise((r) => setTimeout(r, gap(110)));
    setHighlighted({ [tonicMidi + 4]: 'active' });
    await piano.playMidi(tonicMidi + 4, { durationSec: dur(0.32), velocity: 0.86 });
    await new Promise((r) => setTimeout(r, gap(110)));
    setHighlighted({ [tonicMidi + 7]: 'active' });
    await piano.playMidi(tonicMidi + 7, { durationSec: dur(0.32), velocity: 0.86 });
    await new Promise((r) => setTimeout(r, gap(110)));
    setHighlighted({ [tonicMidi + 12]: 'active' });
    await piano.playMidi(tonicMidi + 12, { durationSec: dur(0.34), velocity: 0.86 });
    await new Promise((r) => setTimeout(r, gap(170)));
  }

  async function playPromptS7() {
    setResult('idle');

    if (settings.playKeyPrimer && !s7PrimerPlayed) {
      setS7PrimerPlayed(true);
      await playKeyPrimerTriad(degreeQ.tonicMidi);
    }

    setHighlighted({ [degreeQ.tonicMidi]: 'active' });
    await piano.playMidi(degreeQ.tonicMidi, { durationSec: dur(0.7), velocity: 0.9 });
    await new Promise((r) => setTimeout(r, gap(260)));
    setHighlighted({ [degreeQ.targetMidi]: 'active' });
    await piano.playMidi(degreeQ.targetMidi, { durationSec: dur(0.9), velocity: 0.92 });
    setHighlighted({});
  }

  async function playKeyHintS7() {
    setResult('idle');
    setS7PrimerPlayed(true);
    await playKeyPrimerTriad(degreeQ.tonicMidi);
  }

  async function chooseS7(choice: ScaleDegreeName) {
    const ok = choice === degreeQ.correct;
    setResult(ok ? 'correct' : 'wrong');

    if (!ok) {
      setCombo(0);
      trackMistake({ kind: 'scaleDegreeName', sourceStationId: id, key: degreeQ.key, degree: degreeQ.degree });
      return;
    }

    setS7Correct((n) => n + 1);
    rewardAndMaybeComplete(3);
  }

  async function playPromptS8() {
    setResult('idle');
    setHighlighted({});
    await playTonicTargetPrompt(degreeIntervalQ.tonicMidi, degreeIntervalQ.targetMidi, {
      gapMs: gap(260),
      targetDurationSec: dur(0.9),
      velocity: 0.9,
    });
  }

  async function chooseS8(choice: IntervalLabel) {
    const ok = choice === degreeIntervalQ.correct;
    setResult(ok ? 'correct' : 'wrong');

    if (!ok) {
      setCombo(0);
      trackMistake({
        kind: 'intervalLabel',
        sourceStationId: id,
        rootMidi: degreeIntervalQ.tonicMidi,
        semitones: degreeIntervalQ.semitones,
      });
      return;
    }

    setS8Correct((n) => n + 1);
    rewardAndMaybeComplete(3);
  }

  async function playPromptT4() {
    setResult('idle');
    setHighlighted({});

    // Tests should feel a bit more “cold start” than lessons.
    // (Key primer stays in lessons like S7; settings remain knowledge-only behind ⚙️.)

    await playTonicTargetPrompt(t4Q.tonicMidi, t4Q.targetMidi, {
      gapMs: gap(260),
      targetDurationSec: dur(0.9),
      velocity: 0.9,
    });
  }

  async function chooseT4(choice: ScaleDegreeName) {
    if (t4Index >= T4_TOTAL) return;
    if (t4Wrong >= HEARTS) return;

    const ok = choice === t4Q.correct;
    setResult(ok ? 'correct' : 'wrong');

    if (!ok) {
      trackMistake({ kind: 'scaleDegreeName', sourceStationId: id, key: t4Q.key, degree: t4Q.degree });

      const nextWrong = t4Wrong + 1;
      setT4Wrong(nextWrong);

      const nextIndex = t4Index + 1;
      if (nextWrong >= HEARTS) {
        setT4Index(T4_TOTAL);
        return;
      }

      if (nextIndex >= T4_TOTAL) {
        setT4Index(T4_TOTAL);
        return;
      }

      setT4Index(nextIndex);
      return;
    }

    setT4Correct((n) => n + 1);

    let p2 = applyStudyReward(progress, 3);

    const nextIndex = t4Index + 1;
    if (nextIndex >= T4_TOTAL) {
      const correct = t4Correct + 1;
      const pass = correct >= T4_PASS;
      if (pass) {
        p2 = applyStudyReward(p2, 12);
        p2 = markStationDone(p2, 'T4_DEGREES');
        p2 = applySectionExamPass(p2, 'T4_DEGREES');
      }
      commitProgress(p2);
      setResult(pass ? 'correct' : 'wrong');
      setT4Index(T4_TOTAL);
      return;
    }

    commitProgress(p2);
    setT4Index(nextIndex);
  }

  function resetT4() {
    setT4Index(0);
    setT4Correct(0);
    setT4Wrong(0);
    setResult('idle');
    setHighlighted({});
    setSeed((x) => x + 1);
  }

  async function playPromptT1() {
    setResult('idle');
    setHighlighted({});
    await piano.playMidi(t1Q.midi, { durationSec: dur(0.9), velocity: 0.95 });
  }

  async function playPromptE1() {
    setResult('idle');
    setHighlighted({});
    await piano.playMidi(e1Q.midi, { durationSec: dur(0.9), velocity: 0.95 });
  }

  async function playPromptT1B() {
    setResult('idle');
    setHighlighted({ [t1bQ.midi]: 'active' });
    await piano.playMidi(t1bQ.midi, { durationSec: dur(0.9), velocity: 0.95 });
    setHighlighted({});
  }

  async function chooseT1B(choice: string) {
    if (t1bDone) return;

    const ok = t1bQ.acceptedAnswers.includes(choice);
    setResult(ok ? 'correct' : 'wrong');
    setHighlighted({ [t1bQ.midi]: ok ? 'correct' : 'wrong' });

    if (!ok) {
      trackMistake({ kind: 'noteName', sourceStationId: id, midi: t1bQ.midi });
      setT1bWrong((n) => n + 1);
      setT1bIndex((i) => Math.min(T1B_TOTAL, i + 1));
      return;
    }

    setT1bCorrect((n) => n + 1);

    let p2 = applyStudyReward(progress, 3);

    const nextIndex = t1bIndex + 1;
    if (nextIndex >= T1B_TOTAL) {
      const correct = t1bCorrect + 1;
      const pass = correct >= T1B_PASS;
      if (pass) {
        p2 = applyStudyReward(p2, 10);
        p2 = markStationDone(p2, 'T1B_NOTES');
      }
      commitProgress(p2);
      setResult(pass ? 'correct' : 'wrong');
      setT1bIndex(T1B_TOTAL);
      return;
    }

    commitProgress(p2);
    setT1bIndex(nextIndex);
  }

  function resetT1B() {
    setT1bIndex(0);
    setT1bCorrect(0);
    setT1bWrong(0);
    setResult('idle');
    setHighlighted({});
    setSeed((x) => x + 1);
  }

  async function chooseT1(choice: string) {
    if (t1Index >= T1_TOTAL) return;
    if (t1Wrong >= HEARTS) return;

    const ok = t1Q.acceptedAnswers.includes(choice);
    setResult(ok ? 'correct' : 'wrong');
    setHighlighted({ [t1Q.midi]: ok ? 'correct' : 'wrong' });

    // Wrong: spend a life, record mistake, and advance.
    if (!ok) {
      trackMistake({ kind: 'noteName', sourceStationId: id, midi: t1Q.midi });

      const nextWrong = t1Wrong + 1;
      setT1Wrong(nextWrong);

      const nextIndex = t1Index + 1;
      if (nextWrong >= HEARTS) {
        // fail immediately
        setT1Index(T1_TOTAL);
        return;
      }

      if (nextIndex >= T1_TOTAL) {
        setT1Index(T1_TOTAL);
        return;
      }

      setT1Index(nextIndex);
      return;
    }

    // Correct
    setT1Correct((n) => n + 1);

    // +3 XP per correct test item.
    let p2 = applyStudyReward(progress, 3);

    const nextIndex = t1Index + 1;
    if (nextIndex >= T1_TOTAL) {
      const correct = t1Correct + 1;
      const pass = correct >= T1_PASS;
      if (pass) {
        p2 = applyStudyReward(p2, 12);
        p2 = markStationDone(p2, 'T1_NOTES');
        p2 = applySectionExamPass(p2, 'T1_NOTES');
      }
      commitProgress(p2);
      setResult(pass ? 'correct' : 'wrong');
      setT1Index(T1_TOTAL);
      return;
    }

    commitProgress(p2);
    setT1Index(nextIndex);
  }

  function resetT1() {
    setT1Index(0);
    setT1Correct(0);
    setT1Wrong(0);
    setResult('idle');
    setHighlighted({});
    setSeed((x) => x + 1);
  }

  async function chooseE1(choice: string) {
    if (e1Index >= E1_TOTAL) return;
    if (e1Wrong >= HEARTS) return;

    const ok = e1Q.acceptedAnswers.includes(choice);
    setResult(ok ? 'correct' : 'wrong');
    setHighlighted({ [e1Q.midi]: ok ? 'correct' : 'wrong' });

    if (!ok) {
      trackMistake({ kind: 'noteName', sourceStationId: id, midi: e1Q.midi });

      const nextWrong = e1Wrong + 1;
      setE1Wrong(nextWrong);

      const nextIndex = e1Index + 1;
      if (nextWrong >= HEARTS) {
        setE1Index(E1_TOTAL);
        return;
      }
      if (nextIndex >= E1_TOTAL) {
        setE1Index(E1_TOTAL);
        return;
      }
      setE1Index(nextIndex);
      return;
    }

    setE1Correct((n) => n + 1);

    let p2 = applyStudyReward(progress, 3);

    const nextIndex = e1Index + 1;
    if (nextIndex >= E1_TOTAL) {
      const correct = e1Correct + 1;
      const pass = correct >= E1_PASS;
      if (pass) {
        p2 = applyStudyReward(p2, 15);
        p2 = markStationDone(p2, 'E1_NOTES');
        p2 = applySectionExamPass(p2, 'E1_NOTES');
      }
      commitProgress(p2);
      setResult(pass ? 'correct' : 'wrong');
      setE1Index(E1_TOTAL);
      return;
    }

    commitProgress(p2);
    setE1Index(nextIndex);
  }

  function resetE1() {
    setE1Index(0);
    setE1Correct(0);
    setE1Wrong(0);
    setResult('idle');
    setHighlighted({});
    setSeed((x) => x + 1);
  }

  async function playPromptT2() {
    setResult('idle');
    setHighlighted({ [t2Q.tonicMidi]: 'active' });
    await piano.playMidi(t2Q.tonicMidi, { durationSec: dur(0.65), velocity: 0.9 });
    await new Promise((r) => setTimeout(r, gap(300)));
    setHighlighted({ [t2Q.targetMidi]: 'active' });
    await piano.playMidi(t2Q.targetMidi, { durationSec: dur(0.85), velocity: 0.9 });
    setHighlighted({});
  }

  async function playPromptT3B() {
    correctionReplayTokenRef.current += 1;
    setCorrectionReplayBusy(false);
    setResult('idle');
    setHighlighted({});
    await playIntervalPrompt(t3bQ.rootMidi, t3bQ.targetMidi, {
      mode: intervalPromptMode,
      harmonicAlsoMelodic: harmonicHelperEnabled(false),
      gapMs: gap(320),
      rootDurationSec: dur(0.7),
      targetDurationSec: dur(0.95),
    });
  }

  async function chooseT3B(choice: IntervalLabel) {
    if (t3bIndex >= T3B_TOTAL) return;

    const ok = choice === t3bQ.correct;
    setResult(ok ? 'correct' : 'wrong');

    if (!ok) {
      trackMistake({ kind: 'intervalLabel', sourceStationId: id, rootMidi: t3bQ.rootMidi, semitones: t3bQ.semitones });
      recordIntervalMiss(id, t3bQ.semitones);

      // Immediate correction loop: replay the correct interval once after a miss.
      // (Keeps the flow, but still teaches the ear what “right” sounds like.)
      setCorrectionReplayBusy(true);
      try {
        await queueCorrectionReplay(t3bQ.rootMidi, t3bQ.targetMidi);
      } finally {
        setCorrectionReplayBusy(false);
      }

      if (settings.intervalRetryOnce && !t3bRetryUsed) {
        // GuitarOrb-ish loop: after you hear the correction, try the *same* question once.
        // Keep the previously-wrong choice marked, so the learner doesn't fat-finger it again.
        setT3bLastWrongChoice(choice);
        setT3bRetryUsed(true);
        setResult('idle');
        return;
      }

      setT3bWrong((n) => n + 1);

      const nextIndex = t3bIndex + 1;
      if (nextIndex >= T3B_TOTAL) {
        setT3bIndex(T3B_TOTAL);
        return;
      }
      setT3bIndex(nextIndex);
      return;
    }

    setT3bLastWrongChoice(null);
    setT3bCorrect((n) => n + 1);

    if (practice) recordIntervalPracticeHit(id, t3bQ.semitones);

    let p2 = applyStudyReward(progress, 3);

    const nextIndex = t3bIndex + 1;
    if (nextIndex >= T3B_TOTAL) {
      const correct = t3bCorrect + 1;
      const pass = correct >= T3B_PASS;
      if (pass) {
        p2 = applyStudyReward(p2, 10);
        p2 = markStationDone(p2, 'T3B_INTERVALS');
      }
      commitProgress(p2);
      setResult(pass ? 'correct' : 'wrong');
      setT3bIndex(T3B_TOTAL);
      return;
    }

    commitProgress(p2);
    setT3bIndex(nextIndex);
  }

  function resetT3B() {
    setT3bIndex(0);
    setT3bCorrect(0);
    setT3bWrong(0);
    setT3bRetryUsed(false);
    setResult('idle');
    setHighlighted({});
    setSeed((x) => x + 1);
  }

  async function playPromptT3() {
    correctionReplayTokenRef.current += 1;
    setCorrectionReplayBusy(false);
    setResult('idle');
    setHighlighted({});
    await playIntervalPrompt(t3Q.rootMidi, t3Q.targetMidi, {
      mode: intervalPromptMode,
      harmonicAlsoMelodic: harmonicHelperEnabled(false),
      gapMs: gap(320),
      rootDurationSec: dur(0.7),
      targetDurationSec: dur(0.95),
    });
  }

  async function chooseT3(choice: IntervalLabel) {
    if (t3Index >= T3_TOTAL) return;
    if (t3Wrong >= HEARTS) return;

    const ok = choice === t3Q.correct;
    setResult(ok ? 'correct' : 'wrong');

    if (!ok) {
      trackMistake({ kind: 'intervalLabel', sourceStationId: id, rootMidi: t3Q.rootMidi, semitones: t3Q.semitones });
      recordIntervalMiss(id, t3Q.semitones);

      // Immediate correction loop: replay the correct interval once after a miss.
      setCorrectionReplayBusy(true);
      try {
        await queueCorrectionReplay(t3Q.rootMidi, t3Q.targetMidi);
      } finally {
        setCorrectionReplayBusy(false);
      }

      if (settings.intervalRetryOnce && !t3RetryUsed) {
        setT3LastWrongChoice(choice);
        setT3RetryUsed(true);
        setResult('idle');
        return;
      }

      const nextWrong = t3Wrong + 1;
      setT3Wrong(nextWrong);

      const nextIndex = t3Index + 1;
      if (nextWrong >= HEARTS) {
        setT3Index(T3_TOTAL);
        return;
      }

      if (nextIndex >= T3_TOTAL) {
        setT3Index(T3_TOTAL);
        return;
      }

      setT3Index(nextIndex);
      return;
    }

    setT3LastWrongChoice(null);
    setT3Correct((n) => n + 1);

    if (practice) recordIntervalPracticeHit(id, t3Q.semitones);

    // +3 XP per correct test item.
    let p2 = applyStudyReward(progress, 3);

    const nextIndex = t3Index + 1;
    if (nextIndex >= T3_TOTAL) {
      const correct = t3Correct + 1;
      const pass = correct >= T3_PASS;
      if (pass) {
        p2 = applyStudyReward(p2, 12);
        p2 = markStationDone(p2, 'T3_INTERVALS');
        p2 = applySectionExamPass(p2, 'T3_INTERVALS');
      }
      commitProgress(p2);
      setResult(pass ? 'correct' : 'wrong');
      setT3Index(T3_TOTAL);
      return;
    }

    commitProgress(p2);
    setT3Index(nextIndex);
  }

  function resetT3() {
    setT3Index(0);
    setT3Correct(0);
    setT3Wrong(0);
    setT3RetryUsed(false);
    setResult('idle');
    setHighlighted({});
    setSeed((x) => x + 1);
  }

  async function playPromptE3() {
    correctionReplayTokenRef.current += 1;
    setCorrectionReplayBusy(false);
    setResult('idle');
    setHighlighted({});
    await playIntervalPrompt(e3Q.rootMidi, e3Q.targetMidi, {
      mode: intervalPromptMode,
      harmonicAlsoMelodic: harmonicHelperEnabled(false),
      gapMs: gap(320),
      rootDurationSec: dur(0.7),
      targetDurationSec: dur(0.95),
    });
  }

  async function chooseE3(choice: IntervalLabel) {
    if (e3Index >= E3_TOTAL) return;
    if (e3Wrong >= HEARTS) return;

    const ok = choice === e3Q.correct;
    setResult(ok ? 'correct' : 'wrong');

    if (!ok) {
      trackMistake({ kind: 'intervalLabel', sourceStationId: id, rootMidi: e3Q.rootMidi, semitones: e3Q.semitones });
      recordIntervalMiss(id, e3Q.semitones);

      // Immediate correction loop: replay the correct interval once after a miss.
      setCorrectionReplayBusy(true);
      try {
        await queueCorrectionReplay(e3Q.rootMidi, e3Q.targetMidi);
      } finally {
        setCorrectionReplayBusy(false);
      }

      if (settings.intervalRetryOnce && !e3RetryUsed) {
        setE3LastWrongChoice(choice);
        setE3RetryUsed(true);
        setResult('idle');
        return;
      }

      const nextWrong = e3Wrong + 1;
      setE3Wrong(nextWrong);

      const nextIndex = e3Index + 1;
      if (nextWrong >= HEARTS) {
        setE3Index(E3_TOTAL);
        return;
      }
      if (nextIndex >= E3_TOTAL) {
        setE3Index(E3_TOTAL);
        return;
      }
      setE3Index(nextIndex);
      return;
    }

    setE3LastWrongChoice(null);
    setE3Correct((n) => n + 1);

    if (practice) recordIntervalPracticeHit(id, e3Q.semitones);

    let p2 = applyStudyReward(progress, 3);

    const nextIndex = e3Index + 1;
    if (nextIndex >= E3_TOTAL) {
      const correct = e3Correct + 1;
      const pass = correct >= E3_PASS;
      if (pass) {
        p2 = applyStudyReward(p2, 15);
        p2 = markStationDone(p2, 'E3_INTERVALS');
        p2 = applySectionExamPass(p2, 'E3_INTERVALS');
      }
      commitProgress(p2);
      setResult(pass ? 'correct' : 'wrong');
      setE3Index(E3_TOTAL);
      return;
    }

    commitProgress(p2);
    setE3Index(nextIndex);
  }

  function resetE3() {
    setE3Index(0);
    setE3Correct(0);
    setE3Wrong(0);
    setE3RetryUsed(false);
    setResult('idle');
    setHighlighted({});
    setSeed((x) => x + 1);
  }

  async function playPromptT5() {
    setResult('idle');
    setHighlighted({});
    await playRootThenChordPrompt(t5Q.chordMidis, {
      mode: chordMode,
      rootDurationSec: dur(0.65),
      chordDurationSec: dur(1.1),
      gapBeforeChordMs: gap(240),
      gapMs: gap(130),
    });
  }

  async function playPromptT6() {
    setResult('idle');
    setHighlighted({});
    await playRootThenChordPrompt(t6Q.chordMidis, {
      mode: chordMode,
      rootDurationSec: dur(0.65),
      chordDurationSec: dur(1.1),
      gapBeforeChordMs: gap(240),
      gapMs: gap(130),
    });
  }

  async function playPromptT7() {
    setResult('idle');
    setHighlighted({});
    await playRootThenChordPrompt(t7Q.chordMidis, {
      mode: chordMode,
      rootDurationSec: dur(0.65),
      chordDurationSec: dur(1.1),
      gapBeforeChordMs: gap(240),
      gapMs: gap(130),
    });
  }

  async function playPromptT8() {
    setResult('idle');
    setHighlighted({});
    await playTonicTargetPrompt(t8Q.tonicMidi, t8Q.targetMidi, {
      gapMs: gap(260),
      tonicDurationSec: dur(0.7),
      targetDurationSec: dur(0.9),
      velocity: 0.9,
    });
  }

  async function chooseT5(choice: 'major' | 'minor' | 'diminished') {
    if (t5Index >= T5_TOTAL) return;
    if (t5Wrong >= HEARTS) return;

    const ok = choice === t5Q.quality;
    setResult(ok ? 'correct' : 'wrong');

    if (!ok) {
      trackMistake({ kind: 'triadQuality', sourceStationId: id, rootMidi: t5Q.rootMidi, quality: t5Q.quality });

      const nextWrong = t5Wrong + 1;
      setT5Wrong(nextWrong);

      const nextIndex = t5Index + 1;
      if (nextWrong >= HEARTS) {
        setT5Index(T5_TOTAL);
        return;
      }

      if (nextIndex >= T5_TOTAL) {
        setT5Index(T5_TOTAL);
        return;
      }

      setT5Index(nextIndex);
      return;
    }

    setT5Correct((n) => n + 1);

    // +3 XP per correct test item.
    let p2 = applyStudyReward(progress, 3);

    const nextIndex = t5Index + 1;
    if (nextIndex >= T5_TOTAL) {
      const correct = t5Correct + 1;
      const pass = correct >= T5_PASS;
      if (pass) {
        p2 = applyStudyReward(p2, 12);
        p2 = markStationDone(p2, 'T5_TRIADS');
        p2 = applySectionExamPass(p2, 'T5_TRIADS');
      }
      commitProgress(p2);
      setResult(pass ? 'correct' : 'wrong');
      setT5Index(T5_TOTAL);
      return;
    }

    commitProgress(p2);
    setT5Index(nextIndex);
  }

  function resetT5() {
    setT5Index(0);
    setT5Correct(0);
    setT5Wrong(0);
    setResult('idle');
    setHighlighted({});
    setSeed((x) => x + 1);
  }

  async function chooseT6(choice: 'major' | 'minor' | 'diminished') {
    if (t6Index >= T6_TOTAL) return;
    if (t6Wrong >= HEARTS) return;

    const ok = choice === t6Q.quality;
    setResult(ok ? 'correct' : 'wrong');

    if (!ok) {
      // Reuse triadQuality mistake type so Review can replay the chord.
      trackMistake({ kind: 'triadQuality', sourceStationId: id, rootMidi: t6Q.chordMidis[0], quality: t6Q.quality });

      const nextWrong = t6Wrong + 1;
      setT6Wrong(nextWrong);

      const nextIndex = t6Index + 1;
      if (nextWrong >= HEARTS) {
        setT6Index(T6_TOTAL);
        return;
      }

      if (nextIndex >= T6_TOTAL) {
        setT6Index(T6_TOTAL);
        return;
      }

      setT6Index(nextIndex);
      return;
    }

    setT6Correct((n) => n + 1);

    let p2 = applyStudyReward(progress, 3);

    const nextIndex = t6Index + 1;
    if (nextIndex >= T6_TOTAL) {
      const correct = t6Correct + 1;
      const pass = correct >= T6_PASS;
      if (pass) {
        p2 = applyStudyReward(p2, 12);
        p2 = markStationDone(p2, 'T6_DIATONIC_TRIADS');
        p2 = applySectionExamPass(p2, 'T6_DIATONIC_TRIADS');
      }
      commitProgress(p2);
      setResult(pass ? 'correct' : 'wrong');
      setT6Index(T6_TOTAL);
      return;
    }

    commitProgress(p2);
    setT6Index(nextIndex);
  }

  function resetT6() {
    setT6Index(0);
    setT6Correct(0);
    setT6Wrong(0);
    setResult('idle');
    setHighlighted({});
    setSeed((x) => x + 1);
  }

  async function chooseT7(choice: FunctionFamily) {
    if (t7Index >= T7_TOTAL) return;
    if (t7Wrong >= HEARTS) return;

    const ok = choice === t7Q.family;
    setResult(ok ? 'correct' : 'wrong');

    if (!ok) {
      trackMistake({
        kind: 'functionFamily',
        sourceStationId: id,
        key: t7Q.key,
        degree: t7Q.degree,
        tonicMidi: t7Q.tonicMidi,
      });

      const nextWrong = t7Wrong + 1;
      setT7Wrong(nextWrong);

      const nextIndex = t7Index + 1;
      if (nextWrong >= HEARTS) {
        setT7Index(T7_TOTAL);
        return;
      }

      if (nextIndex >= T7_TOTAL) {
        setT7Index(T7_TOTAL);
        return;
      }

      setT7Index(nextIndex);
      return;
    }

    setT7Correct((n) => n + 1);

    let p2 = applyStudyReward(progress, 3);

    const nextIndex = t7Index + 1;
    if (nextIndex >= T7_TOTAL) {
      const correct = t7Correct + 1;
      const pass = correct >= T7_PASS;
      if (pass) {
        p2 = applyStudyReward(p2, 12);
        p2 = markStationDone(p2, 'T7_FUNCTIONS');
        p2 = applySectionExamPass(p2, 'T7_FUNCTIONS');
      }
      commitProgress(p2);
      setResult(pass ? 'correct' : 'wrong');
      setT7Index(T7_TOTAL);
      return;
    }

    commitProgress(p2);
    setT7Index(nextIndex);
  }

  function resetT7() {
    setT7Index(0);
    setT7Correct(0);
    setT7Wrong(0);
    setResult('idle');
    setHighlighted({});
    setSeed((x) => x + 1);
  }

  async function chooseT8(choice: IntervalLabel) {
    if (t8Index >= T8_TOTAL) return;
    if (t8Wrong >= HEARTS) return;

    const ok = choice === t8Q.correct;
    setResult(ok ? 'correct' : 'wrong');

    if (!ok) {
      // Feed review: tonic→degree is just an interval-label item.
      trackMistake({ kind: 'intervalLabel', sourceStationId: id, rootMidi: t8Q.tonicMidi, semitones: t8Q.semitones });

      const nextWrong = t8Wrong + 1;
      setT8Wrong(nextWrong);

      const nextIndex = t8Index + 1;
      if (nextWrong >= HEARTS) {
        setT8Index(T8_TOTAL);
        return;
      }

      if (nextIndex >= T8_TOTAL) {
        setT8Index(T8_TOTAL);
        return;
      }

      setT8Index(nextIndex);
      return;
    }

    setT8Correct((n) => n + 1);

    let p2 = applyStudyReward(progress, 3);

    const nextIndex = t8Index + 1;
    if (nextIndex >= T8_TOTAL) {
      const correct = t8Correct + 1;
      const pass = correct >= T8_PASS;
      if (pass) {
        p2 = applyStudyReward(p2, 12);
        p2 = markStationDone(p2, 'T8_DEGREE_INTERVALS');
        p2 = applySectionExamPass(p2, 'T8_DEGREE_INTERVALS');
      }
      commitProgress(p2);
      setResult(pass ? 'correct' : 'wrong');
      setT8Index(T8_TOTAL);
      return;
    }

    commitProgress(p2);
    setT8Index(nextIndex);
  }

  function resetT8() {
    setT8Index(0);
    setT8Correct(0);
    setT8Wrong(0);
    setResult('idle');
    setHighlighted({});
    setSeed((x) => x + 1);
  }

  async function chooseT2(choice: string) {
    if (t2Index >= T2_TOTAL) return;
    if (t2Wrong >= HEARTS) return;

    const ok = choice === t2Q.correct;
    setResult(ok ? 'correct' : 'wrong');

    if (!ok) {
      setHighlighted({ [t2Q.targetMidi]: 'correct' });
      // Feed the review queue: “degree → correct spelling” is a perfect spaced-review item.
      trackMistake({
        kind: 'majorScaleDegree',
        sourceStationId: id,
        key: t2Q.key,
        degree: t2Q.degree as 2 | 3 | 4 | 5 | 6 | 7,
      });

      const nextWrong = t2Wrong + 1;
      setT2Wrong(nextWrong);

      const nextIndex = t2Index + 1;
      if (nextWrong >= HEARTS) {
        setT2Index(T2_TOTAL);
        return;
      }

      if (nextIndex >= T2_TOTAL) {
        setT2Index(T2_TOTAL);
        return;
      }

      setHighlighted({});
      setT2Index(nextIndex);
      return;
    }

    setT2Correct((n) => n + 1);

    // +3 XP per correct test item.
    let p2 = applyStudyReward(progress, 3);

    const nextIndex = t2Index + 1;
    if (nextIndex >= T2_TOTAL) {
      const correct = t2Correct + 1;
      const pass = correct >= T2_PASS;
      if (pass) {
        p2 = applyStudyReward(p2, 12);
        p2 = markStationDone(p2, 'T2_MAJOR_SCALE');
        p2 = applySectionExamPass(p2, 'T2_MAJOR_SCALE');
      }
      commitProgress(p2);
      setResult(pass ? 'correct' : 'wrong');
      setT2Index(T2_TOTAL);
      return;
    }

    commitProgress(p2);
    setHighlighted({});
    setT2Index(nextIndex);
  }

  function resetT2() {
    setT2Index(0);
    setT2Correct(0);
    setT2Wrong(0);
    setResult('idle');
    setHighlighted({});
    setSeed((x) => x + 1);
  }

  async function chooseS4(choice: 'major' | 'minor' | 'diminished') {
    const ok = choice === triadQ.quality;
    setResult(ok ? 'correct' : 'wrong');

    const correctHi: Record<number, 'correct'> = Object.fromEntries(triadQ.chordMidis.map((m) => [m, 'correct'])) as Record<
      number,
      'correct'
    >;

    if (!ok) {
      setCombo(0);
      trackMistake({ kind: 'triadQuality', sourceStationId: id, rootMidi: triadQ.rootMidi, quality: triadQ.quality });
      setHighlighted({
        ...correctHi,
        ...(triadQ.chordMidis.includes(triadQ.rootMidi) ? {} : { [triadQ.rootMidi]: 'correct' }),
      });
      return;
    }

    setS4Correct((n) => n + 1);
    setHighlighted(correctHi);
    rewardAndMaybeComplete(4);
  }

  async function chooseS5(choice: 'major' | 'minor' | 'diminished') {
    const ok = choice === diatonicQ.quality;
    setResult(ok ? 'correct' : 'wrong');

    const correctHi: Record<number, 'correct'> = Object.fromEntries(diatonicQ.chordMidis.map((m) => [m, 'correct'])) as Record<
      number,
      'correct'
    >;

    if (!ok) {
      setCombo(0);
      // Feed spaced review: diatonic triad quality is reviewable as a triad-quality item.
      trackMistake({ kind: 'triadQuality', sourceStationId: id, rootMidi: diatonicQ.chordMidis[0], quality: diatonicQ.quality });
      setHighlighted(correctHi);
      return;
    }

    setS5Correct((n) => n + 1);
    setHighlighted(correctHi);
    rewardAndMaybeComplete(5);
  }

  function familyLabel(f: FunctionFamily) {
    if (f === 'tonic') return 'Tonic (rest)';
    if (f === 'subdominant') return 'Subdominant (move)';
    return 'Dominant (tension)';
  }

  async function chooseS6(choice: FunctionFamily) {
    const ok = choice === funcQ.family;
    setResult(ok ? 'correct' : 'wrong');

    const correctHi: Record<number, 'correct'> = Object.fromEntries(funcQ.chordMidis.map((m) => [m, 'correct'])) as Record<
      number,
      'correct'
    >;

    if (!ok) {
      setCombo(0);
      trackMistake({ kind: 'functionFamily', sourceStationId: id, key: funcQ.key, degree: funcQ.degree, tonicMidi: funcQ.tonicMidi });
      setHighlighted(correctHi);
      return;
    }

    setS6Correct((n) => n + 1);
    setHighlighted(correctHi);
    rewardAndMaybeComplete(5);
  }

  function newKeyS2() {
    setS2Step(1);
    setSeed((x) => x + 1);
    setHighlighted({});
    setResult('idle');
  }

  // Duolingo-style hotkeys: Space/Enter = Play/Hear, Backspace = Next/Restart, 1..9 = answer.
  useHotkeys({
    enabled: true,
    onPrimary: () => {
      if (id === 'S1_NOTES') {
        if (s1TestComplete) void playPromptS1Twist();
        else void playPromptS1();
      }
      else if (id === 'S1B_STAFF') {
        if (s1bTestComplete) void playPromptS1BTwist();
        else void playPromptS1B();
      }
      else if (id === 'S1C_ACCIDENTALS') {
        if (s1cTestComplete) void playPromptS1CTwist();
        else void playPromptS1C();
      }
      else if (id === 'T1B_NOTES') void playPromptT1B();
      else if (id === 'T1_NOTES') void playPromptT1();
      else if (id === 'E1_NOTES') void playPromptE1();
      else if (id === 'S2_MAJOR_SCALE') { 
        if (s2PatternDone) void playPromptS2();
      } else if (id === 'T2_MAJOR_SCALE') void playPromptT2();
      else if (id === 'S3_INTERVALS') void playPromptS3();
      else if (id === 'T3B_INTERVALS') void playPromptT3B();
      else if (id === 'T3_INTERVALS') void playPromptT3();
      else if (id === 'E3_INTERVALS') void playPromptE3();
      else if (id === 'S4_TRIADS') void playPromptS4();
      else if (id === 'T5_TRIADS') void playPromptT5();
      else if (id === 'S5_DIATONIC_TRIADS') void playPromptS5();
      else if (id === 'T6_DIATONIC_TRIADS') void playPromptT6();
      else if (id === 'S6_FUNCTIONS') void playPromptS6();
      else if (id === 'T7_FUNCTIONS') void playPromptT7();
      else if (id === 'S7_DEGREES') void playPromptS7();
      else if (id === 'T4_DEGREES') void playPromptT4();
      else if (id === 'S8_DEGREE_INTERVALS') void playPromptS8();
      else if (id === 'T8_DEGREE_INTERVALS') void playPromptT8();
    },
    onSecondary: () => {
      if (id === 'S1_NOTES') {
        if (s1TestComplete) resetS1Twist();
        else next();
      }
      else if (id === 'S1B_STAFF') {
        if (s1bTestComplete) resetS1BTwist();
        else setSeed((x) => x + 1);
      }
      else if (id === 'S1C_ACCIDENTALS') {
        if (s1cTestComplete) resetS1CTwist();
        else setSeed((x) => x + 1);
      }
      else if (id === 'T1B_NOTES') resetT1B();
      else if (id === 'T1_NOTES') resetT1();
      else if (id === 'E1_NOTES') resetE1();
      else if (id === 'S2_MAJOR_SCALE') newKeyS2();
      else if (id === 'T2_MAJOR_SCALE') resetT2();
      else if (id === 'S3_INTERVALS') next();
      else if (id === 'T3B_INTERVALS') resetT3B();
      else if (id === 'T3_INTERVALS') resetT3();
      else if (id === 'E3_INTERVALS') resetE3();
      else if (id === 'S4_TRIADS') next();
      else if (id === 'T5_TRIADS') resetT5();
      else if (id === 'S5_DIATONIC_TRIADS') next();
      else if (id === 'T6_DIATONIC_TRIADS') resetT6();
      else if (id === 'S6_FUNCTIONS') next();
      else if (id === 'T7_FUNCTIONS') resetT7();
      else if (id === 'S7_DEGREES') next();
      else if (id === 'T4_DEGREES') resetT4();
      else if (id === 'S8_DEGREE_INTERVALS') next();
      else if (id === 'T8_DEGREE_INTERVALS') resetT8();
    },
    keyMap: showHarmonicTips
      ? {
          h: () => setHarmonicTipsOpen(true),
        }
      : undefined,
    onChoiceIndex: (idx) => {
      if (id === 'S1_NOTES') {
        if (s1TestComplete) {
          const c = s1TwistQ.choices[idx];
          if (c) void chooseS1Twist(c);
          return;
        }
        const c = noteQ.choices[idx];
        if (c) void chooseS1(c);
        return;
      }
      if (id === 'S1B_STAFF') {
        if (s1bTestComplete) {
          const c = s1bTwistQ.choices[idx];
          if (c) void chooseS1BTwist(c);
          return;
        }
        const c = s1bQ.choices[idx];
        if (c) chooseS1B(c);
        return;
      }
      if (id === 'S1C_ACCIDENTALS') {
        if (s1cTestComplete) {
          const c = s1cTwistQ.choices[idx];
          if (c) void chooseS1CTwist(c);
          return;
        }
        const c = s1cQ.choices[idx];
        if (c) chooseS1C(c);
        return;
      }
      if (id === 'T1B_NOTES') {
        const c = t1bQ.choices[idx];
        if (c) void chooseT1B(c);
        return;
      }
      if (id === 'T1_NOTES') {
        const c = t1Q.choices[idx];
        if (c) void chooseT1(c);
        return;
      }
      if (id === 'E1_NOTES') {
        const c = e1Q.choices[idx];
        if (c) void chooseE1(c);
        return;
      }
      if (id === 'S2_MAJOR_SCALE') {
        if (!s2PatternDone) {
          const c = s2PatternQ.choices[idx];
          if (c) chooseS2Pattern(c);
          return;
        }
        const c = s2Q.choices[idx];
        if (c) void chooseS2(c);
        return;
      }
      if (id === 'T2_MAJOR_SCALE') {
        const c = t2Q.choices[idx];
        if (c) void chooseT2(c);
        return;
      }
      if (id === 'T3B_INTERVALS') {
        const c = t3bQ.choices[idx];
        if (c) void chooseT3B(c);
        return;
      }
      if (id === 'T3_INTERVALS') {
        const c = t3Q.choices[idx];
        if (c) void chooseT3(c);
        return;
      }
      if (id === 'E3_INTERVALS') {
        const c = e3Q.choices[idx];
        if (c) void chooseE3(c);
        return;
      }
      if (id === 'S4_TRIADS') {
        const c = triadQ.choices[idx];
        if (c) void chooseS4(c);
        return;
      }
      if (id === 'T5_TRIADS') {
        const c = t5Q.choices[idx];
        if (c) void chooseT5(c);
        return;
      }
      if (id === 'S5_DIATONIC_TRIADS') {
        const c = diatonicQ.choices[idx];
        if (c) void chooseS5(c);
        return;
      }
      if (id === 'T6_DIATONIC_TRIADS') {
        const c = t6Q.choices[idx];
        if (c) void chooseT6(c);
        return;
      }
      if (id === 'S6_FUNCTIONS') {
        const c = funcQ.choices[idx];
        if (c) void chooseS6(c);
        return;
      }
      if (id === 'T7_FUNCTIONS') {
        const c = t7Q.choices[idx];
        if (c) void chooseT7(c);
        return;
      }
      if (id === 'S7_DEGREES') {
        const c = degreeQ.choices[idx];
        if (c) void chooseS7(c);
        return;
      }
      if (id === 'T4_DEGREES') {
        const c = t4Q.choices[idx];
        if (c) void chooseT4(c);
        return;
      }
      if (id === 'S8_DEGREE_INTERVALS') {
        const c = degreeIntervalQ.choices[idx];
        if (c) void chooseS8(c);
        return;
      }
      if (id === 'T8_DEGREE_INTERVALS') {
        const c = t8Q.choices[idx];
        if (c) void chooseT8(c);
      }
    },
  });

  useEffect(() => {
    // Focus top bar (Duolingo-ish): progress + hearts where applicable.
    const title = station ? station.title : '';
    const short = (title.split('—')[0] ?? title).trim();

    let progress01: number | undefined = undefined;
    let hearts: { current: number; max: number } | undefined = undefined;

    switch (id) {
      case 'T1_NOTES':
        progress01 = T1_TOTAL ? t1Index / T1_TOTAL : undefined;
        hearts = { current: Math.max(0, HEARTS - t1Wrong), max: HEARTS };
        break;
      case 'E1_NOTES':
        progress01 = E1_TOTAL ? e1Index / E1_TOTAL : undefined;
        hearts = { current: Math.max(0, HEARTS - e1Wrong), max: HEARTS };
        break;
      case 'T3_INTERVALS':
        progress01 = T3_TOTAL ? t3Index / T3_TOTAL : undefined;
        hearts = { current: Math.max(0, HEARTS - t3Wrong), max: HEARTS };
        break;
      case 'E3_INTERVALS':
        progress01 = E3_TOTAL ? e3Index / E3_TOTAL : undefined;
        hearts = { current: Math.max(0, HEARTS - e3Wrong), max: HEARTS };
        break;
      case 'T5_TRIADS':
        progress01 = T5_TOTAL ? t5Index / T5_TOTAL : undefined;
        hearts = { current: Math.max(0, HEARTS - t5Wrong), max: HEARTS };
        break;
      case 'T6_DIATONIC_TRIADS':
        progress01 = T6_TOTAL ? t6Index / T6_TOTAL : undefined;
        hearts = { current: Math.max(0, HEARTS - t6Wrong), max: HEARTS };
        break;
      case 'T7_FUNCTIONS':
        progress01 = T7_TOTAL ? t7Index / T7_TOTAL : undefined;
        hearts = { current: Math.max(0, HEARTS - t7Wrong), max: HEARTS };
        break;
      case 'T4_DEGREES':
        progress01 = T4_TOTAL ? t4Index / T4_TOTAL : undefined;
        hearts = { current: Math.max(0, HEARTS - t4Wrong), max: HEARTS };
        break;
      case 'T8_DEGREE_INTERVALS':
        progress01 = T8_TOTAL ? t8Index / T8_TOTAL : undefined;
        hearts = { current: Math.max(0, HEARTS - t8Wrong), max: HEARTS };
        break;
      case 'T2_MAJOR_SCALE':
        progress01 = T2_TOTAL ? t2Index / T2_TOTAL : undefined;
        break;
      case 'T1B_NOTES':
        progress01 = T1B_TOTAL ? t1bIndex / T1B_TOTAL : undefined;
        break;
      case 'T3B_INTERVALS':
        progress01 = T3B_TOTAL ? t3bIndex / T3B_TOTAL : undefined;
        break;
      default:
        // Lessons: we keep a subtle progress bar, but don’t try to over-fit every internal phase.
        progress01 = done ? 1 : undefined;
        break;
    }

    const showChordBadge =
      id === 'S4_TRIADS' ||
      id === 'T5_TRIADS' ||
      id === 'S5_DIATONIC_TRIADS' ||
      id === 'T6_DIATONIC_TRIADS' ||
      id === 'S6_FUNCTIONS' ||
      id === 'T7_FUNCTIONS';

    focus.setTopBar({
      statusText: short || undefined,
      badge: showChordBadge
        ? {
            text: chordMode === 'arp' ? 'Lesson: Arp' : 'Test: Block',
            title: 'Pedagogy: lessons use broken chords (arpeggios) for clarity; tests/exams use block chords.',
          }
        : undefined,
      progress: progress01,
      hearts,
    });

    return () => {
      focus.setTopBar({});
    };
  }, [
    focus,
    id,
    station,
    done,
    t1Index,
    t1Wrong,
    e1Index,
    e1Wrong,
    t3Index,
    t3Wrong,
    e3Index,
    e3Wrong,
    t5Index,
    t5Wrong,
    t6Index,
    t6Wrong,
    t7Index,
    t7Wrong,
    t4Index,
    t4Wrong,
    t8Index,
    t8Wrong,
    t2Index,
    t1bIndex,
    t3bIndex,
  ]);

  if (!station) {
    return (
      <div className="card">
        <h1 className="title">Unknown station</h1>
        <Link className="linkBtn" to="/learn">Back</Link>
      </div>
    );
  }

  return (
    <div className="focusStage">
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            padding: '10px 12px',
            borderRadius: 14,
            border: '3px solid var(--ink)',
            background: 'linear-gradient(90deg, #b6f2d8, #8dd4ff)',
            color: '#111',
            fontWeight: 850,
            boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
          }}
        >
          {toast.text}
        </div>
      ) : null}


      <HintOverlay
        open={harmonicTipsOpen}
        onClose={() => setHarmonicTipsOpen(false)}
        title="Harmonic interval tips"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ opacity: 0.92 }}>
            Harmonic intervals are harder because both notes arrive at once — your brain doesn’t get the “jump”
            cue from melodic motion. Try these trainer moves:
          </div>

          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
            <li>
              <b>Split it:</b> after the chord, sing/hum either the top or bottom note (even badly).
            </li>
            <li>
              <b>Arpeggiate mentally:</b> imagine root → target (or replay with helper on) to recover the melodic shape.
            </li>
            <li>
              <b>Listen for “color” first:</b> consonant vs crunchy, then refine (e.g. 4th vs 5th, 3rd vs 6th).
            </li>
            <li>
              <b>Slow down:</b> two listens is normal. Accuracy beats speed.
            </li>
          </ul>

          <div style={{ fontSize: 12, opacity: 0.78, lineHeight: 1.45 }}>
            Quick reads: 
            <a href="https://www.musical-u.com/learn/how-can-i-improve-at-harmonic-intervals/" target="_blank" rel="noreferrer">Musical U</a>
            {' · '}
            <a href="https://music.stackexchange.com/questions/59145/how-to-hear-lowest-note-in-harmonic-intervals" target="_blank" rel="noreferrer">Music.SE thread</a>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="primary" onClick={() => setHarmonicTipsOpen(false)}>Got it</button>
            <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.75 }}>Knowledge-only</div>
          </div>
        </div>
      </HintOverlay>

      <div className="focusCenter">
      {/* Duolingo-style Focus Mode: no big station header. */}
      <div className="focusMetaRow">
        {stationMistakeCount > 0 ? (
          <Link
            to={`/review?station=${id}`}
            className={stationMistakeDue > 0 ? 'linkBtn primaryLink' : 'linkBtn'}
            style={{ fontSize: 12, padding: '6px 10px' }}
          >
            Review{stationMistakeDue > 0 ? ` (${stationMistakeDue} due)` : ` (${stationMistakeCount})`}
            {mistakesThisVisit > 0 ? ` · +${mistakesThisVisit} new` : ''}
          </Link>
        ) : null}

        {showHarmonicTips ? (
          <button
            className="linkBtn"
            style={{ fontSize: 12, padding: '6px 10px' }}
            onClick={() => setHarmonicTipsOpen(true)}
            title="Trainer tips for hearing harmonic intervals (hotkey: H)"
          >
            Harmonic tips (H)
          </button>
        ) : null}
      </div>

      {done ? (
        <div
          className="result r_correct"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontWeight: 700 }}>Completed.</div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>Nice — keep the chain going.</div>
            {mistakesThisVisit > 0 ? (
              <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6 }}>Captured {mistakesThisVisit} mistake{mistakesThisVisit === 1 ? '' : 's'} this visit — use Review to clear them.</div>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className={practice ? 'secondary' : 'ghost'}
              onClick={() => {
                setPractice((p) => {
                  const next = !p;
                  if (!next) {
                    setPracticeFocusIntervals(null);
                    setPracticeWeightedSemitones(null);
                  }
                  return next;
                });
              }}
            >
              {practice ? 'Hide practice' : 'Practice'}
            </button>
            {stationMistakeCount > 0 ? (
              <Link className={stationMistakeDue > 0 ? 'linkBtn primaryLink' : 'linkBtn'} to={`/review?station=${id}`}>
                Review mistakes{stationMistakeDue > 0 ? ` (${stationMistakeDue} due)` : ` (${stationMistakeCount})`}
              </Link>
            ) : null}
            <Link className="linkBtn" to="/learn">Learn</Link>
            {nextId && nextUnlocked ? <Link className="linkBtn" to={`/lesson/${nextId}`}>Next</Link> : null}
          </div>
        </div>
      ) : null}

      {/* Guidebook is accessible via ⚙️ only (knowledge-only surface). */}

      {!done || practice ? (
        id === 'S1_NOTES' ? (
        <>
          <DuoBottomBar
            left={<button className="btn" onClick={() => navigate(-1)}>Skip</button>}
            right={<span className="btnPrimary" style={{ opacity: 0.55 }}>Check</span>}
          />
          <TTTRunner
            teachComplete={s1TeachDone}
            testComplete={s1TestComplete}
            twistComplete={s1TwistPassed}
            onComplete={() => {
              // No-op: completion is handled by the effect that marks the station done.
            }}
            teach={
              <InfoCardPager
                pages={[
                  {
                    title: 'Notes (white keys)',
                    body:
                      'We’ll start with the white keys only: C D E F G A B.\n\nIn this lesson: stable register, one octave, no tricks. You’re training *recognition*, not speed.',
                    footnote: 'Hotkey: Space/Enter = play · 1–9 = answer · Backspace = next/restart',
                  },
                  {
                    title: 'Anchor: Middle C',
                    body:
                      'Middle C is your anchor. Once you can find C, the rest is just alphabet order.\n\nC → D → E (up), then F G A B.',
                  },
                  {
                    title: 'Accidentals later',
                    body:
                      'If you see black keys later: they can be sharp or flat.\nFor now, just nail the white-key names cleanly.',
                  },
                ]}
                doneLabel="Start test"
                onDone={() => {
                  setS1TeachDone(true);
                  setResult('idle');
                  setHighlighted({});
                }}
              />
            }
            test={
              <>
                <HintOverlay open={s1HintOpen} onClose={() => setS1HintOpen(false)}>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    <li>Find <b>C</b> first. It’s the note just left of the two-black-keys group.</li>
                    <li>From C, the white keys go up alphabetically: C D E F G A B.</li>
                    <li>If you’re unsure, play it again — hearing twice is normal.</li>
                  </ul>
                </HintOverlay>

                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <button className="primary" onClick={playPromptS1}>Play note</button>
                  <button className="ghost" onClick={next}>Next</button>
                  <button className="secondary" onClick={() => setS1HintOpen(true)}>Hint</button>
                  <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
                    Test: {Math.min(s1Correct, S1_GOAL)}/{S1_GOAL}
                  </div>
                </div>

                <div className={`result r_${result}`}>
                  {result === 'idle' && 'Name the note.'}
                  {result === 'correct' && `Correct — +2 XP. (${noteQ.promptLabel})`}
                  {result === 'wrong' && `Not quite — it was ${noteQ.promptLabel}.`}
                </div>

                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <ChoiceGrid choices={noteQ.choices} onChoose={chooseS1} />
                </div>

                <div className="row" style={{ gap: 14, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                  <StaffNote midi={noteQ.midi} spelling={noteQ.displaySpelling} showLegend={false} />
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <PianoKeyboard
                      startMidi={STABLE_REGISTER_MIN_MIDI}
                      octaves={1}
                      onPress={(m) => piano.playMidi(m, { durationSec: dur(0.9), velocity: 0.9 })}
                      highlighted={highlighted}
                    />
                  </div>
                </div>

                {s1TestComplete ? (
                  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
                    Nice — now we do a short <b>Twist</b> (scored, hearts apply).
                  </div>
                ) : null}
              </>
            }
            twist={
              <>
                <HintOverlay open={s1HintOpen} onClose={() => setS1HintOpen(false)}>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    <li>Find <b>C</b> first. It’s the note just left of the two-black-keys group.</li>
                    <li>From C, the white keys go up alphabetically: C D E F G A B.</li>
                    <li>If you’re unsure, play it again — hearing twice is normal.</li>
                  </ul>
                </HintOverlay>

                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <button className="primary" onClick={playPromptS1Twist}>Play note</button>
                  <button className="ghost" onClick={resetS1Twist}>Restart</button>
                  <button className="secondary" onClick={() => setS1HintOpen(true)}>Hint</button>
                  <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
                    Q: {Math.min(s1TwistIndex + 1, S1_TWIST_TOTAL)}/{S1_TWIST_TOTAL} · Correct: {s1TwistCorrect}/{S1_TWIST_TOTAL} (need {S1_TWIST_PASS}) · Lives: {Math.max(0, HEARTS - s1TwistWrong)}/{HEARTS}
                  </div>
                </div>

                <div className={`result r_${result}`}>
                  {result === 'idle' && (s1TwistDone ? (s1TwistPassed ? 'Passed — lesson complete. (+10 bonus XP)' : 'Failed twist — hit Restart to try again.') : 'Twist: 10 questions. Need 8/10 to pass.')}
                  {result === 'correct' && `Correct — +3 XP. (${s1TwistQ.promptLabel})`}
                  {result === 'wrong' && (lessonRetryKey === `${id}:S1_TWIST:${s1TwistIndex}` ? 'Not quite — try once more.' : `Not quite — it was ${s1TwistQ.promptLabel}.`)}
                </div>

                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <ChoiceGrid choices={s1TwistQ.choices} onChoose={chooseS1Twist} />
                </div>

                <div style={{ marginTop: 10 }}>
                  <StaffNote midi={s1TwistQ.midi} spelling={s1TwistQ.displaySpelling} showLegend={false} />
                </div>

                <RegisterPolicyNote mode="both" />
              </>
            }
          />
        </>
      ) : id === 'S1B_STAFF' ? (
        <>
          <TTTRunner
            teachComplete={s1bTeachDone}
            testComplete={s1bTestComplete}
            twistComplete={s1bTwistPassed}
            onComplete={() => {
              // No-op: completion is handled by the effect that marks the station done.
            }}
            teach={
              <InfoCardPager
                pages={[
                  {
                    title: 'Notes on the staff',
                    body:
                      'Now we connect note names to staff positions.\n\nMiddle C is the anchor. From there, move by steps: C D E F G A B.',
                    footnote: 'Try to read first, then press Play to confirm.',
                  },
                  {
                    title: 'Two quick anchors',
                    body:
                      "Treble clef: the swirl wraps around G (2nd line).\nBass clef: the dots surround F (4th line).\n\nBut for this station, we stay near Middle C so it doesn't get confusing.",
                  },
                  {
                    title: 'Stable register',
                    body: "Same stable register (1 octave). We're training mapping + recognition — not range.",
                  },
                ]}
                doneLabel="Start test"
                onDone={() => {
                  setS1bTeachDone(true);
                  setResult('idle');
                  setHighlighted({});
                }}
              />
            }
            test={
              <>
                <HintOverlay open={s1bHintOpen} onClose={() => setS1bHintOpen(false)} title="Staff hint">
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    <li>
                      <b>Middle C</b> is your anchor. Step up/down by letters.
                    </li>
                    <li>If you see a note on a line, the next space up is the next letter.</li>
                    <li>Press Play to confirm — but try reading first.</li>
                  </ul>
                </HintOverlay>

                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <button className="primary" onClick={playPromptS1B}>
                    Play note
                  </button>
                  <button className="ghost" onClick={() => setSeed((x) => x + 1)}>
                    Next
                  </button>
                  <button className="secondary" onClick={() => setS1bHintOpen(true)}>
                    Hint
                  </button>
                  <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
                    Test: {Math.min(s1bCorrect, S1B_GOAL)}/{S1B_GOAL}
                  </div>
                </div>

                <div className={`result r_${result}`}>
                  {result === 'idle' && 'Name the note (read the staff).'}
                  {result === 'correct' && `Correct — +2 XP. (${s1bQ.promptLabel})`}
                  {result === 'wrong' && `Not quite — it was ${s1bQ.promptLabel}.`}
                </div>

                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <ChoiceGrid choices={s1bQ.choices} onChoose={chooseS1B} />
                </div>

                <div className="row" style={{ gap: 14, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                  <StaffNote midi={s1bQ.midi} spelling={s1bQ.displaySpelling} showLegend={false} />
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <PianoKeyboard
                      startMidi={STABLE_REGISTER_MIN_MIDI}
                      octaves={1}
                      onPress={(m) => piano.playMidi(m, { durationSec: dur(0.9), velocity: 0.9 })}
                      highlighted={highlighted}
                    />
                  </div>
                </div>

                {s1bTestComplete ? (
                  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
                    Nice — now a short <b>Twist</b> (scored, hearts apply).
                  </div>
                ) : null}
              </>
            }
            twist={
              <>
                <HintOverlay open={s1bHintOpen} onClose={() => setS1bHintOpen(false)} title="Staff hint">
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    <li>
                      <b>Middle C</b> is your anchor. Step up/down by letters.
                    </li>
                    <li>Line → space → line is always the next letter.</li>
                    <li>Press Play to confirm if needed.</li>
                  </ul>
                </HintOverlay>

                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <button className="primary" onClick={playPromptS1BTwist}>
                    Play note
                  </button>
                  <button className="ghost" onClick={resetS1BTwist}>
                    Restart
                  </button>
                  <button className="secondary" onClick={() => setS1bHintOpen(true)}>
                    Hint
                  </button>
                  <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
                    Q: {Math.min(s1bTwistIndex + 1, S1B_TWIST_TOTAL)}/{S1B_TWIST_TOTAL} · Correct: {s1bTwistCorrect}/{S1B_TWIST_TOTAL} (need {S1B_TWIST_PASS}) · Lives: {Math.max(0, HEARTS - s1bTwistWrong)}/{HEARTS}
                  </div>
                </div>

                <div className={`result r_${result}`}>
                  {result === 'idle' &&
                    (s1bTwistDone
                      ? s1bTwistPassed
                        ? 'Passed — lesson complete. (+10 bonus XP)'
                        : 'Failed twist — hit Restart to try again.'
                      : 'Twist: 10 questions. Need 8/10 to pass.')}
                  {result === 'correct' && `Correct — +3 XP. (${s1bTwistQ.promptLabel})`}
                  {result === 'wrong' && (lessonRetryKey === `${id}:S1B_TWIST:${s1bTwistIndex}` ? 'Not quite — try once more.' : `Not quite — it was ${s1bTwistQ.promptLabel}.`)}
                </div>

                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <ChoiceGrid choices={s1bTwistQ.choices} onChoose={chooseS1BTwist} />
                </div>

                <div style={{ marginTop: 10 }}>
                  <StaffNote midi={s1bTwistQ.midi} spelling={s1bTwistQ.displaySpelling} showLegend={false} />
                </div>

                <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
                  Lessons stable register; tests roam wider (G2+).
                </div>
              </>
            }
          />
        </>
      ) : id === 'S1C_ACCIDENTALS' ? (
        <>
          <TTTRunner
            teachComplete={s1cTeachDone}
            testComplete={s1cTestComplete}
            twistComplete={s1cTwistPassed}
            onComplete={() => {
              // No-op: completion is handled by the effect that marks the station done.
            }}
            teach={
              <InfoCardPager
                pages={[
                  {
                    title: 'Black keys = accidentals',
                    body: `The black keys are the “in-between” notes.

Each black key has *two* names:
C# = Db, D# = Eb, F# = Gb, G# = Ab, A# = Bb.`,
                  },
                  {
                    title: 'Two groups: 2 + 3',
                    body: `Look at the keyboard shape:

• Group of 2 black keys = C# and D#
• Group of 3 black keys = F# G# A#

This “geometry” is faster than memorizing randomly.`,
                  },
                  {
                    title: 'Stable register',
                    body: `Lesson stays in one octave so your ear locks in.

Context (sharp vs flat) depends on the key — we’ll cover that later. For now, both spellings are accepted.`,
                  },
                ]}
                doneLabel="Start test"
                onDone={() => {
                  setS1cTeachDone(true);
                  setResult('idle');
                  setHighlighted({});
                }}
              />
            }
            test={
              <>
                <HintOverlay open={s1cHintOpen} onClose={() => setS1cHintOpen(false)} title="Accidentals hint">
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    <li>In the 2-black-keys group: left is <b>C# / Db</b>, right is <b>D# / Eb</b>.</li>
                    <li>In the 3-black-keys group: left→right is <b>F# / Gb</b>, <b>G# / Ab</b>, <b>A# / Bb</b>.</li>
                    <li>Both names are correct. Don’t overthink — recognize fast.</li>
                  </ul>
                </HintOverlay>

                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <button className="primary" onClick={playPromptS1C}>Play note</button>
                  <button className="ghost" onClick={() => setSeed((x) => x + 1)}>Next</button>
                  <button className="secondary" onClick={() => setS1cHintOpen(true)}>Hint</button>
                  <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
                    Test: {Math.min(s1cCorrect, S1C_GOAL)}/{S1C_GOAL}
                  </div>
                </div>

                <div className={`result r_${result}`}>
                  {result === 'idle' && 'Name the black key.'}
                  {result === 'correct' && `Correct — +2 XP. (${s1cQ.promptLabel})`}
                  {result === 'wrong' && `Not quite — it was ${s1cQ.promptLabel}.`}
                </div>

                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <ChoiceGrid choices={s1cQ.choices} onChoose={chooseS1C} />
                </div>

                <div className="row" style={{ gap: 14, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                  <StaffNote midi={s1cQ.midi} spelling={s1cQ.displaySpelling} showLegend={false} />
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <PianoKeyboard
                      startMidi={STABLE_REGISTER_MIN_MIDI}
                      octaves={1}
                      onPress={(m) => piano.playMidi(m, { durationSec: dur(0.9), velocity: 0.9 })}
                      highlighted={highlighted}
                    />
                  </div>
                </div>

                {s1cTestComplete ? (
                  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
                    Nice — now a short <b>Twist</b> (scored, hearts apply).
                  </div>
                ) : null}
              </>
            }
            twist={
              <>
                <HintOverlay open={s1cHintOpen} onClose={() => setS1cHintOpen(false)} title="Accidentals hint">
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    <li>2-black group: <b>C#</b>, <b>D#</b>.</li>
                    <li>3-black group: <b>F#</b>, <b>G#</b>, <b>A#</b>.</li>
                    <li>Also valid: Db Eb Gb Ab Bb.</li>
                  </ul>
                </HintOverlay>

                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <button className="primary" onClick={playPromptS1CTwist}>Play note</button>
                  <button className="ghost" onClick={resetS1CTwist}>Restart</button>
                  <button className="secondary" onClick={() => setS1cHintOpen(true)}>Hint</button>
                  <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
                    Q: {Math.min(s1cTwistIndex + 1, S1C_TWIST_TOTAL)}/{S1C_TWIST_TOTAL} · Correct: {s1cTwistCorrect}/{S1C_TWIST_TOTAL} (need {S1C_TWIST_PASS}) · Lives: {Math.max(0, HEARTS - s1cTwistWrong)}/{HEARTS}
                  </div>
                </div>

                <div className={`result r_${result}`}>
                  {result === 'idle' &&
                    (s1cTwistDone
                      ? s1cTwistPassed
                        ? 'Passed — lesson complete. (+10 bonus XP)'
                        : 'Failed twist — hit Restart to try again.'
                      : 'Twist: 10 questions. Need 8/10 to pass.')}
                  {result === 'correct' && `Correct — +3 XP. (${s1cTwistQ.promptLabel})`}
                  {result === 'wrong' && (lessonRetryKey === `${id}:S1C_TWIST:${s1cTwistIndex}` ? 'Not quite — try once more.' : `Not quite — it was ${s1cTwistQ.promptLabel}.`)}
                </div>

                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <ChoiceGrid choices={s1cTwistQ.choices} onChoose={chooseS1CTwist} />
                </div>

                <div style={{ marginTop: 10 }}>
                  <StaffNote midi={s1cTwistQ.midi} spelling={s1cTwistQ.displaySpelling} showLegend={false} />
                </div>

                <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
                  Lessons stable register; tests roam wider (G2+).
                </div>
              </>
            }
          />
        </>
      ) : id === 'T1B_NOTES' ? (
        <>
          <HintOverlay open={t1bHintOpen} onClose={() => setT1bHintOpen(false)} title="Hint">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Find <b>Middle C</b> first. On piano: just left of the 2-black-keys group.</li>
              <li>Then it’s just alphabet order on white keys: <b>C D E F G A B</b>.</li>
              <li>This mid-test has <b>no hearts</b> — play again as needed.</li>
            </ul>
          </HintOverlay>

          <TestHeader
            playLabel="Play note"
            onPlay={playPromptT1B}
            onRestart={resetT1B}
            rightStatus={`Q: ${Math.min(t1bIndex + 1, T1B_TOTAL)}/${T1B_TOTAL} · Correct: ${t1bCorrect}/${T1B_TOTAL} (need ${T1B_PASS}) · Wrong: ${t1bWrong}`}
          />

          <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            <button className="secondary" onClick={() => setT1bHintOpen(true)}>Hint</button>
          </div>

          <div className={`result r_${result}`}>
            {result === 'idle' && 'Mid-test: stable register. Need 6/8 to pass.'}
            {result === 'correct' &&
              (progress.stationDone['T1B_NOTES'] ? 'Passed — nice. (+10 bonus XP)' : `Correct — +3 XP. (${t1bQ.promptLabel})`)}
            {result === 'wrong' && (t1bDone ? 'Done — try Restart to improve your score.' : `Not quite — it was ${t1bQ.promptLabel}.`)}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <ChoiceGrid choices={t1bQ.choices} onChoose={chooseT1B} />
          </div>

          <div className="row" style={{ gap: 14, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
            <StaffNote midi={t1bQ.midi} spelling={t1bQ.displaySpelling} showLegend={false} />
            <div style={{ flex: 1, minWidth: 240 }}>
              <PianoKeyboard
                startMidi={STABLE_REGISTER_MIN_MIDI}
                octaves={1}
                onPress={(m) => piano.playMidi(m, { durationSec: dur(0.9), velocity: 0.9 })}
                highlighted={highlighted}
              />
            </div>
          </div>
        </>
      ) : id === 'T1_NOTES' ? (
        <>
          <TestHeader
            playLabel="Play note"
            onPlay={playPromptT1}
            onRestart={resetT1}
            reviewHref={(t1Index >= T1_TOTAL || t1Wrong >= HEARTS) && stationMistakeCount > 0 ? `/review?station=${id}` : undefined}
            reviewLabel={`Review mistakes (${stationMistakeCount})`}
            rightStatus={`Q: ${Math.min(t1Index + 1, T1_TOTAL)}/${T1_TOTAL} · Correct: ${t1Correct}/${T1_TOTAL} (need ${T1_PASS}) · Lives: ${Math.max(0, HEARTS - t1Wrong)}/${HEARTS}`}
          />

          <div className={`result r_${result}`}>
            {result === 'idle' && 'Test: name 10 notes (wider range). Need 8/10 to pass.'}
            {result === 'correct' &&
              (progress.stationDone['T1_NOTES']
                ? 'Passed — nice. (+12 bonus XP)'
                : `Correct — +3 XP. (${t1Q.promptLabel})`)}
            {result === 'wrong' &&
              (t1Wrong >= HEARTS
                ? `Out of lives. Score so far: ${t1Correct}/${T1_TOTAL}. Hit restart to try again${stationMistakeCount > 0 ? ' — or review your misses.' : '.'}`
                : t1Index + 1 >= T1_TOTAL
                  ? `Finished: ${t1Correct}/${T1_TOTAL}. Need ${T1_PASS}. Hit restart to try again.`
                  : `Not quite — it was ${t1Q.promptLabel}.`)}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <ChoiceGrid choices={t1Q.choices} onChoose={chooseT1} />
          </div>

          <div style={{ marginTop: 10 }}>
            <StaffNote midi={t1Q.midi} spelling={t1Q.displaySpelling} showLegend={false} />
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Tip: tests can roam across a bigger register; lessons stay in a stable register.
          </div>
        </>
      ) : id === 'E1_NOTES' ? (
        <>
          <TestHeader
            playLabel="Play note"
            onPlay={playPromptE1}
            onRestart={resetE1}
            reviewHref={(e1Index >= E1_TOTAL || e1Wrong >= HEARTS) && stationMistakeCount > 0 ? `/review?station=${id}` : undefined}
            reviewLabel={`Review mistakes (${stationMistakeCount})`}
            rightStatus={`Q: ${Math.min(e1Index + 1, E1_TOTAL)}/${E1_TOTAL} · Correct: ${e1Correct}/${E1_TOTAL} (need ${E1_PASS}) · Lives: ${Math.max(0, HEARTS - e1Wrong)}/${HEARTS}`}
          />

          <div className={`result r_${result}`}>
            {result === 'idle' && 'Section exam: 10 mixed notes (staff + accidentals, wider range). Need 8/10 to pass.'}
            {result === 'correct' &&
              (progress.stationDone['E1_NOTES']
                ? 'Passed — section completed. (+15 bonus XP)'
                : `Correct — +3 XP. (${e1Q.promptLabel})`)}
            {result === 'wrong' &&
              (e1Wrong >= HEARTS
                ? `Out of lives. Score so far: ${e1Correct}/${E1_TOTAL}. Hit restart to try again${stationMistakeCount > 0 ? ' — or review your misses.' : '.'}`
                : e1Index + 1 >= E1_TOTAL
                  ? `Finished: ${e1Correct}/${E1_TOTAL}. Need ${E1_PASS}. Hit restart to try again.`
                  : `Not quite — it was ${e1Q.promptLabel}.`)}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <ChoiceGrid choices={e1Q.choices} onChoose={chooseE1} />
          </div>

          <div style={{ marginTop: 10 }}>
            <StaffNote midi={e1Q.midi} spelling={e1Q.displaySpelling} showLegend={false} />
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Duolingo-ish: pass the exam to "test out" and mark the whole section complete.
          </div>
        </>
      ) : id === 'T2_MAJOR_SCALE' ? (
        <>
          <TestHeader
            playLabel="Hear prompt"
            onPlay={playPromptT2}
            onRestart={resetT2}
            reviewHref={(t2Index >= T2_TOTAL || t2Wrong >= HEARTS) && stationMistakeCount > 0 ? `/review?station=${id}` : undefined}
            reviewLabel={`Review mistakes (${stationMistakeCount})`}
            rightStatus={`Q: ${Math.min(t2Index + 1, T2_TOTAL)}/${T2_TOTAL} · Correct: ${t2Correct}/${T2_TOTAL} (need ${T2_PASS}) · Lives: ${Math.max(0, HEARTS - t2Wrong)}/${HEARTS}`}
          />

          <div className={`result r_${result}`}>
            {result === 'idle' && t2Q.prompt}
            {result === 'correct' &&
              (progress.stationDone['T2_MAJOR_SCALE'] ? 'Passed — nice. (+12 bonus XP)' : 'Correct — +3 XP.')}
            {result === 'wrong' &&
              (t2Wrong >= HEARTS
                ? `Out of lives. Score so far: ${t2Correct}/${T2_TOTAL}. Hit restart to try again${stationMistakeCount > 0 ? ' — or review your misses.' : '.'}`
                : t2Index + 1 >= T2_TOTAL
                  ? `Finished: ${t2Correct}/${T2_TOTAL}. Need ${T2_PASS}. Hit restart to try again.`
                  : `Not quite — it was ${t2Q.correct}.`)}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <ChoiceGrid choices={t2Q.choices} onChoose={chooseT2} />
          </div>

          <div style={{ marginTop: 10 }}>
            <PianoKeyboard
              startMidi={43} // G2 — tests should never surface below this register
              octaves={4}
              onPress={(m) => piano.playMidi(m, { durationSec: dur(0.9), velocity: 0.9 })}
              highlighted={highlighted}
            />
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Tip: listen for the degree, but answer with correct spelling.
          </div>
        </>
      ) : id === 'T3B_INTERVALS' ? (
        <>
          <TestHeader
            playLabel={`Hear interval (${intervalPromptModeLabel})`}
            onPlay={playPromptT3B}
            onRestart={resetT3B}
            leftExtras={practiceLeftExtras}
            reviewHref={t3bDone && stationMistakeCount > 0 ? `/review?station=${id}` : undefined}
            reviewLabel={`Review mistakes (${stationMistakeCount})`}
            rightStatus={`Q: ${Math.min(t3bIndex + 1, T3B_TOTAL)}/${T3B_TOTAL} · Correct: ${t3bCorrect}/${T3B_TOTAL} (need ${T3B_PASS}) · Wrong: ${t3bWrong}`}
          />

          <div className={`result r_${result}`}>
            {result === 'idle' && 'Mid-test: 8 interval labels. No hearts. Need 6/8 to pass.'}
            {result === 'correct' &&
              (progress.stationDone['T3B_INTERVALS']
                ? 'Passed — warmed up. (+10 bonus XP)'
                : `Correct — +3 XP. (${intervalLongName(t3bQ.correct)})`)}
            {result === 'wrong' && (t3bDone ? 'Done — hit Restart to improve your score.' : `Not quite — it was ${t3bQ.correct} (${intervalLongName(t3bQ.correct)}).`)}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <ChoiceGrid
              choices={t3bQ.choices}
              onChoose={chooseT3B}
              disabled={correctionReplayBusy}
              getButtonClassName={(c) => `secondary${c === t3bLastWrongChoice ? ' choiceWrong' : ''}`}
            />
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Checkpoint vibe: play again anytime — no hearts here. If you miss, the app replays the correct interval once.
          </div>

          {t3bDone ? (
            <div className="callout" style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 700 }}>Checkpoint complete</div>
              <div style={{ marginTop: 4, opacity: 0.85 }}>
                Score: {t3bCorrect}/{T3B_TOTAL} (need {T3B_PASS}).
              </div>

              {renderIntervalMissStats(resetT3B)}

              {topIntervalMisses.length > 0 ? (
                <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {topIntervalMisses.map((x) => (
                    <button
                      key={x.label}
                      className="pillBtn"
                      onClick={() => {
                        setPractice(true);
                        setPracticeWeightedSemitones(null);
                        setPracticeFocusIntervals([x.label]);
                        resetT3B();
                      }}
                      title={`Practice ${x.label} only`}
                    >
                      Practice {x.label}
                    </button>
                  ))}
                  <button
                    className="pillBtn"
                    onClick={() => {
                      setPractice(true);
                      setPracticeWeightedSemitones(null);
                      setPracticeFocusIntervals(topIntervalMisses.map((x) => x.label));
                      resetT3B();
                    }}
                    title="Practice your top misses"
                  >
                    Practice top misses
                  </button>
                  <button
                    className="pillBtn"
                    onClick={() => {
                      // Bias question sampling toward your worst offenders.
                      // Implementation: duplicate semitone values in the allowlist (higher frequency = more likely).
                      const weighted = topIntervalMisses.flatMap((x) =>
                        Array(Math.min(6, Math.max(2, x.weight))).fill(LABEL_TO_SEMITONE[x.label]),
                      );
                      setPractice(true);
                      setPracticeFocusIntervals(null);
                      setPracticeWeightedSemitones(weighted.length ? weighted : null);
                      resetT3B();
                    }}
                    title="Practice a targeted mix weighted toward your misses"
                  >
                    Targeted mix
                  </button>
                </div>
              ) : null}

              <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {stationMistakeCount > 0 ? (
                  <Link className="linkBtn" to={`/review?station=${id}`}>
                    Review mistakes ({stationMistakeCount})
                  </Link>
                ) : null}
                <button
                  className="linkBtn"
                  onClick={() => {
                    setPracticeFocusIntervals(null);
                    setPracticeWeightedSemitones(null);
                    resetT3B();
                  }}
                >
                  Restart
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : id === 'T3_INTERVALS' ? (
        <>
          <TestHeader
            playLabel={`Hear interval (${intervalPromptModeLabel})`}
            onPlay={playPromptT3}
            onRestart={resetT3}
            leftExtras={practiceLeftExtras}
            reviewHref={t3Done && stationMistakeCount > 0 ? `/review?station=${id}` : undefined}
            reviewLabel={`Review mistakes (${stationMistakeCount})`}
            rightStatus={`Q: ${Math.min(t3Index + 1, T3_TOTAL)}/${T3_TOTAL} · Correct: ${t3Correct}/${T3_TOTAL} (need ${T3_PASS}) · Lives: ${Math.max(0, HEARTS - t3Wrong)}/${HEARTS}`}
          />

          <div className={`result r_${result}`}>
            {result === 'idle' && t3Q.prompt}
            {result === 'correct' &&
              (progress.stationDone['T3_INTERVALS'] ? 'Passed — nice. (+12 bonus XP)' : `Correct — +3 XP. (${intervalLongName(t3Q.correct)})`)}
            {result === 'wrong' &&
              (t3Wrong >= HEARTS
                ? `Out of lives. Score so far: ${t3Correct}/${T3_TOTAL}.` + (stationMistakeCount > 0 ? ' Review your misses, then restart.' : ' Hit restart to try again.')
                : t3Index + 1 >= T3_TOTAL
                  ? `Finished: ${t3Correct}/${T3_TOTAL}. Need ${T3_PASS}.` + (stationMistakeCount > 0 ? ' Review mistakes, then restart.' : ' Hit restart to try again.')
                  : `Not quite — it was ${t3Q.correct} (${intervalLongName(t3Q.correct)}).`)}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <ChoiceGrid
              choices={t3Q.choices}
              onChoose={chooseT3}
              disabled={correctionReplayBusy}
              getButtonClassName={(c) => `secondary${c === t3LastWrongChoice ? ' choiceWrong' : ''}`}
            />
          </div>

          <RegisterPolicyNote mode="both" />

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Misses auto-replay the correct interval once (fast correction loop).
          </div>

          {t3Done ? (
            <div className="callout" style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 700 }}>Test complete</div>
              <div style={{ marginTop: 4, opacity: 0.85 }}>
                Score: {t3Correct}/{T3_TOTAL} (need {T3_PASS}).
              </div>

              {renderIntervalMissStats(resetT3)}

              {topIntervalMisses.length > 0 ? (
                <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {topIntervalMisses.map((x) => (
                    <button
                      key={x.label}
                      className="pillBtn"
                      onClick={() => {
                        setPractice(true);
                        setPracticeWeightedSemitones(null);
                        setPracticeFocusIntervals([x.label]);
                        resetT3();
                      }}
                      title={`Practice ${x.label} only`}
                    >
                      Practice {x.label}
                    </button>
                  ))}
                  <button
                    className="pillBtn"
                    onClick={() => {
                      setPractice(true);
                      setPracticeWeightedSemitones(null);
                      setPracticeFocusIntervals(topIntervalMisses.map((x) => x.label));
                      resetT3();
                    }}
                    title="Practice your top misses"
                  >
                    Practice top misses
                  </button>
                  <button
                    className="pillBtn"
                    onClick={() => {
                      const weighted = topIntervalMisses.flatMap((x) =>
                        Array(Math.min(6, Math.max(2, x.weight))).fill(LABEL_TO_SEMITONE[x.label]),
                      );
                      setPractice(true);
                      setPracticeFocusIntervals(null);
                      setPracticeWeightedSemitones(weighted.length ? weighted : null);
                      resetT3();
                    }}
                    title="Practice a targeted mix weighted toward your misses"
                  >
                    Targeted mix
                  </button>
                </div>
              ) : null}

              <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {stationMistakeCount > 0 ? (
                  <Link className="linkBtn" to={`/review?station=${id}`}>
                    Review mistakes ({stationMistakeCount})
                  </Link>
                ) : null}
                <button
                  className="linkBtn"
                  onClick={() => {
                    setPracticeFocusIntervals(null);
                    setPracticeWeightedSemitones(null);
                    resetT3();
                  }}
                >
                  Restart
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : id === 'E3_INTERVALS' ? (
        <>
          <TestHeader
            playLabel={`Hear interval (${intervalPromptModeLabel})`}
            onPlay={playPromptE3}
            onRestart={resetE3}
            leftExtras={practiceLeftExtras}
            reviewHref={e3Done && stationMistakeCount > 0 ? `/review?station=${id}` : undefined}
            reviewLabel={`Review mistakes (${stationMistakeCount})`}
            rightStatus={`Q: ${Math.min(e3Index + 1, E3_TOTAL)}/${E3_TOTAL} · Correct: ${e3Correct}/${E3_TOTAL} (need ${E3_PASS}) · Lives: ${Math.max(0, HEARTS - e3Wrong)}/${HEARTS}`}
          />

          <div className={`result r_${result}`}>
            {result === 'idle' && e3Q.prompt}
            {result === 'correct' &&
              (progress.stationDone['E3_INTERVALS']
                ? 'Passed — section completed. (+15 bonus XP)'
                : `Correct — +3 XP. (${intervalLongName(e3Q.correct)})`)}
            {result === 'wrong' &&
              (e3Wrong >= HEARTS
                ? `Out of lives. Score so far: ${e3Correct}/${E3_TOTAL}.` + (stationMistakeCount > 0 ? ' Review your misses, then restart.' : ' Hit restart to try again.')
                : e3Index + 1 >= E3_TOTAL
                  ? `Finished: ${e3Correct}/${E3_TOTAL}. Need ${E3_PASS}.` + (stationMistakeCount > 0 ? ' Review mistakes, then restart.' : ' Hit restart to try again.')
                  : `Not quite — it was ${e3Q.correct} (${intervalLongName(e3Q.correct)}).`)}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <ChoiceGrid
              choices={e3Q.choices}
              onChoose={chooseE3}
              disabled={correctionReplayBusy}
              getButtonClassName={(c) => `secondary${c === e3LastWrongChoice ? ' choiceWrong' : ''}`}
            />
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Section exam: hearts on; pass = test out. Misses auto-replay the correct interval once.
          </div>

          {e3Done && !progress.stationDone['E3_INTERVALS'] ? (
            <div className="callout" style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 700 }}>Exam complete</div>
              <div style={{ marginTop: 4, opacity: 0.85 }}>
                Score: {e3Correct}/{E3_TOTAL} (need {E3_PASS}).
              </div>

              {renderIntervalMissStats(resetE3)}

              {topIntervalMisses.length > 0 ? (
                <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {topIntervalMisses.map((x) => (
                    <button
                      key={x.label}
                      className="pillBtn"
                      onClick={() => {
                        setPractice(true);
                        setPracticeWeightedSemitones(null);
                        setPracticeFocusIntervals([x.label]);
                        resetE3();
                      }}
                      title={`Practice ${x.label} only`}
                    >
                      Practice {x.label}
                    </button>
                  ))}
                  <button
                    className="pillBtn"
                    onClick={() => {
                      setPractice(true);
                      setPracticeWeightedSemitones(null);
                      setPracticeFocusIntervals(topIntervalMisses.map((x) => x.label));
                      resetE3();
                    }}
                    title="Practice your top misses"
                  >
                    Practice top misses
                  </button>
                  <button
                    className="pillBtn"
                    onClick={() => {
                      const weighted = topIntervalMisses.flatMap((x) =>
                        Array(Math.min(6, Math.max(2, x.weight))).fill(LABEL_TO_SEMITONE[x.label]),
                      );
                      setPractice(true);
                      setPracticeFocusIntervals(null);
                      setPracticeWeightedSemitones(weighted.length ? weighted : null);
                      resetE3();
                    }}
                    title="Practice a targeted mix weighted toward your misses"
                  >
                    Targeted mix
                  </button>
                </div>
              ) : null}

              <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {stationMistakeCount > 0 ? (
                  <Link className="linkBtn" to={`/review?station=${id}`}>
                    Review mistakes ({stationMistakeCount})
                  </Link>
                ) : null}
                <button
                  className="linkBtn"
                  onClick={() => {
                    setPracticeFocusIntervals(null);
                    setPracticeWeightedSemitones(null);
                    resetE3();
                  }}
                >
                  Restart
                </button>
              </div>
            </div>
          ) : null}

          {progress.stationDone[id] && examSectionId ? (
            <div className="callout" style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 700 }}>Section completed</div>
              <div style={{ marginTop: 4, opacity: 0.85 }}>
                {examSection ? `You cleared ${examSection.title}.` : 'Nice work — you cleared this section.'}
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Link className="linkBtn primaryLink" to={`/learn/section/${examSectionId}`}>
                  Back to section
                </Link>
                <Link className="linkBtn" to={`/learn/section/${examSectionId}/exam`}>
                  Exam page
                </Link>
                {nextSection ? (
                  <Link className="linkBtn" to={`/learn/section/${nextSection.id}`}>
                    Next: {nextSection.title}
                  </Link>
                ) : (
                  <Link className="linkBtn" to="/learn">All sections</Link>
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : id === 'S2_MAJOR_SCALE' ? (
        <>
          <div className="row">
            <button className="primary" onClick={playPromptS2} disabled={!s2PatternDone}>
              Hear target step
            </button>
            <button
              className="secondary"
              onClick={() => piano.playMidi(s2Session.tonicMidi, { durationSec: dur(0.75), velocity: 0.9 })}
            >
              Tonic
            </button>
            <button className="secondary" onClick={() => void playS2Scale('soFar')} disabled={!s2PatternDone}>
              Scale so far
            </button>
            <button className="ghost" onClick={() => void playS2Scale('fullOctave')}>
              Full scale
            </button>
            <button
              className="ghost"
              onClick={() => {
                setS2Step(1);
                setSeed((x) => x + 1);
                setHighlighted({});
                setResult('idle');
              }}
            >
              New key
            </button>
            <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
              Scales: {Math.min(s2CompletedScales, S2_GOAL_SCALES)}/{S2_GOAL_SCALES}
            </div>
          </div>

          {!s2PatternDone ? (
            <>
              <div className={`result r_${result}`}>
                {result === 'idle' && s2PatternQ.prompt}
                {result === 'correct' && 'Correct — +1 XP.'}
                {result === 'wrong' && 'Not quite — try again. (Remember: W W H W W W H)'}
              </div>

              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 10 }}>
                Formula warm-up: {Math.min(s2PatternIndex + 1, 7)}/7
              </div>

              <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                <ChoiceGrid choices={s2PatternQ.choices} onChoose={chooseS2Pattern} />
              </div>

              <div style={{ marginTop: 10 }}>
                <PianoKeyboard
                  startMidi={48}
                  octaves={3}
                  onPress={(m) => piano.playMidi(m, { durationSec: dur(0.9), velocity: 0.9 })}
                  highlighted={highlighted}
                />
              </div>
            </>
          ) : (
            <>
              <div className={`result r_${result}`}>
                {result === 'idle' && s2Q.prompt}
                {result === 'correct' && 'Correct — +2 XP.'}
                {result === 'wrong' && `Not quite — next note is ${s2Q.correct}.`}
              </div>

              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 10 }}>
                So far:{' '}
                <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{s2ShownSoFar.join(' ')}</span>
              </div>

              <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                <ChoiceGrid choices={s2Q.choices} onChoose={chooseS2} />
              </div>

              <div style={{ marginTop: 10 }}>
                <PianoKeyboard
                  startMidi={48}
                  octaves={3}
                  onPress={(m) => piano.playMidi(m, { durationSec: dur(0.9), velocity: 0.9 })}
                  highlighted={highlighted}
                />
              </div>
            </>
          )}
        </>
      ) : id === 'S3_INTERVALS' ? (
        <>
          <TTTRunner
            teachComplete={s3TeachDone}
            testComplete={s3TestComplete}
            twistComplete={s3TwistPassed}
            onComplete={() => {
              // No-op: completion is handled by the effect that marks the station done.
            }}
            teach={
              <InfoCardPager
                pages={[
                  {
                    title: 'Intervals by ear',
                    body:
                      'Goal: hear the distance between two notes and name it.\n\nLesson rules: stable register. No gotchas — just clean recognition.',
                    footnote: 'Tip: don\'t guess fast. Listen twice is normal.',
                  },
                  {
                    title: 'Warm-up: ±1 semitone',
                    body:
                      'Quick shortcut:\n\nminor = major − 1 semitone\nAugmented = perfect + 1\nDiminished = perfect − 1\n\n(Some “perfect ± 1” names feel weird — that\'s fine.)',
                  },
                  {
                    title: 'Then: find the target note',
                    body:
                      `We'll play root → target. Tap the target key.\n\nAfter you clear the stable lesson (${STABLE_REGISTER_RANGE_TEXT}), we'll do a short Twist test (hearts on) across a wider register (≥ ${WIDE_REGISTER_RANGE_TEXT}).`,

                  },
                ]}
                doneLabel="Start"
                onDone={() => {
                  setS3TeachDone(true);
                  setResult('idle');
                  setHighlighted({});
                }}
              />
            }
            test={
              <>
                <div style={{ marginTop: 6, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                    <div style={{ fontWeight: 800 }}>Warm-up: ±1 semitone</div>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>
                      Progress: {Math.min(s3DeriveCorrect, S3_DERIVE_GOAL)}/{S3_DERIVE_GOAL}
                    </div>
                  </div>
                  <div className={`result r_${s3DeriveResult}`} style={{ marginTop: 8 }}>
                    {s3DeriveResult === 'idle' && s3DeriveQ.prompt}
                    {s3DeriveResult === 'correct' && 'Correct — +1 XP.'}
                    {s3DeriveResult === 'wrong' && `Not quite — it was ${s3DeriveQ.correct}.`}
                  </div>
                  <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                    <ChoiceGrid choices={s3DeriveQ.choices} onChoose={chooseS3Derive} renderChoice={intervalLongName} />
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                    Hint: minor = major − 1 semitone. (Perfect ± 1 is “the weird ones”.)
                  </div>
                </div>

                <div className="row">
                  <button className="primary" onClick={playPromptS3} disabled={!s3WarmupDone}>
                    Play prompt
                  </button>
                  <button
                    className="secondary"
                    disabled={!s3WarmupDone}
                    onClick={() => piano.playMidi(intervalQ.rootMidi, { durationSec: dur(0.9) })}
                  >
                    Root
                  </button>
                  <button className="ghost" onClick={next}>
                    Next
                  </button>
                  <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
                    Progress: {Math.min(s3Correct, S3_GOAL)}/{S3_GOAL}
                  </div>
                </div>

                <div className={`result r_${result}`}>
                  {result === 'idle' &&
                    (s3WarmupDone
                      ? 'Tap the target note.'
                      : `Finish the warm-up first (${Math.min(s3DeriveCorrect, S3_DERIVE_GOAL)}/${S3_DERIVE_GOAL}).`)}
                  {result === 'correct' && (s3TestComplete ? 'Nice — lesson test cleared.' : 'Correct — +10 XP.')}
                  {result === 'wrong' && 'Not quite. Listen again.'}
                </div>

                <PianoKeyboard
                  startMidi={48}
                  octaves={2}
                  onPress={onPressS3}
                  highlighted={highlighted}
                  minMidi={STABLE_REGISTER_MIN_MIDI}
                  maxMidi={STABLE_REGISTER_MAX_MIDI}
                />

                {s3TestComplete ? (
                  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
                    Nice — now we do a short <b>Twist</b> (scored, hearts apply, wider register).
                  </div>
                ) : null}
              </>
            }
            twist={
              <>
                <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button className="primary" onClick={playPromptS3Twist}>
                    Hear interval
                  </button>
                  <button className="ghost" onClick={resetS3Twist}>
                    Restart
                  </button>
                  <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
                    Q: {Math.min(s3TwistIndex + 1, S3_TWIST_TOTAL)}/{S3_TWIST_TOTAL} · Correct: {s3TwistCorrect}/{S3_TWIST_TOTAL} (need {S3_TWIST_PASS}) · Lives: {Math.max(0, HEARTS - s3TwistWrong)}/{HEARTS}
                  </div>
                </div>

                <div className={`result r_${result}`}>
                  {result === 'idle' &&
                    (s3TwistDone
                      ? s3TwistPassed
                        ? 'Passed — lesson complete. (+10 bonus XP)'
                        : `Failed twist — hit Restart to try again. Score: ${s3TwistCorrect}/${S3_TWIST_TOTAL}.`
                      : 'Twist: 10 questions. Need 8/10 to pass.')}
                  {result === 'correct' && `Correct — +3 XP. (${intervalLongName(s3TwistQ.correct)})`}
                  {result === 'wrong' && (lessonRetryKey === `${id}:S3_TWIST:${s3TwistIndex}` ? 'Not quite — try once more.' : `Not quite — it was ${s3TwistQ.correct} (${intervalLongName(s3TwistQ.correct)}).`)}
                </div>

                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <ChoiceGrid choices={s3TwistQ.choices} onChoose={chooseS3Twist} renderChoice={intervalLongName} />
                </div>

                <RegisterPolicyNote mode="both" />
              </>
            }
          />
        </>
      ) : id === 'S4_TRIADS' ? (
        <>
          <div className="row">
            <button className="primary" onClick={playPromptS4}>Hear chord</button>
            <button className="secondary" onClick={() => piano.playMidi(triadQ.rootMidi, { durationSec: dur(0.8), velocity: 0.9 })}>
              Root
            </button>
            {chordMode === 'arp' ? (
              <button className="secondary" onClick={playPromptS4BlockPreview} title="Preview how tests/exams will sound">
                Block
              </button>
            ) : null}

            <button className="ghost" onClick={next}>Next</button>
            <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
              Progress: {Math.min(s4Correct, S4_GOAL)}/{S4_GOAL}
            </div>
          </div>

          <div className={`result r_${result}`}>
            {result === 'idle' && triadQ.prompt}
            {result === 'correct' && 'Correct — +4 XP.'}
            {result === 'wrong' && `Not quite — it was ${triadQualityLabel(triadQ.quality)} (${triadQualityIntervals(triadQ.quality).join('-')} semitones).`}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <ChoiceGrid choices={triadQ.choices} onChoose={chooseS4} renderChoice={triadQualityLabel} />
          </div>

          <PianoKeyboard
            startMidi={48}
            octaves={2}
            onPress={(m) => piano.playMidi(m, { durationSec: dur(0.9), velocity: 0.9 })}
            highlighted={highlighted}
          />
        </>
      ) : id === 'T5_TRIADS' ? (
        <>
          <TestHeader
            playLabel="Hear chord"
            onPlay={playPromptT5}
            onRestart={resetT5}
reviewHref={(t5Index >= T5_TOTAL || t5Wrong >= HEARTS) && stationMistakeCount > 0 ? `/review?station=${id}` : undefined}
            reviewLabel={`Review mistakes (${stationMistakeCount})`}
            rightStatus={`Q: ${Math.min(t5Index + 1, T5_TOTAL)}/${T5_TOTAL} · Correct: ${t5Correct}/${T5_TOTAL} (need ${T5_PASS}) · Lives: ${Math.max(0, HEARTS - t5Wrong)}/${HEARTS}`}
          />

          <div className={`result r_${result}`}>
            {result === 'idle' && 'Test: name 10 triad qualities by ear. Need 8/10 to pass.'}
            {result === 'correct' &&
              (progress.stationDone['T5_TRIADS'] ? 'Passed — nice. (+12 bonus XP)' : `Correct — +3 XP. (${triadQualityLabel(t5Q.quality)})`)}
            {result === 'wrong' &&
              (t5Wrong >= HEARTS
                ? `Out of lives. Score so far: ${t5Correct}/${T5_TOTAL}. Hit restart to try again${stationMistakeCount > 0 ? ' — or review your misses.' : '.'}`
                : t5Index + 1 >= T5_TOTAL
                  ? `Finished: ${t5Correct}/${T5_TOTAL}. Need ${T5_PASS}. Hit restart to try again.`
                  : `Not quite — it was ${triadQualityLabel(t5Q.quality)}.`)}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <ChoiceGrid choices={t5Q.choices} onChoose={chooseT5} renderChoice={triadQualityLabel} />
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Tip: tests can roam across a bigger register; lessons stay in a stable register.
          </div>
        </>
      ) : id === 'S5_DIATONIC_TRIADS' ? (
        <>
          <div className="row">
            <button className="primary" onClick={playPromptS5}>Hear triad</button>
            {chordMode === 'arp' ? (
              <button className="secondary" onClick={playPromptS5BlockPreview} title="Preview how tests/exams will sound">
                Block
              </button>
            ) : null}

            <button className="ghost" onClick={next}>Next</button>
            <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
              Progress: {Math.min(s5Correct, S5_GOAL)}/{S5_GOAL}
            </div>
          </div>

          <div className={`result r_${result}`}>
            {result === 'idle' && diatonicQ.prompt}
            {result === 'correct' && `Correct — +5 XP. (${diatonicQ.key} major, degree ${diatonicQ.degree})`}
            {result === 'wrong' && `Not quite — it was ${triadQualityLabel(diatonicQ.quality)}.`}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <ChoiceGrid choices={diatonicQ.choices} onChoose={chooseS5} renderChoice={triadQualityLabel} />
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Hint: diatonic triad qualities in major are always: I ii iii IV V vi vii°.
          </div>

          <PianoKeyboard
            startMidi={48}
            octaves={2}
            onPress={(m) => piano.playMidi(m, { durationSec: dur(0.9), velocity: 0.9 })}
            highlighted={highlighted}
          />
        </>
      ) : id === 'T6_DIATONIC_TRIADS' ? (
        <>
          <TestHeader
            playLabel="Hear triad"
            onPlay={playPromptT6}
            onRestart={resetT6}
reviewHref={(t6Index >= T6_TOTAL || t6Wrong >= HEARTS) && stationMistakeCount > 0 ? `/review?station=${id}` : undefined}
            reviewLabel={`Review mistakes (${stationMistakeCount})`}
            rightStatus={`Q: ${Math.min(t6Index + 1, T6_TOTAL)}/${T6_TOTAL} · Correct: ${t6Correct}/${T6_TOTAL} (need ${T6_PASS}) · Lives: ${Math.max(0, HEARTS - t6Wrong)}/${HEARTS}`}
          />

          <div className={`result r_${result}`}>
            {result === 'idle' && 'Test: identify diatonic triad quality in key by ear. Need 8/10 to pass.'}
            {result === 'correct' &&
              (progress.stationDone['T6_DIATONIC_TRIADS']
                ? 'Passed — nice. (+12 bonus XP)'
                : `Correct — +3 XP. (${triadQualityLabel(t6Q.quality)})`)}
            {result === 'wrong' &&
              (t6Wrong >= HEARTS
                ? `Out of lives. Score so far: ${t6Correct}/${T6_TOTAL}. Hit restart to try again${stationMistakeCount > 0 ? ' — or review your misses.' : '.'}`
                : t6Index + 1 >= T6_TOTAL
                  ? `Finished: ${t6Correct}/${T6_TOTAL}. Need ${T6_PASS}. Hit restart to try again.`
                  : `Not quite — it was ${triadQualityLabel(t6Q.quality)}.`)}
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>Prompt: {t6Q.prompt}</div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            <ChoiceGrid choices={t6Q.choices} onChoose={chooseT6} renderChoice={triadQualityLabel} />
          </div>

          <RegisterPolicyNote mode="both" />
        </>
      ) : id === 'S6_FUNCTIONS' ? (
        <>
          <div className="row">
            <button className="primary" onClick={playPromptS6}>Hear chord</button>
            {chordMode === 'arp' ? (
              <button className="secondary" onClick={playPromptS6BlockPreview} title="Preview how tests/exams will sound">
                Block
              </button>
            ) : null}

            <button className="ghost" onClick={next}>Next</button>
            <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
              Progress: {Math.min(s6Correct, S6_GOAL)}/{S6_GOAL}
            </div>
          </div>

          <div className={`result r_${result}`}>
            {result === 'idle' && funcQ.prompt}
            {result === 'correct' && `Correct — +5 XP. (${funcQ.key} major, ${funcQ.roman})`}
            {result === 'wrong' && `Not quite — ${funcQ.roman} is ${familyLabel(funcQ.family)}.`}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <ChoiceGrid choices={funcQ.choices} onChoose={chooseS6} renderChoice={familyLabel} />
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Quick map (major key): tonic = I iii vi · subdominant = ii IV · dominant = V vii°.
          </div>

          <PianoKeyboard
            startMidi={48}
            octaves={2}
            onPress={(m) => piano.playMidi(m, { durationSec: dur(0.9), velocity: 0.9 })}
            highlighted={highlighted}
          />
        </>
      ) : id === 'T7_FUNCTIONS' ? (
        <>
          <TestHeader
            playLabel="Hear chord"
            onPlay={playPromptT7}
            onRestart={resetT7}
reviewHref={(t7Index >= T7_TOTAL || t7Wrong >= HEARTS) && stationMistakeCount > 0 ? `/review?station=${id}` : undefined}
            reviewLabel={`Review mistakes (${stationMistakeCount})`}
            rightStatus={`Q: ${Math.min(t7Index + 1, T7_TOTAL)}/${T7_TOTAL} · Correct: ${t7Correct}/${T7_TOTAL} (need ${T7_PASS}) · Lives: ${Math.max(0, HEARTS - t7Wrong)}/${HEARTS}`}
          />

          <div className={`result r_${result}`}>
            {result === 'idle' && 'Test: name function family (tonic / subdominant / dominant). Need 8/10 to pass.'}
            {result === 'correct' &&
              (progress.stationDone['T7_FUNCTIONS'] ? 'Passed — nice. (+12 bonus XP)' : `Correct — +3 XP. (${t7Q.family})`)}
            {result === 'wrong' &&
              (t7Wrong >= HEARTS
                ? `Out of lives. Score so far: ${t7Correct}/${T7_TOTAL}. Hit restart to try again${stationMistakeCount > 0 ? ' — or review your misses.' : '.'}`
                : t7Index + 1 >= T7_TOTAL
                  ? `Finished: ${t7Correct}/${T7_TOTAL}. Need ${T7_PASS}. Hit restart to try again.`
                  : `Not quite — it was ${t7Q.family}.`)}
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>Prompt: {t7Q.prompt}</div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            <ChoiceGrid choices={t7Q.choices} onChoose={chooseT7} />
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Tip: listen for rest vs move vs tension.
          </div>
          <RegisterPolicyNote mode="test" />
        </>
      ) : id === 'S7_DEGREES' ? (
        <>
          <div className="row">
            <button className="primary" onClick={playPromptS7}>Hear degree</button>
            <button className="ghost" onClick={playKeyHintS7} title="Hint: hear the key (do–mi–sol–do)">
              Hear key
            </button>
            <button className="ghost" onClick={next}>Next</button>
            <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
              Progress: {Math.min(s7Correct, S7_GOAL)}/{S7_GOAL}
            </div>
          </div>

          <div className={`result r_${result}`}>
            {result === 'idle' && degreeQ.prompt}
            {result === 'correct' && 'Correct — +3 XP.'}
            {result === 'wrong' && `Not quite — it was ${degreeQ.correct}.`}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <ChoiceGrid choices={degreeQ.choices} onChoose={chooseS7} />
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Cheat sheet: 1 tonic · 2 supertonic · 3 mediant · 4 subdominant · 5 dominant · 6 submediant · 7 leading tone
          </div>

          {result !== 'idle' ? (
            <div style={{ fontSize: 12, opacity: 0.82, marginTop: 8 }}>
              Meaning: <span style={{ opacity: 0.95 }}>{degreeMeaning(degreeQ.correct)}</span>
            </div>
          ) : null}
        </>
      ) : id === 'T4_DEGREES' ? (
        <>
          <TestHeader
            playLabel="Hear degree"
            onPlay={playPromptT4}
            onRestart={resetT4}
            reviewHref={(t4Index >= T4_TOTAL || t4Wrong >= HEARTS) && stationMistakeCount > 0 ? `/review?station=${id}` : undefined}
            reviewLabel={`Review mistakes (${stationMistakeCount})`}
            rightStatus={`Q: ${Math.min(t4Index + 1, T4_TOTAL)}/${T4_TOTAL} · Correct: ${t4Correct}/${T4_TOTAL} (need ${T4_PASS}) · Lives: ${Math.max(0, HEARTS - t4Wrong)}/${HEARTS}`}
          />

          <div className={`result r_${result}`}>
            {result === 'idle' && t4Q.prompt}
            {result === 'correct' && (progress.stationDone['T4_DEGREES'] ? 'Passed — nice. (+12 bonus XP)' : 'Correct — +3 XP.')}
            {result === 'wrong' &&
              (t4Wrong >= HEARTS
                ? `Out of lives. Score so far: ${t4Correct}/${T4_TOTAL}. Hit restart to try again${stationMistakeCount > 0 ? ' — or review your misses.' : '.'}`
                : t4Index + 1 >= T4_TOTAL
                  ? `Finished: ${t4Correct}/${T4_TOTAL}. Need ${T4_PASS}. Hit restart to try again.`
                  : `Not quite — it was ${t4Q.correct}.`)}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <ChoiceGrid choices={t4Q.choices} onChoose={chooseT4} />
          </div>

          {result !== 'idle' ? (
            <div style={{ fontSize: 12, opacity: 0.82, marginTop: 8 }}>
              Meaning: <span style={{ opacity: 0.95 }}>{degreeMeaning(t4Q.correct)}</span>
            </div>
          ) : null}

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Tip: tests can roam across a bigger register; lessons stay in a stable register.
          </div>
        </>
      ) : id === 'S8_DEGREE_INTERVALS' ? (
        <>
          <div className="row">
            <button className="primary" onClick={playPromptS8}>Hear tonic → degree</button>
            <button className="ghost" onClick={next}>Next</button>
            <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
              Progress: {Math.min(s8Correct, S8_GOAL)}/{S8_GOAL}
            </div>
          </div>

          <div className={`result r_${result}`}>
            {result === 'idle' && degreeIntervalQ.prompt}
            {result === 'correct' && `Correct — +3 XP. (${degreeIntervalQ.correct})`}
            {result === 'wrong' && `Not quite — it was ${degreeIntervalQ.correct}.`}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <ChoiceGrid choices={degreeIntervalQ.choices} onChoose={chooseS8} />
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Major scale intervals: 1=P1 · 2=M2 · 3=M3 · 4=P4 · 5=P5 · 6=M6 · 7=M7
          </div>
        </>
      ) : id === 'T8_DEGREE_INTERVALS' ? (
        <>
          <TestHeader
            playLabel="Hear tonic → degree"
            onPlay={playPromptT8}
            onRestart={resetT8}
            reviewHref={(t8Index >= T8_TOTAL || t8Wrong >= HEARTS) && stationMistakeCount > 0 ? `/review?station=${id}` : undefined}
            reviewLabel={`Review mistakes (${stationMistakeCount})`}
            rightStatus={`Q: ${Math.min(t8Index + 1, T8_TOTAL)}/${T8_TOTAL} · Correct: ${t8Correct}/${T8_TOTAL} (need ${T8_PASS}) · Lives: ${Math.max(0, HEARTS - t8Wrong)}/${HEARTS}`}
          />

          <div className={`result r_${result}`}>
            {result === 'idle' && t8Q.prompt}
            {result === 'correct' && (progress.stationDone['T8_DEGREE_INTERVALS'] ? 'Passed — nice. (+12 bonus XP)' : `Correct — +3 XP. (${t8Q.correct})`)}
            {result === 'wrong' &&
              (t8Wrong >= HEARTS
                ? `Out of lives. Score so far: ${t8Correct}/${T8_TOTAL}. Hit restart to try again${stationMistakeCount > 0 ? ' — or review your misses.' : '.'}`
                : t8Index + 1 >= T8_TOTAL
                  ? `Finished: ${t8Correct}/${T8_TOTAL}. Need ${T8_PASS}. Hit restart to try again.`
                  : `Not quite — it was ${t8Q.correct}.`)}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <ChoiceGrid choices={t8Q.choices} onChoose={chooseT8} />
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Major scale intervals: 1=P1 · 2=M2 · 3=M3 · 4=P4 · 5=P5 · 6=M6 · 7=M7
          </div>
        </>
      ) : (
        <div className="result">Content for this station is next.</div>
      )
    ) : (
      <div className="callout" style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 220 }}>
          <div style={{ fontWeight: 800 }}>Station completed</div>
          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>
            Today: <b>{Math.max(0, progress.dailyXpToday || 0)}</b>/<b>{Math.max(1, progress.dailyGoalXp || 0)}</b> XP · XP streak:{' '}
            <b>{progress.streakDays}</b> day{progress.streakDays === 1 ? '' : 's'} · Total XP: <b>{progress.xp}</b>
          </div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
            Tip: daily goal is editable in ⚙️ only.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="linkBtn" onClick={() => setPractice(true)}>
            Practice again
          </button>

          {examSectionId ? (
            <Link className="linkBtn primaryLink" to={`/learn/section/${examSectionId}`}>
              Back to section
            </Link>
          ) : nextId && nextUnlocked ? (
            <Link className="linkBtn primaryLink" to={`/lesson/${nextId}`}>
              Next station
            </Link>
          ) : (
            <Link className="linkBtn primaryLink" to="/learn">
              Back to Learn
            </Link>
          )}
        </div>
      </div>
    )}

      {/* Tips + extra navigation removed in Focus Mode. Guidebook lives behind ⚙️. */}
      </div>
    </div>
  );
}

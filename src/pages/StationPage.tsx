import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { StationId, Progress } from '../lib/progress';
import { applyStudyReward, markStationDone } from '../lib/progress';
import { addMistake, mistakeCountForStation } from '../lib/mistakes';
import { STATIONS, nextStationId, isStationUnlocked } from '../lib/stations';
import { sectionStationsByExamId } from '../lib/sectionStations';
import { stationCopy } from '../lib/stationCopy';
import { loadSettings, saveSettings } from '../lib/settings';
import { promptSpeedFactors, promptSpeedLabel } from '../lib/promptTiming';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { StaffNote } from '../components/StaffNote';
import { TestHeader } from '../components/TestHeader';
import { ChoiceGrid } from '../components/ChoiceGrid';
import { useHotkeys } from '../lib/hooks/useHotkeys';
import { piano } from '../audio/piano';
import { playIntervalPrompt, playNoteSequence, playRootThenChordPrompt, playTonicTargetPrompt } from '../audio/prompts';
import {
  makeIntervalQuestion,
  makeIntervalLabelQuestion,
  makeIntervalDeriveQuestion,
  intervalLongName,
  type IntervalLabel,
} from '../exercises/interval';
import { makeNoteNameQuestion } from '../exercises/noteName';
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

export function StationPage({ progress, setProgress }: { progress: Progress; setProgress: (p: Progress) => void }) {
  const { stationId } = useParams();
  const id = (stationId ?? 'S3_INTERVALS') as StationId;

  const station = STATIONS.find((s) => s.id === id);
  const done = progress.stationDone[id];
  const nextId = nextStationId(id);
  const nextUnlocked = nextId ? isStationUnlocked(progress, nextId) : false;

  const copy = stationCopy(id);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    function bump() {
      setNow(Date.now());
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

  const [seed, setSeed] = useState(1);
  // If a station is already completed, default to a “summary” view with an optional practice toggle.
  const [practice, setPractice] = useState(false);

  const [settings, setSettings] = useState(() => loadSettings());
  const chordMode = settings.chordPlayback;
  const speed = settings.promptSpeed;
  const timing = useMemo(() => promptSpeedFactors(speed), [speed]);
  const dur = (sec: number) => sec * timing.dur;
  const gap = (ms: number) => Math.round(ms * timing.gap);

  // Station 3: interval question (deterministic per seed)
  const intervalQ = useMemo(
    () => makeIntervalQuestion({ seed: seed * 1000 + 3, rootMidi: 60, minSemitones: 0, maxSemitones: 12 }),
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

  // Station 1: note-name question (stable register)
  const noteQ = useMemo(
    () => makeNoteNameQuestion({ seed, minMidi: 60, maxMidi: 71, choiceCount: 4 }),
    [seed],
  );

  const [result, setResult] = useState<'idle' | 'correct' | 'wrong'>('idle');
  // Duolingo-ish “combo” streak for lessons: keep a run of correct answers.
  const [combo, setCombo] = useState(0);
  const [lastComboBonus, setLastComboBonus] = useState(0);
  const [highlighted, setHighlighted] = useState<Record<number, 'correct' | 'wrong' | 'active'>>({});

  const HEARTS = 3;

  // Test 3: interval recognition across a wider register (G2 and above).
  const [t3Index, setT3Index] = useState(0);
  const [t3Correct, setT3Correct] = useState(0);
  const [t3Wrong, setT3Wrong] = useState(0);
  const T3_TOTAL = 10;
  const T3_PASS = 8;
  const t3Q = useMemo(
    () =>
      makeIntervalLabelQuestion({
        seed: seed * 1000 + 1300 + t3Index,
        rootMinMidi: 43, // G2
        rootMaxMidi: 72, // C5 (keeps target <= C6 when +12)
        minSemitones: 0,
        maxSemitones: 12,
        choiceCount: 6,
      }),
    [seed, t3Index],
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
        minRootMidi: 43, // G2
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
        tonicMinMidi: 43, // G2
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
        tonicMinMidi: 43, // G2
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
  const S7_GOAL = 7;

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
        minMidi: 43, // G2
        maxMidi: 84, // C6
        choiceCount: 6,
      }),
    [seed, t1Index],
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

  // S1 micro-goal: require a few correct answers to mark as done (Duolingo-style “lesson set”).
  const [s1Correct, setS1Correct] = useState(0);
  const S1_GOAL = 8;

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
    setLastComboBonus(bonus);

    let p2 = applyStudyReward(progress, xpGain + bonus);

    if (id === 'S1_NOTES' && s1Correct + 1 >= S1_GOAL) {
      p2 = markStationDone(p2, id);
      p2 = applyStudyReward(p2, 8); // small completion bonus
    }

    // S3 completion handled in-station once warm-up + goal are met.

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

    setProgress(p2);
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
      setLastComboBonus(0);
      return;
    }

    const nextCorrect = s3Correct + 1;
    setS3Correct(nextCorrect);

    const willComplete = nextCorrect >= S3_GOAL && s3WarmupDone;
    rewardAndMaybeComplete(10, willComplete ? { stationDone: 'S3_INTERVALS', completionBonusXp: 10 } : undefined);
  }

  function chooseS3Derive(choice: IntervalLabel) {
    const ok = choice === s3DeriveQ.correct;
    setS3DeriveResult(ok ? 'correct' : 'wrong');

    if (!ok) {
      setCombo(0);
      setLastComboBonus(0);
      return;
    }

    setS3DeriveCorrect((n) => n + 1);
    setProgress(applyStudyReward(progress, 1));

    // advance
    setS3DeriveIndex((i) => i + 1);
    setS3DeriveResult('idle');
  }

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
      setLastComboBonus(0);
      addMistake({ kind: 'noteName', sourceStationId: id, midi: noteQ.midi });
      return;
    }

    setS1Correct((x) => x + 1);
    rewardAndMaybeComplete(2);
  }

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
      setLastComboBonus(0);
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
      setLastComboBonus(0);
      setHighlighted({ [s2Q.targetMidi]: 'correct' });
      addMistake({
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
    setSeed((x) => x + 1);
  }

  async function playPromptS4() {
    setResult('idle');
    // root then arpeggiated chord
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

  async function playPromptS5() {
    setResult('idle');
    // root then arpeggiated diatonic triad
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

  async function playPromptS6() {
    setResult('idle');
    // root then arpeggiated triad
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

  async function playPromptS7() {
    setResult('idle');
    setHighlighted({ [degreeQ.tonicMidi]: 'active' });
    await piano.playMidi(degreeQ.tonicMidi, { durationSec: dur(0.7), velocity: 0.9 });
    await new Promise((r) => setTimeout(r, gap(260)));
    setHighlighted({ [degreeQ.targetMidi]: 'active' });
    await piano.playMidi(degreeQ.targetMidi, { durationSec: dur(0.9), velocity: 0.92 });
    setHighlighted({});
  }

  async function chooseS7(choice: ScaleDegreeName) {
    const ok = choice === degreeQ.correct;
    setResult(ok ? 'correct' : 'wrong');

    if (!ok) {
      setCombo(0);
      setLastComboBonus(0);
      addMistake({ kind: 'scaleDegreeName', sourceStationId: id, key: degreeQ.key, degree: degreeQ.degree });
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
      setLastComboBonus(0);
      addMistake({
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
      addMistake({ kind: 'scaleDegreeName', sourceStationId: id, key: t4Q.key, degree: t4Q.degree });

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
      setProgress(p2);
      setResult(pass ? 'correct' : 'wrong');
      setT4Index(T4_TOTAL);
      return;
    }

    setProgress(p2);
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

  async function chooseT1(choice: string) {
    if (t1Index >= T1_TOTAL) return;
    if (t1Wrong >= HEARTS) return;

    const ok = t1Q.acceptedAnswers.includes(choice);
    setResult(ok ? 'correct' : 'wrong');
    setHighlighted({ [t1Q.midi]: ok ? 'correct' : 'wrong' });

    // Wrong: spend a life, record mistake, and advance.
    if (!ok) {
      addMistake({ kind: 'noteName', sourceStationId: id, midi: t1Q.midi });

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
      setProgress(p2);
      setResult(pass ? 'correct' : 'wrong');
      setT1Index(T1_TOTAL);
      return;
    }

    setProgress(p2);
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

  async function playPromptT2() {
    setResult('idle');
    setHighlighted({ [t2Q.tonicMidi]: 'active' });
    await piano.playMidi(t2Q.tonicMidi, { durationSec: dur(0.65), velocity: 0.9 });
    await new Promise((r) => setTimeout(r, gap(300)));
    setHighlighted({ [t2Q.targetMidi]: 'active' });
    await piano.playMidi(t2Q.targetMidi, { durationSec: dur(0.85), velocity: 0.9 });
    setHighlighted({});
  }

  async function playPromptT3() {
    setResult('idle');
    setHighlighted({});
    await playIntervalPrompt(t3Q.rootMidi, t3Q.targetMidi, { gapMs: gap(320), rootDurationSec: dur(0.7), targetDurationSec: dur(0.95) });
  }

  async function chooseT3(choice: IntervalLabel) {
    if (t3Index >= T3_TOTAL) return;
    if (t3Wrong >= HEARTS) return;

    const ok = choice === t3Q.correct;
    setResult(ok ? 'correct' : 'wrong');

    if (!ok) {
      addMistake({ kind: 'intervalLabel', sourceStationId: id, rootMidi: t3Q.rootMidi, semitones: t3Q.semitones });

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

    setT3Correct((n) => n + 1);

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
      setProgress(p2);
      setResult(pass ? 'correct' : 'wrong');
      setT3Index(T3_TOTAL);
      return;
    }

    setProgress(p2);
    setT3Index(nextIndex);
  }

  function resetT3() {
    setT3Index(0);
    setT3Correct(0);
    setT3Wrong(0);
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
      addMistake({ kind: 'triadQuality', sourceStationId: id, rootMidi: t5Q.rootMidi, quality: t5Q.quality });

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
      setProgress(p2);
      setResult(pass ? 'correct' : 'wrong');
      setT5Index(T5_TOTAL);
      return;
    }

    setProgress(p2);
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
      addMistake({ kind: 'triadQuality', sourceStationId: id, rootMidi: t6Q.chordMidis[0], quality: t6Q.quality });

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
      setProgress(p2);
      setResult(pass ? 'correct' : 'wrong');
      setT6Index(T6_TOTAL);
      return;
    }

    setProgress(p2);
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
      addMistake({
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
      setProgress(p2);
      setResult(pass ? 'correct' : 'wrong');
      setT7Index(T7_TOTAL);
      return;
    }

    setProgress(p2);
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
      addMistake({ kind: 'intervalLabel', sourceStationId: id, rootMidi: t8Q.tonicMidi, semitones: t8Q.semitones });

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
      setProgress(p2);
      setResult(pass ? 'correct' : 'wrong');
      setT8Index(T8_TOTAL);
      return;
    }

    setProgress(p2);
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
      addMistake({
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
      setProgress(p2);
      setResult(pass ? 'correct' : 'wrong');
      setT2Index(T2_TOTAL);
      return;
    }

    setProgress(p2);
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
      setLastComboBonus(0);
      addMistake({ kind: 'triadQuality', sourceStationId: id, rootMidi: triadQ.rootMidi, quality: triadQ.quality });
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
      setLastComboBonus(0);
      // Feed spaced review: diatonic triad quality is reviewable as a triad-quality item.
      addMistake({ kind: 'triadQuality', sourceStationId: id, rootMidi: diatonicQ.chordMidis[0], quality: diatonicQ.quality });
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
      setLastComboBonus(0);
      addMistake({ kind: 'functionFamily', sourceStationId: id, key: funcQ.key, degree: funcQ.degree, tonicMidi: funcQ.tonicMidi });
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
      if (id === 'S1_NOTES') void playPromptS1();
      else if (id === 'T1_NOTES') void playPromptT1();
      else if (id === 'S2_MAJOR_SCALE') {
        if (s2PatternDone) void playPromptS2();
      } else if (id === 'T2_MAJOR_SCALE') void playPromptT2();
      else if (id === 'S3_INTERVALS') void playPromptS3();
      else if (id === 'T3_INTERVALS') void playPromptT3();
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
      if (id === 'S1_NOTES') next();
      else if (id === 'T1_NOTES') resetT1();
      else if (id === 'S2_MAJOR_SCALE') newKeyS2();
      else if (id === 'T2_MAJOR_SCALE') resetT2();
      else if (id === 'S3_INTERVALS') next();
      else if (id === 'T3_INTERVALS') resetT3();
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
    onChoiceIndex: (idx) => {
      if (id === 'S1_NOTES') {
        const c = noteQ.choices[idx];
        if (c) void chooseS1(c);
        return;
      }
      if (id === 'T1_NOTES') {
        const c = t1Q.choices[idx];
        if (c) void chooseT1(c);
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
      if (id === 'T3_INTERVALS') {
        const c = t3Q.choices[idx];
        if (c) void chooseT3(c);
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

  if (!station) {
    return (
      <div className="card">
        <h1 className="title">Unknown station</h1>
        <Link className="linkBtn" to="/learn">Back</Link>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <div>
          <h1 className="title">{station.title}</h1>
          <p className="sub">{station.blurb}</p>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, opacity: 0.85 }}>
          <div>XP: {progress.xp}</div>
          <div>Streak: {progress.streakDays} day(s)</div>
          {stationMistakeCount > 0 ? (
            <div style={{ marginTop: 6 }}>
              <Link
                to={`/review?station=${id}`}
                style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2, opacity: stationMistakeDue > 0 ? 1 : 0.85 }}
              >
                Review: {stationMistakeDue > 0 ? `${stationMistakeDue} due` : `${stationMistakeCount} total`}
              </Link>
            </div>
          ) : null}
        </div>
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
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className={practice ? 'secondary' : 'ghost'} onClick={() => setPractice((p) => !p)}>
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

      {copy ? (
        <details style={{ marginTop: 10 }} open>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Lesson notes</summary>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9, lineHeight: 1.5 }}>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {copy.primer.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>

            {copy.tips?.length ? (
              <>
                <div style={{ marginTop: 10, fontWeight: 700, opacity: 0.95 }}>Tips</div>
                <ul style={{ margin: 0, paddingLeft: 18, marginTop: 6, opacity: 0.9 }}>
                  {copy.tips.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </details>
      ) : null}

      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span>Hotkeys: Space/Enter = Play/Hear • 1–9 = Answer • Backspace = Next/Restart</span>
        <span style={{ opacity: 0.55 }}>•</span>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <span>Speed</span>
          <select
            value={speed}
            onChange={(e) => {
              const v = e.target.value === 'slow' ? 'slow' : e.target.value === 'fast' ? 'fast' : 'normal';
              const next = { ...settings, promptSpeed: v } as typeof settings;
              setSettings(next);
              saveSettings(next);
            }}
          >
            {(['slow', 'normal', 'fast'] as const).map((s) => (
              <option key={s} value={s}>
                {promptSpeedLabel(s)}
              </option>
            ))}
          </select>
        </label>
        {station?.kind === 'lesson' && combo >= 2 ? (
          <span style={{ opacity: 0.9 }}>
            Combo: x{combo}
            {lastComboBonus > 0 ? <span style={{ opacity: 0.95 }}> (+{lastComboBonus} XP)</span> : null}
          </span>
        ) : null}
      </div>

      {!done || practice ? (
        id === 'S1_NOTES' ? (
        <>
          <div className="row">
            <button className="primary" onClick={playPromptS1}>Play note</button>
            <button className="ghost" onClick={next}>Next</button>
            <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
              Progress: {Math.min(s1Correct, S1_GOAL)}/{S1_GOAL}
            </div>
          </div>

          <div className={`result r_${result}`}>
            {result === 'idle' && 'Name the note. (Black keys can be sharp or flat.)'}
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
                startMidi={60}
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
              startMidi={36}
              octaves={4}
              onPress={(m) => piano.playMidi(m, { durationSec: dur(0.9), velocity: 0.9 })}
              highlighted={highlighted}
            />
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Tip: listen for the degree, but answer with correct spelling.
          </div>
        </>
      ) : id === 'T3_INTERVALS' ? (
        <>
          <TestHeader
            playLabel="Hear interval"
            onPlay={playPromptT3}
            onRestart={resetT3}
            reviewHref={(t3Index >= T3_TOTAL || t3Wrong >= HEARTS) && stationMistakeCount > 0 ? `/review?station=${id}` : undefined}
            reviewLabel={`Review mistakes (${stationMistakeCount})`}
            rightStatus={`Q: ${Math.min(t3Index + 1, T3_TOTAL)}/${T3_TOTAL} · Correct: ${t3Correct}/${T3_TOTAL} (need ${T3_PASS}) · Lives: ${Math.max(0, HEARTS - t3Wrong)}/${HEARTS}`}
          />

          <div className={`result r_${result}`}>
            {result === 'idle' && t3Q.prompt}
            {result === 'correct' &&
              (progress.stationDone['T3_INTERVALS'] ? 'Passed — nice. (+12 bonus XP)' : `Correct — +3 XP. (${intervalLongName(t3Q.correct)})`)}
            {result === 'wrong' &&
              (t3Wrong >= HEARTS
                ? `Out of lives. Score so far: ${t3Correct}/${T3_TOTAL}. Hit restart to try again${stationMistakeCount > 0 ? ' — or review your misses.' : '.'}`
                : t3Index + 1 >= T3_TOTAL
                  ? `Finished: ${t3Correct}/${T3_TOTAL}. Need ${T3_PASS}. Hit restart to try again.`
                  : `Not quite — it was ${t3Q.correct} (${intervalLongName(t3Q.correct)}).`)}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <ChoiceGrid choices={t3Q.choices} onChoose={chooseT3} />
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Tip: tests roam; lessons stay in a stable register.
          </div>
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
              <ChoiceGrid choices={s3DeriveQ.choices} onChoose={chooseS3Derive} />
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
            <button className="ghost" onClick={next}>Next</button>
            <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
              Progress: {Math.min(s3Correct, S3_GOAL)}/{S3_GOAL}
            </div>
          </div>

          <div className={`result r_${result}`}>
            {result === 'idle' &&
              (s3WarmupDone
                ? 'Tap the target note.'
                : `Finish the warm-up first (${Math.min(s3DeriveCorrect, S3_DERIVE_GOAL)}/${S3_DERIVE_GOAL}).`)}
            {result === 'correct' && (s3Correct + 1 >= S3_GOAL ? 'Nice — station complete. (+10 bonus XP)' : 'Correct — +10 XP.')}
            {result === 'wrong' && 'Not quite. Listen again.'}
          </div>

          <PianoKeyboard startMidi={48} octaves={2} onPress={onPressS3} highlighted={highlighted} />
        </>
      ) : id === 'S4_TRIADS' ? (
        <>
          <div className="row">
            <button className="primary" onClick={playPromptS4}>Hear chord</button>
            <button className="secondary" onClick={() => piano.playMidi(triadQ.rootMidi, { durationSec: dur(0.8), velocity: 0.9 })}>
              Root
            </button>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, opacity: 0.85 }}>
              <span>Playback</span>
              <select
                value={chordMode}
                onChange={(e) => {
                  const v = e.target.value === 'block' ? 'block' : 'arp';
                  const next = { ...settings, chordPlayback: v } as typeof settings;
                  setSettings(next);
                  saveSettings(next);
                }}
              >
                <option value="arp">Arp</option>
                <option value="block">Block</option>
              </select>
            </label>
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
            leftExtras={
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, opacity: 0.85 }}>
                <span>Playback</span>
                <select
                  value={chordMode}
                  onChange={(e) => {
                    const v = e.target.value === 'block' ? 'block' : 'arp';
                    const next = { ...settings, chordPlayback: v } as typeof settings;
                    setSettings(next);
                    saveSettings(next);
                  }}
                >
                  <option value="arp">Arp</option>
                  <option value="block">Block</option>
                </select>
              </label>
            }
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
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, opacity: 0.85 }}>
              <span>Playback</span>
              <select
                value={chordMode}
                onChange={(e) => {
                  const v = e.target.value === 'block' ? 'block' : 'arp';
                  const next = { ...settings, chordPlayback: v } as typeof settings;
                  setSettings(next);
                  saveSettings(next);
                }}
              >
                <option value="arp">Arp</option>
                <option value="block">Block</option>
              </select>
            </label>
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
            leftExtras={
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, opacity: 0.85 }}>
                <span>Playback</span>
                <select
                  value={chordMode}
                  onChange={(e) => {
                    const v = e.target.value === 'block' ? 'block' : 'arp';
                    const next = { ...settings, chordPlayback: v } as typeof settings;
                    setSettings(next);
                    saveSettings(next);
                  }}
                >
                  <option value="arp">Arp</option>
                  <option value="block">Block</option>
                </select>
              </label>
            }
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

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Tip: tests roam across a bigger register (G2+); lessons stay in a stable register.
          </div>
        </>
      ) : id === 'S6_FUNCTIONS' ? (
        <>
          <div className="row">
            <button className="primary" onClick={playPromptS6}>Hear chord</button>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, opacity: 0.85 }}>
              <span>Playback</span>
              <select
                value={chordMode}
                onChange={(e) => {
                  const v = e.target.value === 'block' ? 'block' : 'arp';
                  const next = { ...settings, chordPlayback: v } as typeof settings;
                  setSettings(next);
                  saveSettings(next);
                }}
              >
                <option value="arp">Arp</option>
                <option value="block">Block</option>
              </select>
            </label>
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
            leftExtras={
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, opacity: 0.85 }}>
                <span>Playback</span>
                <select
                  value={chordMode}
                  onChange={(e) => {
                    const v = e.target.value === 'block' ? 'block' : 'arp';
                    const next = { ...settings, chordPlayback: v } as typeof settings;
                    setSettings(next);
                    saveSettings(next);
                  }}
                >
                  <option value="arp">Arp</option>
                  <option value="block">Block</option>
                </select>
              </label>
            }
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
            Tip: listen for rest vs move vs tension. (Range is wider: G2+)
          </div>
        </>
      ) : id === 'S7_DEGREES' ? (
        <>
          <div className="row">
            <button className="primary" onClick={playPromptS7}>Hear degree</button>
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
          <div style={{ fontWeight: 700 }}>Already completed.</div>
          <div style={{ fontSize: 12, opacity: 0.9 }}>You can practice again for fun (XP still counts).</div>
        </div>
        <button className="primary" onClick={() => setPractice(true)}>
          Practice again
        </button>
      </div>
    )}

      {copy?.tips?.length ? (
        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.8, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 700, opacity: 0.9 }}>Tip</div>
          <ul style={{ margin: 6, paddingLeft: 18 }}>
            {copy.tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 14 }}>
        <Link className="linkBtn" to="/learn">Back</Link>
      </div>
    </div>
  );
}

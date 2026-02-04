import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { StationId, Progress } from '../lib/progress';
import { applyStudyReward, markStationDone } from '../lib/progress';
import { addMistake } from '../lib/mistakes';
import { STATIONS, nextStationId, isStationUnlocked } from '../lib/stations';
import { stationCopy } from '../lib/stationCopy';
import { loadSettings, saveSettings } from '../lib/settings';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { StaffNote } from '../components/StaffNote';
import { piano } from '../audio/piano';
import { makeIntervalQuestion, makeIntervalLabelQuestion, intervalLongName, type IntervalLabel } from '../exercises/interval';
import { makeNoteNameQuestion } from '../exercises/noteName';
import { makeMajorScaleSession, makeMajorScaleStepQuestion, makeMajorScaleTestQuestion } from '../exercises/majorScale';
import { makeTriadQualityQuestion, triadQualityIntervals, triadQualityLabel } from '../exercises/triad';
import { makeDiatonicTriadQualityQuestion } from '../exercises/diatonicTriad';
import { makeFunctionFamilyQuestion, type FunctionFamily } from '../exercises/functionFamily';
import { makeScaleDegreeNameQuestion, type ScaleDegreeName } from '../exercises/scaleDegree';

export function StationPage({ progress, setProgress }: { progress: Progress; setProgress: (p: Progress) => void }) {
  const { stationId } = useParams();
  const id = (stationId ?? 'S3_INTERVALS') as StationId;

  const station = STATIONS.find((s) => s.id === id);
  const done = progress.stationDone[id];
  const nextId = nextStationId(id);
  const nextUnlocked = nextId ? isStationUnlocked(progress, nextId) : false;

  const copy = stationCopy(id);

  const [seed, setSeed] = useState(1);

  const [settings, setSettings] = useState(() => loadSettings());
  const chordMode = settings.chordPlayback;

  // Station 3: interval question (deterministic per seed)
  const intervalQ = useMemo(
    () => makeIntervalQuestion({ seed: seed * 1000 + 3, rootMidi: 60, minSemitones: 0, maxSemitones: 12 }),
    [seed],
  );

  // Station 1: note-name question (stable register)
  const noteQ = useMemo(
    () => makeNoteNameQuestion({ seed, minMidi: 60, maxMidi: 71, choiceCount: 4 }),
    [seed],
  );

  const [result, setResult] = useState<'idle' | 'correct' | 'wrong'>('idle');
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

  // Station 5: diatonic triads inside a major key (stable register)
  const diatonicQ = useMemo(() => makeDiatonicTriadQualityQuestion({ seed: seed * 1000 + 5 }), [seed]);
  const [s5Correct, setS5Correct] = useState(0);
  const S5_GOAL = 7;

  // Station 6: chord function families (tonic / subdominant / dominant)
  const funcQ = useMemo(() => makeFunctionFamilyQuestion({ seed: seed * 1000 + 6 }), [seed]);
  const [s6Correct, setS6Correct] = useState(0);
  const S6_GOAL = 6;

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

  // S2 micro-goal: spell major scales in order (letters ascend; correct accidentals).
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

  function rewardAndMaybeComplete(xpGain: number, extra?: { stationDone?: StationId }) {
    let p2 = applyStudyReward(progress, xpGain);

    if (id === 'S1_NOTES' && s1Correct + 1 >= S1_GOAL) {
      p2 = markStationDone(p2, id);
      p2 = applyStudyReward(p2, 8); // small completion bonus
    }

    if (id === 'S3_INTERVALS') {
      p2 = markStationDone(p2, id);
    }

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

    if (extra?.stationDone) {
      p2 = markStationDone(p2, extra.stationDone);
    }

    setProgress(p2);
  }

  async function playPromptS3() {
    setResult('idle');
    setHighlighted({ [intervalQ.rootMidi]: 'active' });
    await piano.playMidi(intervalQ.rootMidi, { durationSec: 0.7, velocity: 0.9 });
    await new Promise((r) => setTimeout(r, 350));
    setHighlighted({ [intervalQ.targetMidi]: 'active' });
    await piano.playMidi(intervalQ.targetMidi, { durationSec: 0.9, velocity: 0.9 });
    setHighlighted({});
  }

  async function onPressS3(midi: number) {
    setHighlighted({ [midi]: 'active' });
    await piano.playMidi(midi, { durationSec: 0.9, velocity: 0.9 });
    const ok = midi === intervalQ.targetMidi;

    setResult(ok ? 'correct' : 'wrong');
    setHighlighted({ [intervalQ.targetMidi]: 'correct', ...(ok ? {} : { [midi]: 'wrong' }) });

    if (ok) {
      rewardAndMaybeComplete(10);
    }
  }

  async function playPromptS1() {
    setResult('idle');
    setHighlighted({ [noteQ.midi]: 'active' });
    await piano.playMidi(noteQ.midi, { durationSec: 0.9, velocity: 0.95 });
    setHighlighted({});
  }

  async function chooseS1(choice: string) {
    const ok = noteQ.acceptedAnswers.includes(choice);
    setResult(ok ? 'correct' : 'wrong');
    setHighlighted({ [noteQ.midi]: ok ? 'correct' : 'wrong' });

    if (!ok) {
      addMistake({ kind: 'noteName', sourceStationId: id, midi: noteQ.midi });
      return;
    }

    setS1Correct((x) => x + 1);
    rewardAndMaybeComplete(2);
  }

  async function playPromptS2() {
    setResult('idle');
    setHighlighted({ [s2Q.tonicMidi]: 'active' });
    await piano.playMidi(s2Q.tonicMidi, { durationSec: 0.65, velocity: 0.9 });
    await new Promise((r) => setTimeout(r, 250));
    setHighlighted({ [s2Q.targetMidi]: 'active' });
    await piano.playMidi(s2Q.targetMidi, { durationSec: 0.85, velocity: 0.9 });
    setHighlighted({});
  }

  async function chooseS2(choice: string) {
    const ok = choice === s2Q.correct;
    setResult(ok ? 'correct' : 'wrong');

    if (!ok) return;

    // +2 XP per correct step.
    rewardAndMaybeComplete(2);

    // advance to next scale note; if finished, count a completed scale and rotate key.
    if (s2Step >= 6) {
      setS2CompletedScales((n) => n + 1);
      // completion bonus for finishing the scale.
      let completionBonus = 6;
      const willHitGoal = s2CompletedScales + 1 >= S2_GOAL_SCALES;
      if (willHitGoal) completionBonus += 10;

      rewardAndMaybeComplete(completionBonus, willHitGoal ? { stationDone: 'S2_MAJOR_SCALE' } : undefined);

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
    await piano.playMidi(triadQ.rootMidi, { durationSec: 0.65, velocity: 0.9 });
    await new Promise((r) => setTimeout(r, 250));
    const active: Record<number, 'active'> = Object.fromEntries(triadQ.chordMidis.map((m) => [m, 'active'])) as Record<
      number,
      'active'
    >;
    setHighlighted(active);
    await piano.playChord(triadQ.chordMidis, { mode: chordMode, durationSec: 1.1, velocity: 0.92, gapMs: 130 });
    setHighlighted({});
  }

  async function playPromptS5() {
    setResult('idle');
    // root then arpeggiated diatonic triad
    const rootMidi = diatonicQ.chordMidis[0];
    setHighlighted({ [rootMidi]: 'active' });
    await piano.playMidi(rootMidi, { durationSec: 0.65, velocity: 0.9 });
    await new Promise((r) => setTimeout(r, 240));
    const active: Record<number, 'active'> = Object.fromEntries(diatonicQ.chordMidis.map((m) => [m, 'active'])) as Record<
      number,
      'active'
    >;
    setHighlighted(active);
    await piano.playChord(diatonicQ.chordMidis, { mode: chordMode, durationSec: 1.1, velocity: 0.92, gapMs: 130 });
    setHighlighted({});
  }

  async function playPromptS6() {
    setResult('idle');
    // root then arpeggiated triad
    const rootMidi = funcQ.chordMidis[0];
    setHighlighted({ [rootMidi]: 'active' });
    await piano.playMidi(rootMidi, { durationSec: 0.65, velocity: 0.9 });
    await new Promise((r) => setTimeout(r, 240));
    const active: Record<number, 'active'> = Object.fromEntries(funcQ.chordMidis.map((m) => [m, 'active'])) as Record<
      number,
      'active'
    >;
    setHighlighted(active);
    await piano.playChord(funcQ.chordMidis, { mode: chordMode, durationSec: 1.1, velocity: 0.92, gapMs: 130 });
    setHighlighted({});
  }

  async function playPromptS7() {
    setResult('idle');
    setHighlighted({ [degreeQ.tonicMidi]: 'active' });
    await piano.playMidi(degreeQ.tonicMidi, { durationSec: 0.7, velocity: 0.9 });
    await new Promise((r) => setTimeout(r, 260));
    setHighlighted({ [degreeQ.targetMidi]: 'active' });
    await piano.playMidi(degreeQ.targetMidi, { durationSec: 0.9, velocity: 0.92 });
    setHighlighted({});
  }

  async function chooseS7(choice: ScaleDegreeName) {
    const ok = choice === degreeQ.correct;
    setResult(ok ? 'correct' : 'wrong');

    if (!ok) return;

    setS7Correct((n) => n + 1);
    rewardAndMaybeComplete(3);
  }

  async function playPromptT4() {
    setResult('idle');
    setHighlighted({ [t4Q.tonicMidi]: 'active' });
    await piano.playMidi(t4Q.tonicMidi, { durationSec: 0.7, velocity: 0.9 });
    await new Promise((r) => setTimeout(r, 260));
    setHighlighted({ [t4Q.targetMidi]: 'active' });
    await piano.playMidi(t4Q.targetMidi, { durationSec: 0.9, velocity: 0.92 });
    setHighlighted({});
  }

  async function chooseT4(choice: ScaleDegreeName) {
    if (t4Index >= T4_TOTAL) return;
    if (t4Wrong >= HEARTS) return;

    const ok = choice === t4Q.correct;
    setResult(ok ? 'correct' : 'wrong');

    if (!ok) {
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
    setHighlighted({ [t1Q.midi]: 'active' });
    await piano.playMidi(t1Q.midi, { durationSec: 0.9, velocity: 0.95 });
    setHighlighted({});
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
    await piano.playMidi(t2Q.tonicMidi, { durationSec: 0.7, velocity: 0.9 });
    await new Promise((r) => setTimeout(r, 300));
    setHighlighted({ [t2Q.targetMidi]: 'active' });
    await piano.playMidi(t2Q.targetMidi, { durationSec: 0.9, velocity: 0.9 });
    setHighlighted({});
  }

  async function playPromptT3() {
    setResult('idle');
    setHighlighted({ [t3Q.rootMidi]: 'active' });
    await piano.playMidi(t3Q.rootMidi, { durationSec: 0.7, velocity: 0.9 });
    await new Promise((r) => setTimeout(r, 320));
    setHighlighted({ [t3Q.targetMidi]: 'active' });
    await piano.playMidi(t3Q.targetMidi, { durationSec: 0.95, velocity: 0.9 });
    setHighlighted({});
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
    const rootMidi = t5Q.chordMidis[0];
    setHighlighted({ [rootMidi]: 'active' });
    await piano.playMidi(rootMidi, { durationSec: 0.65, velocity: 0.9 });
    await new Promise((r) => setTimeout(r, 240));
    const active: Record<number, 'active'> = Object.fromEntries(t5Q.chordMidis.map((m) => [m, 'active'])) as Record<
      number,
      'active'
    >;
    setHighlighted(active);
    await piano.playChord(t5Q.chordMidis, { mode: chordMode, durationSec: 1.1, velocity: 0.92, gapMs: 130 });
    setHighlighted({});
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

  async function chooseT2(choice: string) {
    if (t2Index >= T2_TOTAL) return;
    if (t2Wrong >= HEARTS) return;

    const ok = choice === t2Q.correct;
    setResult(ok ? 'correct' : 'wrong');

    if (!ok) {
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
      }
      setProgress(p2);
      setResult(pass ? 'correct' : 'wrong');
      setT2Index(T2_TOTAL);
      return;
    }

    setProgress(p2);
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
      setHighlighted(correctHi);
      return;
    }

    setS6Correct((n) => n + 1);
    setHighlighted(correctHi);
    rewardAndMaybeComplete(5);
  }

  if (!station) {
    return (
      <div className="card">
        <h1 className="title">Unknown station</h1>
        <Link className="linkBtn" to="/">Back</Link>
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
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="linkBtn" to="/">Map</Link>
            {nextId && nextUnlocked ? <Link className="linkBtn" to={`/station/${nextId}`}>Next</Link> : null}
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
          </div>
        </details>
      ) : null}

      {id === 'S1_NOTES' ? (
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
            {noteQ.choices.map((c) => (
              <button key={c} className="secondary" onClick={() => chooseS1(c)}>
                {c}
              </button>
            ))}
          </div>

          <div className="row" style={{ gap: 14, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
            <StaffNote midi={noteQ.midi} label={noteQ.promptLabel} />
            <div style={{ flex: 1, minWidth: 240 }}>
              <PianoKeyboard
                startMidi={60}
                octaves={1}
                onPress={(m) => piano.playMidi(m, { durationSec: 0.9, velocity: 0.9 })}
                highlighted={highlighted}
              />
            </div>
          </div>
        </>
      ) : id === 'T1_NOTES' ? (
        <>
          <div className="row">
            <button className="primary" onClick={playPromptT1}>Play note</button>
            <button className="ghost" onClick={resetT1}>Restart</button>
            <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
              Q: {Math.min(t1Index + 1, T1_TOTAL)}/{T1_TOTAL} · Correct: {t1Correct}/{T1_TOTAL} (need {T1_PASS}) · Lives: {Math.max(0, HEARTS - t1Wrong)}/{HEARTS}
            </div>
          </div>

          <div className={`result r_${result}`}>
            {result === 'idle' && 'Test: name 10 notes (wider range). Need 8/10 to pass.'}
            {result === 'correct' &&
              (progress.stationDone['T1_NOTES']
                ? 'Passed — nice. (+12 bonus XP)'
                : `Correct — +3 XP. (${t1Q.promptLabel})`)}
            {result === 'wrong' &&
              (t1Index + 1 >= T1_TOTAL
                ? `Finished: ${t1Correct}/${T1_TOTAL}. Need ${T1_PASS}. Hit restart to try again.`
                : `Not quite — it was ${t1Q.promptLabel}.`)}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {t1Q.choices.map((c) => (
              <button key={c} className="secondary" onClick={() => chooseT1(c)}>
                {c}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 10 }}>
            <StaffNote midi={t1Q.midi} label={t1Q.promptLabel} />
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Tip: tests can roam across a bigger register; lessons stay in a stable register.
          </div>
        </>
      ) : id === 'T2_MAJOR_SCALE' ? (
        <>
          <div className="row">
            <button className="primary" onClick={playPromptT2}>Hear prompt</button>
            <button className="ghost" onClick={resetT2}>Restart</button>
            <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
              Q: {Math.min(t2Index + 1, T2_TOTAL)}/{T2_TOTAL} · Correct: {t2Correct}/{T2_TOTAL} (need {T2_PASS}) · Lives: {Math.max(0, HEARTS - t2Wrong)}/{HEARTS}
            </div>
          </div>

          <div className={`result r_${result}`}>
            {result === 'idle' && t2Q.prompt}
            {result === 'correct' &&
              (progress.stationDone['T2_MAJOR_SCALE'] ? 'Passed — nice. (+12 bonus XP)' : 'Correct — +3 XP.')}
            {result === 'wrong' &&
              (t2Index + 1 >= T2_TOTAL
                ? `Finished: ${t2Correct}/${T2_TOTAL}. Need ${T2_PASS}. Hit restart to try again.`
                : `Not quite — it was ${t2Q.correct}.`)}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {t2Q.choices.map((c) => (
              <button key={c} className="secondary" onClick={() => chooseT2(c)}>
                {c}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Tip: listen for the degree, but answer with correct spelling.
          </div>
        </>
      ) : id === 'T3_INTERVALS' ? (
        <>
          <div className="row">
            <button className="primary" onClick={playPromptT3}>Hear interval</button>
            <button className="ghost" onClick={resetT3}>Restart</button>
            <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
              Q: {Math.min(t3Index + 1, T3_TOTAL)}/{T3_TOTAL} · Correct: {t3Correct}/{T3_TOTAL} (need {T3_PASS}) · Lives: {Math.max(0, HEARTS - t3Wrong)}/{HEARTS}
            </div>
          </div>

          <div className={`result r_${result}`}>
            {result === 'idle' && t3Q.prompt}
            {result === 'correct' &&
              (progress.stationDone['T3_INTERVALS'] ? 'Passed — nice. (+12 bonus XP)' : `Correct — +3 XP. (${intervalLongName(t3Q.correct)})`)}
            {result === 'wrong' &&
              (t3Index + 1 >= T3_TOTAL
                ? `Finished: ${t3Correct}/${T3_TOTAL}. Need ${T3_PASS}. Hit restart to try again.`
                : `Not quite — it was ${t3Q.correct} (${intervalLongName(t3Q.correct)}).`)}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {t3Q.choices.map((c) => (
              <button key={c} className="secondary" onClick={() => chooseT3(c)}>
                {c}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Tip: tests roam; lessons stay in a stable register.
          </div>
        </>
      ) : id === 'S2_MAJOR_SCALE' ? (
        <>
          <div className="row">
            <button className="primary" onClick={playPromptS2}>Hear target step</button>
            <button
              className="secondary"
              onClick={() => piano.playMidi(s2Session.tonicMidi, { durationSec: 0.75, velocity: 0.9 })}
            >
              Tonic
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

          <div className={`result r_${result}`}>
            {result === 'idle' && s2Q.prompt}
            {result === 'correct' && 'Correct — +2 XP.'}
            {result === 'wrong' && `Not quite — next note is ${s2Q.correct}.`}
          </div>

          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 10 }}>
            So far: <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{s2ShownSoFar.join(' ')}</span>
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            {s2Q.choices.map((c) => (
              <button key={c} className="secondary" onClick={() => chooseS2(c)}>
                {c}
              </button>
            ))}
          </div>

          <PianoKeyboard
            startMidi={60}
            octaves={1}
            onPress={(m) => piano.playMidi(m, { durationSec: 0.9, velocity: 0.9 })}
            highlighted={highlighted}
          />
        </>
      ) : id === 'S3_INTERVALS' ? (
        <>
          <div className="row">
            <button className="primary" onClick={playPromptS3}>Play prompt</button>
            <button
              className="secondary"
              onClick={() => piano.playMidi(intervalQ.rootMidi, { durationSec: 0.9 })}
            >
              Root
            </button>
            <button className="ghost" onClick={next}>Next</button>
          </div>

          <div className={`result r_${result}`}>
            {result === 'idle' && 'Tap the target note.'}
            {result === 'correct' && 'Correct — +10 XP.'}
            {result === 'wrong' && 'Not quite. Listen again.'}
          </div>

          <PianoKeyboard startMidi={48} octaves={2} onPress={onPressS3} highlighted={highlighted} />
        </>
      ) : id === 'S4_TRIADS' ? (
        <>
          <div className="row">
            <button className="primary" onClick={playPromptS4}>Hear chord</button>
            <button className="secondary" onClick={() => piano.playMidi(triadQ.rootMidi, { durationSec: 0.8, velocity: 0.9 })}>
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
            {triadQ.choices.map((c) => (
              <button key={c} className="secondary" onClick={() => chooseS4(c)}>
                {triadQualityLabel(c)}
              </button>
            ))}
          </div>

          <PianoKeyboard
            startMidi={48}
            octaves={2}
            onPress={(m) => piano.playMidi(m, { durationSec: 0.9, velocity: 0.9 })}
            highlighted={highlighted}
          />
        </>
      ) : id === 'T5_TRIADS' ? (
        <>
          <div className="row">
            <button className="primary" onClick={playPromptT5}>Hear chord</button>
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
            <button className="ghost" onClick={resetT5}>Restart</button>
            <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
              Q: {Math.min(t5Index + 1, T5_TOTAL)}/{T5_TOTAL} · Correct: {t5Correct}/{T5_TOTAL} (need {T5_PASS}) · Lives: {Math.max(0, HEARTS - t5Wrong)}/{HEARTS}
            </div>
          </div>

          <div className={`result r_${result}`}>
            {result === 'idle' && 'Test: name 10 triad qualities by ear. Need 8/10 to pass.'}
            {result === 'correct' &&
              (progress.stationDone['T5_TRIADS'] ? 'Passed — nice. (+12 bonus XP)' : `Correct — +3 XP. (${triadQualityLabel(t5Q.quality)})`)}
            {result === 'wrong' &&
              (t5Index + 1 >= T5_TOTAL
                ? `Finished: ${t5Correct}/${T5_TOTAL}. Need ${T5_PASS}. Hit restart to try again.`
                : `Not quite — it was ${triadQualityLabel(t5Q.quality)}.`)}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {t5Q.choices.map((c) => (
              <button key={c} className="secondary" onClick={() => chooseT5(c)}>
                {triadQualityLabel(c)}
              </button>
            ))}
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
            {diatonicQ.choices.map((c) => (
              <button key={c} className="secondary" onClick={() => chooseS5(c)}>
                {triadQualityLabel(c)}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Hint: diatonic triad qualities in major are always: I ii iii IV V vi vii°.
          </div>

          <PianoKeyboard
            startMidi={48}
            octaves={2}
            onPress={(m) => piano.playMidi(m, { durationSec: 0.9, velocity: 0.9 })}
            highlighted={highlighted}
          />
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
            {funcQ.choices.map((c) => (
              <button key={c} className="secondary" onClick={() => chooseS6(c)}>
                {familyLabel(c)}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Quick map (major key): tonic = I iii vi · subdominant = ii IV · dominant = V vii°.
          </div>

          <PianoKeyboard
            startMidi={48}
            octaves={2}
            onPress={(m) => piano.playMidi(m, { durationSec: 0.9, velocity: 0.9 })}
            highlighted={highlighted}
          />
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
            {degreeQ.choices.map((c) => (
              <button key={c} className="secondary" onClick={() => chooseS7(c)}>
                {c}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Cheat sheet: 1 tonic · 2 supertonic · 3 mediant · 4 subdominant · 5 dominant · 6 submediant · 7 leading tone
          </div>
        </>
      ) : id === 'T4_DEGREES' ? (
        <>
          <div className="row">
            <button className="primary" onClick={playPromptT4}>Hear degree</button>
            <button className="ghost" onClick={resetT4}>Restart</button>
            <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
              Q: {Math.min(t4Index + 1, T4_TOTAL)}/{T4_TOTAL} · Correct: {t4Correct}/{T4_TOTAL} (need {T4_PASS}) · Lives: {Math.max(0, HEARTS - t4Wrong)}/{HEARTS}
            </div>
          </div>

          <div className={`result r_${result}`}>
            {result === 'idle' && t4Q.prompt}
            {result === 'correct' && (progress.stationDone['T4_DEGREES'] ? 'Passed — nice. (+12 bonus XP)' : 'Correct — +3 XP.')}
            {result === 'wrong' &&
              (t4Index + 1 >= T4_TOTAL
                ? `Finished: ${t4Correct}/${T4_TOTAL}. Need ${T4_PASS}. Hit restart to try again.`
                : `Not quite — it was ${t4Q.correct}.`)}
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {t4Q.choices.map((c) => (
              <button key={c} className="secondary" onClick={() => chooseT4(c)}>
                {c}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>
            Tip: tests can roam across a bigger register; lessons stay in a stable register.
          </div>
        </>
      ) : (
        <div className="result">Content for this station is next.</div>
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
        <Link className="linkBtn" to="/">Back to line</Link>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { StationId, Progress } from '../lib/progress';
import { applyStudyReward, markStationDone } from '../lib/progress';
import { STATIONS } from '../lib/stations';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { piano } from '../audio/piano';
import { makeIntervalQuestion } from '../exercises/interval';
import { makeNoteNameQuestion } from '../exercises/noteName';
import { makeMajorScaleSession, makeMajorScaleStepQuestion, makeMajorScaleTestQuestion } from '../exercises/majorScale';
import { makeTriadQualityQuestion, triadQualityIntervals, triadQualityLabel } from '../exercises/triad';
import { makeDiatonicTriadQualityQuestion } from '../exercises/diatonicTriad';

export function StationPage({ progress, setProgress }: { progress: Progress; setProgress: (p: Progress) => void }) {
  const { stationId } = useParams();
  const id = (stationId ?? 'S3_INTERVALS') as StationId;

  const station = STATIONS.find((s) => s.id === id);

  const [seed, setSeed] = useState(1);

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

  // Station 4: triad-quality question (stable register)
  const triadQ = useMemo(() => makeTriadQualityQuestion({ seed: seed * 1000 + 4 }), [seed]);
  const [s4Correct, setS4Correct] = useState(0);
  const S4_GOAL = 6;

  // Station 5: diatonic triads inside a major key (stable register)
  const diatonicQ = useMemo(() => makeDiatonicTriadQualityQuestion({ seed: seed * 1000 + 5 }), [seed]);
  const [s5Correct, setS5Correct] = useState(0);
  const S5_GOAL = 7;

  // Test 1: note names across a wider range (G2 and above).
  const [t1Index, setT1Index] = useState(0);
  const [t1Correct, setT1Correct] = useState(0);
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

    if (ok) {
      setS1Correct((x) => x + 1);
      rewardAndMaybeComplete(2);
    }
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
    await piano.playChord(triadQ.chordMidis, { mode: 'arp', durationSec: 1.1, velocity: 0.92, gapMs: 130 });
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
    await piano.playChord(diatonicQ.chordMidis, { mode: 'arp', durationSec: 1.1, velocity: 0.92, gapMs: 130 });
    setHighlighted({});
  }

  async function playPromptT1() {
    setResult('idle');
    setHighlighted({ [t1Q.midi]: 'active' });
    await piano.playMidi(t1Q.midi, { durationSec: 0.9, velocity: 0.95 });
    setHighlighted({});
  }

  async function chooseT1(choice: string) {
    const ok = t1Q.acceptedAnswers.includes(choice);
    setResult(ok ? 'correct' : 'wrong');
    setHighlighted({ [t1Q.midi]: ok ? 'correct' : 'wrong' });

    if (!ok) return;

    setT1Correct((n) => n + 1);

    // +3 XP per correct test item.
    let p2 = applyStudyReward(progress, 3);

    const nextIndex = t1Index + 1;
    if (nextIndex >= T1_TOTAL) {
      // finish: decide pass/fail based on *current* correct count
      const correct = t1Correct + 1;
      const pass = correct >= T1_PASS;
      if (pass) {
        p2 = applyStudyReward(p2, 12);
        p2 = markStationDone(p2, 'T1_NOTES');
      }
      setProgress(p2);
      setResult(pass ? 'correct' : 'wrong');
      return;
    }

    setProgress(p2);
    setT1Index(nextIndex);
  }

  function resetT1() {
    setT1Index(0);
    setT1Correct(0);
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

  async function chooseT2(choice: string) {
    const ok = choice === t2Q.correct;
    setResult(ok ? 'correct' : 'wrong');

    if (!ok) return;

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
      return;
    }

    setProgress(p2);
    setT2Index(nextIndex);
  }

  function resetT2() {
    setT2Index(0);
    setT2Correct(0);
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

          <PianoKeyboard
            startMidi={60}
            octaves={1}
            onPress={(m) => piano.playMidi(m, { durationSec: 0.9, velocity: 0.9 })}
            highlighted={highlighted}
          />
        </>
      ) : id === 'T1_NOTES' ? (
        <>
          <div className="row">
            <button className="primary" onClick={playPromptT1}>Play note</button>
            <button className="ghost" onClick={resetT1}>Restart</button>
            <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
              Q: {Math.min(t1Index + 1, T1_TOTAL)}/{T1_TOTAL} · Correct: {t1Correct}/{T1_TOTAL} (need {T1_PASS})
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
              Q: {Math.min(t2Index + 1, T2_TOTAL)}/{T2_TOTAL} · Correct: {t2Correct}/{T2_TOTAL} (need {T2_PASS})
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
      ) : id === 'S5_DIATONIC_TRIADS' ? (
        <>
          <div className="row">
            <button className="primary" onClick={playPromptS5}>Hear triad</button>
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
      ) : (
        <div className="result">Content for this station is next.</div>
      )}

      <div className="row" style={{ marginTop: 14 }}>
        <Link className="linkBtn" to="/">Back to line</Link>
      </div>
    </div>
  );
}

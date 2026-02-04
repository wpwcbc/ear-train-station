import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { StationId, Progress } from '../lib/progress';
import { applyStudyReward, markStationDone } from '../lib/progress';
import { STATIONS } from '../lib/stations';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { piano } from '../audio/piano';
import { makeIntervalQuestion } from '../exercises/interval';
import { makeNoteNameQuestion } from '../exercises/noteName';
import { makeMajorScaleSession, makeMajorScaleStepQuestion } from '../exercises/majorScale';

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
      ) : (
        <div className="result">Content for this station is next.</div>
      )}

      <div className="row" style={{ marginTop: 14 }}>
        <Link className="linkBtn" to="/">Back to line</Link>
      </div>
    </div>
  );
}

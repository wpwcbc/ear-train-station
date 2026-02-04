import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { StationId, Progress } from '../lib/progress';
import { applyStudyReward, markStationDone } from '../lib/progress';
import { STATIONS } from '../lib/stations';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { piano } from '../audio/piano';
import { makeIntervalQuestion } from '../exercises/interval';
import { makeNoteNameQuestion } from '../exercises/noteName';

export function StationPage({ progress, setProgress }: { progress: Progress; setProgress: (p: Progress) => void }) {
  const { stationId } = useParams();
  const id = (stationId ?? 'S3_INTERVALS') as StationId;

  const station = STATIONS.find((s) => s.id === id);

  const [seed, setSeed] = useState(1);

  // Station 3: interval question
  const intervalQ = useMemo(() => makeIntervalQuestion({ rootMidi: 60, minSemitones: 0, maxSemitones: 12 }), [seed]);

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

  function rewardAndMaybeComplete(xpGain: number) {
    let p2 = applyStudyReward(progress, xpGain);
    if (id === 'S1_NOTES' && s1Correct + 1 >= S1_GOAL) {
      p2 = markStationDone(p2, id);
      p2 = applyStudyReward(p2, 8); // small completion bonus
    }
    if (id === 'S3_INTERVALS') {
      p2 = markStationDone(p2, id);
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

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { StationId, Progress } from '../lib/progress';
import { applyStudyReward, markStationDone } from '../lib/progress';
import { STATIONS } from '../lib/stations';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { piano } from '../audio/piano';
import { makeIntervalQuestion } from '../exercises/interval';

export function StationPage({ progress, setProgress }: { progress: Progress; setProgress: (p: Progress) => void }) {
  const { stationId } = useParams();
  const id = (stationId ?? 'S3_INTERVALS') as StationId;

  const station = STATIONS.find((s) => s.id === id);

  // MVP: only Station 3 has real interaction today; others show “coming next”.
  const [seed, setSeed] = useState(1);
  const q = useMemo(() => makeIntervalQuestion({ rootMidi: 60, minSemitones: 0, maxSemitones: 12 }), [seed]);

  const [result, setResult] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [highlighted, setHighlighted] = useState<Record<number, 'correct' | 'wrong' | 'active'>>({});

  async function playPrompt() {
    setResult('idle');
    setHighlighted({ [q.rootMidi]: 'active' });
    await piano.playMidi(q.rootMidi, { durationSec: 0.7, velocity: 0.9 });
    await new Promise((r) => setTimeout(r, 350));
    setHighlighted({ [q.targetMidi]: 'active' });
    await piano.playMidi(q.targetMidi, { durationSec: 0.9, velocity: 0.9 });
    setHighlighted({});
  }

  async function onPress(midi: number) {
    setHighlighted({ [midi]: 'active' });
    await piano.playMidi(midi, { durationSec: 0.9, velocity: 0.9 });
    const ok = midi === q.targetMidi;

    setResult(ok ? 'correct' : 'wrong');
    setHighlighted({ [q.targetMidi]: 'correct', ...(ok ? {} : { [midi]: 'wrong' }) });

    if (ok) {
      // reward + station completion for this micro-lesson
      let p2 = applyStudyReward(progress, 10);
      p2 = markStationDone(p2, id);
      setProgress(p2);
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

      {id !== 'S3_INTERVALS' ? (
        <div className="result">
          Content for this station is next. For now, Station 3 proves the full loop.
        </div>
      ) : (
        <>
          <div className="row">
            <button className="primary" onClick={playPrompt}>Play prompt</button>
            <button className="secondary" onClick={() => piano.playMidi(q.rootMidi, { durationSec: 0.9 })}>Root</button>
            <button className="ghost" onClick={next}>Next</button>
          </div>

          <div className={`result r_${result}`}>
            {result === 'idle' && 'Tap the target note.'}
            {result === 'correct' && 'Correct — +10 XP.'}
            {result === 'wrong' && 'Not quite. Listen again.'}
          </div>

          <PianoKeyboard startMidi={48} octaves={2} onPress={onPress} highlighted={highlighted} />
        </>
      )}

      <div className="row" style={{ marginTop: 14 }}>
        <Link className="linkBtn" to="/">Back to line</Link>
      </div>
    </div>
  );
}

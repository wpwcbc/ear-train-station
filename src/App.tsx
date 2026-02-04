import { useMemo, useState } from 'react';
import './App.css';
import { PianoKeyboard } from './components/PianoKeyboard';
import { piano } from './audio/piano';
import { makeIntervalQuestion } from './exercises/interval';

type Result = 'idle' | 'correct' | 'wrong';

function App() {
  const [qSeed, setQSeed] = useState(1);
  const q = useMemo(() => makeIntervalQuestion({ rootMidi: 60, minSemitones: 0, maxSemitones: 12 }), [qSeed]);

  const [result, setResult] = useState<Result>('idle');
  const [highlighted, setHighlighted] = useState<Record<number, 'correct' | 'wrong' | 'active'>>({});

  async function playPrompt() {
    setResult('idle');
    setHighlighted({ [q.rootMidi]: 'active' });
    await piano.playMidi(q.rootMidi, { durationSec: 0.7, velocity: 0.9 });
    // slight delay then target
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
    setHighlighted({
      [q.targetMidi]: 'correct',
      ...(ok ? {} : { [midi]: 'wrong' }),
    });
  }

  function next() {
    setResult('idle');
    setHighlighted({});
    setQSeed((x) => x + 1);
  }

  return (
    <div className="app">
      <header className="topBar">
        <div className="brand">Ear Train Station</div>
        <div className="badge">MVP: Intervals</div>
      </header>

      <main className="main">
        <section className="card">
          <h1 className="title">Interval: hear the target note</h1>
          <p className="sub">We play a root, then a target. Tap the target on the keyboard.</p>

          <div className="row">
            <button className="primary" onClick={playPrompt}>Play prompt</button>
            <button className="secondary" onClick={() => piano.playMidi(q.rootMidi, { durationSec: 0.9 })}>Root</button>
            <button className="secondary" onClick={() => piano.playMidi(q.targetMidi, { durationSec: 0.9 })}>Target (debug)</button>
            <button className="ghost" onClick={next}>Next</button>
          </div>

          <div className={`result r_${result}`}>
            {result === 'idle' && 'Answer by tapping a key.'}
            {result === 'correct' && 'Correct.'}
            {result === 'wrong' && 'Not quite — try again or hit Next.'}
          </div>

          <PianoKeyboard startMidi={48} octaves={2} onPress={onPress} highlighted={highlighted} />

          <div className="meta">
            <div>Root MIDI: {q.rootMidi}</div>
            <div>Semitones: {q.semitones}</div>
            <div>Target MIDI: {q.targetMidi}</div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;

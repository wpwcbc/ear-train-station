import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Progress } from '../lib/progress';
import { applyStudyReward } from '../lib/progress';
import { loadMistakes, removeMistake, type Mistake } from '../lib/mistakes';
import { piano } from '../audio/piano';
import { makeNoteNameReviewQuestion } from '../exercises/noteName';
import { makeIntervalLabelReviewQuestion, intervalLongName, type IntervalLabel } from '../exercises/interval';
import { makeTriadQualityReviewQuestion, triadQualityLabel, type TriadQuality } from '../exercises/triad';

export function ReviewPage({ progress, setProgress }: { progress: Progress; setProgress: (p: Progress) => void }) {
  const [seed, setSeed] = useState(1);
  const [result, setResult] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [doneCount, setDoneCount] = useState(0);

  const mistakes = useMemo(() => loadMistakes(), [seed, doneCount]);
  const active = mistakes[0] as Mistake | undefined;

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

  async function playPrompt() {
    setResult('idle');
    if (!active) return;

    if (active.kind === 'noteName') {
      await piano.playMidi(active.midi, { durationSec: 0.9, velocity: 0.95 });
      return;
    }

    if (active.kind === 'intervalLabel') {
      await piano.playMidi(active.rootMidi, { durationSec: 0.7, velocity: 0.9 });
      await new Promise((r) => setTimeout(r, 320));
      await piano.playMidi(active.rootMidi + active.semitones, { durationSec: 0.95, velocity: 0.9 });
      return;
    }

    // triadQuality
    if (triadQ) {
      const rootMidi = triadQ.chordMidis[0];
      await piano.playMidi(rootMidi, { durationSec: 0.65, velocity: 0.9 });
      await new Promise((r) => setTimeout(r, 240));
      await piano.playChord(triadQ.chordMidis, { mode: 'arp', durationSec: 1.1, velocity: 0.92, gapMs: 130 });
    }
  }

  function markCorrect() {
    if (!active) return;
    removeMistake(active.id);
    setProgress(applyStudyReward(progress, 4));
    setResult('correct');
    setDoneCount((n) => n + 1);
    setSeed((x) => x + 1);
  }

  function markWrong() {
    setResult('wrong');
  }

  async function chooseNote(choice: string) {
    if (!noteQ || !active || active.kind !== 'noteName') return;
    const ok = noteQ.acceptedAnswers.includes(choice);
    if (ok) markCorrect();
    else markWrong();
  }

  async function chooseInterval(choice: IntervalLabel) {
    if (!ilQ || !active || active.kind !== 'intervalLabel') return;
    const ok = choice === ilQ.correct;
    if (ok) markCorrect();
    else markWrong();
  }

  async function chooseTriad(choice: TriadQuality) {
    if (!triadQ || !active || active.kind !== 'triadQuality') return;
    const ok = choice === triadQ.quality;
    if (ok) markCorrect();
    else markWrong();
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div>
          <h1 className="title">Review</h1>
          <p className="sub">Clear your mistakes. Small XP bonus for each cleared item.</p>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, opacity: 0.85 }}>
          <div>Queue: {mistakes.length}</div>
          <div>Cleared: {doneCount}</div>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="primary" disabled={!active} onClick={playPrompt}>
            Play
          </button>
          <button
            className="ghost"
            onClick={() => {
              setResult('idle');
              setSeed((x) => x + 1);
            }}
            disabled={!active}
          >
            Skip
          </button>
        </div>
        <Link className="linkBtn" to="/">
          Back
        </Link>
      </div>

      {!active ? (
        <div className="result r_idle">No mistakes queued. Go do a station and come back if you miss something.</div>
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

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>From: {active.sourceStationId}</div>
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

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>From: {active.sourceStationId}</div>
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

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>From: {active.sourceStationId}</div>
        </>
      ) : (
        <div className="result r_idle">This mistake type is not reviewable yet.</div>
      )}
    </div>
  );
}

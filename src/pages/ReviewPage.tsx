import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Progress } from '../lib/progress';
import { applyStudyReward } from '../lib/progress';
import { applyReviewResult, loadMistakes, snoozeMistake, updateMistake, type Mistake } from '../lib/mistakes';
import { loadSettings, saveSettings } from '../lib/settings';
import { piano } from '../audio/piano';
import { makeNoteNameReviewQuestion } from '../exercises/noteName';
import { makeIntervalLabelReviewQuestion, intervalLongName, type IntervalLabel } from '../exercises/interval';
import { makeTriadQualityReviewQuestion, triadQualityLabel, type TriadQuality } from '../exercises/triad';
import { makeScaleDegreeNameReviewQuestion, type ScaleDegreeName } from '../exercises/scaleDegree';
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

export function ReviewPage({ progress, setProgress }: { progress: Progress; setProgress: (p: Progress) => void }) {
  const [seed, setSeed] = useState(1);
  const [settings, setSettings] = useState(() => loadSettings());
  const chordMode = settings.chordPlayback;
  const [result, setResult] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [doneCount, setDoneCount] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [mistakes, setMistakes] = useState<Mistake[]>(() => loadMistakes());

  const due = useMemo(() => {
    return mistakes
      .filter((m) => (m.dueAt ?? 0) <= now)
      .sort((a, b) => (a.dueAt ?? a.addedAt) - (b.dueAt ?? b.addedAt) || b.addedAt - a.addedAt);
  }, [mistakes, now]);
  const active = due[0] as Mistake | undefined;

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
    return makeMajorScaleDegreeReviewQuestion({
      seed: seed * 1000 + 9041,
      key: active.key as any,
      degree: active.degree,
      choiceCount: 6,
    });
  }, [active, seed]);

  const ffQ = useMemo(() => {
    if (!active || active.kind !== 'functionFamily') return null;
    const key = active.key as (typeof MAJOR_KEYS)[number]['key'];
    return makeFunctionFamilyQuestion({
      seed: seed * 1000 + 905,
      key,
      degree: active.degree,
      tonicMidi: active.tonicMidi,
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

    if (active.kind === 'scaleDegreeName' && degQ) {
      await piano.playMidi(degQ.tonicMidi, { durationSec: 0.7, velocity: 0.9 });
      await new Promise((r) => setTimeout(r, 260));
      await piano.playMidi(degQ.targetMidi, { durationSec: 0.9, velocity: 0.92 });
      return;
    }

    if (active.kind === 'majorScaleDegree' && msQ) {
      await piano.playMidi(msQ.tonicMidi, { durationSec: 0.7, velocity: 0.9 });
      await new Promise((r) => setTimeout(r, 260));
      await piano.playMidi(msQ.targetMidi, { durationSec: 0.9, velocity: 0.92 });
      return;
    }

    if (active.kind === 'functionFamily' && ffQ) {
      const rootMidi = ffQ.chordMidis[0];
      await piano.playMidi(rootMidi, { durationSec: 0.65, velocity: 0.9 });
      await new Promise((r) => setTimeout(r, 240));
      await piano.playChord(ffQ.chordMidis, { mode: chordMode, durationSec: 1.1, velocity: 0.92, gapMs: 130 });
      return;
    }

    // triadQuality
    if (triadQ) {
      const rootMidi = triadQ.chordMidis[0];
      await piano.playMidi(rootMidi, { durationSec: 0.65, velocity: 0.9 });
      await new Promise((r) => setTimeout(r, 240));
      await piano.playChord(triadQ.chordMidis, { mode: chordMode, durationSec: 1.1, velocity: 0.92, gapMs: 130 });
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

    let cleared = false;
    updateMistake(active.id, (m) => {
      const next = applyReviewResult(m, outcome, Date.now());
      cleared = next == null;
      return next;
    });

    if (outcome === 'correct' && cleared) {
      setProgress(applyStudyReward(progress, 4));
      setResult('correct');
      setDoneCount((n) => n + 1);
    } else {
      setResult(outcome);
    }

    // Force a fresh localStorage read.
    refresh();
  }

  async function chooseNote(choice: string) {
    if (!noteQ || !active || active.kind !== 'noteName') return;
    const ok = noteQ.acceptedAnswers.includes(choice);
    applyOutcome(ok ? 'correct' : 'wrong');
  }

  async function chooseInterval(choice: IntervalLabel) {
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
  const totalCount = mistakes.length;
  const nextDue = useMemo(() => {
    if (mistakes.length === 0) return null;
    let min = Number.POSITIVE_INFINITY;
    for (const m of mistakes) min = Math.min(min, m.dueAt ?? m.addedAt);
    return Number.isFinite(min) ? min : null;
  }, [mistakes]);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div>
          <h1 className="title">Review</h1>
          <p className="sub">Spaced review of missed items. Clear an item with 2 correct reviews in a row.</p>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, opacity: 0.85 }}>
          <div>
            Due: {dueCount} / {totalCount}
          </div>
          <div>Cleared: {doneCount}</div>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="primary" disabled={!active} onClick={playPrompt}>
            Play
          </button>
          {active?.kind === 'triadQuality' || active?.kind === 'functionFamily' ? (
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
          ) : null}
          <button className="ghost" onClick={refresh}>
            Refresh
          </button>
          <button
            className="ghost"
            onClick={() => {
              if (!active) return;
              // Push it back a bit so the next due item can surface.
              snoozeMistake(active.id, 5 * 60_000);
              refresh();
            }}
            disabled={!active}
            title="Skip this item for now (snooze 5 minutes)"
          >
            Skip
          </button>
        </div>
        <Link className="linkBtn" to="/">
          Back
        </Link>
      </div>

      {!active ? (
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
            From: {active.sourceStationId} • Streak: {active.correctStreak}/2
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
            From: {active.sourceStationId} • Streak: {active.correctStreak}/2
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

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
            From: {active.sourceStationId} • Streak: {active.correctStreak}/2
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
            From: {active.sourceStationId} • Streak: {active.correctStreak}/2
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
            From: {active.sourceStationId} • Streak: {active.correctStreak}/2
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
            From: {active.sourceStationId} • Streak: {active.correctStreak}/2
          </div>
        </>
      ) : (
        <div className="result r_idle">This mistake type is not reviewable yet.</div>
      )}
    </div>
  );
}

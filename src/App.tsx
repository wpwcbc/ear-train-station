import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { NavShell } from './components/NavShell';
import { FocusShell } from './components/FocusShell';
import { LearnSectionsPage } from './pages/LearnSectionsPage';
import { SectionDetailPage } from './pages/SectionDetailPage';
import { SectionExamPage } from './pages/SectionExamPage';
import { StationPage } from './pages/StationPage';
import { LeaguePage } from './pages/LeaguePage';
import { PracticePage } from './pages/PracticePage';
import { ReviewPage } from './pages/ReviewPage';
import { QuestsPage } from './pages/QuestsPage';
import { ProfilePage } from './pages/ProfilePage';
import { loadProgress, saveProgress, type Progress } from './lib/progress';
import { resumePianoContextBestEffort, warmupPiano } from './audio/piano';
import './App.css';

function App() {
  const [progress, setProgress] = useState<Progress>(() => loadProgress());

  const [pwaNeedRefresh, setPwaNeedRefresh] = useState(false);
  const [pwaOfflineReady, setPwaOfflineReady] = useState(false);
  const [doPwaUpdate, setDoPwaUpdate] = useState<null | (() => void)>(null);

  const [audioWarming, setAudioWarming] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [audioWarmError, setAudioWarmError] = useState<string | null>(null);
  const [audioLocked, setAudioLocked] = useState<string | null>(null);

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  useEffect(() => {
    // Register SW and surface updates explicitly (don’t auto-reload during a lesson).
    const updateSW = registerSW({
      onNeedRefresh() {
        setPwaNeedRefresh(true);
      },
      onOfflineReady() {
        setPwaOfflineReady(true);
        window.setTimeout(() => setPwaOfflineReady(false), 4000);
      },
    });

    setDoPwaUpdate(() => () => void updateSW(true));
  }, []);

  useEffect(() => {
    // Best-effort audio warmup on the first user gesture.
    // This helps avoid first-note latency on mobile, and also primes SW runtime caching.
    let didWarm = false;
    let clearLockedTimer: number | null = null;

    function armWarmupOnce() {
      // On some iOS/Safari builds, pointer events can be flaky; cover touchstart too.
      window.addEventListener('pointerdown', doWarm, { once: true, passive: true });
      window.addEventListener('touchstart', doWarm, { once: true, passive: true });
      window.addEventListener('keydown', doWarm, { once: true });
    }

    async function doWarm() {
      if (didWarm) return;
      didWarm = true;
      if (clearLockedTimer != null) window.clearTimeout(clearLockedTimer);
      setAudioLocked(null);
      setAudioWarmError(null);
      setAudioWarming(true);
      try {
        await warmupPiano();
        setAudioReady(true);
        window.setTimeout(() => setAudioReady(false), 2500);
      } catch (e) {
        setAudioWarmError(e instanceof Error ? e.message : 'Audio warmup failed');
        window.setTimeout(() => setAudioWarmError(null), 4000);
      } finally {
        setAudioWarming(false);
      }
    }

    function onAudioLocked(ev: Event) {
      const ce = ev as CustomEvent<{ reason?: string }>;
      const reason = ce?.detail?.reason;
      setAudioLocked(reason ?? 'Sound is paused — tap anywhere to enable');

      // Keep the warning visible long enough that the user actually sees it.
      // (If they interact, doWarm() clears it immediately.)
      if (clearLockedTimer != null) window.clearTimeout(clearLockedTimer);
      clearLockedTimer = window.setTimeout(() => setAudioLocked(null), 15000);

      // If audio gets re-locked later (Safari/iOS quirks), arm one more warmup attempt
      // on the next user gesture.
      didWarm = false;
      armWarmupOnce();
    }

    async function onVisibilityOrPageShow() {
      // On iOS/Safari, returning from background can leave WebAudio suspended.
      // Try a best-effort resume; if it fails, piano.ts will dispatch kuku:audiolocked
      // which re-arms warmup on the next gesture.
      if (document.visibilityState !== 'visible') return;
      await resumePianoContextBestEffort();
    }

    window.addEventListener('kuku:audiolocked', onAudioLocked);
    document.addEventListener('visibilitychange', onVisibilityOrPageShow);
    window.addEventListener('pageshow', onVisibilityOrPageShow);
    armWarmupOnce();

    return () => {
      window.removeEventListener('kuku:audiolocked', onAudioLocked);
      document.removeEventListener('visibilitychange', onVisibilityOrPageShow);
      window.removeEventListener('pageshow', onVisibilityOrPageShow);
      window.removeEventListener('pointerdown', doWarm);
      window.removeEventListener('touchstart', doWarm);
      window.removeEventListener('keydown', doWarm);
      if (clearLockedTimer != null) window.clearTimeout(clearLockedTimer);
    };
  }, []);

  return (
    <>
      <Routes>
        {/* Main app tabs */}
        <Route element={<NavShell />}>
          <Route index element={<Navigate to="/learn" replace />} />

          <Route path="/learn" element={<LearnSectionsPage progress={progress} />} />
          <Route
            path="/learn/section/:sectionId"
            element={<SectionDetailPage progress={progress} setProgress={setProgress} />}
          />

          <Route path="/practice" element={<PracticePage progress={progress} />} />
          <Route path="/quests" element={<QuestsPage progress={progress} />} />
          <Route path="/leaderboard" element={<LeaguePage progress={progress} />} />
          <Route path="/profile" element={<ProfilePage progress={progress} setProgress={setProgress} />} />
        </Route>

        {/* Focus Mode (no side/bottom nav; knowledge-only surface + ⚙️) */}
        <Route element={<FocusShell />}>
          <Route path="/lesson/:stationId" element={<StationPage progress={progress} setProgress={setProgress} />} />
          <Route path="/learn/section/:sectionId/exam" element={<SectionExamPage progress={progress} />} />
          <Route path="/review" element={<ReviewPage progress={progress} setProgress={setProgress} />} />
        </Route>

        <Route path="*" element={<Navigate to="/learn" replace />} />
      </Routes>

      {/* PWA status + update prompt (kept subtle; doesn’t add a new settings surface) */}
      {pwaOfflineReady ? <div className="pwaToast">Ready for offline</div> : null}

      {/* Audio warmup status (on first user gesture) */}
      {audioWarming ? <div className="pwaToast">Loading piano…</div> : null}
      {audioReady ? <div className="pwaToast">Piano ready</div> : null}
      {audioWarmError ? <div className="pwaToast pwaToast--warn">Audio: {audioWarmError}</div> : null}
      {audioLocked ? <div className="pwaToast pwaToast--warn">{audioLocked}</div> : null}

      {pwaNeedRefresh ? (
        <div className="pwaToast pwaToast--action">
          <div className="pwaToast__text">Update available</div>
          <button
            className="pwaToast__btn"
            onClick={() => {
              setPwaNeedRefresh(false);
              doPwaUpdate?.();
            }}
          >
            Reload
          </button>
          <button className="pwaToast__btn pwaToast__btn--ghost" onClick={() => setPwaNeedRefresh(false)}>
            Later
          </button>
        </div>
      ) : null}
    </>
  );
}

export default App;

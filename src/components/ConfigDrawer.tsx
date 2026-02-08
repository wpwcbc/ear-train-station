import { useEffect, useMemo, useState } from 'react';
import type { Progress } from '../lib/progress';
import { defaultProgress, loadProgress, saveProgress } from '../lib/progress';
import { defaultSettings, loadSettings, saveSettings, type Settings } from '../lib/settings';
import {
  clearPianoSoundfontCache,
  getPianoContextState,
  getPianoSoundfontCacheMeta,
  getPianoSoundfontCacheSizeBytes,
  getPianoSoundfontCacheStatus,
  prefetchPianoSoundfonts,
  warmupPiano,
} from '../audio/piano';

function clamp01(n: number) {
  if (Number.isNaN(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function ConfigDrawer(props: {
  open: boolean;
  onClose: () => void;
  progress: Progress;
  setProgress: (p: Progress) => void;
}) {
  const [draft, setDraft] = useState<Settings>(() => loadSettings());

  const [audioState, setAudioState] = useState<ReturnType<typeof getPianoContextState>>(() => getPianoContextState());
  const [audioDetail, setAudioDetail] = useState<string | null>(null);
  const [audioEnabling, setAudioEnabling] = useState(false);

  const [offlinePiano, setOfflinePiano] = useState<{ cached: number; total: number } | null>(null);
  const [offlinePianoBytes, setOfflinePianoBytes] = useState<number | null>(null);
  const [storageEstimate, setStorageEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [storagePersistent, setStoragePersistent] = useState<boolean | null>(null);
  const [storagePersisting, setStoragePersisting] = useState(false);
  const [offlineUpdatedAtMs, setOfflineUpdatedAtMs] = useState<number | null>(null);
  const [offlineDownloading, setOfflineDownloading] = useState(false);
  const [offlineDetail, setOfflineDetail] = useState<string | null>(null);

  // Whenever it opens, reload latest settings.
  useEffect(() => {
    if (!props.open) return;
    setDraft(loadSettings());
    setAudioState(getPianoContextState());
    setAudioDetail(null);
    setOfflineDetail(null);

    void (async () => {
      const st = await getPianoSoundfontCacheStatus();
      setOfflinePiano({ cached: st.cached, total: st.total });
      setOfflinePianoBytes(await getPianoSoundfontCacheSizeBytes());

      try {
        const est = await (navigator as unknown as { storage?: { estimate?: () => Promise<{ usage?: number; quota?: number }> } })
          .storage?.estimate?.();
        if (typeof est?.usage === 'number' && typeof est?.quota === 'number') setStorageEstimate({ usage: est.usage, quota: est.quota });
        else setStorageEstimate(null);
      } catch {
        setStorageEstimate(null);
      }

      try {
        const persisted = await (
          navigator as unknown as { storage?: { persisted?: () => Promise<boolean> } }
        ).storage?.persisted?.();
        if (typeof persisted === 'boolean') setStoragePersistent(persisted);
        else setStoragePersistent(null);
      } catch {
        setStoragePersistent(null);
      }

      const meta = getPianoSoundfontCacheMeta();
      setOfflineUpdatedAtMs(meta?.updatedAtMs ?? null);
    })();
  }, [props.open]);

  // While open, keep audio state fresh (and capture "audio locked" reasons).
  useEffect(() => {
    if (!props.open) return;

    const t = window.setInterval(() => setAudioState(getPianoContextState()), 500);

    function onAudioLocked(ev: Event) {
      const ce = ev as CustomEvent<{ reason?: string }>;
      const reason = ce?.detail?.reason;
      setAudioDetail(reason ?? 'Sound is paused — tap anywhere to enable');
      setAudioState(getPianoContextState());
    }

    window.addEventListener('kuku:audiolocked', onAudioLocked);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('kuku:audiolocked', onAudioLocked);
    };
  }, [props.open]);

  // Allow Esc to close.
  useEffect(() => {
    if (!props.open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') props.onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [props.open, props.onClose]);

  const hotkeys = useMemo(
    () => [
      { k: 'Space / Enter', v: 'Primary action (usually Play)' },
      { k: 'Backspace', v: 'Secondary action (usually Restart / Next)' },
      { k: '1..9', v: 'Pick an answer choice' },
      { k: 'Esc', v: 'Close this panel' },
    ],
    [],
  );

  if (!props.open) return null;

  const s = draft ?? defaultSettings();

  const goal = clamp(props.progress.dailyGoalXp || 20, 5, 200);

  function setDailyGoalXp(nextGoal: number) {
    props.setProgress({ ...props.progress, dailyGoalXp: clamp(nextGoal, 5, 200) });
  }

  function resetEverything() {
    const ok = window.confirm('Reset all progress, XP, streak, and settings? This cannot be undone.');
    if (!ok) return;

    const p = defaultProgress();
    props.setProgress(p);
    saveProgress(p);

    const next = defaultSettings();
    setDraft(next);
    saveSettings(next);

    // Local review queue / study history (best-effort)
    try {
      localStorage.removeItem('ets_mistakes_v1');
      localStorage.removeItem('ets_mistakes_v2');
      localStorage.removeItem('ets_progress_v1');
      localStorage.removeItem('ets_progress_v2');
      localStorage.removeItem('ets_settings_v1');
      localStorage.removeItem('ets_settings_v2');
      localStorage.removeItem('ets_settings_v3');
      localStorage.removeItem('ets_settings_v4');
    } catch {
      // ignore
    }

    // Re-load once to ensure normalization for today happens.
    props.setProgress(loadProgress());
    setDraft(loadSettings());
  }

  function commit(next: Settings) {
    setDraft(next);
    saveSettings(next);
  }

  return (
    <div className="configOverlay" role="dialog" aria-modal="true" aria-label="Settings">
      <button className="configBackdrop" aria-label="Close settings" onClick={props.onClose} />
      <div className="configPanel">
        <div className="configHeader">
          <div>
            <div className="configTitle">Settings</div>
            <div className="configSub">Knowledge-only surfaces — tweak knobs here.</div>
          </div>
          <button className="ghost" onClick={props.onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="configSection">
          <div className="configH">Motivation</div>

          <div className="configRow">
            <span className="configLabel">Daily goal</span>
            <span className="configValue" style={{ justifySelf: 'start' }}>
              {goal} XP
            </span>
            <div className="configActions" style={{ flexWrap: 'wrap' }}>
              {[10, 20, 30, 50].map((g) => (
                <button key={g} className={g === goal ? 'primary' : 'ghost'} onClick={() => setDailyGoalXp(g)}>
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
            Tip: main pages are read-only; tweak this in ⚙️.
          </div>
        </div>

        <div className="configSection">
          <div className="configH">Audio</div>

          <div className="configRow">
            <span className="configLabel">Status</span>
            <span className="configValue" style={{ justifySelf: 'start' }}>
              {audioState}
              {audioDetail ? ` — ${audioDetail}` : null}
            </span>
            <button
              className="ghost"
              disabled={audioEnabling}
              onClick={async () => {
                setAudioEnabling(true);
                setAudioDetail(null);
                try {
                  await warmupPiano();
                  setAudioState(getPianoContextState());
                } catch (e) {
                  setAudioDetail(e instanceof Error ? e.message : 'Audio warmup failed');
                } finally {
                  setAudioEnabling(false);
                }
              }}
              aria-label="Enable audio"
            >
              {audioEnabling ? 'Enabling…' : 'Enable'}
            </button>
          </div>

          <div className="configRow">
            <span className="configLabel">Offline piano</span>
            <span className="configValue" style={{ justifySelf: 'start' }}>
              {offlinePiano ? `${offlinePiano.cached}/${offlinePiano.total} cached` : 'Checking…'}
              {typeof offlinePianoBytes === 'number' ? ` · ${(offlinePianoBytes / (1024 * 1024)).toFixed(1)} MB` : ''}
              {storageEstimate ? ` · storage ${(storageEstimate.usage / (1024 * 1024)).toFixed(0)} / ${(storageEstimate.quota / (1024 * 1024)).toFixed(0)} MB` : ''}
              {typeof storagePersistent === 'boolean' ? ` · ${storagePersistent ? 'persistent' : 'evictable'}` : ''}
              {offlineUpdatedAtMs ? ` · updated ${new Date(offlineUpdatedAtMs).toLocaleDateString()} ${new Date(offlineUpdatedAtMs).toLocaleTimeString()}` : ''}
              {offlineDetail ? ` — ${offlineDetail}` : null}
            </span>
            <div className="configActions">
              <button
                className="ghost"
                disabled={
                  storagePersisting ||
                  storagePersistent === true ||
                  !(
                    (navigator as unknown as { storage?: { persist?: () => Promise<boolean> } }).storage?.persist
                  )
                }
                onClick={async () => {
                  setStoragePersisting(true);
                  setOfflineDetail('Keeping offline data…');
                  try {
                    const ok = await (
                      navigator as unknown as { storage?: { persist?: () => Promise<boolean>; persisted?: () => Promise<boolean> } }
                    ).storage?.persist?.();
                    const persisted = await (
                      navigator as unknown as { storage?: { persisted?: () => Promise<boolean> } }
                    ).storage?.persisted?.();
                    if (typeof persisted === 'boolean') setStoragePersistent(persisted);
                    if (ok) setOfflineDetail('Marked as persistent');
                    else setOfflineDetail('May still be evictable on this browser');
                  } catch (e) {
                    setOfflineDetail(e instanceof Error ? e.message : 'Persist request failed');
                  } finally {
                    window.setTimeout(() => setOfflineDetail(null), 5000);
                    setStoragePersisting(false);
                  }
                }}
                aria-label="Request persistent storage"
              >
                {storagePersistent === true ? 'Kept' : storagePersisting ? 'Keeping…' : 'Keep'}
              </button>

              <button
                className="ghost"
                disabled={offlineDownloading}
                onClick={async () => {
                  setOfflineDownloading(true);
                  setOfflineDetail('Downloading…');
                  try {
                    const r = await prefetchPianoSoundfonts();
                    const st = await getPianoSoundfontCacheStatus();
                    setOfflinePiano({ cached: st.cached, total: st.total });
                    setOfflinePianoBytes(await getPianoSoundfontCacheSizeBytes());
                    const meta = getPianoSoundfontCacheMeta();
                    setOfflineUpdatedAtMs(meta?.updatedAtMs ?? null);
                    if (r.errors.length) setOfflineDetail(`${r.errors.length} failed`);
                    else setOfflineDetail('Ready');
                  } catch (e) {
                    setOfflineDetail(e instanceof Error ? e.message : 'Download failed');
                  } finally {
                    window.setTimeout(() => setOfflineDetail(null), 4000);
                    setOfflineDownloading(false);
                  }
                }}
                aria-label="Download piano for offline"
              >
                {offlineDownloading ? 'Working…' : 'Download'}
              </button>

              <button
                className="ghost"
                disabled={offlineDownloading || !offlinePiano || offlinePiano.cached === 0}
                onClick={async () => {
                  setOfflineDownloading(true);
                  setOfflineDetail('Updating…');
                  try {
                    const r = await prefetchPianoSoundfonts({ force: true });
                    const st = await getPianoSoundfontCacheStatus();
                    setOfflinePiano({ cached: st.cached, total: st.total });
                    setOfflinePianoBytes(await getPianoSoundfontCacheSizeBytes());
                    const meta = getPianoSoundfontCacheMeta();
                    setOfflineUpdatedAtMs(meta?.updatedAtMs ?? null);
                    if (r.errors.length) setOfflineDetail(`${r.errors.length} failed`);
                    else setOfflineDetail('Updated');
                  } catch (e) {
                    setOfflineDetail(e instanceof Error ? e.message : 'Update failed');
                  } finally {
                    window.setTimeout(() => setOfflineDetail(null), 4000);
                    setOfflineDownloading(false);
                  }
                }}
                aria-label="Re-download piano payloads"
              >
                Update
              </button>

              <button
                className="ghost"
                disabled={offlineDownloading || !offlinePiano || offlinePiano.cached === 0}
                onClick={async () => {
                  setOfflineDownloading(true);
                  setOfflineDetail('Clearing…');
                  try {
                    await clearPianoSoundfontCache();
                    const st = await getPianoSoundfontCacheStatus();
                    setOfflinePiano({ cached: st.cached, total: st.total });
                    setOfflinePianoBytes(await getPianoSoundfontCacheSizeBytes());
                    setOfflineUpdatedAtMs(null);
                    setOfflineDetail('Cleared');
                  } catch (e) {
                    setOfflineDetail(e instanceof Error ? e.message : 'Clear failed');
                  } finally {
                    window.setTimeout(() => setOfflineDetail(null), 4000);
                    setOfflineDownloading(false);
                  }
                }}
                aria-label="Clear offline piano cache"
              >
                Clear
              </button>
            </div>
          </div>

          <label className="configRow">
            <span className="configLabel">Master volume</span>
            <input
              className="configSlider"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.volume}
              onChange={(e) => commit({ ...s, volume: clamp01(Number.parseFloat(e.target.value)) })}
            />
            <span className="configValue">{Math.round(s.volume * 100)}%</span>
          </label>

          <label className="configRow">
            <span className="configLabel">Prompt speed</span>
            <select
              className="configSelect"
              value={s.promptSpeed}
              onChange={(e) => {
                const v = e.target.value;
                commit({ ...s, promptSpeed: v === 'slow' || v === 'fast' ? v : 'normal' });
              }}
            >
              <option value="slow">Slow</option>
              <option value="normal">Normal</option>
              <option value="fast">Fast</option>
            </select>
          </label>
        </div>

        <div className="configSection">
          <div className="configH">Data</div>
          <div className="configRow">
            <span className="configLabel">Reset everything</span>
            <span className="configValue" style={{ justifySelf: 'start' }}>
              Fresh start (progress + settings)
            </span>
            <button className="ghost" onClick={resetEverything} aria-label="Reset everything">
              Reset
            </button>
          </div>
        </div>

        <div className="configSection">
          <div className="configH">Hotkeys</div>
          <div className="configHotkeys">
            {hotkeys.map((h) => (
              <div key={h.k} className="configHotkey">
                <div className="configKey">{h.k}</div>
                <div className="configDesc">{h.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="configFooter">
          <div style={{ opacity: 0.75, fontSize: 12 }}>Saved automatically</div>
          <button className="primary" onClick={props.onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

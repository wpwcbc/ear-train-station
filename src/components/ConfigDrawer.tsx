import { useEffect, useMemo, useState } from 'react';
import { defaultSettings, loadSettings, saveSettings, type Settings } from '../lib/settings';
import {
  clearPianoSoundfontCache,
  getPianoContextState,
  getPianoSoundfontCacheStatus,
  prefetchPianoSoundfonts,
  warmupPiano,
} from '../audio/piano';

function clamp01(n: number) {
  if (Number.isNaN(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

export function ConfigDrawer(props: { open: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<Settings>(() => loadSettings());

  const [audioState, setAudioState] = useState<ReturnType<typeof getPianoContextState>>(() => getPianoContextState());
  const [audioDetail, setAudioDetail] = useState<string | null>(null);
  const [audioEnabling, setAudioEnabling] = useState(false);

  const [offlinePiano, setOfflinePiano] = useState<{ cached: number; total: number } | null>(null);
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
              {offlineDetail ? ` — ${offlineDetail}` : null}
            </span>
            <div className="configActions">
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
                  setOfflineDetail('Clearing…');
                  try {
                    await clearPianoSoundfontCache();
                    const st = await getPianoSoundfontCacheStatus();
                    setOfflinePiano({ cached: st.cached, total: st.total });
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

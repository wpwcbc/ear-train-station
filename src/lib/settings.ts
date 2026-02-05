export type Settings = {
  version: 3;
  /** How to present chords in ear-training prompts. */
  chordPlayback: 'arp' | 'block';
  /** Overall prompt timing. */
  promptSpeed: 'slow' | 'normal' | 'fast';
  /** Master volume multiplier applied to prompt playback. */
  volume: number; // 0..1
};

type SettingsV1 = {
  version: 1;
  chordPlayback: 'arp' | 'block';
};

type SettingsV2 = {
  version: 2;
  chordPlayback: 'arp' | 'block';
  promptSpeed: 'slow' | 'normal' | 'fast';
};

const KEY = 'ets_settings_v3';
const KEY_V2 = 'ets_settings_v2';
const KEY_V1 = 'ets_settings_v1';

export function defaultSettings(): Settings {
  return { version: 3, chordPlayback: 'arp', promptSpeed: 'normal', volume: 0.9 };
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0.9;
  return Math.max(0, Math.min(1, n));
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      if (parsed?.version !== 3) return defaultSettings();

      const chordPlayback: Settings['chordPlayback'] = parsed.chordPlayback === 'block' ? 'block' : 'arp';
      const promptSpeed: Settings['promptSpeed'] =
        parsed.promptSpeed === 'slow' || parsed.promptSpeed === 'fast' ? parsed.promptSpeed : 'normal';
      const volume = clamp01(typeof parsed.volume === 'number' ? parsed.volume : 0.9);
      return { ...defaultSettings(), ...parsed, chordPlayback, promptSpeed, volume } as Settings;
    }

    // Migrate v2 → v3
    const v2raw = localStorage.getItem(KEY_V2);
    if (v2raw) {
      const v2 = JSON.parse(v2raw) as Partial<SettingsV2>;
      const chordPlayback: Settings['chordPlayback'] = v2.chordPlayback === 'block' ? 'block' : 'arp';
      const promptSpeed: Settings['promptSpeed'] =
        v2.promptSpeed === 'slow' || v2.promptSpeed === 'fast' ? v2.promptSpeed : 'normal';
      const migrated = { ...defaultSettings(), chordPlayback, promptSpeed };
      saveSettings(migrated);
      return migrated;
    }

    // Migrate v1 → v3
    const v1raw = localStorage.getItem(KEY_V1);
    if (v1raw) {
      const v1 = JSON.parse(v1raw) as Partial<SettingsV1>;
      const chordPlayback: Settings['chordPlayback'] = v1.chordPlayback === 'block' ? 'block' : 'arp';
      const migrated = { ...defaultSettings(), chordPlayback };
      saveSettings(migrated);
      return migrated;
    }

    return defaultSettings();
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

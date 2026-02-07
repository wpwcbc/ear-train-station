export type Settings = {
  version: 4;
  /** Overall prompt timing. */
  promptSpeed: 'slow' | 'normal' | 'fast';
  /** Master volume multiplier applied to prompt playback. */
  volume: number; // 0..1
};

type SettingsV2 = {
  version: 2;
  chordPlayback: 'arp' | 'block';
  promptSpeed: 'slow' | 'normal' | 'fast';
};

type SettingsV3 = {
  version: 3;
  chordPlayback: 'arp' | 'block';
  promptSpeed: 'slow' | 'normal' | 'fast';
  volume: number;
};

const KEY = 'ets_settings_v4';
const KEY_V3 = 'ets_settings_v3';
const KEY_V2 = 'ets_settings_v2';
const KEY_V1 = 'ets_settings_v1';

export function defaultSettings(): Settings {
  return { version: 4, promptSpeed: 'normal', volume: 0.9 };
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0.9;
  return Math.max(0, Math.min(1, n));
}

function normalizePromptSpeed(v: unknown): Settings['promptSpeed'] {
  return v === 'slow' || v === 'fast' ? v : 'normal';
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      if (parsed?.version !== 4) return defaultSettings();
      const promptSpeed = normalizePromptSpeed(parsed.promptSpeed);
      const volume = clamp01(typeof parsed.volume === 'number' ? parsed.volume : 0.9);
      return { ...defaultSettings(), ...parsed, promptSpeed, volume } as Settings;
    }

    // Migrate v3 → v4 (drop chordPlayback)
    const v3raw = localStorage.getItem(KEY_V3);
    if (v3raw) {
      const v3 = JSON.parse(v3raw) as Partial<SettingsV3>;
      const migrated: Settings = {
        ...defaultSettings(),
        promptSpeed: normalizePromptSpeed(v3.promptSpeed),
        volume: clamp01(typeof v3.volume === 'number' ? v3.volume : 0.9),
      };
      saveSettings(migrated);
      return migrated;
    }

    // Migrate v2 → v4
    const v2raw = localStorage.getItem(KEY_V2);
    if (v2raw) {
      const v2 = JSON.parse(v2raw) as Partial<SettingsV2>;
      const migrated: Settings = {
        ...defaultSettings(),
        promptSpeed: normalizePromptSpeed(v2.promptSpeed),
      };
      saveSettings(migrated);
      return migrated;
    }

    // Migrate v1 → v4
    const v1raw = localStorage.getItem(KEY_V1);
    if (v1raw) {
      const migrated = defaultSettings();
      saveSettings(migrated);
      return migrated;
    }

    return defaultSettings();
  } catch {
    return defaultSettings();
  }
}

export const SETTINGS_EVENT = 'ets_settings_changed';

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
  // storage events don't fire in the same tab; emit a local event for reactive UIs.
  try {
    window.dispatchEvent(new Event(SETTINGS_EVENT));
  } catch {
    // no-op (SSR/tests)
  }
}

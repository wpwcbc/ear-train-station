export type Settings = {
  version: 6;
  /** Overall prompt timing. */
  promptSpeed: 'slow' | 'normal' | 'fast';
  /** Master volume multiplier applied to prompt playback. */
  volume: number; // 0..1
  /**
   * Optional key primer used on some lesson-style functional prompts (e.g. S7 scale degrees):
   * a quick tonic-triad outline before the target.
   * (Deliberately not used in tests/exams by default.)
   */
  playKeyPrimer: boolean;
  /**
   * Lessons-only: if you miss a Twist item, allow one immediate retry before we reveal the answer and move on.
   * (Never applies to standalone tests/exams.)
   */
  lessonRetryOnce: boolean;
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

type SettingsV4 = {
  version: 4;
  promptSpeed: Settings['promptSpeed'];
  volume: number;
};

type SettingsV5 = {
  version: 5;
  promptSpeed: Settings['promptSpeed'];
  volume: number;
  playKeyPrimer: boolean;
};

const KEY = 'ets_settings_v6';
const KEY_V5 = 'ets_settings_v5';
const KEY_V4 = 'ets_settings_v4';
const KEY_V3 = 'ets_settings_v3';
const KEY_V2 = 'ets_settings_v2';
const KEY_V1 = 'ets_settings_v1';

export function defaultSettings(): Settings {
  return { version: 6, promptSpeed: 'normal', volume: 0.9, playKeyPrimer: true, lessonRetryOnce: false };
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
      if (parsed?.version !== 6) return defaultSettings();
      const promptSpeed = normalizePromptSpeed(parsed.promptSpeed);
      const volume = clamp01(typeof parsed.volume === 'number' ? parsed.volume : 0.9);
      const playKeyPrimer = typeof parsed.playKeyPrimer === 'boolean' ? parsed.playKeyPrimer : true;
      const lessonRetryOnce = typeof parsed.lessonRetryOnce === 'boolean' ? parsed.lessonRetryOnce : false;
      return { ...defaultSettings(), ...parsed, promptSpeed, volume, playKeyPrimer, lessonRetryOnce } as Settings;
    }

    // Migrate v5 → v6 (add lessonRetryOnce)
    const v5raw = localStorage.getItem(KEY_V5);
    if (v5raw) {
      const v5 = JSON.parse(v5raw) as Partial<SettingsV5>;
      const migrated: Settings = {
        ...defaultSettings(),
        promptSpeed: normalizePromptSpeed(v5.promptSpeed),
        volume: clamp01(typeof v5.volume === 'number' ? v5.volume : 0.9),
        playKeyPrimer: typeof v5.playKeyPrimer === 'boolean' ? v5.playKeyPrimer : true,
        lessonRetryOnce: false,
      };
      saveSettings(migrated);
      return migrated;
    }

    // Migrate v4 → v6 (add playKeyPrimer + lessonRetryOnce)
    const v4raw = localStorage.getItem(KEY_V4);
    if (v4raw) {
      const v4 = JSON.parse(v4raw) as Partial<SettingsV4>;
      const migrated: Settings = {
        ...defaultSettings(),
        promptSpeed: normalizePromptSpeed(v4.promptSpeed),
        volume: clamp01(typeof v4.volume === 'number' ? v4.volume : 0.9),
        playKeyPrimer: true,
        lessonRetryOnce: false,
      };
      saveSettings(migrated);
      return migrated;
    }

    // Migrate v3 → v6 (drop chordPlayback)
    const v3raw = localStorage.getItem(KEY_V3);
    if (v3raw) {
      const v3 = JSON.parse(v3raw) as Partial<SettingsV3>;
      const migrated: Settings = {
        ...defaultSettings(),
        promptSpeed: normalizePromptSpeed(v3.promptSpeed),
        volume: clamp01(typeof v3.volume === 'number' ? v3.volume : 0.9),
        playKeyPrimer: true,
        lessonRetryOnce: false,
      };
      saveSettings(migrated);
      return migrated;
    }

    // Migrate v2 → v6
    const v2raw = localStorage.getItem(KEY_V2);
    if (v2raw) {
      const v2 = JSON.parse(v2raw) as Partial<SettingsV2>;
      const migrated: Settings = {
        ...defaultSettings(),
        promptSpeed: normalizePromptSpeed(v2.promptSpeed),
        playKeyPrimer: true,
        lessonRetryOnce: false,
      };
      saveSettings(migrated);
      return migrated;
    }

    // Migrate v1 → v6
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

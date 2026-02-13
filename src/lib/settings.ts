export type Settings = {
  version: 10;
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
  /**
   * Intervals (tests/exams/drills): after a miss, replay the correct interval and allow one immediate retest of the same question.
   * (Designed for skill-building without turning tests into infinite loops.)
   */
  intervalRetryOnce: boolean;
  /**
   * Interval prompt style.
   * - melodic: root then target
   * - harmonic: both notes together
   */
  intervalPromptMode: 'melodic' | 'harmonic';
  /**
   * Harmonic interval helper: when in harmonic mode, also play a quick melodic version after.
   * (Some trainers do this to help the ear “lock in” the distance.)
   */
  intervalHarmonicAlsoMelodic: boolean;
  /** Delay (ms) before the melodic replay when Harmonic helper is enabled. */
  intervalHarmonicHelperDelayMs: number; // ms
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

const KEY = 'ets_settings_v10';
const KEY_V9 = 'ets_settings_v9';
const KEY_V8 = 'ets_settings_v8';
const KEY_V7 = 'ets_settings_v7';
const KEY_V6 = 'ets_settings_v6';
const KEY_V5 = 'ets_settings_v5';
const KEY_V4 = 'ets_settings_v4';
const KEY_V3 = 'ets_settings_v3';
const KEY_V2 = 'ets_settings_v2';
const KEY_V1 = 'ets_settings_v1';

export function defaultSettings(): Settings {
  return {
    version: 10,
    promptSpeed: 'normal',
    volume: 0.9,
    playKeyPrimer: true,
    lessonRetryOnce: false,
    intervalRetryOnce: false,
    intervalPromptMode: 'melodic',
    intervalHarmonicAlsoMelodic: false,
    intervalHarmonicHelperDelayMs: 260,
  };
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
      if (parsed?.version != 10) return defaultSettings();
      const promptSpeed = normalizePromptSpeed(parsed.promptSpeed);
      const volume = clamp01(typeof parsed.volume === 'number' ? parsed.volume : 0.9);
      const playKeyPrimer = typeof parsed.playKeyPrimer === 'boolean' ? parsed.playKeyPrimer : true;
      const lessonRetryOnce = typeof parsed.lessonRetryOnce === 'boolean' ? parsed.lessonRetryOnce : false;
      const intervalRetryOnce = typeof parsed.intervalRetryOnce === 'boolean' ? parsed.intervalRetryOnce : false;
      const intervalPromptMode = parsed.intervalPromptMode === 'harmonic' ? 'harmonic' : 'melodic';
      const intervalHarmonicAlsoMelodic = typeof parsed.intervalHarmonicAlsoMelodic === 'boolean' ? parsed.intervalHarmonicAlsoMelodic : false;
      const intervalHarmonicHelperDelayMs = (
        typeof parsed.intervalHarmonicHelperDelayMs === 'number' && parsed.intervalHarmonicHelperDelayMs >= 0 && parsed.intervalHarmonicHelperDelayMs <= 1200
      )
        ? Math.round(parsed.intervalHarmonicHelperDelayMs)
        : 260;
      return {
        ...defaultSettings(),
        ...parsed,
        promptSpeed,
        volume,
        playKeyPrimer,
        lessonRetryOnce,
        intervalRetryOnce,
        intervalPromptMode,
        intervalHarmonicAlsoMelodic,
        intervalHarmonicHelperDelayMs,
      } as Settings;
    }

    // Migrate v9 → v10 (add intervalHarmonicHelperDelayMs)
    const v9raw = localStorage.getItem(KEY_V9);
    if (v9raw) {
      const v9 = JSON.parse(v9raw) as Partial<Omit<Settings, 'version' | 'intervalHarmonicHelperDelayMs'> & { version: 9 }>;
      const migrated: Settings = {
        ...defaultSettings(),
        promptSpeed: normalizePromptSpeed(v9.promptSpeed),
        volume: clamp01(typeof v9.volume === 'number' ? v9.volume : 0.9),
        playKeyPrimer: typeof v9.playKeyPrimer === 'boolean' ? v9.playKeyPrimer : true,
        lessonRetryOnce: typeof v9.lessonRetryOnce === 'boolean' ? v9.lessonRetryOnce : false,
        intervalRetryOnce: typeof v9.intervalRetryOnce === 'boolean' ? v9.intervalRetryOnce : false,
        intervalPromptMode: v9.intervalPromptMode === 'harmonic' ? 'harmonic' : 'melodic',
        intervalHarmonicAlsoMelodic: typeof v9.intervalHarmonicAlsoMelodic === 'boolean' ? v9.intervalHarmonicAlsoMelodic : false,
        intervalHarmonicHelperDelayMs: 260,
      };
      saveSettings(migrated);
      return migrated;
    }

    // Migrate v8 → v9 (add intervalHarmonicAlsoMelodic)
    const v8raw = localStorage.getItem(KEY_V8);
    if (v8raw) {
      const v8 = JSON.parse(v8raw) as Partial<Omit<Settings, 'version' | 'intervalHarmonicAlsoMelodic'> & { version: 8 }>;
      const migrated: Settings = {
        ...defaultSettings(),
        promptSpeed: normalizePromptSpeed(v8.promptSpeed),
        volume: clamp01(typeof v8.volume === 'number' ? v8.volume : 0.9),
        playKeyPrimer: typeof v8.playKeyPrimer === 'boolean' ? v8.playKeyPrimer : true,
        lessonRetryOnce: typeof v8.lessonRetryOnce === 'boolean' ? v8.lessonRetryOnce : false,
        intervalRetryOnce: typeof v8.intervalRetryOnce === 'boolean' ? v8.intervalRetryOnce : false,
        intervalPromptMode: v8.intervalPromptMode === 'harmonic' ? 'harmonic' : 'melodic',
        intervalHarmonicAlsoMelodic: false,
      };
      saveSettings(migrated);
      return migrated;
    }

    // Migrate v7 → v8 (add intervalPromptMode)
    const v7raw = localStorage.getItem(KEY_V7);
    if (v7raw) {
      const v7 = JSON.parse(v7raw) as Partial<Omit<Settings, 'version' | 'intervalPromptMode' | 'intervalHarmonicAlsoMelodic'> & { version: 7 }>;
      const migrated: Settings = {
        ...defaultSettings(),
        promptSpeed: normalizePromptSpeed(v7.promptSpeed),
        volume: clamp01(typeof v7.volume === 'number' ? v7.volume : 0.9),
        playKeyPrimer: typeof v7.playKeyPrimer === 'boolean' ? v7.playKeyPrimer : true,
        lessonRetryOnce: typeof v7.lessonRetryOnce === 'boolean' ? v7.lessonRetryOnce : false,
        intervalRetryOnce: typeof v7.intervalRetryOnce === 'boolean' ? v7.intervalRetryOnce : false,
        intervalPromptMode: 'melodic',
        intervalHarmonicAlsoMelodic: false,
      };
      saveSettings(migrated);
      return migrated;
    }

    // Migrate v6 → v7 (add intervalRetryOnce)
    const v6raw = localStorage.getItem(KEY_V6);
    if (v6raw) {
      const v6 = JSON.parse(v6raw) as Partial<Settings>;
      const migrated: Settings = {
        ...defaultSettings(),
        promptSpeed: normalizePromptSpeed(v6.promptSpeed),
        volume: clamp01(typeof v6.volume === 'number' ? v6.volume : 0.9),
        playKeyPrimer: typeof v6.playKeyPrimer === 'boolean' ? v6.playKeyPrimer : true,
        lessonRetryOnce: typeof v6.lessonRetryOnce === 'boolean' ? v6.lessonRetryOnce : false,
        intervalRetryOnce: false,
        intervalPromptMode: 'melodic',
      };
      saveSettings(migrated);
      return migrated;
    }

    // Migrate v5 → v7
    const v5raw = localStorage.getItem(KEY_V5);
    if (v5raw) {
      const v5 = JSON.parse(v5raw) as Partial<SettingsV5>;
      const migrated: Settings = {
        ...defaultSettings(),
        promptSpeed: normalizePromptSpeed(v5.promptSpeed),
        volume: clamp01(typeof v5.volume === 'number' ? v5.volume : 0.9),
        playKeyPrimer: typeof v5.playKeyPrimer === 'boolean' ? v5.playKeyPrimer : true,
        lessonRetryOnce: false,
        intervalRetryOnce: false,
        intervalPromptMode: 'melodic',
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
        intervalRetryOnce: false,
        intervalPromptMode: 'melodic',
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
        intervalRetryOnce: false,
        intervalPromptMode: 'melodic',
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
        intervalRetryOnce: false,
        intervalPromptMode: 'melodic',
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

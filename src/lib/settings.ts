export type Settings = {
  version: 2;
  /** How to present chords in ear-training prompts. */
  chordPlayback: 'arp' | 'block';
  /** Overall prompt timing. */
  promptSpeed: 'slow' | 'normal' | 'fast';
};

type SettingsV1 = {
  version: 1;
  chordPlayback: 'arp' | 'block';
};

const KEY = 'ets_settings_v2';
const KEY_V1 = 'ets_settings_v1';

export function defaultSettings(): Settings {
  return { version: 2, chordPlayback: 'arp', promptSpeed: 'normal' };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      if (parsed?.version !== 2) return defaultSettings();

      const chordPlayback: Settings['chordPlayback'] = parsed.chordPlayback === 'block' ? 'block' : 'arp';
      const promptSpeed: Settings['promptSpeed'] =
        parsed.promptSpeed === 'slow' || parsed.promptSpeed === 'fast' ? parsed.promptSpeed : 'normal';
      return { ...defaultSettings(), ...parsed, chordPlayback, promptSpeed } as Settings;
    }

    // Migrate v1 → v2
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

export type Settings = {
  version: 1;
  /** How to present chords in ear-training prompts. */
  chordPlayback: 'arp' | 'block';
};

const KEY = 'ets_settings_v1';

export function defaultSettings(): Settings {
  return { version: 1, chordPlayback: 'arp' };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as Partial<Settings>;
    if (parsed?.version !== 1) return defaultSettings();

    const chordPlayback = parsed.chordPlayback === 'block' ? 'block' : 'arp';
    return { ...defaultSettings(), ...parsed, chordPlayback } as Settings;
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

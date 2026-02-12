import './PianoKeyboard.css';

type Props = {
  startMidi?: number; // inclusive
  octaves?: number;
  onPress: (midi: number) => void;
  highlighted?: Record<number, 'correct' | 'wrong' | 'active'>;
  // Optional range guardrail (visual + disables clicks)
  minMidi?: number;
  maxMidi?: number;
};

const WHITE_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);

function isWhite(pc: number) {
  return WHITE_PCS.has(((pc % 12) + 12) % 12);
}

export function PianoKeyboard({ startMidi = 48, octaves = 2, onPress, highlighted, minMidi, maxMidi }: Props) {
  const keys: { midi: number; white: boolean; pc: number }[] = [];
  const count = octaves * 12 + 1; // include top root
  for (let i = 0; i < count; i++) {
    const midi = startMidi + i;
    const pc = midi % 12;
    keys.push({ midi, pc, white: isWhite(pc) });
  }

  const whiteKeys = keys.filter((k) => k.white);

  // Map black keys to the white-key index they sit "after".
  const blackKeys = keys
    .filter((k) => !k.white)
    .map((k) => {
      const prevWhites = keys.filter((x) => x.white && x.midi < k.midi).length - 1;
      return { ...k, anchorWhiteIndex: Math.max(prevWhites, 0) };
    });

  return (
    <div className="pianoWrap">
      <div className="whiteRow">
        {whiteKeys.map((k) => {
          const state = highlighted?.[k.midi];
          const disabled = (minMidi != null && k.midi < minMidi) || (maxMidi != null && k.midi > maxMidi);
          return (
            <button
              key={k.midi}
              className={`whiteKey ${disabled ? 'k_disabled' : ''} ${state ? `k_${state}` : ''}`}
              onClick={() => onPress(k.midi)}
              disabled={disabled}
              aria-label={`midi-${k.midi}`}
            />
          );
        })}

        {blackKeys.map((k) => {
          const state = highlighted?.[k.midi];
          const disabled = (minMidi != null && k.midi < minMidi) || (maxMidi != null && k.midi > maxMidi);
          return (
            <button
              key={k.midi}
              className={`blackKey ${disabled ? 'k_disabled' : ''} ${state ? `k_${state}` : ''}`}
              style={{ left: `${(k.anchorWhiteIndex + 1) * 40 - 12}px` }}
              onClick={() => onPress(k.midi)}
              disabled={disabled}
              aria-label={`midi-${k.midi}`}
            />
          );
        })}
      </div>
    </div>
  );
}

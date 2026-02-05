// (no React import needed with the new JSX transform)

type Accidental = 'sharp' | 'flat' | 'natural';

function pcToDefaultSpelling(pc: number): { letter: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'; accidental: Accidental } {
  // Prefer flats for the common flat pitch-classes to avoid “everything is sharps”.
  // 0:C 1:Db 2:D 3:Eb 4:E 5:F 6:Gb 7:G 8:Ab 9:A 10:Bb 11:B
  const i = ((pc % 12) + 12) % 12;
  switch (i) {
    case 0:
      return { letter: 'C', accidental: 'natural' };
    case 1:
      return { letter: 'D', accidental: 'flat' };
    case 2:
      return { letter: 'D', accidental: 'natural' };
    case 3:
      return { letter: 'E', accidental: 'flat' };
    case 4:
      return { letter: 'E', accidental: 'natural' };
    case 5:
      return { letter: 'F', accidental: 'natural' };
    case 6:
      return { letter: 'G', accidental: 'flat' };
    case 7:
      return { letter: 'G', accidental: 'natural' };
    case 8:
      return { letter: 'A', accidental: 'flat' };
    case 9:
      return { letter: 'A', accidental: 'natural' };
    case 10:
      return { letter: 'B', accidental: 'flat' };
    case 11:
      return { letter: 'B', accidental: 'natural' };
    default:
      return { letter: 'C', accidental: 'natural' };
  }
}

function letterIndex(letter: string): number {
  // C D E F G A B
  switch (letter) {
    case 'C':
      return 0;
    case 'D':
      return 1;
    case 'E':
      return 2;
    case 'F':
      return 3;
    case 'G':
      return 4;
    case 'A':
      return 5;
    case 'B':
      return 6;
    default:
      return 0;
  }
}

function diatonicNumber(letter: string, octave: number): number {
  // A simple “letter-only” index: octave*7 + (C=0..B=6)
  return octave * 7 + letterIndex(letter);
}

function parseSpellingLabel(spelling: string): { letter: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'; accidental: Accidental } | null {
  const s = spelling.trim();
  const m = /^([A-Ga-g])([#b]?)$/.exec(s);
  if (!m) return null;
  const letter = m[1].toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
  const accidental = m[2] === '#' ? 'sharp' : m[2] === 'b' ? 'flat' : 'natural';
  return { letter, accidental };
}

export function StaffNote({
  midi,
  label,
  spelling,
  clef = 'auto',
  showLegend = true,
  width = 280,
  height = 120,
}: {
  midi: number;
  label?: string;
  /** Optional explicit spelling (e.g. "C#" or "Db") to render correct accidentals on staff. */
  spelling?: string;
  /** Treble, bass, or auto-select based on register. */
  clef?: 'auto' | 'treble' | 'bass';
  /** Hide the answer/label for "sight reading" style questions. */
  showLegend?: boolean;
  width?: number;
  height?: number;
}) {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;

  const parsed = spelling ? parseSpellingLabel(spelling) : null;
  const noteSpelling = parsed ?? pcToDefaultSpelling(pc);
  const noteDia = diatonicNumber(noteSpelling.letter, octave);

  const chosenClef: 'treble' | 'bass' =
    clef === 'treble' || clef === 'bass'
      ? clef
      : // Auto: treat middle C (C4=60) and above as treble; below as bass.
        midi >= 60
        ? 'treble'
        : 'bass';

  // Staff reference:
  // Treble: bottom line E4, top line F5.
  // Bass: bottom line G2, top line A3.
  const bottomLineDia = chosenClef === 'treble' ? diatonicNumber('E', 4) : diatonicNumber('G', 2);
  const topLineDia = chosenClef === 'treble' ? diatonicNumber('F', 5) : diatonicNumber('A', 3);

  // Layout
  const padX = 14;
  const staffLeft = padX;
  const staffRight = width - padX;
  const staffWidth = staffRight - staffLeft;

  const lineGap = 12; // px between staff lines
  const step = lineGap / 2; // diatonic step (line->space)
  const staffMidY = height / 2 + 6;

  // Make the 5 staff lines centered.
  const bottomLineY = staffMidY + 2 * lineGap;

  // Compute y by diatonic distance from the chosen clef's bottom line.
  const y = bottomLineY - (noteDia - bottomLineDia) * step;

  const noteX = staffLeft + staffWidth * 0.55;
  const headRx = 8;
  const headRy = 6;

  // Ledger lines: for notes outside the staff, draw the “line” positions.
  const ledgerLines: number[] = [];
  for (let d = noteDia; d <= bottomLineDia - 2; d += 2) {
    ledgerLines.push(d);
  }
  for (let d = noteDia; d >= topLineDia + 2; d -= 2) {
    ledgerLines.push(d);
  }

  const accidentalGlyph = noteSpelling.accidental === 'sharp' ? '♯' : noteSpelling.accidental === 'flat' ? '♭' : '';

  const legend =
    label ?? `${noteSpelling.letter}${noteSpelling.accidental === 'natural' ? '' : noteSpelling.accidental === 'sharp' ? '#' : 'b'}${octave}`;

  const ariaLabel = showLegend ? `Staff note (${chosenClef} clef) ${legend}` : `Staff note (${chosenClef} clef)`;

  return (
    <div style={{ width, maxWidth: '100%' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        <rect x={0} y={0} width={width} height={height} rx={12} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" />

        {/* Staff lines */}
        {Array.from({ length: 5 }, (_, i) => {
          const yy = bottomLineY - i * lineGap;
          return <line key={i} x1={staffLeft} x2={staffRight} y1={yy} y2={yy} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />;
        })}

        {/* Clef */}
        <text
          x={staffLeft + 16}
          y={bottomLineY - 1.5 * lineGap}
          fontSize={44}
          fill="rgba(255,255,255,0.72)"
          textAnchor="middle"
        >
          {chosenClef === 'treble' ? '𝄞' : '𝄢'}
        </text>

        {/* Ledger lines */}
        {Array.from(new Set(ledgerLines)).map((d) => {
          const yy = bottomLineY - (d - bottomLineDia) * step;
          return (
            <line
              key={d}
              x1={noteX - 18}
              x2={noteX + 18}
              y1={yy}
              y2={yy}
              stroke="rgba(255,255,255,0.35)"
              strokeWidth={1}
            />
          );
        })}

        {/* Accidental */}
        {accidentalGlyph ? (
          <text x={noteX - 28} y={y + 4} fontSize={18} fill="rgba(255,255,255,0.9)" textAnchor="middle">
            {accidentalGlyph}
          </text>
        ) : null}

        {/* Note head */}
        <ellipse cx={noteX} cy={y} rx={headRx} ry={headRy} fill="rgba(255,255,255,0.92)" />

        {/* Simple stem (always up for now) */}
        <line x1={noteX + headRx - 1} x2={noteX + headRx - 1} y1={y} y2={y - 30} stroke="rgba(255,255,255,0.92)" strokeWidth={2} />

        {/* Label */}
        {showLegend ? (
          <text x={staffLeft} y={height - 12} fontSize={12} fill="rgba(255,255,255,0.75)">
            {legend}
          </text>
        ) : null}
      </svg>
    </div>
  );
}

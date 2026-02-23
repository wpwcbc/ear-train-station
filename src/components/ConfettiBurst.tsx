import { useMemo } from 'react';

type ConfettiBurstProps = {
  active: boolean;
  /** deterministic seed to avoid reflow jitter */
  seed?: number;
  /** extra className to position container */
  className?: string;
};

const COLORS = ['#5ce79e', '#8dd4ff', '#ffd166', '#ff6b6b', '#b39ddb', '#ffffff'];

function mulberry32(a: number) {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function ConfettiBurst({ active, seed = 1, className }: ConfettiBurstProps) {
  const pieces = useMemo(() => {
    const rnd = mulberry32(seed);
    const n = 18;
    return Array.from({ length: n }).map((_, i) => {
      const left = Math.round(rnd() * 100);
      const delay = Math.round(rnd() * 160);
      const dur = 700 + Math.round(rnd() * 450);
      const dx = Math.round((rnd() - 0.5) * 220);
      const rot = Math.round((rnd() - 0.5) * 720);
      const size = 6 + Math.round(rnd() * 7);
      const color = COLORS[i % COLORS.length];
      return { left, delay, dur, dx, rot, size, color, i };
    });
  }, [seed]);

  if (!active) return null;

  return (
    <div className={['confettiBurst', className].filter(Boolean).join(' ')} aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.i}
          className="confettiPiece"
          style={
            {
              left: `${p.left}%`,
              background: p.color,
              width: p.size,
              height: Math.max(4, Math.round(p.size * 0.65)),
              ['--cDelay' as any]: `${p.delay}ms`,
              ['--cDur' as any]: `${p.dur}ms`,
              ['--cDx' as any]: `${p.dx}px`,
              ['--cRot' as any]: `${p.rot}deg`,
            } as any
          }
        />
      ))}
    </div>
  );
}

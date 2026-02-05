import { useEffect, useMemo, useState } from 'react';

export type TTTPhase = 'teach' | 'test' | 'twist';

export function TTTRunner({
  defaultPhase = 'teach',
  teach,
  test,
  twist,
  teachComplete,
  testComplete,
  twistComplete,
  onComplete,
}: {
  defaultPhase?: TTTPhase;
  teach: React.ReactNode;
  test: React.ReactNode;
  twist: React.ReactNode;
  teachComplete: boolean;
  testComplete: boolean;
  twistComplete: boolean;
  onComplete?: () => void;
}) {
  const [phase, setPhase] = useState<TTTPhase>(defaultPhase);

  useEffect(() => {
    if (phase === 'teach' && teachComplete) setPhase('test');
  }, [phase, teachComplete]);

  useEffect(() => {
    if (phase === 'test' && testComplete) setPhase('twist');
  }, [phase, testComplete]);

  useEffect(() => {
    if (phase === 'twist' && twistComplete) {
      onComplete?.();
    }
  }, [phase, twistComplete, onComplete]);

  const label = useMemo(() => {
    if (phase === 'teach') return 'Teach';
    if (phase === 'test') return 'Test';
    return 'Twist';
  }, [phase]);

  function pill(active: boolean) {
    return {
      padding: '4px 10px',
      borderRadius: 999,
      border: '1px solid rgba(255,255,255,0.12)',
      background: active ? 'rgba(255,255,255,0.10)' : 'transparent',
      opacity: active ? 1 : 0.65,
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: 0.2,
    } as const;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={pill(phase === 'teach')}>Teach</span>
          <span style={pill(phase === 'test')}>Test</span>
          <span style={pill(phase === 'twist')}>Twist</span>
        </div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>{label}</div>
      </div>

      {phase === 'teach' ? teach : phase === 'test' ? test : twist}
    </div>
  );
}

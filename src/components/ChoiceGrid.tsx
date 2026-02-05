import type { ReactNode } from 'react';

export function ChoiceGrid<T extends string | number>({
  choices,
  onChoose,
  buttonClassName = 'secondary',
  renderChoice,
}: {
  choices: readonly T[];
  onChoose: (c: T) => void;
  buttonClassName?: string;
  renderChoice?: (c: T) => ReactNode;
}) {
  return (
    <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
      {choices.map((c) => (
        <button key={String(c)} className={buttonClassName} onClick={() => onChoose(c)}>
          {renderChoice ? renderChoice(c) : String(c)}
        </button>
      ))}
    </div>
  );
}

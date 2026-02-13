import type { ReactNode } from 'react';

export function ChoiceGrid<T extends string | number>({
  choices,
  onChoose,
  buttonClassName = 'secondary',
  renderChoice,
  disabled = false,
}: {
  choices: readonly T[];
  onChoose: (c: T) => void;
  buttonClassName?: string;
  renderChoice?: (c: T) => ReactNode;
  /** Disables all buttons (useful during async prompt/correction replay). */
  disabled?: boolean;
}) {
  return (
    <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
      {choices.map((c) => (
        <button key={String(c)} className={buttonClassName} onClick={() => onChoose(c)} disabled={disabled}>
          {renderChoice ? renderChoice(c) : String(c)}
        </button>
      ))}
    </div>
  );
}

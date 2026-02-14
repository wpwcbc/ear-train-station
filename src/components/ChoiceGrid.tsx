import type { ReactNode } from 'react';

export function ChoiceGrid<T extends string | number>({
  choices,
  onChoose,
  buttonClassName = 'secondary',
  getButtonClassName,
  renderChoice,
  disabled = false,
}: {
  choices: readonly T[];
  onChoose: (c: T) => void;
  /** Default button className when getButtonClassName is not provided. */
  buttonClassName?: string;
  /** Per-choice className override (useful for marking wrong choices on retries). */
  getButtonClassName?: (c: T) => string;
  renderChoice?: (c: T) => ReactNode;
  /** Disables all buttons (useful during async prompt/correction replay). */
  disabled?: boolean;
}) {
  return (
    <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
      {choices.map((c) => (
        <button
          key={String(c)}
          className={getButtonClassName ? getButtonClassName(c) : buttonClassName}
          onClick={() => onChoose(c)}
          disabled={disabled}
        >
          {renderChoice ? renderChoice(c) : String(c)}
        </button>
      ))}
    </div>
  );
}

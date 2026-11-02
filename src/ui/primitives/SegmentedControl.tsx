/** One-of-N view switch (pressed button = current value). Styling: .cy-segmented in app.css. */
export function SegmentedControl<T extends string>({ label, options, value, onChange, disabled = false, compact = false }: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return <div className={"cy-segmented" + (compact ? " compact" : "")} role="group" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value} disabled={disabled}
      onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>;
}

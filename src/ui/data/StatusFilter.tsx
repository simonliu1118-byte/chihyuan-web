import type { StatusTone } from "../../runtime/modules/status-flow";

export interface StatusFilterOption { code: string; label: string; tone: StatusTone }

/**
 * Filter-bar status buttons with live totals. Pressing one filters the list; pressing 全部 clears it.
 * Counts come from the list's first page (same filters, any status), so they stay accurate while paging.
 */
export function StatusFilter({ label, options, counts, value, onChange }: {
  label: string;
  options: readonly StatusFilterOption[];
  counts: Partial<Record<string, number>> | null;
  value: string;
  onChange: (code: string) => void;
}) {
  const total = counts ? options.reduce((sum, option) => sum + (counts[option.code] ?? 0), 0) : null;
  const count = (value: number | null | undefined) => counts ? <span className="cy-status-filter-count">{value ?? 0}</span> : null;
  return <div className="cy-status-filter" role="group" aria-label={label}>
    <button type="button" aria-pressed={value === ""} onClick={() => onChange("")}>全部{count(total)}</button>
    {options.map((option) => <button type="button" key={option.code} data-tone={option.tone} aria-pressed={value === option.code}
      onClick={() => onChange(value === option.code ? "" : option.code)}>{option.label}{count(counts?.[option.code])}</button>)}
  </div>;
}

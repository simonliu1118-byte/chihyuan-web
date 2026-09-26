import type { ReactNode } from "react";

export interface DataViewToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  searchLabel?: string;
  filters?: ReactNode;
  actions?: ReactNode;
  resultSummary?: ReactNode;
}

export function DataViewToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "搜尋…",
  searchLabel = "搜尋",
  filters,
  actions,
  resultSummary,
}: DataViewToolbarProps) {
  return (
    <div className="cy-data-toolbar">
      <div className="cy-data-toolbar-primary">
        <label className="cy-data-search">
          <span className="cy-visually-hidden">{searchLabel}</span>
          <input
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchLabel}
          />
        </label>
        {filters ? <div className="cy-data-filters">{filters}</div> : null}
      </div>

      <div className="cy-data-toolbar-secondary">
        {resultSummary ? <div className="cy-data-result-summary">{resultSummary}</div> : null}
        {actions ? <div className="cy-data-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

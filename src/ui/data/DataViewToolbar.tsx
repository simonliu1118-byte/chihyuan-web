import { useState, type ReactNode } from "react";
import { useCompactLayout } from "../foundation/useCompactLayout";
import { BottomSheet } from "../overlays/Dialog";

export interface DataViewToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  searchLabel?: string;
  beforeSearch?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  resultSummary?: ReactNode;
  /** Phone only: how many filters differ from their defaults, shown on the 篩選 button. */
  activeFilterCount?: number;
}

export function DataViewToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "搜尋…",
  searchLabel = "搜尋",
  beforeSearch,
  filters,
  actions,
  resultSummary,
  activeFilterCount = 0,
}: DataViewToolbarProps) {
  // Phone (UI_COMPONENT_CATALOG §6): the same filter controls move into a bottom sheet behind 篩選.
  const compact = useCompactLayout();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const sheetFilters = compact && !!filters;
  return (
    <div className="cy-data-toolbar">
      <div className="cy-data-toolbar-primary">
        {beforeSearch}
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
        {sheetFilters ? <button type="button" className="cy-op-button cy-data-filter-button" aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(true)}>
          篩選{activeFilterCount ? <span className="cy-module-badge">{activeFilterCount}</span> : null}</button>
          : filters ? <div className="cy-data-filters">{filters}</div> : null}
      </div>

      <div className="cy-data-toolbar-secondary">
        {resultSummary ? <div className="cy-data-result-summary">{resultSummary}</div> : null}
        {actions ? <div className="cy-data-actions">{actions}</div> : null}
      </div>
      {sheetFilters ? <BottomSheet open={filtersOpen} title="篩選" onClose={() => setFiltersOpen(false)}>
        <div className="cy-data-filters cy-data-filters-sheet">{filters}</div>
        <div className="cy-op-form-footer"><button type="button" className="cy-op-button primary" onClick={() => setFiltersOpen(false)}>完成</button></div>
      </BottomSheet> : null}
    </div>
  );
}

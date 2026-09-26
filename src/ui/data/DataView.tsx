import type { Key, KeyboardEvent, ReactNode } from "react";
import { Button } from "../primitives/Button";
import { Notice } from "../primitives/Notice";

export type DataViewStatus = "loading" | "ready" | "error";

export interface DataColumn<T> {
  key: string;
  header: ReactNode;
  render: (item: T) => ReactNode;
  align?: "start" | "center" | "end";
  width?: string;
}

export interface DataViewProps<T> {
  ariaLabel: string;
  items: readonly T[];
  getKey: (item: T) => Key;
  columns: readonly DataColumn<T>[];
  renderCard: (item: T) => ReactNode;
  status?: DataViewStatus;
  errorMessage?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  onRetry?: () => void;
  selectedKey?: Key | null;
  onSelect?: (item: T) => void;
}

function handleSelectionKey<T>(event: KeyboardEvent<HTMLElement>, item: T, onSelect?: (item: T) => void) {
  if (!onSelect) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  onSelect(item);
}

export function DataView<T>({
  ariaLabel,
  items,
  getKey,
  columns,
  renderCard,
  status = "ready",
  errorMessage = "資料讀取失敗。",
  emptyTitle = "沒有資料",
  emptyDescription,
  onRetry,
  selectedKey,
  onSelect,
}: DataViewProps<T>) {
  if (status === "loading") {
    return (
      <div className="cy-data-state" role="status" aria-live="polite">
        <div className="cy-data-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span className="cy-visually-hidden">資料讀取中</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="cy-data-state">
        <Notice tone="danger" title="無法取得資料" role="alert">
          <div className="cy-data-error-content">
            <span>{errorMessage}</span>
            {onRetry ? (
              <Button variant="secondary" size="small" type="button" onClick={onRetry}>
                再試一次
              </Button>
            ) : null}
          </div>
        </Notice>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="cy-data-empty" role="status">
        <strong>{emptyTitle}</strong>
        {emptyDescription ? <div>{emptyDescription}</div> : null}
      </div>
    );
  }

  return (
    <div className="cy-data-view" aria-label={ariaLabel}>
      <div className="cy-data-table-wrap">
        <table className="cy-data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  data-align={column.align ?? "start"}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const key = getKey(item);
              const selected = selectedKey != null && key === selectedKey;
              return (
                <tr
                  key={key}
                  className={onSelect ? "cy-data-row is-interactive" : "cy-data-row"}
                  data-selected={selected || undefined}
                  tabIndex={onSelect ? 0 : undefined}
                  onClick={onSelect ? () => onSelect(item) : undefined}
                  onKeyDown={onSelect ? (event) => handleSelectionKey(event, item, onSelect) : undefined}
                >
                  {columns.map((column) => (
                    <td key={column.key} data-align={column.align ?? "start"}>
                      {column.render(item)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="cy-data-cards">
        {items.map((item) => {
          const key = getKey(item);
          const selected = selectedKey != null && key === selectedKey;
          return (
            <div
              key={key}
              className={onSelect ? "cy-data-card is-interactive" : "cy-data-card"}
              data-selected={selected || undefined}
              tabIndex={onSelect ? 0 : undefined}
              onClick={onSelect ? () => onSelect(item) : undefined}
              onKeyDown={onSelect ? (event) => handleSelectionKey(event, item, onSelect) : undefined}
            >
              {renderCard(item)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

import type { ReactNode } from "react";

export interface RelatedRecordTab<TKey extends string = string> {
  key: TKey;
  label: string;
  badge?: ReactNode;
}

export interface RelatedRecordPanelProps<TKey extends string = string> {
  tabs: readonly RelatedRecordTab<TKey>[];
  activeKey: TKey;
  onChange: (key: TKey) => void;
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
  headerActions?: ReactNode;
}

export function RelatedRecordPanel<TKey extends string>({
  tabs,
  activeKey,
  onChange,
  children,
  ariaLabel = "相關資料",
  className = "",
  headerActions,
}: RelatedRecordPanelProps<TKey>) {
  return (
    <section className={["cy-related-panel", className].filter(Boolean).join(" ")}>
      <header className="cy-related-panel-header">
        <div className="cy-related-panel-tabs" role="tablist" aria-label={ariaLabel}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeKey === tab.key}
              className={activeKey === tab.key ? "is-active" : ""}
              onClick={() => onChange(tab.key)}
            >
              <span>{tab.label}</span>
              {tab.badge != null ? <span className="cy-related-panel-badge">{tab.badge}</span> : null}
            </button>
          ))}
        </div>
        {headerActions ? <div className="cy-related-panel-actions">{headerActions}</div> : null}
      </header>
      <div className="cy-related-panel-content" role="tabpanel">
        {children}
      </div>
    </section>
  );
}

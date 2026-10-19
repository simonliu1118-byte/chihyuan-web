import type { ReactNode } from "react";
import "../../runtime/modules/customer-operational.css";

export function RelatedCard({ title, count, empty, rows, onAdd, onView }: {
  title: string; count: number; empty: string; rows: readonly ReactNode[];
  onAdd: () => void; onView: () => void;
}) {
  return <article className="cy-op-panel cy-customer-related-card">
    <header className="cy-customer-related-card-header">
      <h3>{title} <span className="cy-customer-card-count">{count}</span></h3>
      <button className="cy-op-button compact" type="button" onClick={onAdd}>＋ 新增</button>
    </header>
    <div className="cy-customer-related-card-rows">
      {rows.length ? rows.map((row, index) => <div key={index} className="cy-customer-card-row">{row}</div>)
        : <p className="cy-customer-muted">{empty}</p>}
    </div>
    <button className="cy-customer-card-view-all" type="button" onClick={onView}>查看全部（{count}）›</button>
  </article>;
}


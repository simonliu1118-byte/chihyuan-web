import { ReactNode, useRef } from "react";

/**
 * The 銷貨銷退單／進貨退貨單 list (user 2026-10-19: cards were too sparse for customers with many
 * orders): one compact row per order under a column header, each row opening to its details, and
 * 全部展開／全部收合 for the whole list. The rows are the callers' own <details>.
 */
export function ErpOrderList({ columns, children }: { columns: readonly string[]; children: ReactNode }) {
  const list = useRef<HTMLDivElement>(null);
  const setAll = (open: boolean) =>
    list.current?.querySelectorAll<HTMLDetailsElement>(":scope > details").forEach(row => { row.open = open; });
  return <>
    <div className="cy-erp-orders-tools">
      <button type="button" className="cy-op-button" onClick={() => setAll(true)}>全部展開</button>
      <button type="button" className="cy-op-button" onClick={() => setAll(false)}>全部收合</button>
    </div>
    <div className="cy-erp-orders" ref={list}>
      <div className="cy-erp-orders-head" aria-hidden="true">{columns.map(c => <span key={c}>{c}</span>)}</div>
      {children}
    </div>
  </>;
}

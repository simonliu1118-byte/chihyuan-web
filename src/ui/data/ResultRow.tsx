import type { ReactNode } from "react";
import "./result-row.css";

/**
 * One-line list row shared by the customer and HR people lists: 編號 → 名稱 → optional tag, status at the far right.
 * Selection is the light accent background with the left accent bar. Phone lists keep using ListRow.
 */
export function ResultRow({ no, name, tag, status, selected = false, onClick }: {
  no?: ReactNode; name: ReactNode; tag?: ReactNode; status?: ReactNode; selected?: boolean; onClick: () => void;
}) {
  const title = [typeof no === "string" ? no : null, typeof name === "string" ? name : null].filter(Boolean).join(" ");
  return <button type="button" className={`cy-result-row ${selected ? "active" : ""}`} aria-current={selected ? "true" : undefined} onClick={onClick}>
    <span className="cy-result-main">
      <strong title={title || undefined}>{no ? <span className="cy-result-no">{no}</span> : null}{name}</strong>
      {tag}
    </span>
    <span className="cy-result-status">{status}</span>
  </button>;
}

/**
 * Square, outlined, unfilled tag (store name). Deliberately unlike the filled rounded status pill so the two are never
 * confused. Long text truncates with an ellipsis; the full text is the tooltip.
 */
export function OutlineTag({ children }: { children: string }) {
  return <span className="cy-outline-tag" title={children}>{children}</span>;
}

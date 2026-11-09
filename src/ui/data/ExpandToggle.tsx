import { Icons } from "../actions/icons";

/**
 * The one expand/collapse control for the whole system (user 2026-11-04): a › chevron that turns
 * down when open. Plain <details> blocks get the same chevron from app.css.
 */
export function ExpandToggle({ expanded, onToggle, label, className = "", variant = "icon" }: {
  expanded: boolean; onToggle: () => void; label: string; className?: string;
  /** "text": a small soft button reading 展開／收起, for places where the arrow alone is unclear (user 2026-11-09). */
  variant?: "icon" | "text";
}) {
  if (variant === "text") return <button type="button" className={"cy-op-button compact soft cy-expand-text" + (className ? " " + className : "")} aria-expanded={expanded}
    aria-label={(expanded ? "收起 " : "展開 ") + label} onClick={event => { event.stopPropagation(); onToggle(); }}>{expanded ? "收起" : "展開"}</button>;
  return <button type="button" className={"cy-expand-toggle" + (className ? " " + className : "")} aria-expanded={expanded}
    aria-label={(expanded ? "收合 " : "展開 ") + label} onClick={event => { event.stopPropagation(); onToggle(); }}>{Icons.chevronRight}</button>;
}

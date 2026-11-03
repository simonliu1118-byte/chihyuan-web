import { Icons } from "../actions/icons";

/**
 * The one expand/collapse control for the whole system (user 2026-11-04): a › chevron that turns
 * down when open. Plain <details> blocks get the same chevron from app.css.
 */
export function ExpandToggle({ expanded, onToggle, label, className = "" }: {
  expanded: boolean; onToggle: () => void; label: string; className?: string;
}) {
  return <button type="button" className={"cy-expand-toggle" + (className ? " " + className : "")} aria-expanded={expanded}
    aria-label={(expanded ? "收合 " : "展開 ") + label} onClick={event => { event.stopPropagation(); onToggle(); }}>{Icons.chevronRight}</button>;
}

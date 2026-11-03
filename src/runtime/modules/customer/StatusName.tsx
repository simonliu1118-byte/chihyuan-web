import { useEffect, useRef, useState } from "react";
import "./status-name.css";

type StatusLike = { id?: number; name: string; light?: string; isActive?: boolean };

/**
 * A customer status as a coloured pill, the same kind of pill as 叫貨／門市 (user 2026-11-03). The
 * status colour tints the pill; 已歇業-type statuses (CLOSED) are grey with a cross.
 */
export function StatusPill({ status, className = "" }: { status?: StatusLike | null; className?: string }) {
  if (!status) return null;
  const light = (status.light ?? "GREEN").toLowerCase();
  return <span className={`cy-status-pill ${light} ${className}`.trim()}>{light === "closed" ? <span aria-hidden="true">✕</span> : null}{status.name}</span>;
}

/** Earlier name kept for callers that show a status inline. */
export const StatusName = StatusPill;

/**
 * Choosing a customer status while editing: the header pill opens a list of pills. Escape or a
 * click outside closes it; arrow keys move through the list.
 */
export function StatusPicker({ statuses, value, onChange, disabled = false, required = false }: {
  statuses: readonly (StatusLike & { id: number })[];
  value: number | null;
  onChange: (id: number) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = statuses.find(row => row.id === value);
  const choices = statuses.filter(row => row.isActive !== false || row.id === value);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  function focusOption(step: number) {
    const options = [...(box.current?.querySelectorAll<HTMLButtonElement>("[role=option]") ?? [])];
    const at = options.indexOf(document.activeElement as HTMLButtonElement);
    options[(at + step + options.length) % options.length]?.focus();
  }
  return <div className="cy-status-picker" ref={box} onKeyDown={event => {
    if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); }
    if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) { event.preventDefault(); focusOption(event.key === "ArrowDown" ? 1 : -1); }
  }}>
    <button type="button" className={"cy-status-picker-button" + (!current && required ? " missing" : "")} disabled={disabled}
      aria-haspopup="listbox" aria-expanded={open} aria-label={"客戶狀態：" + (current?.name ?? "未選擇")} onClick={() => setOpen(value => !value)}>
      {current ? <StatusPill status={current} /> : <span className="cy-status-pill empty">選擇客戶狀態</span>}
      <span className="cy-status-picker-caret" aria-hidden="true">▾</span>
    </button>
    {open ? <div className="cy-status-picker-list" role="listbox" aria-label="客戶狀態">
      {choices.map(row => <button key={row.id} type="button" role="option" aria-selected={row.id === value}
        className={"cy-status-picker-option" + (row.id === value ? " selected" : "")}
        onClick={() => { onChange(row.id); setOpen(false); }}><StatusPill status={row} /></button>)}
    </div> : null}
  </div>;
}

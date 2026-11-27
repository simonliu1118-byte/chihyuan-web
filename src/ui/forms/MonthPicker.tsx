import { useEffect, useId, useRef, useState } from "react";
import { taipeiToday } from "../../../shared/erp-query-history";
import {shiftDate} from "../../../shared/date-input";
import "./month-picker.css";

/**
 * Month chooser shared by every month-based page: ‹  2026 年 11 月 ▾  ›
 * The arrows step one month; the label opens a year header and a 4x3 grid of months.
 * Mouse and touch only: there is no typing and no keyboard shortcut beyond Esc and Tab.
 */
export interface MonthPickerProps {
  /** YYYY-MM, YYYY with year precision, or YYYY-MM-DD with day precision. */
  value: string;
  /** "month" (default) or "year": the same control steps and picks whole years. */
  precision?: "month" | "year" | "day";
  onChange: (value: string) => void;
  /** Inclusive limits, YYYY-MM (YYYY for year precision). */
  min?: string;
  max?: string;
  disabled?: boolean;
  label?: string;
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const pad = (n: number) => String(n).padStart(2, "0");
const make = (year: number, month: number) => `${year}-${pad(month)}`;
/** Month n steps from `value`, as YYYY-MM. */
export function shiftMonthValue(value: string, delta: number): string {
  const m = MONTH.exec(value);
  if (!m) return value;
  const index = Number(m[1]) * 12 + Number(m[2]) - 1 + delta;
  return make(Math.floor(index / 12), index % 12 + 1);
}
const Chevron = ({ dir }: { dir: "left" | "right" }) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={dir === "left" ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6"} /></svg>;

export function MonthPicker(props: MonthPickerProps) {
  return props.precision === "day" ? <DayStepper {...props} /> : props.precision === "year" ? <YearPicker {...props} /> : <MonthPickerBody {...props} />;
}

/** Day navigation reuses the shared picker arrows; bounded, no calendar popup. */
function DayStepper({value,onChange,min,max,disabled=false,label="日期"}:MonthPickerProps){
 const previous=shiftDate(value,-1),next=shiftDate(value,1);
 const blocked=(d:string)=>!d||!!min&&d<min||!!max&&d>max;
 return <span className="cy-month-picker" role="group" aria-label={label}>
  <button type="button" className="cy-month-arrow" aria-label="上一日" disabled={disabled||blocked(previous)} onClick={()=>onChange(previous)}><Chevron dir="left"/></button>
  <span className="cy-month-day-label">{value.replaceAll("-","/")}</span>
  <button type="button" className="cy-month-arrow" aria-label="下一日" disabled={disabled||blocked(next)} onClick={()=>onChange(next)}><Chevron dir="right"/></button>
 </span>;
}

/** `‹ 2026 年 ▾ ›` — the same control with year precision: the arrows step one year, the label opens a 3x4 grid of years. */
function YearPicker({ value, onChange, min, max, disabled = false, label = "年度" }: MonthPickerProps) {
  const thisYear = Number(taipeiToday().slice(0, 4));
  const year = /^\d{4}$/.test(value) ? Number(value) : thisYear;
  const [open, setOpen] = useState(false);
  const [pageStart, setPageStart] = useState(year - 5);
  const root = useRef<HTMLSpanElement>(null);
  const popoverId = useId();
  const lo = min ? Number(min) : -Infinity, hi = max ? Number(max) : Infinity;
  const blocked = (y: number) => y < lo || y > hi || y < 1 || y > 9999;
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation(); event.preventDefault(); setOpen(false);
      root.current?.querySelector<HTMLElement>(".cy-month-label")?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape, true); };
  }, [open]);
  const choose = (y: number) => { if (blocked(y)) return; setOpen(false); if (y !== year) onChange(String(y)); };
  return <span className="cy-month-picker" ref={root} role="group" aria-label={label}>
    <button type="button" className="cy-month-arrow" aria-label="上一年" disabled={disabled || blocked(year - 1)} onClick={() => choose(year - 1)}><Chevron dir="left" /></button>
    <button type="button" className="cy-month-label" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? popoverId : undefined} disabled={disabled}
      onClick={() => { if (disabled) return; setPageStart(year - 5); setOpen(v => !v); }}>
      <span>{year} 年</span>
      <svg className="cy-month-caret" viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M5 9h14l-7 8z" /></svg>
    </button>
    <button type="button" className="cy-month-arrow" aria-label="下一年" disabled={disabled || blocked(year + 1)} onClick={() => choose(year + 1)}><Chevron dir="right" /></button>
    {open ? <div className="cy-month-popover" id={popoverId} role="dialog" aria-label={`${label}選擇`}>
      <div className="cy-month-year">
        <button type="button" className="cy-month-arrow" aria-label="上一組年度" onClick={() => setPageStart(y => y - 12)}><Chevron dir="left" /></button>
        <strong>{pageStart} – {pageStart + 11}</strong>
        <button type="button" className="cy-month-arrow" aria-label="下一組年度" onClick={() => setPageStart(y => y + 12)}><Chevron dir="right" /></button>
      </div>
      <div className="cy-month-grid cy-year-grid">{Array.from({ length: 12 }, (_, i) => {
        const y = pageStart + i;
        return <button type="button" key={y} className="cy-month-cell" disabled={blocked(y)}
          aria-pressed={y === year} data-current={y === thisYear || undefined} onClick={() => choose(y)}>{y}</button>;
      })}</div>
    </div> : null}
  </span>;
}

function MonthPickerBody({ value, onChange, min, max, disabled = false, label = "月份" }: MonthPickerProps) {
  const parsed = MONTH.exec(value);
  const year = parsed ? Number(parsed[1]) : Number(taipeiToday().slice(0, 4));
  const month = parsed ? Number(parsed[2]) : 1;
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(year);
  const root = useRef<HTMLSpanElement>(null);
  const popoverId = useId();
  const currentMonth = taipeiToday().slice(0, 7);
  const below = (v: string) => min !== undefined && v < min;
  const above = (v: string) => max !== undefined && v > max;
  const blocked = (v: string) => below(v) || above(v);
  const previous = shiftMonthValue(value, -1), next = shiftMonthValue(value, 1);
  const minYear = min ? Number(min.slice(0, 4)) : -Infinity, maxYear = max ? Number(max.slice(0, 4)) : Infinity;

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Esc closes only the popover; an enclosing dialog must stay open.
      event.stopPropagation(); event.preventDefault(); setOpen(false);
      root.current?.querySelector<HTMLElement>(".cy-month-label")?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape, true); };
  }, [open]);

  function toggle() { if (disabled) return; setViewYear(year); setOpen(v => !v); }
  function choose(target: string) { if (blocked(target)) return; setOpen(false); if (target !== value) onChange(target); }

  return <span className="cy-month-picker" ref={root} role="group" aria-label={label}>
    <button type="button" className="cy-month-arrow" aria-label="上個月" disabled={disabled || blocked(previous)} onClick={() => choose(previous)}><Chevron dir="left" /></button>
    <button type="button" className="cy-month-label" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? popoverId : undefined} disabled={disabled} onClick={toggle}>
      <span>{year} 年 {month} 月</span>
      <svg className="cy-month-caret" viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M5 9h14l-7 8z" /></svg>
    </button>
    <button type="button" className="cy-month-arrow" aria-label="下個月" disabled={disabled || blocked(next)} onClick={() => choose(next)}><Chevron dir="right" /></button>
    {open ? <div className="cy-month-popover" id={popoverId} role="dialog" aria-label={`${label}選擇`}>
      <div className="cy-month-year">
        <button type="button" className="cy-month-arrow" aria-label="上一年" disabled={viewYear <= minYear} onClick={() => setViewYear(y => y - 1)}><Chevron dir="left" /></button>
        <strong>{viewYear} 年</strong>
        <button type="button" className="cy-month-arrow" aria-label="下一年" disabled={viewYear >= maxYear} onClick={() => setViewYear(y => y + 1)}><Chevron dir="right" /></button>
      </div>
      <div className="cy-month-grid">{Array.from({ length: 12 }, (_, i) => {
        const target = make(viewYear, i + 1);
        return <button type="button" key={target} className="cy-month-cell" disabled={blocked(target)}
          aria-pressed={target === value} data-current={target === currentMonth || undefined} onClick={() => choose(target)}>{i + 1} 月</button>;
      })}</div>
    </div> : null}
  </span>;
}

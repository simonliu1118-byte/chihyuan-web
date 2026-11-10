import type { Key, ReactElement, ReactNode } from "react";
import { Field } from "./Field";
import { IconButton } from "../actions/IconButton";
import { Icons } from "../actions/icons";
import "./record-sheet.css";

/**
 * Table-style record sheet (PROJECT_RULES §5, user 2026-11-03): labels above values, the same layout
 * for viewing and editing. Each row sets its own column widths as a CSS grid template, so a column
 * edge can line up with the row below (for example `calc(25% - 7em)`). Editing cells keep the shared
 * Field, whose label is announced but not shown; the visible label is the header cell.
 */
export interface SheetCell {
  label: string;
  required?: boolean;
  mono?: boolean;
  view: ReactNode;
  edit?: ReactElement;
  /** Grid columns this cell spans, so rows can share one column grid and their lines line up. */
  span?: number;
  /** Extra control in the header cell while editing (for example 同戶籍地址). */
  headExtra?: ReactNode;
}
export interface SheetRow { columns: string; cells: SheetCell[] }

export function RecordSheet({ label, editing, rows }: { label: string; editing: boolean; rows: SheetRow[] }) {
  return <div className={"cy-sheet" + (editing ? " editing" : "")} role="group" aria-label={label}>
    {rows.map((row, index) => <div key={index} className="cy-sheet-row" style={{ gridTemplateColumns: row.columns }}>
      {row.cells.map((cell, i) => <div key={"h" + cell.label} style={cell.span ? { gridColumn: "span " + cell.span } : undefined}
        className={"cy-sheet-head" + (i === row.cells.length - 1 ? " last" : "") + (editing && cell.headExtra ? " has-extra" : "")}>{cell.label}
        {editing && cell.required ? <span className="cy-field-required" aria-hidden="true">＊</span> : null}
        {editing && cell.headExtra ? <span className="cy-sheet-head-extra">{cell.headExtra}</span> : null}</div>)}
      {row.cells.map((cell, i) => <div key={"v" + cell.label} data-label={cell.label} style={cell.span ? { gridColumn: "span " + cell.span } : undefined}
        className={"cy-sheet-cell" + (cell.mono ? " mono" : "") + (i === row.cells.length - 1 ? " last" : "")}>
        {editing && cell.edit ? <Field label={cell.label} required={cell.required} presentation="cell">{cell.edit}</Field>
          : <span className="cy-sheet-value">{isEmpty(cell.view) ? "—" : cell.view}</span>}
        {/* Phones hide the header row, so the header control moves into the cell there. */}
        {editing && cell.headExtra ? <span className="cy-sheet-cell-extra">{cell.headExtra}</span> : null}
      </div>)}
    </div>)}
  </div>;
}

export interface RowColumn<T> {
  label: string;
  width?: string;
  required?: boolean;
  mono?: boolean;
  view: (row: T) => ReactNode;
  edit: (row: T, index: number) => ReactElement;
}

/**
 * Repeating rows under a sheet: 項次 first; while editing, ＋ inserts a row below and the bin removes
 * one. At `max` rows ＋ is no longer offered. While viewing, a section with no rows still shows its
 * header and one row of dashes (user 2026-11-03), unless `hideWhenEmpty`.
 */
export function RecordRows<T>({ title, editing, columns, rows, rowKey, max, busy = false, hideWhenEmpty = false, onInsert, onRemove, className = "" }: {
  title: string;
  editing: boolean;
  columns: RowColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T, index: number) => Key;
  max?: number;
  busy?: boolean;
  hideWhenEmpty?: boolean;
  onInsert: (after: number) => void;
  onRemove: (index: number) => void;
  className?: string;
}) {
  if (!editing && rows.length === 0 && hideWhenEmpty) return null;
  const full = max != null && rows.length >= max;
  const add = (after: number) => <IconButton variant="table" icon={Icons.add} label={`在下方新增${title}`}
    disabled={busy || full} onClick={() => onInsert(after)} />;
  return <section className={"cy-sheet-rows " + className} aria-label={title}>
    <h3 className="cy-sheet-rows-title">{title}</h3>
    <div className="cy-sheet-rows-scroll"><table className={"cy-sheet-table" + (editing ? " editing" : "")}>
      <colgroup><col className="cy-sheet-seq" />{columns.map(column => <col key={column.label} style={column.width ? { width: column.width } : undefined} />)}
        {editing ? <col className="cy-sheet-ops" /> : null}</colgroup>
      <thead><tr><th scope="col" className="cy-sheet-seq">項次</th>
        {columns.map(column => <th scope="col" key={column.label}>{column.label}
          {editing && column.required ? <span className="cy-field-required" aria-hidden="true">＊</span> : null}</th>)}
        {editing ? <th scope="col" className="cy-sheet-ops">操作</th> : null}</tr></thead>
      <tbody>
        {rows.map((row, index) => <tr key={rowKey(row, index)}>
          <td className="cy-sheet-seq">{index + 1}</td>
          {columns.map(column => <td key={column.label} data-label={column.label} className={column.mono ? "mono" : undefined}>
            {editing ? <Field label={column.label} required={column.required} presentation="cell">{column.edit(row, index)}</Field>
              : <span className="cy-sheet-value">{isEmpty(column.view(row)) ? "—" : column.view(row)}</span>}
          </td>)}
          {editing ? <td className="cy-sheet-ops">{full ? <span className="cy-sheet-ops-gap" /> : add(index)}
            <IconButton variant="table" tone="danger" icon={Icons.remove} label={`刪除第 ${index + 1} 列${title}`}
              disabled={busy} onClick={() => onRemove(index)} /></td> : null}
        </tr>)}
        {editing && rows.length === 0 ? <tr className="cy-sheet-empty"><td className="cy-sheet-seq" />
          {columns.map(column => <td key={column.label} />)}<td className="cy-sheet-ops">{add(-1)}</td></tr> : null}
        {!editing && rows.length === 0 ? <tr className="cy-sheet-empty"><td className="cy-sheet-seq" />
          {columns.map(column => <td key={column.label} data-label={column.label}><span className="cy-sheet-value">—</span></td>)}</tr> : null}
      </tbody>
    </table></div>
  </section>;
}

function isEmpty(value: ReactNode): boolean {
  return value == null || value === false || (typeof value === "string" && value.trim() === "");
}

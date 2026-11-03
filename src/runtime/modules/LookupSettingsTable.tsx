import { useEffect, useState, type DragEvent, type KeyboardEvent } from "react";
import type { LookupSetting } from "../../../shared/settings";
import { STATUS_LIGHTS } from "../../../shared/taiwan-regions";
import { IconButton } from "../../ui/actions/IconButton";
import { Icons } from "../../ui/actions/icons";
import { Field } from "../../ui/forms/Field";
import { StatusPill } from "./customer/StatusName";

/** One row being edited inline; `id` is absent for a new row. */
export interface LookupDraft {
  id?: number; code: string; name: string; isActive: boolean; light: string; parentId: number | null; expectedUpdatedAt?: string;
}

/** Customer status names fit the pill (user 2026-11-03). */
export const STATUS_NAME_LIMIT = 7;

/**
 * Structural lookups (客戶分類、客戶狀態、負責部門、商品分類) as one dense table (user 2026-11-03):
 * 項次, rows edited in place, and 操作 holding 修改／停用（啟用）／刪除 — delete only for a row nothing
 * uses. The grip reorders by dragging (or ↑／↓ on it); the new order shows at once and saves in the
 * background. Statuses show as pills and pick a colour; pinned statuses (正常, 已歇業) do not move.
 */
export function LookupSettingsTable({ label, rows, editable, busy, status, withCode, parents, draft, setDraft, onSave, onReorder, onToggle, onDelete }: {
  label: string;
  rows: readonly LookupSetting[];
  editable: boolean;
  busy: boolean;
  status: boolean;
  withCode: boolean;
  /** Item categories only: the possible parents. */
  parents?: readonly LookupSetting[];
  draft: LookupDraft | null;
  setDraft: (draft: LookupDraft | null) => void;
  onSave: () => void;
  /** Resolves false when the save failed, so the table puts the old order back. */
  onReorder: (ids: number[]) => Promise<boolean>;
  onToggle: (row: LookupSetting) => void;
  onDelete: (row: LookupSetting) => void;
}) {
  const movable = rows.filter(row => !row.pin);
  const [order, setOrder] = useState<number[] | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  // The saved order arrives as new rows; until then the dropped order stays on screen.
  useEffect(() => { setOrder(null); }, [rows]);
  const ids = order ?? movable.map(row => row.id);
  const byId = new Map(rows.map(row => [row.id, row]));
  const shown = [...rows.filter(row => row.pin === "TOP"), ...ids.map(id => byId.get(id)).filter((row): row is LookupSetting => !!row), ...rows.filter(row => row.pin === "BOTTOM")];
  const canDrag = editable && !busy && draft === null && movable.length > 1;

  function move(list: number[], id: number, to: number) {
    const next = list.filter(value => value !== id);
    next.splice(Math.max(0, Math.min(to, next.length)), 0, id);
    return next;
  }
  function commit(next: number[]) {
    setDragging(null);
    if (next.join() === movable.map(row => row.id).join()) { setOrder(null); return; }
    setOrder(next);
    void onReorder(next).then(saved => { if (!saved) setOrder(null); });
  }
  function over(event: DragEvent, id: number) {
    if (dragging === null || dragging === id) return;
    event.preventDefault();
    setOrder(move(ids, dragging, ids.indexOf(id)));
  }
  function keys(event: KeyboardEvent, id: number) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    commit(move(ids, id, ids.indexOf(id) + (event.key === "ArrowUp" ? -1 : 1)));
  }
  const parentName = (id: number | null | undefined) => parents?.find(row => row.id === id)?.name ?? "";
  const input = "cy-sheet-input";
  const seq = (row: LookupSetting) => shown.indexOf(row) + 1;

  const editRow = (current: LookupDraft, number: number | null) => <tr key={current.id ?? "new"} className="editing"
    onKeyDown={event => { if (event.key === "Enter" && !(event.nativeEvent as globalThis.KeyboardEvent).isComposing) { event.preventDefault(); onSave(); } if (event.key === "Escape") setDraft(null); }}>
    <td className="cy-lookup-grip" />
    <td className="cy-sheet-seq">{number ?? ""}</td>
    {withCode ? <td><Field label="代碼" required presentation="cell">
      <input className={input + " mono"} maxLength={80} value={current.code} disabled={busy || current.id != null}
        onChange={event => setDraft({ ...current, code: event.target.value })} /></Field></td> : null}
    <td><div className="cy-lookup-name-edit">
      <Field label="名稱" required presentation="cell">
        <input className={input} maxLength={status ? STATUS_NAME_LIMIT : 200} value={current.name} disabled={busy} autoFocus
          placeholder={status ? `最多 ${STATUS_NAME_LIMIT} 字` : undefined} onChange={event => setDraft({ ...current, name: event.target.value })} /></Field>
      {status ? <div className="cy-lookup-colors" role="radiogroup" aria-label="顏色">
        {STATUS_LIGHTS.map(light => <button key={light.code} type="button" role="radio" aria-checked={current.light === light.code}
          aria-label={light.label} title={light.label} disabled={busy} className={"cy-lookup-color " + light.code.toLowerCase()}
          onClick={() => setDraft({ ...current, light: light.code })} />)}
      </div> : null}
    </div></td>
    {parents ? <td><Field label="上層分類" presentation="cell">
      <select className={input} value={current.parentId ?? ""} disabled={busy}
        onChange={event => setDraft({ ...current, parentId: event.target.value ? Number(event.target.value) : null })}>
        <option value="">無</option>
        {parents.filter(row => row.id !== current.id).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></Field></td> : null}
    <td className="cy-sheet-ops"><div className="cy-lookup-ops-cell save">
      <IconButton variant="table" icon={Icons.check} label="儲存" disabled={busy} onClick={onSave} />
      <IconButton variant="table" icon={Icons.close} label="取消" disabled={busy} onClick={() => setDraft(null)} />
    </div></td>
  </tr>;

  const columns = 3 + (withCode ? 1 : 0) + (parents ? 1 : 0) + 1;
  return <div className="cy-lookup-table-wrap">
    <table className="cy-sheet-table cy-lookup-table" aria-label={label}>
      <colgroup>
        <col className="cy-lookup-grip" />
        <col className="cy-sheet-seq" />
        {withCode ? <col style={{ width: "6.5em" }} /> : null}
        <col />
        {parents ? <col style={{ width: "8em" }} /> : null}
        <col className="cy-lookup-ops" />
      </colgroup>
      <thead><tr>
        <th scope="col" className="cy-lookup-grip"><span className="cy-visually-hidden">拖拉排序</span></th>
        <th scope="col" className="cy-sheet-seq">項次</th>
        {withCode ? <th scope="col">代碼</th> : null}
        <th scope="col">名稱</th>
        {parents ? <th scope="col">上層分類</th> : null}
        <th scope="col" className="cy-sheet-ops">操作</th>
      </tr></thead>
      <tbody>
        {shown.map(row => draft?.id === row.id ? editRow(draft, seq(row)) : <tr key={row.id}
          className={(row.isActive ? "" : "inactive") + (dragging === row.id ? " dragging" : "")}
          onDragOver={event => { if (!row.pin) over(event, row.id); }} onDrop={event => { event.preventDefault(); commit(ids); }}>
          <td className="cy-lookup-grip">{row.pin || !canDrag ? null
            : <button type="button" className="cy-lookup-handle" draggable aria-label={`拖拉調整「${row.name}」的順序（↑↓ 也可移動）`}
              title="拖拉調整順序" onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(row.id)); setDragging(row.id); }}
              onDragEnd={() => { if (dragging !== null) commit(ids); }} onKeyDown={event => keys(event, row.id)}>{Icons.grip}</button>}</td>
          <td className="cy-sheet-seq">{seq(row)}</td>
          {withCode ? <td className="mono"><span className="cy-sheet-value">{row.code}</span></td> : null}
          <td><span className="cy-sheet-value cy-lookup-name">{status ? <StatusPill status={row} /> : row.name}
            {row.isActive ? null : <span className="cy-lookup-off">停用</span>}</span></td>
          {parents ? <td><span className="cy-sheet-value">{parentName(row.parentId)}</span></td> : null}
          <td className="cy-sheet-ops">{editable ? <div className="cy-lookup-ops-cell">
            <IconButton variant="table" icon={Icons.edit} label={`修改「${row.name}」`} disabled={busy || draft !== null}
              onClick={() => setDraft({ id: row.id, code: row.code, name: row.name, isActive: row.isActive, light: row.light ?? "GREEN",
                parentId: row.parentId ?? null, expectedUpdatedAt: row.updatedAt })} />
            {row.pin ? <span /> : <button type="button" className="cy-lookup-toggle" disabled={busy || draft !== null}
              onClick={() => onToggle(row)}>{row.isActive ? "停用" : "啟用"}</button>}
            {row.pin || (row.usageCount ?? 1) > 0 ? <span /> : <IconButton variant="table" tone="danger" icon={Icons.remove}
              label={`刪除「${row.name}」`} disabled={busy || draft !== null} onClick={() => onDelete(row)} />}
          </div> : null}</td>
        </tr>)}
        {draft && draft.id == null ? editRow(draft, null) : null}
        {!shown.length && !draft ? <tr><td colSpan={columns} className="cy-lookup-empty">尚無資料</td></tr> : null}
      </tbody>
    </table>
  </div>;
}

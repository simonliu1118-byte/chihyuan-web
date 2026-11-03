import { useState, type DragEvent, type KeyboardEvent } from "react";
import type { LookupSetting } from "../../../shared/settings";
import { STATUS_LIGHTS } from "../../../shared/taiwan-regions";
import { IconButton } from "../../ui/actions/IconButton";
import { Icons } from "../../ui/actions/icons";
import { Field } from "../../ui/forms/Field";
import { StatusName } from "./customer/StatusName";

/** One row being edited inline; `id` is absent for a new row. */
export interface LookupDraft {
  id?: number; code: string; name: string; isActive: boolean; light: string; parentId: number | null; expectedUpdatedAt?: string;
}

/**
 * Structural lookups (客戶分類、客戶狀態、負責部門、商品分類) as one dense table (user 2026-11-03):
 * rows are edited in place, the order is changed by dragging the grip (or ↑／↓ on it) and saved at
 * once. Statuses show their light and have no code; pinned statuses (正常, 已歇業) do not move.
 */
export function LookupSettingsTable({ label, rows, editable, busy, status, withCode, parents, draft, setDraft, onSave, onReorder }: {
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
  onReorder: (ids: number[]) => void;
}) {
  const movable = rows.filter(row => !row.pin);
  const [order, setOrder] = useState<number[] | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const ids = order ?? movable.map(row => row.id);
  const byId = new Map(rows.map(row => [row.id, row]));
  const shown = [...rows.filter(row => row.pin === "TOP"), ...ids.map(id => byId.get(id)!).filter(Boolean), ...rows.filter(row => row.pin === "BOTTOM")];
  const canDrag = editable && !busy && draft === null && movable.length > 1;

  function move(list: number[], id: number, to: number) {
    const next = list.filter(value => value !== id);
    next.splice(Math.max(0, Math.min(to, next.length)), 0, id);
    return next;
  }
  function commit(next: number[]) {
    setOrder(null); setDragging(null);
    if (next.join() !== movable.map(row => row.id).join()) onReorder(next);
  }
  function over(event: DragEvent, id: number) {
    if (dragging === null || dragging === id) return;
    event.preventDefault();
    setOrder(move(ids, dragging, ids.indexOf(id)));
  }
  function keys(event: KeyboardEvent, id: number) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const at = ids.indexOf(id);
    commit(move(ids, id, at + (event.key === "ArrowUp" ? -1 : 1)));
  }
  const parentName = (id: number | null | undefined) => parents?.find(row => row.id === id)?.name ?? "";
  const input = "cy-sheet-input";

  const editRow = (current: LookupDraft) => <tr key={current.id ?? "new"} className="editing"
    onKeyDown={event => { if (event.key === "Enter" && !(event.nativeEvent as globalThis.KeyboardEvent).isComposing) { event.preventDefault(); onSave(); } if (event.key === "Escape") setDraft(null); }}>
    <td className="cy-lookup-grip" />
    {withCode ? <td><Field label="代碼" required presentation="cell">
      <input className={input + " mono"} maxLength={80} value={current.code} disabled={busy || current.id != null}
        onChange={event => setDraft({ ...current, code: event.target.value })} /></Field></td> : null}
    <td><div className="cy-lookup-name-edit">
      {status ? <Field label="燈號" presentation="cell">
        <select className={input + " cy-lookup-light"} value={current.light} disabled={busy} onChange={event => setDraft({ ...current, light: event.target.value })}>
          {STATUS_LIGHTS.map(light => <option key={light.code} value={light.code}>{light.emoji} {light.label}</option>)}
        </select></Field> : null}
      <Field label="名稱" required presentation="cell">
        <input className={input} maxLength={200} value={current.name} disabled={busy} autoFocus
          onChange={event => setDraft({ ...current, name: event.target.value })} /></Field>
    </div></td>
    {parents ? <td><Field label="上層分類" presentation="cell">
      <select className={input} value={current.parentId ?? ""} disabled={busy}
        onChange={event => setDraft({ ...current, parentId: event.target.value ? Number(event.target.value) : null })}>
        <option value="">無</option>
        {parents.filter(row => row.id !== current.id).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></Field></td> : null}
    <td className="cy-lookup-active"><Field label="啟用" presentation="cell">
      <input type="checkbox" checked={current.isActive} disabled={busy || current.id == null}
        onChange={event => setDraft({ ...current, isActive: event.target.checked })} /></Field></td>
    <td className="cy-sheet-ops">
      <IconButton variant="table" icon={Icons.check} label="儲存" disabled={busy} onClick={onSave} />
      <IconButton variant="table" icon={Icons.close} label="取消" disabled={busy} onClick={() => setDraft(null)} />
    </td>
  </tr>;

  const columns = 4 + (withCode ? 1 : 0) + (parents ? 1 : 0);
  return <div className="cy-lookup-table-wrap">
    <table className="cy-sheet-table cy-lookup-table" aria-label={label}>
      <colgroup>
        <col className="cy-lookup-grip" />
        {withCode ? <col style={{ width: "7em" }} /> : null}
        <col />
        {parents ? <col style={{ width: "9em" }} /> : null}
        <col style={{ width: "4em" }} />
        <col className="cy-sheet-ops" />
      </colgroup>
      <thead><tr>
        <th scope="col" className="cy-lookup-grip"><span className="cy-visually-hidden">排序</span></th>
        {withCode ? <th scope="col">代碼</th> : null}
        <th scope="col">名稱</th>
        {parents ? <th scope="col">上層分類</th> : null}
        <th scope="col" className="cy-lookup-active">啟用</th>
        <th scope="col" className="cy-sheet-ops"><span className="cy-visually-hidden">操作</span></th>
      </tr></thead>
      <tbody>
        {shown.map(row => draft?.id === row.id ? editRow(draft) : <tr key={row.id}
          className={(row.isActive ? "" : "inactive") + (dragging === row.id ? " dragging" : "")}
          onDragOver={event => { if (!row.pin) over(event, row.id); }} onDrop={event => { event.preventDefault(); commit(ids); }}>
          <td className="cy-lookup-grip">{row.pin || !canDrag ? null
            : <button type="button" className="cy-lookup-handle" draggable aria-label={`拖拉調整「${row.name}」的順序（↑↓ 也可移動）`}
              title="拖拉調整順序" onDragStart={event => { event.dataTransfer.effectAllowed = "move"; setDragging(row.id); }}
              onDragEnd={() => { if (dragging !== null) commit(ids); }} onKeyDown={event => keys(event, row.id)}>{Icons.grip}</button>}</td>
          {withCode ? <td className="mono"><span className="cy-sheet-value">{row.code}</span></td> : null}
          <td><span className="cy-sheet-value">{status ? <StatusName status={row} /> : row.name}</span></td>
          {parents ? <td><span className="cy-sheet-value">{parentName(row.parentId)}</span></td> : null}
          <td className="cy-lookup-active"><span className="cy-sheet-value">{row.isActive ? "✓" : "停用"}</span></td>
          <td className="cy-sheet-ops">{editable ? <IconButton variant="table" icon={Icons.edit} label={`修改「${row.name}」`} disabled={busy || draft !== null}
            onClick={() => setDraft({ id: row.id, code: row.code, name: row.name, isActive: row.isActive, light: row.light ?? "GREEN",
              parentId: row.parentId ?? null, expectedUpdatedAt: row.updatedAt })} /> : null}</td>
        </tr>)}
        {draft && draft.id == null ? editRow(draft) : null}
        {!shown.length && !draft ? <tr><td colSpan={columns} className="cy-lookup-empty">尚無資料</td></tr> : null}
      </tbody>
    </table>
  </div>;
}

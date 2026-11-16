import { PlatformMarginSettings } from "./item/PlatformMarginSettings";
import { Icons } from "../../ui/actions/icons";
import {Field,CheckField,FormSection} from "../../ui/forms/Field";
import { SegmentedControl } from "../../ui/primitives/SegmentedControl";
import { Loading } from "../../ui/feedback/Loading";
import { Dialog } from "../../ui/overlays/Dialog";
import { enterAdvancesFields } from "../../ui/foundation/enter-advance";
import { useFeedbackMessage } from "../../ui/feedback/FeedbackProvider";
import { useUnsavedChangesGuard } from "../../ui/foundation/useUnsavedChangesGuard";
import { useConfirmation } from "../../ui/overlays/useConfirmation";
import "./module-settings.css";
import { LookupSettingsTable, type LookupDraft } from "./LookupSettingsTable";
import { SETTINGS_SAVED_EVENT } from "./settings-events";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { SettingsSnapshot, LookupSetting, WorkLogScoringRowSetting } from "../../../shared/settings";
import { ApiClientError } from "../../api/client";
import { deleteSetting, loadSettings, saveSetting } from "../api/settings-audit-client";

/**
 * A module's own settings (BD-043 authority unchanged): structural lookups are Super Admin-only,
 * WorkLog configuration is Admin or Super Admin. Each module opens only its own sections.
 */
export type SettingsSection = "department" | "customer_category" | "customer_status" | "item_category" | "item_platform" | "item_margin" | "worklog-categories" | "worklog-platforms" | "scoring";
type Section = SettingsSection;
const allSections: { key: Section; label: string; structural?: boolean }[] = [
  { key: "customer_category", label: "客戶分類", structural: true }, { key: "customer_status", label: "客戶狀態", structural: true },
  { key: "department", label: "負責部門", structural: true }, { key: "item_category", label: "商品分類", structural: true },
  { key: "item_platform", label: "網路平台", structural: true },
  { key: "item_margin", label: "平台費用與優惠", structural: true },
  { key: "worklog-categories", label: "日誌類別" }, { key: "worklog-platforms", label: "日誌平台" },
  { key: "scoring", label: "計分設定" },
];
interface Draft {
  id?: number; code: string; name: string; sortOrder: number; isActive: boolean; expectedUpdatedAt?: string;
  parentId: number | null; inputMode: "boolean" | "quantity"; unitLabel: string; light: string;
}
const blank = (): Draft => ({ code: "", name: "", sortOrder: 0, isActive: true, parentId: null, inputMode: "boolean", unitLabel: "", light: "GREEN" });

function message(error: unknown): string {
  if (error instanceof ApiClientError && error.fields) return Object.values(error.fields).join("；");
  return error instanceof Error ? error.message : "資料暫時無法讀取";
}
function rowsFor(snapshot: SettingsSnapshot, section: Section): readonly LookupSetting[] {
  switch (section) {
    case "department": return snapshot.departments;
    case "customer_category": return snapshot.customerCategories;
    case "customer_status": return snapshot.customerStatuses;
    case "item_category": return snapshot.itemCategories;
    case "item_platform": return snapshot.itemPlatforms;
    case "worklog-categories": return snapshot.workLogCategories;
    case "worklog-platforms": return snapshot.workLogPlatforms;
    default: return [];
  }
}
export function ModuleSettingsPanel({ role, only, onDirtyChange }: {
  role: "ADMIN" | "SUPER_ADMIN" | "USER"; only: readonly SettingsSection[]; onDirtyChange?: (dirty: boolean) => void;
}) {
  const sections = allSections.filter((row) => only.includes(row.key));
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [section, setSection] = useState<Section>(sections[0].key);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, , setError] = useFeedbackMessage<string>("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [target, setTarget] = useState("");
  const [minimum, setMinimum] = useState("");
  const [score, setScore] = useState<Partial<WorkLogScoringRowSetting> | null>(null);
  const [marginDirty, setMarginDirty] = useState(false);
  const [lookupDraft, setLookupDraft] = useState<LookupDraft | null>(null);
  const { confirm, confirmationDialog } = useConfirmation();
  const dirty = marginDirty || draft !== null || lookupDraft !== null || score !== null || (!!snapshot && (target !== (snapshot.workLogScoringConfig?.targetAverageDailyScore ?? "") || minimum !== (snapshot.workLogScoringConfig?.minimumAverageDailyScore ?? "")));
  useUnsavedChangesGuard({ active: dirty, blocked: busy });
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  function install(data: SettingsSnapshot) {
    setSnapshot(data); setTarget(data.workLogScoringConfig?.targetAverageDailyScore ?? ""); setMinimum(data.workLogScoringConfig?.minimumAverageDailyScore ?? "");
  }
  useEffect(() => {
    let active = true;
    loadSettings().then(data => { if (active) install(data); }).catch(e => { if (active) setError(message(e)); });
    return () => { active = false; };
  }, []);
  async function save(path: string, method: "POST" | "PATCH" | "PUT", input: unknown) {
    setBusy(true); setError(""); setNotice("");
    try {
      await saveSetting(path, method, input); install(await loadSettings()); setDraft(null); setScore(null); setLookupDraft(null); setNotice("設定已儲存");
      window.dispatchEvent(new CustomEvent(SETTINGS_SAVED_EVENT));
    }
    catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!draft) return;
    const prefix = sections.find(row => row.key === section)?.structural ? `lookups/${section}` : section;
    const { light: _light, ...rest } = draft;
    await save(`${prefix}${draft.id ? `/${draft.id}` : ""}`, draft.id ? "PATCH" : "POST", {
      ...rest, unitLabel: draft.unitLabel || null,
    });
  }
  function saveLookup() {
    if (!lookupDraft || busy) return;
    if (!lookupDraft.name.trim() || (!status && section !== "item_platform" && lookupDraft.id == null && !lookupDraft.code.trim())) { setError("請填寫" + (lookupDraft.name.trim() ? "代碼" : "名稱")); return; }
    const body = { name: lookupDraft.name, isActive: lookupDraft.isActive, parentId: lookupDraft.parentId,
      ...(status ? { light: lookupDraft.light } : {}),
      ...(lookupDraft.id == null ? (status || section === "item_platform" ? {} : { code: lookupDraft.code }) : { expectedUpdatedAt: lookupDraft.expectedUpdatedAt }) };
    void save(`lookups/${section}${lookupDraft.id ? `/${lookupDraft.id}` : ""}`, lookupDraft.id ? "PATCH" : "POST", body);
  }
  /** Drag order saves in the background: the table keeps the new order and nothing is locked. */
  async function reorderLookup(ids: number[]): Promise<boolean> {
    setError(""); setNotice("");
    try {
      await saveSetting(`lookups/${section}/order`, "PUT", { ids }); install(await loadSettings());
      window.dispatchEvent(new CustomEvent(SETTINGS_SAVED_EVENT));
      return true;
    } catch (e) { setError(message(e)); return false; }
  }
  function toggleLookup(row: LookupSetting) {
    void save(`lookups/${section}/${row.id}`, "PATCH", { name: row.name, isActive: !row.isActive, parentId: row.parentId ?? null,
      expectedUpdatedAt: row.updatedAt, ...(status ? { light: row.light ?? "GREEN" } : {}) });
  }
  async function deleteLookup(row: LookupSetting) {
    if (!(await confirm({ title: "刪除設定", description: `確定刪除「${row.name}」？目前沒有任何資料使用它。`, confirmLabel: "刪除", confirmTone: "danger" }))) return;
    setBusy(true); setError(""); setNotice("");
    try { await deleteSetting(`lookups/${section}/${row.id}`); install(await loadSettings()); setNotice("已刪除"); window.dispatchEvent(new CustomEvent(SETTINGS_SAVED_EVENT)); }
    catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  function edit(row: LookupSetting) {
    const category = snapshot?.workLogCategories.find(item => item.id === row.id);
    setDraft({ ...blank(), ...row, parentId: row.parentId ?? null, light: row.light ?? "GREEN", expectedUpdatedAt: row.updatedAt,
      ...(section === "worklog-categories" ? { inputMode: category?.inputMode ?? "boolean", unitLabel: category?.unitLabel ?? "" } : {}) });
    setNotice("");
  }
  const structural = sections.find(row => row.key === section)?.structural;
  // Customer statuses (user 2026-11-03): a name and a light; the server assigns the code.
  const status = section === "customer_status";
  const editable = !structural || role === "SUPER_ADMIN";
  const rows = snapshot ? rowsFor(snapshot, section) : [];
  return <>
    {error ? <div className="cy-op-notice danger" role="alert">{error}<button className="cy-op-button" disabled={busy} onClick={() => loadSettings().then(install).then(() => setError("")).catch(e => setError(message(e)))}>重新讀取</button></div> : null}
    {notice ? <div className="cy-op-notice" role="status">{notice}</div> : null}
    <div className="cy-page-toolbar">
      {snapshot && (section === "scoring" || editable)
        ? section === "scoring"
          ? <button className="cy-op-button primary" type="button" disabled={busy} onClick={() => setScore({ workLogCategoryId: null, customName: "", scoreValue: "", description: "", note: "", sortOrder: 0, isActive: true })}>＋ 新增參考列</button>
          : structural
            ? null
            : <button className="cy-op-button primary" type="button" disabled={busy} onClick={() => setDraft(blank())}>＋ 新增{sections.find(row => row.key === section)?.label}</button>
        : null}
      {sections.length > 1 ? <SegmentedControl label="設定項目" value={section} disabled={busy || marginDirty}
        options={sections.map(row => ({ value: row.key, label: row.label }))} onChange={next => { setSection(next); setDraft(null); setScore(null); setLookupDraft(null); }} /> : null}
      {snapshot && structural && editable && section !== "item_margin" ? <button className="cy-op-button primary compact cy-settings-add" type="button" disabled={busy || lookupDraft !== null}
        onClick={() => setLookupDraft({ code: "", name: "", isActive: true, light: "GREEN", parentId: null })}>＋ 新增</button> : null}
    </div>
    {!snapshot ? <section className="cy-op-panel"><Loading /></section> : section === "item_margin" ? <PlatformMarginSettings onDirtyChange={setMarginDirty}/> : structural ? <>
      {!editable ? <p className="cy-settings-readonly">僅超級管理員可修改</p> : null}
      <LookupSettingsTable label={sections.find(row => row.key === section)?.label ?? ""} rows={rows} editable={editable} busy={busy}
        status={status} withCode={!status && section !== "item_platform"} parents={section === "item_category" ? snapshot.itemCategories : undefined}
        draft={lookupDraft} setDraft={setLookupDraft} onSave={saveLookup}
        onReorder={reorderLookup} onToggle={toggleLookup} onDelete={row => void deleteLookup(row)} />
      {confirmationDialog}
    </> : section === "scoring" ? <>
      <form onKeyDown={enterAdvancesFields} className="cy-op-panel cy-op-form-card" onSubmit={event => { event.preventDefault(); void save("worklog-scoring-config", "PUT", { targetAverageDailyScore: target || null, minimumAverageDailyScore: minimum || null, expectedRevision: snapshot.workLogScoringConfig?.revision ?? null }); }}>
    <FormSection>
        <h2>每日平均分數</h2><p>已審核日誌的結果保留，不因設定變更重新計分。</p><div className="cy-op-grid-two"><Field label="目標" size="s"><input className="cy-op-input" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} /></Field><Field label="最低" size="s"><input className="cy-op-input" inputMode="decimal" value={minimum} onChange={e => setMinimum(e.target.value)} /></Field></div><button className="cy-op-button primary" disabled={busy}>儲存門檻</button>
      
    </FormSection>
  </form>
      <section className="cy-op-panel"><div className="cy-op-panel-header"><h2>計分參考列</h2></div><table className="cy-op-table"><thead><tr><th>類別／名稱</th><th>分數</th><th>說明</th><th>狀態</th><th></th></tr></thead><tbody>{snapshot.workLogScoringRows.map(row => <tr key={row.id}><td>{snapshot.workLogCategories.find(c => c.id === row.workLogCategoryId)?.name ?? row.customName}</td><td>{row.scoreValue ?? "—"}</td><td>{row.description}</td><td>{row.isActive ? "啟用" : "停用"}</td><td><button className="cy-op-button" disabled={busy} onClick={() => setScore(row)}>修改</button></td></tr>)}</tbody></table></section>
      {score ? <form onKeyDown={enterAdvancesFields} className="cy-op-panel cy-op-form-card" onSubmit={event => { event.preventDefault(); void save("worklog-scoring-rows", "PUT", { ...score, scoreValue: score.scoreValue || null, expectedUpdatedAt: score.updatedAt }); }}>
    <FormSection><h2>{score.id ? "編輯" : "新增"}參考列</h2><div className="cy-op-grid-two"><Field label="類別" size="m"><select className="cy-op-input" value={score.workLogCategoryId ?? ""} onChange={e => setScore({ ...score, workLogCategoryId: e.target.value ? Number(e.target.value) : null, customName: e.target.value ? null : "" })}><option value="">自訂名稱</option>{snapshot.workLogCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>{score.workLogCategoryId == null ? <Field label="名稱" size="m" required><input className="cy-op-input" value={score.customName ?? ""} onChange={e => setScore({ ...score, customName: e.target.value })} /></Field> : null}<Field label="分數" size="s"><input className="cy-op-input" inputMode="decimal" value={score.scoreValue ?? ""} onChange={e => setScore({ ...score, scoreValue: e.target.value })} /></Field><Field label="排序" size="s"><input className="cy-op-input" type="number" min="0" step="1" value={score.sortOrder ?? 0} onChange={e => setScore({ ...score, sortOrder: Number(e.target.value) })} /></Field><Field label="說明" size="l"><input className="cy-op-input" value={score.description ?? ""} onChange={e => setScore({ ...score, description: e.target.value })} /></Field><Field label="備註" size="l"><input className="cy-op-input" value={score.note ?? ""} onChange={e => setScore({ ...score, note: e.target.value })} /></Field><CheckField  label="啟用" size="s"  checked={score.isActive ?? true} onChange={e => setScore({ ...score, isActive: e.target.checked })} /></div><div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={() => setScore(null)}>取消</button><button className="cy-op-button primary" disabled={busy}>儲存</button></div>
    </FormSection>
  </form> : null}
    </> : <>
      <section className="cy-op-panel"><div className="cy-op-panel-header"><h2>{sections.find(row => row.key === section)?.label}</h2>{!editable ? <span>僅超級管理員可修改</span> : null}</div><table className="cy-op-table"><thead><tr><th>代碼</th><th>名稱</th><th>排序</th><th>狀態</th><th></th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{row.sortOrder}</td><td>{row.isActive ? "啟用" : "停用"}</td><td>{editable ? <button className="cy-op-button" disabled={busy} onClick={() => edit(row)}>修改</button> : null}</td></tr>)}</tbody></table>{!rows.length ? <p>尚無設定資料。</p> : null}</section>
      {draft ? <form onKeyDown={enterAdvancesFields} className="cy-op-panel cy-op-form-card" onSubmit={submit}>
    <FormSection><h2>{draft.id ? "編輯" : "新增"}設定</h2><div className="cy-op-grid-two"><Field label="代碼" size="m" required><input className="cy-op-input" maxLength={80} disabled={draft.id != null || busy} value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value })} /></Field><Field label="名稱" size="m" required><input className="cy-op-input" maxLength={200} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></Field><Field label="排序" size="s"><input className="cy-op-input" type="number" min="0" step="1" value={draft.sortOrder} onChange={e => setDraft({ ...draft, sortOrder: Number(e.target.value) })} /></Field>{section === "item_category" ? <Field label="上層分類" size="m"><select className="cy-op-input" value={draft.parentId ?? ""} onChange={e => setDraft({ ...draft, parentId: e.target.value ? Number(e.target.value) : null })}><option value="">無</option>{snapshot.itemCategories.filter(c => c.id !== draft.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field> : null}{section === "worklog-categories" ? <><Field label="輸入方式" size="m"><select className="cy-op-input" value={draft.inputMode} onChange={e => setDraft({ ...draft, inputMode: e.target.value as "boolean" | "quantity" })}><option value="boolean">是否完成</option><option value="quantity">數量</option></select></Field><Field label="數量單位" size="s"><input className="cy-op-input" value={draft.unitLabel} onChange={e => setDraft({ ...draft, unitLabel: e.target.value })} /></Field></> : null}{draft.id ? <CheckField  label="啟用" size="s"  checked={draft.isActive} onChange={e => setDraft({ ...draft, isActive: e.target.checked })} /> : null}</div><div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={() => setDraft(null)}>取消</button><button className="cy-op-button primary" disabled={busy}>儲存</button></div>
    </FormSection>
  </form> : null}
    </>}
  </>;
}

/**
 * Open module-specific settings in a dialog. Closing asks only about this dialog's own unsaved edits:
 * the app-wide guard ("切換模組？") is for leaving a module, not for closing a dialog (V0.9.97 bug).
 */
export function ModuleSettingsButton({ role, label, only }: {
  role: "ADMIN" | "SUPER_ADMIN" | "USER"; label: string; only: readonly SettingsSection[];
}) {
  const [open, setOpen] = useState(false);
  const dirty = useRef(false);
  const onDirtyChange = useCallback((value: boolean) => { dirty.current = value; }, []);
  const { confirm, confirmationDialog } = useConfirmation();
  async function close() {
    if (dirty.current && !(await confirm({ title: "放棄尚未儲存的設定？", description: "目前新增或修改的設定尚未儲存，確定關閉？",
      confirmLabel: "放棄並關閉", confirmTone: "danger" }))) return;
    dirty.current = false;
    setOpen(false);
  }
  if (role === "USER") return null;
  const wide = only.includes("scoring") || only.includes("item_margin");
  return <>
    <button className="cy-op-button cy-module-settings-trigger" type="button" onClick={() => setOpen(true)}>
      <span aria-hidden="true">{Icons.settings}</span> 設定
    </button>
    {open ? <Dialog open title={label + "設定"} size={wide ? "large" : "medium"} className="cy-module-settings-dialog" onClose={() => void close()}>
      <ModuleSettingsPanel role={role} only={only} onDirtyChange={onDirtyChange} />
    </Dialog> : null}
    {confirmationDialog}
  </>;
}

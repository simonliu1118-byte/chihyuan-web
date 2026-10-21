import {Field,CheckField,FormSection} from "../../ui/forms/Field";
import { Loading } from "../../ui/feedback/Loading";
import { Dialog } from "../../ui/overlays/Dialog";
import { enterAdvancesFields } from "../../ui/foundation/enter-advance";
import { useFeedbackMessage } from "../../ui/feedback/FeedbackProvider";
import { useNavigationGuard, useUnsavedChangesGuard } from "../../ui/foundation/useUnsavedChangesGuard";
import { useEffect, useState, type FormEvent } from "react";
import type { SettingsSnapshot, LookupSetting, WorkLogScoringRowSetting } from "../../../shared/settings";
import { ApiClientError } from "../../api/client";
import { loadSettings, saveSetting } from "../api/settings-audit-client";

/**
 * A module's own settings (BD-043 authority unchanged): structural lookups are Super Admin-only,
 * WorkLog configuration is Admin or Super Admin. Each module opens only its own sections.
 */
export type SettingsSection = "department" | "customer_category" | "customer_status" | "item_category" | "worklog-categories" | "worklog-platforms" | "scoring";
type Section = SettingsSection;
const allSections: { key: Section; label: string; structural?: boolean }[] = [
  { key: "customer_category", label: "客戶分類", structural: true }, { key: "customer_status", label: "客戶狀態", structural: true },
  { key: "department", label: "負責部門", structural: true }, { key: "item_category", label: "商品分類", structural: true },
  { key: "worklog-categories", label: "日誌類別" }, { key: "worklog-platforms", label: "日誌平台" },
  { key: "scoring", label: "計分設定" },
];
interface Draft {
  id?: number; code: string; name: string; sortOrder: number; isActive: boolean; expectedUpdatedAt?: string;
  parentId: number | null; inputMode: "boolean" | "quantity"; unitLabel: string;
}
const blank = (): Draft => ({ code: "", name: "", sortOrder: 0, isActive: true, parentId: null, inputMode: "boolean", unitLabel: "" });
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
    case "worklog-categories": return snapshot.workLogCategories;
    case "worklog-platforms": return snapshot.workLogPlatforms;
    default: return [];
  }
}
export function ModuleSettingsPanel({ role, only }: { role: "ADMIN" | "SUPER_ADMIN" | "USER"; only: readonly SettingsSection[] }) {
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
  useUnsavedChangesGuard({ active: draft !== null || score !== null || (!!snapshot && (target !== (snapshot.workLogScoringConfig?.targetAverageDailyScore ?? "") || minimum !== (snapshot.workLogScoringConfig?.minimumAverageDailyScore ?? ""))), blocked: busy });
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
    try { await saveSetting(path, method, input); install(await loadSettings()); setDraft(null); setScore(null); setNotice("設定已儲存"); }
    catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!draft) return;
    const prefix = sections.find(row => row.key === section)?.structural ? `lookups/${section}` : section;
    await save(`${prefix}${draft.id ? `/${draft.id}` : ""}`, draft.id ? "PATCH" : "POST", {
      ...draft, unitLabel: draft.unitLabel || null,
    });
  }
  function edit(row: LookupSetting) {
    const category = snapshot?.workLogCategories.find(item => item.id === row.id);
    setDraft({ ...blank(), ...row, parentId: row.parentId ?? null, expectedUpdatedAt: row.updatedAt,
      ...(section === "worklog-categories" ? { inputMode: category?.inputMode ?? "boolean", unitLabel: category?.unitLabel ?? "" } : {}) });
    setNotice("");
  }
  const structural = sections.find(row => row.key === section)?.structural;
  const editable = !structural || role === "SUPER_ADMIN";
  const rows = snapshot ? rowsFor(snapshot, section) : [];
  return <>
    {error ? <div className="cy-op-notice danger" role="alert">{error}<button className="cy-op-button" disabled={busy} onClick={() => loadSettings().then(install).then(() => setError("")).catch(e => setError(message(e)))}>重新讀取</button></div> : null}
    {notice ? <div className="cy-op-notice" role="status">{notice}</div> : null}
    <div className="cy-page-toolbar">
      {snapshot && (section === "scoring" || editable)
        ? section === "scoring"
          ? <button className="cy-op-button primary" type="button" disabled={busy} onClick={() => setScore({ workLogCategoryId: null, customName: "", scoreValue: "", description: "", note: "", sortOrder: 0, isActive: true })}>＋ 新增參考列</button>
          : <button className="cy-op-button primary" type="button" disabled={busy} onClick={() => setDraft(blank())}>＋ 新增{sections.find(row => row.key === section)?.label}</button>
        : null}
      {sections.length > 1 ? <div className="cy-segmented" role="group" aria-label="設定項目">{sections.map(row => <button key={row.key} type="button" aria-pressed={section === row.key} disabled={busy} onClick={() => { setSection(row.key); setDraft(null); setScore(null); }}>{row.label}</button>)}</div> : null}
    </div>
    {!snapshot ? <section className="cy-op-panel"><Loading /></section> : section === "scoring" ? <>
      <form onKeyDown={enterAdvancesFields} className="cy-op-panel cy-op-form-card" onSubmit={event => { event.preventDefault(); void save("worklog-scoring-config", "PUT", { targetAverageDailyScore: target || null, minimumAverageDailyScore: minimum || null, expectedRevision: snapshot.workLogScoringConfig?.revision ?? null }); }}>
    <FormSection>
        <h2>每日平均分數</h2><p>已審核日誌的結果保留，不因設定變更重新計分。</p><div className="cy-op-grid-two"><Field  label="目標" size="s"><input className="cy-op-input" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} /></Field><Field  label="最低" size="m"><input className="cy-op-input" inputMode="decimal" value={minimum} onChange={e => setMinimum(e.target.value)} /></Field></div><button className="cy-op-button primary" disabled={busy}>儲存門檻</button>
      
    </FormSection>
  </form>
      <section className="cy-op-panel"><div className="cy-op-panel-header"><h2>計分參考列</h2></div><table className="cy-op-table"><thead><tr><th>類別／名稱</th><th>分數</th><th>說明</th><th>狀態</th><th></th></tr></thead><tbody>{snapshot.workLogScoringRows.map(row => <tr key={row.id}><td>{snapshot.workLogCategories.find(c => c.id === row.workLogCategoryId)?.name ?? row.customName}</td><td>{row.scoreValue ?? "—"}</td><td>{row.description}</td><td>{row.isActive ? "啟用" : "停用"}</td><td><button className="cy-op-button" disabled={busy} onClick={() => setScore(row)}>修改</button></td></tr>)}</tbody></table></section>
      {score ? <form onKeyDown={enterAdvancesFields} className="cy-op-panel cy-op-form-card" onSubmit={event => { event.preventDefault(); void save("worklog-scoring-rows", "PUT", { ...score, scoreValue: score.scoreValue || null, expectedUpdatedAt: score.updatedAt }); }}>
    <FormSection><h2>{score.id ? "編輯" : "新增"}參考列</h2><div className="cy-op-grid-two"><Field  label="類別" size="m"><select className="cy-op-input" value={score.workLogCategoryId ?? ""} onChange={e => setScore({ ...score, workLogCategoryId: e.target.value ? Number(e.target.value) : null, customName: e.target.value ? null : "" })}><option value="">自訂名稱</option>{snapshot.workLogCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>{score.workLogCategoryId == null ? <Field  label="名稱" size="m" required><input className="cy-op-input" value={score.customName ?? ""} onChange={e => setScore({ ...score, customName: e.target.value })} /></Field> : null}<Field  label="分數" size="s"><input className="cy-op-input" inputMode="decimal" value={score.scoreValue ?? ""} onChange={e => setScore({ ...score, scoreValue: e.target.value })} /></Field><Field  label="排序" size="m"><input className="cy-op-input" type="number" min="0" step="1" value={score.sortOrder ?? 0} onChange={e => setScore({ ...score, sortOrder: Number(e.target.value) })} /></Field><Field  label="說明" size="l"><input className="cy-op-input" value={score.description ?? ""} onChange={e => setScore({ ...score, description: e.target.value })} /></Field><Field  label="備註" size="l"><input className="cy-op-input" value={score.note ?? ""} onChange={e => setScore({ ...score, note: e.target.value })} /></Field><CheckField  label="啟用" size="s"  checked={score.isActive ?? true} onChange={e => setScore({ ...score, isActive: e.target.checked })} /></div><div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={() => setScore(null)}>取消</button><button className="cy-op-button primary" disabled={busy}>儲存</button></div>
    </FormSection>
  </form> : null}
    </> : <>
      <section className="cy-op-panel"><div className="cy-op-panel-header"><h2>{sections.find(row => row.key === section)?.label}</h2>{!editable ? <span>僅超級管理員可修改</span> : null}</div><table className="cy-op-table"><thead><tr><th>代碼</th><th>名稱</th><th>排序</th><th>狀態</th><th></th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{row.sortOrder}</td><td>{row.isActive ? "啟用" : "停用"}</td><td>{editable ? <button className="cy-op-button" disabled={busy} onClick={() => edit(row)}>修改</button> : null}</td></tr>)}</tbody></table>{!rows.length ? <p>尚無設定資料。</p> : null}</section>
      {draft ? <form onKeyDown={enterAdvancesFields} className="cy-op-panel cy-op-form-card" onSubmit={submit}>
    <FormSection><h2>{draft.id ? "編輯" : "新增"}設定</h2><div className="cy-op-grid-two"><Field  label="代碼" size="m" required><input className="cy-op-input" maxLength={80} disabled={draft.id != null || busy} value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value })} /></Field><Field  label="名稱" size="m" required><input className="cy-op-input" maxLength={200} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></Field><Field  label="排序" size="m"><input className="cy-op-input" type="number" min="0" step="1" value={draft.sortOrder} onChange={e => setDraft({ ...draft, sortOrder: Number(e.target.value) })} /></Field>{section === "item_category" ? <Field  label="上層分類" size="m"><select className="cy-op-input" value={draft.parentId ?? ""} onChange={e => setDraft({ ...draft, parentId: e.target.value ? Number(e.target.value) : null })}><option value="">無</option>{snapshot.itemCategories.filter(c => c.id !== draft.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field> : null}{section === "worklog-categories" ? <><Field  label="輸入方式" size="m"><select className="cy-op-input" value={draft.inputMode} onChange={e => setDraft({ ...draft, inputMode: e.target.value as "boolean" | "quantity" })}><option value="boolean">是否完成</option><option value="quantity">數量</option></select></Field><Field  label="數量單位" size="s"><input className="cy-op-input" value={draft.unitLabel} onChange={e => setDraft({ ...draft, unitLabel: e.target.value })} /></Field></> : null}{draft.id ? <CheckField  label="啟用" size="s"  checked={draft.isActive} onChange={e => setDraft({ ...draft, isActive: e.target.checked })} /> : null}</div><div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={() => setDraft(null)}>取消</button><button className="cy-op-button primary" disabled={busy}>儲存</button></div>
    </FormSection>
  </form> : null}
    </>}
  </>;
}

/** Open module-specific settings in a large dialog, preserving existing permissions and forms. */
export function ModuleSettingsButton({ role, label, only }: {
  role: "ADMIN" | "SUPER_ADMIN" | "USER"; label: string; only: readonly SettingsSection[];
}) {
  const [open, setOpen] = useState(false);
  const { canLeave } = useNavigationGuard();
  async function close() {
    if (await canLeave()) setOpen(false);
  }
  if (role === "USER") return null;
  return <>
    <button className="cy-op-button cy-module-settings-trigger" type="button" onClick={() => setOpen(true)}>
      <span aria-hidden="true">⚙️</span> 設定
    </button>
    {open ? <Dialog open title={label + "設定"} size="large" onClose={() => void close()}>
      <ModuleSettingsPanel role={role} only={only} />
    </Dialog> : null}
  </>;
}

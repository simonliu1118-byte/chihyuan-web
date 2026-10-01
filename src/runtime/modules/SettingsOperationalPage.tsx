import { useEffect, useState, type FormEvent } from "react";
import type { SettingsSnapshot, LookupSetting, WorkLogScoringRowSetting } from "../../../shared/settings";
import { ApiClientError } from "../../api/client";
import { loadSettings, saveSetting } from "../api/settings-audit-client";

type Section = "department" | "customer_category" | "customer_status" | "item_category" | "worklog-categories" | "worklog-platforms" | "scoring" | "tags";
const sections: { key: Section; label: string; structural?: boolean }[] = [
  { key: "department", label: "部門", structural: true }, { key: "customer_category", label: "客戶分類", structural: true },
  { key: "customer_status", label: "客戶狀態", structural: true }, { key: "item_category", label: "商品分類", structural: true },
  { key: "worklog-categories", label: "日誌類別" }, { key: "worklog-platforms", label: "日誌平台" },
  { key: "scoring", label: "計分設定" }, { key: "tags", label: "分類標籤" },
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
export function SettingsOperationalPage({ role }: { role: "ADMIN" | "SUPER_ADMIN" | "USER" }) {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [section, setSection] = useState<Section>("department");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [target, setTarget] = useState("");
  const [minimum, setMinimum] = useState("");
  const [score, setScore] = useState<Partial<WorkLogScoringRowSetting> | null>(null);
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
    <div className="cy-op-page-header"><div><h1>設定／管理</h1><p>結構設定由超級管理員維護；管理員可維護工作日誌與計分設定。</p></div></div>
    {error ? <div className="cy-op-notice danger" role="alert">{error}<button className="cy-op-button" disabled={busy} onClick={() => loadSettings().then(install).then(() => setError("")).catch(e => setError(message(e)))}>重新讀取</button></div> : null}
    {notice ? <div className="cy-op-notice" role="status">{notice}</div> : null}
    <div className="cy-op-action-bar">{sections.map(row => <button key={row.key} className={`cy-op-button ${section === row.key ? "primary" : ""}`} disabled={busy} onClick={() => { setSection(row.key); setDraft(null); setScore(null); }}>{row.label}</button>)}</div>
    {!snapshot ? <section className="cy-op-panel">讀取設定中…</section> : section === "tags" ? <section className="cy-op-panel"><p>分類標籤保留作資料分類；帳號與業務模組權限請於帳號管理維護。</p><table className="cy-op-table"><thead><tr><th>代碼</th><th>名稱</th><th>狀態</th></tr></thead><tbody>{snapshot.appTags.map(row => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{row.isActive ? "啟用" : "停用"}</td></tr>)}</tbody></table></section> : section === "scoring" ? <>
      <form className="cy-op-panel cy-op-form-card" onSubmit={event => { event.preventDefault(); void save("worklog-scoring-config", "PUT", { targetAverageDailyScore: target || null, minimumAverageDailyScore: minimum || null, expectedRevision: snapshot.workLogScoringConfig?.revision ?? null }); }}>
        <h2>每日平均分數</h2><p>已審核日誌的結果保留，不因設定變更重新計分。</p><div className="cy-op-grid-two"><label>目標<input className="cy-op-input" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} /></label><label>最低<input className="cy-op-input" inputMode="decimal" value={minimum} onChange={e => setMinimum(e.target.value)} /></label></div><button className="cy-op-button primary" disabled={busy}>儲存門檻</button>
      </form>
      <section className="cy-op-panel"><div className="cy-op-panel-header"><h2>計分參考列</h2><button className="cy-op-button" disabled={busy} onClick={() => setScore({ workLogCategoryId: null, customName: "", scoreValue: "", description: "", note: "", sortOrder: 0, isActive: true })}>新增參考列</button></div><table className="cy-op-table"><thead><tr><th>類別／名稱</th><th>分數</th><th>說明</th><th>狀態</th><th></th></tr></thead><tbody>{snapshot.workLogScoringRows.map(row => <tr key={row.id}><td>{snapshot.workLogCategories.find(c => c.id === row.workLogCategoryId)?.name ?? row.customName}</td><td>{row.scoreValue ?? "—"}</td><td>{row.description}</td><td>{row.isActive ? "啟用" : "停用"}</td><td><button className="cy-op-button" disabled={busy} onClick={() => setScore(row)}>編輯</button></td></tr>)}</tbody></table></section>
      {score ? <form className="cy-op-panel cy-op-form-card" onSubmit={event => { event.preventDefault(); void save("worklog-scoring-rows", "PUT", { ...score, scoreValue: score.scoreValue || null, expectedUpdatedAt: score.updatedAt }); }}><h2>{score.id ? "編輯" : "新增"}參考列</h2><div className="cy-op-grid-two"><label>類別<select className="cy-op-input" value={score.workLogCategoryId ?? ""} onChange={e => setScore({ ...score, workLogCategoryId: e.target.value ? Number(e.target.value) : null, customName: e.target.value ? null : "" })}><option value="">自訂名稱</option>{snapshot.workLogCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{score.workLogCategoryId == null ? <label>名稱<input className="cy-op-input" required value={score.customName ?? ""} onChange={e => setScore({ ...score, customName: e.target.value })} /></label> : null}<label>分數<input className="cy-op-input" inputMode="decimal" value={score.scoreValue ?? ""} onChange={e => setScore({ ...score, scoreValue: e.target.value })} /></label><label>排序<input className="cy-op-input" type="number" min="0" step="1" value={score.sortOrder ?? 0} onChange={e => setScore({ ...score, sortOrder: Number(e.target.value) })} /></label><label>說明<input className="cy-op-input" value={score.description ?? ""} onChange={e => setScore({ ...score, description: e.target.value })} /></label><label>備註<input className="cy-op-input" value={score.note ?? ""} onChange={e => setScore({ ...score, note: e.target.value })} /></label><label><input type="checkbox" checked={score.isActive ?? true} onChange={e => setScore({ ...score, isActive: e.target.checked })} />啟用</label></div><div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={() => setScore(null)}>取消</button><button className="cy-op-button primary" disabled={busy}>儲存</button></div></form> : null}
    </> : <>
      <section className="cy-op-panel"><div className="cy-op-panel-header"><h2>{sections.find(row => row.key === section)?.label}</h2>{editable ? <button className="cy-op-button" disabled={busy} onClick={() => setDraft(blank())}>新增</button> : <span>僅超級管理員可修改</span>}</div><table className="cy-op-table"><thead><tr><th>代碼</th><th>名稱</th><th>排序</th><th>狀態</th><th></th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{row.sortOrder}</td><td>{row.isActive ? "啟用" : "停用"}</td><td>{editable ? <button className="cy-op-button" disabled={busy} onClick={() => edit(row)}>編輯</button> : null}</td></tr>)}</tbody></table>{!rows.length ? <p>尚無設定資料。</p> : null}</section>
      {draft ? <form className="cy-op-panel cy-op-form-card" onSubmit={submit}><h2>{draft.id ? "編輯" : "新增"}設定</h2><div className="cy-op-grid-two"><label>代碼<input className="cy-op-input" required maxLength={80} disabled={draft.id != null || busy} value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value })} /></label><label>名稱<input className="cy-op-input" required maxLength={200} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><label>排序<input className="cy-op-input" type="number" min="0" step="1" value={draft.sortOrder} onChange={e => setDraft({ ...draft, sortOrder: Number(e.target.value) })} /></label>{section === "item_category" ? <label>上層分類<select className="cy-op-input" value={draft.parentId ?? ""} onChange={e => setDraft({ ...draft, parentId: e.target.value ? Number(e.target.value) : null })}><option value="">無</option>{snapshot.itemCategories.filter(c => c.id !== draft.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label> : null}{section === "worklog-categories" ? <><label>輸入方式<select className="cy-op-input" value={draft.inputMode} onChange={e => setDraft({ ...draft, inputMode: e.target.value as "boolean" | "quantity" })}><option value="boolean">是否完成</option><option value="quantity">數量</option></select></label><label>數量單位<input className="cy-op-input" value={draft.unitLabel} onChange={e => setDraft({ ...draft, unitLabel: e.target.value })} /></label></> : null}{draft.id ? <label><input type="checkbox" checked={draft.isActive} onChange={e => setDraft({ ...draft, isActive: e.target.checked })} />啟用</label> : null}</div><div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={() => setDraft(null)}>取消</button><button className="cy-op-button primary" disabled={busy}>儲存</button></div></form> : null}
    </>}
  </>;
}

import { useEffect, useState, type FormEvent } from "react";
import { loadAudit, type AuditEvent } from "../api/settings-audit-client";

export function AuditOperationalPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [query, setQuery] = useState<Record<string, string>>({ entityType: "", entityKey: "", action: "", actorEmployeeId: "", occurredFrom: "", occurredTo: "", limit: "50" });
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    loadAudit({ limit: "50" }).then(data => { if (active) setEvents(data.events); }).catch(e => { if (active) setError(e instanceof Error ? e.message : "稽核資料無法讀取"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function search(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(""); setSelected(null);
    try {
      const parameters = { ...query };
      for (const key of ["occurredFrom", "occurredTo"]) if (parameters[key]) parameters[key] = new Date(parameters[key]).toISOString();
      setEvents((await loadAudit(parameters)).events);
    } catch (e) { setError(e instanceof Error ? e.message : "稽核資料無法讀取"); }
    finally { setLoading(false); }
  }
  const fields = [{ key: "entityType", label: "資料類型" }, { key: "entityKey", label: "資料編號" }, { key: "action", label: "動作" }, { key: "actorEmployeeId", label: "操作者 ID", type: "number" }, { key: "occurredFrom", label: "開始時間", type: "datetime-local" }, { key: "occurredTo", label: "結束時間", type: "datetime-local" }];
  return <><div className="cy-op-page-header"><div><h1>稽核紀錄</h1><p>檢視重要業務操作與設定變更；只有管理員與超級管理員可讀取詳細內容。</p></div></div>
    <form className="cy-op-panel cy-op-form-card" onSubmit={search}><div className="cy-op-grid-two">{fields.map(field => <label key={field.key}>{field.label}<input className="cy-op-input" type={field.type ?? "text"} value={query[field.key]} onChange={e => setQuery({ ...query, [field.key]: e.target.value })} /></label>)}<label>筆數<select className="cy-op-input" value={query.limit} onChange={e => setQuery({ ...query, limit: e.target.value })}><option value="50">50</option><option value="100">100</option><option value="200">200</option></select></label></div><button className="cy-op-button primary" disabled={loading}>查詢</button></form>
    {error ? <div className="cy-op-notice danger" role="alert">{error}</div> : null}
    <section className="cy-op-panel">{loading ? <p>讀取稽核紀錄中…</p> : <><table className="cy-op-table"><thead><tr><th>時間</th><th>資料</th><th>動作</th><th>操作者</th><th></th></tr></thead><tbody>{events.map(row => <tr key={row.id}><td>{new Date(row.occurredAt).toLocaleString()}</td><td>{row.entityType} · {row.entityKey}</td><td>{row.action}</td><td>{row.actorEmployeeId ?? "—"}</td><td><button className="cy-op-button" onClick={() => setSelected(row)}>詳細</button></td></tr>)}</tbody></table>{!events.length ? <p>查詢範圍內沒有稽核紀錄。</p> : <p>顯示最新 {events.length} 筆；可用時間範圍查詢較早紀錄。</p>}</>}</section>
    {selected ? <section className="cy-op-panel"><div className="cy-op-panel-header"><h2>{selected.action}</h2><button className="cy-op-button" onClick={() => setSelected(null)}>關閉</button></div><p>{selected.statusFrom ?? "—"} → {selected.statusTo ?? "—"}</p>{[["變更前", selected.before], ["變更後", selected.after], ["其他資訊", selected.metadata]].map(([label, value]) => <div key={String(label)}><h3>{String(label)}</h3><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{value ? JSON.stringify(value, null, 2) : "—"}</pre></div>)}</section> : null}
  </>;
}

import { Loading } from "../../ui/feedback/Loading";
import { useFeedbackMessage } from "../../ui/feedback/FeedbackProvider";
import { formatDateTime } from "../../ui/foundation/format";
import { useEffect, useState, type FormEvent } from "react";
import { loadAudit, type AuditEvent } from "../api/settings-audit-client";
import { Drawer } from "../../ui/overlays/Dialog";

export function AuditOperationalPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [query, setQuery] = useState<Record<string, string>>({ entityType: "", entityKey: "", action: "", actorEmployeeId: "", occurredFrom: "", occurredTo: "", limit: "50" });
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, , setError] = useFeedbackMessage<string>("");
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
  const fields = [{ key: "entityType", label: "資料類型" }, { key: "entityKey", label: "資料編號" }, { key: "action", label: "動作" }, { key: "actorEmployeeId", label: "操作者編號", type: "number" }, { key: "occurredFrom", label: "開始時間", type: "datetime-local" }, { key: "occurredTo", label: "結束時間", type: "datetime-local" }];
  return <>
    <form className="cy-op-panel cy-filter-bar" onSubmit={search} aria-label="稽核紀錄查詢">
      {fields.map(field => <label key={field.key}>{field.label}<input className="cy-op-input" type={field.type ?? "text"} value={query[field.key]} onChange={e => setQuery({ ...query, [field.key]: e.target.value })} /></label>)}
      <label>筆數<select className="cy-op-input" value={query.limit} onChange={e => setQuery({ ...query, limit: e.target.value })}><option value="50">50</option><option value="100">100</option><option value="200">200</option></select></label>
      <div className="cy-filter-bar-actions"><button className="cy-op-button primary" disabled={loading}>查詢</button></div>
    </form>
    {error ? <div className="cy-op-notice danger" role="alert">{error}</div> : null}
    <section className="cy-op-panel">
      {loading ? <Loading /> : <>
        <div className="cy-op-table-wrap"><table className="cy-op-table cy-table-clickable">
          <thead><tr><th>時間</th><th>資料</th><th>動作</th><th>操作者</th></tr></thead>
          <tbody>{events.map(row => <tr key={row.id} tabIndex={0} aria-label={`${row.action} 詳細內容`} onClick={() => setSelected(row)} onKeyDown={e => { if (e.key === "Enter") setSelected(row); }}>
            <td className="cy-mono">{formatDateTime(row.occurredAt)}</td><td>{row.entityType} · <span className="cy-mono">{row.entityKey}</span></td><td>{row.action}</td><td>{row.actorEmployeeId ?? "—"}</td>
          </tr>)}</tbody>
        </table></div>
        <p className="cy-md-count">{events.length ? `顯示最新 ${events.length} 筆；點一列看詳細內容，可用時間範圍查詢較早紀錄。` : "查詢範圍內沒有稽核紀錄。"}</p>
      </>}
    </section>
    <Drawer open={selected !== null} title={selected?.action ?? "稽核紀錄"} description={selected ? `${formatDateTime(selected.occurredAt)} · ${selected.entityType} ${selected.entityKey}` : undefined} onClose={() => setSelected(null)}>
      {selected ? <div className="cy-audit-detail">
        <dl className="cy-op-detail-grid">
          <div><span>狀態變化</span><strong>{selected.statusFrom ?? "—"} → {selected.statusTo ?? "—"}</strong></div>
          <div><span>操作者</span><strong>{selected.actorEmployeeId ?? "—"}</strong></div>
        </dl>
        {[["變更前", selected.before], ["變更後", selected.after], ["其他資訊", selected.metadata]].map(([label, value]) => <section key={String(label)}><h3>{String(label)}</h3><pre className="cy-code-block">{value ? JSON.stringify(value, null, 2) : "—"}</pre></section>)}
      </div> : null}
    </Drawer>
  </>;
}

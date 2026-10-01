import { FormEvent, useState } from "react";
import {
  dateToday,
  exportLocalDatabase,
  importLocalDatabase,
  mutateLocalDatabase,
  nextLocalId,
  resetLocalDatabase,
  timestampNow,
  type LocalDatabase,
  type LocalWorkLog,
  useLocalDatabase,
} from "./local-database";

export type OperationalRoute =
  | "customers"
  | "items"
  | "orders"
  | "outsourcing"
  | "worklogs"
  | "settings"
  | "audit";

interface PageProps {
  database: LocalDatabase;
}

function numberValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function PageHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="cy-op-page-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className="cy-op-page-actions">{action}</div> : null}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="cy-op-empty">{children}</div>;
}

function WorkLogPage({ database }: PageProps) {
  const [selectedId, setSelectedId] = useState<number | null>(database.workLogs[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [content, setContent] = useState("");
  const [workDays, setWorkDays] = useState(1);
  const selected = database.workLogs.find((row) => row.id === selectedId) ?? null;
  const statusText: Record<LocalWorkLog["status"], string> = { created: "已建檔", pending_review: "待審核", reviewed: "已審核" };
  function create(event: FormEvent) { event.preventDefault(); if (!content.trim() || workDays <= 0) return; let id = 0; mutateLocalDatabase("work_log.created", "新增工作日誌", (db) => { id = nextLocalId(db); db.workLogs.unshift({ id, ref: `WL-LOCAL-${String(id).padStart(4, "0")}`, logDate: dateToday(), dateFrom: dateToday(), dateTo: dateToday(), workDays, employeeName: "本機測試使用者", status: "created", entries: [{ id: nextLocalId(db), content: content.trim(), category: db.settings.workLogCategories[0] ?? "一般工作", quantity: 1, reviewScore: null, reviewRemark: null }], reviewRemark: null, finalScore: null, averageDailyScore: null, revision: 1, updatedAt: timestampNow() }); }); setSelectedId(id); setCreating(false); setContent(""); }
  function transition(status: LocalWorkLog["status"], action: string) { if (!selected) return; mutateLocalDatabase(action, `${selected.ref}：${selected.status} → ${status}`, (db) => { const row = db.workLogs.find((log) => log.id === selected.id); if (!row) return; row.status = status; row.revision += 1; row.updatedAt = timestampNow(); }); }
  function review() { if (!selected || selected.status !== "pending_review") return; const raw = window.prompt("輸入本次審核總分", "10"); if (raw == null) return; const score = numberValue(raw); const daysRaw = window.prompt("確認工作日數", String(selected.workDays)); if (daysRaw == null) return; const days = numberValue(daysRaw); if (days <= 0) return; mutateLocalDatabase("work_log.reviewed", `${selected.ref} 審核完成`, (db) => { const row = db.workLogs.find((log) => log.id === selected.id); if (!row) return; row.workDays = days; row.status = "reviewed"; row.finalScore = score; row.averageDailyScore = Number((score / days).toFixed(4)); row.reviewRemark = "本機操作版審核"; if (row.entries[0]) row.entries[0].reviewScore = score; row.revision += 1; row.updatedAt = timestampNow(); }); }
  function cancelReview() { if (!selected || selected.status !== "reviewed") return; mutateLocalDatabase("work_log.review.cancelled", `${selected.ref} 取消審核`, (db) => { const row = db.workLogs.find((log) => log.id === selected.id); if (!row) return; row.status = "pending_review"; row.finalScore = null; row.averageDailyScore = null; row.reviewRemark = null; row.entries.forEach((entry) => { entry.reviewScore = null; entry.reviewRemark = null; }); row.revision += 1; row.updatedAt = timestampNow(); }); }
  return <><PageHeader title="工作日誌" description="可以直接建立、送審、撤回、審核與取消審核；重新整理後資料仍保留。" action={<button className="cy-op-button primary" onClick={() => setCreating(true)}>新增日誌</button>} />{creating ? <section className="cy-op-panel cy-op-form-card"><form onSubmit={create}><div className="cy-op-form-grid"><label className="wide">工作內容<input className="cy-op-input" value={content} onChange={(e) => setContent(e.target.value)} /></label><label>工作日數<input className="cy-op-input" type="number" step="0.25" min="0.01" value={workDays} onChange={(e) => setWorkDays(numberValue(e.target.value))} /></label></div><div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={() => setCreating(false)}>取消</button><button className="cy-op-button primary">建立</button></div></form></section> : null}<div className="cy-op-split"><section className="cy-op-panel cy-op-list-panel"><div className="cy-op-list">{database.workLogs.map((row) => <button key={row.id} className={`cy-op-list-row ${selectedId === row.id ? "active" : ""}`} onClick={() => setSelectedId(row.id)}><strong>{row.ref}</strong><span>{row.logDate} · {row.workDays} 日</span><small>{statusText[row.status]}</small></button>)}</div></section><section className="cy-op-panel">{selected ? <div><div className="cy-op-panel-header"><div><h2>{selected.ref}</h2><p>{selected.employeeName} · rev.{selected.revision}</p></div><span className="cy-op-badge">{statusText[selected.status]}</span></div><div className="cy-op-detail-grid"><div><span>工作日數</span><strong>{selected.workDays}</strong></div><div><span>審核總分</span><strong>{selected.finalScore ?? "—"}</strong></div><div><span>平均日分</span><strong>{selected.averageDailyScore ?? "—"}</strong></div></div><div className="cy-op-subsection"><h3>工作內容</h3>{selected.entries.map((entry) => <div className="cy-op-read-row" key={entry.id}>{entry.content} <small>· {entry.category}{entry.reviewScore != null ? ` · ${entry.reviewScore} 分` : ""}</small></div>)}</div><div className="cy-op-action-bar">{selected.status === "created" ? <button className="cy-op-button primary" onClick={() => transition("pending_review", "work_log.review.submitted")}>送出審核</button> : null}{selected.status === "pending_review" ? <><button className="cy-op-button" onClick={() => transition("created", "work_log.review.withdrawn")}>撤回審核</button><button className="cy-op-button primary" onClick={review}>審核計分</button></> : null}{selected.status === "reviewed" ? <button className="cy-op-button danger" onClick={cancelReview}>取消審核</button> : null}</div></div> : <EmptyState>請選擇工作日誌。</EmptyState>}</section></div></>;
}

function SettingsPage({ database }: PageProps) {
  const [importText, setImportText] = useState("");
  const [newCategory, setNewCategory] = useState("");
  function addCustomerCategory() { const value = newCategory.trim(); if (!value) return; mutateLocalDatabase("setting.customer_category.created", `新增客戶分類：${value}`, (db) => { if (!db.settings.customerCategories.includes(value)) db.settings.customerCategories.push(value); }); setNewCategory(""); }
  return <><PageHeader title="設定／管理" description="本機測試設定只影響尚未接上正式資料的頁面。客戶、商品、不良品、訂單與代工使用伺服器設定。" /><div className="cy-op-grid-two"><section className="cy-op-panel"><h2>客戶分類</h2><div className="cy-op-chip-list">{database.settings.customerCategories.map((value) => <span className="cy-op-chip" key={value}>{value}</span>)}</div><div className="cy-op-inline-row"><input className="cy-op-input" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="新增分類" /><button className="cy-op-button" onClick={addCustomerCategory}>新增</button></div></section><section className="cy-op-panel"><h2>本機資料工具</h2><p>目前資料存在此瀏覽器的 localStorage。你可以先長期測介面與流程，之後資料 adapter 再切到 D1。</p><div className="cy-op-action-bar"><button className="cy-op-button" onClick={() => downloadText(`cyweb-local-${dateToday()}.json`, exportLocalDatabase())}>匯出 JSON</button><button className="cy-op-button danger" onClick={() => { if (window.confirm("確定重設所有本機測試資料？")) resetLocalDatabase(); }}>重設測試資料</button></div></section></div><section className="cy-op-panel cy-op-form-card"><h2>匯入本機資料</h2><p>貼上先前匯出的 JSON，可把整個操作狀態還原。</p><textarea className="cy-op-input" rows={8} value={importText} onChange={(e) => setImportText(e.target.value)} /><div className="cy-op-form-footer"><button className="cy-op-button primary" onClick={() => { try { importLocalDatabase(importText); setImportText(""); window.alert("匯入完成"); } catch (error) { window.alert(error instanceof Error ? error.message : "匯入失敗"); } }}>匯入</button></div></section></>;
}

function AuditPage({ database }: PageProps) {
  return <><PageHeader title="稽核紀錄" description="本機操作版先記錄重要動作，方便你測試流程時追查狀態變化。" /><section className="cy-op-panel"><table className="cy-op-table"><thead><tr><th>時間</th><th>Action</th><th>摘要</th></tr></thead><tbody>{database.audit.map((row) => <tr key={row.id}><td>{new Date(row.at).toLocaleString()}</td><td><code>{row.action}</code></td><td>{row.summary}</td></tr>)}</tbody></table></section></>;
}

export function OperationalWorkspace({ route }: { route: OperationalRoute }) {
  const database = useLocalDatabase();
  if (route === "worklogs") return <WorkLogPage database={database} />;
  if (route === "settings") return <SettingsPage database={database} />;
  return <AuditPage database={database} />;
}

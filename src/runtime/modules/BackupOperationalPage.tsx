import { useEffect, useRef, useState } from "react";
import type { BackupHistory, BackupHistoryEntry } from "../../../shared/backups";
import { ApiClientError } from "../../api/client";
import { DataView } from "../../ui/data/DataView";
import { createBackup, loadBackups, retryBackup } from "../api/backup-client";
import "./backup-operational.css";

const statuses: Record<string, string> = { creating: "建立中", verified: "已驗證", failed: "失敗", pending: "待完成",
  absent: "本次未排定", deleting: "到期處理中", deleted: "已到期移除", expired: "已到期" };
function label(status: string): string { return statuses[status] ?? "狀態待確認"; }
function time(value: string): string {
  return new Date(value).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
}
function size(value: number): string { return value < 1024 ? `${value} B` : value < 1048576 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1048576).toFixed(1)} MB`; }
function providerStatus(row: BackupHistoryEntry) {
  return <div className="cy-backup-copies">{(["r2", "gcs"] as const).map(provider => {
    const copy = row.copies.find(value => value.provider === provider);
    return <span key={provider} className="cy-backup-copy" data-status={copy?.status ?? "unknown"}>
      <strong>{provider.toUpperCase()}</strong> {copy ? label(copy.status) : "尚無紀錄"}
    </span>;
  })}</div>;
}
function completion(row: BackupHistoryEntry | undefined): string {
  if (!row) return "操作結果尚未確認，請更新備份紀錄。";
  const r2 = row.copies.find(copy => copy.provider === "r2")?.status;
  const gcs = row.copies.find(copy => copy.provider === "gcs")?.status;
  if (r2 === "verified" && gcs === "verified") return "R2 與 GCS 備份皆已驗證。";
  if (r2 === "verified") return "R2 備份已驗證，GCS 副本尚未完成；可依紀錄狀態重試。";
  return "備份尚未成功，請查看紀錄並確認儲存服務狀態。";
}
export function BackupHistoryView({ history, busy, retry }: { history: BackupHistory; busy: boolean; retry: (id: string) => void }) {
  const action = (row: BackupHistoryEntry) => row.canRetry
    ? <button className="cy-op-button" type="button" disabled={busy} onClick={() => retry(row.backupId)}>重試 GCS</button> : <span>—</span>;
  const event = (row: BackupHistoryEntry) => <div className="cy-backup-event"><strong>{time(row.createdAt)}</strong>
    <span>{row.triggerKind === "scheduled" ? "排程備份" : row.triggerKind === "pre_restore" ? "還原前安全備份" : "手動備份"} · {label(row.status)}</span>
    <details><summary>備份識別資訊</summary><dl><dt>備份編號</dt><dd>{row.backupId}</dd><dt>版本</dt><dd>V{row.appVersion}</dd>
      <dt>資料摘要</dt><dd>{row.dataSha256 === "pending" ? "尚未產生" : row.dataSha256}</dd></dl></details></div>;
  return <DataView ariaLabel="備份紀錄" items={history.sets} getKey={row => row.backupId}
    columns={[{ key: "event", header: "備份時間（台灣）", render: event },
      { key: "copies", header: "儲存副本", render: providerStatus },
      { key: "size", header: "資料量", render: row => <>{row.recordCount.toLocaleString()} 筆<br />{size(row.byteLength)}</> },
      { key: "action", header: "操作", render: action }]}
    renderCard={row => <>{event(row)}{providerStatus(row)}<div className="cy-backup-card-footer"><span>{row.recordCount.toLocaleString()} 筆 · {size(row.byteLength)}</span>{action(row)}</div></>}
    emptyTitle="尚無備份紀錄" emptyDescription={history.configured ? "建立手動備份後，這裡會顯示各儲存副本的驗證結果。" : "儲存設定完成後才能建立備份。"} />;
}
export function BackupOperationalPage() {
  const [history, setHistory] = useState<BackupHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const mounted = useRef(false), lock = useRef(false), operation = useRef<AbortController | null>(null);
  useEffect(() => {
    let active = true;
    mounted.current = true;
    const controller = new AbortController();
    loadBackups(controller.signal).then(data => { if (active) setHistory(data); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "備份紀錄無法讀取"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; mounted.current = false; controller.abort(); operation.current?.abort(); };
  }, []);
  async function run(kind: "refresh" | "create" | "retry", id?: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    const controller = new AbortController(); operation.current = controller;
    try {
      const result = kind === "create" ? await createBackup(controller.signal)
        : kind === "retry" ? await retryBackup(id!, controller.signal) : await loadBackups(controller.signal);
      if (!mounted.current) return;
      setHistory(result);
      if (kind !== "refresh") setNotice(completion(result.sets.find(row => row.backupId === ("backupId" in result ? result.backupId : id))));
    } catch (e) {
      if (mounted.current) setError(e instanceof ApiClientError ? e.message
        : kind === "refresh" ? "備份紀錄無法讀取，請稍後重新整理。" : "操作結果未能確認，請先更新紀錄後再決定是否重試。");
    } finally { lock.current = false; if (mounted.current) { setBusy(false); setLoading(false); } }
  }
  const enabled = !loading && !busy && history?.configured === true;
  return <><div className="cy-op-page-header"><div><h1>備份管理</h1><p>查看備份與副本狀態，建立手動備份或重試未完成的 GCS 副本。</p></div>
    <div className="cy-op-page-actions"><button className="cy-op-button" type="button" disabled={loading || busy} onClick={() => void run("refresh")}>更新紀錄</button>
      <button className="cy-op-button primary" type="button" disabled={!enabled} onClick={() => void run("create")}>{busy ? "處理中…" : "建立手動備份"}</button></div></div>
    <div className="cy-op-panel cy-backup-policy"><span><strong>R2</strong> 每日 03:30 · 保留 30 天</span><span><strong>GCS</strong> 週三、週日 · 保留 182 天</span><span>時間皆為台灣時間；手動備份會建立兩端副本。</span></div>
    {history && !history.configured ? <div className="cy-op-notice" role="status">備份儲存尚未設定，建立與重試暫停使用。</div> : null}
    {error ? <div className="cy-op-notice danger" role="alert">{error}</div> : null}
    {notice ? <div className="cy-op-notice" role="status">{notice}</div> : null}
    <section className="cy-op-panel cy-backup-history" aria-busy={loading || busy}>{loading ? <p role="status">讀取備份紀錄中…</p>
      : history ? <><BackupHistoryView history={history} busy={busy} retry={id => void run("retry", id)} /><p className="cy-backup-history-note">顯示最新 50 筆備份；每次備份只列一次，副本驗證結果分開顯示。</p></>
        : <p>尚未取得備份紀錄，請使用「更新紀錄」。</p>}</section>
  </>;
}

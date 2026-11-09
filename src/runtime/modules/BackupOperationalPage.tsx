import { formatDateTime } from "../../ui/foundation/format";
import { Loading } from "../../ui/feedback/Loading";
import { useFeedbackMessage } from "../../ui/feedback/FeedbackProvider";
import { useUnsavedChangesGuard } from "../../ui/foundation/useUnsavedChangesGuard";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BACKUP_REHEARSAL_CONFIRMATION, BACKUP_REHEARSAL_ERROR_MESSAGES, type BackupHistory, type BackupHistoryEntry, type BackupProvider, type BackupRehearsalHistoryEntry } from "../../../shared/backups";
import { ApiClientError } from "../../api/client";
import { createBackup, loadBackups, retryBackup, rehearseBackup } from "../api/backup-client";
import { Dialog } from "../../ui/overlays/Dialog";
import { CyInvoiceRecoveryAdminPanel } from "../../identity/CyInvoiceRecoveryAdminPanel";
import type { AuthSession } from "../../auth/auth-client";
import "./backup-operational.css";
import { IconButton } from "../../ui/actions/IconButton";
import { Icons } from "../../ui/actions/icons";

const statuses: Record<string, string> = { creating: "建立中", verified: "已驗證", failed: "失敗", pending: "待完成",
  absent: "本次未排定", deleting: "到期處理中", deleted: "已到期移除", expired: "已到期" };
function label(status: string): string { return statuses[status] ?? "狀態待確認"; }
function time(value: string): string {
  return formatDateTime(value);
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
  if (gcs === "verified") return "GCS 備份已驗證，R2 副本尚未完成；請確認 R2 儲存服務狀態。";
  return "備份尚未成功，請查看紀錄並確認儲存服務狀態。";
}
export function BackupHistoryView({ history, busy, retry, rehearse }: { history: BackupHistory; busy: boolean; retry: (id: string) => void;
  rehearse?: (row: BackupHistoryEntry) => void }) {
  // Compact icon buttons side by side, so the one-line table still fits (user 2026-11-04); the name shows on hover.
  const action = (row: BackupHistoryEntry) => <div className="cy-backup-actions">
    {row.canRetry ? <IconButton variant="table" icon={Icons.retry} label="重試 GCS" disabled={busy} onClick={() => retry(row.backupId)} /> : null}
    {history.recoveryReady && rehearse && row.copies.some(copy => copy.status === "verified")
      ? <IconButton variant="table" icon={Icons.verify} label="驗證隔離還原" disabled={busy} onClick={() => rehearse(row)} /> : null}
  </div>;
  // One line per backup (user 2026-11-04); 備份編號 and 資料摘要 open under the row on click, like 修改紀錄.
  const kind = (row: BackupHistoryEntry) => row.triggerKind === "scheduled" ? "排程備份" : row.triggerKind === "pre_restore" ? "還原前安全備份" : "手動備份";
  const hasAction = (row: BackupHistoryEntry) => row.canRetry || !!(history.recoveryReady && rehearse && row.copies.some(copy => copy.status === "verified"));
  return <BackupRows history={history} action={action} kind={kind} hasAction={hasAction} />;
}

/** How many backups show before 顯示較早的備份 (user 2026-11-04: 50 at once is too many). */
const BACKUP_ROWS_SHOWN = 10;

interface LineColumn<T> { header: string; width?: string; numeric?: boolean; code?: boolean; render: (row: T) => ReactNode; full?: (row: T) => string }
/**
 * One line per record, identifiers included (user 2026-11-04). Long codes take the room left over and
 * end in … when it runs out; the whole value stays selectable and shows on hover.
 */
function LineTable<T>({ label, rows, getKey, columns }: { label: string; rows: readonly T[]; getKey: (row: T) => string; columns: LineColumn<T>[] }) {
  return <div className="cy-backup-table-wrap"><table className="cy-sheet-table cy-rt cy-mobile-wrap-table cy-backup-table" aria-label={label}>
        <thead><tr>{columns.map(column => <th key={column.header} scope="col" className={column.numeric ? "num" : undefined}>{column.header}</th>)}</tr></thead>
    <tbody>{rows.map(row => <tr key={getKey(row)}>{columns.map((column,index) => <td key={column.header} data-label={column.header} data-priority={index===0?"title":column.header==="操作"?"wide":undefined}
      className={[column.numeric ? "num" : "", column.code ? "code" : ""].filter(Boolean).join(" ") || undefined}>
      <span className="cy-sheet-value" title={column.full?.(row)}>{column.render(row)}</span></td>)}</tr>)}</tbody>
  </table></div>;
}

function BackupRows({ history, action, kind, hasAction }: { history: BackupHistory; action: (row: BackupHistoryEntry) => ReactNode;
  kind: (row: BackupHistoryEntry) => string; hasAction: (row: BackupHistoryEntry) => boolean }) {
  const [all, setAll] = useState(false);
  if (!history.sets.length) return <div className="cy-op-empty">{history.configured ? "尚無備份紀錄" : "儲存設定完成後才能建立備份。"}</div>;
  const rows = all ? history.sets : history.sets.slice(0, BACKUP_ROWS_SHOWN);
  const digest = (row: BackupHistoryEntry) => row.dataSha256 === "pending" ? "尚未產生" : row.dataSha256;
  return <>
    <LineTable label="備份紀錄" rows={rows} getKey={row => row.backupId}
      columns={[{ header: "備份時間（台灣）", width: "10.5em", render: row => <span className="cy-backup-time">{time(row.createdAt)}</span> },
        { header: "類型", width: "8.5em", render: kind }, { header: "狀態", width: "5em", render: row => label(row.status) },
        { header: "版本", width: "5.5em", render: row => "V" + row.appVersion }, { header: "儲存副本", width: "16em", render: providerStatus },
        { header: "筆數", width: "5.5em", numeric: true, render: row => row.recordCount.toLocaleString() },
        { header: "大小", width: "6em", numeric: true, render: row => size(row.byteLength) },
        { header: "備份編號", code: true, render: row => row.backupId, full: row => row.backupId },
        { header: "資料摘要", code: true, render: digest, full: digest },
        // 操作 only when some backup has something to do (重試 GCS, 驗證隔離還原) (user 2026-11-04).
        ...(rows.some(hasAction) ? [{ header: "操作", render: action }] : [])]} />
    {history.sets.length > BACKUP_ROWS_SHOWN ? <button type="button" className="cy-op-button soft cy-backup-more" onClick={() => setAll(value => !value)}>
      {all ? "只顯示最新 " + BACKUP_ROWS_SHOWN + " 筆" : "顯示較早的備份（共 " + history.sets.length + " 筆）"}</button> : null}
  </>;
}
const rehearsalPhaseLabels: Record<string, string> = {
  completed: "完成", target_lock: "隔離目標使用狀態", source_read: "來源備份核對", target_validation: "隔離目標檢查",
  safety_backup: "還原前安全備份", audit_start: "演練啟動紀錄",
  restore_reconcile: "隔離還原／資料核對", result_record: "結果紀錄",
};
export function BackupRehearsalHistoryView({ items }: { items: readonly BackupRehearsalHistoryEntry[] }) {
  const status = (row: BackupRehearsalHistoryEntry) => row.status === "verified" ? "驗證成功"
    : row.status === "failed" ? "驗證失敗" : "結果待確認";
  const explanation = (row: BackupRehearsalHistoryEntry) => row.status === "verified"
    ? "已記錄隔離驗證成功。"
    : row.errorCode ? BACKUP_REHEARSAL_ERROR_MESSAGES[row.errorCode] ?? BACKUP_REHEARSAL_ERROR_MESSAGES.BACKUP_RECOVERY_UNAVAILABLE
    : row.status === "unconfirmed" ? "已有演練啟動紀錄，但沒有確認的最終結果；不可直接重送。"
    : "此筆舊驗證紀錄未附錯誤代碼，請核對 Audit；不可直接重送。";
  if (!items.length) return <div className="cy-op-empty">尚無隔離還原驗證紀錄</div>;
  return <LineTable label="隔離還原驗證紀錄" rows={items} getKey={row => String(row.eventId)}
    columns={[{ header: "驗證時間（台灣）", width: "10.5em", render: row => <span className="cy-backup-time">{time(row.occurredAt)}</span> },
      { header: "結果", width: "6.5em", render: status },
      { header: "副本", width: "4.5em", render: row => row.provider ? row.provider.toUpperCase() : "未確認" },
      { header: "階段", width: "9.5em", render: row => row.phase ? rehearsalPhaseLabels[row.phase] ?? "階段待確認" : "歷史紀錄" },
      { header: "說明", render: row => <>{explanation(row)}{row.errorCode ? "（" + row.errorCode + "）" : ""}</> },
      { header: "來源備份", code: true, render: row => row.backupId, full: row => row.backupId },
      { header: "請求編號", code: true, render: row => row.requestId ?? "未記錄", full: row => row.requestId ?? "" }]} />;
}
/** Prevent an old successful rehearsal from appearing as the status of a fresh
 * recovery target after the next quarter's approved rotation. */
export function shouldShowLatestRehearsalResult(history: BackupHistory | null): boolean {
  return history?.rehearsalHistoryAvailable !== false && history?.recoveryReady === false;
}
/** A durable, prominent result derived from Audit; not from a transient toast. */
export function BackupLatestRehearsalResult({ items }: { items: readonly BackupRehearsalHistoryEntry[] }) {
  const latest = items.find(row => row.status === "verified");
  if (!latest) return null;
  return <div className="cy-backup-rehearsal-success" role="status" aria-label="最新隔離還原驗證結果">
    <h3>✓ 隔離還原驗證：完成</h3>
    <p>驗證時間：{time(latest.occurredAt)}（台灣）</p>
    <p>結果：備份已還原至隔離資料庫，資料核對成功。本次驗證已完成，請勿對同一隔離目標再次執行。</p>
    <p>下次驗證請依季度計畫準備經核准的全新空白隔離目標。</p>
  </div>;
}
export function BackupOperationalPage({ session }: { session: AuthSession }) {
  const [history, setHistory] = useState<BackupHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useUnsavedChangesGuard({ active: false, blocked: busy });
  const [error, , setError] = useFeedbackMessage<string>("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<BackupHistoryEntry | null>(null);
  const [provider, setProvider] = useState<BackupProvider>("gcs");
  const [reviewed, setReviewed] = useState(false), [confirmation, setConfirmation] = useState("");
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
      // create/retry return history from the service; refresh also carries the runtime capability.
      setHistory(previous => ({ ...result, recoveryConfigured: result.recoveryConfigured ?? previous?.recoveryConfigured,
        scheduleEnabled: result.scheduleEnabled ?? previous?.scheduleEnabled,
        rehearsals: result.rehearsals ?? previous?.rehearsals,
        rehearsalHistoryAvailable: result.rehearsalHistoryAvailable ?? previous?.rehearsalHistoryAvailable }));
      if (kind !== "refresh") {
        const row = result.sets.find(row => row.backupId === ("backupId" in result ? result.backupId : id));
        const message = completion(row);
        if (row?.copies.some(copy => copy.provider === "r2" && copy.status === "verified")
          && row.copies.some(copy => copy.provider === "gcs" && copy.status === "verified")) setNotice(message);
        else setError(message);
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof ApiClientError ? e.message
        : kind === "refresh" ? "備份紀錄無法讀取，請稍後重新整理。" : "操作結果未能確認，請先更新紀錄後再決定是否重試。");
    } finally { lock.current = false; if (mounted.current) { setBusy(false); setLoading(false); } }
  }
  function selectRehearsal(row: BackupHistoryEntry) {
    if (!history?.recoveryReady) { setError(history?.recoveryBlockedReason ?? "隔離目標不可再次驗證。"); return; }
    setSelected(row); setProvider(row.copies.some(copy => copy.provider === "gcs" && copy.status === "verified") ? "gcs" : "r2");
    setReviewed(false); setConfirmation("");
  }
  async function rehearse() {
    if (lock.current || !selected || !reviewed || confirmation !== BACKUP_REHEARSAL_CONFIRMATION) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    const controller = new AbortController(); operation.current = controller;
    try {
      const result = await rehearseBackup(selected.backupId, provider, controller.signal);
      if (!mounted.current) return;
      setSelected(null); setNotice(`✓ 隔離還原驗證完成（${result.provider.toUpperCase()}），還原前安全備份與資料核對皆已成功。本隔離目標不可再用。`);
      setHistory(previous => previous ? { ...previous, recoveryReady: false, recoveryBlockedReason: "本隔離目標已成功驗證，後端已禁止再次使用。" } : previous);
      window.dispatchEvent(new Event("cyweb:rehearsal-verified"));
      try { const refreshed = await loadBackups(controller.signal); if (mounted.current) setHistory(refreshed); }
      catch { if (mounted.current) setError("隔離還原已驗證，紀錄更新失敗；請使用更新紀錄核對，無須重做還原。"); }
    } catch (e) {
      if (mounted.current) { setSelected(null); setError(e instanceof ApiClientError ? e.message : "驗證結果未能確認，請先更新紀錄並核對操作紀錄，不要直接重送。"); }
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  const enabled = !loading && !busy && history?.configured === true;
  return <><div className="cy-page-toolbar">
      <button className="cy-op-button primary" type="button" disabled={!enabled} aria-busy={busy || undefined} onClick={() => void run("create")}>建立手動備份</button>
      <button className="cy-op-button" type="button" disabled={loading || busy} onClick={() => void run("refresh")}>更新紀錄</button>
      <CyInvoiceRecoveryAdminPanel key={JSON.stringify([session.user.workspaceId, session.user.employeeId, session.user.workspaceRole, session.user.emailVerified, session.user.isWorkspaceSuperAdmin])} session={session} />
    </div>
    <div className="cy-op-panel cy-backup-policy"><span><strong>R2</strong> 每日 03:30 · 保留 30 天</span><span><strong>GCS</strong> 週三、週日 · 保留 182 天</span><span>時間皆為台灣時間；手動備份會建立兩端副本。</span></div>
    {history && !history.configured ? <div className="cy-op-notice" role="status">備份儲存尚未設定，建立與重試暫停使用。</div> : null}
    {history?.configured && history.scheduleEnabled === false ? <div className="cy-op-notice" role="status">目前僅啟用手動備份；上述排程尚未開啟。</div> : null}
    {error ? <div className="cy-op-notice danger" role="alert">{error}</div> : null}
    {notice ? <div className="cy-op-notice" role="status">{notice}</div> : null}
    {history && history.recoveryReady === false
      ? <div className="cy-op-notice" role="status">{history.recoveryBlockedReason ?? "隔離目標已使用或尚未準備，驗證按鈕已停用。"}</div> : null}
    <section className="cy-op-panel cy-backup-history" aria-busy={loading || busy}>{loading ? <Loading />
      : history ? <><BackupHistoryView history={history} busy={busy} retry={id => void run("retry", id)} rehearse={selectRehearsal} /></>
        : <p>尚未取得備份紀錄，請使用「更新紀錄」。</p>}</section>
    <section className="cy-op-panel cy-backup-history">
      <h3>隔離還原驗證紀錄</h3>
      {shouldShowLatestRehearsalResult(history)
        ? <BackupLatestRehearsalResult items={history?.rehearsals ?? []} /> : null}
      {loading ? <Loading /> : history?.rehearsalHistoryAvailable === false
        ? <div className="cy-op-notice danger" role="alert">隔離演練紀錄暫時無法讀取；不能據此判定演練成功或失敗。請稍後再更新紀錄，不要直接重送。</div>
        : <BackupRehearsalHistoryView items={history?.rehearsals ?? []} />}
    </section>
    <Dialog showCloseButton={false} open={selected !== null} title="驗證隔離還原" dismissible={!busy} onClose={() => { if (!busy) setSelected(null); }}
      footer={<><button className="cy-op-button" type="button" disabled={busy} onClick={() => setSelected(null)}>取消</button>
        <button className="cy-op-button primary" type="button" disabled={busy || !reviewed || confirmation !== BACKUP_REHEARSAL_CONFIRMATION}
          aria-busy={busy || undefined} onClick={() => void rehearse()}>開始驗證</button></>}>
      {selected ? <div className="cy-backup-rehearsal">
        <p>將所選備份還原至獨立的空白驗證副本，並核對資料。正式系統繼續使用目前資料。</p>
        <p>驗證前會另建 R2、GCS 安全備份；兩端皆驗證成功才繼續。驗證副本成功使用後會保留，重做須另行準備核准的空白副本。</p>
        <p><strong>{time(selected.createdAt)}</strong> · V{selected.appVersion} · {selected.recordCount.toLocaleString()} 筆 · {size(selected.byteLength)}</p>
        <label>來源副本<select disabled={busy} value={provider} onChange={event => setProvider(event.target.value as BackupProvider)}>
          {selected.copies.filter(copy => copy.status === "verified").map(copy => <option key={copy.provider} value={copy.provider}>{copy.provider.toUpperCase()}</option>)}
        </select></label>
        <label><input type="checkbox" checked={reviewed} disabled={busy} onChange={event => setReviewed(event.target.checked)} />我已核對來源備份的時間、版本與資料量</label>
        <label>輸入「{BACKUP_REHEARSAL_CONFIRMATION}」以確認<input value={confirmation} disabled={busy} autoComplete="off" onChange={event => setConfirmation(event.target.value)} /></label>
      </div> : null}
    </Dialog>
  </>;
}

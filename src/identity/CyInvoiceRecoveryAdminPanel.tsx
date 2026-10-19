import { enterAdvancesThenSubmits } from "../ui/foundation/enter-advance";
import { FormEvent, useRef, useState } from "react";
import { ApiClientError } from "../api/client";
import type { AuthSession } from "../auth/auth-client";
import { useUnsavedChangesGuard } from "../ui/foundation/useUnsavedChangesGuard";
import { useConfirmation } from "../ui/overlays/useConfirmation";
import { TextInput } from "../ui/primitives/TextInput";
import { readRecoveryCheckpoint, recoveryCheckpointKey, writeRecoveryCheckpoint,
  type RecoveryCheckpoint } from "./cyinvoice-recovery-checkpoint";
import { executeCyInvoiceRecoveryAction, recoveryOperationIdPattern,
  type RecoveryOperationAction, type RecoveryOperationState } from "./cyinvoice-recovery-client";

function recoveryError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "RECOVERY_NOT_CONFIGURED")
      return "CYInvoice 復原服務尚未完成連線設定。本次未呼叫簽發服務；原操作 ID 已保留。";
    if (["SUPER_ADMIN_REQUIRED", "ACCESS_DENIED", "AUTH_REQUIRED", "AUTH_INVALID"].includes(error.code))
      return "目前無法確認有效超級管理員權限。請重新登入後，使用原操作 ID 查詢。";
  }
  // Never reflect an arbitrary RPC/provider/transport message in the credential UI.
  return "目前無法確認操作結果。原操作 ID 已保留，請重新輸入當次密碼並查詢狀態；不要另行簽發。";
}

function initialCheckpoint(key: string): { checkpoint: RecoveryCheckpoint; storageError: boolean } {
  try {
    const checkpoint = readRecoveryCheckpoint(window.sessionStorage, key)
      ?? { operationId: crypto.randomUUID(), attempted: false, closed: false };
    writeRecoveryCheckpoint(window.sessionStorage, key, checkpoint);
    return { checkpoint, storageError: false };
  } catch {
    // Do not replace an unreadable outstanding operation with a fresh ID.
    return { checkpoint: { operationId: "", attempted: true, closed: false }, storageError: true };
  }
}

/** One renderer and action owner for all devices; server authority is independent. */
export function CyInvoiceRecoveryAdminPanel({ session }: { session: AuthSession }) {
  const key = recoveryCheckpointKey(session.user.workspaceId, session.user.employeeId);
  const [initial] = useState(() => initialCheckpoint(key));
  const [checkpoint, setCheckpoint] = useState(initial.checkpoint);
  const [operationId, setOperationId] = useState(initial.checkpoint.operationId);
  const [storageError, setStorageError] = useState(initial.storageError);
  const [password, setPassword] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [state, setState] = useState<RecoveryOperationState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, confirmationDialog } = useConfirmation();
  useUnsavedChangesGuard({ active: password !== "", blocked: busy });

  const allowed = session.user.workspaceRole === "SUPER_ADMIN"
    && session.user.isWorkspaceSuperAdmin && session.user.emailVerified;
  if (!allowed) return null;

  const valid = recoveryOperationIdPattern.test(operationId)
    && Array.from(password).length >= 8 && Array.from(password).length <= 16;
  const outstanding = checkpoint.attempted && !checkpoint.closed;
  const importedOperation = operationId !== checkpoint.operationId;

  function save(next: RecoveryCheckpoint): boolean {
    try {
      writeRecoveryCheckpoint(window.sessionStorage, key, next);
      setCheckpoint(next); setStorageError(false);
      return true;
    } catch {
      setStorageError(true);
      setError("無法保存操作 ID，已停止簽發。請先記下原 ID；恢復瀏覽器儲存後再查詢原操作。");
      return false;
    }
  }

  function newOperation() {
    if (actionLock.current || storageError || outstanding) return;
    const next = { operationId: crypto.randomUUID(), attempted: false, closed: false };
    if (!save(next)) return;
    setOperationId(next.operationId); setPassword(""); setAcknowledged(false);
    setState(null); setError(null); setMessage("已建立新的操作 ID，尚未寄送邀請。");
  }

  async function act(action: RecoveryOperationAction, event?: FormEvent) {
    event?.preventDefault();
    if (actionLock.current || !valid || !allowed) return;
    if (action === "issue" && (!acknowledged || checkpoint.attempted || importedOperation || storageError)) return;
    // Claim the local action lock before awaiting the shared confirmation.
    actionLock.current = true; setBusy(true);
    setError(null); setMessage(null);
    try {
      if (action !== "status") {
        const accepted = await confirm(action === "issue" ? {
          title: "簽發 CYInvoice 復原邀請？",
          description: "邀請將寄到目前超管已驗證的 Email。寄信不會撤銷裝置；只有新裝置復原成功後，原公司的所有舊裝置才會一併撤銷。",
          confirmLabel: "簽發並寄送邀請", cancelLabel: "放棄簽發", confirmTone: "danger",
        } : {
          title: "撤銷這張復原邀請？",
          description: "只撤銷原操作 ID 的邀請，不撤銷裝置，也不重寄復原碼。",
          confirmLabel: "撤銷邀請", cancelLabel: "保留邀請", confirmTone: "danger",
        });
        if (!accepted) return;
      }
      // Persist BEFORE any mutation, including cancellation whose response may be lost.
      // Failed reads can still be attempted with a manually retained ID, but cannot unlock issue.
      const saved = save({ operationId, attempted: true, closed: false });
      if (!saved && action !== "status") return;
      const result = await executeCyInvoiceRecoveryAction(action, operationId, password);
      setState(result);
      if (result.status === "revoked") {
        save({ operationId, attempted: true, closed: true });
        setMessage("CYInvoice 已明確確認邀請撤銷，未撤銷任何裝置。可另行建立新的操作 ID。");
      } else if (result.status === "sent")
        setMessage("寄信服務已接受邀請。請至已驗證 Email 取得復原碼，再於新電腦的 CYInvoice「加入雲端 → 災難復原」使用；尚未代表送達或接管完成。");
      else if (result.status === "pending")
        setMessage("寄信或資料庫結果尚未確認，目前不可兌換。請用原 ID 手動查詢，或明確撤銷原邀請；不會自動重寄。");
      else
        setMessage("CYInvoice 回覆邀請目前不可用，但未區分已使用、過期或撤銷。不能宣稱已撤銷，原操作 ID 仍保留；請聯絡維護者確認。");
    } catch (reason) { setError(recoveryError(reason)); }
    finally { setPassword(""); setAcknowledged(false); actionLock.current = false; setBusy(false); }
  }

  return <section className="cy-op-panel cy-invoice-recovery-panel" aria-label="CYInvoice 公司級災難復原" aria-busy={busy}>
    <div className="cy-op-panel-header"><div>
      <h3>CYInvoice 裝置災難復原</h3>
      
    </div></div>
    {confirmationDialog}
    <div className="cy-notice cy-notice-warning">
      <div className="cy-notice-title">公司級接管提醒</div>
      <div className="cy-notice-body">寄信、查詢與撤銷邀請不會撤銷裝置。只有新電腦成功復原後，原公司的全部舊裝置才會失效。</div>
    </div>
    <form onKeyDown={enterAdvancesThenSubmits} className="cy-op-form" onSubmit={e => void act("issue", e)} noValidate>
      <TextInput label="復原操作 ID" value={operationId} maxLength={36}
        onChange={e => {
          setOperationId(e.target.value.trim()); setState(null); setMessage(null); setError(null);
          setPassword(""); setAcknowledged(false);
        }} spellCheck={false} autoComplete="off" disabled={busy}
        readOnly={outstanding && !storageError}
        description="此頁籤會保留原 ID 以便重新整理後查詢。請另行複製保存；關閉頁籤或清除瀏覽器資料後，需貼回原 ID。不會自動重寄。" />
      <TextInput label="當次 CYID 超級管理員密碼" type="password" autoComplete="off"
        value={password} onChange={e => setPassword(e.target.value)} maxLength={32} disabled={busy} />
      <label className="cy-invoice-recovery-ack">
        <input type="checkbox" checked={acknowledged} disabled={busy || checkpoint.attempted || importedOperation || storageError}
          onChange={e => setAcknowledged(e.target.checked)} />
        我了解只有新裝置復原成功後，所有舊裝置才會一併撤銷；寄信不代表已完成復原。
      </label>
      <div className="cy-identity-actions">
        <button className="cy-op-button" type="submit" disabled={busy || !valid || !acknowledged || checkpoint.attempted || importedOperation || storageError}>簽發並寄送邀請</button>
        <button className="cy-op-button" type="button" disabled={busy || !valid} onClick={() => void act("status")}>查詢狀態</button>
        <button className="cy-op-button" type="button" disabled={busy || !valid} onClick={() => void act("revoke")}>撤銷邀請</button>
        <button className="cy-op-button" type="button" disabled={busy || storageError || outstanding} onClick={newOperation}>新的操作 ID</button>
      </div>
    </form>
    {outstanding ? <p className="cy-identity-subtext">原操作尚未取得明確撤銷結果。請先查詢／撤銷，暫不建立其他操作 ID。</p> : null}
    {storageError ? <p role="alert">瀏覽器無法讀寫原操作紀錄，簽發已停用。請保留原 ID；可貼入已自行保存的 ID 查詢。</p> : null}
    {state?.status === "sent" ? <div className="cy-identity-message" role="status">
      邀請編號：<strong>{state.invitationId}</strong>，有效至 {new Date(state.expiresAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}。
      復原碼只寄到超管已驗證 Email，不顯示於本頁。
    </div> : null}
    {message ? <div className="cy-identity-message" role="status">{message}</div> : null}
    {error ? <div className="cy-identity-message error" role="alert">{error}</div> : null}
  </section>;
}

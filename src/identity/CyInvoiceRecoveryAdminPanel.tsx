import { FormEvent, useState } from "react";
import { ApiClientError } from "../api/client";
import type { AuthSession } from "../auth/auth-client";
import {
  executeCyInvoiceRecoveryAction,
  recoveryOperationIdPattern,
  type RecoveryOperationAction,
  type RecoveryOperationState,
} from "./cyinvoice-recovery-client";

function recoveryError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "RECOVERY_NOT_CONFIGURED")
      return "CYInvoice 復原服務尚未完成私有連線設定。沒有寄出邀請，請聯絡系統維護者。";
    if (error.code === "RECOVERY_RESULT_UNKNOWN")
      return "服務回應不明：請保留此操作 ID，只能使用「查詢狀態」確認；不得直接產生新的邀請。";
    if (error.code === "SUPER_ADMIN_REQUIRED" || error.code === "ACCESS_DENIED")
      return "目前沒有有效的 CYInvoice 超級管理員權限，請重新確認帳號及 CYInvoice 系統使用權。";
    if (error.code === "IDENTITY_UNAVAILABLE")
      return "目前無法重新驗證 CYID 身分，未確認操作結果。請保留操作 ID。";
    return error.message || error.code;
  }
  return error instanceof Error ? error.message : "目前無法確認操作結果，請保留操作 ID。";
}

/**
 * Shown only to an authenticated CYWEB SUPER_ADMIN. The server independently
 * reauthenticates under CYINVOICE with the password entered for this action.
 * No invitation code or plaintext password is kept in browser storage.
 */
export function CyInvoiceRecoveryAdminPanel({ session }: { session: AuthSession }) {
  const [operationId, setOperationId] = useState<string>(() => crypto.randomUUID());
  const [password, setPassword] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issuedThisOperation, setIssuedThisOperation] = useState(false);
  const [state, setState] = useState<RecoveryOperationState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (session.user.workspaceRole !== "SUPER_ADMIN" || !session.user.emailVerified) return null;

  const valid = recoveryOperationIdPattern.test(operationId)
    && Array.from(password).length >= 8 && Array.from(password).length <= 16;

  function newOperation() {
    // Explicitly clearing the local state cannot cancel an existing invitation
    // in D1. The single-open-grant index in CYInvoice prevents shadow reissues.
    if (issuedThisOperation && state?.status !== "revoked"
        && state?.status !== "unavailable"
        && !window.confirm("原操作可能仍有效。建立新的操作 ID 不會取消舊邀請，也不能繞過 CYInvoice 的單筆有效邀請限制。確定只要建立新的操作 ID？"))
      return;
    setOperationId(crypto.randomUUID());
    setPassword("");
    setAcknowledged(false);
    setIssuedThisOperation(false);
    setState(null);
    setError(null);
    setMessage("已產生新的操作 ID；尚未簽發或寄送任何邀請。");
  }

  async function act(action: RecoveryOperationAction, event?: FormEvent) {
    event?.preventDefault();
    if (busy || !valid) return;
    if (action === "issue") {
      if (!acknowledged || issuedThisOperation) return;
      if (!window.confirm(
        "即將透過 CYID 重新驗證並寄出 CYInvoice 公司級災難復原邀請。"
        + "\n只有新裝置成功接管時，才會一次撤銷原 Workspace 的全部舊裝置。"
        + "\n請確認原 Workspace 與帳號無誤。確定簽發？")) return;
      // Block any repeat attempt locally, even when network response is lost.
      setIssuedThisOperation(true);
    } else if (action === "revoke") {
      if (!window.confirm("確定撤銷此操作 ID 的復原邀請？這只會撤銷邀請，不會撤銷任何裝置，也不會重寄復原碼。")) return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await executeCyInvoiceRecoveryAction(action, operationId, password);
      setState(result);
      if (action === "issue" && result.status === "sent")
        setMessage("邀請已被寄信服務接受；請由超管至已驗證 Email 取得復原碼，並在新電腦的 CYInvoice 加入雲端畫面使用「災難復原」。");
      else if (result.status === "pending")
        setMessage("寄信或資料庫狀態尚未確認。邀請目前不可兌換，請使用同一操作 ID 查詢；不要重寄。");
      else if (result.status === "revoked")
        setMessage("此邀請已撤銷。這不會撤銷已加入的任何裝置；需要新邀請請先產生新的操作 ID。");
      else if (result.status === "unavailable")
        setMessage("目前查無有效邀請，可能尚未建立、已撤銷、已過期或已使用。");
      else
        setMessage("邀請狀態已查回；復原碼僅會出現在寄送的 Email 中。");
    } catch (reason) {
      setError(recoveryError(reason));
    } finally {
      // Never retain the user's CYID password longer than this action.
      setPassword("");
      setBusy(false);
    }
  }

  return <section className="cy-op-panel cy-invoice-recovery-panel" aria-label="CYInvoice 公司級災難復原">
    <div className="cy-op-panel-header">
      <div>
        <h3>CYInvoice 裝置災難復原</h3>
        <p>僅供原公司的所有裝置憑證均遺失時使用。這裡簽發／查詢／撤銷復原邀請，不在 CY Web 直接接管裝置。</p>
      </div>
    </div>
    <div className="cy-notice cy-notice-warning">
      <div className="cy-notice-title">公司級接管提醒</div>
      <div className="cy-notice-body">
        寄出邀請或查詢狀態<strong>不會</strong>撤銷裝置；只有新電腦完成 CYID 驗證並成功使用復原碼後，原 Workspace 的所有舊 Device Token 才會在同一筆交易中失效。
      </div>
    </div>
    <form className="cy-op-form" onSubmit={(e) => void act("issue", e)} noValidate>
      <label>復原操作 ID
        <input className="cy-op-input" value={operationId} maxLength={36}
          onChange={(e) => { setOperationId(e.target.value.trim()); setState(null); setIssuedThisOperation(true); }}
          spellCheck={false} autoComplete="off" disabled={busy}
          aria-describedby="cy-recovery-operation-help"/>
      </label>
      <p className="cy-identity-subtext" id="cy-recovery-operation-help">
        請自行保存操作 ID。連線中斷或重新開啟頁面後，可貼回同一 ID 查詢／撤銷；系統不會自動重寄邀請。
      </p>
      <label>當次 CYID 超級管理員密碼
        <input className="cy-op-input" type="password" autoComplete="off"
          value={password} onChange={(e) => setPassword(e.target.value)}
          minLength={8} maxLength={16} disabled={busy}/>
      </label>
      <label className="cy-invoice-recovery-ack">
        <input type="checkbox" checked={acknowledged} disabled={busy || issuedThisOperation}
          onChange={e => setAcknowledged(e.target.checked)}/>
        我了解只有新裝置復原成功後，所有舊裝置才會一併撤銷；寄信不代表已完成復原。
      </label>
      <div className="cy-identity-actions">
        <button className="cy-op-button" type="submit"
          disabled={busy || !valid || !acknowledged || issuedThisOperation}>簽發並寄送邀請</button>
        <button className="cy-op-button" type="button" disabled={busy || !valid}
          onClick={() => void act("status")}>查詢狀態</button>
        <button className="cy-op-button" type="button" disabled={busy || !valid}
          onClick={() => void act("revoke")}>撤銷邀請</button>
        <button className="cy-op-button" type="button" disabled={busy}
          onClick={newOperation}>新的操作 ID</button>
      </div>
    </form>
    {state?.status === "sent" ? <div className="cy-identity-message" role="status">
      邀請已由寄信服務接受：<strong>{state.invitationId}</strong>，有效至 {new Date(state.expiresAt).toLocaleString("zh-TW")}。
      復原碼僅寄到 CYID 驗證的超管 Email，不會顯示於本頁。
    </div> : null}
    {message ? <div className="cy-identity-message" role="status">{message}</div> : null}
    {error ? <div className="cy-identity-message error" role="alert">{error}</div> : null}
  </section>;
}

import { useEffect, useState } from "react";
import { Dialog } from "../../ui/overlays/Dialog";
import { ApiClientError } from "../../api/client";
import type { ErpAgentStatus } from "../../../shared/erp-item-query";
import {
  issueErpAgentCredential,
  revokeErpAgentCredential,
  loadErpAgentCredentialStatus,
  loadErpAgentStatus,
  type ErpAgentCredentialStatus,
} from "../api/erp-item-query-client";

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.message || error.code : "連線失敗，請稍後再試。";
}

/** Header action mounted in the common AppShell, independent of the query result. */
export function ErpAgentCredentialControl({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [agent, setAgent] = useState<ErpAgentStatus | null>(null);
  const [agentError, setAgentError] = useState(false);
  const [open, setOpen] = useState(false);
  const [credential, setCredential] = useState<ErpAgentCredentialStatus | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void loadErpAgentStatus().then(value => {
        if (!cancelled) { setAgent(value); setAgentError(false); }
      }).catch(() => {
        if (!cancelled) { setAgent(null); setAgentError(true); }
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!isSuperAdmin || !open) return;
    let cancelled = false;
    void loadErpAgentCredentialStatus().then(value => {
      if (!cancelled) setCredential(value);
    }).catch(failure => {
      if (!cancelled) setError(errorMessage(failure));
    });
    return () => { cancelled = true; };
  }, [isSuperAdmin, open]);

  async function manageCredential(operation: "issue" | "revoke") {
    if (busy) return;
    if (!window.confirm(operation === "issue"
      ? "產生新憑證會使舊憑證立即失效，確定繼續？"
      : "撤銷後公司查詢程式將無法再連線，確定撤銷？")) return;
    setBusy(true);
    setError(null);
    setNewToken(null);
    try {
      if (operation === "issue") {
        const issued = await issueErpAgentCredential();
        setNewToken(issued.token);
      } else {
        await revokeErpAgentCredential();
      }
      setCredential(await loadErpAgentCredentialStatus());
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  function close() {
    if (busy) return;
    setOpen(false);
    setNewToken(null);
    setError(null);
  }

  const connected = !agentError && agent?.online === true;
  const label = agentError ? "狀態未知" : connected ? "已連線" : "未連線";
  const stateClass = connected ? "is-online" : "is-offline";
  return <>
    {isSuperAdmin
      ? <button type="button" className={"cy-op-button cy-erp-status-button " + stateClass}
          aria-label={"連線憑證：" + label} onClick={() => setOpen(true)}>
          連線憑證 · {label}
        </button>
      : <span className={"cy-erp-status-readonly " + stateClass} role="status">
          查詢程式 · {label}
        </span>}
    {isSuperAdmin && <Dialog open={open} title={"公司查詢程式連線憑證 · " + label}
      size="medium" onClose={close} dismissible={!busy}>
      <p>只有超級管理員能產生或撤銷憑證。每次產生的原文只顯示一次，請立即複製到公司電腦的安全設定。</p>
      <p>目前憑證：{credential === null ? "讀取中或無法取得"
        : credential.configured ? "已啟用" : "尚未設定或已撤銷"}</p>
      <div className="cy-op-page-actions">
        <button type="button" className="cy-op-button" disabled={busy}
          onClick={() => void manageCredential("issue")}>
          {busy ? "處理中…" : "產生／更換憑證"}
        </button>
        <button type="button" className="cy-op-button danger" disabled={busy || !credential?.configured}
          onClick={() => void manageCredential("revoke")}>撤銷憑證</button>
      </div>
      {newToken && <div className="cy-erp-token" role="status">
        <strong>請立即複製；關閉後無法再次查看：</strong>
        <code>{newToken}</code>
        <button type="button" className="cy-op-button"
          onClick={() => void navigator.clipboard.writeText(newToken)
            .catch(() => setError("無法自動複製，請手動選取憑證。"))}>複製憑證</button>
        <button type="button" className="cy-op-button" onClick={() => setNewToken(null)}>已保存，隱藏憑證</button>
      </div>}
      {error && <p className="cy-erp-error" role="alert">{error}</p>}
    </Dialog>}
  </>;
}

import "./erp-item-query.css";
import { useEffect, useState } from "react";
import { Dialog } from "../../ui/overlays/Dialog";
import { Field } from "../../ui/forms/Field";
import { enterAdvancesFields } from "../../ui/foundation/enter-advance";
import { useConfirmation } from "../../ui/overlays/useConfirmation";
import { ApiClientError } from "../../api/client";
import type { ErpAgentStatus, ErpControlResult } from "../../../shared/erp-item-query";
import {
  controlErpAgent,
  type ErpControlAction,
  issueErpAgentCredential,
  revokeErpAgentCredential,
  loadErpAgentCredentialStatus,
  loadErpAgentStatus,
  type ErpAgentCredentialStatus,
} from "../api/erp-item-query-client";

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.message || error.code : "連線失敗，請稍後再試。";
}

/** 「HH:MM」 in the reader's clock (Taiwan). */
const clock = (iso: string) => new Date(iso).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
const RESULT_TEXT: Record<ErpControlResult, string> = {
  CLOSED: "ERP 已關閉", KEPT_OPEN: "ERP 有未完成的作業，沒有關閉", NOT_OPEN: "ERP 原本就沒有開", FAILED: "ERP 關閉失敗，請到伺服器檢查",
};
/**
 * 「關閉到…」 (user 2026-10-28): a clock time today, or tomorrow when it has already passed today.
 */
function untilDate(time: string): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const at = new Date(); at.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (at.getTime() <= Date.now() + 60000) at.setDate(at.getDate() + 1);
  return at;
}
const untilIso = (time: string) => untilDate(time)?.toISOString() ?? null;
function untilHint(time: string): string {
  const at = untilDate(time);
  if (!at) return "暫停到這個時間，最多 24 小時。";
  const minutes = Math.round((at.getTime() - Date.now()) / 60000);
  return `${at.getDate() !== new Date().getDate() ? "明天 " : ""}${clock(at.toISOString())}，約 ${minutes >= 60 ? `${Math.floor(minutes / 60)} 小時 ${minutes % 60} 分` : `${minutes} 分鐘`}後可再查詢。`;
}
/** Query failures after which ERP itself may be stuck, so the member is offered a force-close. */
const FORCE_CLOSE_CODES = new Set(["ERP_NOT_OPEN", "ERP_STATE", "EXPORT_FAILED", "INTERNAL", "AGENT_TIMEOUT"]);
/** Raised by useErpJob when a query fails; the header control asks whether to force-close ERP. */
export const ERP_QUERY_FAILED_EVENT = "cy-erp-query-failed";
export type ErpQueryFailedDetail = { code: string | null; message: string };

/**
 * Header action mounted in the common AppShell on the ERP pages: the query program's state, the
 * ERP 關閉／暫停 controls for every ERP member (user 2026-10-27), and the Super Admin's token.
 */
export function ErpAgentCredentialControl({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [agent, setAgent] = useState<ErpAgentStatus | null>(null);
  const [agentError, setAgentError] = useState(false);
  const [open, setOpen] = useState(false);
  const [credential, setCredential] = useState<ErpAgentCredentialStatus | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, confirmationDialog } = useConfirmation();
  const [controlBusy, setControlBusy] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);
  const [failure, setFailure] = useState<ErpQueryFailedDetail | null>(null);
  const [untilOpen, setUntilOpen] = useState(false);
  const [untilTime, setUntilTime] = useState("");

  useEffect(() => {
    const listen = (event: Event) => {
      const detail = (event as CustomEvent<ErpQueryFailedDetail>).detail;
      if (detail.code && FORCE_CLOSE_CODES.has(detail.code)) setFailure(detail);
    };
    window.addEventListener(ERP_QUERY_FAILED_EVENT, listen);
    return () => window.removeEventListener(ERP_QUERY_FAILED_EVENT, listen);
  }, []);

  async function control(action: ErpControlAction): Promise<boolean> {
    if (controlBusy) return false;
    if (action.action === "FORCE_CLOSE" && !(await confirm({ title: "強制關閉 ERP",
      description: "會直接結束伺服器上的 ERP（查詢程式開的那一套），ERP 裡尚未存檔的內容會遺失。確定要關閉？",
      confirmLabel: "強制關閉", confirmTone: "danger" }))) return false;
    setControlBusy(true); setControlError(null);
    try {
      const value = await controlErpAgent(action);
      setAgent(current => current ? { ...current, control: value } : current);
      return true;
    } catch (err) { setControlError(errorMessage(err)); return false; }
    finally { setControlBusy(false); }
  }

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
    if (!(await confirm(operation === "issue"
      ? { title: "產生新憑證", description: "產生新憑證後，舊憑證會立即失效。", confirmLabel: "產生新憑證", confirmTone: "danger" }
      : { title: "撤銷憑證", description: "撤銷後公司的 ERP 查詢程式將無法再連線。", confirmLabel: "撤銷", confirmTone: "danger" }))) return;
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
    if (busy || controlBusy) return;
    setOpen(false);
    setNewToken(null);
    setError(null);
  }

  const connected = !agentError && agent?.online === true;
  const label = agentError ? "狀態未知" : connected ? "已連線" : "未連線";
  const held = agent?.control.holdUntil ?? null;
  const pending = agent?.control.request ?? null;
  const tone = agentError ? "neutral" : !connected ? "danger" : held || pending ? "warning" : "success";
  const summary = held ? "ERP 暫停至 " + clock(held) : pending ? "等待關閉 ERP" : label;
  return <>
    {confirmationDialog}
    <button type="button" className="cy-op-button compact"
      aria-label={"ERP 查詢程式：" + summary} title="ERP 查詢程式與關閉 ERP" onClick={() => setOpen(true)}>
      <span className="cy-status-dot" data-tone={tone} aria-hidden="true" />{connected && !held && !pending ? "查詢程式 · " + label : summary}
    </button>
    <Dialog open={open} title={"ERP 查詢程式 · " + label} size="medium" onClose={close} dismissible={!busy && !controlBusy}>
      <h3 className="cy-erp-control-title">關閉 ERP</h3>
      <p>把 ERP 的使用人數空出來給需要的同事。會等目前排隊的查詢跑完才關閉；暫停期間不能送出新的 ERP 查詢，查詢程式也不會自動開啟 ERP。</p>
      {held
        ? <div className="cy-erp-held-box" role="status">
          <span>ERP 暫停中，<strong>{clock(held)}</strong> 後可再查詢。暫停期間送出的查詢可加入佇列，暫停結束後自動查詢。</span>
          <button type="button" className="cy-op-button primary" disabled={controlBusy} onClick={() => void control({ action: "RESUME" })}>取消暫停</button>
        </div>
        : <>
          <div className="cy-op-page-actions">
            <button type="button" className="cy-op-button" disabled={controlBusy || !!pending} onClick={() => void control({ action: "CLOSE", minutes: 0 })}>立即關閉</button>
            <button type="button" className="cy-op-button" disabled={controlBusy} onClick={() => void control({ action: "CLOSE", minutes: 15 })}>關閉 15 分鐘</button>
            <button type="button" className="cy-op-button" disabled={controlBusy} onClick={() => void control({ action: "CLOSE", minutes: 30 })}>關閉 30 分鐘</button>
            <button type="button" className="cy-op-button" disabled={controlBusy} onClick={() => void control({ action: "CLOSE", minutes: 60 })}>關閉 1 小時</button>
            <button type="button" className="cy-op-button" aria-expanded={untilOpen} disabled={controlBusy} onClick={() => setUntilOpen(open => !open)}>關閉到…</button>
          </div>
          {untilOpen && <form className="cy-erp-until" onKeyDown={enterAdvancesFields} onSubmit={event => { event.preventDefault(); const until = untilIso(untilTime);
            if (!until) { setControlError("請選擇時間。"); return; }
            void control({ action: "CLOSE", until }).then(ok => { if (ok) setUntilOpen(false); }); }}>
            <Field label="關閉到" size="s" hint={untilHint(untilTime)}>
              <input className="cy-op-input" type="time" value={untilTime} onChange={event => setUntilTime(event.target.value)} />
            </Field>
            <button type="submit" className="cy-op-button primary" disabled={controlBusy || !untilTime}>確定</button>
          </form>}
        </>}
      {pending ? <p role="status">{pending === "FORCE_CLOSE" ? "等待查詢程式強制關閉 ERP…" : "等待查詢程式關閉 ERP…"}</p>
        : agent?.control.resultAt && (agent.control.result === "KEPT_OPEN" || agent.control.result === "FAILED")
          ? <p role="status">{"上次關閉（" + clock(agent.control.resultAt) + "）：" + RESULT_TEXT[agent.control.result]}</p> : null}
      <div className="cy-op-page-actions">
        <button type="button" className="cy-op-button danger" disabled={controlBusy} onClick={() => void control({ action: "FORCE_CLOSE" })}>強制關閉 ERP</button>
      </div>
      {controlError && <p className="cy-notice cy-notice-danger" role="alert">{controlError}</p>}
      {isSuperAdmin && <>
      <h3 className="cy-erp-control-title">連線憑證</h3>
      <p>只有超級管理員能產生或撤銷憑證。每次產生的原文只顯示一次，請立即複製到公司電腦的安全設定。</p>
      <p>目前憑證：{credential === null ? "讀取中或無法取得"
        : credential.configured ? "已啟用" : "尚未設定或已撤銷"}</p>
      <div className="cy-op-page-actions">
        <button type="button" className="cy-op-button" disabled={busy} aria-busy={busy || undefined}
          onClick={() => void manageCredential("issue")}>
          產生／更換憑證
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
      {error && <p className="cy-notice cy-notice-danger" role="alert">{error}</p>}
      </>}
    </Dialog>
    <Dialog open={!!failure} title="ERP 查詢失敗" size="small" onClose={() => setFailure(null)}
      footer={<div className="cy-dialog-action-row">
        <button type="button" className="cy-op-button" onClick={() => setFailure(null)}>不用</button>
        <button type="button" className="cy-op-button danger" disabled={controlBusy}
          onClick={() => void control({ action: "FORCE_CLOSE" }).then(ok => { if (ok) setFailure(null); })}>強制關閉 ERP</button>
      </div>}>
      <p>{failure?.message}</p>
      <p>ERP 可能卡住了。要強制關閉伺服器上的 ERP 嗎？關閉後下一筆查詢會自動重新開啟。</p>
    </Dialog>
  </>;
}

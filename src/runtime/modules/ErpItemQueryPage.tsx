import { FormEvent, useEffect, useState } from "react";
import { ApiClientError } from "../../api/client";
import { createErpItemQuery, issueErpAgentCredential, revokeErpAgentCredential, loadErpAgentCredentialStatus, loadErpAgentStatus, loadErpItemQuery, type ErpAgentCredentialStatus } from "../api/erp-item-query-client";
import type { ErpAgentStatus, ErpField, ErpQueryResult, ErpQueryStatus } from "../../../shared/erp-item-query";
import "./erp-item-query.css";

const statusLabels: Record<ErpQueryStatus, string> = {
  QUEUED: "排隊中", RUNNING: "查詢中", DONE: "查詢完成",
  NOT_FOUND: "查無此品號", FAILED: "查詢失敗", EXPIRED: "等待逾時",
};
const active = (status: ErpQueryStatus) => status === "QUEUED" || status === "RUNNING";
function readableError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "QUERY_ALREADY_ACTIVE") return "已有一筆查詢尚未結束，請等候完成後再試。";
    if (error.code === "ACCESS_DENIED") return "你目前沒有 ERP 品號查詢的模組權限。";
    if (error.code === "INVALID_ITEM_NO") return "請輸入 1～40 字且沒有空白的品號。";
    return error.message || error.code;
  }
  return "連線失敗，請稍後再試。";
}
function Fields({ fields }: { fields: readonly ErpField[] }) {
  return <dl className="cy-erp-fields">{fields.map(field => (
    <div key={field.name}><dt>{field.name}</dt><dd>{field.value || "—"}</dd></div>
  ))}</dl>;
}
export function ErpItemQueryPage({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  const [itemNo, setItemNo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ErpQueryResult | null>(null);
  const [queryId, setQueryId] = useState<string | null>(null);
  const [agent, setAgent] = useState<ErpAgentStatus | null>(null);
  const [agentError, setAgentError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credential, setCredential] = useState<ErpAgentCredentialStatus | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [credentialError, setCredentialError] = useState<string | null>(null);
  useEffect(() => {
    if (!isSuperAdmin) return;
    let disposed = false;
    void loadErpAgentCredentialStatus()
      .then(state => { if (!disposed) setCredential(state); })
      .catch(err => { if (!disposed) setCredentialError(readableError(err)); });
    return () => { disposed = true; };
  }, [isSuperAdmin]);

  async function manageCredential(operation: "issue" | "revoke") {
    if (credentialBusy) return;
    const confirmed = window.confirm(operation === "issue"
      ? "產生新憑證會立即使舊憑證失效。確定要繼續？"
      : "撤銷憑證會立即中斷公司查詢程式的後續連線。確定撤銷？");
    if (!confirmed) return;
    setCredentialBusy(true);
    setCredentialError(null);
    setNewToken(null);
    try {
      if (operation === "issue") {
        const issued = await issueErpAgentCredential();
        setNewToken(issued.token);
      } else {
        await revokeErpAgentCredential();
      }
      setCredential(await loadErpAgentCredentialStatus());
    } catch (err) { setCredentialError(readableError(err)); }
    finally { setCredentialBusy(false); }
  }

  useEffect(() => {
    let disposed = false;
    const refresh = () => {
      void loadErpAgentStatus()
        .then(state => { if (!disposed) { setAgent(state); setAgentError(false); } })
        .catch(() => { if (!disposed) { setAgent(null); setAgentError(true); } });
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!queryId) return;
    let disposed = false;
    let pending = false;
    const refresh = () => {
      if (pending) return;
      pending = true;
      void loadErpItemQuery(queryId)
        .then(job => {
          if (disposed) return;
          setResult(job);
          setError(null);
          if (!active(job.status)) setQueryId(null);
        })
        .catch(err => {
          if (disposed) return;
          setError(readableError(err));
          setQueryId(null);
        })
        .finally(() => { pending = false; });
    };
    refresh();
    const timer = window.setInterval(refresh, 1500);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [queryId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || queryId) return;
    const value = itemNo.trim();
    if (!value || Array.from(value).length > 40 || /\s|[\x00-\x1f\x7f]/u.test(value)) {
      setError("請輸入 1～40 字且沒有空白的品號。");
      return;
    }
    setSubmitting(true);
    setResult(null);
    setError(null);
    try {
      const job = await createErpItemQuery(value);
      setResult({
        ...job, status: "QUEUED", fields: [], warehouses: [], startedAt: null,
        completedAt: null, elapsedMs: null, errorCode: null, errorMessage: null,
        resultCleared: false,
      });
      setQueryId(job.id);
    } catch (err) { setError(readableError(err)); }
    finally { setSubmitting(false); }
  }

  return <section className="cy-erp-page">
    <header className="cy-op-page-header">
      <div><h1>ERP 品號查詢</h1><p>僅供查閱 SMART ERP 現有品號，不會新增或修改 ERP 或 CY Web 商品資料。</p></div>
    </header>
    <div className="cy-op-panel cy-erp-query-box">
      <p className={agent?.online ? "cy-erp-agent-online" : "cy-erp-agent-offline"} role="status">
        {agentError ? "目前無法確認查詢程式狀態" : agent?.online
          ? "公司查詢程式已連線" : "公司查詢程式目前離線；送出後可能等待逾時"}
      </p>
      <form onSubmit={event => void submit(event)} className="cy-erp-form">
        <label htmlFor="erp-item-no">ERP 品號</label>
        <input id="erp-item-no" value={itemNo} maxLength={40} autoComplete="off"
          placeholder="例如 T0001" onChange={event => setItemNo(event.target.value)}
          disabled={submitting || !!queryId} required />
        <button className="cy-op-button primary" type="submit" disabled={submitting || !!queryId}>
          {submitting ? "送出中…" : queryId ? "等待查詢結果…" : "查詢"}
        </button>
      </form>
      {error ? <p className="cy-erp-error" role="alert">{error}</p> : null}
    </div>
    {isSuperAdmin && <section className="cy-op-panel cy-erp-credentials">
      <h2>公司查詢程式連線憑證</h2>
      <p>只有超級管理員能產生或撤銷憑證。每次產生的原文只顯示一次，請立即複製至公司電腦的安全設定。</p>
      <p>目前狀態：{credential === null ? "讀取中或無法取得" : credential.configured ? "已啟用" : "尚未設定或已撤銷"}</p>
      <div className="cy-op-page-actions">
        <button type="button" className="cy-op-button" disabled={credentialBusy}
          onClick={() => void manageCredential("issue")}>{credentialBusy ? "處理中…" : "產生／更換憑證"}</button>
        <button type="button" className="cy-op-button danger" disabled={credentialBusy || !credential?.configured}
          onClick={() => void manageCredential("revoke")}>撤銷憑證</button>
      </div>
      {newToken && <div className="cy-erp-token" role="status">
        <strong>請立即複製，離開後無法再次查看：</strong>
        <code>{newToken}</code>
        <button type="button" className="cy-op-button"
          onClick={() => void navigator.clipboard.writeText(newToken).catch(() => setCredentialError("無法自動複製，請手動選取憑證。"))}>複製憑證</button>
        <button type="button" className="cy-op-button" onClick={() => setNewToken(null)}>已保存，隱藏憑證</button>
      </div>}
      {credentialError && <p className="cy-erp-error" role="alert">{credentialError}</p>}
    </section>}
    {result && <div className="cy-op-panel cy-erp-results" aria-live="polite">
      <h2>{statusLabels[result.status]}</h2>
      <p>品號：<strong>{result.itemNo}</strong>
        {result.elapsedMs !== null ? `　耗時 ${(result.elapsedMs / 1000).toFixed(1)} 秒` : ""}
      </p>
      {result.status === "QUEUED" && <p>已加入查詢佇列，等待公司電腦處理。</p>}
      {result.status === "RUNNING" && <p>正在 ERP 查詢與匯出，通常需 10～20 秒。</p>}
      {result.errorMessage && <p className="cy-erp-error">{result.errorMessage}</p>}
      {result.status === "EXPIRED" && <p>排隊超過兩分鐘，請重新送出查詢。</p>}
      {result.status === "DONE" && (result.resultCleared
        ? <p>資料僅暫存十分鐘，目前已清除；請重新查詢取得最新內容。</p>
        : <>
          <h3>品號資料</h3>
          <Fields fields={result.fields} />
          <h3>庫別資料</h3>
          {result.warehouses.length === 0 ? <p>無庫別資料。</p>
            : <div className="cy-erp-table-scroller"><table className="cy-erp-warehouse">
              <thead><tr><th scope="col">庫別</th><th scope="col">庫別名稱</th>
                <th scope="col">儲位</th><th scope="col">安全存量</th><th scope="col">經濟批量</th>
                <th scope="col">上次盤點日</th><th scope="col">最近入庫日</th><th scope="col">最近出庫日</th></tr></thead>
              <tbody>{result.warehouses.map((warehouse, index) => {
                const values = new Map(warehouse.map(field => [field.name, field.value]));
                return <tr key={index}>{["庫別", "庫別名稱", "儲位", "安全存量", "經濟批量", "上次盤點日", "最近入庫日", "最近出庫日"]
                  .map(name => <td key={name}>{values.get(name) || "—"}</td>)}</tr>;
              })}</tbody>
            </table></div>}
        </>)}
    </div>}
  </section>;
}

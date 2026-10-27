import { useEffect, useRef, useState } from "react";
import { ApiClientError } from "../../api/client";
import type { ErpQueryResult, ErpQueryStatus } from "../../../shared/erp-item-query";
import { useFeedbackMessage } from "../../ui/feedback/FeedbackProvider";
import { createErpQuery, loadErpItemQuery, type ErpQueryRequest } from "../api/erp-item-query-client";
import { ERP_QUERY_FAILED_EVENT, type ErpQueryFailedDetail } from "./ErpAgentCredentialControl";

export const runningStatus = (status: ErpQueryStatus) => status === "QUEUED" || status === "RUNNING";

export function readableErpError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "QUERY_ALREADY_ACTIVE") return "已有一筆查詢尚未結束，請等候完成後再試。";
    if (error.code === "ERP_HELD") return error.message;
    if (error.code === "ACCESS_DENIED") return "你目前沒有這項 ERP 查詢的模組權限。";
    if (error.code === "INVALID_ITEM_NO") return "品號只能輸入 1～40 個英文字母、數字或「-」。";
    if (error.code === "INVALID_KEYWORD") return "請輸入 1～40 字，不可含單引號或 % _ [ ]。";
    return error.message || error.code;
  }
  return "連線失敗，請稍後再試。";
}

/**
 * The page's last job id, kept for the browser tab (user 2026-10-27: switching to another module
 * and back must still show the running query). Only the id is kept; the job is loaded again from
 * CY Web, which drops results after a while. Storage may be unavailable: then nothing is kept.
 */
const JOB_KEY_PREFIX = "cyweb.erp-job.";
function keptJob(key: string | undefined): string | null {
  if (!key) return null;
  try { return window.sessionStorage.getItem(JOB_KEY_PREFIX + key); } catch { return null; }
}
function keepJob(key: string | undefined, id: string | null) {
  if (!key) return;
  try {
    if (id) window.sessionStorage.setItem(JOB_KEY_PREFIX + key, id);
    else window.sessionStorage.removeItem(JOB_KEY_PREFIX + key);
  } catch { /* nothing kept */ }
}

/**
 * The one ERP job of the page (CY Web allows one per member): create, poll every 1.5 s until it
 * ends, keep the result. Every category uses this owner; a new request always runs ERP again.
 * With a key, the page shows its last job again when it is opened anew (running or finished).
 */
export function useErpJob(key?: string) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ErpQueryResult | null>(null);
  const [queryId, setQueryId] = useState<string | null>(() => keptJob(key));
  // Whether this page saw the job running: a failure found on coming back is not offered again.
  const sawRunning = useRef(false);
  const [, , setError] = useFeedbackMessage<string | null>(null);
  useEffect(() => {
    if (!queryId) return;
    let cancelled = false; let pending = false;
    const refresh = () => {
      if (pending) return; pending = true;
      void loadErpItemQuery(queryId).then(job => {
        if (cancelled) return;
        setResult(job); setError(null);
        if (runningStatus(job.status)) sawRunning.current = true;
        if (job.status === "FAILED" || job.status === "EXPIRED") {
          const message = job.errorMessage || "查詢已逾時，請重新查詢。";
          setError(message);
          // The header ERP control offers a force-close for failures that may mean ERP is stuck.
          if (sawRunning.current) window.dispatchEvent(new CustomEvent<ErpQueryFailedDetail>(ERP_QUERY_FAILED_EVENT, {
            detail: { code: job.status === "EXPIRED" ? "AGENT_TIMEOUT" : job.errorCode, message } }));
        }
        if (!runningStatus(job.status)) setQueryId(null);
      }).catch(err => {
        if (cancelled) return;
        // A kept job CY Web no longer has is simply forgotten, without an error.
        if (err instanceof ApiClientError && err.code === "QUERY_NOT_FOUND") keepJob(key, null);
        else setError(readableErpError(err));
        setQueryId(null);
      }).finally(() => { pending = false; });
    };
    refresh();
    const timer = window.setInterval(refresh, 1500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [queryId]);
  async function start(request: ErpQueryRequest): Promise<boolean> {
    if (submitting || queryId) return false;
    setSubmitting(true); setError(null);
    try {
      const job = await createErpQuery(request);
      setResult({ ...job, fields: [], warehouses: [], elapsedMs: null, batchManaged: null, batches: [], history: null,
        items: [], orders: [], purchases: [], bills: [], restock: [], total: 0, truncated: false, startedAt: null, progress: null, completedAt: null,
        errorCode: null, errorMessage: null, resultCleared: false });
      sawRunning.current = true;
      setQueryId(job.id);
      keepJob(key, job.id);
      return true;
    } catch (err) { setError(readableErpError(err)); return false; }
    finally { setSubmitting(false); }
  }
  return {
    result, submitting, busy: submitting || !!queryId, start, setError,
    clear: () => { if (!queryId) { setResult(null); keepJob(key, null); } },
  };
}
export type ErpJob = ReturnType<typeof useErpJob>;

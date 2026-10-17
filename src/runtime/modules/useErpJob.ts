import { useEffect, useState } from "react";
import { ApiClientError } from "../../api/client";
import type { ErpQueryResult, ErpQueryStatus } from "../../../shared/erp-item-query";
import { useFeedbackMessage } from "../../ui/feedback/FeedbackProvider";
import { createErpQuery, loadErpItemQuery, type ErpQueryRequest } from "../api/erp-item-query-client";

export const runningStatus = (status: ErpQueryStatus) => status === "QUEUED" || status === "RUNNING";

export function readableErpError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "QUERY_ALREADY_ACTIVE") return "已有一筆查詢尚未結束，請等候完成後再試。";
    if (error.code === "ACCESS_DENIED") return "你目前沒有這項 ERP 查詢的模組權限。";
    if (error.code === "INVALID_ITEM_NO") return "品號只能輸入 1～40 個英文字母或數字。";
    if (error.code === "INVALID_KEYWORD") return "請輸入 1～40 字，不可含單引號或 % _ [ ]。";
    return error.message || error.code;
  }
  return "連線失敗，請稍後再試。";
}

/**
 * The one ERP job of the page (CY Web allows one per member): create, poll every 1.5 s until it
 * ends, keep the result. Every category uses this owner; a new request always runs ERP again.
 */
export function useErpJob() {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ErpQueryResult | null>(null);
  const [queryId, setQueryId] = useState<string | null>(null);
  const [, , setError] = useFeedbackMessage<string | null>(null);
  useEffect(() => {
    if (!queryId) return;
    let cancelled = false; let pending = false;
    const refresh = () => {
      if (pending) return; pending = true;
      void loadErpItemQuery(queryId).then(job => {
        if (cancelled) return;
        setResult(job); setError(null);
        if (job.status === "FAILED" || job.status === "EXPIRED") setError(job.errorMessage || "查詢已逾時，請重新查詢。");
        if (!runningStatus(job.status)) setQueryId(null);
      }).catch(err => {
        if (cancelled) return;
        setError(readableErpError(err)); setQueryId(null);
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
        items: [], orders: [], purchases: [], bills: [], total: 0, truncated: false, startedAt: null, completedAt: null,
        errorCode: null, errorMessage: null, resultCleared: false });
      setQueryId(job.id);
      return true;
    } catch (err) { setError(readableErpError(err)); return false; }
    finally { setSubmitting(false); }
  }
  return {
    result, submitting, busy: submitting || !!queryId, start, setError,
    clear: () => { if (!queryId) setResult(null); },
  };
}
export type ErpJob = ReturnType<typeof useErpJob>;

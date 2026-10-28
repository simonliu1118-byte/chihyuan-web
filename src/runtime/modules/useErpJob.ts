import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ApiClientError } from "../../api/client";
import type { ErpQueryResult, ErpQueryStatus, ErpQueryType } from "../../../shared/erp-item-query";
import { useFeedbackMessage } from "../../ui/feedback/FeedbackProvider";
import { createErpQuery, loadErpItemQuery, loadRecentErpJobs, type ErpQueryRequest, type RecentErpJob } from "../api/erp-item-query-client";
import { ERP_QUERY_FAILED_EVENT, type ErpQueryFailedDetail } from "./ErpAgentCredentialControl";

export const runningStatus = (status: ErpQueryStatus) => status === "QUEUED" || status === "RUNNING";

export function readableErpError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "QUERY_ALREADY_ACTIVE") return error.message || "你的查詢已達上限，請等其中一筆完成後再試。";
    if (error.code === "ERP_HELD") return error.message;
    if (error.code === "ACCESS_DENIED") return "你目前沒有這項 ERP 查詢的模組權限。";
    if (error.code === "INVALID_ITEM_NO") return "品號只能輸入 1～40 個英文字母、數字或「-」。";
    if (error.code === "INVALID_KEYWORD") return "請輸入 1～40 字，不可含單引號或 % _ [ ]。";
    return error.message || error.code;
  }
  return "連線失敗，請稍後再試。";
}

/**
 * Whether the page holding the job is the one on screen. The ERP pages stay mounted while the
 * member works in another module (user 2026-10-27); a hidden page announces its outcome with
 * ERP_QUERY_DONE_EVENT instead of an alert over the other module.
 */
export const ErpPageVisibleContext = createContext(true);

/** Raised when a job this page saw running ends; the app shows a notice when its page is hidden. */
export const ERP_QUERY_DONE_EVENT = "cy-erp-query-done";
export type ErpQueryDoneDetail = { route: string; key: string; label: string; status: ErpQueryStatus; message: string | null; visible: boolean };

/**
 * Asked when a query is refused because ERP is paused (user 2026-10-28): the app's prompt answers
 * true to queue it until the pause ends, false to drop it. Without a prompt on screen it is null.
 */
export const ERP_HELD_EVENT = "cy-erp-held";
export type ErpHeldDetail = { message: string; answer: (queue: boolean) => void; handled: boolean };
function askHeld(message: string): Promise<boolean | null> {
  return new Promise(resolve => {
    const detail: ErpHeldDetail = { message, answer: resolve, handled: false };
    window.dispatchEvent(new CustomEvent<ErpHeldDetail>(ERP_HELD_EVENT, { detail }));
    if (!detail.handled) resolve(null);
  });
}

/**
 * Where a job lives (a page and its category), so the page shows it again when opened anew, on any
 * device, and a notice can lead back to it.
 */
export type ErpJobHome = { route: string; key: string; label: string; types: readonly ErpQueryType[] };

// One read of the member's recent jobs serves every page opened together.
let recent: { at: number; jobs: Promise<RecentErpJob[]> } | null = null;
function recentJobs(): Promise<RecentErpJob[]> {
  if (!recent || Date.now() - recent.at > 5000) recent = { at: Date.now(), jobs: loadRecentErpJobs().catch(() => []) };
  return recent.jobs;
}

/**
 * One ERP job owner (a member may have three queued or running; one per owner): create, poll every 1.5 s until it
 * ends, keep the result. With a home, the page's newest job of the last 24 hours is loaded when the
 * page opens (CY Web keeps a finished result for 5 minutes, its status longer).
 */
export function useErpJob(home?: ErpJobHome) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ErpQueryResult | null>(null);
  const [queryId, setQueryId] = useState<string | null>(null);
  const [, , setError] = useFeedbackMessage<string | null>(null);
  const visible = useContext(ErpPageVisibleContext);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  // Whether this page saw the job running: a job found already finished is shown, not announced.
  const sawRunning = useRef(false);
  const homeTypes = home?.types.join(",");
  useEffect(() => {
    if (!home) return;
    let cancelled = false;
    void recentJobs().then(jobs => {
      const latest = jobs.find(job => home.types.includes(job.queryType));
      if (!cancelled && latest) setQueryId(current => current ?? latest.id);
    });
    return () => { cancelled = true; };
  }, [homeTypes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!queryId) return;
    let cancelled = false; let pending = false;
    const refresh = () => {
      if (pending) return; pending = true;
      void loadErpItemQuery(queryId).then(job => {
        if (cancelled) return;
        setResult(job);
        if (visibleRef.current) setError(null);
        if (runningStatus(job.status)) { sawRunning.current = true; return; }
        setQueryId(null);
        const failed = job.status === "FAILED" || job.status === "EXPIRED";
        const message = failed ? job.errorMessage || "查詢已逾時，請重新查詢。" : null;
        if (!sawRunning.current) return;
        sawRunning.current = false;
        if (home) window.dispatchEvent(new CustomEvent<ErpQueryDoneDetail>(ERP_QUERY_DONE_EVENT,
          { detail: { route: home.route, key: home.key, label: home.label, status: job.status, message, visible: visibleRef.current } }));
        if (!failed) return;
        if (visibleRef.current) {
          setError(message);
          // The header ERP control offers a force-close for failures that may mean ERP is stuck.
          window.dispatchEvent(new CustomEvent<ErpQueryFailedDetail>(ERP_QUERY_FAILED_EVENT, {
            detail: { code: job.status === "EXPIRED" ? "AGENT_TIMEOUT" : job.errorCode, message: message! } }));
        }
      }).catch(err => {
        if (cancelled) return;
        // A job CY Web no longer has is simply forgotten, without an error.
        if (!(err instanceof ApiClientError && err.code === "QUERY_NOT_FOUND") && visibleRef.current) setError(readableErpError(err));
        setQueryId(null);
      }).finally(() => { pending = false; });
    };
    refresh();
    const timer = window.setInterval(refresh, 1500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [queryId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function start(request: ErpQueryRequest): Promise<boolean> {
    if (submitting || queryId) return false;
    setSubmitting(true); setError(null);
    try {
      let job;
      try { job = await createErpQuery(request); }
      catch (err) {
        if (!(err instanceof ApiClientError && err.code === "ERP_HELD")) throw err;
        const queue = await askHeld(err.message);
        if (queue === null) throw err;
        if (!queue) return false;
        job = await createErpQuery(request, true);
      }
      setResult({ ...job, fields: [], warehouses: [], elapsedMs: null, batchManaged: null, batches: [], history: null,
        items: [], orders: [], purchases: [], bills: [], restock: [], total: 0, truncated: false, startedAt: null, progress: null, completedAt: null,
        errorCode: null, errorMessage: null, resultCleared: false });
      sawRunning.current = true;
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

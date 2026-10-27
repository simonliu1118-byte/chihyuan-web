import { useContext, useEffect, useState } from "react";
import { ERP_QUERY_TYPE_LABELS } from "../../../shared/erp-item-query";
import { loadErpQueue, type ErpQueueJob } from "../api/erp-item-query-client";
import { ErpPageVisibleContext, readableErpError } from "./useErpJob";

const clock = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false });

/** About when a query is done, to the minute (user 2026-10-27: it need not be precise). */
function eta(at: string, now: number): string {
  const minutes = Math.ceil((Date.parse(at) - now) / 60000);
  return `約 ${clock.format(new Date(at))}（${minutes <= 1 ? "1 分鐘內" : `${minutes} 分鐘後`}）`;
}

function progress(job: ErpQueueJob): string | null {
  const p = job.progress;
  if (!p) return null;
  return p.stage === "STOCK" ? `已查庫存 ${p.done}/${p.total}` : `報表 ${p.done}/${p.total}`;
}

/**
 * 排程佇列 (user 2026-10-27): who queries what, in the order the Agent runs them (the order they
 * were sent), with about when each is done. Read every 5 s while on screen.
 */
export function ErpQueuePanel() {
  const visible = useContext(ErpPageVisibleContext);
  const [queue, setQueue] = useState<{ jobs: ErpQueueJob[]; maxPerMember: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const refresh = () => void loadErpQueue().then(next => {
      if (!cancelled) { setQueue(next); setError(null); setNow(Date.now()); }
    }).catch(err => { if (!cancelled) setError(readableErpError(err)); });
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [visible]);
  let waiting = 0;
  return <div className="cy-op-panel cy-erp-queue" aria-live="polite">
    <p className="cy-erp-search-hint">
      ERP 一次執行一筆，依送入時間排序；每人最多 {queue?.maxPerMember ?? 3} 筆排隊或執行中。預估時間依近期同類查詢的平均耗時推算，僅供參考。
    </p>
    {error && <p role="alert" className="cy-notice cy-notice-warning">{error}</p>}
    {!queue ? !error && <p>讀取中…</p>
      : !queue.jobs.length ? <p className="cy-erp-queue-empty">目前沒有排隊或執行中的查詢。</p>
      : <ol className="cy-erp-queue-list">
        {queue.jobs.map(job => {
          const running = job.status === "RUNNING";
          if (!running) waiting += 1;
          return <li key={job.id} className={["cy-erp-queue-row", running ? "is-running" : "", job.mine ? "is-mine" : ""].join(" ").trim()}>
            <span className="cy-erp-queue-state">{running ? "執行中" : `排隊第 ${waiting}`}</span>
            <span className="cy-erp-queue-who">{job.member}{job.mine && <em>（我）</em>}</span>
            <span className="cy-erp-queue-what">
              <strong>{ERP_QUERY_TYPE_LABELS[job.queryType]}</strong>
              {job.target && <span>{job.target}</span>}
              {running && progress(job) && <span className="cy-erp-queue-progress">{progress(job)}</span>}
            </span>
            <span className="cy-erp-queue-eta">{eta(job.estimatedDoneAt, now)}</span>
          </li>;
        })}
      </ol>}
  </div>;
}

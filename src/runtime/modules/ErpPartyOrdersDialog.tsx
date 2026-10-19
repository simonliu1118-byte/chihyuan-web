import { FormEvent, useState } from "react";
import { Loading } from "../../ui/feedback/Loading";
import { Dialog } from "../../ui/overlays/Dialog";
import { HistoryRangeError, resolveDateRange, taipeiToday } from "../../../shared/erp-query-history";
import { ErpJobStatus, showsData } from "./ErpJobStatus";
import { ErpPurchaseOrders } from "./ErpPurchaseOrders";
import { ErpSalesOrders } from "./ErpSalesOrders";
import { useErpJob } from "./useErpJob";

/**
 * A customer's 銷貨銷退單 or a supplier's 進貨退貨單 opened from its 資料 (user 2026-10-18: keep the
 * customer／supplier on the page, query the orders in a window). The dialog owns its own job; it
 * opens with the page's dates filled in and waits for 查詢 (user 2026-10-19: dates first), and can
 * be asked again with other dates; the page's result stays.
 */
export function ErpPartyOrdersDialog({ kind, code, name, from, to, onClose }: {
  kind: "SALES" | "PURCHASES"; code: string; name: string; from: string | null; to: string | null; onClose: () => void;
}) {
  const job = useErpJob();
  const [dateFrom, setDateFrom] = useState(from ?? "");
  const [dateTo, setDateTo] = useState(to ?? "");
  const { result, busy, submitting, setError } = job;

  async function query(start: string | null, end: string | null) {
    let dates;
    try { dates = resolveDateRange(start, end, "單據日期"); }
    catch (err) { setError(err instanceof HistoryRangeError ? err.message : "單據日期範圍無效"); return; }
    if (kind === "SALES") await job.start({ queryType: "SALES", customerCode: code, dateFrom: dates.from, dateTo: dates.to });
    else await job.start({ queryType: "PURCHASES", supplierCode: code, dateFrom: dates.from, dateTo: dates.to });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="date"]')).some(input => input.validity.badInput)) {
      setError("請選擇完整且有效的單據日期。"); return;
    }
    void query(dateFrom || null, dateTo || null);
  }
  const what = kind === "SALES" ? "銷貨銷退單" : "進貨退貨單";
  return <Dialog open title={`${name ? name + " " : ""}${code} ${what}`} size="large" onClose={onClose}>
    <form className="cy-erp-history-options cy-erp-dialog-dates" onSubmit={submit} noValidate>
      <label>起日 <input className="cy-op-input" type="date" max={taipeiToday()} value={dateFrom} disabled={busy} onChange={e => setDateFrom(e.target.value)} /></label>
      <label>迄日 <input className="cy-op-input" type="date" max={taipeiToday()} value={dateTo} disabled={busy} onChange={e => setDateTo(e.target.value)} /></label>
      <p>單據日期起訖都未填：去年同月同日至今天；範圍最多三年。</p>
      <button className="cy-op-button primary" type="submit" disabled={busy} aria-busy={submitting || busy || undefined}>{result ? "重新查詢" : "查詢"}</button>
    </form>
    <div className="cy-erp-results cy-erp-order-dialog" aria-live="polite">
      {!result ? submitting ? <Loading /> :  : <>
        <ErpJobStatus result={result} />
        {showsData(result) && (kind === "SALES"
          ? <ErpSalesOrders key={result.id} orders={result.orders} total={result.total} truncated={result.truncated} />
          : <ErpPurchaseOrders key={result.id} orders={result.purchases} total={result.total} truncated={result.truncated} />)}
      </>}
    </div>
  </Dialog>;
}

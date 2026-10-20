import { FormEvent, useMemo, useState } from "react";
import { Loading } from "../../ui/feedback/Loading";
import { HistoryRangeError, resolveRestockRange, taipeiToday } from "../../../shared/erp-query-history";
import { ERP_RESTOCK_MAX_DAYS, type ErpRestockItem } from "../../../shared/erp-item-query";
import { ErpJobStatus, showsData } from "./ErpJobStatus";
import { useErpJob } from "./useErpJob";
import "./erp-item-query.css";

/** Every day of the range, YYYY-MM-DD, oldest first. */
function rangeDays(from: string, to: string): string[] {
  const days: string[] = [];
  for (let t = Date.parse(from + "T00:00:00Z"); t <= Date.parse(to + "T00:00:00Z"); t += 86400000)
    days.push(new Date(t).toISOString().slice(0, 10));
  return days;
}
const quantity = (value: number) => Number.isFinite(value) ? value.toLocaleString("zh-TW", { maximumFractionDigits: 6 }) : "";
/** A quantity cell: 0 stays blank so the days that moved stand out. */
const cell = (text: string | undefined) => { const n = Number(text ?? 0); return n ? quantity(n) : ""; };

function RestockTable({ from, to, items }: { from: string; to: string; items: readonly ErpRestockItem[] }) {
  const days = useMemo(() => rangeDays(from, to), [from, to]);
  return <div className="cy-erp-table-scroller cy-restock-scroller" role="region" aria-label="進貨輔助結果" tabIndex={0}>
    <table className="cy-restock-table">
      <thead>
        <tr>
          <th rowSpan={2} className="cy-restock-item">品號／品名</th>
          {days.map(day => <th key={day} colSpan={2} className="cy-restock-day">{day.slice(5).replace("-", "/")}</th>)}
          <th rowSpan={2}>銷貨小計</th><th rowSpan={2}>銷退小計</th><th rowSpan={2}>淨銷</th><th rowSpan={2}>庫存</th>
        </tr>
        <tr>{days.map(day => [<th key={day + "s"} className="cy-restock-sub cy-restock-day">銷</th>, <th key={day + "r"} className="cy-restock-sub">退</th>])}</tr>
      </thead>
      <tbody>{items.map(item => {
        const byDay = new Map(item.days.map(d => [d.date, d]));
        const net = Number(item.sold) - Number(item.returned);
        return <tr key={item.itemCode}>
          <th scope="row" className="cy-restock-item"><strong>{item.itemCode}</strong><span>{item.itemName}{item.unit ? `（${item.unit}）` : ""}</span></th>
          {days.map(day => [
            <td key={day + "s"} className="cy-restock-day">{cell(byDay.get(day)?.sold)}</td>,
            <td key={day + "r"} className="cy-restock-returned">{cell(byDay.get(day)?.returned)}</td>,
          ])}
          <td>{quantity(Number(item.sold))}</td>
          <td className="cy-restock-returned">{cell(item.returned) || "0"}</td>
          <td className="cy-restock-strong">{quantity(net)}</td>
          <td className="cy-restock-strong" title={item.stock == null ? item.stockNote || "未查到庫存" : undefined}>
            {item.stock == null ? "—" : quantity(Number(item.stock))}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

/**
 * 進貨輔助 (user 2026-10-20, a simple first version): pick a 單據日期 range (both ends), CY Web asks
 * the ERP Agent for every customer's 銷貨單 and 銷退單 in it, summed per 品號 and day, and each
 * 品號's 庫存數量, shown in one table.
 */
export function RestockAssistPage() {
  const job = useErpJob();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const { result, busy, submitting, setError } = job;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="date"]')).some(input => input.validity.badInput)) {
      setError("請選擇完整且有效的單據日期。"); return;
    }
    let range;
    try { range = resolveRestockRange(dateFrom || null, dateTo || null, ERP_RESTOCK_MAX_DAYS); }
    catch (err) { setError(err instanceof HistoryRangeError ? err.message : "單據日期範圍無效"); return; }
    void job.start({ queryType: "RESTOCK", dateFrom: range.from, dateTo: range.to });
  }
  const mine = result?.queryType === "RESTOCK" ? result : null;
  return <div className="cy-erp-page">
    <div className="cy-op-panel cy-erp-query-box">
      <form role="search" className="cy-erp-form" onSubmit={submit} noValidate>
        <div className="cy-erp-history-options">
          <label>起日 <input className="cy-op-input" type="date" required max={taipeiToday()} value={dateFrom} disabled={busy} onChange={e => setDateFrom(e.target.value)} /></label>
          <label>迄日 <input className="cy-op-input" type="date" required max={taipeiToday()} value={dateTo} disabled={busy} onChange={e => setDateTo(e.target.value)} /></label>
          <p>起訖都要填，最多 {ERP_RESTOCK_MAX_DAYS} 天。會查這段期間所有客戶的銷貨單與銷退單，依品號、日期加總，再逐一查各品號目前庫存。</p>
        </div>
        <div><button className="cy-op-button primary" type="submit" disabled={busy} aria-busy={submitting || busy || undefined}>查詢</button></div>
      </form>
    </div>
    {submitting && !mine ? <Loading /> : mine && <div className="cy-op-panel cy-erp-results" aria-live="polite">
      <ErpJobStatus result={mine} />
      {showsData(mine) && mine.dateFrom && mine.dateTo && <>
        <h3>共 {mine.total} 個品號</h3>
        {mine.truncated && <p className="cy-notice cy-notice-warning">品號超過 {mine.restock.length} 個，只列出前 {mine.restock.length} 個，請縮短日期範圍。</p>}
        <RestockTable from={mine.dateFrom} to={mine.dateTo} items={mine.restock} />
      </>}
    </div>}
  </div>;
}

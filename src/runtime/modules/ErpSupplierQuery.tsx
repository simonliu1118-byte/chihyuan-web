import { FormEvent, useEffect, useRef, useState } from "react";
import { HistoryRangeError, resolveDateRange, taipeiToday } from "../../../shared/erp-query-history";
import { parseErpCode, parseErpNameKeyword } from "../../../shared/erp-name-search";
import { ERP_SUPPLIER_SEARCH_FIELDS, type ErpField } from "../../../shared/erp-item-query";
import { ErpQueryRows } from "./ErpQueryRows";
import { ErpJobStatus, Fields, showsData } from "./ErpJobStatus";
import { ErpPurchaseOrders } from "./ErpPurchaseOrders";
import { ErpPartyOrdersDialog } from "./ErpPartyOrdersDialog";
import type { ErpJob } from "./useErpJob";

type Mode = "CODE" | "NAME" | "PURCHASES";
const MODES: { key: Mode; label: string }[] = [
  { key: "CODE", label: "廠商代號" }, { key: "NAME", label: "廠商名稱" }, { key: "PURCHASES", label: "進貨退貨單" },
];
const rowsOf = (rows: readonly ErpField[][]) =>
  rows.map(row => { const values = new Map(row.map(f => [f.name, f.value])); return ERP_SUPPLIER_SEARCH_FIELDS.map(name => values.get(name) || ""); });

/**
 * 廠商 (PURI01, user 2026-10-17: the same page and flow as 客戶): one supplier by 廠商代號, a list by
 * 簡稱／公司全名 where a pick or a single match queries that supplier, and the supplier's 進貨退貨單
 * in a 單據日期 range (PURR18+PURR22, user 2026-10-18; a name finds the supplier first).
 */
export function ErpSupplierQuery({ job }: { job: ErpJob }) {
  const [mode, setMode] = useState<Mode>("CODE");
  const [text, setText] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // What a picked supplier is queried for: its data, or its 進貨退貨單 (with the range it was asked with).
  const [follow, setFollow] = useState<{ purchases: boolean; from: string | null; to: string | null }>({ purchases: false, from: null, to: null });
  const autoFollowed = useRef<string | null>(null);
  // The orders opened from the 資料 view, in a window (user 2026-10-18: keep the 資料 on the page).
  const [ordersOf, setOrdersOf] = useState<{ code: string; name: string } | null>(null);
  const { result, busy, submitting, setError } = job;

  function range(from: string | null, to: string | null) {
    try { return resolveDateRange(from, to, "單據日期"); }
    catch (err) { setError(err instanceof HistoryRangeError ? err.message : "單據日期範圍無效"); return null; }
  }
  async function querySupplier(code: string, purchases: boolean, from: string | null, to: string | null) {
    if (!purchases) { await job.start({ queryType: "SUPPLIER_NO", supplierCode: code }); return; }
    const dates = range(from, to);
    if (dates) await job.start({ queryType: "PURCHASES", supplierCode: code, dateFrom: dates.from, dateTo: dates.to });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (mode === "PURCHASES" && Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="date"]')).some(input => input.validity.badInput)) {
      setError("請選擇完整且有效的單據日期。"); return;
    }
    const code = parseErpCode(text);
    if (mode === "CODE" || (mode === "PURCHASES" && code)) {
      if (!code) { setError("廠商代號只能輸入 1～40 個英文字母、數字或「-」。"); return; }
      await querySupplier(code, mode === "PURCHASES", dateFrom || null, dateTo || null);
      return;
    }
    const keyword = parseErpNameKeyword(text);
    if (!keyword) { setError("請輸入 1～40 字廠商名稱，不可含單引號或 % _ [ ]、控制字元。"); return; }
    if (mode === "PURCHASES" && !range(dateFrom || null, dateTo || null)) return;
    setFollow({ purchases: mode === "PURCHASES", from: dateFrom || null, to: dateTo || null });
    await job.start({ queryType: "SUPPLIER_NAME", keyword });
  }
  const mine = result && ["SUPPLIER_NO", "SUPPLIER_NAME", "PURCHASES"].includes(result.queryType) ? result : null;
  // One matching supplier: query it at once, once per list (as 客戶).
  useEffect(() => {
    if (!mine || mine.queryType !== "SUPPLIER_NAME" || !showsData(mine) || mine.items.length !== 1 || busy) return;
    if (autoFollowed.current === mine.id) return;
    autoFollowed.current = mine.id;
    const code = mine.items[0].find(f => f.name === "廠商代號")?.value;
    if (code) void querySupplier(code, follow.purchases, follow.from, follow.to);
  }, [mine, busy]);
  const supplierCode = mine?.queryType === "SUPPLIER_NO" ? mine.code : null;
  return <>
    <div className="cy-op-panel cy-erp-query-box">
      <form role="search" className="cy-erp-form" onSubmit={event => void submit(event)} noValidate>
        <div className="cy-segmented" role="group" aria-label="查詢方式">
          {MODES.map(m => <button key={m.key} type="button" aria-pressed={mode === m.key} disabled={busy}
            onClick={() => { setMode(m.key); setError(null); }}>{m.label}</button>)}
        </div>
        <div className="cy-erp-query-row">
          <input className="cy-op-input" value={text} maxLength={40} autoComplete="off" disabled={busy} required
            aria-label={mode === "CODE" ? "廠商代號" : mode === "NAME" ? "廠商名稱" : "廠商代號或名稱"}
            placeholder={mode === "CODE" ? "請輸入廠商代號" : mode === "NAME" ? "請輸入廠商簡稱或全名" : "請輸入廠商代號或名稱"}
            onChange={e => setText(e.target.value)} />
          <button className="cy-op-button primary" type="submit" disabled={busy} aria-busy={submitting || busy || undefined}>
            查詢
          </button>
        </div>
        {mode === "PURCHASES" && <div className="cy-erp-history-options">
          <label>起日 <input className="cy-op-input" type="date" max={taipeiToday()} value={dateFrom} disabled={busy} onChange={e => setDateFrom(e.target.value)} /></label>
          <label>迄日 <input className="cy-op-input" type="date" max={taipeiToday()} value={dateTo} disabled={busy} onChange={e => setDateTo(e.target.value)} /></label>
          <p>單據日期起訖都未填：去年同月同日至今天；範圍最多三年。輸入名稱時先列出廠商。</p>
        </div>}
      </form>
    </div>
    {mine && <div className="cy-op-panel cy-erp-results" aria-live="polite">
      <ErpJobStatus result={mine} />
      {showsData(mine) && mine.queryType === "SUPPLIER_NAME" && <>
        <h3>符合的廠商（{mine.total} 筆）</h3>
        {mine.truncated && <p className="cy-notice cy-notice-warning">結果已達 {mine.items.length} 筆，可能有更多資料，請輸入更完整的名稱。</p>}
        <ErpQueryRows key={mine.id} label="廠商搜尋結果" columns={ERP_SUPPLIER_SEARCH_FIELDS} rows={rowsOf(mine.items)}
          disabled={busy} onItemSelect={code => void querySupplier(code, follow.purchases, follow.from, follow.to)} />
      </>}
      {showsData(mine) && mine.queryType === "SUPPLIER_NO" && <>
        <h3>廠商資料</h3>
        <Fields fields={mine.fields} />
        {supplierCode && <button className="cy-op-button cy-erp-follow" type="button" disabled={busy}
          onClick={() => setOrdersOf({ code: supplierCode, name: mine.fields.find(f => f.name === "廠商簡稱")?.value ?? "" })}>
          查此廠商的進貨退貨單</button>}
      </>}
      {showsData(mine) && mine.queryType === "PURCHASES" && <ErpPurchaseOrders key={mine.id} orders={mine.purchases} truncated={mine.truncated} total={mine.total} />}
    </div>}
    {ordersOf && <ErpPartyOrdersDialog key={ordersOf.code} kind="PURCHASES" code={ordersOf.code} name={ordersOf.name}
      from={dateFrom || null} to={dateTo || null} onClose={() => setOrdersOf(null)} />}
  </>;
}

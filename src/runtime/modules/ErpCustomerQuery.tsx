import { FormEvent, useEffect, useRef, useState } from "react";
import { HistoryRangeError, resolveDateRange, taipeiToday } from "../../../shared/erp-query-history";
import { parseErpCode, parseErpNameKeyword } from "../../../shared/erp-name-search";
import { ERP_CUSTOMER_SEARCH_FIELDS, type ErpField } from "../../../shared/erp-item-query";
import { ErpQueryRows } from "./ErpQueryRows";
import { ErpJobStatus, Fields, showsData } from "./ErpJobStatus";
import { ErpSalesOrders } from "./ErpSalesOrders";
import type { ErpJob } from "./useErpJob";

type Mode = "CODE" | "NAME" | "SALES";
const MODES: { key: Mode; label: string }[] = [
  { key: "CODE", label: "客戶代號" }, { key: "NAME", label: "客戶名稱" }, { key: "SALES", label: "銷貨銷退單" },
];
const rowsOf = (rows: readonly ErpField[][]) =>
  rows.map(row => { const values = new Map(row.map(f => [f.name, f.value])); return ERP_CUSTOMER_SEARCH_FIELDS.map(name => values.get(name) || ""); });

/**
 * 客戶: one customer by 客戶代號, a list by 簡稱／全名 (a pick or a single match queries that
 * customer), and the customer's 銷貨銷退單 in a 單據日期 range (a name finds the customer first;
 * nobody remembers 客戶代號, user 2026-10-16).
 */
export function ErpCustomerQuery({ job }: { job: ErpJob }) {
  const [mode, setMode] = useState<Mode>("CODE");
  const [text, setText] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // What a picked customer is queried for: its data, or its 銷貨銷退單 (with the range it was asked with).
  const [follow, setFollow] = useState<{ sales: boolean; from: string | null; to: string | null }>({ sales: false, from: null, to: null });
  const autoFollowed = useRef<string | null>(null);
  const { result, busy, submitting, setError } = job;

  function range(from: string | null, to: string | null) {
    try { return resolveDateRange(from, to, "單據日期"); }
    catch (err) { setError(err instanceof HistoryRangeError ? err.message : "單據日期範圍無效"); return null; }
  }
  async function queryCustomer(code: string, sales: boolean, from: string | null, to: string | null) {
    if (!sales) { await job.start({ queryType: "CUSTOMER_NO", customerCode: code }); return; }
    const dates = range(from, to);
    if (dates) await job.start({ queryType: "SALES", customerCode: code, dateFrom: dates.from, dateTo: dates.to });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (mode === "SALES" && Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="date"]')).some(input => input.validity.badInput)) {
      setError("請選擇完整且有效的單據日期。"); return;
    }
    const code = parseErpCode(text);
    if (mode === "CODE" || (mode === "SALES" && code)) {
      if (!code) { setError("客戶代號只能輸入 1～40 個英文字母或數字。"); return; }
      await queryCustomer(code, mode === "SALES", dateFrom || null, dateTo || null);
      return;
    }
    const keyword = parseErpNameKeyword(text);
    if (!keyword) { setError("請輸入 1～40 字客戶名稱，不可含單引號或 % _ [ ]、控制字元。"); return; }
    if (mode === "SALES" && !range(dateFrom || null, dateTo || null)) return;
    setFollow({ sales: mode === "SALES", from: dateFrom || null, to: dateTo || null });
    await job.start({ queryType: "CUSTOMER_NAME", keyword });
  }
  const mine = result && ["CUSTOMER_NO", "CUSTOMER_NAME", "SALES"].includes(result.queryType) ? result : null;
  // One matching customer: query it at once (user 2026-10-17), once per list.
  useEffect(() => {
    if (!mine || mine.queryType !== "CUSTOMER_NAME" || !showsData(mine) || mine.items.length !== 1 || busy) return;
    if (autoFollowed.current === mine.id) return;
    autoFollowed.current = mine.id;
    const code = mine.items[0].find(f => f.name === "客戶代號")?.value;
    if (code) void queryCustomer(code, follow.sales, follow.from, follow.to);
  }, [mine, busy]);
  const customerCode = mine?.queryType === "CUSTOMER_NO" ? mine.code : null;
  return <>
    <div className="cy-op-panel cy-erp-query-box">
      <form className="cy-erp-form" onSubmit={event => void submit(event)} noValidate>
        <div className="cy-erp-mode-switch" role="group" aria-label="查詢方式">
          {MODES.map(m => <button key={m.key} type="button" aria-pressed={mode === m.key} disabled={busy}
            className={mode === m.key ? "is-active" : ""} onClick={() => { setMode(m.key); setError(null); }}>{m.label}</button>)}
        </div>
        <div className="cy-erp-query-row">
          <input value={text} maxLength={40} autoComplete="off" disabled={busy} required
            aria-label={mode === "CODE" ? "客戶代號" : mode === "NAME" ? "客戶名稱" : "客戶代號或名稱"}
            placeholder={mode === "CODE" ? "請輸入客戶代號" : mode === "NAME" ? "請輸入客戶簡稱或全名" : "請輸入客戶代號或名稱"}
            onChange={e => setText(e.target.value)} />
          <button className="cy-op-button primary" type="submit" disabled={busy}>
            {submitting ? "送出中…" : busy ? "查詢中…" : "查詢"}
          </button>
        </div>
        {mode === "SALES" && <div className="cy-erp-history-options">
          <label>起日 <input type="date" max={taipeiToday()} value={dateFrom} disabled={busy} onChange={e => setDateFrom(e.target.value)} /></label>
          <label>迄日 <input type="date" max={taipeiToday()} value={dateTo} disabled={busy} onChange={e => setDateTo(e.target.value)} /></label>
          <p>單據日期起訖都未填：去年同月同日至今天；範圍最多三年。輸入名稱時先列出客戶。</p>
        </div>}
      </form>
    </div>
    {mine && <div className="cy-op-panel cy-erp-results" aria-live="polite">
      <ErpJobStatus result={mine} />
      {showsData(mine) && mine.queryType === "CUSTOMER_NAME" && <>
        <h3>符合的客戶（{mine.total} 筆）</h3>
        {mine.truncated && <p className="cy-erp-error">結果已達 {mine.items.length} 筆，可能有更多資料，請輸入更完整的名稱。</p>}
        <ErpQueryRows key={mine.id} label="客戶搜尋結果" columns={ERP_CUSTOMER_SEARCH_FIELDS} rows={rowsOf(mine.items)}
          disabled={busy} onItemSelect={code => void queryCustomer(code, follow.sales, follow.from, follow.to)} />
        <p className="cy-erp-search-hint">{follow.sales ? "點選客戶代號，查詢該客戶的銷貨銷退單。" : "點選客戶代號，重新向 ERP 查詢該客戶完整資料。"}</p>
      </>}
      {showsData(mine) && mine.queryType === "CUSTOMER_NO" && <>
        <h3>客戶資料</h3>
        <Fields fields={mine.fields} />
        {customerCode && <button className="cy-op-button cy-erp-follow" type="button" disabled={busy}
          onClick={() => { setMode("SALES"); setText(customerCode); void queryCustomer(customerCode, true, dateFrom || null, dateTo || null); }}>
          查此客戶的銷貨銷退單</button>}
      </>}
      {showsData(mine) && mine.queryType === "SALES" && <ErpSalesOrders key={mine.id} orders={mine.orders} truncated={mine.truncated} total={mine.total} />}
    </div>}
  </>;
}

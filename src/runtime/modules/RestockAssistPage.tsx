import { FormEvent, useMemo, useState } from "react";
import { Loading } from "../../ui/feedback/Loading";
import { HistoryRangeError, resolveRestockRange, taipeiToday } from "../../../shared/erp-query-history";
import { ERP_RESTOCK_MAX_DAYS, type ErpRestockItem } from "../../../shared/erp-item-query";
import { parseErpCode } from "../../../shared/erp-name-search";
import { ErpItemDialog } from "./ErpItemDialog";
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
const WEEKDAYS = "日一二三四五六";
const weekday = (day: string) => new Date(day + "T00:00:00Z").getUTCDay();
const quantity = (value: number) => Number.isFinite(value) ? value.toLocaleString("zh-TW", { maximumFractionDigits: 6 }) : "";
/** A quantity: 0 stays blank so what moved stands out (user 2026-10-21: the 0s were noise). */
const blankZero = (value: number) => value ? quantity(value) : "";
const giftNote = (gift: string | undefined) => Number(gift ?? 0) ? `含贈品 ${quantity(Number(gift))}` : undefined;

type Row = ErpRestockItem & { net: number; stockValue: number | null; short: boolean };
type Sort = "CODE" | "NET" | "STOCK" | "SHORT";
const SORTS: { key: Sort; label: string }[] = [
  { key: "SHORT", label: "庫存不足優先" }, { key: "NET", label: "淨銷多→少" }, { key: "STOCK", label: "庫存少→多" }, { key: "CODE", label: "品號" },
];
/** 庫存 at or below 0, or below what the range sold net: the rows to look at for 進貨. */
const isShort = (stock: number | null, net: number) => stock !== null && (stock <= 0 || stock < net);
const byCode = (a: Row, b: Row) => a.itemCode.localeCompare(b.itemCode);
/** A row without 庫存 sorts after every row with one. */
const stockOf = (r: Row) => r.stockValue ?? Number.MAX_SAFE_INTEGER;
const sorters: Record<Sort, (a: Row, b: Row) => number> = {
  CODE: byCode,
  NET: (a, b) => b.net - a.net || byCode(a, b),
  STOCK: (a, b) => stockOf(a) - stockOf(b) || byCode(a, b),
  // 庫存不足 first, the furthest below its 淨銷 at the top.
  SHORT: (a, b) => Number(b.short) - Number(a.short) || (stockOf(a) - a.net) - (stockOf(b) - b.net) || byCode(a, b),
};

function RestockTable({ from, to, items, canQueryItem }: { from: string; to: string; items: readonly ErpRestockItem[]; canQueryItem: boolean }) {
  const days = useMemo(() => rangeDays(from, to), [from, to]);
  const rows = useMemo<Row[]>(() => items.map(item => {
    const net = Number(item.sold) - Number(item.returned);
    const stockValue = item.stock == null ? null : Number(item.stock);
    return { ...item, net, stockValue, short: isShort(stockValue, net) };
  }), [items]);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<Sort>("SHORT");
  const [shortOnly, setShortOnly] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return rows.filter(r => (!shortOnly || r.short) && (!needle || r.itemCode.toLowerCase().includes(needle) || r.itemName.toLowerCase().includes(needle)))
      .sort(sorters[sort]);
  }, [rows, filter, sort, shortOnly]);
  const shortCount = rows.filter(r => r.short).length;
  return <>
    <div className="cy-restock-tools">
      <input className="cy-op-input" type="search" value={filter} placeholder="篩選品號或品名" aria-label="篩選品號或品名" onChange={e => setFilter(e.target.value)} />
      <label>排序 <select className="cy-op-input" value={sort} onChange={e => setSort(e.target.value as Sort)}>
        {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
      <label className="cy-restock-check"><input type="checkbox" checked={shortOnly} onChange={e => setShortOnly(e.target.checked)} /> 只看庫存不足（{shortCount}）</label>
      <span className="cy-restock-count">共 {rows.length} 個品號{shown.length !== rows.length ? `（顯示 ${shown.length} 個）` : ""}</span>
    </div>
    <div className="cy-erp-table-scroller cy-restock-scroller" role="region" aria-label="進貨輔助結果" tabIndex={0}>
      <table className="cy-restock-table">
        <thead>
          <tr>
            <th rowSpan={2} className="cy-restock-item">品號／品名</th>
            {days.map((day, i) => <th key={day} colSpan={2} className={dayClass(day, i)}>
              {day.slice(5).replace("-", "/")}<small>（{WEEKDAYS[weekday(day)]}）</small></th>)}
            <th rowSpan={2} className="cy-restock-total">銷貨</th><th rowSpan={2} className="cy-restock-total">銷退</th>
            <th rowSpan={2} className="cy-restock-total">淨銷</th><th rowSpan={2} className="cy-restock-total">庫存</th>
          </tr>
          <tr>{days.map((day, i) => [<th key={day + "s"} className={dayClass(day, i) + " cy-restock-sub"}>銷</th>,
            <th key={day + "r"} className={dayClass(day, i, true) + " cy-restock-sub"}>退</th>])}</tr>
        </thead>
        <tbody>{shown.map(row => {
          const byDay = new Map(row.days.map(d => [d.date, d]));
          return <tr key={row.itemCode} className={row.short ? "is-short" : undefined}>
            <th scope="row" className="cy-restock-item" title={`${row.itemCode} ${row.itemName}${row.unit ? `（${row.unit}）` : ""}`}>
              {canQueryItem && parseErpCode(row.itemCode)
                ? <button type="button" className="cy-restock-code" onClick={() => setOpened(row.itemCode)}>{row.itemCode}</button>
                : <strong>{row.itemCode}</strong>}
              <span>{row.itemName}{row.unit ? `（${row.unit}）` : ""}</span>
            </th>
            {days.map((day, i) => {
              const d = byDay.get(day);
              return [
                <td key={day + "s"} className={dayClass(day, i)} title={giftNote(d?.soldGift)}>{blankZero(Number(d?.sold ?? 0))}</td>,
                <td key={day + "r"} className={dayClass(day, i, true) + " cy-restock-returned"} title={giftNote(d?.returnedGift)}>{blankZero(Number(d?.returned ?? 0))}</td>,
              ];
            })}
            <td className="cy-restock-total" title={giftNote(row.soldGift)}>{blankZero(Number(row.sold))}</td>
            <td className="cy-restock-total cy-restock-returned" title={giftNote(row.returnedGift)}>{blankZero(Number(row.returned))}</td>
            <td className="cy-restock-total cy-restock-strong">{blankZero(row.net)}</td>
            <td className="cy-restock-total cy-restock-strong" title={row.stockValue === null ? row.stockNote || "未查到庫存" : row.short ? "庫存不足：庫存不到期間淨銷，或已無庫存" : undefined}>
              {row.stockValue === null ? <span className="cy-restock-none">—</span>
                : row.short ? <span className="cy-restock-short">{quantity(row.stockValue)}</span> : quantity(row.stockValue)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {shown.length === 0 && <p className="cy-erp-search-hint">沒有符合篩選條件的品號。</p>}
    {opened && <ErpItemDialog key={opened} itemCode={opened} onClose={() => setOpened(null)} />}
  </>;
}
/** A day's columns: alternate days shaded, weekends tinted, a line before each day. */
const dayClass = (day: string, index: number, second = false) =>
  ["cy-restock-day", second ? "is-second" : "is-first", index % 2 ? "is-alt" : "", weekday(day) % 6 === 0 ? "is-weekend" : ""].filter(Boolean).join(" ");

/**
 * 進貨輔助 (user 2026-10-20, a simple first version): pick a 單據日期 range (both ends), CY Web asks
 * the ERP Agent for every customer's 銷貨單 and 銷退單 in it, summed per 品號 and day (贈品 included,
 * user 2026-10-21), and each 品號's 庫存數量, shown in one table: filtered, sorted, 庫存不足 marked,
 * and a 品號 opens its ERP data in a window (with ERP 商品查詢).
 */
export function RestockAssistPage({ canQueryItem }: { canQueryItem: boolean }) {
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
          <p>起訖都要填，最多 {ERP_RESTOCK_MAX_DAYS} 天。會查這段期間所有客戶的銷貨單與銷退單，依品號、日期加總（含贈品），再查各品號目前庫存。品號可點開查看 ERP 資料。</p>
        </div>
        <div><button className="cy-op-button primary" type="submit" disabled={busy} aria-busy={submitting || busy || undefined}>查詢</button></div>
      </form>
    </div>
    {submitting && !mine ? <Loading /> : mine && <div className="cy-op-panel cy-erp-results" aria-live="polite">
      <ErpJobStatus result={mine} />
      {showsData(mine) && mine.dateFrom && mine.dateTo && <>
        {mine.truncated && <p className="cy-notice cy-notice-warning">品號超過 {mine.restock.length} 個，只列出前 {mine.restock.length} 個，請縮短日期範圍。</p>}
        <RestockTable key={mine.id} from={mine.dateFrom} to={mine.dateTo} items={mine.restock} canQueryItem={canQueryItem} />
      </>}
    </div>}
  </div>;
}

import { FormEvent, useState } from "react";
import { HistoryRangeError, resolveHistoryRange, taipeiToday } from "../../../shared/erp-query-history";
import { useCompactLayout } from "../../ui/foundation/useCompactLayout";
import { ErpQueryRows } from "./ErpQueryRows";
import { parseErpCode, parseErpNameKeyword } from "../../../shared/erp-name-search";
import { ERP_ITEM_FIELDS, type ErpField, type ErpQueryHistory } from "../../../shared/erp-item-query";
import { ErpJobStatus, Fields, showsData } from "./ErpJobStatus";
import type { CyWebModuleCode } from "../../../shared/modules";
import { useErpJob, type ErpJob } from "./useErpJob";
import { ErpCustomerQuery } from "./ErpCustomerQuery";
import { ErpReceivableQuery } from "./ErpReceivableQuery";
import "./erp-item-query.css";

/** The ERP 查詢 categories, each opened by its own grant (user 2026-10-17). */
const CATEGORIES = [
  { key: "ITEM", label: "商品", module: "ERP_ITEM_QUERY" },
  { key: "CUSTOMER", label: "客戶", module: "ERP_CUSTOMER_QUERY" },
  { key: "RECEIVABLE", label: "未收款", module: "ERP_RECEIVABLE_QUERY" },
] as const;
type Category = (typeof CATEGORIES)[number]["key"];

function ItemFields({ fields }: { fields: readonly ErpField[] }) {
  const map = new Map(fields.map(f => [f.name, f.value]));
  const main = [
    { name: "品號", value: map.get("品號") },
    { name: "品名", value: map.get("品名") },
    { name: "規格", value: map.get("規格") },
    { name: "庫存數量", value: map.get("庫存數量") == null ? "" :
      [map.get("庫存數量"), map.get("單位")].filter(Boolean).join(" ") },
    { name: "商品分類", value: [map.get("商品分類"), map.get("商品分類名稱")].filter(Boolean).join(" ") },
  ];
  const details = map.get("商品描述") || "";
  // Combine adjacent values for display without changing Agent/API payload fields.
  const dayCount = map.get("有效天數");
  const days = dayCount ? (/天$/.test(dayCount) ? dayCount : dayCount + "天") : "";
  const remaining = [
    { name: "條碼編號", value: map.get("條碼編號") ?? "" },
    { name: "批號管理及有效天數", value: [map.get("批號管理"), days].filter(Boolean).join(" / ") },
    { name: "主供應商", value: [map.get("主供應商"), map.get("主供應商名稱")].filter(Boolean).join("  ") },
    // 標準進價 only arrives for members with ERP 商品成本; absent fields are not shown at all.
    ...ERP_ITEM_FIELDS.filter(name => !new Set([
      "品號", "品名", "規格", "庫存數量", "單位", "商品分類", "商品分類名稱",
      "商品描述", "條碼編號", "批號管理", "有效天數", "主供應商", "主供應商名稱",
    ]).has(name) && map.has(name)).map(name => ({ name, value: map.get(name) ?? "" })),
  ];
  return <>
    <div className="cy-erp-item-lead">
      <div className="cy-erp-lead-left"><Fields fields={main.map(f => ({ ...f, value: f.value ?? "" }))} /></div>
      <div className="cy-erp-description"><div className="cy-erp-description-label">商品描述</div>
        <div className="cy-erp-description-text">{details || "—"}</div></div>
    </div>
    <Fields fields={remaining} />
  </>;
}
const rowsOf = (rows: readonly ErpField[][], columns: readonly string[]) =>
  rows.map(row => { const values = new Map(row.map(f => [f.name, f.value])); return columns.map(name => values.get(name) || ""); });
function HistoryTable({ history }: { history: ErpQueryHistory }) {
  return <ErpQueryRows label="歷史異動" columns={history.columns} rows={history.rows} summaryColumns={[0, 4, 5]} />;
}
const WAREHOUSE_COLUMNS = ["庫別", "庫別名稱", "儲位", "安全存量", "經濟批量", "上次盤點日", "最近入庫日", "最近出庫日"];
const BATCH_COLUMNS = ["批號", "庫存數量", "入庫日", "有效日期"];
const SEARCH_COLUMNS = ["品號", "品名", "規格", "單位", "庫存數量", "標準售價"];

/** 商品: 品號 or 品名 (the name list leads to a new 品號 job). */
function ErpItemQuery({ job }: { job: ErpJob }) {
  const [queryType, setQueryType] = useState<"ITEM_NO" | "ITEM_NAME">("ITEM_NO");
  const [itemNo, setItemNo] = useState("");
  const [keyword, setKeyword] = useState("");
  const [includeHistory, setIncludeHistory] = useState(false);
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const { result, busy, submitting, setError } = job;
  function selectedHistory() {
    return resolveHistoryRange({
      includeHistory, historyFrom: includeHistory ? historyFrom || null : null,
      historyTo: includeHistory ? historyTo || null : null,
    });
  }
  async function queryItem(value: string) {
    let history;
    try { history = selectedHistory(); }
    catch (err) { setError(err instanceof HistoryRangeError ? err.message : "歷史異動日期範圍無效"); return; }
    if (await job.start({ queryType: "ITEM_NO", itemNo: value, ...history })) { setItemNo(value); setQueryType("ITEM_NO"); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (queryType === "ITEM_NO" && includeHistory && Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="date"]')).some(input => input.validity.badInput)) {
      setError("請選擇完整且有效的歷史異動日期。"); return;
    }
    if (queryType === "ITEM_NAME") {
      const trimmed = parseErpNameKeyword(keyword);
      if (!trimmed) { setError("請輸入 1～40 字品名，不可含單引號或 % _ [ ]、控制字元。"); return; }
      await job.start({ queryType: "ITEM_NAME", keyword: trimmed });
      return;
    }
    const value = parseErpCode(itemNo);
    if (!value) { setError("品號只能輸入 1～40 個英文字母或數字。"); return; }
    await queryItem(value);
  }
  const mine = result && (result.queryType === "ITEM_NO" || result.queryType === "ITEM_NAME") ? result : null;
  return <>
    <div className="cy-op-panel cy-erp-query-box">
      <form className="cy-erp-form" onSubmit={event => void submit(event)} noValidate>
        <div className="cy-erp-mode-switch" role="group" aria-label="查詢方式">
          {(["ITEM_NO", "ITEM_NAME"] as const).map(type =>
            <button key={type} type="button" aria-pressed={queryType === type} disabled={busy}
              className={queryType === type ? "is-active" : ""} onClick={() => { setQueryType(type); setError(null); }}>
              {type === "ITEM_NO" ? "品號" : "品名"}</button>)}
        </div>
        <div className="cy-erp-query-row">
          <input id="erp-search-term" value={queryType === "ITEM_NO" ? itemNo : keyword} maxLength={40} autoComplete="off"
            aria-label={queryType === "ITEM_NO" ? "品號" : "品名"} placeholder={queryType === "ITEM_NO" ? "請輸入品號" : "請輸入品名"}
            onChange={e => queryType === "ITEM_NO" ? setItemNo(e.target.value) : setKeyword(e.target.value)}
            disabled={busy} required />
          <button className="cy-op-button primary" type="submit" disabled={busy}>
            {submitting ? "送出中…" : busy ? "查詢中…" : "查詢"}
          </button>
        </div>
        {queryType === "ITEM_NO" && <label className="cy-erp-history-check">
          <input type="checkbox" checked={includeHistory} disabled={busy}
            onChange={e => setIncludeHistory(e.target.checked)} /> 查歷史異動
        </label>}
        {queryType === "ITEM_NO" && includeHistory && <div className="cy-erp-history-options">
          <label>起日 <input type="date" max={taipeiToday()} value={historyFrom} disabled={busy}
            onChange={e => setHistoryFrom(e.target.value)} /></label>
          <label>迄日 <input type="date" max={taipeiToday()} value={historyTo} disabled={busy}
            onChange={e => setHistoryTo(e.target.value)} /></label>
          <p>起訖都未填：去年同月同日至今天；範圍最多三年。</p>
        </div>}
      </form>
    </div>
    {mine && <div className="cy-op-panel cy-erp-results" aria-live="polite">
      <ErpJobStatus result={mine} />
      {showsData(mine) && (mine.queryType === "ITEM_NAME"
        ? <><h3>符合的商品（{mine.total} 筆）</h3>
          {mine.truncated && <p className="cy-erp-error">結果已達 {mine.items.length} 筆，可能有更多資料，請輸入更完整的品名。</p>}
          <ErpQueryRows key={mine.id} label="品名搜尋結果" columns={SEARCH_COLUMNS} rows={rowsOf(mine.items, SEARCH_COLUMNS)}
            disabled={busy} onItemSelect={code => void queryItem(code)} />
          <p className="cy-erp-search-hint">點選品號，重新向 ERP 查詢該商品完整資料。</p>
        </>
        : <>
          <h3>品號資料</h3><ItemFields fields={mine.fields} />
          <h3>庫別資料</h3>
          {mine.warehouses.length === 0 ? <p>無庫別資料。</p>
            : <ErpQueryRows key={mine.id + "-warehouses"} label="庫別資料" columns={WAREHOUSE_COLUMNS} rows={rowsOf(mine.warehouses, WAREHOUSE_COLUMNS)} />}
          {mine.batchManaged !== null && <>
            <h3>批號庫存</h3>
            {!mine.batchManaged ? <p>非批號管理。</p>
              : mine.batches.length === 0 ? <p>目前沒有批號庫存。</p>
                : <ErpQueryRows label="批號庫存" columns={BATCH_COLUMNS} rows={rowsOf(mine.batches, BATCH_COLUMNS)} />}
          </>}
          {mine.includeHistory && <>
            <h3>歷史異動（{mine.historyFrom} ～ {mine.historyTo}）</h3>
            {mine.history
              ? <><p>共 {mine.history.total} 筆異動。</p>
                {mine.history.truncated && <p className="cy-erp-error">共 {mine.history.total} 筆，只顯示最新 2,000 筆，請縮小日期範圍。</p>}
                <HistoryTable history={mine.history} /></>
              : <p>此版本 CYERPAutoQuery 不支援歷史異動，請更新。</p>}
          </>}
        </>)}
    </div>}
  </>;
}

/**
 * ERP 查詢: one entry for 商品／客戶／未收款 (user 2026-10-17). Desktop switches categories with
 * tabs, mobile with a drop-down (user: easier to operate); both are presentations of the same
 * category state. One job owner for the page.
 */
export function ErpItemQueryPage({ allowedModules }: { allowedModules: ReadonlySet<CyWebModuleCode> }) {
  const categories = CATEGORIES.filter(category => allowedModules.has(category.module));
  const [selected, setSelected] = useState<Category>(categories[0]?.key ?? "ITEM");
  const category = categories.some(c => c.key === selected) ? selected : categories[0]?.key;
  const compact = useCompactLayout();
  const job = useErpJob();
  const choose = (next: Category) => { if (job.busy || next === category) return; job.clear(); job.setError(null); setSelected(next); };
  if (!category) return <section className="cy-op-panel">你目前沒有任何 ERP 查詢的模組權限。</section>;
  return <section className="cy-erp-page">
    {categories.length > 1 && (compact
      ? <select className="cy-erp-category" aria-label="查詢類別" value={category} disabled={job.busy}
        onChange={e => choose(e.target.value as Category)}>
        {categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
      : <div className="cy-erp-tabs" role="tablist" aria-label="查詢類別">
        {categories.map(c => <button key={c.key} type="button" role="tab" aria-selected={category === c.key}
          className={category === c.key ? "is-active" : ""} disabled={job.busy && category !== c.key}
          onClick={() => choose(c.key)}>{c.label}</button>)}
      </div>)}
    {category === "ITEM" && <ErpItemQuery job={job} />}
    {category === "CUSTOMER" && <ErpCustomerQuery job={job} />}
    {category === "RECEIVABLE" && <ErpReceivableQuery job={job} canSearchCustomers={allowedModules.has("ERP_CUSTOMER_QUERY")} />}
  </section>;
}

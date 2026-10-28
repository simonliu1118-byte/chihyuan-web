import { FormEvent, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { HistoryRangeError, resolveHistoryRange, taipeiToday } from "../../../shared/erp-query-history";
import { useCompactLayout } from "../../ui/foundation/useCompactLayout";
import { ErpQueryRows } from "./ErpQueryRows";
import { parseErpCode, parseErpNameKeyword } from "../../../shared/erp-name-search";
import { ERP_QUERY_TYPE_LABELS, type ErpQueryType } from "../../../shared/erp-item-query";
import { ErpJobStatus, showsData } from "./ErpJobStatus";
import { ErpItemResult, rowsOf } from "./ErpItemResult";
import type { CyWebModuleCode } from "../../../shared/modules";
import { ErpPageVisibleContext, runningStatus, useErpJob, type ErpJob } from "./useErpJob";
import { RestockAssist } from "./RestockAssist";
import { ErpQueueSidePanel } from "./ErpQueuePanel";
import { ErpCustomerQuery } from "./ErpCustomerQuery";
import { ErpReceivableQuery } from "./ErpReceivableQuery";
import { ErpSupplierQuery } from "./ErpSupplierQuery";
import "./erp-item-query.css";

/**
 * The ERP 查詢 categories, each opened by its own grant (user 2026-10-17); 進貨輔助 joined them in
 * V0.9.41 (user 2026-10-27: between 客戶 and 未收款). Each keeps its own query and result.
 */
const CATEGORIES = [
  { key: "ITEM", label: ERP_QUERY_TYPE_LABELS.ITEM_NO, module: "ERP_ITEM_QUERY", types: ["ITEM_NO", "ITEM_NAME"] },
  { key: "CUSTOMER", label: ERP_QUERY_TYPE_LABELS.CUSTOMER_NO, module: "ERP_CUSTOMER_QUERY", types: ["CUSTOMER_NO", "CUSTOMER_NAME", "SALES"] },
  { key: "SUPPLIER", label: ERP_QUERY_TYPE_LABELS.SUPPLIER_NO, module: "ERP_SUPPLIER_QUERY", types: ["SUPPLIER_NO", "SUPPLIER_NAME", "PURCHASES"] },
  { key: "RESTOCK", label: ERP_QUERY_TYPE_LABELS.RESTOCK, module: "ERP_RESTOCK_ASSIST", types: ["RESTOCK"] },
  // Its 客戶 name search (CUSTOMER_NAME) is shown again under 客戶 only.
  { key: "RECEIVABLE", label: ERP_QUERY_TYPE_LABELS.RECEIVABLE, module: "ERP_RECEIVABLE_QUERY", types: ["RECEIVABLE"] },
] as const satisfies readonly { key: string; label: string; module: CyWebModuleCode; types: readonly ErpQueryType[] }[];
type Category = (typeof CATEGORIES)[number]["key"];

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
    if (!value) { setError("品號只能輸入 1～40 個英文字母、數字或「-」。"); return; }
    await queryItem(value);
  }
  const mine = result && (result.queryType === "ITEM_NO" || result.queryType === "ITEM_NAME") ? result : null;
  return <>
    <div className="cy-op-panel cy-erp-query-box">
      <form role="search" className="cy-erp-form" onSubmit={event => void submit(event)} noValidate>
        <div className="cy-segmented" role="group" aria-label="查詢方式">
          {(["ITEM_NO", "ITEM_NAME"] as const).map(type =>
            <button key={type} type="button" aria-pressed={queryType === type} disabled={busy}  onClick={() => { setQueryType(type); setError(null); }}>
              {type === "ITEM_NO" ? "品號" : "品名"}</button>)}
        </div>
        <div className="cy-erp-query-row">
          <input className="cy-op-input" id="erp-search-term" value={queryType === "ITEM_NO" ? itemNo : keyword} maxLength={40} autoComplete="off"
            aria-label={queryType === "ITEM_NO" ? "品號" : "品名"} placeholder={queryType === "ITEM_NO" ? "請輸入品號" : "請輸入品名"}
            onChange={e => queryType === "ITEM_NO" ? setItemNo(e.target.value) : setKeyword(e.target.value)}
            disabled={busy} required />
          <button className="cy-op-button primary" type="submit" disabled={busy} aria-busy={submitting || busy || undefined}>
            查詢
          </button>
        </div>
        {queryType === "ITEM_NO" && <label className="cy-erp-history-check">
          <input type="checkbox" checked={includeHistory} disabled={busy}
            onChange={e => setIncludeHistory(e.target.checked)} /> 查歷史異動
        </label>}
        {queryType === "ITEM_NO" && includeHistory && <div className="cy-erp-history-options">
          <label>起日 <input className="cy-op-input" type="date" max={taipeiToday()} value={historyFrom} disabled={busy}
            onChange={e => setHistoryFrom(e.target.value)} /></label>
          <label>迄日 <input className="cy-op-input" type="date" max={taipeiToday()} value={historyTo} disabled={busy}
            onChange={e => setHistoryTo(e.target.value)} /></label>
          <p>起訖都未填：去年同月同日至今天；範圍最多三年。</p>
        </div>}
      </form>
    </div>
    {mine && <div className="cy-op-panel cy-erp-results" aria-live="polite">
      <ErpJobStatus result={mine} />
      {showsData(mine) && (mine.queryType === "ITEM_NAME"
        ? <><h3>符合的商品（{mine.total} 筆）</h3>
          {mine.truncated && <p className="cy-notice cy-notice-warning">結果已達 {mine.items.length} 筆，可能有更多資料，請輸入更完整的品名。</p>}
          <ErpQueryRows key={mine.id} label="品名搜尋結果" columns={SEARCH_COLUMNS} rows={rowsOf(mine.items, SEARCH_COLUMNS)}
            disabled={busy} onItemSelect={code => void queryItem(code)} />
        </>
        : <ErpItemResult result={mine} />)}
    </div>}
  </>;
}

/** Opens a category of ERP 查詢 (the 查看 of a finished query's notice). */
export const ERP_OPEN_CATEGORY_EVENT = "cy-erp-open-category";
export const ERP_QUERY_ROUTE = "erp-item-query";

/** One category's job, owned below the page so it knows whether its category is on screen. */
function CategoryJob({ category, onBusy, children }: {
  category: (typeof CATEGORIES)[number]; onBusy: (key: Category, busy: boolean) => void; children: (job: ErpJob) => ReactNode;
}) {
  const job = useErpJob({ route: ERP_QUERY_ROUTE, key: category.key, label: category.label, types: category.types });
  const running = !!job.result && runningStatus(job.result.status);
  useEffect(() => { onBusy(category.key, running); }, [running]); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{children(job)}</>;
}

/**
 * ERP 查詢: one entry for 商品／客戶／供應商／進貨輔助／未收款 (user 2026-10-17, 2026-10-27);
 * the Agent's queue opens in a side panel at the right that leaves the page usable (user 2026-10-28).
 * Desktop switches categories with tabs, mobile with a drop-down (user: easier to operate). Every
 * category stays mounted with its own query, form and result; a query keeps running while another
 * category or module is open.
 */
export function ErpItemQueryPage({ allowedModules }: { allowedModules: ReadonlySet<CyWebModuleCode> }) {
  const categories = CATEGORIES.filter(category => allowedModules.has(category.module));
  const [selected, setSelected] = useState<Category>(categories[0]?.key ?? "ITEM");
  const category = categories.some(c => c.key === selected) ? selected : categories[0]?.key;
  const [queueOpen, setQueueOpen] = useState(false);
  const [running, setRunning] = useState<ReadonlySet<Category>>(new Set());
  const onBusy = useCallback((key: Category, busy: boolean) => setRunning(current => {
    if (current.has(key) === busy) return current;
    const next = new Set(current); if (busy) next.add(key); else next.delete(key); return next;
  }), []);
  const compact = useCompactLayout();
  const pageVisible = useContext(ErpPageVisibleContext);
  useEffect(() => {
    const open = (event: Event) => setSelected((event as CustomEvent<string>).detail as Category);
    window.addEventListener(ERP_OPEN_CATEGORY_EVENT, open);
    return () => window.removeEventListener(ERP_OPEN_CATEGORY_EVENT, open);
  }, []);
  if (!category) return <section className="cy-op-panel">你目前沒有任何 ERP 查詢的模組權限。</section>;
  const label = (c: { key: Category; label: string }) => running.has(c.key) ? `${c.label}（查詢中）` : c.label;
  const panel = (key: Category, body: ReactNode) =>
    <ErpPageVisibleContext.Provider key={key} value={pageVisible && category === key}>
      <div className="cy-erp-category-panel" hidden={category !== key}>{body}</div>
    </ErpPageVisibleContext.Provider>;
  return <section className="cy-erp-page">
    <div className="cy-erp-tabbar">
      {compact
        ? <select className="cy-op-input cy-erp-category" aria-label="查詢類別" value={category}
          onChange={e => setSelected(e.target.value as Category)}>
          {categories.map(c => <option key={c.key} value={c.key}>{label(c)}</option>)}
        </select>
        : <div className="cy-op-tabs" role="tablist" aria-label="查詢類別">
          {categories.map(c => <button key={c.key} type="button" role="tab" aria-selected={category === c.key}
            className={category === c.key ? "active" : undefined}
            onClick={() => setSelected(c.key)}>{c.label}{running.has(c.key) && <span className="cy-erp-tab-running" aria-label="查詢中" />}</button>)}
        </div>}
      <button type="button" className="cy-op-button cy-erp-queue-button" aria-expanded={queueOpen} onClick={() => setQueueOpen(open => !open)}>排程佇列</button>
    </div>
    {categories.map(c => panel(c.key, <CategoryJob category={c} onBusy={onBusy}>{job =>
      c.key === "ITEM" ? <ErpItemQuery job={job} />
      : c.key === "CUSTOMER" ? <ErpCustomerQuery job={job} />
      : c.key === "SUPPLIER" ? <ErpSupplierQuery job={job} />
      : c.key === "RESTOCK" ? <RestockAssist job={job} canQueryItem={allowedModules.has("ERP_ITEM_QUERY")} canOrdering={allowedModules.has("ORDERING")} />
      : <ErpReceivableQuery job={job} canSearchCustomers={allowedModules.has("ERP_CUSTOMER_QUERY")} />}</CategoryJob>))}
    {queueOpen && pageVisible && <ErpQueueSidePanel onClose={() => setQueueOpen(false)} />}
  </section>;
}

import { ERP_ITEM_FIELDS, type ErpField, type ErpQueryHistory, type ErpQueryResult } from "../../../shared/erp-item-query";
import { erpMoney } from "../../../shared/erp-sales-links";
import { ErpQueryRows } from "./ErpQueryRows";
import { Fields } from "./ErpJobStatus";

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
    ]).has(name) && map.has(name)).map(name => ({ name, value: shown(name, map.get(name) ?? "") })),
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
/** Item money fields shown with $ (user 2026-10-17); the API values stay ERP strings. */
const MONEY_FIELDS = new Set(["標準進價", "標準售價", "售價定價一", "售價定價二", "售價定價三", "售價定價四", "售價定價五", "售價定價六"]);
const shown = (name: string, value: string) => MONEY_FIELDS.has(name) ? erpMoney(value) : value;
export const rowsOf = (rows: readonly ErpField[][], columns: readonly string[]) =>
  rows.map(row => { const values = new Map(row.map(f => [f.name, f.value])); return columns.map(name => shown(name, values.get(name) || "")); });
function HistoryTable({ history }: { history: ErpQueryHistory }) {
  return <ErpQueryRows label="歷史異動" columns={history.columns} rows={history.rows} summaryColumns={[0, 4, 5]} />;
}
const WAREHOUSE_COLUMNS = ["庫別", "庫別名稱", "儲位", "安全存量", "經濟批量", "上次盤點日", "最近入庫日", "最近出庫日"];
const BATCH_COLUMNS = ["批號", "庫存數量", "入庫日", "有效日期"];
/**
 * One 品號's data as ERP 查詢 shows it: 品號資料, 庫別, 批號 and, when asked, 歷史異動. Shared by the
 * ERP 查詢 page and the 品號 window opened from 進貨輔助 (user 2026-10-21).
 */
export function ErpItemResult({ result: mine }: { result: ErpQueryResult }) {
  return <>
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
          {mine.history.truncated && <p className="cy-notice cy-notice-warning">共 {mine.history.total} 筆，只顯示最新 2,000 筆，請縮小日期範圍。</p>}
          <HistoryTable history={mine.history} /></>
        : <p>此版本 CYERPAutoQuery 不支援歷史異動，請更新。</p>}
    </>}
  </>;
}

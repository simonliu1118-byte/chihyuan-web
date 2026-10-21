import { formatDate } from "../../ui/foundation/format";
import type { ErpField, ErpQueryResult, ErpQueryStatus, ErpQueryType } from "../../../shared/erp-item-query";

const statusLabel: Record<ErpQueryStatus, string> = {
  QUEUED: "排隊中", RUNNING: "查詢中", DONE: "查詢完成",
  NOT_FOUND: "查無資料", FAILED: "查詢失敗", EXPIRED: "等待逾時",
};
const subject: Record<ErpQueryType, string> = {
  ITEM_NO: "品號", ITEM_NAME: "品名關鍵字", CUSTOMER_NO: "客戶代號", CUSTOMER_NAME: "客戶名稱關鍵字",
  SUPPLIER_NO: "廠商代號", SUPPLIER_NAME: "廠商名稱關鍵字", PURCHASES: "廠商代號",
  SALES: "客戶代號", RECEIVABLE: "範圍", ORDER: "單號", RESTOCK: "單據日期",
};
const notFound: Record<ErpQueryType, string> = {
  ITEM_NO: "找不到此品號。", ITEM_NAME: "沒有符合的品名。", CUSTOMER_NO: "找不到此客戶代號。",
  CUSTOMER_NAME: "沒有符合的客戶簡稱或全名。", SUPPLIER_NO: "找不到此廠商代號。", SUPPLIER_NAME: "沒有符合的廠商簡稱或全名。", PURCHASES: "此期間沒有進貨單或退貨單。",
  SALES: "此期間沒有銷貨單或銷退單。", RECEIVABLE: "沒有未收款。", ORDER: "ERP 查無此單號。",
  RESTOCK: "此期間沒有銷貨單或銷退單。",
};
function describe(result: ErpQueryResult): string {
  if (result.queryType === "RECEIVABLE")
    return result.scope === "ALL" ? "全部客戶" : `${result.scope === "CUSTOMER" ? "客戶" : "業務員"} ${result.code}`;
  if (result.queryType === "RESTOCK")
    return result.dateFrom && result.dateTo ? `${formatDate(result.dateFrom)} ～ ${formatDate(result.dateTo)}` : "";
  if (result.queryType === "SALES" || result.queryType === "PURCHASES")
    return result.dateFrom && result.dateTo ? `${result.code}（${formatDate(result.dateFrom)} ～ ${formatDate(result.dateTo)}）` : result.code ?? "";
  return result.itemNo ?? result.keyword ?? result.code ?? "";
}

/** Status, timing and the outcomes without data, the same for every category. */
/** 進貨輔助 while RUNNING (user 2026-10-20: at least 已查／總數, to see how far it is). */
function restockProgress(result: ErpQueryResult): string {
  const p = result.progress;
  if (p?.stage === "STOCK")
    return `已查庫存 ${p.done} / ${p.total} 個品號${p.done < p.total ? "，分批查詢中" : "，整理結果中"}。`;
  if (p?.stage === "REPORT") return `正在產生銷貨、銷退報表（已完成 ${p.done} / ${p.total} 張），之後分批查詢各品號庫存。`;
  return "正在產生銷貨、銷退報表，再分批查詢各品號庫存，可能需要數分鐘。";
}

export function ErpJobStatus({ result }: { result: ErpQueryResult }) {
  return <>
    <h2>{statusLabel[result.status]}</h2>
    <p>{subject[result.queryType]}：<strong>{describe(result)}</strong>{result.elapsedMs !== null ? `　耗時 ${(result.elapsedMs / 1000).toFixed(1)} 秒` : ""}</p>
    {result.status === "QUEUED" && <p className="cy-erp-waiting"><span className="cy-loading-spinner" aria-hidden="true" />已加入查詢佇列，等待公司電腦處理。</p>}
    {result.status === "RUNNING" && <p className="cy-erp-waiting"><span className="cy-loading-spinner" aria-hidden="true" />{result.queryType === "RESTOCK"
      ? restockProgress(result)
      : ["SALES", "PURCHASES", "RECEIVABLE", "ORDER"].includes(result.queryType)
      ? "正在產生 ERP 報表並轉出，可能需要一到數分鐘。" : "正在查詢 ERP。"}</p>}
    {result.errorMessage && <p className="cy-notice cy-notice-danger">{result.errorMessage}</p>}
    {result.status === "EXPIRED" && <p>排隊超過兩分鐘，請重新送出查詢。</p>}
    {result.status === "NOT_FOUND" && <p>{notFound[result.queryType]}</p>}
    {result.status === "DONE" && result.resultCleared && <p>結果已清除，請重新查詢。</p>}
  </>;
}
export const showsData = (result: ErpQueryResult) => result.status === "DONE" && !result.resultCleared;

export function Fields({ fields }: { fields: readonly ErpField[] }) {
  return <dl className="cy-erp-fields">{fields.map(f =>
    <div key={f.name}><dt>{f.name}</dt><dd>{f.value || "—"}</dd></div>
  )}</dl>;
}

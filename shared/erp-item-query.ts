/** Narrow, read-only response contract shared by CY Web and the desktop bridge. */
export const ERP_ITEM_FIELDS = [
  "品號", "品名", "規格", "單位", "庫存數量", "商品分類", "商品分類名稱",
  "商品描述", "條碼編號", "批號管理", "有效天數", "主供應商",
  "主供應商名稱", "標準進價", "標準售價", "售價定價一", "售價定價二",
  "售價定價三", "售價定價四", "售價定價五", "售價定價六",
] as const;
export const ERP_WAREHOUSE_FIELDS = [
  "庫別", "庫別名稱", "儲位", "安全存量", "經濟批量",
  "上次盤點日", "最近入庫日", "最近出庫日",
] as const;
export const ERP_BATCH_FIELDS = ["批號", "庫存數量", "入庫日", "有效日期"] as const;
export const ERP_HISTORY_COLUMNS = [
  "日期", "單別-單號-序號", "庫別", "庫別名稱", "入出別", "異動數量", "備註",
] as const;
export const ERP_SEARCH_FIELDS = ["品號", "品名", "規格", "單位", "庫存數量", "標準售價"] as const;
/** Item fields only returned to members with ERP_ITEM_COST (user 2026-10-17: 標準進價). */
export const ERP_ITEM_COST_FIELDS = ["標準進價"] as const;
/** COPI01 customer fields, source CYapps apps/CYERPAutoQuery/CustomerQuery.cs CustomerFieldCatalog. */
export const ERP_CUSTOMER_FIELDS = [
  "客戶代號", "客戶簡稱", "客戶全名", "負責人", "連絡人", "TEL", "FAX", "統一編號", "行動電話",
  "部門別", "業務人員", "登記地址", "送貨地址", "付款條件", "發票聯數", "課稅別", "通路別", "型態別", "客戶描述",
] as const;
export const ERP_CUSTOMER_SEARCH_FIELDS = ["客戶代號", "客戶簡稱", "客戶全名", "TEL", "統一編號", "業務人員"] as const;
/**
 * ITEM_NO／ITEM_NAME: ERP 商品查詢. CUSTOMER_NO／CUSTOMER_NAME／SALES (COPR15+COPR16): ERP 客戶查詢.
 * RECEIVABLE (ACRR18): ERP 未收款查詢. ORDER: one 銷貨單／銷退單 by number (a 未收款 憑證), opened by
 * either grant. One queue, one Agent, one job per member.
 */
export type ErpQueryType = "ITEM_NO" | "ITEM_NAME" | "CUSTOMER_NO" | "CUSTOMER_NAME" | "SALES" | "RECEIVABLE" | "ORDER";
export const ERP_QUERY_TYPES: readonly ErpQueryType[] = ["ITEM_NO", "ITEM_NAME", "CUSTOMER_NO", "CUSTOMER_NAME", "SALES", "RECEIVABLE", "ORDER"];
export type ErpReceivableScope = "CUSTOMER" | "SALESPERSON" | "ALL";
/** One line of a 銷貨單／銷退單; amounts and quantities are ERP display strings. */
export interface ErpSalesLine {
  seq: number; itemCode: string; itemName: string; specification: string; warehouse: string;
  quantity: string; unit: string; unitPrice: string; amount: string;
  giftType: string; giftQuantity: string; batch: string; note: string;
  /** 銷退 line's 原銷貨單 「單號-序號」 as ERP gives it, or "". */
  sourceOrder: string;
}
export interface ErpSalesOrder {
  kind: "銷貨" | "銷退"; orderNo: string; date: string; customerCode: string; customerName: string;
  salesperson: string; department: string; paymentTerm: string; taxType: string; invoiceType: string;
  totalQuantity: string; amount: string; tax: string; total: string; note: string; reason: string;
  lines: ErpSalesLine[];
}
export interface ErpReceivableVoucher { voucherNo: string; date: string; amount: string; tax: string; }
export interface ErpReceivableBill {
  customerCode: string; customerName: string; date: string; billNo: string;
  salespersonCode: string; salespersonName: string; invoiceNo: string; currency: string;
  receivable: string; receivableTax: string; unpaid: string; vouchers: ErpReceivableVoucher[];
}
export interface ErpNameSearchRow extends Array<ErpField> {}
export type ErpQueryStatus = "QUEUED" | "RUNNING" | "DONE" | "NOT_FOUND" | "FAILED" | "EXPIRED";
export type ErpQueryOutcome = "FOUND" | "NOT_FOUND" | "FAILED";
export type ErpQueryErrorCode =
  | "ERP_NOT_OPEN" | "ERP_BUSY" | "ERP_STATE" | "EXPORT_FAILED"
  | "CANCELLED" | "INTERNAL" | "AGENT_TIMEOUT";
export interface ErpField { name: string; value: string; }
export interface ErpQueryHistory {
  from: string;
  to: string;
  columns: string[];
  rows: string[][];
  total: number;
  truncated: boolean;
}
export interface ErpHistoryRequest {
  includeHistory: boolean;
  historyFrom: string | null;
  historyTo: string | null;
}
export interface ErpQueryResult extends ErpHistoryRequest {
  id: string;
  queryType: ErpQueryType;
  itemNo: string | null;
  keyword: string | null;
  /** CUSTOMER_NO／SALES: the customer; RECEIVABLE: the customer or 業務員 code (null for ALL); ORDER: the number. */
  code: string | null;
  scope: ErpReceivableScope | null;
  /** SALES 單據日期 range (YYYY-MM-DD). */
  dateFrom: string | null;
  dateTo: string | null;
  orders: ErpSalesOrder[];
  bills: ErpReceivableBill[];
  items: ErpField[][];
  total: number;
  truncated: boolean;
  status: ErpQueryStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  elapsedMs: number | null;
  fields: ErpField[];
  warehouses: ErpField[][];
  batchManaged: boolean | null; // null = older Agent, no batch metadata
  batches: ErpField[][];
  history: ErpQueryHistory | null; // null + includeHistory = old Agent
  errorCode: ErpQueryErrorCode | null;
  errorMessage: string | null;
  resultCleared: boolean;
}
export interface ErpAgentStatus {
  online: boolean;
  lastSeenAt: string | null;
  agentVersion: string | null;
  erpState: string | null;
}

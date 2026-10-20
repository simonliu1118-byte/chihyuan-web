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
/** COPI01 customer fields, source CYapps apps/CYERPAutoQuery/PartyQuery.cs PartyFieldCatalog.Customer. */
export const ERP_CUSTOMER_FIELDS = [
  "客戶代號", "客戶簡稱", "客戶全名", "負責人", "連絡人", "TEL", "FAX", "統一編號", "行動電話",
  "部門別", "業務人員", "登記地址", "送貨地址", "付款條件", "發票聯數", "課稅別", "通路別", "型態別", "客戶描述",
] as const;
export const ERP_CUSTOMER_SEARCH_FIELDS = ["客戶代號", "客戶簡稱", "客戶全名", "TEL", "統一編號", "業務人員"] as const;
/** PURI01 supplier fields (user 2026-10-17), source CYapps PartyQuery.cs PartyFieldCatalog.Supplier. */
export const ERP_SUPPLIER_FIELDS = [
  "廠商代號", "廠商簡稱", "廠商全名", "版次", "統一編號", "TEL", "FAX", "E-MAIL", "負責人", "聯絡人", "行動電話",
  "採購人員", "備註", "廠商分類", "付款方式", "付款條件", "匯款銀行", "匯款帳號", "發票聯數", "課稅別", "結帳日期",
  "聯絡地址", "帳單地址", "廠商描述",
] as const;
export const ERP_SUPPLIER_SEARCH_FIELDS = ["廠商代號", "廠商簡稱", "廠商全名", "TEL", "FAX", "統一編號"] as const;
/**
 * ITEM_NO／ITEM_NAME: ERP 商品查詢. CUSTOMER_NO／CUSTOMER_NAME／SALES (COPR15+COPR16): ERP 客戶查詢.
 * SUPPLIER_NO／SUPPLIER_NAME (PURI01)／PURCHASES (PURR18+PURR22): ERP 供應商查詢. RECEIVABLE (ACRR18): ERP 未收款查詢. ORDER: one 銷貨單／銷退單 by number (a 未收款 憑證), opened by
 * either grant. RESTOCK (COPR15+COPR16 for every customer, then INVI02 per 品號): 進貨輔助.
 * One queue, one Agent, one job per member.
 */
export type ErpQueryType = "ITEM_NO" | "ITEM_NAME" | "CUSTOMER_NO" | "CUSTOMER_NAME" | "SUPPLIER_NO" | "SUPPLIER_NAME"
  | "PURCHASES" | "SALES" | "RECEIVABLE" | "ORDER" | "RESTOCK";
export const ERP_QUERY_TYPES: readonly ErpQueryType[] = [
  "ITEM_NO", "ITEM_NAME", "CUSTOMER_NO", "CUSTOMER_NAME", "SUPPLIER_NO", "SUPPLIER_NAME", "PURCHASES", "SALES", "RECEIVABLE", "ORDER", "RESTOCK",
];
/** 進貨輔助 range limit: at most 31 days, both ends included (user 2026-10-20: a simple first version). */
export const ERP_RESTOCK_MAX_DAYS = 31;
/** 進貨輔助 rows at most (one per 品號). */
export const ERP_RESTOCK_MAX_ITEMS = 500;

/** Shared localized ERP query names; the UI and audit timeline use the same names. */
export const ERP_QUERY_TYPE_LABELS: Readonly<Record<ErpQueryType, string>> = {
  ITEM_NO: "商品", ITEM_NAME: "商品",
  CUSTOMER_NO: "客戶", CUSTOMER_NAME: "客戶",
  SUPPLIER_NO: "供應商", SUPPLIER_NAME: "供應商",
  PURCHASES: "進貨", SALES: "銷貨", RECEIVABLE: "未收款", ORDER: "單據", RESTOCK: "進貨輔助",
};
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
/** One line of a 進貨單／退貨單; amounts and quantities are ERP display strings (原幣). */
export interface ErpPurchaseLine {
  seq: number; itemCode: string; itemName: string; specification: string; acceptDate: string; warehouse: string;
  quantity: string; acceptedQuantity: string; returnedQuantity: string; unit: string; unitPrice: string;
  amount: string; tax: string; batch: string; purchaseOrderNo: string; note: string;
  /** 退貨 line's 原進貨單 「單號-序號」 as ERP gives it, or "". */
  sourceOrder: string;
}
export interface ErpPurchaseOrder {
  kind: "進貨" | "退貨"; orderNo: string; date: string; supplierCode: string; supplierName: string;
  supplierOrderNo: string; invoiceNo: string; invoiceType: string; taxType: string; currency: string;
  totalQuantity: string; amount: string; deduction: string; tax: string; total: string; settled: string;
  lines: ErpPurchaseLine[];
}
/** One 品號's 銷貨／銷退 on one day of a RESTOCK range; quantities are ERP display strings. */
export interface ErpRestockDay { date: string; sold: string; returned: string; }
/**
 * One 品號 of a RESTOCK result: the days it moved, the range's subtotals and its INVI02 庫存數量
 * (null when not read; stockNote says why).
 */
export interface ErpRestockItem {
  itemCode: string; itemName: string; unit: string; days: ErpRestockDay[];
  sold: string; returned: string; stock: string | null; stockNote: string;
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
  /** CUSTOMER_NO／SALES: the customer; SUPPLIER_NO／PURCHASES: the supplier; RECEIVABLE: the customer or 業務員 code (null for ALL); ORDER: the number. */
  code: string | null;
  scope: ErpReceivableScope | null;
  /** SALES／PURCHASES／RESTOCK 單據日期 range (YYYY-MM-DD). */
  dateFrom: string | null;
  dateTo: string | null;
  orders: ErpSalesOrder[];
  purchases: ErpPurchaseOrder[];
  bills: ErpReceivableBill[];
  /** RESTOCK: one row per 品號, in 品號 order. */
  restock: ErpRestockItem[];
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

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
  itemNo: string;
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

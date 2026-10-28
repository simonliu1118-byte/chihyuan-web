import {
  ERP_ITEM_FIELDS, ERP_WAREHOUSE_FIELDS, ERP_BATCH_FIELDS, ERP_HISTORY_COLUMNS, ERP_SEARCH_FIELDS,
  ERP_ITEM_COST_FIELDS, ERP_CUSTOMER_FIELDS, ERP_CUSTOMER_SEARCH_FIELDS, ERP_SUPPLIER_FIELDS, ERP_SUPPLIER_SEARCH_FIELDS, ERP_QUERY_TYPES,
  ERP_RESTOCK_MAX_DAYS, ERP_RESTOCK_MAX_ITEMS, type ErpRestockItem, type ErpRestockDay,
  type ErpQueryType, type ErpQueryHistory, type ErpField, type ErpQueryErrorCode, type ErpQueryResult,
  type ErpReceivableScope, type ErpSalesOrder, type ErpSalesLine, type ErpPurchaseOrder, type ErpPurchaseLine, type ErpReceivableBill, type ErpReceivableVoucher,
  type ErpAgentControl, type ErpControlRequest, type ErpControlResult,
} from "../../shared/erp-item-query";
import { AuditService } from "../audit/audit-service";
import {validateSyncResult,validateWriteResult,syncStatements,writeResultStatements} from "./stocktake-erp";
import type {StocktakeWriteRow} from "../../shared/stocktake";
import { salesHistoryStatements } from "./erp-sales-history";
import { HistoryRangeError, daysInclusive, resolveDateRange, resolveHistoryRange, resolveRestockRange } from "../../shared/erp-query-history";
import { erpNameContains, parseErpCode, parseErpNameKeyword, parseErpOrderNo } from "../../shared/erp-name-search";
import { checkModuleAccess, resolveAppMember, type AppMemberRecord } from "../auth/app-access";
import { requireIdentity } from "../auth/guard";
import type { IdentityPrincipal } from "../identity/contract";
import { MODULE_REQUIREMENTS, moduleLabel, type CyWebModuleCode } from "../../shared/modules";
import { identityClient, type IdentityRuntimeEnv } from "./auth-routes";
import { errorResponse } from "./errors";
import { readJsonObject, RequestInputError } from "./request";
import { failure, success } from "./response";

export interface ErpBridgeEnv extends IdentityRuntimeEnv {}

type JobRow = {
  id: string; owner_member_id: number; item_no: string; query_type: ErpQueryType; keyword: string | null; status: ErpQueryResult["status"];
  created_at: string; expires_at: string; started_at: string | null;
  completed_at: string | null; elapsed_ms: number | null;
  fields_json: string | null; warehouses_json: string | null;
  include_history: number; history_from: string | null; history_to: string | null;
  batch_managed: number | null; batches_json: string | null; history_json: string | null; items_json: string | null;
  target_code: string | null; receivable_scope: ErpReceivableScope | null; include_cost: number; result_json: string | null;
  error_code: ErpQueryErrorCode | null; error_message: string | null;
  progress_stage: "REPORT" | "STOCK" | null; progress_done: number | null; progress_total: number | null;
  not_before: string | null;
};
/**
 * The Module Access grants that open each query type, any one is enough (user 2026-10-17: by data
 * sensitivity). ORDER opens a 未收款 憑證, so either the customer or the receivable grant opens it.
 */
const MODULES_FOR_TYPE: Record<ErpQueryType, readonly CyWebModuleCode[]> = {
  ITEM_NO: ["ERP_ITEM_QUERY"], ITEM_NAME: ["ERP_ITEM_QUERY"],
  CUSTOMER_NO: ["ERP_CUSTOMER_QUERY"], CUSTOMER_NAME: ["ERP_CUSTOMER_QUERY"], SALES: ["ERP_CUSTOMER_QUERY"],
  SUPPLIER_NO: ["ERP_SUPPLIER_QUERY"], SUPPLIER_NAME: ["ERP_SUPPLIER_QUERY"], PURCHASES: ["ERP_SUPPLIER_QUERY"],
  RECEIVABLE: ["ERP_RECEIVABLE_QUERY"], ORDER: ["ERP_CUSTOMER_QUERY", "ERP_RECEIVABLE_QUERY"],
  RESTOCK: ["ERP_RESTOCK_ASSIST"],
  STOCKTAKE_SYNC: ["STORE_STOCKTAKE"], STOCKTAKE_WRITE: ["STORE_STOCKTAKE"],
};
/** The grants that may see the Agent's status (every page that sends ERP jobs). */
const ERP_QUERY_MODULES: readonly CyWebModuleCode[] = ["ERP_ITEM_QUERY", "ERP_CUSTOMER_QUERY", "ERP_RECEIVABLE_QUERY", "ERP_SUPPLIER_QUERY", "ERP_RESTOCK_ASSIST", "STORE_STOCKTAKE"];
/**
 * Report types run whole ERP reports (COPR15+COPR16, PURR18+PURR22, ACRR18) and may take minutes;
 * RESTOCK also reads every 品號's 庫存 afterwards.
 */
const REPORT_TYPES = new Set<ErpQueryType>(["SALES", "PURCHASES", "RECEIVABLE", "ORDER", "RESTOCK", "STOCKTAKE_SYNC", "STOCKTAKE_WRITE"]);
/** Types with a 單據日期 range in history_from／history_to. */
const DATED_TYPES = new Set<ErpQueryType>(["SALES", "PURCHASES", "RESTOCK"]);
const NAME_TYPES = new Set<ErpQueryType>(["ITEM_NAME", "CUSTOMER_NAME", "SUPPLIER_NAME"]);
/** Queries one member may have queued or running at once (user 2026-10-27: up to three). */
const MAX_ACTIVE_PER_MEMBER = 3;
/**
 * A queued query waits while the Agent is connected (it may be behind other members' 進貨輔助);
 * it expires 2 minutes after it was made once the Agent is gone (no running query, no claim in the
 * last minute), and in any case after an hour (expires_at).
 */
const QUEUE_WAIT_MAX_MS = 3600000;
/**
 * The Agent runs one query at a time, in the order they were sent (user 2026-10-27); the claim and
 * the queue the members see use the same order.
 */
const QUEUE_ORDER = "q.created_at, q.id";
/** Seconds a query type takes when there is no recent query of it to go by (the queue's estimate). */
const DEFAULT_SECONDS: Record<ErpQueryType, number> = {
  ITEM_NO: 40, ITEM_NAME: 30, CUSTOMER_NO: 30, CUSTOMER_NAME: 30, SUPPLIER_NO: 30, SUPPLIER_NAME: 30,
  PURCHASES: 120, SALES: 120, RECEIVABLE: 90, ORDER: 60, RESTOCK: 400,
  STOCKTAKE_SYNC: 600, STOCKTAKE_WRITE: 900,
};
const ITEM_FIELD_SET = new Set<string>(ERP_ITEM_FIELDS);
const COST_FIELD_SET = new Set<string>(ERP_ITEM_COST_FIELDS);
const WAREHOUSE_FIELD_SET = new Set<string>(ERP_WAREHOUSE_FIELDS);
const BATCH_FIELD_SET = new Set<string>(ERP_BATCH_FIELDS);
const SEARCH_FIELD_SET = new Set<string>(ERP_SEARCH_FIELDS);
const CUSTOMER_SEARCH_FIELD_SET = new Set<string>(ERP_CUSTOMER_SEARCH_FIELDS);
/**
 * 客戶 and 廠商 (COPI01／PURI01) are queried the same way: one record by code, or a list by
 * 簡稱／全名 where every row must contain the keyword.
 */
const PARTIES = {
  CUSTOMER: { kind: "客戶", fields: ERP_CUSTOMER_FIELDS, fieldSet: new Set<string>(ERP_CUSTOMER_FIELDS),
    search: ERP_CUSTOMER_SEARCH_FIELDS, searchSet: CUSTOMER_SEARCH_FIELD_SET, codeKey: "customerCode" },
  SUPPLIER: { kind: "廠商", fields: ERP_SUPPLIER_FIELDS, fieldSet: new Set<string>(ERP_SUPPLIER_FIELDS),
    search: ERP_SUPPLIER_SEARCH_FIELDS, searchSet: new Set<string>(ERP_SUPPLIER_SEARCH_FIELDS), codeKey: "supplierCode" },
} as const;
const partyOf = (type: ErpQueryType) => type === "CUSTOMER_NO" || type === "CUSTOMER_NAME" ? PARTIES.CUSTOMER
  : type === "SUPPLIER_NO" || type === "SUPPLIER_NAME" ? PARTIES.SUPPLIER : null;
const ERROR_TEXT: Record<ErpQueryErrorCode, string> = {
  ERP_NOT_OPEN: "ERP 尚未開啟", ERP_BUSY: "ERP 正在忙碌",
  ERP_STATE: "ERP 畫面狀態不符", EXPORT_FAILED: "ERP 匯出失敗",
  // ERP refused the Agent's login: every licence is taken (CYERPAutoQuery 1.0.4, user 2026-10-27).
  ERP_SEATS_FULL: "ERP 人數已滿，請稍後再查詢",
  CANCELLED: "查詢已取消", INTERNAL: "查詢程式發生錯誤",
  AGENT_TIMEOUT: "查詢程式逾時，請重新查詢",
};
const VALID_AGENT_ERRORS = new Set(Object.keys(ERROR_TEXT).filter(v => v !== "AGENT_TIMEOUT"));
const ISO_30_DAYS = 30 * 24 * 60 * 60 * 1000;
// The Agent claims every 2-3 s; the heartbeat row is rewritten at most every 10 s (or when
// version/ERP state change) so an idle Agent does not cost a D1 write per poll. 10 s keeps
// the 15 s online window satisfied.
const HEARTBEAT_WRITE_MS = 10000;
const MAX_ORDERS = 1000, MAX_ORDER_LINES = 500, MAX_BILLS = 3000, MAX_VOUCHERS = 500;

function bad(code: string, message: string, status = 400): never {
  throw new RequestInputError(code, message, status);
}
const parsedJson = <T,>(text: string | null): T | null => text ? JSON.parse(text) as T : null;
function toJob(row: JobRow, showCost: boolean): ErpQueryResult {
  const list = parsedJson<{items:ErpField[][];total:number;truncated:boolean}>(row.items_json);
  const report = parsedJson<{orders?:ErpSalesOrder[];purchases?:ErpPurchaseOrder[];bills?:ErpReceivableBill[];restock?:ErpRestockItem[];total:number;truncated:boolean}>(row.result_json);
  const sales = DATED_TYPES.has(row.query_type);  // ORDER keeps its number in code and has no dates
  const fields = parsedJson<ErpField[]>(row.fields_json) ?? [];
  return {
    id: row.id, queryType:row.query_type, itemNo:row.query_type === "ITEM_NO" ? row.item_no : null,
    keyword:row.keyword, items:list?.items ?? [], total:list?.total ?? report?.total ?? 0, truncated:list?.truncated ?? report?.truncated ?? false,
    code: row.target_code, scope: row.receivable_scope,
    dateFrom: sales ? row.history_from : null, dateTo: sales ? row.history_to : null,
    orders: report?.orders ?? [], purchases: report?.purchases ?? [], bills: report?.bills ?? [], restock: report?.restock ?? [],
    status: row.status, createdAt: row.created_at,
    startedAt: row.started_at, completedAt: row.completed_at, elapsedMs: row.elapsed_ms,
    progress: row.status === "RUNNING" && row.progress_stage && row.progress_done != null && row.progress_total != null
      ? { stage: row.progress_stage, done: row.progress_done, total: row.progress_total } : null,
    // 標準進價 also follows the reader's current grant, not only the one at creation.
    fields: showCost ? fields : fields.filter(field => !COST_FIELD_SET.has(field.name)),
    warehouses: parsedJson<ErpField[][]>(row.warehouses_json) ?? [],
    includeHistory: row.include_history === 1, historyFrom: sales ? null : row.history_from, historyTo: sales ? null : row.history_to,
    batchManaged: row.batch_managed == null ? null : row.batch_managed === 1,
    batches: parsedJson<ErpField[][]>(row.batches_json) ?? [],
    history: parsedJson<ErpQueryHistory>(row.history_json),
    errorCode: row.error_code, errorMessage: row.error_message,
    resultCleared: row.status === "DONE" && !["STOCKTAKE_SYNC","STOCKTAKE_WRITE"].includes(row.query_type) && resultColumn(row) === null,
    notBefore: row.status === "QUEUED" ? row.not_before : null,
  };
}
function resultColumn(row: JobRow): string | null {
  if (NAME_TYPES.has(row.query_type)) return row.items_json;
  if (REPORT_TYPES.has(row.query_type)) return row.result_json;
  return row.fields_json;
}
function parseItemNo(value: unknown): string {
  // Item numbers are ASCII letters and digits only (user 2026-10-16), the same rule as the Agent.
  return parseErpCode(value) ?? bad("INVALID_ITEM_NO", "品號只能輸入 1～40 個英文字母、數字或「-」");
}
function parseCode(value: unknown, what: string): string {
  return parseErpCode(value) ?? bad("INVALID_CODE", what + "只能輸入 1～40 個英文字母、數字或「-」");
}
function parseKeyword(value: unknown, what = "品名"): string {
  const keyword = parseErpNameKeyword(value);
  if (!keyword) return bad("INVALID_KEYWORD", what + "關鍵字須為 1～40 字，不可含控制字元、單引號或萬用字元");
  return keyword;
}
function limitedString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value))
    return bad("INVALID_AGENT_RESULT", field + " 不符合格式");
  return value;
}
function parseFields(raw: unknown, allowed: Set<string>, maxFields: number): ErpField[] {
  if (!Array.isArray(raw) || raw.length > maxFields) return bad("INVALID_AGENT_RESULT", "查詢欄位數量不正確");
  const found = new Set<string>();
  return raw.map((entry: unknown) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return bad("INVALID_AGENT_RESULT", "查詢欄位格式不正確");
    const value = entry as Record<string, unknown>;
    const name = limitedString(value.name, "欄位名稱", 30);
    if (!allowed.has(name) || found.has(name)) return bad("INVALID_AGENT_RESULT", "查詢欄位不在允許清單或重複");
    found.add(name);
    return { name, value: limitedString(value.value, "欄位內容", 4096) };
  });
}
function object(raw: unknown, what: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return bad("INVALID_AGENT_RESULT", what + "格式不正確");
  return raw as Record<string, unknown>;
}
function list(raw: unknown, what: string, max: number): unknown[] {
  if (!Array.isArray(raw) || raw.length > max) return bad("INVALID_AGENT_RESULT", what + "列數不正確");
  return raw;
}
function isoDay(value: unknown, what: string): string {
  const text = limitedString(value, what, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return bad("INVALID_AGENT_RESULT", what + "必須為 YYYY-MM-DD");
  return text;
}
function totals(body: Record<string, unknown>, count: number, what: string): { total: number; truncated: boolean } {
  if (typeof body.total !== "number" || !Number.isSafeInteger(body.total) || body.total < count || typeof body.truncated !== "boolean")
    return bad("INVALID_AGENT_RESULT", what + "總筆數或截斷狀態不正確");
  return { total: body.total, truncated: body.truncated };
}
function parseHistory(raw: unknown, job: JobRow): ErpQueryHistory | null {
  if (raw == null) return null; // Older Agent may not support requested history.
  if (!job.include_history) return bad("INVALID_AGENT_RESULT", "未要求歷史異動，不可回傳歷史資料");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return bad("INVALID_AGENT_RESULT", "歷史異動資料格式錯誤");
  const data = raw as Record<string, unknown>;
  if (data.from !== job.history_from || data.to !== job.history_to)
    return bad("INVALID_AGENT_RESULT", "歷史異動起迄日與查詢工作不一致");
  if (!Array.isArray(data.columns) || JSON.stringify(data.columns) !== JSON.stringify(ERP_HISTORY_COLUMNS))
    return bad("INVALID_AGENT_RESULT", "歷史異動欄位與順序不正確");
  if (!Array.isArray(data.rows) || data.rows.length > 2000)
    return bad("INVALID_AGENT_RESULT", "歷史異動列數超過限制");
  const rows: string[][] = data.rows.map(row => {
    if (!Array.isArray(row) || row.length !== ERP_HISTORY_COLUMNS.length)
      return bad("INVALID_AGENT_RESULT", "歷史異動每列須包含七欄");
    return row.map(cell => limitedString(cell, "歷史異動內容", 1024));
  });
  if (typeof data.total !== "number" || !Number.isSafeInteger(data.total) || data.total < rows.length
    || data.truncated !== (data.total > rows.length))
    return bad("INVALID_AGENT_RESULT", "歷史異動總筆數或截斷狀態錯誤");
  return {from:data.from as string,to:data.to as string,columns:[...ERP_HISTORY_COLUMNS],rows,total:data.total,truncated:data.truncated as boolean};
}
/** A name-search list (品名, or 客戶／廠商 簡稱／全名): every row has its code and contains the keyword. */
function parseNameList(body: Record<string, unknown>, job: JobRow) {
  const party = partyOf(job.query_type);
  if (body.keyword !== job.keyword)
    return bad("INVALID_AGENT_RESULT", "回報的關鍵字與查詢工作不同");
  const items = list(body.items, "名稱查詢結果", 500).map((raw: unknown) => {
    const fields = parseFields(raw, party ? party.searchSet : SEARCH_FIELD_SET,
      party ? party.search.length : ERP_SEARCH_FIELDS.length);
    const value = (name: string) => fields.find(field => field.name === name)?.value ?? "";
    if (!value(party ? party.kind + "代號" : "品號").trim())
      return bad("INVALID_AGENT_RESULT", party ? `${party.kind}名稱查詢每筆都必須有${party.kind}代號` : "品名查詢每筆都必須有品號");
    const keyword = job.keyword ?? "";
    const matches = party
      ? erpNameContains(value(party.kind + "簡稱"), keyword) || erpNameContains(value(party.kind + "全名"), keyword)
      : !!value("品名") && erpNameContains(value("品名"), keyword);
    if (!matches) return bad("INVALID_AGENT_RESULT", "名稱查詢結果不符合關鍵字");
    return fields;
  });
  return { items, ...totals(body, items.length, "名稱查詢") };
}
function parseSalesLine(raw: unknown): ErpSalesLine {
  const line = object(raw, "銷貨明細");
  if (typeof line.seq !== "number" || !Number.isSafeInteger(line.seq) || line.seq < 1)
    return bad("INVALID_AGENT_RESULT", "銷貨明細序號不正確");
  const s = (name: string, max = 200) => limitedString(line[name], "銷貨明細" + name, max);
  return {
    seq: line.seq, itemCode: s("itemCode", 40), itemName: s("itemName"), specification: s("specification"),
    warehouse: s("warehouse"), quantity: s("quantity", 40), unit: s("unit", 40), unitPrice: s("unitPrice", 40),
    amount: s("amount", 40), giftType: s("giftType", 40), giftQuantity: s("giftQuantity", 40), batch: s("batch", 60),
    note: s("note", 4096), sourceOrder: s("sourceOrder", 60),
  };
}
/**
 * 銷貨／銷退單: SALES orders are the job's customer inside its 單據日期 range; an ORDER job's orders
 * are that one number.
 */
function parseSales(body: Record<string, unknown>, job: JobRow) {
  const one = job.query_type === "ORDER";
  if (one ? body.orderNo !== job.target_code
    : body.customerCode !== job.target_code || body.dateFrom !== job.history_from || body.dateTo !== job.history_to)
    return bad("INVALID_AGENT_RESULT", "回報的客戶、單號或日期範圍與查詢工作不同");
  const orders = list(body.orders, "銷貨銷退單", MAX_ORDERS).map((raw: unknown): ErpSalesOrder => {
    const order = object(raw, "銷貨銷退單");
    const s = (name: string, max = 200) => limitedString(order[name], "銷貨銷退單" + name, max);
    if (order.kind !== "銷貨" && order.kind !== "銷退") return bad("INVALID_AGENT_RESULT", "單據類別只能是銷貨或銷退");
    const date = isoDay(order.date, "單據日期");
    if (!one && (date < (job.history_from ?? "") || date > (job.history_to ?? "")))
      return bad("INVALID_AGENT_RESULT", "單據日期不在查詢範圍內");
    const customerCode = s("customerCode", 40);
    if (!one && customerCode !== job.target_code) return bad("INVALID_AGENT_RESULT", "單據客戶與查詢客戶不同");
    const orderNo = s("orderNo", 60);
    if (!orderNo.trim()) return bad("INVALID_AGENT_RESULT", "單據必須有單號");
    if (one && orderNo !== job.target_code) return bad("INVALID_AGENT_RESULT", "單據單號與查詢單號不同");
    const lines = list(order.lines, "銷貨明細", MAX_ORDER_LINES).map(parseSalesLine);
    if (!lines.length) return bad("INVALID_AGENT_RESULT", "單據必須有明細");
    return {
      kind: order.kind, orderNo, date, customerCode, customerName: s("customerName"), salesperson: s("salesperson"),
      department: s("department"), paymentTerm: s("paymentTerm"), taxType: s("taxType", 40), invoiceType: s("invoiceType", 40),
      totalQuantity: s("totalQuantity", 40), amount: s("amount", 40), tax: s("tax", 40), total: s("total", 40),
      note: s("note", 4096), reason: s("reason"), lines,
    };
  });
  return { orders, ...totals(body, orders.length, "銷貨銷退單") };
}
function parsePurchaseLine(raw: unknown): ErpPurchaseLine {
  const line = object(raw, "進貨明細");
  if (typeof line.seq !== "number" || !Number.isSafeInteger(line.seq) || line.seq < 1)
    return bad("INVALID_AGENT_RESULT", "進貨明細序號不正確");
  const s = (name: string, max = 200) => limitedString(line[name], "進貨明細" + name, max);
  const acceptDate = s("acceptDate", 10);
  return {
    seq: line.seq, itemCode: s("itemCode", 40), itemName: s("itemName"), specification: s("specification"),
    acceptDate: acceptDate ? isoDay(acceptDate, "驗收日期") : "", warehouse: s("warehouse"),
    quantity: s("quantity", 40), acceptedQuantity: s("acceptedQuantity", 40), returnedQuantity: s("returnedQuantity", 40),
    unit: s("unit", 40), unitPrice: s("unitPrice", 40), amount: s("amount", 40), tax: s("tax", 40), batch: s("batch", 60),
    purchaseOrderNo: s("purchaseOrderNo", 60), note: s("note", 4096), sourceOrder: s("sourceOrder", 60),
  };
}
/** 進貨／退貨單 (PURR18+PURR22): every order is the job's supplier inside its 單據日期 range. */
function parsePurchases(body: Record<string, unknown>, job: JobRow) {
  if (body.supplierCode !== job.target_code || body.dateFrom !== job.history_from || body.dateTo !== job.history_to)
    return bad("INVALID_AGENT_RESULT", "回報的廠商或日期範圍與查詢工作不同");
  const purchases = list(body.orders, "進貨退貨單", MAX_ORDERS).map((raw: unknown): ErpPurchaseOrder => {
    const order = object(raw, "進貨退貨單");
    const s = (name: string, max = 200) => limitedString(order[name], "進貨退貨單" + name, max);
    if (order.kind !== "進貨" && order.kind !== "退貨") return bad("INVALID_AGENT_RESULT", "單據類別只能是進貨或退貨");
    const date = isoDay(order.date, "單據日期");
    if (date < (job.history_from ?? "") || date > (job.history_to ?? "")) return bad("INVALID_AGENT_RESULT", "單據日期不在查詢範圍內");
    const supplierCode = s("supplierCode", 40);
    if (supplierCode !== job.target_code) return bad("INVALID_AGENT_RESULT", "單據廠商與查詢廠商不同");
    const orderNo = s("orderNo", 60);
    if (!orderNo.trim()) return bad("INVALID_AGENT_RESULT", "單據必須有單號");
    const lines = list(order.lines, "進貨明細", MAX_ORDER_LINES).map(parsePurchaseLine);
    if (!lines.length) return bad("INVALID_AGENT_RESULT", "單據必須有明細");
    return {
      kind: order.kind, orderNo, date, supplierCode, supplierName: s("supplierName"), supplierOrderNo: s("supplierOrderNo", 60),
      invoiceNo: s("invoiceNo", 40), invoiceType: s("invoiceType", 40), taxType: s("taxType", 40), currency: s("currency", 10),
      totalQuantity: s("totalQuantity", 40), amount: s("amount", 40), deduction: s("deduction", 40), tax: s("tax", 40),
      total: s("total", 40), settled: s("settled", 10), lines,
    };
  });
  return { purchases, ...totals(body, purchases.length, "進貨退貨單") };
}
/** 未收款 結帳單: one customer／業務員 jobs only hold that code's bills. */
function parseReceivables(body: Record<string, unknown>, job: JobRow) {
  if (body.scope !== job.receivable_scope || (body.code ?? null) !== job.target_code)
    return bad("INVALID_AGENT_RESULT", "回報的未收款範圍與查詢工作不同");
  const bills = list(body.bills, "結帳單", MAX_BILLS).map((raw: unknown): ErpReceivableBill => {
    const bill = object(raw, "結帳單");
    const s = (name: string, max = 200) => limitedString(bill[name], "結帳單" + name, max);
    const bill_: ErpReceivableBill = {
      customerCode: s("customerCode", 40), customerName: s("customerName"), date: isoDay(bill.date, "結帳日期"),
      billNo: s("billNo", 60), salespersonCode: s("salespersonCode", 40), salespersonName: s("salespersonName"),
      invoiceNo: s("invoiceNo", 40), currency: s("currency", 10), receivable: s("receivable", 40),
      receivableTax: s("receivableTax", 40), unpaid: s("unpaid", 40),
      vouchers: list(bill.vouchers, "憑證", MAX_VOUCHERS).map((entry: unknown): ErpReceivableVoucher => {
        const voucher = object(entry, "憑證");
        const v = (name: string, max = 60) => limitedString(voucher[name], "憑證" + name, max);
        const date = v("date", 10);
        if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("INVALID_AGENT_RESULT", "憑證日期必須為 YYYY-MM-DD");
        return { voucherNo: v("voucherNo"), date, amount: v("amount", 40), tax: v("tax", 40) };
      }),
    };
    if (!bill_.billNo.trim() || !bill_.customerCode.trim()) return bad("INVALID_AGENT_RESULT", "結帳單必須有結帳單號與客戶代號");
    if (job.receivable_scope === "CUSTOMER" && bill_.customerCode !== job.target_code
      || job.receivable_scope === "SALESPERSON" && bill_.salespersonCode !== job.target_code)
      return bad("INVALID_AGENT_RESULT", "結帳單不屬於查詢的客戶或業務員");
    return bill_;
  });
  return { bills, ...totals(body, bills.length, "結帳單") };
}
const QUANTITY = /^-?\d{1,12}(\.\d{1,6})?$/;
function quantity(value: unknown, what: string): string {
  const text = limitedString(value, what, 20);
  if (!QUANTITY.test(text)) return bad("INVALID_AGENT_RESULT", what + "必須是數字");
  return text;
}
/**
 * 進貨輔助 (RESTOCK): one row per 品號 with the days inside the job's range it moved on, the range's
 * subtotals and its 庫存數量 (null with a note when it was not read).
 */
function parseRestock(body: Record<string, unknown>, job: JobRow) {
  if (body.dateFrom !== job.history_from || body.dateTo !== job.history_to)
    return bad("INVALID_AGENT_RESULT", "回報的日期範圍與查詢工作不同");
  const from = job.history_from ?? "", to = job.history_to ?? "";
  const maxDays = from && to ? daysInclusive(from, to) : 0;
  const codes = new Set<string>();
  const restock = list(body.items, "進貨輔助品號", ERP_RESTOCK_MAX_ITEMS).map((raw: unknown): ErpRestockItem => {
    const item = object(raw, "進貨輔助品號");
    const itemCode = limitedString(item.itemCode, "品號", 40).trim();
    if (!itemCode || codes.has(itemCode)) return bad("INVALID_AGENT_RESULT", "進貨輔助的品號不可空白或重複");
    codes.add(itemCode);
    const dates = new Set<string>();
    const days = list(item.days, "進貨輔助日期", maxDays).map((entry: unknown): ErpRestockDay => {
      const day = object(entry, "進貨輔助日期");
      const date = isoDay(day.date, "單據日期");
      if (date < from || date > to || dates.has(date)) return bad("INVALID_AGENT_RESULT", "進貨輔助的日期不在查詢範圍內或重複");
      dates.add(date);
      return { date, sold: quantity(day.sold, "銷貨數量"), returned: quantity(day.returned, "銷退數量"),
        soldGift: quantity(day.soldGift ?? "0", "銷貨贈品量"), returnedGift: quantity(day.returnedGift ?? "0", "銷退贈品量") };
    }).sort((a, b) => a.date.localeCompare(b.date));
    const stock = item.stock == null ? null : quantity(item.stock, "庫存數量");
    return {
      itemCode, itemName: limitedString(item.itemName, "品名", 200), unit: limitedString(item.unit, "單位", 40), days,
      sold: quantity(item.sold, "銷貨小計"), returned: quantity(item.returned, "銷退小計"),
      soldGift: quantity(item.soldGift ?? "0", "銷貨贈品小計"), returnedGift: quantity(item.returnedGift ?? "0", "銷退贈品小計"),
      stock, stockNote: limitedString(item.stockNote ?? "", "庫存說明", 200),
    };
  });
  return { restock, ...totals(body, restock.length, "進貨輔助品號") };
}
type ParsedResult = {
  status: "DONE" | "NOT_FOUND" | "FAILED";
  fieldsJson: string | null; warehousesJson: string | null; batchManaged: number | null; batchesJson: string | null;
  historyJson: string | null; itemsJson: string | null; resultJson: string | null;
  resultCount: number; truncated: boolean; errorCode: ErpQueryErrorCode | null; errorMessage: string | null; elapsedMs: number;
};
const EMPTY = { fieldsJson: null, warehousesJson: null, batchManaged: null, batchesJson: null, historyJson: null, itemsJson: null, resultJson: null };
/** Item details (ITEM_NO) or an item-name list (ITEM_NAME), the original contract. */
function parseItemResult(body: Record<string, unknown>, job: JobRow, outcome: "FOUND" | "NOT_FOUND" | "FAILED") {
  const search = job.query_type === "ITEM_NAME" && outcome !== "FAILED" ? parseNameList(body, job) : null;
  if (job.query_type === "ITEM_NAME" && (body.fields != null && (!Array.isArray(body.fields) || body.fields.length !== 0)
    || body.warehouses != null && (!Array.isArray(body.warehouses) || body.warehouses.length !== 0)
    || body.batches != null && (!Array.isArray(body.batches) || body.batches.length !== 0)
    || body.history != null || body.batchManaged != null))
    return bad("INVALID_AGENT_RESULT", "品名查詢不得附帶品號詳細資料");
  if (job.query_type === "ITEM_NO" && (body.items !== undefined || body.keyword !== undefined))
    return bad("INVALID_AGENT_RESULT", "品號查詢不得附帶品名清單");
  if (job.query_type === "ITEM_NAME" && outcome === "FAILED"
    && (body.items != null && (!Array.isArray(body.items) || body.items.length !== 0)))
    return bad("INVALID_AGENT_RESULT", "品名查詢失敗不得附帶清單");
  const parsed = parseFields(body.fields ?? [], ITEM_FIELD_SET, ERP_ITEM_FIELDS.length);
  // 標準進價 is not even stored for a member without ERP_ITEM_COST, whatever the Agent sends.
  const fields = job.include_cost === 1 ? parsed : parsed.filter(field => !COST_FIELD_SET.has(field.name));
  if (!Array.isArray(body.warehouses) || body.warehouses.length > 100)
    return bad("INVALID_AGENT_RESULT", "庫別資料格式不正確");
  const warehouses = body.warehouses.map(row => parseFields(row, WAREHOUSE_FIELD_SET, ERP_WAREHOUSE_FIELDS.length));
  if (body.batchManaged !== undefined && typeof body.batchManaged !== "boolean")
    return bad("INVALID_AGENT_RESULT", "批號管理狀態必須為布林值");
  const batchesRaw = body.batches ?? [];
  if (!Array.isArray(batchesRaw) || batchesRaw.length > 100)
    return bad("INVALID_AGENT_RESULT", "批號列數超過限制");
  const batches: ErpField[][] = batchesRaw.map((row: unknown) =>
    parseFields(row, BATCH_FIELD_SET, ERP_BATCH_FIELDS.length));
  const batchManaged = body.batchManaged === undefined ? null : body.batchManaged as boolean;
  if (batchManaged !== true && batches.length)
    return bad("INVALID_AGENT_RESULT", "非批號管理不可回報批號庫存");
  if (!job.include_history && body.history != null)
    return bad("INVALID_AGENT_RESULT", "未要求歷史異動，不可回傳歷史資料");
  const history = parseHistory(body.history, job);
  if (outcome === "FOUND") {
    if (job.query_type === "ITEM_NO" && fields.find(f => f.name === "品號")?.value !== job.item_no)
      return bad("INVALID_AGENT_RESULT", "查詢結果品號與工作不一致");
    if (search && search.items.length === 0)
      return bad("INVALID_AGENT_RESULT", "FOUND 的品名清單不可為空");
  } else if (parsed.length || warehouses.length || batches.length || body.history != null
    || search && (search.items.length !== 0 || search.total !== 0 || search.truncated)) {
    return bad("INVALID_AGENT_RESULT", "非成功結果不得附帶 ERP 欄位");
  }
  const found = outcome === "FOUND";
  return {
    ...EMPTY,
    fieldsJson: found ? JSON.stringify(fields) : null,
    warehousesJson: found ? JSON.stringify(warehouses) : null,
    batchManaged: found ? (batchManaged == null ? null : batchManaged ? 1 : 0) : null,
    batchesJson: found ? JSON.stringify(batches) : null,
    historyJson: found && history ? JSON.stringify(history) : null,
    itemsJson: found && search ? JSON.stringify(search) : null,
    resultCount: found ? search?.total ?? 0 : 0,
    truncated: found ? search?.truncated ?? false : false,
  };
}
/** Customer, supplier, 銷貨銷退 and 未收款 results: no item detail, one result shape per type. */
function parseBusinessResult(body: Record<string, unknown>, job: JobRow, outcome: "FOUND" | "NOT_FOUND" | "FAILED") {
  for (const key of ["warehouses", "batches", "items", "orders", "bills"] as const)
    if (body[key] != null && (!Array.isArray(body[key]) || (body[key] as unknown[]).length !== 0)
      && !(key === "items" && (NAME_TYPES.has(job.query_type) || job.query_type === "RESTOCK") || key === "orders" && (job.query_type === "SALES" || job.query_type === "ORDER" || job.query_type === "PURCHASES")
        || key === "bills" && job.query_type === "RECEIVABLE"))
      return bad("INVALID_AGENT_RESULT", "查詢結果附帶了其他類型的資料");
  if (body.history != null || body.batchManaged != null
    || job.query_type !== "CUSTOMER_NO" && job.query_type !== "SUPPLIER_NO" && body.fields != null && (!Array.isArray(body.fields) || body.fields.length !== 0))
    return bad("INVALID_AGENT_RESULT", "查詢結果附帶了其他類型的資料");
  if (outcome === "FAILED") {
    if (["fields", "items", "orders", "bills"].some(key => Array.isArray(body[key]) && (body[key] as unknown[]).length))
      return bad("INVALID_AGENT_RESULT", "查詢失敗不得附帶資料");
    return { ...EMPTY, resultCount: 0, truncated: false };
  }
  const found = outcome === "FOUND";
  const party = job.query_type === "CUSTOMER_NO" || job.query_type === "SUPPLIER_NO" ? partyOf(job.query_type) : null;
  if (party) {
    if (body[party.codeKey] !== job.target_code) return bad("INVALID_AGENT_RESULT", `回報的${party.kind}代號與查詢工作不同`);
    const fields = parseFields(body.fields ?? [], party.fieldSet, party.fields.length);
    if (found && fields.find(f => f.name === party.kind + "代號")?.value !== job.target_code)
      return bad("INVALID_AGENT_RESULT", `查詢結果${party.kind}代號與工作不一致`);
    if (!found && fields.length) return bad("INVALID_AGENT_RESULT", "非成功結果不得附帶 ERP 欄位");
    return { ...EMPTY, fieldsJson: found ? JSON.stringify(fields) : null, resultCount: found ? 1 : 0, truncated: false };
  }
  const result = NAME_TYPES.has(job.query_type) ? parseNameList(body, job)
    : job.query_type === "SALES" || job.query_type === "ORDER" ? parseSales(body, job)
    : job.query_type === "PURCHASES" ? parsePurchases(body, job)
    : job.query_type === "RESTOCK" ? parseRestock(body, job) : parseReceivables(body, job);
  const count = "items" in result ? result.items.length : "orders" in result ? result.orders.length
    : "purchases" in result ? result.purchases.length : "restock" in result ? result.restock.length : result.bills.length;
  if (found && count === 0) return bad("INVALID_AGENT_RESULT", "FOUND 的結果不可為空");
  if (!found && (count !== 0 || result.total !== 0 || result.truncated)) return bad("INVALID_AGENT_RESULT", "非成功結果不得附帶 ERP 資料");
  return {
    ...EMPTY,
    itemsJson: found && "items" in result ? JSON.stringify(result) : null,
    resultJson: found && !("items" in result) ? JSON.stringify(result) : null,
    resultCount: found ? result.total : 0, truncated: found && result.truncated,
  };
}
function parseResult(body: Record<string, unknown>, job: JobRow): ParsedResult {
  if (!["FOUND", "NOT_FOUND", "FAILED"].includes(String(body.outcome)))
    return bad("INVALID_OUTCOME", "查詢結果狀態不正確");
  const outcome = body.outcome as "FOUND" | "NOT_FOUND" | "FAILED";
  const elapsedMs = body.elapsedMs;
  if (typeof elapsedMs !== "number" || !Number.isSafeInteger(elapsedMs) || elapsedMs < 0 || elapsedMs > 3600000)
    return bad("INVALID_AGENT_RESULT", "查詢耗時不正確");
  const parsed = job.query_type === "STOCKTAKE_SYNC" || job.query_type === "STOCKTAKE_WRITE"
    ? { ...EMPTY, resultCount: 0, truncated: false }
    : job.query_type === "ITEM_NO" || job.query_type === "ITEM_NAME"
      ? parseItemResult(body, job, outcome) : parseBusinessResult(body, job, outcome);
  let errorCode: ErpQueryErrorCode | null = null;
  if (outcome === "FAILED") {
    if (typeof body.errorCode !== "string" || !VALID_AGENT_ERRORS.has(body.errorCode))
      return bad("INVALID_AGENT_RESULT", "查詢失敗代碼不正確");
    errorCode = body.errorCode as ErpQueryErrorCode;
  }
  if (body.agentVersion !== undefined) limitedString(body.agentVersion, "程式版本", 40);
  // Never persist arbitrary agent error strings: they may contain file paths or ERP secrets.
  return {
    ...parsed,
    status: outcome === "FOUND" ? "DONE" : outcome,
    errorCode, errorMessage: errorCode ? ERROR_TEXT[errorCode] : null,
    elapsedMs: elapsedMs as number,
  };
}
async function digestToken(token: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
}
function sameDigest(a: string, b: string): boolean {
  if (a.length !== 64 || b.length !== 64) return false;
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function agentGuard(request: Request, env: ErpBridgeEnv, requestId: string):
  Promise<{ digest: string } | Response> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([\x21-\x7e]{32,256})$/.exec(header);
  if (!match) return failure({ code: "AGENT_UNAUTHORIZED", message: "Valid ERP agent token required" }, requestId, 401);
  const digest = await digestToken(match[1]);
  const credential = await env.DB.prepare("SELECT token_hash FROM erp_item_agent_credentials WHERE id=1")
    .first<{ token_hash: string | null }>();
  if (!credential?.token_hash || !sameDigest(digest, credential.token_hash))
    return failure({ code: "AGENT_UNAUTHORIZED", message: "Valid ERP agent token required" }, requestId, 401);
  return { digest };
}
async function housekeeping(db: D1Database): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString();
  const expired = await db.prepare(
    `UPDATE erp_item_queries SET status='EXPIRED', completed_at=?1 WHERE status='QUEUED' AND (expires_at<=?1 OR (COALESCE(not_before,created_at)<=?2
        AND NOT EXISTS(SELECT 1 FROM erp_item_queries WHERE status='RUNNING')
        AND NOT EXISTS(SELECT 1 FROM erp_item_agent_status WHERE id=1 AND last_seen_at>?3)))
      RETURNING id,owner_member_id,item_no`
  ).bind(nowIso, ago(120), ago(60)).all<{ id: string; owner_member_id: number; item_no: string }>();
  // RUNNING limits: 180 s a plain query, 300 s with 歷史異動, 600 s an ERP report (SALES and PURCHASES
  // run two, ORDER one), 1800 s a 進貨輔助 (two reports, then 庫存 one 品號 at a time).
  const timedOut = await db.prepare(
    `UPDATE erp_item_queries SET status='FAILED', completed_at=?1, error_code='AGENT_TIMEOUT', error_message=?2
      WHERE status='RUNNING' AND (
        (query_type='STOCKTAKE_WRITE' AND started_at<=?7)
        OR (query_type IN ('RESTOCK','STOCKTAKE_SYNC') AND started_at<=?6)
        OR (query_type IN ('SALES','PURCHASES','RECEIVABLE','ORDER') AND started_at<=?5)
        OR (query_type NOT IN ('SALES','PURCHASES','RECEIVABLE','ORDER','RESTOCK','STOCKTAKE_SYNC','STOCKTAKE_WRITE') AND include_history=0 AND started_at<=?3)
        OR (query_type NOT IN ('SALES','PURCHASES','RECEIVABLE','ORDER','RESTOCK','STOCKTAKE_SYNC','STOCKTAKE_WRITE') AND include_history=1 AND started_at<=?4))
      RETURNING id,owner_member_id,item_no`
  ).bind(nowIso, ERROR_TEXT.AGENT_TIMEOUT, ago(180), ago(300), ago(600), ago(1800), ago(3600)).all<{ id: string; owner_member_id: number; item_no: string }>();
  const audit = new AuditService(db);
  for (const job of expired.results ?? []) {
    await audit.record({ entityType: "erp_item_query", entityKey: job.id, action: "erp_item_query.expired", actorEmployeeId: job.owner_member_id, statusFrom: "QUEUED", statusTo: "EXPIRED", metadata: { itemNo: job.item_no } });
  }
  for (const job of timedOut.results ?? []) {
    await audit.record({ entityType: "erp_item_query", entityKey: job.id, action: "erp_item_query.failed", actorEmployeeId: job.owner_member_id, statusFrom: "RUNNING", statusTo: "FAILED", metadata: { itemNo: job.item_no, outcome: "AGENT_TIMEOUT" } });
  }
  await db.prepare(
    "UPDATE erp_item_queries SET fields_json=NULL,warehouses_json=NULL,batches_json=NULL,history_json=NULL,items_json=NULL,result_json=NULL WHERE completed_at<?1 AND (fields_json IS NOT NULL OR warehouses_json IS NOT NULL OR batches_json IS NOT NULL OR history_json IS NOT NULL OR items_json IS NOT NULL OR result_json IS NOT NULL)"
  ).bind(ago(300)).run();
  await db.prepare("DELETE FROM erp_item_queries WHERE completed_at<?1")
    .bind(new Date(now.getTime() - ISO_30_DAYS).toISOString()).run();
}
async function allowed(db: D1Database, principal: IdentityPrincipal, code: CyWebModuleCode): Promise<AppMemberRecord | null> {
  const access = await checkModuleAccess(db, principal, code);
  return access.allowed ? access.member : null;
}
/** The member when any of the grants is held now, else null. */
async function allowedAny(db: D1Database, principal: IdentityPrincipal, codes: readonly CyWebModuleCode[]): Promise<AppMemberRecord | null> {
  for (const code of codes) {
    const member = await allowed(db, principal, code);
    if (member) return member;
  }
  return null;
}
/** The signed-in principal, else the error response. */
async function userGuard(request: Request, env: ErpBridgeEnv, requestId: string): Promise<IdentityPrincipal | Response> {
  const provider = identityClient(env);
  if (!provider) return failure({ code: "IDENTITY_UNAVAILABLE", message: "帳號服務暫時無法使用" }, requestId, 503);
  const gate = await requireIdentity(provider, request);
  if (!gate.ok) return failure({ code: gate.code, message: "需要有效登入" }, requestId, gate.status);
  return gate.principal;
}
/** 進貨輔助 counts only with its required grants (user 2026-10-21); the refusal says which. */
const denied = (requestId: string, type?: ErpQueryType) => failure({ code: "ACCESS_DENIED", message: type === "RESTOCK"
  ? `進貨輔助需要「${moduleLabel("ERP_RESTOCK_ASSIST")}」，並同時具備${(MODULE_REQUIREMENTS.ERP_RESTOCK_ASSIST ?? []).map(code => `「${moduleLabel(code)}」`).join("、")}的模組權限`
  : "沒有這項 ERP 查詢的模組權限" }, requestId, 403);
const KEYS: Record<ErpQueryType, readonly string[]> = {
  ITEM_NO: ["queryType", "itemNo", "includeHistory", "historyFrom", "historyTo"],
  ITEM_NAME: ["queryType", "keyword"],
  CUSTOMER_NO: ["queryType", "customerCode"],
  CUSTOMER_NAME: ["queryType", "keyword"],
  SUPPLIER_NO: ["queryType", "supplierCode"],
  SUPPLIER_NAME: ["queryType", "keyword"],
  PURCHASES: ["queryType", "supplierCode", "dateFrom", "dateTo"],
  SALES: ["queryType", "customerCode", "dateFrom", "dateTo"],
  RECEIVABLE: ["queryType", "scope", "code"],
  ORDER: ["queryType", "orderNo"],
  RESTOCK: ["queryType", "dateFrom", "dateTo"],
  STOCKTAKE_SYNC: ["queryType"], STOCKTAKE_WRITE: ["queryType"],
};
type NewJob = {
  itemNo: string; keyword: string | null; targetCode: string | null; scope: ErpReceivableScope | null;
  includeHistory: boolean; from: string | null; to: string | null;
};
/** One validated request per type; anything else in the body is refused. */
function parseRequest(queryType: ErpQueryType, body: Record<string, unknown>): NewJob {
  const extra = Object.keys(body).find(key => !KEYS[queryType].includes(key));
  if (extra) return bad("INVALID_QUERY", "此查詢類型不接受欄位：" + extra);
  const base: NewJob = { itemNo: queryType, keyword: null, targetCode: null, scope: null, includeHistory: false, from: null, to: null };
  try {
    switch (queryType) {
      case "ITEM_NO": {
        const history = resolveHistoryRange(body);
        return { ...base, itemNo: parseItemNo(body.itemNo), includeHistory: history.includeHistory, from: history.historyFrom, to: history.historyTo };
      }
      case "ITEM_NAME": return { ...base, keyword: parseKeyword(body.keyword) };
      case "CUSTOMER_NO": return { ...base, targetCode: parseCode(body.customerCode, "客戶代號") };
      case "CUSTOMER_NAME": return { ...base, keyword: parseKeyword(body.keyword, "客戶名稱") };
      case "SUPPLIER_NO": return { ...base, targetCode: parseCode(body.supplierCode, "廠商代號") };
      case "SUPPLIER_NAME": return { ...base, keyword: parseKeyword(body.keyword, "廠商名稱") };
      case "PURCHASES": {
        const range = resolveDateRange(body.dateFrom, body.dateTo, "單據日期");
        return { ...base, targetCode: parseCode(body.supplierCode, "廠商代號"), from: range.from, to: range.to };
      }
      case "SALES": {
        const range = resolveDateRange(body.dateFrom, body.dateTo, "單據日期");
        return { ...base, targetCode: parseCode(body.customerCode, "客戶代號"), from: range.from, to: range.to };
      }
      case "STOCKTAKE_SYNC": case "STOCKTAKE_WRITE":
        return bad("INVALID_QUERY", "庫存盤點工作只能從門市盤點功能提出");
      case "RESTOCK": {
        const range = resolveRestockRange(body.dateFrom, body.dateTo, ERP_RESTOCK_MAX_DAYS);
        return { ...base, from: range.from, to: range.to };
      }
      case "ORDER":
        return { ...base, targetCode: parseErpOrderNo(body.orderNo) ?? bad("INVALID_CODE", "單號必須是銷貨單（23 開頭）或銷退單（24 開頭），例如 232A-20260804003") };
      case "RECEIVABLE": {
        const scope = body.scope;
        if (scope !== "CUSTOMER" && scope !== "SALESPERSON" && scope !== "ALL") return bad("INVALID_QUERY", "未收款查詢範圍不正確");
        if (scope === "ALL") {
          if (body.code != null) return bad("INVALID_QUERY", "查全部未收款不可指定代號");
          return { ...base, scope };
        }
        return { ...base, scope, targetCode: parseCode(body.code, scope === "CUSTOMER" ? "客戶代號" : "業務員代號") };
      }
    }
  } catch (error) {
    if (error instanceof HistoryRangeError) return bad(DATED_TYPES.has(queryType) ? "INVALID_DATE_RANGE" : "INVALID_HISTORY_RANGE", error.message);
    throw error;
  }
}
// ---- ERP 關閉／暫停 (user 2026-10-27) ------------------------------------------------------------
type ControlRow = { request: ErpControlRequest | null; requested_at: string | null; hold_until: string | null; result: ErpControlResult | null; result_at: string | null };
const CONTROL_HOLD_MINUTES = new Set([0, 15, 30, 60]);
/** 「關閉到…」 (user 2026-10-28): a chosen end, at most 24 hours ahead. */
const CONTROL_HOLD_MAX_MS = 24 * 3600000;
async function readControl(db: D1Database): Promise<ErpAgentControl> {
  const row = await db.prepare("SELECT request,requested_at,hold_until,result,result_at FROM erp_item_agent_control WHERE id=1").first<ControlRow>();
  const holdUntil = row?.hold_until && Date.parse(row.hold_until) > Date.now() ? row.hold_until : null;
  return { request: row?.request ?? null, requestedAt: row?.requested_at ?? null, holdUntil, result: row?.result ?? null, resultAt: row?.result_at ?? null };
}
/** 「HH:MM」 in Taipei, for messages. */
const taipeiTime = (iso: string) => new Date(Date.parse(iso) + 8 * 3600000).toISOString().slice(11, 16);

type QueueRow = {
  id: string; owner_member_id: number; query_type: ErpQueryType; status: "QUEUED" | "RUNNING"; created_at: string; started_at: string | null;
  item_no: string | null; keyword: string | null; target_code: string | null; receivable_scope: ErpReceivableScope | null;
  include_history: number; history_from: string | null; history_to: string | null;
  progress_stage: "REPORT" | "STOCK" | null; progress_done: number | null; progress_total: number | null;
  display_name: string | null; employee_no: string | null; not_before: string | null;
};
/** What a queued query is for, in a few words (the queue shows it next to the query type). */
function queueTarget(row: QueueRow): string | null {
  const range = row.history_from && row.history_to ? `${row.history_from}～${row.history_to}` : null;
  switch (row.query_type) {
    case "ITEM_NO": return row.include_history ? `${row.item_no}（含歷史異動）` : row.item_no;
    case "ITEM_NAME": case "CUSTOMER_NAME": case "SUPPLIER_NAME": return row.keyword;
    case "SALES": case "PURCHASES": return [row.target_code, range].filter(Boolean).join(" ") || null;
    case "RESTOCK": return range;
    case "STOCKTAKE_SYNC": return "門市盤點更新";
    case "STOCKTAKE_WRITE": return row.target_code;
    case "RECEIVABLE": return row.receivable_scope === "ALL" ? "全部客戶" : `${row.receivable_scope === "CUSTOMER" ? "客戶" : "業務員"} ${row.target_code ?? ""}`;
    default: return row.target_code;
  }
}
async function userRoutes(request: Request, env: ErpBridgeEnv, requestId: string, pathname: string): Promise<Response> {
  const principal = await userGuard(request, env, requestId);
  if (principal instanceof Response) return principal;
  await housekeeping(env.DB);
  if (pathname === "/api/erp/agent-status" && request.method === "GET") {
    if (!await allowedAny(env.DB, principal, ERP_QUERY_MODULES)) return denied(requestId);
    const heartbeat = await env.DB.prepare("SELECT last_seen_at,agent_version,erp_state FROM erp_item_agent_status WHERE id=1")
      .first<{ last_seen_at: string; agent_version: string; erp_state: string }>();
    const lastSeenAt = heartbeat?.last_seen_at ?? null;
    // The Agent claims (and so beats) only between jobs; while it runs one (a 進貨輔助 can take
    // minutes) it is still connected (user 2026-10-27: it showed 未連線 during queries).
    const running = await env.DB.prepare("SELECT 1 AS running FROM erp_item_queries WHERE status='RUNNING' AND started_at>?1 LIMIT 1")
      .bind(new Date(Date.now() - 10 * 60000).toISOString()).first();
    return success({
      online: !!running || (!!lastSeenAt && Date.now() - Date.parse(lastSeenAt) < 15000 && Date.now() >= Date.parse(lastSeenAt)),
      lastSeenAt, agentVersion: heartbeat?.agent_version ?? null, erpState: heartbeat?.erp_state ?? null,
      control: await readControl(env.DB),
    }, requestId);
  }
  // CLOSE: the Agent closes ERP once its queue is done; minutes>0 also holds new queries until then.
  // FORCE_CLOSE: after a failed query, the Agent ends the ERP processes. RESUME: lifts a hold.
  if (pathname === "/api/erp/agent-control" && request.method === "POST") {
    const member = await allowedAny(env.DB, principal, ERP_QUERY_MODULES);
    if (!member) return denied(requestId);
    const body = await readJsonObject(request, 512);
    const action = body.action;
    const now = new Date().toISOString();
    let statement: D1PreparedStatement;
    // Queries waiting for the pause follow it: a new end moves them, no pause releases them.
    const moveWaiting = (holdUntil: string | null) => env.DB.prepare(
      `UPDATE erp_item_queries SET not_before=?1, expires_at=CASE WHEN ?1 IS NULL THEN expires_at ELSE ?2 END
        WHERE status='QUEUED' AND not_before IS NOT NULL`
    ).bind(holdUntil, holdUntil ? new Date(Date.parse(holdUntil) + QUEUE_WAIT_MAX_MS).toISOString() : null);
    const extra: D1PreparedStatement[] = [];
    if (action === "CLOSE") {
      let holdUntil: string | null;
      if (body.until !== undefined) {
        const until = typeof body.until === "string" ? Date.parse(body.until) : NaN;
        if (!Number.isFinite(until) || until <= Date.now() + 60000 || until > Date.now() + CONTROL_HOLD_MAX_MS)
          return bad("INVALID_CONTROL", "關閉到的時間須在 1 分鐘後、24 小時內");
        holdUntil = new Date(until).toISOString();
      } else {
        const minutes = body.minutes ?? 0;
        if (typeof minutes !== "number" || !CONTROL_HOLD_MINUTES.has(minutes)) return bad("INVALID_CONTROL", "暫停時間只能是 0、15、30 或 60 分鐘");
        holdUntil = minutes ? new Date(Date.now() + minutes * 60000).toISOString() : null;
      }
      statement = env.DB.prepare(`INSERT INTO erp_item_agent_control(id,request,requested_at,requested_by,hold_until,result,result_at) VALUES(1,'CLOSE',?1,?2,?3,NULL,NULL)
        ON CONFLICT(id) DO UPDATE SET request='CLOSE',requested_at=?1,requested_by=?2,hold_until=?3,result=NULL,result_at=NULL`).bind(now, member.id, holdUntil);
      extra.push(moveWaiting(holdUntil));
    } else if (action === "FORCE_CLOSE") {
      statement = env.DB.prepare(`INSERT INTO erp_item_agent_control(id,request,requested_at,requested_by,result,result_at) VALUES(1,'FORCE_CLOSE',?1,?2,NULL,NULL)
        ON CONFLICT(id) DO UPDATE SET request='FORCE_CLOSE',requested_at=?1,requested_by=?2,result=NULL,result_at=NULL`).bind(now, member.id);
    } else if (action === "RESUME") {
      statement = env.DB.prepare("UPDATE erp_item_agent_control SET hold_until=NULL WHERE id=1");
      extra.push(moveWaiting(null));
    } else return bad("INVALID_CONTROL", "不支援的 ERP 控制動作");
    await env.DB.batch([statement, ...extra, new AuditService(env.DB).prepareRecord({
      entityType: "erp_agent_control", entityKey: "1", action: "erp_agent_control." + String(action).toLowerCase(),
      actorEmployeeId: member.id, requestId,
      metadata: { minutes: action === "CLOSE" && body.until === undefined ? body.minutes ?? 0 : null, until: action === "CLOSE" ? body.until ?? null : null },
    })]);
    return success(await readControl(env.DB), requestId);
  }
  if (pathname === "/api/erp/item-queries" && request.method === "POST") {
    const body = await readJsonObject(request, 2048);
    // afterHold: sent while ERP is paused, the query waits for the pause to end (user 2026-10-28).
    const afterHold = body.afterHold === true;
    delete body.afterHold;
    const queryType = (body.queryType ?? "ITEM_NO") as ErpQueryType;
    if (!ERP_QUERY_TYPES.includes(queryType))
      return failure({code:"INVALID_QUERY_TYPE",message:"查詢類型不正確"},requestId,400);
    const member = await allowedAny(env.DB, principal, MODULES_FOR_TYPE[queryType]);
    if (!member) return denied(requestId, queryType);
    const job = parseRequest(queryType, body);
    const { holdUntil } = await readControl(env.DB);
    if (holdUntil && !afterHold) return failure({ code: "ERP_HELD", message: `ERP 已暫停，${taipeiTime(holdUntil)} 後可再查詢` }, requestId, 409);
    const notBefore = holdUntil;
    const includeCost = queryType === "ITEM_NO" && !!await allowed(env.DB, principal, "ERP_ITEM_COST");
    const active = await env.DB.prepare("SELECT COUNT(*) AS n FROM erp_item_queries WHERE owner_member_id=?1 AND status IN ('QUEUED','RUNNING')")
      .bind(member.id).first<{ n: number }>();
    if ((active?.n ?? 0) >= MAX_ACTIVE_PER_MEMBER)
      return failure({ code: "QUERY_ALREADY_ACTIVE", message: `你已有 ${MAX_ACTIVE_PER_MEMBER} 筆查詢在排隊或執行中，請等其中一筆完成後再查` }, requestId, 409);
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date((notBefore ? Date.parse(notBefore) : Date.now()) + QUEUE_WAIT_MAX_MS).toISOString();
    const historyRequest = queryType === "ITEM_NO"
      ? { includeHistory: job.includeHistory, historyFrom: job.from, historyTo: job.to }
      : { includeHistory: false, historyFrom: null, historyTo: null };
    const created = {
      id, queryType, itemNo: queryType === "ITEM_NO" ? job.itemNo : null, keyword: job.keyword,
      code: job.targetCode, scope: job.scope,
      dateFrom: DATED_TYPES.has(queryType) ? job.from : null, dateTo: DATED_TYPES.has(queryType) ? job.to : null,
      status: "QUEUED" as const, createdAt, notBefore, ...historyRequest,
    };
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO erp_item_queries(id,owner_member_id,item_no,status,created_at,expires_at,include_history,history_from,history_to,
          query_type,keyword,target_code,receivable_scope,include_cost,not_before) VALUES(?1,?2,?3,'QUEUED',?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)`)
        .bind(id, member.id, job.itemNo, createdAt, expiresAt, job.includeHistory ? 1 : 0, job.from, job.to,
          queryType, job.keyword, job.targetCode, job.scope, includeCost ? 1 : 0, notBefore),
      new AuditService(env.DB).prepareRecord({
        entityType: "erp_item_query", entityKey: id, action: "erp_item_query.created",
        actorEmployeeId: member.id, requestId, statusTo: "QUEUED",
        metadata: { queryType, itemNo: created.itemNo, keyword: job.keyword, code: job.targetCode, scope: job.scope,
          dateFrom: created.dateFrom, dateTo: created.dateTo, includeCost, ...historyRequest },
      }),
    ]);
    return success(created, requestId, { status: 202 });
  }
  // The member's queries of the last 24 hours, newest first (user 2026-10-27: the ERP pages show
  // a member's running or just-finished query again, on any device). Only types the member may
  // still query; the job itself is then loaded by id as usual.
  if (pathname === "/api/erp/item-queries/recent" && request.method === "GET") {
    const member = await resolveAppMember(env.DB, principal);
    const rows = await env.DB.prepare(
      "SELECT id,query_type,status,created_at FROM erp_item_queries WHERE owner_member_id=?1 AND created_at>?2 ORDER BY created_at DESC LIMIT 20"
    ).bind(member.id, new Date(Date.now() - 24 * 3600000).toISOString()).all<{ id: string; query_type: ErpQueryType; status: string; created_at: string }>();
    const recent = [];
    for (const row of rows.results ?? [])
      if (await allowedAny(env.DB, principal, MODULES_FOR_TYPE[row.query_type]))
        recent.push({ id: row.id, queryType: row.query_type, status: row.status, createdAt: row.created_at });
    return success(recent, requestId);
  }
  // The Agent's queue as every ERP member sees it (user 2026-10-27: who queries what, and about
  // when it is done, to the minute). What a query is for is shown to members who may run its type.
  if (pathname === "/api/erp/queue" && request.method === "GET") {
    const member = await allowedAny(env.DB, principal, ERP_QUERY_MODULES);
    if (!member) return denied(requestId);
    const rows = await env.DB.prepare(
      `SELECT q.id,q.owner_member_id,q.query_type,q.status,q.created_at,q.started_at,q.item_no,q.keyword,q.target_code,
              q.receivable_scope,q.include_history,q.history_from,q.history_to,q.progress_stage,q.progress_done,q.progress_total,q.not_before,
              m.display_name,m.employee_no
         FROM erp_item_queries q JOIN app_members m ON m.id=q.owner_member_id
        WHERE q.status IN ('QUEUED','RUNNING') ORDER BY q.status='QUEUED', ${QUEUE_ORDER}`
    ).all<QueueRow>();
    const took = await env.DB.prepare(
      `SELECT query_type,include_history,AVG((julianday(completed_at)-julianday(started_at))*86400) AS seconds
         FROM erp_item_queries WHERE status IN ('DONE','NOT_FOUND') AND started_at IS NOT NULL AND completed_at>?1
        GROUP BY query_type,include_history`
    ).bind(new Date(Date.now() - ISO_30_DAYS).toISOString()).all<{ query_type: ErpQueryType; include_history: number; seconds: number }>();
    const seconds = (row: QueueRow) => {
      const known = took.results?.find(t => t.query_type === row.query_type && t.include_history === row.include_history);
      return known?.seconds ?? DEFAULT_SECONDS[row.query_type] * (row.include_history ? 2 : 1);
    };
    const may = new Map<ErpQueryType, boolean>();
    let at = Date.now();
    const queue = [];
    for (const row of rows.results ?? []) {
      if (!may.has(row.query_type)) may.set(row.query_type, !!await allowedAny(env.DB, principal, MODULES_FOR_TYPE[row.query_type]));
      // A running query is done its usual time after it started (or soon, once past it); each one
      // queued after it takes its usual time.
      at = row.status === "RUNNING" && row.started_at
        ? Math.max(Date.parse(row.started_at) + seconds(row) * 1000, at + 30000)
        : Math.max(at, row.not_before ? Date.parse(row.not_before) : 0) + seconds(row) * 1000;
      queue.push({
        id: row.id, mine: row.owner_member_id === member.id,
        member: row.display_name || row.employee_no || `成員 ${row.owner_member_id}`,
        queryType: row.query_type, target: may.get(row.query_type) ? queueTarget(row) : null,
        status: row.status, createdAt: row.created_at, startedAt: row.started_at, notBefore: row.not_before,
        progress: row.progress_stage ? { stage: row.progress_stage, done: row.progress_done ?? 0, total: row.progress_total ?? 0 } : null,
        estimatedDoneAt: new Date(at).toISOString(),
      });
    }
    return success({ jobs: queue, maxPerMember: MAX_ACTIVE_PER_MEMBER }, requestId);
  }
  const match = /^\/api\/erp\/item-queries\/([0-9a-f-]{36})$/.exec(pathname);
  if (match && request.method === "GET") {
    const row = await env.DB.prepare("SELECT * FROM erp_item_queries WHERE id=?1").bind(match[1]).first<JobRow>();
    const member = await resolveAppMember(env.DB, principal);
    if (!row || (row.owner_member_id !== member.id && principal.workspaceRole !== "SUPER_ADMIN"))
      return failure({ code: "QUERY_NOT_FOUND", message: "查無此查詢工作" }, requestId, 404);
    // Results follow the reader's grants at this moment (a revoked grant hides them at once).
    if (!await allowedAny(env.DB, principal, MODULES_FOR_TYPE[row.query_type])) return denied(requestId, row.query_type);
    const showCost = row.query_type === "ITEM_NO" && !!await allowed(env.DB, principal, "ERP_ITEM_COST");
    return success(toJob(row, showCost), requestId);
  }
  return failure({ code: "METHOD_NOT_ALLOWED", message: "ERP 查詢路徑或方法不支援" }, requestId, 405);
}
async function credentialRoutes(request: Request, env: ErpBridgeEnv, requestId: string): Promise<Response> {
  const provider = identityClient(env);
  if (!provider) return failure({ code: "IDENTITY_UNAVAILABLE", message: "帳號服務暫時無法使用" }, requestId, 503);
  const gate = await requireIdentity(provider, request);
  if (!gate.ok) return failure({ code: gate.code, message: "需要有效登入" }, requestId, gate.status);
  if (gate.principal.workspaceRole !== "SUPER_ADMIN")
    return failure({ code: "ACCESS_DENIED", message: "只有超級管理員可管理連線憑證" }, requestId, 403);
  const row = await env.DB.prepare(
    "SELECT token_hash,created_at,revoked_at FROM erp_item_agent_credentials WHERE id=1"
  ).first<{ token_hash: string | null; created_at: string; revoked_at: string | null }>();
  if (request.method === "GET")
    return success({ configured: !!row?.token_hash, createdAt: row?.created_at ?? null, revokedAt: row?.revoked_at ?? null }, requestId);
  const actor = (await resolveAppMember(env.DB, gate.principal)).id;
  const now = new Date().toISOString();
  if (request.method === "POST") {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const hash = await digestToken(token);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO erp_item_agent_credentials(id,token_hash,created_at,revoked_at,updated_by) VALUES(1,?1,?2,NULL,?3) ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at,revoked_at=NULL,updated_by=excluded.updated_by"
      ).bind(hash, now, actor),
      env.DB.prepare("DELETE FROM erp_item_agent_status WHERE id=1"),
      new AuditService(env.DB).prepareRecord({
        entityType: "erp_item_agent", entityKey: "primary", action: "erp_item_agent.credential_rotated",
        actorEmployeeId: actor, requestId, metadata: { operation: row?.token_hash ? "rotated" : "created" },
      }),
    ]);
    // Cleartext token is returned ONLY in this response. Do not log or persist it.
    return success({ token, createdAt: now }, requestId);
  }
  if (request.method === "DELETE") {
    await env.DB.batch([
      env.DB.prepare("UPDATE erp_item_agent_credentials SET token_hash=NULL,revoked_at=?1,updated_by=?2 WHERE id=1").bind(now, actor),
      env.DB.prepare("DELETE FROM erp_item_agent_status WHERE id=1"),
      new AuditService(env.DB).prepareRecord({
        entityType: "erp_item_agent", entityKey: "primary", action: "erp_item_agent.credential_revoked",
        actorEmployeeId: actor, requestId,
      }),
    ]);
    return success({ configured: false, revokedAt: now }, requestId);
  }
  return failure({ code: "METHOD_NOT_ALLOWED", message: "不支援此操作" }, requestId, 405);
}
/** The query types the Agent runs, listed in every claim. */
function agentTypes(raw: unknown): ErpQueryType[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > ERP_QUERY_TYPES.length
    || raw.some(type => !ERP_QUERY_TYPES.includes(type as ErpQueryType)))
    return bad("INVALID_AGENT_REQUEST", "Agent 支援的查詢類型不正確");
  return [...new Set(raw as ErpQueryType[])];
}
type ClaimRow = {
  id: string; item_no: string; query_type: ErpQueryType; keyword: string | null; expires_at: string;
  include_history: number; history_from: string | null; history_to: string | null;
  target_code: string | null; receivable_scope: ErpReceivableScope | null; include_cost: number;
};
/** The claimed job as the Agent sees it: only what its query type needs. */
function claimedJob(job: ClaimRow) {
  const base = { id: job.id, queryType: job.query_type, expiresAt: job.expires_at };
  switch (job.query_type) {
    case "ITEM_NO": return { ...base, itemNo: job.item_no, includeHistory: job.include_history === 1,
      historyFrom: job.history_from, historyTo: job.history_to, includeCost: job.include_cost === 1 };
    case "ITEM_NAME": return { ...base, keyword: job.keyword, includeHistory: false, historyFrom: null, historyTo: null };
    case "CUSTOMER_NO": return { ...base, customerCode: job.target_code };
    case "CUSTOMER_NAME": return { ...base, keyword: job.keyword };
    case "SUPPLIER_NO": return { ...base, supplierCode: job.target_code };
    case "SUPPLIER_NAME": return { ...base, keyword: job.keyword };
    case "PURCHASES": return { ...base, supplierCode: job.target_code, dateFrom: job.history_from, dateTo: job.history_to };
    case "SALES": return { ...base, customerCode: job.target_code, dateFrom: job.history_from, dateTo: job.history_to };
    case "RECEIVABLE": return { ...base, scope: job.receivable_scope, code: job.target_code };
    case "ORDER": return { ...base, orderNo: job.target_code };
    case "RESTOCK": return { ...base, dateFrom: job.history_from, dateTo: job.history_to };
    case "STOCKTAKE_SYNC": { const v=JSON.parse(job.keyword??"{}") as {skipSheets:string[];onlySheet:string|null};
      return { ...base, skipSheets:v.skipSheets, onlySheet:v.onlySheet }; }
    case "STOCKTAKE_WRITE": { const v=JSON.parse(job.keyword??"{}") as {sheetNo:string;rows:unknown[]};
      return { ...base, sheetNo:v.sheetNo, rows:v.rows }; }
  }
}
async function agentRoutes(request: Request, env: ErpBridgeEnv, requestId: string, pathname: string): Promise<Response> {
  const auth = await agentGuard(request, env, requestId);
  if (auth instanceof Response) return auth;
  await housekeeping(env.DB);
  if (pathname === "/api/erp-agent/item-queries/claim" && request.method === "POST") {
    const body = await readJsonObject(request, 2048);
    const agentVersion = limitedString(body.agentVersion, "程式版本", 40);
    const erpState = limitedString(body.erpState, "ERP 狀態", 40);
    const types = agentTypes(body.queryTypes);
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO erp_item_agent_status(id,last_seen_at,agent_version,erp_state) VALUES(1,?1,?2,?3)
       ON CONFLICT(id) DO UPDATE SET last_seen_at=excluded.last_seen_at,agent_version=excluded.agent_version,erp_state=excluded.erp_state
       WHERE erp_item_agent_status.last_seen_at<=?4 OR erp_item_agent_status.agent_version<>excluded.agent_version OR erp_item_agent_status.erp_state<>excluded.erp_state`
    ).bind(now, agentVersion, erpState, new Date(Date.now() - HEARTBEAT_WRITE_MS).toISOString()).run();
    const job = await env.DB.prepare(
      `UPDATE erp_item_queries
          SET status='RUNNING',started_at=?1,claim_hash=?2
        WHERE id=(SELECT q.id FROM erp_item_queries q WHERE q.status='QUEUED' AND q.expires_at>?1
                    AND (q.not_before IS NULL OR q.not_before<=?1)
                    AND q.query_type IN (SELECT value FROM json_each(?3)) ORDER BY ${QUEUE_ORDER} LIMIT 1)
          AND NOT EXISTS(SELECT 1 FROM erp_item_queries WHERE status='RUNNING')
        RETURNING id,item_no,query_type,keyword,expires_at,include_history,history_from,history_to,target_code,receivable_scope,include_cost`
    ).bind(now, auth.digest, JSON.stringify(types)).first<ClaimRow>();
    const control = await readControl(env.DB);
    return success({ job: job ? claimedJob(job) : null, control: { request: control.request, holdUntil: control.holdUntil } }, requestId);
  }
  // The Agent's outcome of a CLOSE／FORCE_CLOSE; a newer request made meanwhile stays pending.
  if (pathname === "/api/erp-agent/control" && request.method === "POST") {
    const body = await readJsonObject(request, 512);
    if (body.request !== "CLOSE" && body.request !== "FORCE_CLOSE") return bad("INVALID_CONTROL", "控制要求不正確");
    if (!["CLOSED", "KEPT_OPEN", "NOT_OPEN", "FAILED"].includes(String(body.result))) return bad("INVALID_CONTROL", "控制結果不正確");
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE erp_item_agent_control SET request=NULL,result=?1,result_at=?2 WHERE id=1 AND request=?3")
      .bind(body.result, now, body.request).run();
    return success(await readControl(env.DB), requestId);
  }
  // 進貨輔助 progress (user 2026-10-20): what the Agent has done so far, for the page while RUNNING.
  // A report older than the stored one (same stage, fewer done) is ignored.
  const progress = /^\/api\/erp-agent\/item-queries\/([0-9a-f-]{36})\/progress$/.exec(pathname);
  if (progress && request.method === "POST") {
    const body = await readJsonObject(request, 512);
    const stage = body.stage === "REPORT" || body.stage === "STOCK" ? body.stage : bad("INVALID_AGENT_RESULT", "進度階段不正確");
    const count = (value: unknown, what: string) =>
      Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 100000 ? value as number : bad("INVALID_AGENT_RESULT", what + "不正確");
    const done = count(body.done, "進度完成數"), total = count(body.total, "進度總數");
    if (done > total) bad("INVALID_AGENT_RESULT", "進度完成數大於總數");
    const updated = await env.DB.prepare(
      `UPDATE erp_item_queries SET progress_stage=?1,progress_done=?2,progress_total=?3
        WHERE id=?4 AND status='RUNNING' AND claim_hash=?5 AND query_type IN ('RESTOCK','STOCKTAKE_WRITE')
          AND NOT (progress_stage IS ?1 AND progress_done>?2)`
    ).bind(stage, done, total, progress[1], auth.digest).run();
    if (updated.meta.changes !== 1) {
      const row = await env.DB.prepare("SELECT status,claim_hash,query_type FROM erp_item_queries WHERE id=?1").bind(progress[1]).first<{ status: string; claim_hash: string | null; query_type: string }>();
      if (!row) return failure({ code: "QUERY_NOT_FOUND", message: "查無此查詢工作" }, requestId, 404);
      if (row.status !== "RUNNING" || row.claim_hash !== auth.digest || row.query_type !== "RESTOCK" && row.query_type !== "STOCKTAKE_WRITE")
        return failure({ code: "QUERY_NOT_RUNNING", message: "工作不在可回報狀態，或不是此 Agent 領取" }, requestId, 409);
    }
    return success({ id: progress[1] }, requestId);
  }
  const match = /^\/api\/erp-agent\/item-queries\/([0-9a-f-]{36})\/complete$/.exec(pathname);
  if (match && request.method === "POST") {
    const row = await env.DB.prepare("SELECT * FROM erp_item_queries WHERE id=?1").bind(match[1]).first<JobRow & { claim_hash: string | null }>();
    if (!row) return failure({ code: "QUERY_NOT_FOUND", message: "查無此查詢工作" }, requestId, 404);
    if (row.status !== "RUNNING" || row.claim_hash !== auth.digest)
      return failure({ code: "QUERY_NOT_RUNNING", message: "工作不在可回報狀態，或不是此 Agent 領取" }, requestId, 409);
    const limit = REPORT_TYPES.has(row.query_type) ? 900 * 1024
      : row.include_history || NAME_TYPES.has(row.query_type) ? 256 * 1024 : 96 * 1024;
    const body = await readJsonObject(request, limit);
    const stocktakeInput = row.query_type === "STOCKTAKE_SYNC" || row.query_type === "STOCKTAKE_WRITE"
      ? JSON.parse(row.keyword ?? "{}") as {skipSheets?:string[];onlySheet?:string|null;sheetNo?:string;rows?:StocktakeWriteRow[]} : null;
    const syncResult = row.query_type === "STOCKTAKE_SYNC"
      ? validateSyncResult(body,stocktakeInput?.skipSheets ?? [],stocktakeInput?.onlySheet ?? null):null;
    const writeResult = row.query_type === "STOCKTAKE_WRITE"
      ? validateWriteResult(body,row.target_code ?? "",stocktakeInput?.rows ?? []):null;
    const result = parseResult(body, row);
    const completedAt = new Date().toISOString();
    const statements = [
      env.DB.prepare(
        `UPDATE erp_item_queries SET status=?1,completed_at=?2,elapsed_ms=?3,
          fields_json=?4,warehouses_json=?5,batch_managed=?6,batches_json=?7,history_json=?8,items_json=?9,result_json=?10,error_code=?11,error_message=?12
        WHERE id=?13 AND status='RUNNING' AND claim_hash=?14`
      ).bind(result.status, completedAt, result.elapsedMs,
        result.fieldsJson, result.warehousesJson,result.batchManaged,result.batchesJson,result.historyJson,result.itemsJson,result.resultJson,
        result.errorCode, result.errorMessage, row.id, auth.digest),
      new AuditService(env.DB).prepareRecord({
        entityType: "erp_item_query", entityKey: row.id, action: "erp_item_query.completed",
        actorEmployeeId: row.owner_member_id, requestId, statusFrom: "RUNNING", statusTo: result.status,
        metadata: { queryType:row.query_type, itemNo:row.query_type === "ITEM_NO" ? row.item_no : null,
          keyword:row.keyword, code:row.target_code, scope:row.receivable_scope,
          resultCount:result.resultCount, truncated:result.truncated,
          outcome:result.status, elapsedMs:result.elapsedMs,
          includeHistory:row.include_history===1,historyFrom:row.history_from,historyTo:row.history_to },
      }, {
        sql: "EXISTS (SELECT 1 FROM erp_item_queries WHERE id=? AND status=? AND completed_at=?)",
        values: [row.id, result.status, completedAt],
      }),
    ];
    if(syncResult && result.status !== "FAILED")
      statements.push(...await syncStatements(env.DB,syncResult,stocktakeInput?.onlySheet ?? null,completedAt));
    if(writeResult)statements.push(...await writeResultStatements(env.DB,writeResult,row.id,completedAt));
    // 銷貨資料保存 (user 2026-10-21): a finished RESTOCK keeps the per-day sales for later analysis.
    if (row.query_type === "RESTOCK" && (result.status === "DONE" || result.status === "NOT_FOUND") && row.history_from && row.history_to) {
      const saved = parsedJson<{ restock?: ErpRestockItem[] }>(result.resultJson)?.restock ?? [];
      statements.push(...salesHistoryStatements(env.DB, { id: row.id, from: row.history_from, to: row.history_to },
        saved, result.truncated, result.status, completedAt));
    }
    const updates = await env.DB.batch(statements);
    if (updates[0].meta.changes !== 1)
      return failure({ code: "QUERY_NOT_RUNNING", message: "工作已結束" }, requestId, 409);
    return success({ id: row.id, status: result.status, completedAt }, requestId);
  }
  return failure({ code: "METHOD_NOT_ALLOWED", message: "ERP Agent 路徑或方法不支援" }, requestId, 405);
}
export async function handleErpItemQueryRoute(request: Request, env: ErpBridgeEnv, requestId: string): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  const isAgent = pathname.startsWith("/api/erp-agent/");
  const isCredentials = pathname === "/api/erp/agent-credentials";
  const isUser = pathname === "/api/erp/agent-status" || pathname === "/api/erp/agent-control" || pathname === "/api/erp/queue" || pathname.startsWith("/api/erp/item-queries") || isCredentials;
  if (!isAgent && !isUser) return null;
  try {
    return isCredentials ? await credentialRoutes(request, env, requestId)
      : isAgent ? await agentRoutes(request, env, requestId, pathname) : await userRoutes(request, env, requestId, pathname);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

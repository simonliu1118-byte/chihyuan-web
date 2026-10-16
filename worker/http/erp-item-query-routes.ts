import { ERP_ITEM_FIELDS, ERP_WAREHOUSE_FIELDS, ERP_BATCH_FIELDS, ERP_HISTORY_COLUMNS, ERP_SEARCH_FIELDS, type ErpQueryType, type ErpQueryHistory, type ErpField, type ErpQueryErrorCode, type ErpQueryResult } from "../../shared/erp-item-query";
import { AuditService } from "../audit/audit-service";
import { HistoryRangeError, resolveHistoryRange } from "../../shared/erp-query-history";
import { erpNameContains, parseErpNameKeyword } from "../../shared/erp-name-search";
import { resolveAppMember } from "../auth/app-access";
import { requireIdentity, requireModuleAccess, type ModuleGateSuccess } from "../auth/guard";
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
  error_code: ErpQueryErrorCode | null; error_message: string | null;
};
const ITEM_FIELD_SET = new Set<string>(ERP_ITEM_FIELDS);
const WAREHOUSE_FIELD_SET = new Set<string>(ERP_WAREHOUSE_FIELDS);
const BATCH_FIELD_SET = new Set<string>(ERP_BATCH_FIELDS);
const SEARCH_FIELD_SET = new Set<string>(ERP_SEARCH_FIELDS);
const ERROR_TEXT: Record<ErpQueryErrorCode, string> = {
  ERP_NOT_OPEN: "ERP 尚未開啟", ERP_BUSY: "ERP 正在忙碌",
  ERP_STATE: "ERP 畫面狀態不符", EXPORT_FAILED: "ERP 匯出失敗",
  CANCELLED: "查詢已取消", INTERNAL: "查詢程式發生錯誤",
  AGENT_TIMEOUT: "查詢程式逾時，請重新查詢",
};
const VALID_AGENT_ERRORS = new Set(Object.keys(ERROR_TEXT).filter(v => v !== "AGENT_TIMEOUT"));
const ISO_30_DAYS = 30 * 24 * 60 * 60 * 1000;
// The Agent claims every 2-3 s; the heartbeat row is rewritten at most every 10 s (or when
// version/ERP state change) so an idle Agent does not cost a D1 write per poll. 10 s keeps
// the 15 s online window satisfied.
const HEARTBEAT_WRITE_MS = 10000;

function bad(code: string, message: string, status = 400): never {
  throw new RequestInputError(code, message, status);
}
function toJob(row: JobRow): ErpQueryResult {
  const list = row.items_json ? JSON.parse(row.items_json) as {items:ErpField[][];total:number;truncated:boolean} : null;
  return {
    id: row.id, queryType:row.query_type, itemNo:row.query_type === "ITEM_NO" ? row.item_no : null,
    keyword:row.keyword, items:list?.items ?? [], total:list?.total ?? 0, truncated:list?.truncated ?? false,
    status: row.status, createdAt: row.created_at,
    startedAt: row.started_at, completedAt: row.completed_at, elapsedMs: row.elapsed_ms,
    fields: row.fields_json ? JSON.parse(row.fields_json) as ErpField[] : [],
    warehouses: row.warehouses_json ? JSON.parse(row.warehouses_json) as ErpField[][] : [],
    includeHistory: row.include_history === 1, historyFrom: row.history_from, historyTo: row.history_to,
    batchManaged: row.batch_managed == null ? null : row.batch_managed === 1,
    batches: row.batches_json ? JSON.parse(row.batches_json) as ErpField[][] : [],
    history: row.history_json ? JSON.parse(row.history_json) as ErpQueryHistory : null,
    errorCode: row.error_code, errorMessage: row.error_message,
    resultCleared: row.status === "DONE" && (row.query_type === "ITEM_NAME" ? row.items_json === null : row.fields_json === null),
  };
}
function parseItemNo(value: unknown): string {
  if (typeof value !== "string") return bad("INVALID_ITEM_NO", "品號必須是文字");
  const trimmed = value.trim();
  if (!trimmed || Array.from(trimmed).length > 40 || /\s|[\x00-\x1f\x7f]/u.test(trimmed))
    return bad("INVALID_ITEM_NO", "品號須為 1～40 字，不能含空白或控制字元");
  return trimmed;
}
function parseKeyword(value: unknown): string {
  const keyword = parseErpNameKeyword(value);
  if (!keyword) return bad("INVALID_KEYWORD", "品名關鍵字須為 1～40 字，不可含控制字元、單引號或萬用字元");
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
function parseNameSearch(body: Record<string, unknown>, job: JobRow) {
  if (body.keyword !== job.keyword)
    return bad("INVALID_AGENT_RESULT", "回報的品名關鍵字與查詢工作不同");
  if (body.fields != null && (!Array.isArray(body.fields) || body.fields.length !== 0)
    || body.warehouses != null && (!Array.isArray(body.warehouses) || body.warehouses.length !== 0)
    || body.batches != null && (!Array.isArray(body.batches) || body.batches.length !== 0)
    || body.history != null || body.batchManaged != null)
    return bad("INVALID_AGENT_RESULT", "品名查詢不得附帶品號詳細資料");
  if (!Array.isArray(body.items) || body.items.length > 500)
    return bad("INVALID_AGENT_RESULT", "品名查詢結果不可超過 500 列");
  const items = body.items.map((raw: unknown) => {
    const fields = parseFields(raw, SEARCH_FIELD_SET, ERP_SEARCH_FIELDS.length);
    if (!fields.find(field => field.name === "品號")?.value.trim())
      return bad("INVALID_AGENT_RESULT", "品名查詢每筆都必須有品號");
    const name = fields.find(field => field.name === "品名")?.value;
    if (!name || !erpNameContains(name, job.keyword ?? ""))
      return bad("INVALID_AGENT_RESULT", "品名查詢結果不符合關鍵字");
    return fields;
  });
  if (typeof body.total !== "number" || !Number.isSafeInteger(body.total) || body.total < items.length
    || typeof body.truncated !== "boolean")
    return bad("INVALID_AGENT_RESULT", "品名查詢總筆數或截斷狀態不正確");
  return { items, total: body.total, truncated: body.truncated };
}
function parseResult(body: Record<string, unknown>, job: JobRow) {
  if (!["FOUND", "NOT_FOUND", "FAILED"].includes(String(body.outcome)))
    return bad("INVALID_OUTCOME", "查詢結果狀態不正確");
  const outcome = body.outcome as "FOUND" | "NOT_FOUND" | "FAILED";
  const elapsedMs = body.elapsedMs;
  if (typeof elapsedMs !== "number" || !Number.isSafeInteger(elapsedMs) || elapsedMs < 0 || elapsedMs > 3600000)
    return bad("INVALID_AGENT_RESULT", "查詢耗時不正確");
  const search = job.query_type === "ITEM_NAME" && body.outcome !== "FAILED" ? parseNameSearch(body, job) : null;
  if (job.query_type === "ITEM_NO" && (body.items !== undefined || body.keyword !== undefined))
    return bad("INVALID_AGENT_RESULT", "品號查詢不得附帶品名清單");
  if (job.query_type === "ITEM_NAME" && body.outcome === "FAILED"
    && (body.items != null && (!Array.isArray(body.items) || body.items.length !== 0)))
    return bad("INVALID_AGENT_RESULT", "品名查詢失敗不得附帶清單");
  const fields = parseFields(body.fields ?? [], ITEM_FIELD_SET, ERP_ITEM_FIELDS.length);
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
  } else if (fields.length || warehouses.length || batches.length || body.history != null
    || search && (search.items.length !== 0 || search.total !== 0 || search.truncated)) {
    return bad("INVALID_AGENT_RESULT", "非成功結果不得附帶 ERP 欄位");
  }
  let errorCode: ErpQueryErrorCode | null = null;
  if (outcome === "FAILED") {
    if (typeof body.errorCode !== "string" || !VALID_AGENT_ERRORS.has(body.errorCode))
      return bad("INVALID_AGENT_RESULT", "查詢失敗代碼不正確");
    errorCode = body.errorCode as ErpQueryErrorCode;
  }
  if (body.agentVersion !== undefined) limitedString(body.agentVersion, "程式版本", 40);
  // Never persist arbitrary agent error strings: they may contain file paths or ERP secrets.
  return {
    status: outcome === "FOUND" ? "DONE" : outcome,
    fieldsJson: outcome === "FOUND" ? JSON.stringify(fields) : null,
    warehousesJson: outcome === "FOUND" ? JSON.stringify(warehouses) : null,
    batchManaged: outcome === "FOUND" ? (batchManaged == null ? null : batchManaged ? 1 : 0) : null,
    batchesJson: outcome === "FOUND" ? JSON.stringify(batches) : null,
    historyJson: outcome === "FOUND" && history ? JSON.stringify(history) : null,
    itemsJson: outcome === "FOUND" && search ? JSON.stringify(search) : null,
    resultCount: outcome === "FOUND" ? search?.total ?? 0 : 0,
    truncated: outcome === "FOUND" ? search?.truncated ?? false : false,
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
  const expired = await db.prepare(
    "UPDATE erp_item_queries SET status='EXPIRED', completed_at=?1 WHERE status='QUEUED' AND expires_at<=?1 RETURNING id,owner_member_id,item_no"
  ).bind(nowIso).all<{ id: string; owner_member_id: number; item_no: string }>();
  const timedOut = await db.prepare(
    "UPDATE erp_item_queries SET status='FAILED', completed_at=?1, error_code='AGENT_TIMEOUT', error_message=?2 WHERE status='RUNNING' AND ((include_history=0 AND started_at<=?3) OR (include_history=1 AND started_at<=?4)) RETURNING id,owner_member_id,item_no"
  ).bind(nowIso, ERROR_TEXT.AGENT_TIMEOUT, new Date(now.getTime() - 180000).toISOString(), new Date(now.getTime() - 300000).toISOString()).all<{ id: string; owner_member_id: number; item_no: string }>();
  const audit = new AuditService(db);
  for (const job of expired.results ?? []) {
    await audit.record({ entityType: "erp_item_query", entityKey: job.id, action: "erp_item_query.expired", actorEmployeeId: job.owner_member_id, statusFrom: "QUEUED", statusTo: "EXPIRED", metadata: { itemNo: job.item_no } });
  }
  for (const job of timedOut.results ?? []) {
    await audit.record({ entityType: "erp_item_query", entityKey: job.id, action: "erp_item_query.failed", actorEmployeeId: job.owner_member_id, statusFrom: "RUNNING", statusTo: "FAILED", metadata: { itemNo: job.item_no, outcome: "AGENT_TIMEOUT" } });
  }
  await db.prepare(
    "UPDATE erp_item_queries SET fields_json=NULL,warehouses_json=NULL,batches_json=NULL,history_json=NULL,items_json=NULL WHERE completed_at<?1 AND (fields_json IS NOT NULL OR warehouses_json IS NOT NULL OR batches_json IS NOT NULL OR history_json IS NOT NULL OR items_json IS NOT NULL)"
  ).bind(new Date(now.getTime() - 300000).toISOString()).run();
  await db.prepare("DELETE FROM erp_item_queries WHERE completed_at<?1")
    .bind(new Date(now.getTime() - ISO_30_DAYS).toISOString()).run();
}
type UserGate = { kind: "error"; response: Response } | { kind: "ok"; gate: ModuleGateSuccess };
async function userGuard(request: Request, env: ErpBridgeEnv, requestId: string): Promise<UserGate> {
  const provider = identityClient(env);
  if (!provider) return { kind: "error", response: failure({ code: "IDENTITY_UNAVAILABLE", message: "帳號服務暫時無法使用" }, requestId, 503) };
  const gate = await requireModuleAccess(provider, env.DB, request, "ERP_ITEM_QUERY");
  if (!gate.ok) return { kind: "error", response: failure({ code: gate.code, message: "登入或 ERP 品號查詢權限不足" }, requestId, gate.status) };
  return { kind: "ok", gate };
}
async function userRoutes(request: Request, env: ErpBridgeEnv, requestId: string, pathname: string): Promise<Response> {
  const guard = await userGuard(request, env, requestId);
  if (guard.kind === "error") return guard.response;
  const { gate } = guard;
  await housekeeping(env.DB);
  if (pathname === "/api/erp/agent-status" && request.method === "GET") {
    const heartbeat = await env.DB.prepare("SELECT last_seen_at,agent_version,erp_state FROM erp_item_agent_status WHERE id=1")
      .first<{ last_seen_at: string; agent_version: string; erp_state: string }>();
    const lastSeenAt = heartbeat?.last_seen_at ?? null;
    return success({
      online: !!lastSeenAt && Date.now() - Date.parse(lastSeenAt) < 15000 && Date.now() >= Date.parse(lastSeenAt),
      lastSeenAt, agentVersion: heartbeat?.agent_version ?? null, erpState: heartbeat?.erp_state ?? null,
    }, requestId);
  }
  if (pathname === "/api/erp/item-queries" && request.method === "POST") {
    const body = await readJsonObject(request, 2048);
    const queryType = body.queryType ?? "ITEM_NO";
    if (queryType !== "ITEM_NO" && queryType !== "ITEM_NAME")
      return failure({code:"INVALID_QUERY_TYPE",message:"查詢類型不正確"},requestId,400);
    const itemNo = queryType === "ITEM_NO" ? parseItemNo(body.itemNo) : null;
    const keyword = queryType === "ITEM_NAME" ? parseKeyword(body.keyword) : null;
    if (queryType === "ITEM_NAME" && (body.itemNo !== undefined || body.includeHistory === true
      || body.historyFrom != null || body.historyTo != null))
      return failure({code:"INVALID_KEYWORD",message:"品名查詢不能同時提供品號或歷史異動"},requestId,400);
    if (queryType === "ITEM_NO" && body.keyword !== undefined)
      return failure({code:"INVALID_QUERY_TYPE",message:"品號查詢不可指定關鍵字"},requestId,400);
    let historyRequest: ReturnType<typeof resolveHistoryRange> = {
      includeHistory:false, historyFrom:null, historyTo:null,
    };
    if (queryType === "ITEM_NO") {
      try {
        historyRequest = resolveHistoryRange(body);
      } catch (error) {
        if (error instanceof HistoryRangeError)
          return failure({code:"INVALID_HISTORY_RANGE",message:error.message},requestId,400);
        throw error;
      }
    }
    const active = await env.DB.prepare("SELECT 1 AS active FROM erp_item_queries WHERE owner_member_id=?1 AND status IN ('QUEUED','RUNNING') LIMIT 1")
      .bind(gate.member.id).first();
    if (active) return failure({ code: "QUERY_ALREADY_ACTIVE", message: "你已有正在排隊或查詢中的工作" }, requestId, 409);
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 120000).toISOString();
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO erp_item_queries(id,owner_member_id,item_no,status,created_at,expires_at,include_history,history_from,history_to,query_type,keyword) VALUES(?1,?2,?3,'QUEUED',?4,?5,?6,?7,?8,?9,?10)")
          .bind(id, gate.member.id, itemNo ?? "ITEM_NAME", createdAt, expiresAt,
            historyRequest.includeHistory ? 1 : 0, historyRequest.historyFrom, historyRequest.historyTo, queryType, keyword),
        new AuditService(env.DB).prepareRecord({
          entityType: "erp_item_query", entityKey: id, action: "erp_item_query.created",
          actorEmployeeId: gate.member.id, requestId, statusTo: "QUEUED", metadata: { queryType, itemNo, keyword, ...historyRequest },
        }),
      ]);
    } catch (error) {
      if (/UNIQUE constraint/i.test(String(error)))
        return failure({ code: "QUERY_ALREADY_ACTIVE", message: "你已有正在排隊或查詢中的工作" }, requestId, 409);
      throw error;
    }
    return success({ id, queryType, itemNo, keyword, status: "QUEUED", createdAt, ...historyRequest }, requestId, { status: 202 });
  }
  const match = /^\/api\/erp\/item-queries\/([0-9a-f-]{36})$/.exec(pathname);
  if (match && request.method === "GET") {
    const row = await env.DB.prepare("SELECT * FROM erp_item_queries WHERE id=?1").bind(match[1]).first<JobRow>();
    if (!row || (row.owner_member_id !== gate.member.id && gate.principal.workspaceRole !== "SUPER_ADMIN"))
      return failure({ code: "QUERY_NOT_FOUND", message: "查無此查詢工作" }, requestId, 404);
    return success(toJob(row), requestId);
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
async function agentRoutes(request: Request, env: ErpBridgeEnv, requestId: string, pathname: string): Promise<Response> {
  const auth = await agentGuard(request, env, requestId);
  if (auth instanceof Response) return auth;
  await housekeeping(env.DB);
  if (pathname === "/api/erp-agent/item-queries/claim" && request.method === "POST") {
    const body = await readJsonObject(request, 2048);
    const agentVersion = limitedString(body.agentVersion, "程式版本", 40);
    const erpState = limitedString(body.erpState, "ERP 狀態", 40);
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO erp_item_agent_status(id,last_seen_at,agent_version,erp_state) VALUES(1,?1,?2,?3)
       ON CONFLICT(id) DO UPDATE SET last_seen_at=excluded.last_seen_at,agent_version=excluded.agent_version,erp_state=excluded.erp_state
       WHERE erp_item_agent_status.last_seen_at<=?4 OR erp_item_agent_status.agent_version<>excluded.agent_version OR erp_item_agent_status.erp_state<>excluded.erp_state`
    ).bind(now, agentVersion, erpState, new Date(Date.now() - HEARTBEAT_WRITE_MS).toISOString()).run();
    const job = await env.DB.prepare(
      `UPDATE erp_item_queries
          SET status='RUNNING',started_at=?1,claim_hash=?2
        WHERE id=(SELECT id FROM erp_item_queries WHERE status='QUEUED' AND expires_at>?1 ORDER BY created_at,id LIMIT 1)
          AND NOT EXISTS(SELECT 1 FROM erp_item_queries WHERE status='RUNNING')
        RETURNING id,item_no,query_type,keyword,expires_at,include_history,history_from,history_to`
    ).bind(now, auth.digest).first<{ id: string; item_no: string; query_type:ErpQueryType; keyword:string|null; expires_at: string; include_history:number; history_from:string|null; history_to:string|null }>();
    return success({ job: job ? { id:job.id, queryType:job.query_type,
      ...(job.query_type === "ITEM_NAME" ? {keyword:job.keyword} : {itemNo:job.item_no}),
      expiresAt:job.expires_at, includeHistory:job.include_history===1, historyFrom:job.history_from, historyTo:job.history_to } : null }, requestId);
  }
  const match = /^\/api\/erp-agent\/item-queries\/([0-9a-f-]{36})\/complete$/.exec(pathname);
  if (match && request.method === "POST") {
    const row = await env.DB.prepare("SELECT * FROM erp_item_queries WHERE id=?1").bind(match[1]).first<JobRow & { claim_hash: string | null }>();
    if (!row) return failure({ code: "QUERY_NOT_FOUND", message: "查無此查詢工作" }, requestId, 404);
    if (row.status !== "RUNNING" || row.claim_hash !== auth.digest)
      return failure({ code: "QUERY_NOT_RUNNING", message: "工作不在可回報狀態，或不是此 Agent 領取" }, requestId, 409);
    const body = await readJsonObject(request, row.include_history || row.query_type === "ITEM_NAME" ? 256 * 1024 : 96 * 1024);
    const result = parseResult(body, row);
    const completedAt = new Date().toISOString();
    const statements = [
      env.DB.prepare(
        `UPDATE erp_item_queries SET status=?1,completed_at=?2,elapsed_ms=?3,
          fields_json=?4,warehouses_json=?5,batch_managed=?6,batches_json=?7,history_json=?8,items_json=?9,error_code=?10,error_message=?11
        WHERE id=?12 AND status='RUNNING' AND claim_hash=?13`
      ).bind(result.status, completedAt, result.elapsedMs,
        result.fieldsJson, result.warehousesJson,result.batchManaged,result.batchesJson,result.historyJson,result.itemsJson,result.errorCode,
        result.errorMessage, row.id, auth.digest),
      new AuditService(env.DB).prepareRecord({
        entityType: "erp_item_query", entityKey: row.id, action: "erp_item_query.completed",
        actorEmployeeId: row.owner_member_id, requestId, statusFrom: "RUNNING", statusTo: result.status,
        metadata: { queryType:row.query_type, itemNo:row.query_type === "ITEM_NO" ? row.item_no : null,
          keyword:row.keyword, resultCount:result.resultCount, truncated:result.truncated,
          outcome:result.status, elapsedMs:result.elapsedMs,
          includeHistory:row.include_history===1,historyFrom:row.history_from,historyTo:row.history_to },
      }, {
        sql: "EXISTS (SELECT 1 FROM erp_item_queries WHERE id=? AND status=? AND completed_at=?)",
        values: [row.id, result.status, completedAt],
      }),
    ];
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
  const isUser = pathname === "/api/erp/agent-status" || pathname.startsWith("/api/erp/item-queries") || isCredentials;
  if (!isAgent && !isUser) return null;
  try {
    return isCredentials ? await credentialRoutes(request, env, requestId)
      : isAgent ? await agentRoutes(request, env, requestId, pathname) : await userRoutes(request, env, requestId, pathname);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

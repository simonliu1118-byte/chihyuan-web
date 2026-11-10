import type {
  ContractorEntityType,
  ContractorSearchQuery,
} from "../../shared/contractor-outsourcing";
import type {
  SalesWorkOrderSearchQuery,
  SalesWorkOrderStatusCode,
} from "../../shared/sales-work-order";
import type {
  WorkLogSearchQuery,
  WorkLogStatisticsQuery,
  WorkLogStatusCode,
} from "../../shared/work-log";
import { requireModuleAccess, type ModuleGateSuccess } from "../auth/guard";
import { BomService, BomServiceError } from "../bom/bom-service";
import { ContractorService, ContractorServiceError } from "../contractor/contractor-service";
import { OutsourcingFlowService, OutsourcingFlowError } from "../outsourcing/flow-service";
import { BusinessLookupService } from "../reference/business-lookup-service";
import { SalesWorkOrderService, SalesWorkOrderServiceError } from "../sales-order/sales-order-service";
import { FieldValidationError } from "../validation/fields";
import { WorkLogService, WorkLogServiceError } from "../worklog/work-log-service";
import { identityClient, type IdentityRuntimeEnv } from "./auth-routes";
import { failure, success } from "./response";

type Phase2Module = "ORDERS" | "OUTSOURCING" | "WORKLOGS";
type Guarded = { gate: ModuleGateSuccess } | { response: Response };

const SALES_STATUSES = new Set<SalesWorkOrderStatusCode>([
  "created", "issued", "waiting_stock", "picked", "shipped", "voided",
]);
const WORKLOG_STATUSES = new Set<WorkLogStatusCode>(["created", "pending_review", "reviewed"]);
const CONTRACTOR_TYPES = new Set<ContractorEntityType>(["person", "organization"]);

function isGuardedResponse(value: Guarded): value is { response: Response } {
  return "response" in value;
}

async function requireBusinessModule(
  request: Request,
  env: IdentityRuntimeEnv,
  requestId: string,
  moduleCode: Phase2Module,
): Promise<Guarded> {
  const provider = identityClient(env);
  if (!provider) {
    return { response: failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider is unavailable" }, requestId, 503) };
  }
  const gate = await requireModuleAccess(provider, env.DB, request, moduleCode);
  if (!gate.ok) {
    const message = gate.code === "ACCESS_DENIED"
      ? "Module access denied"
      : gate.code === "IDENTITY_UNAVAILABLE"
        ? "Identity provider is unavailable"
        : "Authentication required";
    return { response: failure({ code: gate.code, message }, requestId, gate.status) };
  }
  return { gate };
}

function isWorkspaceAdmin(gate: ModuleGateSuccess): boolean {
  return gate.principal.workspaceRole === "ADMIN" || gate.principal.workspaceRole === "SUPER_ADMIN";
}

function actorRef(gate: ModuleGateSuccess) {
  return {
    appMemberId: gate.member.id,
    employeeNo: gate.member.employeeNo,
    displayName: gate.principal.displayName,
  };
}

function positiveInteger(value: string | null, field: string): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new FieldValidationError({ [field]: "必須是正整數" });
  return parsed;
}

function positiveIntegerList(value: string | null, field: string): readonly number[] {
  if (value == null || value.trim() === "") return [];
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 100) throw new FieldValidationError({ [field]: "最多 100 筆" });
  const values = parts.map((part) => Number(part));
  if (values.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new FieldValidationError({ [field]: "必須是逗號分隔的正整數" });
  }
  return [...new Set(values)];
}

function routeId(value: string, field: string): number {
  const parsed = positiveInteger(value, field);
  if (parsed == null) throw new FieldValidationError({ [field]: "必須是正整數" });
  return parsed;
}

function boundedLimit(value: string | null): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 100) {
    throw new FieldValidationError({ limit: "必須是 1～100 的整數" });
  }
  return parsed;
}

function booleanQuery(value: string | null, field: string): boolean | undefined {
  if (value == null || value === "") return undefined;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new FieldValidationError({ [field]: "必須是 true 或 false" });
}

function dateQuery(value: string | null, field: string): string | undefined {
  if (value == null || value === "") return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new FieldValidationError({ [field]: "日期格式必須為 YYYY-MM-DD" });
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new FieldValidationError({ [field]: "日期無效" });
  }
  return value;
}

function assertDateRange(from: string | undefined, to: string | undefined, toField: string): void {
  if (from && to && from > to) throw new FieldValidationError({ [toField]: "結束日期不可早於開始日期" });
}

async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new FieldValidationError({ _request: "Request body must be valid JSON" });
  }
}

function bodyObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FieldValidationError({ _request: "Request body must be a JSON object" });
  }
  return value as Record<string, unknown>;
}

function expectedRevision(value: unknown): number {
  const input = bodyObject(value);
  const revision = input.expectedRevision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision <= 0) {
    throw new FieldValidationError({ expectedRevision: "必須是正整數" });
  }
  return revision;
}

function opaqueReference(prefix: "WO" | "OUT" | "WL", date?: string): string {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();
  const datePart = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `-${date.replace(/-/g, "")}` : "";
  return `${prefix}${datePart}-${suffix}`;
}

function salesSearch(url: URL): SalesWorkOrderSearchQuery {
  const from = dateQuery(url.searchParams.get("orderDateFrom"), "orderDateFrom");
  const to = dateQuery(url.searchParams.get("orderDateTo"), "orderDateTo");
  assertDateRange(from, to, "orderDateTo");
  const statusRaw = url.searchParams.get("statusCode");
  let statusCode: SalesWorkOrderStatusCode | undefined;
  if (statusRaw) {
    if (!SALES_STATUSES.has(statusRaw as SalesWorkOrderStatusCode)) throw new FieldValidationError({ statusCode: "狀態無效" });
    statusCode = statusRaw as SalesWorkOrderStatusCode;
  }
  return {
    q: url.searchParams.get("q")?.trim() || undefined,
    statusCode,
    customerId: positiveInteger(url.searchParams.get("customerId"), "customerId"),
    operatorEmployeeId: positiveInteger(url.searchParams.get("operatorEmployeeId"), "operatorEmployeeId"),
    orderDateFrom: from,
    orderDateTo: to,
    limit: boundedLimit(url.searchParams.get("limit")),
    cursor: url.searchParams.get("cursor")?.trim() || undefined,
  };
}

function contractorSearch(url: URL): ContractorSearchQuery {
  const entityRaw = url.searchParams.get("entityType");
  let entityType: ContractorEntityType | undefined;
  if (entityRaw) {
    if (!CONTRACTOR_TYPES.has(entityRaw as ContractorEntityType)) throw new FieldValidationError({ entityType: "類型無效" });
    entityType = entityRaw as ContractorEntityType;
  }
  return {
    q: url.searchParams.get("q")?.trim() || undefined,
    isActive: booleanQuery(url.searchParams.get("isActive"), "isActive"),
    entityType,
    limit: boundedLimit(url.searchParams.get("limit")),
    cursor: url.searchParams.get("cursor")?.trim() || undefined,
  };
}

function bomSearch(url: URL) {
  return {
    q: url.searchParams.get("q")?.trim() || undefined,
    finishedItemId: positiveInteger(url.searchParams.get("finishedItemId"), "finishedItemId"),
    isActive: booleanQuery(url.searchParams.get("isActive"), "isActive"),
    limit: boundedLimit(url.searchParams.get("limit")),
    cursor: url.searchParams.get("cursor")?.trim() || undefined,
  };
}

function workLogSearch(url: URL): WorkLogSearchQuery {
  const from = dateQuery(url.searchParams.get("dateFrom"), "dateFrom");
  const to = dateQuery(url.searchParams.get("dateTo"), "dateTo");
  assertDateRange(from, to, "dateTo");
  const statusRaw = url.searchParams.get("statusCode");
  let statusCode: WorkLogStatusCode | undefined;
  if (statusRaw) {
    if (!WORKLOG_STATUSES.has(statusRaw as WorkLogStatusCode)) throw new FieldValidationError({ statusCode: "狀態無效" });
    statusCode = statusRaw as WorkLogStatusCode;
  }
  return {
    q: url.searchParams.get("q")?.trim() || undefined,
    employeeId: positiveInteger(url.searchParams.get("employeeId"), "employeeId"),
    statusCode,
    typeCode: url.searchParams.get("typeCode")?.trim() || undefined,
    dateFrom: from,
    dateTo: to,
    limit: boundedLimit(url.searchParams.get("limit")),
    cursor: url.searchParams.get("cursor")?.trim() || undefined,
  };
}

function workLogStatistics(url: URL): WorkLogStatisticsQuery {
  const from = dateQuery(url.searchParams.get("dateFrom"), "dateFrom");
  const to = dateQuery(url.searchParams.get("dateTo"), "dateTo");
  assertDateRange(from, to, "dateTo");
  return {
    employeeId: positiveInteger(url.searchParams.get("employeeId"), "employeeId"),
    dateFrom: from,
    dateTo: to,
  };
}

function knownFailure(error: unknown, requestId: string): Response | null {
  if (error instanceof FieldValidationError) {
    return failure({ code: "VALIDATION_ERROR", message: "Request validation failed", fields: error.fields }, requestId, 422);
  }
  if (
    error instanceof SalesWorkOrderServiceError
    || error instanceof ContractorServiceError
    || error instanceof BomServiceError
    || error instanceof OutsourcingFlowError
    || error instanceof WorkLogServiceError
  ) {
    return failure({ code: error.code, message: error.message }, requestId, error.status);
  }
  return null;
}

async function handleOrders(request: Request, env: IdentityRuntimeEnv, requestId: string, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/business/orders")) return null;
  const guarded = await requireBusinessModule(request, env, requestId, "ORDERS");
  if (isGuardedResponse(guarded)) return guarded.response;
  const admin = isWorkspaceAdmin(guarded.gate);
  const service = new SalesWorkOrderService(env.DB, {
    nextReference: async () => opaqueReference("WO"),
  });
  const lookups = new BusinessLookupService(env.DB);
  const context = {
    actorMemberId: guarded.gate.member.id,
    now: new Date().toISOString(),
    requestId,
    allowHardDelete: admin,
    allowShipmentReversal: admin,
  };

  if (request.method === "GET" && url.pathname === "/api/business/orders/lookups") {
    return success(await lookups.salesWorkOrderLookups(actorRef(guarded.gate), {
      customerId: positiveInteger(url.searchParams.get("customerId"), "customerId"),
      itemIds: positiveIntegerList(url.searchParams.get("itemIds"), "itemIds"),
      operatorId: positiveInteger(url.searchParams.get("operatorId"), "operatorId"),
      customerQuery: url.searchParams.get("customerQ")?.trim() ?? "",
      itemQuery: url.searchParams.get("itemQ")?.trim() ?? "",
      limit: boundedLimit(url.searchParams.get("limit")) ?? 100,
    }), requestId);
  }

  if (url.pathname === "/api/business/orders") {
    if (request.method === "GET") return success(await service.search(salesSearch(url)), requestId);
    if (request.method === "POST") return success(await service.create(await jsonBody(request), context), requestId, { status: 201 });
  }

  let match = /^\/api\/business\/orders\/(\d+)\/(erp|waiting-stock|picked|shipped|reverse-shipment|void)$/.exec(url.pathname);
  if (match && request.method === "POST") {
    const orderId = routeId(match[1], "orderId");
    const body = await jsonBody(request);
    if (match[2] === "erp") return success(await service.fillOrCorrectErp(orderId, body, context), requestId);
    if (match[2] === "waiting-stock") return success(await service.markWaitingStock(orderId, body, context), requestId);
    if (match[2] === "picked") return success(await service.markPicked(orderId, body, context), requestId);
    if (match[2] === "shipped") return success(await service.markShipped(orderId, body, context), requestId);
    if (match[2] === "reverse-shipment") return success(await service.reverseShipment(orderId, body, context), requestId);
    return success(await service.voidOrder(orderId, body, context), requestId);
  }

  match = /^\/api\/business\/orders\/(\d+)$/.exec(url.pathname);
  if (!match) return null;
  const orderId = routeId(match[1], "orderId");
  if (request.method === "GET") return success(await service.getDetail(orderId), requestId);
  if (request.method === "PATCH") return success(await service.updateDraft(orderId, await jsonBody(request), context), requestId);
  if (request.method === "DELETE") {
    await service.deleteDraft(orderId, await jsonBody(request), context);
    return success({ deleted: true, orderId }, requestId);
  }
  return null;
}

async function handleOutsourcing(request: Request, env: IdentityRuntimeEnv, requestId: string, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/business/outsourcing")) return null;
  const guarded = await requireBusinessModule(request, env, requestId, "OUTSOURCING");
  if (isGuardedResponse(guarded)) return guarded.response;
  const admin = isWorkspaceAdmin(guarded.gate);
  const mutation = { actorMemberId: guarded.gate.member.id, now: new Date().toISOString(), requestId };
  const contractorService = new ContractorService(env.DB);
  const bomService = new BomService(env.DB);
  const flow = new OutsourcingFlowService(env.DB);
  const lookups = new BusinessLookupService(env.DB);

  if (request.method === "GET" && url.pathname === "/api/business/outsourcing/lookups") {
    return success(await lookups.outsourcingLookups(actorRef(guarded.gate), {
      itemIds: positiveIntegerList(url.searchParams.get("itemIds"), "itemIds"),
      itemQuery: url.searchParams.get("itemQ")?.trim() ?? "",
      limit: boundedLimit(url.searchParams.get("limit")) ?? 100,
    }), requestId);
  }

  if (url.pathname === "/api/business/outsourcing/contractors") {
    if (request.method === "GET") return success(await contractorService.search(contractorSearch(url)), requestId);
    if (request.method === "POST") return success(await contractorService.create(await jsonBody(request), mutation), requestId, { status: 201 });
  }

  let match = /^\/api\/business\/outsourcing\/contractors\/(\d+)\/prices$/.exec(url.pathname);
  if (match && request.method === "PUT") {
    return success(await contractorService.setCurrentPrice(routeId(match[1], "contractorId"), await jsonBody(request), mutation), requestId);
  }

  match = /^\/api\/business\/outsourcing\/contractors\/(\d+)$/.exec(url.pathname);
  if (match) {
    const contractorId = routeId(match[1], "contractorId");
    if (request.method === "GET") return success(await contractorService.getDetail(contractorId), requestId);
    if (request.method === "PATCH") return success(await contractorService.update(contractorId, await jsonBody(request), mutation), requestId);
    if (request.method === "DELETE") {
      const body = await jsonBody(request);
      await contractorService.deleteNeverUsed(contractorId, expectedRevision(body), mutation, admin);
      return success({ deleted: true, contractorId }, requestId);
    }
  }

  if (url.pathname === "/api/business/outsourcing/boms") {
    if (request.method === "GET") return success(await bomService.search(bomSearch(url)), requestId);
    if (request.method === "POST") return success(await bomService.create(await jsonBody(request), mutation), requestId, { status: 201 });
  }

  match = /^\/api\/business\/outsourcing\/boms\/(\d+)$/.exec(url.pathname);
  if (match) {
    const bomId = routeId(match[1], "bomId");
    if (request.method === "GET") return success(await bomService.getDetail(bomId), requestId);
    if (request.method === "PATCH") return success(await bomService.update(bomId, await jsonBody(request), mutation), requestId);
  }

  if (url.pathname === "/api/business/outsourcing/stock") {
    const contractorId = positiveInteger(url.searchParams.get("contractorId"), "contractorId");
    if (request.method === "GET") return success(await flow.stock(contractorId, url.searchParams.get("showAll")==="true"), requestId);
    if (request.method === "POST") return success(await flow.adjustStock(await jsonBody(request), mutation), requestId);
  }
  if (url.pathname === "/api/business/outsourcing/stock/history" && request.method === "GET") {
    const contractorId = positiveInteger(url.searchParams.get("contractorId"), "contractorId");
    const where = contractorId ? "WHERE m.contractor_id=?" : "";
    const history = await env.DB.prepare(`SELECT m.*,c.display_name AS contractor_name,
      i.item_no,i.name AS item_name,
      SUM(m.quantity_delta) OVER(PARTITION BY m.contractor_id,m.item_id ORDER BY m.id ROWS UNBOUNDED PRECEDING) AS balance_after,
      COALESCE(issue_order.outsourcing_ref,receipt_order.outsourcing_ref,'') AS source_order_ref,
      COALESCE(member.display_name,member.employee_no,'') AS operator_name
      FROM contractor_stock_movements m
      JOIN contractors c ON c.id=m.contractor_id
      JOIN items i ON i.id=m.item_id
      LEFT JOIN app_members member ON member.id=m.operator_employee_id
      LEFT JOIN outsourcing_issues iss ON iss.id=m.issue_id
      LEFT JOIN outsourcing_orders issue_order ON issue_order.id=iss.outsourcing_order_id
      LEFT JOIN outsourcing_receipts rec ON rec.id=m.receipt_id
      LEFT JOIN outsourcing_orders receipt_order ON receipt_order.id=rec.outsourcing_order_id
      ${where} ORDER BY m.id DESC LIMIT 100`)
      .bind(...(contractorId?[contractorId]:[])).all();
    return success({items:history.results??[]}, requestId);
  }
  if (url.pathname === "/api/business/outsourcing/stock/groups" && request.method==="GET"){
    const contractorId=positiveInteger(url.searchParams.get("contractorId"),"contractorId");
    return success(await flow.groupedStock(contractorId,url.searchParams.get("showAll")==="true"),requestId);
  }
  let insightMatch=/^\/api\/business\/outsourcing\/orders\/(\d+)\/issue-suggestion$/.exec(url.pathname);
  if(insightMatch&&request.method==="GET")
    return success(await flow.recommendedIssue(routeId(insightMatch[1],"orderId")),requestId);
  insightMatch=/^\/api\/business\/outsourcing\/orders\/(\d+)\/consumption-preview$/.exec(url.pathname);
  if(insightMatch&&request.method==="POST")
    return success(await flow.previewConsumption(routeId(insightMatch[1],"orderId"),await jsonBody(request)),requestId);
  if (url.pathname === "/api/business/outsourcing/statements") {
    if (request.method === "GET") return success(await flow.listStatements(positiveInteger(url.searchParams.get("contractorId"), "contractorId")), requestId);
    if (request.method === "POST") return success(await flow.createStatement(await jsonBody(request),mutation),requestId,{status:201});
  }
  if (url.pathname === "/api/business/outsourcing/statements/unbilled" && request.method === "GET") {
    const contractorId = positiveInteger(url.searchParams.get("contractorId"),"contractorId");
    if(!contractorId)throw new FieldValidationError({contractorId:"必填"});
    return success({items:await flow.unbilledReceipts(contractorId,url.searchParams.get("month")??undefined)},requestId);
  }
  let statementMatch=/^\/api\/business\/outsourcing\/statements\/(\d+)\/(confirm|unconfirm|payments)$/.exec(url.pathname);
  if(statementMatch&&request.method==="POST") {
    const statementId=routeId(statementMatch[1],"statementId"),body=await jsonBody(request);
    if(statementMatch[2]==="confirm")return success(await flow.confirmStatement(statementId,body,mutation),requestId);
    if(statementMatch[2]==="unconfirm")return success(await flow.cancelStatementConfirmation(statementId,body,mutation),requestId);
    return success(await flow.addPayment(statementId,body,mutation),requestId);
  }
  statementMatch=/^\/api\/business\/outsourcing\/statements\/(\d+)\/payments\/(\d+)$/.exec(url.pathname);
  if(statementMatch&&request.method==="DELETE")
    return success(await flow.deletePayment(routeId(statementMatch[1],"statementId"),routeId(statementMatch[2],"paymentId"),await jsonBody(request),mutation),requestId);
  statementMatch=/^\/api\/business\/outsourcing\/statements\/(\d+)$/.exec(url.pathname);
  if(statementMatch){
    const statementId=routeId(statementMatch[1],"statementId");
    if(request.method==="GET")return success(await flow.statementDetail(statementId),requestId);
    if(request.method==="PATCH")return success(await flow.editStatement(statementId,await jsonBody(request),mutation),requestId);
    if(request.method==="DELETE")return success(await flow.removeDraftStatement(statementId,await jsonBody(request),mutation),requestId);
  }
  if (url.pathname === "/api/business/outsourcing/orders") {
    if (request.method === "GET") return success(await flow.listOrders({q:url.searchParams.get("q")??undefined,
      contractorId:positiveInteger(url.searchParams.get("contractorId"),"contractorId")}), requestId);
    if (request.method === "POST") return success(await flow.createOrder(await jsonBody(request),mutation), requestId,{status:201});
  }
  let orderMatch=/^\/api\/business\/outsourcing\/orders\/(\d+)\/(issues|receipts|close|reopen)$/.exec(url.pathname);
  if(orderMatch&&request.method==="POST"){
    const orderId=routeId(orderMatch[1],"orderId"),body=await jsonBody(request);
    if(orderMatch[2]==="issues")return success(await flow.issue(orderId,body,mutation),requestId);
    if(orderMatch[2]==="receipts")return success(await flow.receive(orderId,body,mutation),requestId);
    return success(await flow.setClosed(orderId,body,mutation,orderMatch[2]==="reopen"),requestId);
  }
  orderMatch=/^\/api\/business\/outsourcing\/orders\/(\d+)\/(issues|receipts)\/(\d+)\/cancel$/.exec(url.pathname);
  if(orderMatch&&request.method==="POST"){
    const orderId=routeId(orderMatch[1],"orderId"),entryId=routeId(orderMatch[3],"entryId"),body=await jsonBody(request);
    return success(orderMatch[2]==="issues"?await flow.cancelIssue(orderId,entryId,body,mutation):
      await flow.cancelReceipt(orderId,entryId,body,mutation),requestId);
  }
  orderMatch=/^\/api\/business\/outsourcing\/orders\/(\d+)$/.exec(url.pathname);
  if(orderMatch){
    const orderId=routeId(orderMatch[1],"orderId");
    if(request.method==="GET")return success(await flow.detail(orderId),requestId);
    if(request.method==="PATCH")return success(await flow.updatePending(orderId,await jsonBody(request),mutation),requestId);
    if(request.method==="DELETE")return success(await flow.deleteEmptyOrder(orderId,await jsonBody(request),mutation),requestId);
  }
  return null;
}

async function handleWorkLogs(request: Request, env: IdentityRuntimeEnv, requestId: string, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/business/worklogs")) return null;
  const guarded = await requireBusinessModule(request, env, requestId, "WORKLOGS");
  if (isGuardedResponse(guarded)) return guarded.response;
  const admin = isWorkspaceAdmin(guarded.gate);
  const service = new WorkLogService(env.DB, {
    nextReference: async (logDate: string) => opaqueReference("WL", logDate),
  });
  const access = {
    actorMemberId: guarded.gate.member.id,
    allowCrossEmployeeRead: admin,
  };
  const context = {
    actorMemberId: guarded.gate.member.id,
    now: new Date().toISOString(),
    requestId,
    allowReview: admin,
    allowAdministrativeDelete: admin,
    allowCrossEmployeeRead: admin,
  };

  if (url.pathname === "/api/business/worklogs/configuration" && request.method === "GET") {
    const includeInactive = booleanQuery(url.searchParams.get("includeInactive"), "includeInactive") ?? false;
    return success(await service.configuration(includeInactive, admin), requestId);
  }
  if (url.pathname === "/api/business/worklogs/statistics" && request.method === "GET") {
    return success(await service.statistics(workLogStatistics(url), access), requestId);
  }
  if (url.pathname === "/api/business/worklogs") {
    if (request.method === "GET") return success(await service.search(workLogSearch(url), access), requestId);
    if (request.method === "POST") return success(await service.create(await jsonBody(request), context), requestId, { status: 201 });
  }

  let match = /^\/api\/business\/worklogs\/(\d+)\/(submit|withdraw|review|cancel-review)$/.exec(url.pathname);
  if (match && request.method === "POST") {
    const workLogId = routeId(match[1], "workLogId");
    const body = await jsonBody(request);
    if (match[2] === "submit") return success(await service.submitForReview(workLogId, body, context), requestId);
    if (match[2] === "withdraw") return success(await service.withdrawReview(workLogId, body, context), requestId);
    if (match[2] === "review") return success(await service.review(workLogId, body, context), requestId);
    return success(await service.cancelReview(workLogId, body, context), requestId);
  }

  match = /^\/api\/business\/worklogs\/(\d+)$/.exec(url.pathname);
  if (!match) return null;
  const workLogId = routeId(match[1], "workLogId");
  if (request.method === "GET") return success(await service.getDetail(workLogId, access), requestId);
  if (request.method === "PATCH") return success(await service.updateCreated(workLogId, await jsonBody(request), context), requestId);
  if (request.method === "DELETE") {
    const body = await jsonBody(request);
    await service.deleteCreated(workLogId, expectedRevision(body), context);
    return success({ deleted: true, workLogId }, requestId);
  }
  return null;
}

export async function handleBusinessApiPhase2Route(
  request: Request,
  env: IdentityRuntimeEnv,
  requestId: string,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/business/")) return null;
  try {
    return await handleOrders(request, env, requestId, url)
      ?? await handleOutsourcing(request, env, requestId, url)
      ?? await handleWorkLogs(request, env, requestId, url);
  } catch (error) {
    const known = knownFailure(error, requestId);
    if (known) return known;
    throw error;
  }
}

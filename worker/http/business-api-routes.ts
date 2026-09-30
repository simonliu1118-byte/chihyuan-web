import type { CustomerSearchQuery } from "../../shared/customer";
import type { DefectSearchQuery, DefectStatusCode } from "../../shared/defect";
import type { ItemSearchQuery } from "../../shared/item";
import { requireModuleAccess, type ModuleGateSuccess } from "../auth/guard";
import { CustomerService, CustomerServiceError } from "../customer/customer-service";
import { CustomerRelatedService, CustomerRelatedServiceError } from "../customer/customer-related-service";
import { DefectService, DefectServiceError } from "../defect/defect-service";
import { ItemService, ItemServiceError } from "../item/item-service";
import { BusinessLookupService } from "../reference/business-lookup-service";
import { FieldValidationError } from "../validation/fields";
import { identityClient, type IdentityRuntimeEnv } from "./auth-routes";
import { failure, success } from "./response";

type BusinessModule = "CUSTOMERS" | "ITEMS" | "DEFECTS";

type Guarded = { gate: ModuleGateSuccess } | { response: Response };

function isGuardedResponse(value: Guarded): value is { response: Response } {
  return "response" in value;
}

async function requireBusinessModule(
  request: Request,
  env: IdentityRuntimeEnv,
  requestId: string,
  moduleCode: BusinessModule,
): Promise<Guarded> {
  const provider = identityClient(env);
  if (!provider) {
    return {
      response: failure(
        { code: "IDENTITY_UNAVAILABLE", message: "Identity provider is unavailable" },
        requestId,
        503,
      ),
    };
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

function positiveInteger(value: string | null, field: string): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new FieldValidationError({ [field]: "必須是正整數" });
  }
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new FieldValidationError({ [field]: "日期格式必須為 YYYY-MM-DD" });
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new FieldValidationError({ [field]: "日期無效" });
  }
  return value;
}

function customerSearch(url: URL): CustomerSearchQuery {
  return {
    q: url.searchParams.get("q")?.trim() || undefined,
    customerCategoryId: positiveInteger(url.searchParams.get("customerCategoryId"), "customerCategoryId"),
    customerStatusId: positiveInteger(url.searchParams.get("customerStatusId"), "customerStatusId"),
    regionId: positiveInteger(url.searchParams.get("regionId"), "regionId"),
    ownerDepartmentId: positiveInteger(url.searchParams.get("ownerDepartmentId"), "ownerDepartmentId"),
    ownerEmployeeId: positiveInteger(url.searchParams.get("ownerEmployeeId"), "ownerEmployeeId"),
    limit: boundedLimit(url.searchParams.get("limit")),
    cursor: url.searchParams.get("cursor")?.trim() || undefined,
  };
}

function itemSearch(url: URL): ItemSearchQuery {
  return {
    q: url.searchParams.get("q")?.trim() || undefined,
    itemCategoryId: positiveInteger(url.searchParams.get("itemCategoryId"), "itemCategoryId"),
    isActive: booleanQuery(url.searchParams.get("isActive"), "isActive"),
    limit: boundedLimit(url.searchParams.get("limit")),
    cursor: url.searchParams.get("cursor")?.trim() || undefined,
  };
}

function defectStatus(value: string | null): DefectStatusCode | undefined {
  if (value == null || value === "") return undefined;
  if (value === "created" || value === "processing" || value === "resolved") return value;
  throw new FieldValidationError({ statusCode: "瑕疵狀態無效" });
}

function defectSearch(url: URL): DefectSearchQuery {
  const reportedFrom = dateQuery(url.searchParams.get("reportedFrom"), "reportedFrom");
  const reportedTo = dateQuery(url.searchParams.get("reportedTo"), "reportedTo");
  if (reportedFrom && reportedTo && reportedFrom > reportedTo) {
    throw new FieldValidationError({ reportedTo: "結束日期不可早於開始日期" });
  }
  return {
    q: url.searchParams.get("q")?.trim() || undefined,
    customerId: positiveInteger(url.searchParams.get("customerId"), "customerId"),
    itemId: positiveInteger(url.searchParams.get("itemId"), "itemId"),
    ownerEmployeeId: positiveInteger(url.searchParams.get("ownerEmployeeId"), "ownerEmployeeId"),
    statusCode: defectStatus(url.searchParams.get("statusCode")),
    includeInvalid: booleanQuery(url.searchParams.get("includeInvalid"), "includeInvalid"),
    reportedFrom,
    reportedTo,
    limit: boundedLimit(url.searchParams.get("limit")),
    cursor: url.searchParams.get("cursor")?.trim() || undefined,
  };
}

function routeId(value: string, field: string): number {
  const parsed = positiveInteger(value, field);
  if (parsed == null) throw new FieldValidationError({ [field]: "必須是正整數" });
  return parsed;
}

async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new FieldValidationError({ _request: "Request body must be valid JSON" });
  }
}

function isWorkspaceAdmin(role: ModuleGateSuccess["principal"]["workspaceRole"]): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

function actorRef(gate: ModuleGateSuccess) {
  return {
    appMemberId: gate.member.id,
    employeeNo: gate.member.employeeNo,
    displayName: gate.principal.displayName,
  };
}

function knownBusinessFailure(error: unknown, requestId: string): Response | null {
  if (error instanceof FieldValidationError) {
    return failure(
      { code: "VALIDATION_ERROR", message: "Request validation failed", fields: error.fields },
      requestId,
      422,
    );
  }
  if (
    error instanceof CustomerServiceError
    || error instanceof CustomerRelatedServiceError
    || error instanceof ItemServiceError
    || error instanceof DefectServiceError
  ) {
    return failure({ code: error.code, message: error.message }, requestId, error.status);
  }
  return null;
}

async function handleCustomers(
  request: Request,
  env: IdentityRuntimeEnv,
  requestId: string,
  url: URL,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/business/customers")) return null;
  const guarded = await requireBusinessModule(request, env, requestId, "CUSTOMERS");
  if (isGuardedResponse(guarded)) return guarded.response;
  const service = new CustomerService(env.DB);
  const related = new CustomerRelatedService(env.DB);
  const lookups = new BusinessLookupService(env.DB);
  const context = {
    actorMemberId: guarded.gate.member.id,
    now: new Date().toISOString(),
    requestId,
  };

  if (request.method === "GET" && url.pathname === "/api/business/customers/lookups") {
    return success(await lookups.customerLookups(actorRef(guarded.gate)), requestId);
  }

  if (request.method === "GET" && url.pathname === "/api/business/customers/item-options") {
    const q = url.searchParams.get("q")?.trim() ?? "";
    const limit = boundedLimit(url.searchParams.get("limit")) ?? 50;
    return success(await lookups.customerItemOptions(q, limit), requestId);
  }

  if (request.method === "GET" && url.pathname === "/api/business/customers/tax-id-check") {
    const taxId = url.searchParams.get("taxId");
    const exclude = positiveInteger(url.searchParams.get("excludeCustomerId"), "excludeCustomerId") ?? null;
    return success(await service.checkTaxId(taxId, exclude), requestId);
  }

  if (url.pathname === "/api/business/customers") {
    if (request.method === "GET") return success(await service.search(customerSearch(url)), requestId);
    if (request.method === "POST") return success(await service.create(await jsonBody(request), context), requestId, { status: 201 });
  }

  let match = /^\/api\/business\/customers\/(\d+)\/visits$/.exec(url.pathname);
  if (match) {
    const customerId = routeId(match[1], "customerId");
    if (request.method === "GET") {
      return success(await related.listVisits(customerId, {
        limit: boundedLimit(url.searchParams.get("limit")),
        cursor: url.searchParams.get("cursor")?.trim() || undefined,
      }), requestId);
    }
    if (request.method === "POST") {
      return success(await related.createVisit(customerId, await jsonBody(request), context), requestId, { status: 201 });
    }
  }

  match = /^\/api\/business\/customers\/(\d+)\/visits\/(\d+)$/.exec(url.pathname);
  if (match) {
    const customerId = routeId(match[1], "customerId");
    const visitId = routeId(match[2], "visitId");
    if (request.method === "PATCH") {
      return success(await related.updateVisit(customerId, visitId, await jsonBody(request), context), requestId);
    }
    if (request.method === "DELETE") {
      await related.deleteVisit(customerId, visitId, await jsonBody(request), context);
      return success({ deleted: true, customerId, visitId }, requestId);
    }
  }

  match = /^\/api\/business\/customers\/(\d+)\/frequent-items$/.exec(url.pathname);
  if (match) {
    const customerId = routeId(match[1], "customerId");
    if (request.method === "GET") {
      const limit = boundedLimit(url.searchParams.get("limit")) ?? 100;
      return success({ items: await related.listFrequentItems(customerId, limit) }, requestId);
    }
    if (request.method === "POST") {
      const frequentItemId = await related.createFrequentItem(customerId, await jsonBody(request), context);
      return success({ customerId, frequentItemId }, requestId, { status: 201 });
    }
  }

  match = /^\/api\/business\/customers\/(\d+)\/frequent-items\/(\d+)$/.exec(url.pathname);
  if (match) {
    const customerId = routeId(match[1], "customerId");
    const frequentItemId = routeId(match[2], "frequentItemId");
    if (request.method === "PATCH") {
      await related.updateFrequentItem(customerId, frequentItemId, await jsonBody(request), context);
      return success({ updated: true, customerId, frequentItemId }, requestId);
    }
    if (request.method === "DELETE") {
      await related.deleteFrequentItem(customerId, frequentItemId, await jsonBody(request));
      return success({ deleted: true, customerId, frequentItemId }, requestId);
    }
  }

  match = /^\/api\/business\/customers\/(\d+)\/quotes$/.exec(url.pathname);
  if (match) {
    const customerId = routeId(match[1], "customerId");
    if (request.method === "GET") {
      return success(await related.listQuotes(customerId, {
        limit: boundedLimit(url.searchParams.get("limit")),
        cursor: url.searchParams.get("cursor")?.trim() || undefined,
      }), requestId);
    }
    if (request.method === "POST") {
      return success(await related.createQuote(customerId, await jsonBody(request), context), requestId, { status: 201 });
    }
  }

  match = /^\/api\/business\/customers\/(\d+)\/quotes\/(\d+)\/correct$/.exec(url.pathname);
  if (match && request.method === "POST") {
    const customerId = routeId(match[1], "customerId");
    const quoteId = routeId(match[2], "quoteId");
    return success(await related.correctQuote(customerId, quoteId, await jsonBody(request), context), requestId);
  }

  match = /^\/api\/business\/customers\/(\d+)\/quotes\/(\d+)$/.exec(url.pathname);
  if (match && request.method === "GET") {
    const customerId = routeId(match[1], "customerId");
    const quoteId = routeId(match[2], "quoteId");
    return success(await related.getQuoteDetail(customerId, quoteId), requestId);
  }

  match = /^\/api\/business\/customers\/(\d+)\/number$/.exec(url.pathname);
  if (match && request.method === "POST") {
    const customerId = routeId(match[1], "customerId");
    return success(await service.changeCustomerNumber(customerId, await jsonBody(request), context), requestId);
  }

  match = /^\/api\/business\/customers\/(\d+)$/.exec(url.pathname);
  if (!match) return null;
  const customerId = routeId(match[1], "customerId");
  if (request.method === "GET") return success(await service.getDetail(customerId), requestId);
  if (request.method === "PATCH") return success(await service.update(customerId, await jsonBody(request), context), requestId);
  return null;
}

async function handleItems(
  request: Request,
  env: IdentityRuntimeEnv,
  requestId: string,
  url: URL,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/business/items")) return null;
  const guarded = await requireBusinessModule(request, env, requestId, "ITEMS");
  if (isGuardedResponse(guarded)) return guarded.response;
  const service = new ItemService(env.DB);
  const lookups = new BusinessLookupService(env.DB);
  const context = {
    actorMemberId: guarded.gate.member.id,
    now: new Date().toISOString(),
    requestId,
  };

  if (request.method === "GET" && url.pathname === "/api/business/items/lookups") {
    return success(await lookups.itemLookups(actorRef(guarded.gate)), requestId);
  }

  if (url.pathname === "/api/business/items") {
    if (request.method === "GET") return success(await service.search(itemSearch(url)), requestId);
    if (request.method === "POST") return success(await service.create(await jsonBody(request), context), requestId, { status: 201 });
  }

  let match = /^\/api\/business\/items\/(\d+)\/number-history$/.exec(url.pathname);
  if (match && request.method === "GET") {
    const itemId = routeId(match[1], "itemId");
    const limit = boundedLimit(url.searchParams.get("limit")) ?? 50;
    return success(await service.listNumberHistory(itemId, limit), requestId);
  }

  match = /^\/api\/business\/items\/(\d+)\/number$/.exec(url.pathname);
  if (match && request.method === "POST") {
    const itemId = routeId(match[1], "itemId");
    return success(await service.changeItemNumber(itemId, await jsonBody(request), context), requestId);
  }

  match = /^\/api\/business\/items\/(\d+)$/.exec(url.pathname);
  if (!match) return null;
  const itemId = routeId(match[1], "itemId");
  if (request.method === "GET") return success(await service.getDetail(itemId), requestId);
  if (request.method === "PATCH") return success(await service.update(itemId, await jsonBody(request), context), requestId);
  return null;
}

async function handleDefects(
  request: Request,
  env: IdentityRuntimeEnv,
  requestId: string,
  url: URL,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/business/defects")) return null;
  const guarded = await requireBusinessModule(request, env, requestId, "DEFECTS");
  if (isGuardedResponse(guarded)) return guarded.response;
  const service = new DefectService(env.DB);
  const lookups = new BusinessLookupService(env.DB);
  const context = {
    actorMemberId: guarded.gate.member.id,
    now: new Date().toISOString(),
    requestId,
    allowAdministrativeDelete: isWorkspaceAdmin(guarded.gate.principal.workspaceRole),
  };

  if (url.pathname === "/api/business/defects") {
    if (request.method === "GET") return success(await service.search(defectSearch(url)), requestId);
    if (request.method === "POST") return success(await service.create(await jsonBody(request), context), requestId, { status: 201 });
  }

  if (request.method === "GET" && url.pathname === "/api/business/defects/lookups") {
    return success(await lookups.defectLookups(actorRef(guarded.gate), {
      customerId: positiveInteger(url.searchParams.get("customerId"), "customerId"),
      itemId: positiveInteger(url.searchParams.get("itemId"), "itemId"),
      ownerId: positiveInteger(url.searchParams.get("ownerId"), "ownerId"),
      customerQuery: url.searchParams.get("customerQ")?.trim() ?? "",
      itemQuery: url.searchParams.get("itemQ")?.trim() ?? "",
      limit: boundedLimit(url.searchParams.get("limit")) ?? 100,
    }), requestId);
  }

  let match = /^\/api\/business\/defects\/(\d+)\/(start-processing|resolve|reopen|invalidate)$/.exec(url.pathname);
  if (match && request.method === "POST") {
    const defectId = routeId(match[1], "defectId");
    const body = await jsonBody(request);
    if (match[2] === "start-processing") return success(await service.startProcessing(defectId, body, context), requestId);
    if (match[2] === "resolve") return success(await service.resolve(defectId, body, context), requestId);
    if (match[2] === "reopen") return success(await service.reopen(defectId, body, context), requestId);
    return success(await service.invalidate(defectId, body, context), requestId);
  }

  match = /^\/api\/business\/defects\/(\d+)$/.exec(url.pathname);
  if (!match) return null;
  const defectId = routeId(match[1], "defectId");
  if (request.method === "GET") return success(await service.getDetail(defectId), requestId);
  if (request.method === "PATCH") return success(await service.update(defectId, await jsonBody(request), context), requestId);
  if (request.method === "DELETE") {
    await service.deleteCreated(defectId, await jsonBody(request), context);
    return success({ deleted: true, defectId }, requestId);
  }
  return null;
}

export async function handleBusinessApiRoute(
  request: Request,
  env: IdentityRuntimeEnv,
  requestId: string,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/business/")) return null;

  try {
    return await handleCustomers(request, env, requestId, url)
      ?? await handleItems(request, env, requestId, url)
      ?? await handleDefects(request, env, requestId, url);
  } catch (error) {
    const known = knownBusinessFailure(error, requestId);
    if (known) return known;
    throw error;
  }
}

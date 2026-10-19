import type { StructuralLookupKind } from "../../shared/settings";
import { resolveAppMember } from "../auth/app-access";
import { requireIdentity } from "../auth/guard";
import { AuditService, type AuditQuery } from "../audit/audit-service";
import { SettingsService, SettingsServiceError } from "../settings/settings-service";
import { FieldValidationError } from "../validation/fields";
import { identityClient, type IdentityRuntimeEnv } from "./auth-routes";
import { failure, success } from "./response";
import { identitySnapshot } from "./module-access-routes";

function integer(value: string | null, field: string, max = Number.MAX_SAFE_INTEGER): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new FieldValidationError({ [field]: `必須是 1～${max} 的整數` });
  return n;
}
function dateTime(value: string | null, field: string): string | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new FieldValidationError({ [field]: "時間格式無效" });
  return new Date(time).toISOString();
}
function auditQuery(url: URL): AuditQuery {
  const params = url.searchParams;
  const from = dateTime(params.get("occurredFrom"), "occurredFrom");
  const to = dateTime(params.get("occurredTo"), "occurredTo");
  if (from && to && from > to) throw new FieldValidationError({ occurredTo: "結束時間不可早於開始時間" });
  const codes: Record<string, string | undefined> = {};
  for (const key of ["entityType", "action"]) {
    const value = params.get(key)?.trim();
    if (value && !/^[a-z][a-z0-9_.-]{0,63}$/.test(value)) throw new FieldValidationError({ [key]: "代碼格式無效" });
    codes[key] = value || undefined;
  }
  const entityKey = params.get("entityKey")?.trim();
  if (entityKey && entityKey.length > 160) throw new FieldValidationError({ entityKey: "最多 160 字元" });
  const types = (params.get("entityTypes") || "").split(",").map(s => s.trim()).filter(Boolean);
  if (types.length > 20 || types.some(s => !/^[a-z][a-z0-9_.-]{0,63}$/.test(s))) throw new FieldValidationError({ entityTypes: "模組代碼無效" });
  const q = params.get("q")?.trim() || undefined;
  if (q && q.length > 100) throw new FieldValidationError({ q: "關鍵字最多 100 字" });
  const cursor = params.get("cursor") || undefined;
  if (cursor && (cursor.length > 256 || !/^[A-Za-z0-9_-]+$/.test(cursor))) throw new FieldValidationError({ cursor: "分頁游標無效" });
  return { entityTypes: types, q, cursor,
    includeErpQueries: params.get("includeErpQueries") === "true",
    relatedCustomerId: integer(params.get("relatedCustomerId"), "relatedCustomerId"),
    entityType: codes.entityType, action: codes.action, entityKey: entityKey || undefined,
    actorEmployeeId: integer(params.get("actorEmployeeId"), "actorEmployeeId"),
    occurredFrom: from, occurredTo: to, limit: integer(params.get("limit"), "limit", 200) };
}

export async function handleSettingsAuditRoute(request: Request, env: IdentityRuntimeEnv, requestId: string): Promise<Response | null> {
  const url = new URL(request.url);
  const settingsPath = url.pathname === "/api/admin/settings" || url.pathname.startsWith("/api/admin/settings/");
  if (!settingsPath && url.pathname !== "/api/admin/audit") return null;
  const provider = identityClient(env);
  if (!provider) return failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider is unavailable" }, requestId, 503);
  const gate = await requireIdentity(provider, request);
  if (!gate.ok) return failure({ code: gate.code, message: "Authentication required" }, requestId, gate.status);
  const role = gate.principal.workspaceRole;
  if (role !== "ADMIN" && role !== "SUPER_ADMIN") return failure({ code: "ADMIN_REQUIRED", message: "管理員權限不足" }, requestId, 403);
  try {
    const member = await resolveAppMember(env.DB, gate.principal);
    if (!member.isActive) return failure({ code: "ACCESS_DENIED", message: "App member is inactive" }, requestId, 403);
    if (url.pathname === "/api/admin/audit") {
      if (request.method !== "GET") return failure({ code: "METHOD_NOT_ALLOWED", message: "唯讀入口" }, requestId, 405);
      // One best-effort CYID name refresh per authorized Audit query; outages must not hide Audit records.
      try {
        const snapshot = await identitySnapshot(request, env);
        if (snapshot.status === "ok") {
          const people = snapshot.employees.filter((raw): raw is { employee_id: string; name: string } =>
            !!raw && typeof raw === "object" && typeof (raw as { employee_id?: unknown }).employee_id === "string"
            && typeof (raw as { name?: unknown }).name === "string" && (raw as { name: string }).name.trim().length > 0
            && (raw as { name: string }).name.trim().length <= 120);
          const existing = await env.DB.prepare("SELECT identity_employee_id, display_name FROM app_members")
            .all<{ identity_employee_id: string; display_name: string | null }>();
          const current = new Map((existing.results ?? []).map(m => [m.identity_employee_id, m.display_name]));
          const updates = people.filter(p => current.has(p.employee_id) && current.get(p.employee_id) !== p.name.trim());
          if (updates.length) await env.DB.batch(updates.map(p =>
            env.DB.prepare("UPDATE app_members SET display_name=?1, updated_at=?2 WHERE identity_employee_id=?3 AND COALESCE(display_name,'') != ?1")
              .bind(p.name.trim(), new Date().toISOString(), p.employee_id)));
        }
      } catch { /* Snapshot is optional enrichment. */ }
      const audit = new AuditService(env.DB);
      const query = auditQuery(url);
      // Client flag can never elevate ADMIN or USER to query-visibility.
      query.includeErpQueries = role === "SUPER_ADMIN" && query.includeErpQueries === true;
      const result = await audit.listDetailedPage(query);
      return success({ ...result, actors: await audit.listActors() }, requestId);
    }
    const service = new SettingsService(env.DB);
    if (url.pathname === "/api/admin/settings" && request.method === "GET") return success(await service.snapshot(), requestId);
    if (!["POST", "PATCH", "PUT"].includes(request.method)) return failure({ code: "METHOD_NOT_ALLOWED", message: "Unsupported method" }, requestId, 405);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new FieldValidationError({ body: "必須是 JSON 物件" });
    const context = { actorMemberId: member.id, role, now: new Date().toISOString(), requestId };
    let match = /^\/api\/admin\/settings\/lookups\/(department|customer_category|customer_status|item_category)(?:\/(\d+))?$/.exec(url.pathname);
    if (match && request.method === "POST" && !match[2]) await service.createStructuralLookup(match[1] as StructuralLookupKind, body as Parameters<SettingsService["createStructuralLookup"]>[1], context);
    else if (match && request.method === "PATCH" && match[2]) await service.updateStructuralLookup(match[1] as StructuralLookupKind, integer(match[2], "id")!, body as Parameters<SettingsService["updateStructuralLookup"]>[2], context);
    else if ((match = /^\/api\/admin\/settings\/worklog-categories(?:\/(\d+))?$/.exec(url.pathname)) && request.method === "POST" && !match[1]) await service.createWorkLogCategory(body as Parameters<SettingsService["createWorkLogCategory"]>[0], context);
    else if (match && request.method === "PATCH" && match[1]) await service.updateWorkLogCategory(integer(match[1], "id")!, body as Parameters<SettingsService["updateWorkLogCategory"]>[1], context);
    else if ((match = /^\/api\/admin\/settings\/worklog-platforms(?:\/(\d+))?$/.exec(url.pathname)) && request.method === "POST" && !match[1]) await service.createWorkLogPlatform(body as Parameters<SettingsService["createWorkLogPlatform"]>[0], context);
    else if (match && request.method === "PATCH" && match[1]) await service.updateWorkLogPlatform(integer(match[1], "id")!, body as Parameters<SettingsService["updateWorkLogPlatform"]>[1], context);
    else if (url.pathname === "/api/admin/settings/worklog-scoring-rows" && request.method === "PUT") await service.upsertWorkLogScoringRow(body as Parameters<SettingsService["upsertWorkLogScoringRow"]>[0], context);
    else if (url.pathname === "/api/admin/settings/worklog-scoring-config" && request.method === "PUT") await service.updateWorkLogScoringConfig(body as Parameters<SettingsService["updateWorkLogScoringConfig"]>[0], context);
    else if ((match = /^\/api\/admin\/settings\/app-tags(?:\/(\d+))?$/.exec(url.pathname)) && request.method === "POST" && !match[1]) await service.createAppTag(body as Parameters<SettingsService["createAppTag"]>[0], context);
    else if (match && request.method === "PATCH" && match[1]) await service.updateAppTag(integer(match[1], "id")!, body as Parameters<SettingsService["updateAppTag"]>[1], context);
    else return failure({ code: "NOT_FOUND", message: "Settings route not found" }, requestId, 404);
    return success({ saved: true }, requestId);
  } catch (error) {
    if (error instanceof FieldValidationError) return failure({ code: "INVALID_REQUEST", message: error.message, fields: error.fields }, requestId, 422);
    if (error instanceof SettingsServiceError) return failure({ code: error.code, message: error.message }, requestId, error.status);
    return failure({ code: "SETTINGS_AUDIT_UNAVAILABLE", message: "設定／稽核資料暫時無法讀取" }, requestId, 503);
  }
}

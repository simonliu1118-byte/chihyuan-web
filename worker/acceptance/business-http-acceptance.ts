import { handleBusinessApiRoute } from "../http/business-api-routes";
import { handleBusinessApiPhase2Route } from "../http/business-api-phase2-routes";
import type { IdentityRuntimeEnv } from "../http/auth-routes";

/** Real protected routes/services/D1; only the remote Identity binding is stubbed. */
export async function acceptBusinessHttpAuthority(db: D1Database): Promise<void> {
  let role: "USER" | "ADMIN" | "SUPER_ADMIN" = "USER";
  let employee = "http-acceptance-owner";
  let identityAdmin = false;
  let provider: "ready" | "invalid" | "unavailable" = "ready";
  const env: IdentityRuntimeEnv = {
    DB: db, IDENTITY_APPLICATION_ID: "APP_TEST", IDENTITY_WORKSPACE_ID: "workspace-test",
    IDENTITY: { async fetch() {
      if (provider === "invalid") return Response.json({ error: { code: "SESSION_INVALID" } }, { status: 401 });
      if (provider === "unavailable") return new Response("unavailable", { status: 503 });
      return Response.json({ ok: true, principal: {
        workspaceId: "workspace-test", employeeId: employee, employeeNo: "0097", displayName: "HTTP Acceptance",
        workspaceRole: role, isIdentityAdmin: identityAdmin, emailVerified: true,
        isWorkspaceSuperAdmin: role === "SUPER_ADMIN", credentialVersion: 1, employeeRevision: 1,
      }, session: { expiresAt: "2999-01-01T00:00:00.000Z" } });
    } } as unknown as Fetcher,
  };
  function check(condition: unknown, code: string): asserts condition {
    if (!condition) throw new Error("ACCEPT_HTTP_" + code);
  }
  async function call(path: string, method = "GET", body?: unknown, cookie = true): Promise<Response> {
    const request = new Request("https://acceptance.test/api/business/" + path, {
      method, headers: { "content-type": "application/json", ...(cookie ? { cookie: "cyweb_identity_session=cyid_" + "a".repeat(64) } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await handleBusinessApiRoute(request, env, "accept-business-http")
      ?? await handleBusinessApiPhase2Route(request, env, "accept-business-http");
    check(result, "ROUTE_MISSING_" + path);
    return result;
  }
  async function expect(path: string, status: number, method = "GET", body?: unknown, cookie = true, code?: string): Promise<Response> {
    const result = await call(path, method, body, cookie);
    check(result.status === status, "STATUS_" + path + "_" + method + "_EXPECTED_" + status + "_ACTUAL_" + result.status);
    if (code) {
      const payload = await result.clone().json() as { error?: { code?: string } };
      check(payload.error?.code === code, "ERROR_CODE_" + path);
    }
    return result;
  }
  async function memberId(): Promise<number> {
    const value = await db.prepare("SELECT id FROM app_members WHERE identity_employee_id=?").bind(employee).first<{ id: number }>();
    check(value, "MEMBER_PROJECTION");
    return value.id;
  }
  const modules = [
    ["CUSTOMERS", "customers", "customers"], ["ITEMS", "items", "items"],
    ["DEFECTS", "defects", "defects"], ["ORDERS", "orders", "orders"],
    ["OUTSOURCING", "outsourcing/contractors", "outsourcing/contractors"],
    ["WORKLOGS", "worklogs", "worklogs"],
  ] as const;
  async function grant(module: string, enabled: number): Promise<void> {
    await db.prepare("INSERT INTO app_member_module_access(member_id,module_code,enabled,updated_at) VALUES(?,?,?,'2026-10-02T11:40:00Z') ON CONFLICT(member_id,module_code) DO UPDATE SET enabled=excluded.enabled")
      .bind(await memberId(), module, enabled).run();
  }
  // Compare every business/config/Audit table; local projection/grants are setup.
  const tables = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' AND name NOT IN ('app_members','app_member_module_access','d1_migrations') ORDER BY name")
    .all<{ name: string }>();
  async function snapshot(): Promise<string> {
    const rows = await db.batch(tables.results.map(row => db.prepare('SELECT * FROM "' + row.name.replaceAll('"', '""') + '" ORDER BY rowid')));
    return JSON.stringify(rows.map(row => row.results));
  }
  const initial = await snapshot();
  const spoof = { role: "SUPER_ADMIN", workspaceRole: "SUPER_ADMIN", actorMemberId: 1, allowHardDelete: true, allowReview: true,
    allowShipmentReversal: true, allowOutboundCorrection: true, allowOutboundCancellation: true, allowAdministrativeDelete: true };
  const protectedActions = [
    ["customers/1/quotes/1/correct", "POST"], ["customers/1/visits/1", "DELETE"],
    ["items/1", "PATCH"], ["defects/1", "DELETE"],
    ["orders/1/erp", "POST"], ["orders/1/reverse-shipment", "POST"],
    ["outsourcing/orders/1/cancel-payment", "POST"], ["outsourcing/contractors/1", "DELETE"],
    ["worklogs/1/review", "POST"], ["worklogs/1", "DELETE"],
  ] as const;
  for (const [path, method] of protectedActions) {
    await expect(path, 401, method, spoof, false);
    await expect(path, 403, method, spoof);
  }
  for (const [, read, write] of modules) {
    await expect(read, 401, "GET", undefined, false, "AUTH_REQUIRED");
    await expect(write, 401, "POST", spoof, false, "AUTH_REQUIRED");
    await expect(read, 403, "GET", undefined, true, "ACCESS_DENIED");
    await expect(write, 403, "POST", spoof, true, "ACCESS_DENIED");
  }
  check(await snapshot() === initial, "UNAUTHORIZED_BUSINESS_MUTATION");
  for (const nextRole of ["ADMIN", "SUPER_ADMIN"] as const) {
    role = nextRole;
    for (const [, read] of modules) await expect(read, role === "ADMIN" ? 403 : 200);
  }
  role = "ADMIN"; identityAdmin = true;
  for (const [, read] of modules) await expect(read, 403);
  for (const [path, method] of protectedActions) await expect(path, 403, method, spoof);
  identityAdmin = false; role = "USER";
  for (const [module, read, write] of modules) {
    await grant(module, 1);
    await expect(read, 200);
    await expect(write, 422, "POST", {});
    role = "ADMIN";
    await expect(read, 200);
    role = "USER";
    await grant(module, 0);
    await expect(read, 403);
    await expect(write, 403, "POST", spoof);
    await grant(module, 1);
    await expect(read, 200);
  }
  const grants = await db.prepare("SELECT module_code,enabled FROM app_member_module_access WHERE member_id=? ORDER BY module_code").bind(await memberId()).all();
  role = "ADMIN";
  for (const [, read] of modules) await expect(read, 200);
  role = "USER";
  const afterRoles = await db.prepare("SELECT module_code,enabled FROM app_member_module_access WHERE member_id=? ORDER BY module_code").bind(await memberId()).all();
  check(JSON.stringify(grants.results) === JSON.stringify(afterRoles.results), "ROLE_CHANGED_MODULE_GRANTS");
  await db.prepare("UPDATE app_members SET is_active=0 WHERE id=?").bind(await memberId()).run();
  for (const [, read, write] of modules) { await expect(read, 403); await expect(write, 403, "POST", spoof); }
  await db.prepare("UPDATE app_members SET is_active=1 WHERE id=?").bind(await memberId()).run();
  for (const [, read] of modules) await expect(read, 200);
  for (const state of ["invalid", "unavailable"] as const) {
    provider = state;
    for (const [, read, write] of modules) {
      await expect(read, state === "invalid" ? 401 : 503);
      await expect(write, state === "invalid" ? 401 : 503, "POST", spoof);
    }
  }
  provider = "ready";
  for (const path of ["orders/1/reverse-shipment", "outsourcing/orders/1/correct-outbound", "outsourcing/orders/1/cancel-outbound"]) {
    await expect(path, 403, "POST", { ...spoof, expectedRevision: 1 });
  }
  check(await snapshot() === initial, "GATE_OR_VALIDATION_BUSINESS_MUTATION");

  // Customer HTTP persistence, server-owned actor, and stale 409 without effects.
  const profile = { shortName: "Isolated HTTP Customer", customerNo: "ACC-HTTP-001", ...spoof };
  const createdResponse = await expect("customers", 201, "POST", profile);
  const created = (await createdResponse.json() as { data: { id: number; revision: number } }).data;
  const creator = await db.prepare("SELECT created_by FROM customers WHERE id=?").bind(created.id).first<{ created_by: number }>();
  check(creator?.created_by === await memberId(), "CLIENT_SPOOFED_CUSTOMER_ACTOR");
  const edit = { ...profile, shortName: "Isolated HTTP Customer corrected", expectedRevision: created.revision };
  await expect("customers/" + created.id, 200, "PATCH", edit);
  const saved = await snapshot();
  await expect("customers/" + created.id, 409, "PATCH", edit, true, "CUSTOMER_REVISION_CONFLICT");
  check(await snapshot() === saved, "STALE_CUSTOMER_HTTP_MUTATION");
  const readback = (await (await expect("customers/" + created.id, 200)).json() as { data: { revision: number; shortName: string } }).data;
  check(readback.revision === created.revision + 1 && readback.shortName === edit.shortName, "CUSTOMER_HTTP_READBACK");

  // Defect administrative deletion must ignore client capability flags.
  const defect = (await (await expect("defects", 201, "POST", {
    customerId: created.id, itemId: 1001, ownerEmployeeId: await memberId(), reportedDate: "2026-10-02",
    defectDescription: "Isolated HTTP Defect", ...spoof,
  })).json() as { data: { id: number; revision: number } }).data;
  const defectSaved = await snapshot();
  employee = "http-acceptance-other";
  await expect("defects", 403);
  await grant("DEFECTS", 1);
  await expect("defects/" + defect.id, 403, "DELETE", { expectedRevision: defect.revision, ...spoof });
  check(await snapshot() === defectSaved, "USER_DEFECT_DELETE_MUTATION");
  role = "ADMIN";
  await expect("defects/" + defect.id, 200, "DELETE", { expectedRevision: defect.revision });
  const deleted = await db.prepare("SELECT id FROM defect_reports WHERE id=?").bind(defect.id).first();
  check(deleted === null, "ADMIN_DEFECT_DELETE");
  role = "USER"; employee = "http-acceptance-owner";

  // Sales HTTP lifecycle uses only synthetic ERP reference text in isolated D1.
  const priorAudit = await db.prepare("SELECT * FROM audit_events ORDER BY id").all<{ id: number }>();
  const auditBoundary = priorAudit.results.at(-1)?.id ?? 0;
  const order = (await (await expect("orders", 201, "POST", {
    customerId: created.id, orderDate: "2026-10-02", operatorEmployeeId: await memberId(),
    lines: [{ itemId: 1001, quantity: "2", unit: "EA", unitPrice: "1.25", sortOrder: 0 }], ...spoof,
  })).json() as { data: { id: number; revision: number } }).data;
  const draftSaved = await snapshot();
  await expect("orders/" + order.id, 403, "DELETE", { expectedRevision: order.revision, ...spoof });
  check(await snapshot() === draftSaved, "USER_ORDER_DELETE_MUTATION");
  let revision = order.revision;
  for (const action of ["erp", "picked", "shipped", "reverse-shipment", "void"]) {
    const body = action === "erp" ? { expectedRevision: revision, customerNo: profile.customerNo, erpNo: "ACC-HTTP-ERP-001" }
      : { expectedRevision: revision, reason: "isolated HTTP acceptance", ...spoof };
    if (action === "reverse-shipment") {
      const shipped = await snapshot();
      await expect("orders/" + order.id + "/" + action, 403, "POST", body);
      check(await snapshot() === shipped, "USER_SHIPMENT_REVERSAL_MUTATION");
      role = "ADMIN";
    }
    const current = (await (await expect("orders/" + order.id + "/" + action, 200, "POST", body)).json() as { data: { revision: number } }).data;
    check(current.revision === revision + 1, "SALES_HTTP_REVISION_" + action);
    revision = current.revision;
  }
  const orderAudit = await db.prepare("SELECT action,actor_employee_id FROM audit_events WHERE entity_type='sales_work_order' AND entity_key=? AND id>? ORDER BY id")
    .bind(String(order.id), auditBoundary).all<{ action: string; actor_employee_id: number }>();
  check(JSON.stringify(orderAudit.results.map(row => row.action)) === JSON.stringify([
    "sales_work_order.erp.filled", "sales_work_order.picked", "sales_work_order.shipped", "sales_work_order.shipment.reversed", "sales_work_order.voided",
  ]) && orderAudit.results.every(row => row.actor_employee_id === creator?.created_by), "SALES_HTTP_AUDIT");
  const retainedAudit = await db.prepare("SELECT * FROM audit_events WHERE id<=? ORDER BY id").bind(auditBoundary).all();
  check(JSON.stringify(retainedAudit.results) === JSON.stringify(priorAudit.results), "PREVIOUS_AUDIT_RETENTION");
  role = "USER";

  // WorkLog owner scope and ADMIN review are derived from the provider, not body.
  const logResponse = await expect("worklogs", 201, "POST", {
    logDate: "2026-10-02", dateFrom: "2026-10-02", dateTo: "2026-10-02", workDays: "1", typeCode: "daily",
    entries: [{ entryTypeCode: "standard", content: "Isolated HTTP WorkLog", sortOrder: 0, categories: [] }], ...spoof,
  });
  const log = (await logResponse.json() as { data: { id: number; revision: number } }).data;
  const owner = await db.prepare("SELECT employee_id,created_by FROM work_logs WHERE id=?").bind(log.id).first<{ employee_id: number; created_by: number }>();
  check(owner?.employee_id === await memberId() && owner.created_by === await memberId(), "CLIENT_SPOOFED_WORKLOG_OWNER");
  const submittedResponse = await expect("worklogs/" + log.id + "/submit", 200, "POST", { expectedRevision: log.revision });
  const submitted = (await submittedResponse.json() as { data: { revision: number; entries: { id: number }[] } }).data;
  const review = { expectedRevision: submitted.revision, workDays: "1", entries: submitted.entries.map(entry => ({ entryId: entry.id, reviewScore: "1" })), ...spoof };
  const pending = await snapshot();
  await expect("worklogs/" + log.id + "/review", 403, "POST", review, true, "WORK_LOG_REVIEW_NOT_ALLOWED");
  check(await snapshot() === pending, "USER_REVIEW_MUTATION");
  employee = "http-acceptance-other";
  await expect("worklogs", 403); // Initializes only an ephemeral local projection.
  await grant("WORKLOGS", 1);
  await expect("worklogs/" + log.id, 403, "GET", undefined, true, "WORK_LOG_ACCESS_DENIED");
  role = "ADMIN";
  await expect("worklogs/" + log.id, 200);
  await expect("worklogs/" + log.id + "/review", 200, "POST", review);
  const audit = await db.prepare("SELECT actor_employee_id FROM audit_events WHERE entity_type='work_log' AND entity_key=? AND action='work_log.reviewed'")
    .bind(String(log.id)).all<{ actor_employee_id: number }>();
  check(audit.results.length === 1 && audit.results[0]?.actor_employee_id === await memberId(), "CLIENT_SPOOFED_REVIEW_AUDIT_ACTOR");
  await grant("WORKLOGS", 0);
  const reviewed = await snapshot();
  await expect("worklogs/" + log.id + "/cancel-review", 403, "POST", { expectedRevision: submitted.revision + 1, ...spoof });
  check(await snapshot() === reviewed, "REVOKED_ADMIN_MUTATION");
}

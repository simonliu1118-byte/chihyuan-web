import { handleBusinessApiRoute } from "../http/business-api-routes";
import { handleBusinessApiPhase2Route } from "../http/business-api-phase2-routes";
import type { IdentityRuntimeEnv } from "../http/auth-routes";

/** Real protected routes/services/D1; only the remote Identity binding is stubbed. */
export async function acceptBusinessHttpAuthority(db: D1Database, componentId: number, finishedId: number): Promise<void> {
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

  // Formal Item/Quote HTTP uses synthetic references exclusively in isolated D1.
  const itemProfile = { itemNo: "ACC-HTTP-ITEM-001", name: "Isolated HTTP Item", baseUnit: "EA", cost: "1.2345", costTaxMode: "none",
    unitConversions: [{ fromUnit: "BOX", quantity: "12", toUnit: "EA", sortOrder: 0 }] };
  const item = (await (await expect("items", 201, "POST", itemProfile)).json() as { data: { id: number; revision: number } }).data;
  const itemPath = "items/" + item.id;
  const itemEdit = { ...itemProfile, name: "Isolated HTTP Item corrected", expectedRevision: item.revision };
  await expect(itemPath, 200, "PATCH", itemEdit);
  const itemSaved = await snapshot();
  await expect(itemPath, 409, "PATCH", itemEdit, true, "ITEM_REVISION_CONFLICT");
  check(await snapshot() === itemSaved, "ITEM_HTTP_STALE_MUTATION");
  const numberBody = { newItemNo: "ACC-HTTP-ITEM-002", expectedRevision: item.revision + 1, changeSource: "manual" };
  await expect(itemPath + "/number", 200, "POST", numberBody);
  const numberedSaved = await snapshot();
  await expect(itemPath + "/number", 409, "POST", numberBody);
  check(await snapshot() === numberedSaved, "ITEM_HTTP_STALE_RENUMBER");
  await expect(itemPath + "/number-history", 200);
  const itemRead = (await (await expect(itemPath, 200)).json() as { data: { itemNo: string; cost: string; unitConversions: unknown[] } }).data;
  check(itemRead.itemNo === numberBody.newItemNo && itemRead.cost === "1.2345" && itemRead.unitConversions.length === 1,
    "ITEM_HTTP_EXACT_READBACK");
  const itemAudit = await db.prepare("SELECT action,actor_employee_id FROM audit_events WHERE entity_type='item' AND entity_key=? ORDER BY id")
    .bind(String(item.id)).all<{ action: string; actor_employee_id: number }>();
  check(itemAudit.results.length === 1 && itemAudit.results[0]?.action === "item.number.changed"
    && itemAudit.results[0]?.actor_employee_id === creator?.created_by, "ITEM_HTTP_NUMBER_AUDIT");
  const customerPath = "customers/" + created.id;
  const quoteProfile = { itemId: item.id, quoteDate: "2026-10-02", employeeId: await memberId(),
    priceBreaks: [{ quantity: "1.25", unit: "EA", unitPrice: "2.3456", sortOrder: 0 }] };
  const quote = (await (await expect(customerPath + "/quotes", 201, "POST", quoteProfile)).json() as { data: { id: number; revision: number } }).data;
  const quotePath = customerPath + "/quotes/" + quote.id;
  const quoteCorrection = { ...quoteProfile, expectedRevision: quote.revision, correctionReason: "isolated correction",
    priceBreaks: [{ quantity: "1.25", unit: "EA", unitPrice: "2.1234", sortOrder: 0 }] };
  await expect(quotePath + "/correct", 200, "POST", quoteCorrection);
  const quoteSaved = await snapshot();
  await expect(quotePath + "/correct", 409, "POST", quoteCorrection, true, "CUSTOMER_QUOTE_REVISION_CONFLICT");
  check(await snapshot() === quoteSaved, "QUOTE_HTTP_STALE_MUTATION");
  const quoteRead = (await (await expect(quotePath, 200)).json() as { data: { revision: number; priceBreaks: { unitPrice: string }[] } }).data;
  check(quoteRead.revision === quote.revision + 1 && quoteRead.priceBreaks[0]?.unitPrice === "2.1234", "QUOTE_HTTP_EXACT_READBACK");
  const nextQuote = (await (await expect(customerPath + "/quotes", 201, "POST", { ...quoteProfile, quoteDate: "2026-10-03" })).json() as { data: { id: number } }).data;
  check(nextQuote.id !== quote.id, "QUOTE_HTTP_NEW_HISTORY");
  const oldQuoteRead = (await (await expect(quotePath, 200)).json() as { data: unknown }).data;
  check(JSON.stringify(oldQuoteRead) === JSON.stringify(quoteRead), "QUOTE_HTTP_PREVIOUS_HISTORY_RETENTION");
  const quoteAudit = await db.prepare("SELECT action,actor_employee_id,before_json,after_json,metadata_json FROM audit_events WHERE entity_type='customer_item_quote' AND entity_key=? ORDER BY id")
    .bind(String(quote.id)).all<{ action: string; actor_employee_id: number; before_json: string; after_json: string; metadata_json: string }>();
  const quoteEvent = quoteAudit.results[0];
  check(quoteAudit.results.length === 1 && quoteEvent?.action === "corrected" && quoteEvent.actor_employee_id === creator?.created_by
    && JSON.parse(quoteEvent.before_json).priceBreaks[0]?.unitPrice === "2.3456"
    && JSON.parse(quoteEvent.after_json).priceBreaks[0]?.unitPrice === "2.1234"
    && JSON.parse(quoteEvent.metadata_json).correctionReason === quoteCorrection.correctionReason, "QUOTE_HTTP_AUDIT_PAYLOAD");
  const visitProfile = { visitDate: "2026-11-01", employeeId: await memberId(), personSnapshot: "Isolated visitor", content: "HTTP Visit" };
  const visit = (await (await expect(customerPath + "/visits", 201, "POST", visitProfile)).json() as { data: { id: number; revision: number } }).data;
  const visitPath = customerPath + "/visits/" + visit.id;
  const visitEdit = { ...visitProfile, content: "HTTP Visit corrected", expectedRevision: visit.revision };
  await expect(visitPath, 200, "PATCH", visitEdit);
  const visitSaved = await snapshot();
  await expect(visitPath, 409, "PATCH", visitEdit, true, "CUSTOMER_VISIT_REVISION_CONFLICT");
  check(await snapshot() === visitSaved, "VISIT_HTTP_STALE_MUTATION");
  await expect(visitPath, 200, "DELETE", { expectedRevision: visit.revision + 1 });
  await expect(customerPath + "/visits", 200);
  check(await db.prepare("SELECT id FROM customer_visits WHERE id=?").bind(visit.id).first() === null, "VISIT_HTTP_DELETE");
  for (const frequentProfile of [{ customItemName: "HTTP free-text item", sortOrder: 0 }, { itemId: item.id, sortOrder: 1 }]) {
    const frequent = (await (await expect(customerPath + "/frequent-items", 201, "POST", frequentProfile)).json() as { data: { frequentItemId: number } }).data;
    const frequentPath = customerPath + "/frequent-items/" + frequent.frequentItemId;
    const before = await db.prepare("SELECT updated_at FROM customer_frequent_items WHERE id=?").bind(frequent.frequentItemId).first<{ updated_at: string }>();
    check(before, "FREQUENT_HTTP_VERSION");
    const editFrequent = { ...frequentProfile, sortOrder: 2, expectedUpdatedAt: before.updated_at };
    await expect(frequentPath, 200, "PATCH", editFrequent);
    const saved = await snapshot();
    await expect(frequentPath, 409, "PATCH", editFrequent, true, "CUSTOMER_FREQUENT_ITEM_CONFLICT");
    await expect(frequentPath, 409, "DELETE", { expectedUpdatedAt: before.updated_at }, true, "CUSTOMER_FREQUENT_ITEM_CONFLICT");
    check(await snapshot() === saved, "FREQUENT_HTTP_STALE_MUTATION");
    const current = await db.prepare("SELECT updated_at,sort_order FROM customer_frequent_items WHERE id=?").bind(frequent.frequentItemId).first<{ updated_at: string; sort_order: number }>();
    check(current?.sort_order === 2, "FREQUENT_HTTP_EDIT_READBACK");
    await expect(customerPath + "/frequent-items", 200);
    await expect(frequentPath, 200, "DELETE", { expectedUpdatedAt: current.updated_at });
    check(await db.prepare("SELECT id FROM customer_frequent_items WHERE id=?").bind(frequent.frequentItemId).first() === null, "FREQUENT_HTTP_DELETE");
  }

  const lifecycleProfile = { customerId: created.id, itemId: item.id, ownerEmployeeId: await memberId(), reportedDate: "2026-10-02",
    defectDescription: "Isolated HTTP lifecycle" };
  const lifecycle = (await (await expect("defects", 201, "POST", lifecycleProfile)).json() as { data: { id: number; revision: number } }).data;
  let defectRevision = lifecycle.revision;
  for (const [action, target] of [["start-processing", "processing"], ["resolve", "resolved"], ["reopen", "processing"], ["invalidate", "processing"]]) {
    const body = { expectedRevision: defectRevision, reason: "isolated HTTP lifecycle" };
    const result = (await (await expect("defects/" + lifecycle.id + "/" + action, 200, "POST", body)).json() as { data: { revision: number; statusCode: string } }).data;
    check(result.revision === defectRevision + 1 && result.statusCode === target, "DEFECT_HTTP_STATE_" + action);
    defectRevision = result.revision;
    const saved = await snapshot();
    await expect("defects/" + lifecycle.id + "/" + action, 409, "POST", body, true, "DEFECT_REVISION_CONFLICT");
    check(await snapshot() === saved, "DEFECT_HTTP_STALE_" + action);
  }
  const lifecycleAudit = await db.prepare("SELECT action,actor_employee_id FROM audit_events WHERE entity_type='defect' AND entity_key=? ORDER BY id")
    .bind(String(lifecycle.id)).all<{ action: string; actor_employee_id: number }>();
  check(JSON.stringify(lifecycleAudit.results.map(row => row.action)) === JSON.stringify([
    "defect.processing.started", "defect.resolved", "defect.reopened", "defect.invalidated",
  ]) && lifecycleAudit.results.every(row => row.actor_employee_id === creator?.created_by), "DEFECT_HTTP_LIFECYCLE_AUDIT");

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
  const orderAudit = await db.prepare("SELECT action,actor_employee_id FROM audit_events WHERE entity_type='sales_work_order' AND entity_key=? ORDER BY id")
    .bind(String(order.id)).all<{ action: string; actor_employee_id: number }>();
  check(JSON.stringify(orderAudit.results.map(row => row.action)) === JSON.stringify([
    "sales_work_order.erp.filled", "sales_work_order.picked", "sales_work_order.shipped", "sales_work_order.shipment.reversed", "sales_work_order.voided",
  ]) && orderAudit.results.every(row => row.actor_employee_id === creator?.created_by), "SALES_HTTP_AUDIT");
  const retainedAudit = await db.prepare("SELECT * FROM audit_events WHERE id<=? ORDER BY id").bind(auditBoundary).all();
  check(JSON.stringify(retainedAudit.results) === JSON.stringify(priorAudit.results), "PREVIOUS_AUDIT_RETENTION");
  role = "USER";

  // Full outsourcing HTTP path: real BOM/unit/price resolution and reversals.
  const contractor = (await (await expect("outsourcing/contractors", 201, "POST", {
    entityType: "organization", displayName: "Isolated HTTP Contractor", contacts: [],
  })).json() as { data: { id: number } }).data;
  const bom = (await (await expect("outsourcing/boms", 201, "POST", {
    recipeRef: "ACC-HTTP-BOM-001", finishedItemId: finishedId, outputQuantity: "1", outputUnit: "EA",
    components: [{ itemId: componentId, quantity: "2", unit: "EA", sortOrder: 0 }],
  })).json() as { data: { id: number } }).data;
  await expect("outsourcing/contractors/" + contractor.id + "/prices", 200, "PUT", {
    itemId: finishedId, pricingUnit: "EA", unitPrice: "1.25",
  });
  const outProfile = { contractorId: contractor.id, operatorEmployeeId: await memberId(), orderDate: "2026-10-02",
    parts: [{ finishedItemId: finishedId, componentItemId: componentId, bomRecipeId: bom.id,
      quantity: "1", unit: "CASE", sortOrder: 0 }] };
  const outsourcing = (await (await expect("outsourcing/orders", 201, "POST", outProfile)).json() as {
    data: { id: number; revision: number };
  }).data;
  const outPath = "outsourcing/orders/" + outsourcing.id;
  let outRevision = outsourcing.revision;
  async function outStock(expected: number): Promise<void> {
    const row = await db.prepare("SELECT COALESCE(SUM(quantity_delta),0) AS n FROM contractor_stock_movements WHERE outsourcing_order_id=?")
      .bind(outsourcing.id).first<{ n: number }>();
    check(Number(row?.n) === expected, "OUTSOURCING_STOCK_" + expected);
    await expect("outsourcing/stock?contractorId=" + contractor.id, 200);
  }
  async function outAction(action: string, target: string, extra: Record<string, unknown> = {}): Promise<void> {
    const body = { ...spoof, expectedRevision: outRevision, reason: "isolated HTTP acceptance", ...extra };
    const detail = (await (await expect(outPath + "/" + action, 200, "POST", body)).json() as {
      data: { revision: number; statusCode: string; pricing: { totalAmount: string } | null };
    }).data;
    check(detail.revision === outRevision + 1 && detail.statusCode === target, "OUTSOURCING_STATE_" + action);
    if (action === "price") check(detail.pricing?.totalAmount === "3.75", "OUTSOURCING_EXACT_PRICE");
    outRevision = detail.revision;
    const saved = await snapshot();
    await expect(outPath + "/" + action, 409, "POST", body, true, "OUTSOURCING_REVISION_CONFLICT");
    check(await snapshot() === saved, "OUTSOURCING_STALE_HTTP_" + action);
    await expect(outPath, 200);
  }
  await outStock(0);
  await outAction("confirm-outbound", "outbound", { effectiveDate: "2026-10-02" });
  await outStock(240000); // CASE -> 2 BOX -> 24 EA.
  const outboundSaved = await snapshot();
  await expect(outPath, 403, "DELETE", { expectedRevision: outRevision, ...spoof });
  await expect(outPath + "/correct-outbound", 403, "POST", { ...outProfile, expectedRevision: outRevision, ...spoof });
  check(await snapshot() === outboundSaved, "OUTSOURCING_USER_ADMIN_SPOOF");
  role = "ADMIN";
  await expect(outPath, 409, "DELETE", { expectedRevision: outRevision }, true, "OUTSOURCING_DELETE_NOT_ALLOWED");
  await outAction("correct-outbound", "outbound", { ...outProfile,
    parts: [{ ...outProfile.parts[0], quantity: "2" }] });
  await outStock(480000);
  role = "USER";
  await outAction("receive", "received", { receivedDate: "2026-10-02", operatorEmployeeId: await memberId(),
    items: [{ itemId: finishedId, bomRecipeId: bom.id, quantity: "3", unit: "EA", sortOrder: 0 }] });
  await outStock(420000); // 3 finished units consume 6 component units.
  await outAction("price", "priced", { pricedDate: "2026-10-02", operatorEmployeeId: await memberId() });
  await outAction("paid", "paid");
  const paidSaved = await snapshot();
  await expect(outPath + "/cancel-pricing", 422, "POST", { expectedRevision: outRevision, reason: "blocked" });
  await expect(outPath + "/cancel-receipt", 422, "POST", { expectedRevision: outRevision, reason: "blocked" });
  check(await snapshot() === paidSaved, "OUTSOURCING_REVERSE_ORDER_MUTATION");
  await outAction("cancel-payment", "priced");
  await outAction("cancel-pricing", "received");
  await outAction("cancel-receipt", "outbound");
  await outStock(480000);
  const reversalSaved = await snapshot();
  await expect(outPath + "/cancel-outbound", 403, "POST", { expectedRevision: outRevision, ...spoof });
  check(await snapshot() === reversalSaved, "OUTSOURCING_USER_CANCEL_MUTATION");
  role = "ADMIN";
  await outAction("cancel-outbound", "voided");
  await outStock(0);
  const outAudit = await db.prepare("SELECT action,actor_employee_id FROM audit_events WHERE entity_type='outsourcing_order' AND entity_key=? ORDER BY id")
    .bind(String(outsourcing.id)).all<{ action: string; actor_employee_id: number }>();
  check(JSON.stringify(outAudit.results.map(row => row.action)) === JSON.stringify([
    "outsourcing.outbound.confirmed", "outsourcing.outbound.corrected", "outsourcing.received", "outsourcing.priced",
    "outsourcing.paid", "outsourcing.payment.cancelled", "outsourcing.pricing.cancelled",
    "outsourcing.receipt.cancelled", "outsourcing.outbound.cancelled",
  ]) && outAudit.results.every(row => row.actor_employee_id === creator?.created_by), "OUTSOURCING_HTTP_AUDIT");
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
  await grant("WORKLOGS", 1);
  const logPath = "worklogs/" + log.id;
  let logRevision = submitted.revision + 1;
  async function logAction(action: string, target: string): Promise<void> {
    const body = { expectedRevision: logRevision, reason: "isolated HTTP lifecycle", ...spoof };
    const result = (await (await expect(logPath + "/" + action, 200, "POST", body)).json() as {
      data: { revision: number; statusCode: string; finalScore: string | null };
    }).data;
    check(result.revision === logRevision + 1 && result.statusCode === target, "WORKLOG_HTTP_STATE_" + action);
    if (action === "cancel-review") check(result.finalScore === null, "WORKLOG_HTTP_CANCEL_SCORE");
    logRevision = result.revision;
    const saved = await snapshot();
    await expect(logPath + "/" + action, 409, "POST", body, true, "WORK_LOG_REVISION_CONFLICT");
    check(await snapshot() === saved, "WORKLOG_HTTP_STALE_" + action);
  }
  const stats = (await (await expect("worklogs/statistics?employeeId=" + owner.employee_id, 200)).json() as {
    data: { reviewedCount: number; totalFinalScore: string; points: { workLogId: number }[] };
  }).data;
  check(stats.reviewedCount === 1 && stats.totalFinalScore === "1" && stats.points[0]?.workLogId === log.id, "WORKLOG_HTTP_REVIEW_STATS");
  const finalized = await snapshot();
  employee = "http-acceptance-owner"; role = "USER";
  await expect(logPath + "/withdraw", 422, "POST", { expectedRevision: logRevision });
  check(await snapshot() === finalized, "WORKLOG_HTTP_REVIEWED_WITHDRAW_MUTATION");
  employee = "http-acceptance-other"; role = "ADMIN";
  await logAction("cancel-review", "pending_review");
  const clearedStats = (await (await expect("worklogs/statistics?employeeId=" + owner.employee_id, 200)).json() as {
    data: { reviewedCount: number; points: unknown[] };
  }).data;
  check(clearedStats.reviewedCount === 0 && clearedStats.points.length === 0, "WORKLOG_HTTP_CANCEL_STATS");
  employee = "http-acceptance-owner"; role = "USER";
  await logAction("withdraw", "created");
  const logProfile = { logDate: "2026-10-02", dateFrom: "2026-10-02", dateTo: "2026-10-02", workDays: "2", typeCode: "daily",
    entries: [{ entryTypeCode: "standard", content: "HTTP lifecycle corrected", platformId: 3001, sortOrder: 0,
      categories: [{ workLogCategoryId: 3002, quantity: "3", sortOrder: 0 }] }] };
  const editLog = { ...logProfile, expectedRevision: logRevision, ...spoof };
  const editedLog = (await (await expect(logPath, 200, "PATCH", editLog)).json() as {
    data: { revision: number; entries: { id: number; content: string; categories: unknown[] }[] };
  }).data;
  check(editedLog.revision === logRevision + 1 && editedLog.entries[0]?.content === "HTTP lifecycle corrected"
    && editedLog.entries[0]?.categories.length === 1, "WORKLOG_HTTP_EDIT_READBACK");
  logRevision = editedLog.revision;
  const editedSaved = await snapshot();
  await expect(logPath, 409, "PATCH", editLog, true, "WORK_LOG_REVISION_CONFLICT");
  check(await snapshot() === editedSaved, "WORKLOG_HTTP_STALE_EDIT");
  await logAction("submit", "pending_review");
  await logAction("withdraw", "created");
  const deletion = { expectedRevision: logRevision };
  await expect(logPath, 200, "DELETE", deletion);
  await expect(logPath, 404);
  check(await db.prepare("SELECT id FROM work_log_entries WHERE work_log_id=?").bind(log.id).first() === null,
    "WORKLOG_HTTP_DELETE_CHILDREN");
  const deletedSaved = await snapshot();
  await expect(logPath, 404, "DELETE", deletion);
  check(await snapshot() === deletedSaved, "WORKLOG_HTTP_DELETE_REPLAY");
  const logAudit = await db.prepare("SELECT action,actor_employee_id FROM audit_events WHERE entity_type='work_log' AND entity_key=? ORDER BY id")
    .bind(String(log.id)).all<{ action: string; actor_employee_id: number }>();
  check(JSON.stringify(logAudit.results.map(row => row.action)) === JSON.stringify([
    "work_log.review.submitted", "work_log.reviewed", "work_log.review.cancelled", "work_log.review.withdrawn",
    "work_log.review.submitted", "work_log.review.withdrawn", "work_log.deleted",
  ]) && logAudit.results[1]?.actor_employee_id === audit.results[0]?.actor_employee_id
    && logAudit.results[2]?.actor_employee_id === audit.results[0]?.actor_employee_id
    && logAudit.results.filter((_, i) => i !== 1 && i !== 2).every(row => row.actor_employee_id === owner.employee_id),
    "WORKLOG_HTTP_LIFECYCLE_AUDIT");
}

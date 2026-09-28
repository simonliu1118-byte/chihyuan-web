import { parseScaled4 } from "../../shared/fixed-point";
import { AuditService } from "../audit/audit-service";
import { CustomerService } from "../customer/customer-service";
import { ItemService } from "../item/item-service";
import { convertScaled4Exact, scaled4ProductToMoney2Exact } from "../item/unit-conversion";
import { OutsourcingService } from "../outsourcing/outsourcing-service";
import { WorkLogService } from "../worklog/work-log-service";

interface Env {
  DB: D1Database;
}

interface AcceptanceChecks {
  customerBatchCreate: boolean;
  optimisticRevision: boolean;
  batchRollback: boolean;
  auditAtomicBatch: boolean;
  fixedPointIntegers: boolean;
  foreignKeys: boolean;
  defectInvalidationMigration: boolean;
  itemConversionExact: boolean;
  outsourcingReversalStock: boolean;
  workLogReviewLifecycle: boolean;
}

function assertAcceptance(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error == null || !("code" in error)) return null;
  return String((error as { code?: unknown }).code ?? "");
}

async function stockBalance(db: D1Database, contractorId: number, itemId: number): Promise<number> {
  const row = await db.prepare(`
    SELECT COALESCE(SUM(quantity_delta), 0) AS balance
      FROM contractor_stock_movements
     WHERE contractor_id = ?1 AND item_id = ?2
  `).bind(contractorId, itemId).first<{ balance: number }>();
  return Number(row?.balance ?? 0);
}

async function runAcceptance(db: D1Database): Promise<AcceptanceChecks> {
  const t0 = "2026-09-28T00:00:00.000Z";
  const t1 = "2026-09-28T00:01:00.000Z";
  const t2 = "2026-09-28T00:02:00.000Z";
  const t3 = "2026-09-28T00:03:00.000Z";
  const t4 = "2026-09-28T00:04:00.000Z";
  const t5 = "2026-09-28T00:05:00.000Z";
  const t6 = "2026-09-28T00:06:00.000Z";
  const t7 = "2026-09-28T00:07:00.000Z";
  const t8 = "2026-09-28T00:08:00.000Z";
  const t9 = "2026-09-28T00:09:00.000Z";

  await db.prepare(`
    INSERT INTO app_members (
      id, identity_employee_id, employee_no, is_active, created_at, updated_at
    ) VALUES (1, 'acceptance-employee-1', 'T0001', 1, ?1, ?1)
  `).bind(t0).run();

  const customerService = new CustomerService(db);
  const created = await customerService.create(
    {
      customerNo: "ACCEPT-001",
      shortName: "D1 Acceptance",
      phones: [{ phoneNumber: "07-0000000", sortOrder: 0 }],
    },
    { actorMemberId: 1, now: t0 },
  );

  assertAcceptance(created.revision === 1, "ACCEPT_CUSTOMER_CREATE_REVISION");
  assertAcceptance(created.phones.length === 1, "ACCEPT_CUSTOMER_CHILD_BATCH");
  const firstPhone = created.phones[0];
  assertAcceptance(firstPhone != null, "ACCEPT_CUSTOMER_PHONE_MISSING");

  const updated = await customerService.update(
    created.id,
    {
      customerNo: created.customerNo,
      shortName: "D1 Acceptance Updated",
      expectedRevision: created.revision,
      phones: [
        {
          id: firstPhone.id,
          phoneNumber: "07-1111111",
          extension: firstPhone.extension,
          note: firstPhone.note,
          sortOrder: 0,
        },
        { phoneNumber: "07-2222222", sortOrder: 1 },
      ],
    },
    { actorMemberId: 1, now: t1 },
  );

  assertAcceptance(updated.revision === 2, "ACCEPT_CUSTOMER_UPDATE_REVISION");
  assertAcceptance(updated.phones.length === 2, "ACCEPT_CUSTOMER_UPDATE_CHILD_BATCH");

  let staleRevisionRejected = false;
  try {
    await customerService.update(
      created.id,
      {
        customerNo: created.customerNo,
        shortName: "Stale write must not win",
        expectedRevision: 1,
      },
      { actorMemberId: 1, now: t2 },
    );
  } catch (error) {
    staleRevisionRejected = errorCode(error) === "CUSTOMER_REVISION_CONFLICT";
  }
  assertAcceptance(staleRevisionRejected, "ACCEPT_STALE_REVISION_NOT_REJECTED");

  const afterStale = await customerService.getDetail(created.id);
  assertAcceptance(afterStale.revision === 2, "ACCEPT_STALE_REVISION_MUTATED");
  assertAcceptance(afterStale.shortName === "D1 Acceptance Updated", "ACCEPT_STALE_WRITE_MUTATED");

  const beforeRollback = await db
    .prepare("SELECT fax, revision FROM customers WHERE id = ?1")
    .bind(created.id)
    .first<{ fax: string | null; revision: number }>();
  assertAcceptance(beforeRollback != null, "ACCEPT_ROLLBACK_CUSTOMER_MISSING");

  let rollbackRejected = false;
  try {
    await db.batch([
      db.prepare("UPDATE customers SET fax = 'ROLLBACK-MUST-NOT-PERSIST' WHERE id = ?1").bind(created.id),
      db.prepare(`
        INSERT INTO audit_events (
          entity_type, entity_key, action, actor_employee_id, occurred_at
        ) VALUES ('customer', ?1, 'acceptance.rollback', 999999, ?2)
      `).bind(String(created.id), t2),
    ]);
  } catch {
    rollbackRejected = true;
  }
  assertAcceptance(rollbackRejected, "ACCEPT_BATCH_FAILURE_NOT_REJECTED");

  const afterRollback = await db
    .prepare("SELECT fax, revision FROM customers WHERE id = ?1")
    .bind(created.id)
    .first<{ fax: string | null; revision: number }>();
  assertAcceptance(afterRollback != null, "ACCEPT_ROLLBACK_READ_FAILED");
  assertAcceptance(afterRollback.fax === beforeRollback.fax, "ACCEPT_BATCH_ROLLBACK_FAILED");
  assertAcceptance(afterRollback.revision === beforeRollback.revision, "ACCEPT_BATCH_ROLLBACK_REVISION_CHANGED");

  const audit = new AuditService(db);
  const atomicResults = await db.batch([
    db.prepare(`
      UPDATE customers
         SET fax = ?1, revision = revision + 1, updated_at = ?2, updated_by = 1
       WHERE id = ?3 AND revision = 2
    `).bind("07-3333333", t2, created.id),
    audit.prepareRecord(
      {
        entityType: "customer",
        entityKey: String(created.id),
        action: "acceptance.atomic",
        actorEmployeeId: 1,
        occurredAt: t2,
        after: { fax: "07-3333333" },
      },
      {
        sql: "EXISTS (SELECT 1 FROM customers WHERE id = ? AND revision = ?)",
        values: [created.id, 3],
      },
    ),
  ]);
  assertAcceptance(Number(atomicResults[0]?.meta?.changes ?? 0) === 1, "ACCEPT_ATOMIC_UPDATE_FAILED");
  assertAcceptance(Number(atomicResults[1]?.meta?.changes ?? 0) === 1, "ACCEPT_ATOMIC_AUDIT_FAILED");

  const atomicRow = await db
    .prepare("SELECT fax, revision FROM customers WHERE id = ?1")
    .bind(created.id)
    .first<{ fax: string | null; revision: number }>();
  assertAcceptance(atomicRow?.fax === "07-3333333" && atomicRow.revision === 3, "ACCEPT_ATOMIC_RESULT_MISMATCH");

  const auditRow = await db
    .prepare(`
      SELECT COUNT(*) AS count
        FROM audit_events
       WHERE entity_type = 'customer'
         AND entity_key = ?1
         AND action = 'acceptance.atomic'
    `)
    .bind(String(created.id))
    .first<{ count: number }>();
  assertAcceptance(Number(auditRow?.count ?? 0) === 1, "ACCEPT_AUDIT_ROW_MISSING");

  await db.prepare(`
    INSERT INTO items (
      id, item_no, name, base_unit,
      cost, cost_tax_mode, store_price, clinic_price,
      is_active, created_at, created_by, updated_at, updated_by, revision
    ) VALUES (
      1001, 'ACCEPT-ITEM-001', 'Acceptance Item', 'EA',
      123456, 'none', 234567, 345678,
      1, ?1, 1, ?1, 1, 1
    )
  `).bind(t0).run();

  const item = await db.prepare(`
    SELECT cost, store_price, clinic_price
      FROM items
     WHERE id = 1001
  `).first<{ cost: number; store_price: number; clinic_price: number }>();
  assertAcceptance(
    item?.cost === 123456 && item.store_price === 234567 && item.clinic_price === 345678,
    "ACCEPT_FIXED_POINT_INTEGER_MISMATCH",
  );

  let foreignKeyRejected = false;
  try {
    await db.prepare(`
      INSERT INTO customer_visits (
        id, customer_id, visit_date, employee_id,
        created_at, created_by, updated_at, updated_by, revision
      ) VALUES (1001, 999999, '2026-09-28', 1, ?1, 1, ?1, 1, 1)
    `).bind(t0).run();
  } catch {
    foreignKeyRejected = true;
  }
  assertAcceptance(foreignKeyRejected, "ACCEPT_FOREIGN_KEY_NOT_ENFORCED");

  const defectColumns = await db
    .prepare("PRAGMA table_info(defect_reports)")
    .all<{ name: string }>();
  const columnNames = new Set(defectColumns.results.map((row) => row.name));
  assertAcceptance(columnNames.has("invalidated_at"), "ACCEPT_DEFECT_INVALIDATED_AT_MISSING");
  assertAcceptance(columnNames.has("invalidated_by"), "ACCEPT_DEFECT_INVALIDATED_BY_MISSING");

  // Item domain: persist a chained conversion graph through ItemService, then
  // prove exact scaled4 conversion and exact money2 multiplication from the
  // database-backed conversion values.
  const itemService = new ItemService(db);
  const componentItem = await itemService.create(
    {
      itemNo: "ACC-COMP-001",
      name: "Acceptance Component",
      baseUnit: "EA",
      cost: "1.2345",
      costTaxMode: "none",
      storePrice: "2.5",
      clinicPrice: "3.75",
      unitConversions: [
        { fromUnit: "BOX", quantity: "12", toUnit: "EA", sortOrder: 0 },
        { fromUnit: "CASE", quantity: "2", toUnit: "BOX", sortOrder: 1 },
      ],
    },
    { actorMemberId: 1, now: t3 },
  );
  const finishedItem = await itemService.create(
    {
      itemNo: "ACC-FIN-001",
      name: "Acceptance Finished Item",
      baseUnit: "EA",
      cost: "2",
      costTaxMode: "none",
    },
    { actorMemberId: 1, now: t3 },
  );
  assertAcceptance(componentItem.unitConversions.length === 2, "ACCEPT_ITEM_CONVERSION_ROWS_MISSING");
  const persistedConversions = await db.prepare(`
    SELECT from_unit, quantity, to_unit
      FROM item_unit_conversions
     WHERE item_id = ?1
     ORDER BY sort_order, id
  `).bind(componentItem.id).all<{ from_unit: string; quantity: number; to_unit: string }>();
  const edges = persistedConversions.results.map((row) => ({
    fromUnit: row.from_unit,
    quantityScaled4: row.quantity,
    toUnit: row.to_unit,
  }));
  assertAcceptance(edges.length === 2, "ACCEPT_ITEM_CONVERSION_DB_ROWS_MISSING");
  assertAcceptance(edges[0]?.quantityScaled4 === 120000, "ACCEPT_ITEM_BOX_FACTOR_MISMATCH");
  assertAcceptance(edges[1]?.quantityScaled4 === 20000, "ACCEPT_ITEM_CASE_FACTOR_MISMATCH");
  const convertedCase = convertScaled4Exact(15000, "CASE", "EA", "EA", edges);
  assertAcceptance(convertedCase === 360000, "ACCEPT_ITEM_CHAINED_CONVERSION_MISMATCH");
  assertAcceptance(
    scaled4ProductToMoney2Exact(convertedCase, 12500) === 4500,
    "ACCEPT_ITEM_EXACT_MONEY_MISMATCH",
  );

  // Outsourcing domain: pending is plan-only; confirm creates actual stock,
  // correction reverses old actual movements and writes replacements, and
  // cancellation reverses the replacement so derived stock returns to zero.
  await db.prepare(`
    INSERT INTO contractors (
      id, entity_type, display_name, is_active,
      created_at, created_by, updated_at, updated_by, revision
    ) VALUES (2001, 'organization', 'Acceptance Contractor', 1, ?1, 1, ?1, 1, 1)
  `).bind(t3).run();
  const outsourcingService = new OutsourcingService(db, {
    nextReference: async () => "ACC-OUT-001",
  });
  const outsourcingCreated = await outsourcingService.create(
    {
      contractorId: 2001,
      operatorEmployeeId: 1,
      orderDate: "2026-09-28",
      parts: [
        {
          finishedItemId: finishedItem.id,
          componentItemId: componentItem.id,
          quantity: "2",
          unit: "CASE",
          sortOrder: 0,
        },
      ],
    },
    { actorMemberId: 1, now: t4 },
  );
  assertAcceptance(outsourcingCreated.statusCode === "pending_outbound", "ACCEPT_OUTSOURCING_CREATE_STATUS");
  assertAcceptance(
    await stockBalance(db, 2001, componentItem.id) === 0,
    "ACCEPT_OUTSOURCING_PENDING_CHANGED_STOCK",
  );

  const outsourcingConfirmed = await outsourcingService.confirmOutbound(
    outsourcingCreated.id,
    {
      expectedRevision: outsourcingCreated.revision,
      effectiveDate: "2026-09-28",
      reason: "acceptance confirm",
    },
    { actorMemberId: 1, now: t5 },
  );
  assertAcceptance(outsourcingConfirmed.statusCode === "outbound", "ACCEPT_OUTSOURCING_CONFIRM_STATUS");
  assertAcceptance(
    await stockBalance(db, 2001, componentItem.id) === 480000,
    "ACCEPT_OUTSOURCING_CONFIRM_BALANCE",
  );

  const outsourcingCorrected = await outsourcingService.correctOutbound(
    outsourcingConfirmed.id,
    {
      expectedRevision: outsourcingConfirmed.revision,
      contractorId: 2001,
      operatorEmployeeId: 1,
      orderDate: "2026-09-28",
      parts: [
        {
          finishedItemId: finishedItem.id,
          componentItemId: componentItem.id,
          quantity: "3",
          unit: "CASE",
          sortOrder: 0,
        },
      ],
    },
    "acceptance correction",
    { actorMemberId: 1, now: t6, allowOutboundCorrection: true },
  );
  assertAcceptance(outsourcingCorrected.statusCode === "outbound", "ACCEPT_OUTSOURCING_CORRECTION_STATUS");
  assertAcceptance(
    await stockBalance(db, 2001, componentItem.id) === 720000,
    "ACCEPT_OUTSOURCING_CORRECTION_BALANCE",
  );
  const correctedMovementRows = await db.prepare(`
    SELECT movement_type, quantity_delta, reversal_of_movement_id
      FROM contractor_stock_movements
     WHERE outsourcing_order_id = ?1
     ORDER BY id
  `).bind(outsourcingCreated.id).all<{
    movement_type: string;
    quantity_delta: number;
    reversal_of_movement_id: number | null;
  }>();
  assertAcceptance(correctedMovementRows.results.length === 3, "ACCEPT_OUTSOURCING_CORRECTION_MOVEMENT_COUNT");
  assertAcceptance(
    correctedMovementRows.results.filter((row) => row.movement_type === "reversal").length === 1,
    "ACCEPT_OUTSOURCING_CORRECTION_REVERSAL_MISSING",
  );

  const outsourcingCancelled = await outsourcingService.cancelOutbound(
    outsourcingCorrected.id,
    {
      expectedRevision: outsourcingCorrected.revision,
      reason: "acceptance cancellation",
    },
    { actorMemberId: 1, now: t7, allowOutboundCancellation: true },
  );
  assertAcceptance(outsourcingCancelled.statusCode === "voided", "ACCEPT_OUTSOURCING_CANCEL_STATUS");
  assertAcceptance(
    await stockBalance(db, 2001, componentItem.id) === 0,
    "ACCEPT_OUTSOURCING_CANCEL_BALANCE",
  );
  const finalMovementRows = await db.prepare(`
    SELECT movement_type, quantity_delta, reversal_of_movement_id
      FROM contractor_stock_movements
     WHERE outsourcing_order_id = ?1
     ORDER BY id
  `).bind(outsourcingCreated.id).all<{
    movement_type: string;
    quantity_delta: number;
    reversal_of_movement_id: number | null;
  }>();
  assertAcceptance(finalMovementRows.results.length === 4, "ACCEPT_OUTSOURCING_FINAL_MOVEMENT_COUNT");
  assertAcceptance(
    finalMovementRows.results.filter((row) => row.movement_type === "reversal" && row.reversal_of_movement_id != null).length === 2,
    "ACCEPT_OUTSOURCING_LINKED_REVERSALS_MISSING",
  );

  // WorkLog domain: owner creates/submits, reviewer finalizes corrected Work Days
  // and scores, statistics read the stored finalized result, then cancel-review
  // returns to pending_review and clears the current finalized projection.
  await db.prepare(`
    INSERT INTO app_members (
      id, identity_employee_id, employee_no, is_active, created_at, updated_at
    ) VALUES (2, 'acceptance-reviewer-2', 'T0002', 1, ?1, ?1)
  `).bind(t3).run();
  await db.batch([
    db.prepare(`
      INSERT INTO work_log_categories (
        id, code, name, input_mode, sort_order, is_active, updated_at, updated_by
      ) VALUES (3001, 'ACC-BOOL', 'Acceptance Boolean', 'boolean', 0, 1, ?1, 1)
    `).bind(t3),
    db.prepare(`
      INSERT INTO work_log_categories (
        id, code, name, input_mode, unit_label, sort_order, is_active, updated_at, updated_by
      ) VALUES (3002, 'ACC-QTY', 'Acceptance Quantity', 'quantity', '件', 1, 1, ?1, 1)
    `).bind(t3),
    db.prepare(`
      INSERT INTO work_log_platforms (
        id, code, name, sort_order, is_active, updated_at, updated_by
      ) VALUES (3001, 'ACC-PLATFORM', 'Acceptance Platform', 0, 1, ?1, 1)
    `).bind(t3),
  ]);

  const workLogService = new WorkLogService(db, {
    nextReference: async () => "ACC-WL-001",
  });
  const workLogCreated = await workLogService.create(
    {
      logDate: "2026-09-28",
      dateFrom: "2026-09-28",
      dateTo: "2026-09-28",
      workDays: "2",
      typeCode: "daily",
      entries: [
        {
          entryTypeCode: "standard",
          content: "Acceptance A",
          platformId: 3001,
          sortOrder: 0,
          categories: [
            { workLogCategoryId: 3001, quantity: "1", sortOrder: 0 },
          ],
        },
        {
          entryTypeCode: "standard",
          content: "Acceptance B",
          platformId: 3001,
          sortOrder: 1,
          categories: [
            { workLogCategoryId: 3002, quantity: "3", sortOrder: 0 },
          ],
        },
      ],
    },
    { actorMemberId: 1, now: t6 },
  );
  assertAcceptance(workLogCreated.statusCode === "created", "ACCEPT_WORKLOG_CREATE_STATUS");
  assertAcceptance(workLogCreated.entries.length === 2, "ACCEPT_WORKLOG_CREATE_ENTRIES");

  const workLogSubmitted = await workLogService.submitForReview(
    workLogCreated.id,
    { expectedRevision: workLogCreated.revision, reason: "acceptance submit" },
    { actorMemberId: 1, now: t7 },
  );
  assertAcceptance(workLogSubmitted.statusCode === "pending_review", "ACCEPT_WORKLOG_SUBMIT_STATUS");

  const reviewEntries = workLogSubmitted.entries.map((entry, index) => ({
    entryId: entry.id,
    reviewRemark: index === 0 ? "first" : "second",
    reviewScore: index === 0 ? "10" : "20",
  }));
  const workLogReviewed = await workLogService.review(
    workLogSubmitted.id,
    {
      expectedRevision: workLogSubmitted.revision,
      workDays: "2.5",
      reviewRemark: "acceptance reviewed",
      entries: reviewEntries,
    },
    { actorMemberId: 2, now: t8, allowReview: true, allowCrossEmployeeRead: true },
  );
  assertAcceptance(workLogReviewed.statusCode === "reviewed", "ACCEPT_WORKLOG_REVIEW_STATUS");
  assertAcceptance(parseScaled4(workLogReviewed.workDays) === 25000, "ACCEPT_WORKLOG_REVIEW_WORK_DAYS");
  assertAcceptance(parseScaled4(workLogReviewed.finalScore ?? "0") === 300000, "ACCEPT_WORKLOG_FINAL_SCORE");
  assertAcceptance(parseScaled4(workLogReviewed.averageDailyScore ?? "0") === 120000, "ACCEPT_WORKLOG_AVERAGE_SCORE");
  assertAcceptance(
    workLogReviewed.entries.every((entry) => entry.reviewScore != null),
    "ACCEPT_WORKLOG_ENTRY_SCORE_MISSING",
  );

  const reviewedStats = await workLogService.statistics(
    { employeeId: 1 },
    { actorMemberId: 2, allowCrossEmployeeRead: true },
  );
  assertAcceptance(reviewedStats.reviewedCount === 1, "ACCEPT_WORKLOG_STATS_COUNT");
  assertAcceptance(parseScaled4(reviewedStats.totalWorkDays) === 25000, "ACCEPT_WORKLOG_STATS_WORK_DAYS");
  assertAcceptance(parseScaled4(reviewedStats.totalFinalScore) === 300000, "ACCEPT_WORKLOG_STATS_FINAL_SCORE");
  assertAcceptance(
    parseScaled4(reviewedStats.weightedAverageDailyScore ?? "0") === 120000,
    "ACCEPT_WORKLOG_STATS_AVERAGE",
  );

  const workLogCancelled = await workLogService.cancelReview(
    workLogReviewed.id,
    { expectedRevision: workLogReviewed.revision, reason: "acceptance cancel review" },
    { actorMemberId: 2, now: t9, allowReview: true, allowCrossEmployeeRead: true },
  );
  assertAcceptance(workLogCancelled.statusCode === "pending_review", "ACCEPT_WORKLOG_CANCEL_STATUS");
  assertAcceptance(workLogCancelled.reviewedBy == null, "ACCEPT_WORKLOG_CANCEL_REVIEWER_NOT_CLEARED");
  assertAcceptance(workLogCancelled.finalScore == null, "ACCEPT_WORKLOG_CANCEL_FINAL_SCORE_NOT_CLEARED");
  assertAcceptance(workLogCancelled.averageDailyScore == null, "ACCEPT_WORKLOG_CANCEL_AVERAGE_NOT_CLEARED");
  assertAcceptance(
    workLogCancelled.entries.every((entry) => entry.reviewScore == null && entry.reviewRemark == null),
    "ACCEPT_WORKLOG_CANCEL_ENTRY_REVIEW_NOT_CLEARED",
  );
  const cancelledStats = await workLogService.statistics(
    { employeeId: 1 },
    { actorMemberId: 2, allowCrossEmployeeRead: true },
  );
  assertAcceptance(cancelledStats.reviewedCount === 0, "ACCEPT_WORKLOG_CANCELLED_STATS_STILL_ACTIVE");
  const workLogAudit = await db.prepare(`
    SELECT COUNT(*) AS count
      FROM audit_events
     WHERE entity_type = 'work_log'
       AND entity_key = ?1
       AND action IN ('work_log.review.submitted', 'work_log.reviewed', 'work_log.review.cancelled')
  `).bind(String(workLogCreated.id)).first<{ count: number }>();
  assertAcceptance(Number(workLogAudit?.count ?? 0) === 3, "ACCEPT_WORKLOG_AUDIT_SEQUENCE_MISSING");

  return {
    customerBatchCreate: true,
    optimisticRevision: true,
    batchRollback: true,
    auditAtomicBatch: true,
    fixedPointIntegers: true,
    foreignKeys: true,
    defectInvalidationMigration: true,
    itemConversionExact: true,
    outsourcingReversalStock: true,
    workLogReviewLifecycle: true,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/__d1_acceptance") {
      return jsonResponse({ ok: false, error: "NOT_FOUND" }, 404);
    }

    try {
      const checks = await runAcceptance(env.DB);
      return jsonResponse({ ok: true, checks });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonResponse({ ok: false, error: message }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

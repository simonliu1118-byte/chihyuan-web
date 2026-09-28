import { AuditService } from "../audit/audit-service";
import { CustomerService } from "../customer/customer-service";

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
}

function assertAcceptance(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error == null || !("code" in error)) return null;
  return String((error as { code?: unknown }).code ?? "");
}

async function runAcceptance(db: D1Database): Promise<AcceptanceChecks> {
  const t0 = "2026-09-28T00:00:00.000Z";
  const t1 = "2026-09-28T00:01:00.000Z";
  const t2 = "2026-09-28T00:02:00.000Z";

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

  return {
    customerBatchCreate: true,
    optimisticRevision: true,
    batchRollback: true,
    auditAtomicBatch: true,
    fixedPointIntegers: true,
    foreignKeys: true,
    defectInvalidationMigration: true,
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

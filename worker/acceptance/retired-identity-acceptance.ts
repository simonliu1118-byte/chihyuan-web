import { AuditService } from "../audit/audit-service";
import { nextEntityIdSql, type StableEntityTable } from "../persistence/entity-id";
import { CustomerRelatedService } from "../customer/customer-related-service";
import { WorkLogService } from "../worklog/work-log-service";
import { ContractorService } from "../contractor/contractor-service";
import { OutsourcingService } from "../outsourcing/outsourcing-service";

const entities: readonly [StableEntityTable, string][] = [
  ["customers", "customer"], ["items", "item"], ["defect_reports", "defect"],
  ["sales_work_orders", "sales_work_order"], ["outsourcing_orders", "outsourcing_order"],
  ["contractors", "contractor"], ["work_logs", "work_log"],
  ["customer_visits", "customer_visit"], ["customer_frequent_items", "customer_frequent_item"],
];
function check(value: unknown, code: string): asserts value {
  if (!value) throw new Error("ACCEPT_RETIRED_ID_" + code);
}
async function clone(db: D1Database, table: StableEntityTable): Promise<number> {
  const sample = await db.prepare(`SELECT * FROM ${table} ORDER BY id LIMIT 1`).first<Record<string, string | number | null>>();
  check(sample, "SAMPLE_" + table);
  const names = Object.keys(sample);
  const unique = new Set(["customer_no", "item_no", "work_order_ref", "outsourcing_ref", "work_log_ref"]);
  const values = names.filter(name => name !== "id").map(name => unique.has(name) ? "ACC-RETIRED-" + crypto.randomUUID() : sample[name]);
  const result = await db.prepare(`INSERT INTO ${table} (${names.join(",")}) VALUES (${names.map(name => name === "id" ? nextEntityIdSql(table) : "?").join(",")}) RETURNING id`)
    .bind(...values).all<{ id: number }>();
  const id = result.results[0]?.id;
  check(id && Number.isSafeInteger(id), "CLONE_" + table);
  return id;
}

/** ID infrastructure fixtures only, not additional business lifecycle claims. */
export async function acceptRetiredIdentitySource(db: D1Database): Promise<void> {
  const customer = await db.prepare("SELECT id FROM customers ORDER BY id LIMIT 1").first<{ id: number }>();
  check(customer, "CUSTOMER_SAMPLE");
  const context = { actorMemberId: 1, now: "2026-10-02T12:30:00Z" };
  const related = new CustomerRelatedService(db);
  const visitInput = { visitDate: "2026-10-02", employeeId: 1, content: "Isolated identity sample" };
  const visit = await related.createVisit(customer.id, visitInput, context);
  await related.deleteVisit(customer.id, visit.id, { expectedRevision: visit.revision }, context);
  const nextVisit = await related.createVisit(customer.id, visitInput, context);
  check(nextVisit.id > visit.id, "VISIT_SERVICE_NONREUSE");
  const frequentInput = { customItemName: "Isolated identity sample", sortOrder: 0 };
  const frequent = await related.createFrequentItem(customer.id, frequentInput, context);
  await related.deleteFrequentItem(customer.id, frequent, { expectedUpdatedAt: context.now });
  check(await related.createFrequentItem(customer.id, frequentInput, context) > frequent, "FREQUENT_SERVICE_NONREUSE");
  const logs = new WorkLogService(db, { nextReference: async () => "ACC-RETIRED-WL-" + crypto.randomUUID() });
  const logInput = { logDate: "2026-10-02", dateFrom: "2026-10-02", dateTo: "2026-10-02", workDays: "1", typeCode: "daily", entries: [{ entryTypeCode: "standard", content: "Isolated deletion", sortOrder: 0 }] };
  const log = await logs.create(logInput, context);
  await logs.deleteCreated(log.id, log.revision, context);
  check((await logs.create(logInput, context)).id > log.id, "WORKLOG_SERVICE_NONREUSE");
  const contractors = new ContractorService(db);
  const contractorInput = { entityType: "person", displayName: "Isolated retirement contractor", contacts: [] };
  const contractor = await contractors.create(contractorInput, context);
  const item = await db.prepare("SELECT id,base_unit FROM items ORDER BY id LIMIT 1").first<{ id: number; base_unit: string }>();
  check(item, "OUTSOURCING_COMPONENT");
  const outsourcing = new OutsourcingService(db, { nextReference: async () => "ACC-RETIRED-OUT-" + crypto.randomUUID() });
  const outboundInput = { contractorId: contractor.id, operatorEmployeeId: 1, orderDate: "2026-10-02", parts: [{ componentItemId: item.id, quantity: "1", unit: item.base_unit, sortOrder: 0 }] };
  const outbound = await outsourcing.create(outboundInput, context);
  await outsourcing.deletePending(outbound.id, outbound.revision, { ...context, allowHardDelete: true });
  const nextOutbound = await outsourcing.create(outboundInput, context);
  check(nextOutbound.id > outbound.id, "OUTSOURCING_SERVICE_NONREUSE");
  await outsourcing.deletePending(nextOutbound.id, nextOutbound.revision, { ...context, allowHardDelete: true });
  await contractors.deleteNeverUsed(contractor.id, contractor.revision, context, true);
  check((await contractors.create(contractorInput, context)).id > contractor.id, "CONTRACTOR_SERVICE_NONREUSE");
  for (const [table, type] of entities) {
    const id = await clone(db, table);
    await new AuditService(db).record({ entityType: type, entityKey: String(id), action: "acceptance.identity.retired", actorEmployeeId: 1, occurredAt: "2026-10-02T12:30:00Z" });
    const removed = await db.prepare(`DELETE FROM ${table} WHERE id=? RETURNING id`).bind(id).all<{ id: number }>();
    check(removed.results.length === 1, "DELETE_" + table);
    const next = await db.prepare(`SELECT ${nextEntityIdSql(table)} AS id`).first<{ id: number }>();
    check(next && next.id > id, "SOURCE_NONREUSE_" + table);
    // Failure after DELETE must roll back both record removal and retirement.
    const before = await db.prepare("SELECT * FROM entity_id_high_watermarks ORDER BY table_name").all();
    let failed = false;
    try { await db.batch([db.prepare(`DELETE FROM ${table} WHERE id=(SELECT MAX(id) FROM ${table})`), db.prepare("SELECT json('')")]); }
    catch { failed = true; }
    const after = await db.prepare("SELECT * FROM entity_id_high_watermarks ORDER BY table_name").all();
    check(failed && JSON.stringify(before.results) === JSON.stringify(after.results), "ROLLBACK_" + table);
  }
}

export async function acceptRetiredIdentityRestore(source: D1Database, target: D1Database): Promise<void> {
  for (const [table, type] of entities) {
    const expected = await source.prepare(`SELECT ${nextEntityIdSql(table)} AS id`).first<{ id: number }>();
    const id = await clone(target, table);
    check(id === expected?.id, "RESTORED_ALLOCATION_" + table);
    const audit = await target.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE entity_type=? AND entity_key=?").bind(type, String(id)).first<{ n: number }>();
    check(audit?.n === 0, "RESTORED_AUDIT_ISOLATION_" + table);
  }
}

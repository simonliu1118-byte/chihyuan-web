import type {
  CustomerFrequentItemRecord,
  CustomerItemQuoteDetail,
  CustomerVisitRecord,
} from "../../shared/customer-related";
import { formatScaled4 } from "../../shared/fixed-point";
import { AuditService, type AuditPayload } from "../audit/audit-service";
import type {
  NormalizedCorrectQuoteRequest,
  NormalizedCreateFrequentItemRequest,
  NormalizedCreateQuoteRequest,
  NormalizedCreateVisitRequest,
  NormalizedUpdateFrequentItemRequest,
  NormalizedUpdateVisitRequest,
} from "./customer-related-validation";

export interface CustomerRelatedMutationContext {
  actorMemberId: number;
  now: string;
  requestId?: string | null;
}

export interface ActiveItemSnapshot {
  id: number;
  itemNo: string;
  name: string;
  spec: string | null;
}

function assertContext(context: CustomerRelatedMutationContext): void {
  if (!Number.isSafeInteger(context.actorMemberId) || context.actorMemberId <= 0) {
    throw new Error("CUSTOMER_RELATED_MUTATION_ACTOR_REQUIRED");
  }
  if (!context.now || Number.isNaN(Date.parse(context.now))) {
    throw new Error("CUSTOMER_RELATED_MUTATION_TIMESTAMP_REQUIRED");
  }
}

function visitAuditPayload(visit: CustomerVisitRecord): AuditPayload {
  return {
    customerId: visit.customerId,
    visitDate: visit.visitDate,
    contactId: visit.contactId,
    personSnapshot: visit.personSnapshot,
    employeeId: visit.employee.id,
    content: visit.content,
    revision: visit.revision,
  };
}

function quoteAuditPayload(quote: CustomerItemQuoteDetail): AuditPayload {
  return {
    customerId: quote.customerId,
    itemId: quote.itemId,
    quoteDate: quote.quoteDate,
    employeeId: quote.employee.id,
    itemNoSnapshot: quote.itemNoSnapshot,
    itemNameSnapshot: quote.itemNameSnapshot,
    specSnapshot: quote.specSnapshot,
    revision: quote.revision,
    priceBreaks: quote.priceBreaks.map((row) => ({
      quantity: row.quantity,
      unit: row.unit,
      unitPrice: row.unitPrice,
      note: row.note,
      sortOrder: row.sortOrder,
    })),
  };
}

function correctedQuoteAuditPayload(
  customerId: number,
  item: ActiveItemSnapshot,
  input: NormalizedCorrectQuoteRequest,
): AuditPayload {
  return {
    customerId,
    itemId: item.id,
    quoteDate: input.quoteDate,
    employeeId: input.employeeId,
    itemNoSnapshot: item.itemNo,
    itemNameSnapshot: item.name,
    specSnapshot: item.spec,
    revision: input.expectedRevision + 1,
    priceBreaks: input.priceBreaks.map((row) => ({
      quantity: formatScaled4(row.quantity),
      unit: row.unit,
      unitPrice: formatScaled4(row.unitPrice),
      note: row.note,
      sortOrder: row.sortOrder,
    })),
  };
}

export class CustomerRelatedMutationRepository {
  private readonly audit: AuditService;

  constructor(private readonly db: D1Database) {
    this.audit = new AuditService(db);
  }

  async activeEmployeeExists(employeeId: number): Promise<boolean> {
    const row = await this.db.prepare(`
      SELECT 1 AS found
        FROM app_members
       WHERE id = ?1 AND is_active = 1
       LIMIT 1
    `).bind(employeeId).first<{ found: number }>();
    return row != null;
  }

  async activeContactName(customerId: number, contactId: number): Promise<string | null> {
    const row = await this.db.prepare(`
      SELECT name
        FROM customer_contacts
       WHERE id = ?1
         AND customer_id = ?2
         AND is_active = 1
       LIMIT 1
    `).bind(contactId, customerId).first<{ name: string }>();
    return row?.name ?? null;
  }

  async activeItemSnapshot(itemId: number): Promise<ActiveItemSnapshot | null> {
    const row = await this.db.prepare(`
      SELECT id, item_no, name, spec
        FROM items
       WHERE id = ?1 AND is_active = 1
       LIMIT 1
    `).bind(itemId).first<{
      id: number;
      item_no: string;
      name: string;
      spec: string | null;
    }>();
    if (!row) return null;
    return { id: row.id, itemNo: row.item_no, name: row.name, spec: row.spec };
  }

  async createVisit(
    customerId: number,
    input: NormalizedCreateVisitRequest,
    employeeId: number,
    personSnapshot: string | null,
    context: CustomerRelatedMutationContext,
  ): Promise<number> {
    assertContext(context);
    const result = await this.db.prepare(`
      INSERT INTO customer_visits (
        customer_id, visit_date, contact_id, person_snapshot, employee_id, content,
        created_at, created_by, updated_at, updated_by, revision
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?7, ?8, 1)
    `).bind(
      customerId,
      input.visitDate,
      input.contactId,
      personSnapshot,
      employeeId,
      input.content,
      context.now,
      context.actorMemberId,
    ).run();
    const id = Number(result.meta.last_row_id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("CUSTOMER_VISIT_CREATE_FAILED");
    return id;
  }

  async updateVisit(
    customerId: number,
    visitId: number,
    input: NormalizedUpdateVisitRequest,
    employeeId: number,
    personSnapshot: string | null,
    context: CustomerRelatedMutationContext,
  ): Promise<boolean> {
    assertContext(context);
    const result = await this.db.prepare(`
      UPDATE customer_visits
         SET visit_date = ?1,
             contact_id = ?2,
             person_snapshot = ?3,
             employee_id = ?4,
             content = ?5,
             updated_at = ?6,
             updated_by = ?7,
             revision = revision + 1
       WHERE id = ?8
         AND customer_id = ?9
         AND revision = ?10
    `).bind(
      input.visitDate,
      input.contactId,
      personSnapshot,
      employeeId,
      input.content,
      context.now,
      context.actorMemberId,
      visitId,
      customerId,
      input.expectedRevision,
    ).run();
    return Number(result.meta.changes ?? 0) === 1;
  }

  async deleteVisit(
    visit: CustomerVisitRecord,
    expectedRevision: number,
    context: CustomerRelatedMutationContext,
  ): Promise<boolean> {
    assertContext(context);
    const condition = {
      sql: `EXISTS (
        SELECT 1 FROM customer_visits
         WHERE customer_id = ? AND id = ? AND revision = ?
      )`,
      values: [visit.customerId, visit.id, expectedRevision],
    } as const;
    const audit = this.audit.prepareRecord({
      entityType: "customer_visit",
      entityKey: String(visit.id),
      action: "deleted",
      actorEmployeeId: context.actorMemberId,
      occurredAt: context.now,
      requestId: context.requestId,
      before: visitAuditPayload(visit),
      metadata: { customerId: visit.customerId },
    }, condition);
    const remove = this.db.prepare(`
      DELETE FROM customer_visits
       WHERE customer_id = ?1 AND id = ?2 AND revision = ?3
    `).bind(visit.customerId, visit.id, expectedRevision);
    const results = await this.db.batch([audit, remove]);
    return Number(results[1]?.meta?.changes ?? 0) === 1;
  }

  async createFrequentItem(
    customerId: number,
    input: NormalizedCreateFrequentItemRequest,
    context: CustomerRelatedMutationContext,
  ): Promise<number> {
    assertContext(context);
    const result = await this.db.prepare(`
      INSERT INTO customer_frequent_items (
        customer_id, item_id, custom_item_name, custom_category_name,
        sort_order, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
    `).bind(
      customerId,
      input.itemId,
      input.customItemName,
      input.customCategoryName,
      input.sortOrder,
      context.now,
    ).run();
    const id = Number(result.meta.last_row_id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("CUSTOMER_FREQUENT_CREATE_FAILED");
    return id;
  }

  async updateFrequentItem(
    customerId: number,
    frequentId: number,
    input: NormalizedUpdateFrequentItemRequest,
    context: CustomerRelatedMutationContext,
  ): Promise<boolean> {
    assertContext(context);
    const result = await this.db.prepare(`
      UPDATE customer_frequent_items
         SET item_id = ?1,
             custom_item_name = ?2,
             custom_category_name = ?3,
             sort_order = ?4,
             updated_at = ?5
       WHERE customer_id = ?6
         AND id = ?7
         AND updated_at = ?8
    `).bind(
      input.itemId,
      input.customItemName,
      input.customCategoryName,
      input.sortOrder,
      context.now,
      customerId,
      frequentId,
      input.expectedUpdatedAt,
    ).run();
    return Number(result.meta.changes ?? 0) === 1;
  }

  async deleteFrequentItem(
    customerId: number,
    frequentId: number,
    expectedUpdatedAt: string,
  ): Promise<boolean> {
    const result = await this.db.prepare(`
      DELETE FROM customer_frequent_items
       WHERE customer_id = ?1
         AND id = ?2
         AND updated_at = ?3
    `).bind(customerId, frequentId, expectedUpdatedAt).run();
    return Number(result.meta.changes ?? 0) === 1;
  }

  async createQuote(
    customerId: number,
    input: NormalizedCreateQuoteRequest,
    item: ActiveItemSnapshot,
    employeeId: number,
    context: CustomerRelatedMutationContext,
  ): Promise<number> {
    assertContext(context);
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`
        INSERT INTO customer_item_quotes (
          customer_id, item_id, quote_date, employee_id,
          item_no_snapshot, item_name_snapshot, spec_snapshot,
          created_at, created_by, updated_at, updated_by, revision
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?8, ?9, 1)
      `).bind(
        customerId,
        item.id,
        input.quoteDate,
        employeeId,
        item.itemNo,
        item.name,
        item.spec,
        context.now,
        context.actorMemberId,
      ),
    ];

    for (const row of input.priceBreaks) {
      statements.push(this.db.prepare(`
        INSERT INTO quote_price_breaks (
          quote_id, quantity, unit, unit_price, note, sort_order
        )
        SELECT MAX(id), ?1, ?2, ?3, ?4, ?5
          FROM customer_item_quotes
      `).bind(row.quantity, row.unit, row.unitPrice, row.note, row.sortOrder));
    }
    statements.push(this.db.prepare("SELECT MAX(id) AS quote_id FROM customer_item_quotes"));

    const results = await this.db.batch(statements);
    const row = results[results.length - 1]?.results?.[0] as { quote_id?: number } | undefined;
    const quoteId = Number(row?.quote_id ?? 0);
    if (!Number.isSafeInteger(quoteId) || quoteId <= 0) {
      throw new Error("CUSTOMER_QUOTE_CREATE_FAILED");
    }
    return quoteId;
  }

  async correctQuote(
    before: CustomerItemQuoteDetail,
    input: NormalizedCorrectQuoteRequest,
    item: ActiveItemSnapshot,
    employeeId: number,
    context: CustomerRelatedMutationContext,
  ): Promise<boolean> {
    assertContext(context);
    const afterInput: NormalizedCorrectQuoteRequest = { ...input, employeeId };
    const condition = {
      sql: `EXISTS (
        SELECT 1 FROM customer_item_quotes
         WHERE customer_id = ? AND id = ? AND revision = ?
      )`,
      values: [before.customerId, before.id, input.expectedRevision],
    } as const;

    const audit = this.audit.prepareRecord({
      entityType: "customer_item_quote",
      entityKey: String(before.id),
      action: "corrected",
      actorEmployeeId: context.actorMemberId,
      occurredAt: context.now,
      requestId: context.requestId,
      before: quoteAuditPayload(before),
      after: correctedQuoteAuditPayload(before.customerId, item, afterInput),
      metadata: input.correctionReason
        ? { customerId: before.customerId, correctionReason: input.correctionReason }
        : { customerId: before.customerId },
    }, condition);

    const update = this.db.prepare(`
      UPDATE customer_item_quotes
         SET item_id = ?1,
             quote_date = ?2,
             employee_id = ?3,
             item_no_snapshot = ?4,
             item_name_snapshot = ?5,
             spec_snapshot = ?6,
             updated_at = ?7,
             updated_by = ?8,
             revision = revision + 1
       WHERE customer_id = ?9
         AND id = ?10
         AND revision = ?11
    `).bind(
      item.id,
      input.quoteDate,
      employeeId,
      item.itemNo,
      item.name,
      item.spec,
      context.now,
      context.actorMemberId,
      before.customerId,
      before.id,
      input.expectedRevision,
    );

    const quoteUpdated = `EXISTS (
      SELECT 1 FROM customer_item_quotes
       WHERE customer_id = ? AND id = ? AND revision = ? AND updated_at = ? AND updated_by = ?
    )`;
    const updatedValues = [
      before.customerId,
      before.id,
      input.expectedRevision + 1,
      context.now,
      context.actorMemberId,
    ] as const;

    const statements: D1PreparedStatement[] = [
      audit,
      update,
      this.db.prepare(`
        DELETE FROM quote_price_breaks
         WHERE quote_id = ?
           AND ${quoteUpdated}
      `).bind(before.id, ...updatedValues),
    ];

    for (const row of input.priceBreaks) {
      statements.push(this.db.prepare(`
        INSERT INTO quote_price_breaks (quote_id, quantity, unit, unit_price, note, sort_order)
        SELECT ?, ?, ?, ?, ?, ?
         WHERE ${quoteUpdated}
      `).bind(
        before.id,
        row.quantity,
        row.unit,
        row.unitPrice,
        row.note,
        row.sortOrder,
        ...updatedValues,
      ));
    }

    const results = await this.db.batch(statements);
    return Number(results[1]?.meta?.changes ?? 0) === 1;
  }
}

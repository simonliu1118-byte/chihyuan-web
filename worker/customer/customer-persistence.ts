import { AuditService } from "../audit/audit-service";
import type { CustomerRecordVersion } from "./customer-repository";
import type {
  NormalizedChangeCustomerNumberRequest,
  NormalizedCreateCustomerRequest,
  NormalizedUpdateCustomerRequest,
} from "./customer-validation";
import {
  buildCreateCustomerChildStatements,
  buildUpdateCustomerChildStatements,
} from "./customer-child-persistence";

export interface CustomerMutationContext {
  actorMemberId: number;
  now: string;
  requestId?: string | null;
}

function assertMutationContext(context: CustomerMutationContext): void {
  if (!Number.isInteger(context.actorMemberId) || context.actorMemberId <= 0) {
    throw new Error("CUSTOMER_MUTATION_ACTOR_REQUIRED");
  }
  if (!context.now || Number.isNaN(Date.parse(context.now))) {
    throw new Error("CUSTOMER_MUTATION_TIMESTAMP_REQUIRED");
  }
}

export class CustomerPersistence {
  private readonly audit: AuditService;

  constructor(private readonly db: D1Database) {
    this.audit = new AuditService(db);
  }

  async create(
    input: NormalizedCreateCustomerRequest,
    context: CustomerMutationContext,
  ): Promise<number> {
    assertMutationContext(context);

    const statements: D1PreparedStatement[] = [
      this.db.prepare(`
        INSERT INTO customers (
          customer_no, short_name, full_name, tax_id, customer_category_id,
          region_id, owner_department_id, owner_employee_id, fax, customer_status_id,
          created_at, created_by, updated_at, updated_by, revision
        ) VALUES (
          ?1, ?2, ?3, ?4, ?5,
          ?6, ?7, ?8, ?9, ?10,
          ?11, ?12, ?11, ?12, 1
        )
      `).bind(
        input.customerNo,
        input.shortName,
        input.fullName,
        input.taxId,
        input.customerCategoryId,
        input.regionId,
        input.ownerDepartmentId,
        input.ownerEmployeeId,
        input.fax,
        input.customerStatusId,
        context.now,
        context.actorMemberId,
      ),
      ...buildCreateCustomerChildStatements(this.db, input, context),
    ];

    // D1 batch() is a single transaction. The first INSERT receives the next
    // INTEGER PRIMARY KEY, so MAX(customers.id) remains this Customer for the
    // remainder of the same batch and can be used by its owned child inserts.
    statements.push(this.db.prepare("SELECT MAX(id) AS customer_id FROM customers"));

    const results = await this.db.batch(statements);
    const idRow = results[results.length - 1]?.results?.[0] as { customer_id?: number } | undefined;
    const customerId = Number(idRow?.customer_id ?? 0);
    if (!Number.isSafeInteger(customerId) || customerId <= 0) {
      throw new Error("CUSTOMER_CREATE_ID_UNAVAILABLE");
    }
    return customerId;
  }

  async update(
    customerId: number,
    input: NormalizedUpdateCustomerRequest,
    context: CustomerMutationContext,
  ): Promise<boolean> {
    assertMutationContext(context);

    const statements: D1PreparedStatement[] = [
      ...buildUpdateCustomerChildStatements(this.db, customerId, input, context),
      // Child writes are revision-gated and happen first. D1 executes the whole
      // batch transactionally, so another writer cannot interleave after the
      // batch starts mutating this Customer. If the expected revision is stale,
      // the child statements are no-ops and this final update also changes 0 rows.
      this.db.prepare(`
        UPDATE customers
           SET short_name = ?1,
               full_name = ?2,
               tax_id = ?3,
               customer_category_id = ?4,
               region_id = ?5,
               owner_department_id = ?6,
               owner_employee_id = ?7,
               fax = ?8,
               customer_status_id = ?9,
               updated_at = ?10,
               updated_by = ?11,
               revision = revision + 1
         WHERE id = ?12
           AND revision = ?13
      `).bind(
        input.shortName,
        input.fullName,
        input.taxId,
        input.customerCategoryId,
        input.regionId,
        input.ownerDepartmentId,
        input.ownerEmployeeId,
        input.fax,
        input.customerStatusId,
        context.now,
        context.actorMemberId,
        customerId,
        input.expectedRevision,
      ),
    ];

    const results = await this.db.batch(statements);
    const masterResult = results[results.length - 1];
    return Number(masterResult?.meta?.changes ?? 0) === 1;
  }

  async changeCustomerNumber(
    current: CustomerRecordVersion,
    input: NormalizedChangeCustomerNumberRequest,
    context: CustomerMutationContext,
  ): Promise<boolean> {
    assertMutationContext(context);
    const nextRevision = input.expectedRevision + 1;
    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE customers
           SET customer_no = ?1,
               updated_at = ?2,
               updated_by = ?3,
               revision = revision + 1
         WHERE id = ?4
           AND revision = ?5
      `).bind(
        input.newCustomerNo,
        context.now,
        context.actorMemberId,
        current.id,
        input.expectedRevision,
      ),
      this.audit.prepareRecord({
        entityType: "customer",
        entityKey: String(current.id),
        action: "customer.number.changed",
        actorEmployeeId: context.actorMemberId,
        occurredAt: context.now,
        requestId: context.requestId,
        before: { customerNo: current.customerNo },
        after: { customerNo: input.newCustomerNo },
        metadata: input.changeSource ? { changeSource: input.changeSource } : null,
      }, {
        sql: "EXISTS (SELECT 1 FROM customers WHERE id = ? AND revision = ? AND customer_no = ?)",
        values: [current.id, nextRevision, input.newCustomerNo],
      }),
    ]);
    return Number(results[0]?.meta?.changes ?? 0) === 1;
  }

  async deleteNeverUsed(
    current: CustomerRecordVersion,
    context: CustomerMutationContext,
  ): Promise<boolean> {
    assertMutationContext(context);
    const noBusinessReferences = `
      NOT EXISTS(SELECT 1 FROM customer_visits WHERE customer_id = ?)
      AND NOT EXISTS(SELECT 1 FROM customer_item_quotes WHERE customer_id = ?)
      AND NOT EXISTS(SELECT 1 FROM sales_work_orders WHERE customer_id = ?)
      AND NOT EXISTS(SELECT 1 FROM defect_reports WHERE customer_id = ?)
    `;

    const results = await this.db.batch([
      this.audit.prepareRecord({
        entityType: "customer",
        entityKey: String(current.id),
        action: "customer.deleted",
        actorEmployeeId: context.actorMemberId,
        occurredAt: context.now,
        requestId: context.requestId,
        before: {
          customerNo: current.customerNo,
          revision: current.revision,
        },
      }, {
        sql: `EXISTS (
          SELECT 1
            FROM customers
           WHERE id = ?
             AND revision = ?
             AND ${noBusinessReferences}
        )`,
        values: [
          current.id,
          current.revision,
          current.id,
          current.id,
          current.id,
          current.id,
        ],
      }),
      this.db.prepare(`
        DELETE FROM customers
         WHERE id = ?1
           AND revision = ?2
           AND NOT EXISTS(SELECT 1 FROM customer_visits WHERE customer_id = ?1)
           AND NOT EXISTS(SELECT 1 FROM customer_item_quotes WHERE customer_id = ?1)
           AND NOT EXISTS(SELECT 1 FROM sales_work_orders WHERE customer_id = ?1)
           AND NOT EXISTS(SELECT 1 FROM defect_reports WHERE customer_id = ?1)
      `).bind(current.id, current.revision),
    ]);

    return Number(results[1]?.meta?.changes ?? 0) === 1;
  }
}

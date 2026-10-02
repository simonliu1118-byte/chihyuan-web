import { nextEntityIdSql } from "../persistence/entity-id";
import { AuditService } from "../audit/audit-service";
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
        INSERT INTO customers (id,
          customer_no, short_name, full_name, tax_id, customer_category_id,
          region_id, owner_department_id, owner_employee_id, fax, customer_status_id,
          created_at, created_by, updated_at, updated_by, revision
        ) VALUES (${nextEntityIdSql("customers")},
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

    // D1 batch() is a single transaction. The first INSERT explicitly assigns
    // an ID above current and retired IDs, so MAX(customers.id) is this Customer for the
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

  async changeCustomerNumber(
    customerId: number,
    previousCustomerNo: string | null,
    input: NormalizedChangeCustomerNumberRequest,
    context: CustomerMutationContext,
  ): Promise<boolean> {
    assertMutationContext(context);
    const nextRevision = input.expectedRevision + 1;
    const statements: D1PreparedStatement[] = [
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
        customerId,
        input.expectedRevision,
      ),
      this.audit.prepareRecord({
        entityType: "customer",
        entityKey: String(customerId),
        action: "customer.number.changed",
        actorEmployeeId: context.actorMemberId,
        occurredAt: context.now,
        requestId: context.requestId,
        before: { customerNo: previousCustomerNo },
        after: { customerNo: input.newCustomerNo },
        metadata: input.changeReason ? { changeReason: input.changeReason } : null,
      }, {
        sql: "EXISTS (SELECT 1 FROM customers WHERE id = ? AND revision = ?)",
        values: [customerId, nextRevision],
      }),
    ];
    const results = await this.db.batch(statements);
    return Number(results[0]?.meta?.changes ?? 0) === 1;
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
}

import type {
  CustomerAddressInput,
  CustomerContactInput,
  CustomerNoteInput,
  CustomerPhoneInput,
} from "../../shared/customer";
import type {
  NormalizedCreateCustomerRequest,
  NormalizedUpdateCustomerRequest,
} from "./customer-validation";

export interface CustomerMutationContext {
  actorMemberId: number;
  now: string;
}

function assertMutationContext(context: CustomerMutationContext): void {
  if (!Number.isInteger(context.actorMemberId) || context.actorMemberId <= 0) {
    throw new Error("CUSTOMER_MUTATION_ACTOR_REQUIRED");
  }
  if (!context.now || Number.isNaN(Date.parse(context.now))) {
    throw new Error("CUSTOMER_MUTATION_TIMESTAMP_REQUIRED");
  }
}

function createPhoneStatement(
  db: D1Database,
  row: CustomerPhoneInput,
  context: CustomerMutationContext,
): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO customer_phones (
      customer_id, phone_number, extension, note, sort_order, created_at, updated_at
    )
    SELECT MAX(id), ?1, ?2, ?3, ?4, ?5, ?5
      FROM customers
  `).bind(
    row.phoneNumber,
    row.extension ?? null,
    row.note ?? null,
    row.sortOrder,
    context.now,
  );
}

function createContactStatement(
  db: D1Database,
  row: CustomerContactInput,
  context: CustomerMutationContext,
): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO customer_contacts (
      customer_id, name, department_name, title, phone, mobile, note,
      sort_order, is_active, created_at, updated_at
    )
    SELECT MAX(id), ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9
      FROM customers
  `).bind(
    row.name,
    row.departmentName ?? null,
    row.title ?? null,
    row.phone ?? null,
    row.mobile ?? null,
    row.note ?? null,
    row.sortOrder,
    row.isActive ? 1 : 0,
    context.now,
  );
}

function createAddressStatement(
  db: D1Database,
  row: CustomerAddressInput,
  context: CustomerMutationContext,
): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO customer_addresses (
      customer_id, postal_code, address, note, sort_order, created_at, updated_at
    )
    SELECT MAX(id), ?1, ?2, ?3, ?4, ?5, ?5
      FROM customers
  `).bind(
    row.postalCode ?? null,
    row.address,
    row.note ?? null,
    row.sortOrder,
    context.now,
  );
}

function createNoteStatement(
  db: D1Database,
  row: CustomerNoteInput,
  context: CustomerMutationContext,
): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO customer_notes (
      customer_id, content, sort_order, created_at, created_by, updated_at, updated_by
    )
    SELECT MAX(id), ?1, ?2, ?3, ?4, ?3, ?4
      FROM customers
  `).bind(row.content, row.sortOrder, context.now, context.actorMemberId);
}

function revisionGate(customerId: number, expectedRevision: number): readonly [number, number] {
  return [customerId, expectedRevision];
}

function updatePhoneStatement(
  db: D1Database,
  customerId: number,
  expectedRevision: number,
  row: CustomerPhoneInput,
  context: CustomerMutationContext,
): D1PreparedStatement {
  if (row.id == null) {
    return db.prepare(`
      INSERT INTO customer_phones (
        customer_id, phone_number, extension, note, sort_order, created_at, updated_at
      )
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?6
       WHERE EXISTS (
         SELECT 1 FROM customers WHERE id = ?1 AND revision = ?7
       )
    `).bind(
      customerId,
      row.phoneNumber,
      row.extension ?? null,
      row.note ?? null,
      row.sortOrder,
      context.now,
      expectedRevision,
    );
  }

  return db.prepare(`
    UPDATE customer_phones
       SET phone_number = ?1,
           extension = ?2,
           note = ?3,
           sort_order = ?4,
           updated_at = ?5
     WHERE id = ?6
       AND customer_id = ?7
       AND EXISTS (
         SELECT 1 FROM customers WHERE id = ?7 AND revision = ?8
       )
  `).bind(
    row.phoneNumber,
    row.extension ?? null,
    row.note ?? null,
    row.sortOrder,
    context.now,
    row.id,
    customerId,
    expectedRevision,
  );
}

function updateContactStatement(
  db: D1Database,
  customerId: number,
  expectedRevision: number,
  row: CustomerContactInput,
  context: CustomerMutationContext,
): D1PreparedStatement {
  if (row.id == null) {
    return db.prepare(`
      INSERT INTO customer_contacts (
        customer_id, name, department_name, title, phone, mobile, note,
        sort_order, is_active, created_at, updated_at
      )
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10
       WHERE EXISTS (
         SELECT 1 FROM customers WHERE id = ?1 AND revision = ?11
       )
    `).bind(
      customerId,
      row.name,
      row.departmentName ?? null,
      row.title ?? null,
      row.phone ?? null,
      row.mobile ?? null,
      row.note ?? null,
      row.sortOrder,
      row.isActive ? 1 : 0,
      context.now,
      expectedRevision,
    );
  }

  return db.prepare(`
    UPDATE customer_contacts
       SET name = ?1,
           department_name = ?2,
           title = ?3,
           phone = ?4,
           mobile = ?5,
           note = ?6,
           sort_order = ?7,
           is_active = ?8,
           updated_at = ?9
     WHERE id = ?10
       AND customer_id = ?11
       AND EXISTS (
         SELECT 1 FROM customers WHERE id = ?11 AND revision = ?12
       )
  `).bind(
    row.name,
    row.departmentName ?? null,
    row.title ?? null,
    row.phone ?? null,
    row.mobile ?? null,
    row.note ?? null,
    row.sortOrder,
    row.isActive ? 1 : 0,
    context.now,
    row.id,
    customerId,
    expectedRevision,
  );
}

function updateAddressStatement(
  db: D1Database,
  customerId: number,
  expectedRevision: number,
  row: CustomerAddressInput,
  context: CustomerMutationContext,
): D1PreparedStatement {
  if (row.id == null) {
    return db.prepare(`
      INSERT INTO customer_addresses (
        customer_id, postal_code, address, note, sort_order, created_at, updated_at
      )
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?6
       WHERE EXISTS (
         SELECT 1 FROM customers WHERE id = ?1 AND revision = ?7
       )
    `).bind(
      customerId,
      row.postalCode ?? null,
      row.address,
      row.note ?? null,
      row.sortOrder,
      context.now,
      expectedRevision,
    );
  }

  return db.prepare(`
    UPDATE customer_addresses
       SET postal_code = ?1,
           address = ?2,
           note = ?3,
           sort_order = ?4,
           updated_at = ?5
     WHERE id = ?6
       AND customer_id = ?7
       AND EXISTS (
         SELECT 1 FROM customers WHERE id = ?7 AND revision = ?8
       )
  `).bind(
    row.postalCode ?? null,
    row.address,
    row.note ?? null,
    row.sortOrder,
    context.now,
    row.id,
    customerId,
    expectedRevision,
  );
}

function updateNoteStatement(
  db: D1Database,
  customerId: number,
  expectedRevision: number,
  row: CustomerNoteInput,
  context: CustomerMutationContext,
): D1PreparedStatement {
  if (row.id == null) {
    return db.prepare(`
      INSERT INTO customer_notes (
        customer_id, content, sort_order, created_at, created_by, updated_at, updated_by
      )
      SELECT ?1, ?2, ?3, ?4, ?5, ?4, ?5
       WHERE EXISTS (
         SELECT 1 FROM customers WHERE id = ?1 AND revision = ?6
       )
    `).bind(
      customerId,
      row.content,
      row.sortOrder,
      context.now,
      context.actorMemberId,
      expectedRevision,
    );
  }

  return db.prepare(`
    UPDATE customer_notes
       SET content = ?1,
           sort_order = ?2,
           updated_at = ?3,
           updated_by = ?4
     WHERE id = ?5
       AND customer_id = ?6
       AND EXISTS (
         SELECT 1 FROM customers WHERE id = ?6 AND revision = ?7
       )
  `).bind(
    row.content,
    row.sortOrder,
    context.now,
    context.actorMemberId,
    row.id,
    customerId,
    expectedRevision,
  );
}

function deleteMissingStatement(
  db: D1Database,
  table: "customer_phones" | "customer_contacts" | "customer_addresses" | "customer_notes",
  customerId: number,
  expectedRevision: number,
  ids: readonly number[],
): D1PreparedStatement {
  const uniqueIds = [...new Set(ids)];
  const keepClause = uniqueIds.length > 0
    ? `AND id NOT IN (${uniqueIds.map(() => "?").join(", ")})`
    : "";
  const statement = db.prepare(`
    DELETE FROM ${table}
     WHERE customer_id = ?
       ${keepClause}
       AND EXISTS (
         SELECT 1 FROM customers WHERE id = ? AND revision = ?
       )
  `);
  return statement.bind(customerId, ...uniqueIds, customerId, expectedRevision);
}

function existingIds(rows: readonly { id?: number }[]): readonly number[] {
  return rows.flatMap((row) => row.id == null ? [] : [row.id]);
}

export class CustomerPersistence {
  constructor(private readonly db: D1Database) {}

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
    ];

    for (const row of input.phones) statements.push(createPhoneStatement(this.db, row, context));
    for (const row of input.contacts) statements.push(createContactStatement(this.db, row, context));
    for (const row of input.addresses) statements.push(createAddressStatement(this.db, row, context));
    for (const row of input.notes) statements.push(createNoteStatement(this.db, row, context));

    // D1 batch() is one transaction. Since INTEGER PRIMARY KEY auto-allocation
    // assigns the new Customer above the previous max ID, MAX(id) remains that
    // Customer for the rest of this same batch and is safe for owned child rows.
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
    const expectedRevision = input.expectedRevision;
    const statements: D1PreparedStatement[] = [];

    for (const row of input.phones) {
      statements.push(updatePhoneStatement(this.db, customerId, expectedRevision, row, context));
    }
    statements.push(deleteMissingStatement(
      this.db,
      "customer_phones",
      ...revisionGate(customerId, expectedRevision),
      existingIds(input.phones),
    ));

    for (const row of input.contacts) {
      statements.push(updateContactStatement(this.db, customerId, expectedRevision, row, context));
    }
    statements.push(deleteMissingStatement(
      this.db,
      "customer_contacts",
      ...revisionGate(customerId, expectedRevision),
      existingIds(input.contacts),
    ));

    for (const row of input.addresses) {
      statements.push(updateAddressStatement(this.db, customerId, expectedRevision, row, context));
    }
    statements.push(deleteMissingStatement(
      this.db,
      "customer_addresses",
      ...revisionGate(customerId, expectedRevision),
      existingIds(input.addresses),
    ));

    for (const row of input.notes) {
      statements.push(updateNoteStatement(this.db, customerId, expectedRevision, row, context));
    }
    statements.push(deleteMissingStatement(
      this.db,
      "customer_notes",
      ...revisionGate(customerId, expectedRevision),
      existingIds(input.notes),
    ));

    // Child writes are revision-gated and happen before the master update.
    // Because the whole D1 batch is transactional, either the expected revision
    // is current for the batch or all gated child statements are no-ops. Once a
    // child write starts, another writer cannot interleave before this final
    // revision increment.
    statements.push(this.db.prepare(`
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
      expectedRevision,
    ));

    const results = await this.db.batch(statements);
    const masterResult = results[results.length - 1];
    return Number(masterResult?.meta?.changes ?? 0) === 1;
  }
}

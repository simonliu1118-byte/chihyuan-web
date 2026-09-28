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

interface MutationContextLike {
  actorMemberId: number;
  now: string;
}

type ChildTable = "customer_phones" | "customer_addresses" | "customer_notes";

function existingIds(rows: readonly { id?: number }[]): readonly number[] {
  return [...new Set(rows.flatMap((row) => row.id == null ? [] : [row.id]))];
}

function omissionClause(ids: readonly number[]): { sql: string; params: readonly number[] } {
  if (ids.length === 0) return { sql: "", params: [] };
  return {
    sql: `AND id NOT IN (${ids.map(() => "?").join(", ")})`,
    params: ids,
  };
}

function createPhone(db: D1Database, row: CustomerPhoneInput, context: MutationContextLike): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO customer_phones (
      customer_id, phone_number, extension, note, sort_order, created_at, updated_at
    )
    SELECT MAX(id), ?1, ?2, ?3, ?4, ?5, ?5 FROM customers
  `).bind(row.phoneNumber, row.extension ?? null, row.note ?? null, row.sortOrder, context.now);
}

function createContact(db: D1Database, row: CustomerContactInput, context: MutationContextLike): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO customer_contacts (
      customer_id, name, department_name, title, phone, mobile, note,
      sort_order, is_active, created_at, updated_at
    )
    SELECT MAX(id), ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9 FROM customers
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

function createAddress(db: D1Database, row: CustomerAddressInput, context: MutationContextLike): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO customer_addresses (
      customer_id, postal_code, address, note, sort_order, created_at, updated_at
    )
    SELECT MAX(id), ?1, ?2, ?3, ?4, ?5, ?5 FROM customers
  `).bind(row.postalCode ?? null, row.address, row.note ?? null, row.sortOrder, context.now);
}

function createNote(db: D1Database, row: CustomerNoteInput, context: MutationContextLike): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO customer_notes (
      customer_id, content, sort_order, created_at, created_by, updated_at, updated_by
    )
    SELECT MAX(id), ?1, ?2, ?3, ?4, ?3, ?4 FROM customers
  `).bind(row.content, row.sortOrder, context.now, context.actorMemberId);
}

function updatePhone(
  db: D1Database,
  customerId: number,
  expectedRevision: number,
  row: CustomerPhoneInput,
  context: MutationContextLike,
): D1PreparedStatement {
  if (row.id == null) {
    return db.prepare(`
      INSERT INTO customer_phones (
        customer_id, phone_number, extension, note, sort_order, created_at, updated_at
      )
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?6
       WHERE EXISTS (SELECT 1 FROM customers WHERE id = ?1 AND revision = ?7)
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
       SET phone_number = ?1, extension = ?2, note = ?3, sort_order = ?4, updated_at = ?5
     WHERE id = ?6 AND customer_id = ?7
       AND EXISTS (SELECT 1 FROM customers WHERE id = ?7 AND revision = ?8)
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

function updateContact(
  db: D1Database,
  customerId: number,
  expectedRevision: number,
  row: CustomerContactInput,
  context: MutationContextLike,
): D1PreparedStatement {
  if (row.id == null) {
    return db.prepare(`
      INSERT INTO customer_contacts (
        customer_id, name, department_name, title, phone, mobile, note,
        sort_order, is_active, created_at, updated_at
      )
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10
       WHERE EXISTS (SELECT 1 FROM customers WHERE id = ?1 AND revision = ?11)
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
     WHERE id = ?10 AND customer_id = ?11
       AND EXISTS (SELECT 1 FROM customers WHERE id = ?11 AND revision = ?12)
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

function updateAddress(
  db: D1Database,
  customerId: number,
  expectedRevision: number,
  row: CustomerAddressInput,
  context: MutationContextLike,
): D1PreparedStatement {
  if (row.id == null) {
    return db.prepare(`
      INSERT INTO customer_addresses (
        customer_id, postal_code, address, note, sort_order, created_at, updated_at
      )
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?6
       WHERE EXISTS (SELECT 1 FROM customers WHERE id = ?1 AND revision = ?7)
    `).bind(customerId, row.postalCode ?? null, row.address, row.note ?? null, row.sortOrder, context.now, expectedRevision);
  }

  return db.prepare(`
    UPDATE customer_addresses
       SET postal_code = ?1, address = ?2, note = ?3, sort_order = ?4, updated_at = ?5
     WHERE id = ?6 AND customer_id = ?7
       AND EXISTS (SELECT 1 FROM customers WHERE id = ?7 AND revision = ?8)
  `).bind(row.postalCode ?? null, row.address, row.note ?? null, row.sortOrder, context.now, row.id, customerId, expectedRevision);
}

function updateNote(
  db: D1Database,
  customerId: number,
  expectedRevision: number,
  row: CustomerNoteInput,
  context: MutationContextLike,
): D1PreparedStatement {
  if (row.id == null) {
    return db.prepare(`
      INSERT INTO customer_notes (
        customer_id, content, sort_order, created_at, created_by, updated_at, updated_by
      )
      SELECT ?1, ?2, ?3, ?4, ?5, ?4, ?5
       WHERE EXISTS (SELECT 1 FROM customers WHERE id = ?1 AND revision = ?6)
    `).bind(customerId, row.content, row.sortOrder, context.now, context.actorMemberId, expectedRevision);
  }

  return db.prepare(`
    UPDATE customer_notes
       SET content = ?1, sort_order = ?2, updated_at = ?3, updated_by = ?4
     WHERE id = ?5 AND customer_id = ?6
       AND EXISTS (SELECT 1 FROM customers WHERE id = ?6 AND revision = ?7)
  `).bind(row.content, row.sortOrder, context.now, context.actorMemberId, row.id, customerId, expectedRevision);
}

function deleteOmitted(
  db: D1Database,
  table: ChildTable,
  customerId: number,
  expectedRevision: number,
  ids: readonly number[],
): D1PreparedStatement {
  const omitted = omissionClause(ids);
  return db.prepare(`
    DELETE FROM ${table}
     WHERE customer_id = ?
       ${omitted.sql}
       AND EXISTS (SELECT 1 FROM customers WHERE id = ? AND revision = ?)
  `).bind(customerId, ...omitted.params, customerId, expectedRevision);
}

function retainReferencedAndDeleteOmittedContacts(
  db: D1Database,
  customerId: number,
  expectedRevision: number,
  ids: readonly number[],
  context: MutationContextLike,
): readonly D1PreparedStatement[] {
  const omitted = omissionClause(ids);
  const deactivate = db.prepare(`
    UPDATE customer_contacts
       SET is_active = 0, updated_at = ?
     WHERE customer_id = ?
       ${omitted.sql}
       AND EXISTS (SELECT 1 FROM customer_visits AS v WHERE v.contact_id = customer_contacts.id)
       AND EXISTS (SELECT 1 FROM customers WHERE id = ? AND revision = ?)
  `).bind(context.now, customerId, ...omitted.params, customerId, expectedRevision);

  const remove = db.prepare(`
    DELETE FROM customer_contacts
     WHERE customer_id = ?
       ${omitted.sql}
       AND NOT EXISTS (SELECT 1 FROM customer_visits AS v WHERE v.contact_id = customer_contacts.id)
       AND EXISTS (SELECT 1 FROM customers WHERE id = ? AND revision = ?)
  `).bind(customerId, ...omitted.params, customerId, expectedRevision);

  return [deactivate, remove];
}

export function buildCreateCustomerChildStatements(
  db: D1Database,
  input: NormalizedCreateCustomerRequest,
  context: MutationContextLike,
): readonly D1PreparedStatement[] {
  return [
    ...input.phones.map((row) => createPhone(db, row, context)),
    ...input.contacts.map((row) => createContact(db, row, context)),
    ...input.addresses.map((row) => createAddress(db, row, context)),
    ...input.notes.map((row) => createNote(db, row, context)),
  ];
}

export function buildUpdateCustomerChildStatements(
  db: D1Database,
  customerId: number,
  input: NormalizedUpdateCustomerRequest,
  context: MutationContextLike,
): readonly D1PreparedStatement[] {
  const expectedRevision = input.expectedRevision;
  const phoneIds = existingIds(input.phones);
  const contactIds = existingIds(input.contacts);
  const addressIds = existingIds(input.addresses);
  const noteIds = existingIds(input.notes);

  // Omission cleanup must run before inserts for rows without IDs. If cleanup
  // runs after an INSERT, the just-created row is absent from the retained-ID
  // list and would be deleted again in the same D1 batch.
  return [
    deleteOmitted(db, "customer_phones", customerId, expectedRevision, phoneIds),
    ...input.phones.map((row) => updatePhone(db, customerId, expectedRevision, row, context)),
    ...retainReferencedAndDeleteOmittedContacts(db, customerId, expectedRevision, contactIds, context),
    ...input.contacts.map((row) => updateContact(db, customerId, expectedRevision, row, context)),
    deleteOmitted(db, "customer_addresses", customerId, expectedRevision, addressIds),
    ...input.addresses.map((row) => updateAddress(db, customerId, expectedRevision, row, context)),
    deleteOmitted(db, "customer_notes", customerId, expectedRevision, noteIds),
    ...input.notes.map((row) => updateNote(db, customerId, expectedRevision, row, context)),
  ];
}

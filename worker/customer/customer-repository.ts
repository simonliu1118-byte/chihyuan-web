import type {
  CustomerAddress,
  CustomerContact,
  CustomerDetail,
  CustomerListResult,
  CustomerLookupRef,
  CustomerNote,
  CustomerPhone,
  CustomerSearchQuery,
  CustomerSummary,
  CustomerTaxIdMatch,
} from "../../shared/customer";

type D1Scalar = string | number | null;

type CustomerSummaryRow = {
  id: number;
  customer_no: string | null;
  short_name: string;
  full_name: string | null;
  tax_id: string | null;
  category_id: number | null;
  category_code: string | null;
  category_name: string | null;
  region_id: number | null;
  region_code: string | null;
  region_name: string | null;
  owner_department_id: number | null;
  owner_department_code: string | null;
  owner_department_name: string | null;
  owner_employee_id: number | null;
  owner_employee_no: string | null;
  status_id: number | null;
  status_code: string | null;
  status_name: string | null;
  revision: number;
  updated_at: string;
};

type CustomerDetailRow = CustomerSummaryRow & {
  fax: string | null;
  created_at: string;
};

type CustomerPhoneRow = {
  id: number;
  phone_number: string;
  extension: string | null;
  note: string | null;
  sort_order: number;
};

type CustomerContactRow = {
  id: number;
  name: string;
  department_name: string | null;
  title: string | null;
  phone: string | null;
  mobile: string | null;
  note: string | null;
  sort_order: number;
  is_active: number;
};

type CustomerAddressRow = {
  id: number;
  postal_code: string | null;
  address: string;
  note: string | null;
  sort_order: number;
};

type CustomerNoteRow = {
  id: number;
  content: string;
  sort_order: number;
};

type TaxIdMatchRow = {
  id: number;
  customer_no: string | null;
  short_name: string;
  full_name: string | null;
  status_id: number | null;
  status_code: string | null;
  status_name: string | null;
};

type ReferenceStateRow = {
  category_ok: number;
  status_ok: number;
  region_ok: number;
  department_ok: number;
  employee_ok: number;
};

export interface CustomerReferenceIds {
  customerCategoryId: number | null;
  customerStatusId: number | null;
  regionId: number | null;
  ownerDepartmentId: number | null;
  ownerEmployeeId: number | null;
}

export interface CustomerReferenceErrors {
  customerCategoryId?: string;
  customerStatusId?: string;
  regionId?: string;
  ownerDepartmentId?: string;
  ownerEmployeeId?: string;
}

export interface CustomerRecordVersion {
  id: number;
  customerNo: string | null;
  revision: number;
}

const CUSTOMER_SUMMARY_SELECT = `
  SELECT
    c.id,
    c.customer_no,
    c.short_name,
    c.full_name,
    c.tax_id,
    cc.id AS category_id,
    cc.code AS category_code,
    cc.name AS category_name,
    r.id AS region_id,
    r.code AS region_code,
    r.name AS region_name,
    d.id AS owner_department_id,
    d.code AS owner_department_code,
    d.name AS owner_department_name,
    m.id AS owner_employee_id,
    m.employee_no AS owner_employee_no,
    cs.id AS status_id,
    cs.code AS status_code,
    cs.name AS status_name,
    c.revision,
    c.updated_at
  FROM customers AS c
  LEFT JOIN customer_categories AS cc ON cc.id = c.customer_category_id
  LEFT JOIN regions AS r ON r.id = c.region_id
  LEFT JOIN departments AS d ON d.id = c.owner_department_id
  LEFT JOIN app_members AS m ON m.id = c.owner_employee_id
  LEFT JOIN customer_statuses AS cs ON cs.id = c.customer_status_id
`;

function toLookup(
  id: number | null,
  code: string | null,
  name: string | null,
): CustomerLookupRef | null {
  if (id == null || name == null) return null;
  return { id, code, name };
}

function toSummary(row: CustomerSummaryRow): CustomerSummary {
  return {
    id: row.id,
    customerNo: row.customer_no,
    shortName: row.short_name,
    fullName: row.full_name,
    taxId: row.tax_id,
    category: toLookup(row.category_id, row.category_code, row.category_name),
    region: toLookup(row.region_id, row.region_code, row.region_name),
    ownerDepartment: toLookup(
      row.owner_department_id,
      row.owner_department_code,
      row.owner_department_name,
    ),
    ownerEmployee:
      row.owner_employee_id == null
        ? null
        : {
            id: row.owner_employee_id,
            employeeNo: row.owner_employee_no,
            displayName: null,
          },
    status: toLookup(row.status_id, row.status_code, row.status_name),
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function encodeCursor(id: number): string {
  return btoa(String(id)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeCursor(cursor: string | undefined): number | null {
  if (!cursor) return null;
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(cursor)) return null;
  try {
    const normalized = cursor.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const id = Number(atob(padded));
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function normalizeLimit(value: number | undefined): number {
  if (value == null) return 30;
  if (!Number.isInteger(value) || value <= 0) return 30;
  return Math.min(value, 100);
}

function optionalPositive(value: number | undefined): number | null {
  if (value == null) return null;
  return Number.isInteger(value) && value > 0 ? value : null;
}

export class CustomerRepository {
  constructor(private readonly db: D1Database) {}

  async search(query: CustomerSearchQuery): Promise<CustomerListResult> {
    const where: string[] = [];
    const params: D1Scalar[] = [];
    const keyword = query.q?.trim() ?? "";

    if (keyword) {
      const like = `%${escapeLike(keyword)}%`;
      where.push(`(
        c.customer_no LIKE ? ESCAPE '\\'
        OR c.short_name LIKE ? ESCAPE '\\'
        OR c.full_name LIKE ? ESCAPE '\\'
        OR c.tax_id LIKE ? ESCAPE '\\'
      )`);
      params.push(like, like, like, like);
    }

    const filters: readonly [string, number | null][] = [
      ["c.customer_category_id", optionalPositive(query.customerCategoryId)],
      ["c.customer_status_id", optionalPositive(query.customerStatusId)],
      ["c.region_id", optionalPositive(query.regionId)],
      ["c.owner_department_id", optionalPositive(query.ownerDepartmentId)],
      ["c.owner_employee_id", optionalPositive(query.ownerEmployeeId)],
    ];
    for (const [column, value] of filters) {
      if (value == null) continue;
      where.push(`${column} = ?`);
      params.push(value);
    }

    const cursorId = decodeCursor(query.cursor);
    if (query.cursor && cursorId == null) {
      return { items: [], nextCursor: null };
    }
    if (cursorId != null) {
      where.push("c.id < ?");
      params.push(cursorId);
    }

    const limit = normalizeLimit(query.limit);
    params.push(limit + 1);
    const sql = `${CUSTOMER_SUMMARY_SELECT}
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY c.id DESC
      LIMIT ?`;

    const result = await this.db.prepare(sql).bind(...params).all<CustomerSummaryRow>();
    const rows = result.results ?? [];
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    const last = visible[visible.length - 1];

    return {
      items: visible.map(toSummary),
      nextCursor: hasMore && last ? encodeCursor(last.id) : null,
    };
  }

  async getDetail(customerId: number): Promise<CustomerDetail | null> {
    const statements = [
      this.db.prepare(`${CUSTOMER_SUMMARY_SELECT}, c.fax, c.created_at WHERE c.id = ? LIMIT 1`).bind(customerId),
      this.db.prepare(`
        SELECT id, phone_number, extension, note, sort_order
          FROM customer_phones
         WHERE customer_id = ?
         ORDER BY sort_order ASC, id ASC
      `).bind(customerId),
      this.db.prepare(`
        SELECT id, name, department_name, title, phone, mobile, note, sort_order, is_active
          FROM customer_contacts
         WHERE customer_id = ?
         ORDER BY sort_order ASC, id ASC
      `).bind(customerId),
      this.db.prepare(`
        SELECT id, postal_code, address, note, sort_order
          FROM customer_addresses
         WHERE customer_id = ?
         ORDER BY sort_order ASC, id ASC
      `).bind(customerId),
      this.db.prepare(`
        SELECT id, content, sort_order
          FROM customer_notes
         WHERE customer_id = ?
         ORDER BY sort_order ASC, id ASC
      `).bind(customerId),
    ];

    const results = await this.db.batch(statements);
    const master = (results[0]?.results?.[0] ?? null) as CustomerDetailRow | null;
    if (!master) return null;

    const phones = (results[1]?.results ?? []) as CustomerPhoneRow[];
    const contacts = (results[2]?.results ?? []) as CustomerContactRow[];
    const addresses = (results[3]?.results ?? []) as CustomerAddressRow[];
    const notes = (results[4]?.results ?? []) as CustomerNoteRow[];

    return {
      ...toSummary(master),
      fax: master.fax,
      createdAt: master.created_at,
      phones: phones.map<CustomerPhone>((row) => ({
        id: row.id,
        phoneNumber: row.phone_number,
        extension: row.extension,
        note: row.note,
        sortOrder: row.sort_order,
      })),
      contacts: contacts.map<CustomerContact>((row) => ({
        id: row.id,
        name: row.name,
        departmentName: row.department_name,
        title: row.title,
        phone: row.phone,
        mobile: row.mobile,
        note: row.note,
        sortOrder: row.sort_order,
        isActive: row.is_active === 1,
      })),
      addresses: addresses.map<CustomerAddress>((row) => ({
        id: row.id,
        postalCode: row.postal_code,
        address: row.address,
        note: row.note,
        sortOrder: row.sort_order,
      })),
      notes: notes.map<CustomerNote>((row) => ({
        id: row.id,
        content: row.content,
        sortOrder: row.sort_order,
      })),
    };
  }

  async findTaxIdMatches(
    taxId: string,
    excludeCustomerId: number | null = null,
    limit = 10,
  ): Promise<readonly CustomerTaxIdMatch[]> {
    const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), 20));
    const result = await this.db
      .prepare(`
        SELECT
          c.id,
          c.customer_no,
          c.short_name,
          c.full_name,
          cs.id AS status_id,
          cs.code AS status_code,
          cs.name AS status_name
        FROM customers AS c
        LEFT JOIN customer_statuses AS cs ON cs.id = c.customer_status_id
        WHERE c.tax_id = ?1
          AND (?2 IS NULL OR c.id <> ?2)
        ORDER BY c.id DESC
        LIMIT ?3
      `)
      .bind(taxId, excludeCustomerId, boundedLimit)
      .all<TaxIdMatchRow>();

    return (result.results ?? []).map((row) => ({
      id: row.id,
      customerNo: row.customer_no,
      shortName: row.short_name,
      fullName: row.full_name,
      status: toLookup(row.status_id, row.status_code, row.status_name),
    }));
  }

  async customerNumberExists(customerNo: string, excludeCustomerId: number | null = null): Promise<boolean> {
    const row = await this.db
      .prepare(`
        SELECT 1 AS found
          FROM customers
         WHERE customer_no = ?1
           AND (?2 IS NULL OR id <> ?2)
         LIMIT 1
      `)
      .bind(customerNo, excludeCustomerId)
      .first<{ found: number }>();
    return row != null;
  }

  async getRecordVersion(customerId: number): Promise<CustomerRecordVersion | null> {
    const row = await this.db
      .prepare(`
        SELECT id, customer_no, revision
          FROM customers
         WHERE id = ?1
         LIMIT 1
      `)
      .bind(customerId)
      .first<{ id: number; customer_no: string | null; revision: number }>();

    if (!row) return null;
    return { id: row.id, customerNo: row.customer_no, revision: row.revision };
  }

  async validateReferences(ids: CustomerReferenceIds): Promise<CustomerReferenceErrors> {
    const row = await this.db
      .prepare(`
        SELECT
          CASE WHEN ?1 IS NULL OR EXISTS(
            SELECT 1 FROM customer_categories WHERE id = ?1 AND is_active = 1
          ) THEN 1 ELSE 0 END AS category_ok,
          CASE WHEN ?2 IS NULL OR EXISTS(
            SELECT 1 FROM customer_statuses WHERE id = ?2 AND is_active = 1
          ) THEN 1 ELSE 0 END AS status_ok,
          CASE WHEN ?3 IS NULL OR EXISTS(
            SELECT 1 FROM regions WHERE id = ?3 AND is_active = 1
          ) THEN 1 ELSE 0 END AS region_ok,
          CASE WHEN ?4 IS NULL OR EXISTS(
            SELECT 1 FROM departments WHERE id = ?4 AND is_active = 1
          ) THEN 1 ELSE 0 END AS department_ok,
          CASE WHEN ?5 IS NULL OR EXISTS(
            SELECT 1 FROM app_members WHERE id = ?5 AND is_active = 1
          ) THEN 1 ELSE 0 END AS employee_ok
      `)
      .bind(
        ids.customerCategoryId,
        ids.customerStatusId,
        ids.regionId,
        ids.ownerDepartmentId,
        ids.ownerEmployeeId,
      )
      .first<ReferenceStateRow>();

    if (!row) throw new Error("CUSTOMER_REFERENCE_VALIDATION_FAILED");

    const errors: CustomerReferenceErrors = {};
    if (row.category_ok !== 1) errors.customerCategoryId = "客戶分類不存在或已停用";
    if (row.status_ok !== 1) errors.customerStatusId = "客戶狀態不存在或已停用";
    if (row.region_ok !== 1) errors.regionId = "地區不存在或已停用";
    if (row.department_ok !== 1) errors.ownerDepartmentId = "負責部門不存在或已停用";
    if (row.employee_ok !== 1) errors.ownerEmployeeId = "負責人員不存在或已停用";
    return errors;
  }
}

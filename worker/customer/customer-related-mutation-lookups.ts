import type { CustomerVisitRecord } from "../../shared/customer-related";

export interface CustomerFrequentItemVersion {
  id: number;
  updatedAt: string;
}

type VisitRow = {
  id: number;
  customer_id: number;
  visit_date: string;
  contact_id: number | null;
  person_snapshot: string | null;
  employee_id: number;
  employee_no: string | null;
  content: string | null;
  created_at: string;
  updated_at: string;
  revision: number;
};

export class CustomerRelatedMutationLookups {
  constructor(private readonly db: D1Database) {}

  async getVisit(customerId: number, visitId: number): Promise<CustomerVisitRecord | null> {
    const row = await this.db.prepare(`
      SELECT
        v.id,
        v.customer_id,
        v.visit_date,
        v.contact_id,
        v.person_snapshot,
        v.employee_id,
        m.employee_no,
        v.content,
        v.created_at,
        v.updated_at,
        v.revision
      FROM customer_visits AS v
      LEFT JOIN app_members AS m ON m.id = v.employee_id
      WHERE v.customer_id = ?1 AND v.id = ?2
      LIMIT 1
    `).bind(customerId, visitId).first<VisitRow>();

    if (!row) return null;
    return {
      id: row.id,
      customerId: row.customer_id,
      visitDate: row.visit_date,
      contactId: row.contact_id,
      personSnapshot: row.person_snapshot,
      employee: {
        id: row.employee_id,
        employeeNo: row.employee_no,
        displayName: null,
      },
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      revision: row.revision,
    };
  }

  async getFrequentItemVersion(
    customerId: number,
    frequentId: number,
  ): Promise<CustomerFrequentItemVersion | null> {
    const row = await this.db.prepare(`
      SELECT id, updated_at
        FROM customer_frequent_items
       WHERE customer_id = ?1 AND id = ?2
       LIMIT 1
    `).bind(customerId, frequentId).first<{ id: number; updated_at: string }>();
    return row ? { id: row.id, updatedAt: row.updated_at } : null;
  }
}

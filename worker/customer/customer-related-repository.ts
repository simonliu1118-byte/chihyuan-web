import type {
  CustomerFrequentItemRecord,
  CustomerItemQuoteDetail,
  CustomerItemQuotePriceBreak,
  CustomerItemQuoteSummary,
  CustomerRelatedPage,
  CustomerRelatedQuery,
  CustomerVisitRecord,
} from "../../shared/customer-related";
import { formatScaled4 } from "../../shared/fixed-point";

type DateIdCursor = {
  date: string;
  id: number;
};

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

type FrequentItemRow = {
  id: number;
  customer_id: number;
  item_id: number | null;
  item_no: string | null;
  item_name: string | null;
  item_spec: string | null;
  custom_item_name: string | null;
  custom_category_name: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type QuoteRow = {
  id: number;
  customer_id: number;
  item_id: number;
  quote_date: string;
  employee_id: number;
  employee_no: string | null;
  item_no_snapshot: string;
  item_name_snapshot: string;
  spec_snapshot: string | null;
  created_at: string;
  updated_at: string;
  revision: number;
};

type QuoteBreakRow = {
  id: number;
  quantity: number;
  unit: string;
  unit_price: number;
  note: string | null;
  sort_order: number;
};

function normalizeLimit(value: number | undefined, fallback = 30, max = 100): number {
  if (value == null || !Number.isInteger(value) || value <= 0) return fallback;
  return Math.min(value, max);
}

function encodeCursor(cursor: DateIdCursor): string {
  const raw = JSON.stringify([cursor.date, cursor.id]);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeCursor(value: string | undefined): DateIdCursor | null {
  if (!value) return null;
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) return null;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [date, id] = parsed;
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    return { date, id };
  } catch {
    return null;
  }
}

function toVisit(row: VisitRow): CustomerVisitRecord {
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

function toQuote(row: QuoteRow): CustomerItemQuoteSummary {
  return {
    id: row.id,
    customerId: row.customer_id,
    itemId: row.item_id,
    quoteDate: row.quote_date,
    employee: {
      id: row.employee_id,
      employeeNo: row.employee_no,
      displayName: null,
    },
    itemNoSnapshot: row.item_no_snapshot,
    itemNameSnapshot: row.item_name_snapshot,
    specSnapshot: row.spec_snapshot,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
  };
}

function toQuoteBreak(row: QuoteBreakRow): CustomerItemQuotePriceBreak {
  return {
    id: row.id,
    quantity: formatScaled4(row.quantity),
    unit: row.unit,
    unitPrice: formatScaled4(row.unit_price),
    note: row.note,
    sortOrder: row.sort_order,
  };
}

export class CustomerRelatedRepository {
  constructor(private readonly db: D1Database) {}

  async listVisits(
    customerId: number,
    query: CustomerRelatedQuery,
  ): Promise<CustomerRelatedPage<CustomerVisitRecord>> {
    const limit = normalizeLimit(query.limit);
    const cursor = decodeCursor(query.cursor);
    if (query.cursor && cursor == null) return { items: [], nextCursor: null };

    const whereCursor = cursor
      ? "AND (v.visit_date < ?2 OR (v.visit_date = ?2 AND v.id < ?3))"
      : "";
    const bound = cursor
      ? [customerId, cursor.date, cursor.id, limit + 1]
      : [customerId, limit + 1];
    const limitParameter = cursor ? "?4" : "?2";

    const result = await this.db.prepare(`
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
      WHERE v.customer_id = ?1
        ${whereCursor}
      ORDER BY v.visit_date DESC, v.id DESC
      LIMIT ${limitParameter}
    `).bind(...bound).all<VisitRow>();

    const rows = result.results ?? [];
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    const last = visible[visible.length - 1];
    return {
      items: visible.map(toVisit),
      nextCursor: hasMore && last ? encodeCursor({ date: last.visit_date, id: last.id }) : null,
    };
  }

  async listFrequentItems(customerId: number, limit = 100): Promise<readonly CustomerFrequentItemRecord[]> {
    const bounded = normalizeLimit(limit, 100, 200);
    const result = await this.db.prepare(`
      SELECT
        f.id,
        f.customer_id,
        f.item_id,
        i.item_no,
        i.name AS item_name,
        i.spec AS item_spec,
        f.custom_item_name,
        f.custom_category_name,
        f.sort_order,
        f.created_at,
        f.updated_at
      FROM customer_frequent_items AS f
      LEFT JOIN items AS i ON i.id = f.item_id
      WHERE f.customer_id = ?1
      ORDER BY f.sort_order ASC, f.id ASC
      LIMIT ?2
    `).bind(customerId, bounded).all<FrequentItemRow>();

    return (result.results ?? []).map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      item: row.item_id == null || row.item_no == null || row.item_name == null
        ? null
        : {
            id: row.item_id,
            itemNo: row.item_no,
            name: row.item_name,
            spec: row.item_spec,
          },
      customItemName: row.custom_item_name,
      customCategoryName: row.custom_category_name,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async listQuotes(
    customerId: number,
    query: CustomerRelatedQuery,
  ): Promise<CustomerRelatedPage<CustomerItemQuoteSummary>> {
    const limit = normalizeLimit(query.limit);
    const cursor = decodeCursor(query.cursor);
    if (query.cursor && cursor == null) return { items: [], nextCursor: null };

    const whereCursor = cursor
      ? "AND (q.quote_date < ?2 OR (q.quote_date = ?2 AND q.id < ?3))"
      : "";
    const bound = cursor
      ? [customerId, cursor.date, cursor.id, limit + 1]
      : [customerId, limit + 1];
    const limitParameter = cursor ? "?4" : "?2";

    const result = await this.db.prepare(`
      SELECT
        q.id,
        q.customer_id,
        q.item_id,
        q.quote_date,
        q.employee_id,
        m.employee_no,
        q.item_no_snapshot,
        q.item_name_snapshot,
        q.spec_snapshot,
        q.created_at,
        q.updated_at,
        q.revision
      FROM customer_item_quotes AS q
      LEFT JOIN app_members AS m ON m.id = q.employee_id
      WHERE q.customer_id = ?1
        ${whereCursor}
      ORDER BY q.quote_date DESC, q.id DESC
      LIMIT ${limitParameter}
    `).bind(...bound).all<QuoteRow>();

    const rows = result.results ?? [];
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    const last = visible[visible.length - 1];
    return {
      items: visible.map(toQuote),
      nextCursor: hasMore && last ? encodeCursor({ date: last.quote_date, id: last.id }) : null,
    };
  }

  async getQuoteDetail(customerId: number, quoteId: number): Promise<CustomerItemQuoteDetail | null> {
    const results = await this.db.batch([
      this.db.prepare(`
        SELECT
          q.id,
          q.customer_id,
          q.item_id,
          q.quote_date,
          q.employee_id,
          m.employee_no,
          q.item_no_snapshot,
          q.item_name_snapshot,
          q.spec_snapshot,
          q.created_at,
          q.updated_at,
          q.revision
        FROM customer_item_quotes AS q
        LEFT JOIN app_members AS m ON m.id = q.employee_id
        WHERE q.customer_id = ?1 AND q.id = ?2
        LIMIT 1
      `).bind(customerId, quoteId),
      this.db.prepare(`
        SELECT id, quantity, unit, unit_price, note, sort_order
          FROM quote_price_breaks
         WHERE quote_id = ?1
         ORDER BY sort_order ASC, id ASC
      `).bind(quoteId),
    ]);

    const quote = (results[0]?.results?.[0] ?? null) as QuoteRow | null;
    if (!quote) return null;
    const breaks = (results[1]?.results ?? []) as QuoteBreakRow[];
    return {
      ...toQuote(quote),
      priceBreaks: breaks.map(toQuoteBreak),
    };
  }
}

import { formatScaled4 } from "../../shared/fixed-point";
import type {
  ItemCategoryRef,
  ItemDetail,
  ItemListResult,
  ItemNumberHistoryRecord,
  ItemSearchQuery,
  ItemSummary,
  ItemUnitConversion,
} from "../../shared/item";

type D1Scalar = string | number | null;

type ItemSummaryRow = {
  id: number;
  item_no: string;
  name: string;
  spec: string | null;
  base_unit: string;
  category_id: number | null;
  category_code: string | null;
  category_name: string | null;
  category_parent_id: number | null;
  cost: number | null;
  cost_tax_mode: "none" | "inclusive" | "exclusive" | null;
  store_price: number | null;
  clinic_price: number | null;
  is_active: number;
  revision: number;
  updated_at: string;
};

type ItemDetailRow = ItemSummaryRow & {
  notes: string | null;
  created_at: string;
};

type ItemUnitConversionRow = {
  id: number;
  from_unit: string;
  quantity: number;
  to_unit: string;
  sort_order: number;
};

type ItemNumberHistoryRow = {
  id: number;
  item_id: number;
  item_no: string;
  valid_from: string;
  valid_to: string | null;
  change_source: string | null;
  is_searchable: number;
  created_at: string;
};

export interface ItemRecordVersion {
  id: number;
  itemNo: string;
  revision: number;
  createdAt: string;
  currentNumberValidFrom: string;
}

const ITEM_SELECT_FIELDS = `
  i.id,
  i.item_no,
  i.name,
  i.spec,
  i.base_unit,
  c.id AS category_id,
  c.code AS category_code,
  c.name AS category_name,
  c.parent_id AS category_parent_id,
  i.cost,
  i.cost_tax_mode,
  i.store_price,
  i.clinic_price,
  i.is_active,
  i.revision,
  i.updated_at
`;

const ITEM_FROM = `
  FROM items AS i
  LEFT JOIN item_categories AS c ON c.id = i.item_category_id
`;

function toCategory(row: ItemSummaryRow): ItemCategoryRef | null {
  if (row.category_id == null || row.category_name == null) return null;
  return {
    id: row.category_id,
    code: row.category_code,
    name: row.category_name,
    parentId: row.category_parent_id,
  };
}

function formatOptionalScaled4(value: number | null): string | null {
  return value == null ? null : formatScaled4(value);
}

function toSummary(row: ItemSummaryRow): ItemSummary {
  return {
    id: row.id,
    itemNo: row.item_no,
    name: row.name,
    spec: row.spec,
    baseUnit: row.base_unit,
    category: toCategory(row),
    cost: formatOptionalScaled4(row.cost),
    costTaxMode: row.cost_tax_mode,
    storePrice: formatOptionalScaled4(row.store_price),
    clinicPrice: formatOptionalScaled4(row.clinic_price),
    isActive: row.is_active === 1,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function normalizeLimit(value: number | undefined): number {
  if (value == null || !Number.isInteger(value) || value <= 0) return 30;
  return Math.min(value, 100);
}

function optionalPositive(value: number | undefined): number | null {
  return value != null && Number.isInteger(value) && value > 0 ? value : null;
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

export class ItemRepository {
  constructor(private readonly db: D1Database) {}

  async search(query: ItemSearchQuery): Promise<ItemListResult> {
    const where: string[] = [];
    const params: D1Scalar[] = [];
    const keyword = query.q?.trim() ?? "";

    if (keyword) {
      const like = `%${escapeLike(keyword)}%`;
      where.push(`(
        i.item_no LIKE ? ESCAPE '\\'
        OR i.name LIKE ? ESCAPE '\\'
        OR i.spec LIKE ? ESCAPE '\\'
        OR c.name LIKE ? ESCAPE '\\'
        OR EXISTS (
          SELECT 1
            FROM item_number_history AS inh
           WHERE inh.item_id = i.id
             AND inh.is_searchable = 1
             AND inh.item_no LIKE ? ESCAPE '\\'
        )
      )`);
      params.push(like, like, like, like, like);
    }

    const categoryId = optionalPositive(query.itemCategoryId);
    if (categoryId != null) {
      where.push("i.item_category_id = ?");
      params.push(categoryId);
    }

    if (typeof query.isActive === "boolean") {
      where.push("i.is_active = ?");
      params.push(query.isActive ? 1 : 0);
    }

    const cursorId = decodeCursor(query.cursor);
    if (query.cursor && cursorId == null) return { items: [], nextCursor: null };
    if (cursorId != null) {
      where.push("i.id < ?");
      params.push(cursorId);
    }

    const limit = normalizeLimit(query.limit);
    params.push(limit + 1);
    const sql = `SELECT ${ITEM_SELECT_FIELDS} ${ITEM_FROM}
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY i.id DESC
      LIMIT ?`;
    const result = await this.db.prepare(sql).bind(...params).all<ItemSummaryRow>();
    const rows = result.results ?? [];
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    const last = visible[visible.length - 1];

    return {
      items: visible.map(toSummary),
      nextCursor: hasMore && last ? encodeCursor(last.id) : null,
    };
  }

  async getDetail(itemId: number): Promise<ItemDetail | null> {
    const results = await this.db.batch([
      this.db.prepare(`SELECT ${ITEM_SELECT_FIELDS}, i.notes, i.created_at ${ITEM_FROM} WHERE i.id = ? LIMIT 1`).bind(itemId),
      this.db.prepare(`
        SELECT id, from_unit, quantity, to_unit, sort_order
          FROM item_unit_conversions
         WHERE item_id = ?
         ORDER BY sort_order ASC, id ASC
      `).bind(itemId),
    ]);

    const master = (results[0]?.results?.[0] ?? null) as ItemDetailRow | null;
    if (!master) return null;
    const conversions = (results[1]?.results ?? []) as ItemUnitConversionRow[];
    return {
      ...toSummary(master),
      notes: master.notes,
      createdAt: master.created_at,
      unitConversions: conversions.map<ItemUnitConversion>((row) => ({
        id: row.id,
        fromUnit: row.from_unit,
        quantity: formatScaled4(row.quantity),
        toUnit: row.to_unit,
        sortOrder: row.sort_order,
      })),
    };
  }

  async listNumberHistory(itemId: number, limit = 50): Promise<readonly ItemNumberHistoryRecord[]> {
    const boundedLimit = Math.max(1, Math.min(Number.isInteger(limit) ? limit : 50, 100));
    const result = await this.db.prepare(`
      SELECT id, item_id, item_no, valid_from, valid_to, change_source, is_searchable, created_at
        FROM item_number_history
       WHERE item_id = ?
       ORDER BY valid_to DESC, id DESC
       LIMIT ?
    `).bind(itemId, boundedLimit).all<ItemNumberHistoryRow>();
    return (result.results ?? []).map((row) => ({
      id: row.id,
      itemId: row.item_id,
      itemNo: row.item_no,
      validFrom: row.valid_from,
      validTo: row.valid_to,
      changeSource: row.change_source,
      isSearchable: row.is_searchable === 1,
      createdAt: row.created_at,
    }));
  }

  async getRecordVersion(itemId: number): Promise<ItemRecordVersion | null> {
    const row = await this.db.prepare(`
      SELECT i.id,
             i.item_no,
             i.revision,
             i.created_at,
             COALESCE((SELECT MAX(h.valid_to) FROM item_number_history AS h WHERE h.item_id = i.id), i.created_at) AS current_valid_from
        FROM items AS i
       WHERE i.id = ?
       LIMIT 1
    `).bind(itemId).first<{
      id: number;
      item_no: string;
      revision: number;
      created_at: string;
      current_valid_from: string;
    }>();
    if (!row) return null;
    return {
      id: row.id,
      itemNo: row.item_no,
      revision: row.revision,
      createdAt: row.created_at,
      currentNumberValidFrom: row.current_valid_from,
    };
  }

  async itemNumberExists(itemNo: string, excludeItemId: number | null = null): Promise<boolean> {
    const row = await this.db.prepare(`
      SELECT 1 AS present
        FROM items
       WHERE item_no = ?
         AND (? IS NULL OR id <> ?)
       LIMIT 1
    `).bind(itemNo, excludeItemId, excludeItemId).first<{ present: number }>();
    return row?.present === 1;
  }

  async categoryExists(categoryId: number | null, requireActive: boolean): Promise<boolean> {
    if (categoryId == null) return true;
    const row = await this.db.prepare(`
      SELECT 1 AS present
        FROM item_categories
       WHERE id = ?
         ${requireActive ? "AND is_active = 1" : ""}
       LIMIT 1
    `).bind(categoryId).first<{ present: number }>();
    return row?.present === 1;
  }
}

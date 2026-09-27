import type {
  ContractorDetail,
  ContractorListResult,
  ContractorSearchQuery,
  ContractorSummary,
} from "../../shared/contractor-outsourcing";
import { formatScaled4 } from "../../shared/fixed-point";
import { allowedUnits, type UnitConversionEdge } from "../item/unit-conversion";

type D1Scalar = string | number | null;

type ContractorRow = {
  id: number;
  entity_type: "person" | "organization";
  display_name: string;
  legal_name: string | null;
  tax_id: string | null;
  phone: string | null;
  address?: string | null;
  note?: string | null;
  is_active: number;
  created_at?: string;
  updated_at: string;
  revision: number;
};

export interface ContractorRecordState {
  id: number;
  displayName: string;
  isActive: boolean;
  revision: number;
}

export interface PricingItemRef {
  id: number;
  itemNo: string;
  itemName: string;
  baseUnit: string;
  conversions: readonly UnitConversionEdge[];
  allowedUnits: ReadonlySet<string>;
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

function toSummary(row: ContractorRow): ContractorSummary {
  return {
    id: row.id,
    entityType: row.entity_type,
    displayName: row.display_name,
    legalName: row.legal_name,
    taxId: row.tax_id,
    phone: row.phone,
    isActive: row.is_active === 1,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

export class ContractorRepository {
  constructor(private readonly db: D1Database) {}

  async search(query: ContractorSearchQuery): Promise<ContractorListResult> {
    const where: string[] = [];
    const params: D1Scalar[] = [];
    const keyword = query.q?.trim() ?? "";
    if (keyword) {
      const like = `%${escapeLike(keyword)}%`;
      where.push("(c.display_name LIKE ? ESCAPE '\\' OR c.legal_name LIKE ? ESCAPE '\\' OR c.tax_id LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\')");
      params.push(like, like, like, like);
    }
    if (query.entityType) {
      where.push("c.entity_type = ?");
      params.push(query.entityType);
    }
    if (query.isActive != null) {
      where.push("c.is_active = ?");
      params.push(query.isActive ? 1 : 0);
    }
    const cursor = decodeCursor(query.cursor);
    if (query.cursor && cursor == null) return { items: [], nextCursor: null };
    if (cursor != null) {
      where.push("c.id < ?");
      params.push(cursor);
    }
    const limit = query.limit != null && Number.isInteger(query.limit) && query.limit > 0
      ? Math.min(query.limit, 100)
      : 30;
    params.push(limit + 1);
    const result = await this.db.prepare(`
      SELECT c.id, c.entity_type, c.display_name, c.legal_name, c.tax_id, c.phone,
             c.is_active, c.updated_at, c.revision
        FROM contractors AS c
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY c.id DESC
       LIMIT ?
    `).bind(...params).all<ContractorRow>();
    const rows = result.results ?? [];
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    const last = visible[visible.length - 1];
    return { items: visible.map(toSummary), nextCursor: hasMore && last ? encodeCursor(last.id) : null };
  }

  async getDetail(contractorId: number): Promise<ContractorDetail | null> {
    const results = await this.db.batch([
      this.db.prepare(`
        SELECT id, entity_type, display_name, legal_name, tax_id, phone, address, note,
               is_active, created_at, updated_at, revision
          FROM contractors WHERE id = ? LIMIT 1
      `).bind(contractorId),
      this.db.prepare(`
        SELECT id, name, title, phone, mobile, note, sort_order, is_active
          FROM contractor_contacts
         WHERE contractor_id = ?
         ORDER BY sort_order, id
      `).bind(contractorId),
      this.db.prepare(`
        SELECT p.id, p.item_id, i.item_no, i.name AS item_name,
               p.pricing_unit, p.unit_price, p.note, p.revision, p.updated_at
          FROM contractor_pricing AS p
          JOIN items AS i ON i.id = p.item_id
         WHERE p.contractor_id = ?
         ORDER BY i.item_no, p.id
      `).bind(contractorId),
    ]);
    const row = (results[0]?.results?.[0] ?? null) as ContractorRow | null;
    if (!row) return null;
    const contacts = (results[1]?.results ?? []) as Array<{
      id: number; name: string; title: string | null; phone: string | null; mobile: string | null;
      note: string | null; sort_order: number; is_active: number;
    }>;
    const pricing = (results[2]?.results ?? []) as Array<{
      id: number; item_id: number; item_no: string; item_name: string; pricing_unit: string;
      unit_price: number; note: string | null; revision: number; updated_at: string;
    }>;
    return {
      ...toSummary(row),
      address: row.address ?? null,
      note: row.note ?? null,
      createdAt: row.created_at ?? row.updated_at,
      contacts: contacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
        title: contact.title,
        phone: contact.phone,
        mobile: contact.mobile,
        note: contact.note,
        sortOrder: contact.sort_order,
        isActive: contact.is_active === 1,
      })),
      pricing: pricing.map((price) => ({
        id: price.id,
        itemId: price.item_id,
        itemNo: price.item_no,
        itemName: price.item_name,
        pricingUnit: price.pricing_unit,
        unitPrice: formatScaled4(price.unit_price),
        note: price.note,
        revision: price.revision,
        updatedAt: price.updated_at,
      })),
    };
  }

  async getRecordState(contractorId: number): Promise<ContractorRecordState | null> {
    const row = await this.db.prepare(`
      SELECT id, display_name, is_active, revision
        FROM contractors WHERE id = ? LIMIT 1
    `).bind(contractorId).first<{ id: number; display_name: string; is_active: number; revision: number }>();
    return row ? { id: row.id, displayName: row.display_name, isActive: row.is_active === 1, revision: row.revision } : null;
  }

  async existingContactIds(contractorId: number): Promise<ReadonlySet<number>> {
    const result = await this.db.prepare("SELECT id FROM contractor_contacts WHERE contractor_id = ?").bind(contractorId).all<{ id: number }>();
    return new Set((result.results ?? []).map((row) => row.id));
  }

  async hasBusinessUse(contractorId: number): Promise<boolean> {
    const row = await this.db.prepare(`
      SELECT EXISTS(SELECT 1 FROM outsourcing_orders WHERE contractor_id = ? LIMIT 1) AS used
    `).bind(contractorId).first<{ used: number }>();
    return Number(row?.used ?? 0) === 1;
  }

  async getCurrentPrice(contractorId: number, itemId: number): Promise<{ id: number; revision: number; pricingUnit: string; unitPriceScaled4: number; note: string | null } | null> {
    const row = await this.db.prepare(`
      SELECT id, revision, pricing_unit, unit_price, note
        FROM contractor_pricing
       WHERE contractor_id = ? AND item_id = ?
       LIMIT 1
    `).bind(contractorId, itemId).first<{ id: number; revision: number; pricing_unit: string; unit_price: number; note: string | null }>();
    return row ? { id: row.id, revision: row.revision, pricingUnit: row.pricing_unit, unitPriceScaled4: row.unit_price, note: row.note } : null;
  }

  async resolvePricingItem(itemId: number): Promise<PricingItemRef | null> {
    const results = await this.db.batch([
      this.db.prepare("SELECT id, item_no, name, base_unit FROM items WHERE id = ? LIMIT 1").bind(itemId),
      this.db.prepare("SELECT from_unit, quantity, to_unit FROM item_unit_conversions WHERE item_id = ? ORDER BY sort_order, id").bind(itemId),
    ]);
    const item = (results[0]?.results?.[0] ?? null) as { id: number; item_no: string; name: string; base_unit: string } | null;
    if (!item) return null;
    const conversions = (results[1]?.results ?? []).map((row) => {
      const typed = row as { from_unit: string; quantity: number; to_unit: string };
      return { fromUnit: typed.from_unit, quantityScaled4: typed.quantity, toUnit: typed.to_unit };
    });
    return {
      id: item.id,
      itemNo: item.item_no,
      itemName: item.name,
      baseUnit: item.base_unit,
      conversions,
      allowedUnits: allowedUnits(item.base_unit, conversions),
    };
  }
}

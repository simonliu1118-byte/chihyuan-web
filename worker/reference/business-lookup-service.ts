import type {
  BusinessActorRef,
  CustomerItemOption,
  CustomerModuleLookups,
  DefectModuleLookups,
  ItemModuleLookups,
  OutsourcingModuleLookups,
  SalesWorkOrderModuleLookups,
} from "../../shared/business-lookups";
import type { LookupSetting, RegionSetting } from "../../shared/settings";

type LookupRow = {
  id: number;
  code: string;
  name: string;
  sort_order: number;
  is_active: number;
  updated_at: string;
  parent_id?: number | null;
};

function toLookup(row: LookupRow): LookupSetting {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    sortOrder: row.sort_order,
    isActive: row.is_active === 1,
    updatedAt: row.updated_at,
    ...(Object.prototype.hasOwnProperty.call(row, "parent_id")
      ? { parentId: row.parent_id ?? null }
      : {}),
  };
}

export class BusinessLookupService {
  constructor(private readonly db: D1Database) {}

  async customerLookups(actor: BusinessActorRef): Promise<CustomerModuleLookups> {
    const results = await this.db.batch([
      this.db.prepare("SELECT id,code,name,sort_order,is_active,updated_at FROM departments ORDER BY sort_order,id"),
      this.db.prepare("SELECT id,code,name,sort_order,is_active,updated_at FROM customer_categories ORDER BY sort_order,id"),
      this.db.prepare("SELECT id,code,name,sort_order,is_active,updated_at FROM customer_statuses ORDER BY sort_order,id"),
      this.db.prepare("SELECT id,code,name,group_code,sort_order,is_active FROM regions ORDER BY sort_order,id"),
    ]);
    return {
      actor,
      departments: ((results[0]?.results ?? []) as LookupRow[]).map(toLookup),
      customerCategories: ((results[1]?.results ?? []) as LookupRow[]).map(toLookup),
      customerStatuses: ((results[2]?.results ?? []) as LookupRow[]).map(toLookup),
      regions: ((results[3]?.results ?? []) as (Omit<LookupRow, "updated_at"> & { group_code: string | null })[]).map<RegionSetting>(row => ({ id: row.id, code: row.code, name: row.name, groupCode: row.group_code, sortOrder: row.sort_order, isActive: row.is_active === 1 })),
    };
  }

  async customerItemOptions(query: string, limit = 50): Promise<readonly CustomerItemOption[]> {
    const normalized = query.trim();
    const bounded = Math.max(1, Math.min(Math.trunc(limit), 100));
    const like = `%${normalized.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
    const result = await this.db.prepare(`
      SELECT id, item_no, name, spec, base_unit
        FROM items
       WHERE is_active = 1
         AND (
           ?1 = ''
           OR item_no LIKE ?2 ESCAPE '\\'
           OR name LIKE ?2 ESCAPE '\\'
           OR COALESCE(spec, '') LIKE ?2 ESCAPE '\\'
         )
       ORDER BY item_no ASC, id ASC
       LIMIT ?3
    `).bind(normalized, like, bounded).all<{
      id: number;
      item_no: string;
      name: string;
      spec: string | null;
      base_unit: string;
    }>();
    return (result.results ?? []).map((row) => ({
      id: row.id,
      itemNo: row.item_no,
      name: row.name,
      spec: row.spec,
      baseUnit: row.base_unit,
    }));
  }

  async defectLookups(
    actor: BusinessActorRef,
    selected: {
      customerId?: number | null;
      itemId?: number | null;
      ownerId?: number | null;
      customerQuery?: string;
      itemQuery?: string;
      limit?: number;
    },
  ): Promise<DefectModuleLookups> {
    const limit = Math.max(1, Math.min(Math.trunc(selected.limit ?? 100), 100));
    const customerId = selected.customerId ?? -1;
    const itemId = selected.itemId ?? -1;
    const ownerId = selected.ownerId ?? -1;
    const customerQuery = selected.customerQuery?.trim() ?? "";
    const itemQuery = selected.itemQuery?.trim() ?? "";
    const customerLike = `%${customerQuery.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
    const itemLike = `%${itemQuery.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
    const results = await this.db.batch([
      this.db.prepare(`
        SELECT id, customer_no, short_name
          FROM customers
         WHERE ?1 = ''
            OR id = ?2
            OR COALESCE(customer_no, '') LIKE ?3 ESCAPE '\\'
            OR short_name LIKE ?3 ESCAPE '\\'
         ORDER BY CASE WHEN id = ?2 THEN 0 ELSE 1 END, short_name, id
         LIMIT ?4
      `).bind(customerQuery, customerId, customerLike, limit),
      this.db.prepare(`
        SELECT id, item_no, name, spec, is_active
          FROM items
         WHERE (is_active = 1 OR id = ?2)
           AND (
             ?1 = ''
             OR id = ?2
             OR item_no LIKE ?3 ESCAPE '\\'
             OR name LIKE ?3 ESCAPE '\\'
             OR COALESCE(spec, '') LIKE ?3 ESCAPE '\\'
           )
         ORDER BY CASE WHEN id = ?2 THEN 0 ELSE 1 END, item_no, id
         LIMIT ?4
      `).bind(itemQuery, itemId, itemLike, limit),
      this.db.prepare(`
        SELECT id, employee_no, is_active
          FROM app_members
         WHERE is_active = 1 OR id = ?1
         ORDER BY CASE WHEN id = ?1 THEN 0 ELSE 1 END, COALESCE(employee_no, ''), id
         LIMIT ?2
      `).bind(ownerId, limit),
    ]);
    return {
      actor,
      customers: ((results[0]?.results ?? []) as {
        id: number; customer_no: string | null; short_name: string;
      }[]).map((row) => ({
        id: row.id,
        customerNo: row.customer_no,
        shortName: row.short_name,
      })),
      items: ((results[1]?.results ?? []) as {
        id: number; item_no: string; name: string; spec: string | null; is_active: number;
      }[]).map((row) => ({
        id: row.id,
        itemNo: row.item_no,
        name: row.name,
        spec: row.spec,
        isActive: row.is_active === 1,
      })),
      owners: ((results[2]?.results ?? []) as {
        id: number; employee_no: string | null; is_active: number;
      }[]).map((row) => ({
        id: row.id,
        employeeNo: row.employee_no,
        isActive: row.is_active === 1,
      })),
    };
  }

  async salesWorkOrderLookups(
    actor: BusinessActorRef,
    selected: {
      customerId?: number | null;
      itemIds?: readonly number[];
      operatorId?: number | null;
      customerQuery?: string;
      itemQuery?: string;
      limit?: number;
    },
  ): Promise<SalesWorkOrderModuleLookups> {
    const limit = Math.max(1, Math.min(Math.trunc(selected.limit ?? 100), 100));
    const customerId = selected.customerId ?? -1;
    const operatorId = selected.operatorId ?? actor.appMemberId;
    const itemIds = [...new Set((selected.itemIds ?? []).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 100);
    const itemPlaceholders = itemIds.length ? itemIds.map(() => "?").join(", ") : "?";
    const itemValues = itemIds.length ? itemIds : [-1];
    const customerQuery = selected.customerQuery?.trim() ?? "";
    const itemQuery = selected.itemQuery?.trim() ?? "";
    const customerLike = `%${customerQuery.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
    const itemLike = `%${itemQuery.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;

    const [customerResult, itemResult, operatorResult] = await Promise.all([
      this.db.prepare(`
        SELECT id, customer_no, short_name
          FROM customers
         WHERE ?1 = ''
            OR id = ?2
            OR COALESCE(customer_no, '') LIKE ?3 ESCAPE '\\'
            OR short_name LIKE ?3 ESCAPE '\\'
         ORDER BY CASE WHEN id = ?2 THEN 0 ELSE 1 END, short_name, id
         LIMIT ?4
      `).bind(customerQuery, customerId, customerLike, limit).all<{
        id: number; customer_no: string | null; short_name: string;
      }>(),
      this.db.prepare(`
        SELECT id, item_no, name, spec, base_unit, is_active
          FROM items
         WHERE (
           (is_active = 1 AND (
             ?1 = ''
             OR item_no LIKE ?2 ESCAPE '\\'
             OR name LIKE ?2 ESCAPE '\\'
             OR COALESCE(spec, '') LIKE ?2 ESCAPE '\\'
           ))
           OR id IN (${itemPlaceholders})
         )
         ORDER BY CASE WHEN id IN (${itemPlaceholders}) THEN 0 ELSE 1 END, item_no, id
         LIMIT ?
      `).bind(itemQuery, itemLike, ...itemValues, ...itemValues, limit).all<{
        id: number; item_no: string; name: string; spec: string | null; base_unit: string; is_active: number;
      }>(),
      this.db.prepare(`
        SELECT id, employee_no, is_active
          FROM app_members
         WHERE is_active = 1 OR id = ?1
         ORDER BY CASE WHEN id = ?1 THEN 0 ELSE 1 END, COALESCE(employee_no, ''), id
         LIMIT ?2
      `).bind(operatorId, limit).all<{
        id: number; employee_no: string | null; is_active: number;
      }>(),
    ]);

    const itemRows = itemResult.results ?? [];
    const units = new Map<number, string[]>();
    if (itemRows.length > 0) {
      const ids = itemRows.map((row) => row.id);
      const placeholders = ids.map(() => "?").join(", ");
      const conversions = await this.db.prepare(`
        SELECT item_id, from_unit
          FROM item_unit_conversions
         WHERE item_id IN (${placeholders})
         ORDER BY item_id, sort_order, id
      `).bind(...ids).all<{ item_id: number; from_unit: string }>();
      for (const row of conversions.results ?? []) {
        const list = units.get(row.item_id) ?? [];
        if (!list.includes(row.from_unit)) list.push(row.from_unit);
        units.set(row.item_id, list);
      }
    }

    return {
      actor,
      customers: (customerResult.results ?? []).map((row) => ({
        id: row.id,
        customerNo: row.customer_no,
        shortName: row.short_name,
      })),
      items: itemRows.map((row) => ({
        id: row.id,
        itemNo: row.item_no,
        name: row.name,
        spec: row.spec,
        baseUnit: row.base_unit,
        allowedUnits: [row.base_unit, ...(units.get(row.id) ?? []).filter((unit) => unit !== row.base_unit)],
        isActive: row.is_active === 1,
      })),
      operators: (operatorResult.results ?? []).map((row) => ({
        id: row.id,
        employeeNo: row.employee_no,
        isActive: row.is_active === 1,
      })),
    };
  }

  async outsourcingLookups(
    actor: BusinessActorRef,
    selected: {
      itemIds?: readonly number[];
      itemQuery?: string;
      limit?: number;
    },
  ): Promise<OutsourcingModuleLookups> {
    const limit = Math.max(1, Math.min(Math.trunc(selected.limit ?? 100), 100));
    const itemIds = [...new Set((selected.itemIds ?? []).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 100);
    const itemPlaceholders = itemIds.length ? itemIds.map(() => "?").join(", ") : "?";
    const itemValues = itemIds.length ? itemIds : [-1];
    const itemQuery = selected.itemQuery?.trim() ?? "";
    const itemLike = `%${itemQuery.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
    const result = await this.db.prepare(`
      SELECT id, item_no, name, spec, base_unit, is_active
        FROM items
       WHERE (
         (is_active = 1 AND (
           ?1 = ''
           OR item_no LIKE ?2 ESCAPE '\\'
           OR name LIKE ?2 ESCAPE '\\'
           OR COALESCE(spec, '') LIKE ?2 ESCAPE '\\'
         ))
         OR id IN (${itemPlaceholders})
       )
       ORDER BY CASE WHEN id IN (${itemPlaceholders}) THEN 0 ELSE 1 END, item_no, id
       LIMIT ?
    `).bind(itemQuery, itemLike, ...itemValues, ...itemValues, limit).all<{
      id: number; item_no: string; name: string; spec: string | null; base_unit: string; is_active: number;
    }>();

    const itemRows = result.results ?? [];
    const units = new Map<number, string[]>();
    if (itemRows.length > 0) {
      const ids = itemRows.map((row) => row.id);
      const placeholders = ids.map(() => "?").join(", ");
      const conversions = await this.db.prepare(`
        SELECT item_id, from_unit
          FROM item_unit_conversions
         WHERE item_id IN (${placeholders})
         ORDER BY item_id, sort_order, id
      `).bind(...ids).all<{ item_id: number; from_unit: string }>();
      for (const row of conversions.results ?? []) {
        const list = units.get(row.item_id) ?? [];
        if (!list.includes(row.from_unit)) list.push(row.from_unit);
        units.set(row.item_id, list);
      }
    }

    return {
      actor,
      items: itemRows.map((row) => ({
        id: row.id,
        itemNo: row.item_no,
        name: row.name,
        spec: row.spec,
        baseUnit: row.base_unit,
        allowedUnits: [row.base_unit, ...(units.get(row.id) ?? []).filter((unit) => unit !== row.base_unit)],
        isActive: row.is_active === 1,
      })),
    };
  }

  async itemLookups(actor: BusinessActorRef): Promise<ItemModuleLookups> {
    const result = await this.db.prepare(
      "SELECT id,code,name,parent_id,sort_order,is_active,updated_at FROM item_categories ORDER BY sort_order,id",
    ).all<LookupRow>();
    return {
      actor,
      itemCategories: (result.results ?? []).map(toLookup),
    };
  }
}

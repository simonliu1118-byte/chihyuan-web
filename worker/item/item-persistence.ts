import { AuditService } from "../audit/audit-service";
import type { ItemRecordVersion } from "./item-repository";
import type {
  NormalizedChangeItemNumberRequest,
  NormalizedCreateItemRequest,
  NormalizedItemProfile,
  NormalizedUpdateItemRequest,
} from "./item-validation";

export interface ItemMutationContext {
  actorMemberId: number;
  now: string;
  requestId?: string | null;
}

function assertContext(context: ItemMutationContext): void {
  if (!Number.isInteger(context.actorMemberId) || context.actorMemberId <= 0) {
    throw new Error("ITEM_MUTATION_ACTOR_REQUIRED");
  }
  if (!context.now || Number.isNaN(Date.parse(context.now))) {
    throw new Error("ITEM_MUTATION_TIMESTAMP_REQUIRED");
  }
}

function createConversionStatements(
  db: D1Database,
  input: NormalizedItemProfile,
): D1PreparedStatement[] {
  return input.unitConversions.map((row) => db.prepare(`
    INSERT INTO item_unit_conversions (item_id, from_unit, quantity, to_unit, sort_order)
    VALUES ((SELECT MAX(id) FROM items), ?1, ?2, ?3, ?4)
  `).bind(row.fromUnit, row.quantityScaled4, row.toUnit, row.sortOrder));
}

function updateConversionStatements(
  db: D1Database,
  itemId: number,
  input: NormalizedUpdateItemRequest,
): D1PreparedStatement[] {
  const revision = input.expectedRevision;
  return [
    db.prepare(`
      DELETE FROM item_unit_conversions
       WHERE item_id = ?1
         AND EXISTS (SELECT 1 FROM items WHERE id = ?1 AND revision = ?2)
    `).bind(itemId, revision),
    ...input.unitConversions.map((row) => db.prepare(`
      INSERT INTO item_unit_conversions (item_id, from_unit, quantity, to_unit, sort_order)
      SELECT ?1, ?2, ?3, ?4, ?5
       WHERE EXISTS (SELECT 1 FROM items WHERE id = ?1 AND revision = ?6)
    `).bind(itemId, row.fromUnit, row.quantityScaled4, row.toUnit, row.sortOrder, revision)),
  ];
}

export class ItemPersistence {
  private readonly audit: AuditService;

  constructor(private readonly db: D1Database) {
    this.audit = new AuditService(db);
  }

  async create(input: NormalizedCreateItemRequest, context: ItemMutationContext): Promise<number> {
    assertContext(context);
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`
        INSERT INTO items (
          item_no, name, spec, base_unit, item_category_id,
          cost, cost_tax_mode, store_price, clinic_price, notes, is_active,
          created_at, created_by, updated_at, updated_by, revision
        ) VALUES (
          ?1, ?2, ?3, ?4, ?5,
          ?6, ?7, ?8, ?9, ?10, ?11,
          ?12, ?13, ?12, ?13, 1
        )
      `).bind(
        input.itemNo,
        input.name,
        input.spec,
        input.baseUnit,
        input.itemCategoryId,
        input.costScaled4,
        input.costTaxMode,
        input.storePriceScaled4,
        input.clinicPriceScaled4,
        input.notes,
        input.isActive ? 1 : 0,
        context.now,
        context.actorMemberId,
      ),
      ...createConversionStatements(this.db, input),
      this.db.prepare("SELECT MAX(id) AS item_id FROM items"),
    ];

    const results = await this.db.batch(statements);
    const row = results[results.length - 1]?.results?.[0] as { item_id?: number } | undefined;
    const itemId = Number(row?.item_id ?? 0);
    if (!Number.isSafeInteger(itemId) || itemId <= 0) throw new Error("ITEM_CREATE_ID_UNAVAILABLE");
    return itemId;
  }

  async update(
    itemId: number,
    input: NormalizedUpdateItemRequest,
    context: ItemMutationContext,
  ): Promise<boolean> {
    assertContext(context);
    const statements = [
      ...updateConversionStatements(this.db, itemId, input),
      this.db.prepare(`
        UPDATE items
           SET name = ?1,
               spec = ?2,
               base_unit = ?3,
               item_category_id = ?4,
               cost = ?5,
               cost_tax_mode = ?6,
               store_price = ?7,
               clinic_price = ?8,
               notes = ?9,
               is_active = ?10,
               updated_at = ?11,
               updated_by = ?12,
               revision = revision + 1
         WHERE id = ?13
           AND revision = ?14
      `).bind(
        input.name,
        input.spec,
        input.baseUnit,
        input.itemCategoryId,
        input.costScaled4,
        input.costTaxMode,
        input.storePriceScaled4,
        input.clinicPriceScaled4,
        input.notes,
        input.isActive ? 1 : 0,
        context.now,
        context.actorMemberId,
        itemId,
        input.expectedRevision,
      ),
    ];
    const results = await this.db.batch(statements);
    return Number(results[results.length - 1]?.meta?.changes ?? 0) === 1;
  }

  async changeItemNumber(
    current: ItemRecordVersion,
    input: NormalizedChangeItemNumberRequest,
    context: ItemMutationContext,
  ): Promise<boolean> {
    assertContext(context);
    const nextRevision = input.expectedRevision + 1;
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`
        INSERT INTO item_number_history (
          item_id, item_no, valid_from, valid_to, change_source, is_searchable, created_at
        )
        SELECT i.id, i.item_no, ?1, ?2, ?3, 1, ?2
          FROM items AS i
         WHERE i.id = ?4
           AND i.revision = ?5
      `).bind(
        current.currentNumberValidFrom,
        context.now,
        input.changeSource,
        current.id,
        input.expectedRevision,
      ),
      this.db.prepare(`
        UPDATE items
           SET item_no = ?1,
               updated_at = ?2,
               updated_by = ?3,
               revision = revision + 1
         WHERE id = ?4
           AND revision = ?5
      `).bind(
        input.newItemNo,
        context.now,
        context.actorMemberId,
        current.id,
        input.expectedRevision,
      ),
      this.audit.prepareRecord({
        entityType: "item",
        entityKey: String(current.id),
        action: "item.number.changed",
        actorEmployeeId: context.actorMemberId,
        occurredAt: context.now,
        requestId: context.requestId,
        before: { itemNo: current.itemNo },
        after: { itemNo: input.newItemNo },
        metadata: input.changeSource ? { changeSource: input.changeSource } : null,
      }, {
        sql: "EXISTS (SELECT 1 FROM items WHERE id = ? AND revision = ?)",
        values: [current.id, nextRevision],
      }),
    ];

    const results = await this.db.batch(statements);
    return Number(results[1]?.meta?.changes ?? 0) === 1;
  }
}

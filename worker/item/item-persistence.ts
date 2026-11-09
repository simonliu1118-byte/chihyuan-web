import { nextEntityIdSql } from "../persistence/entity-id";
import { formatScaled4 } from "../../shared/fixed-point";
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

function createPriceStatements(db:D1Database,input:NormalizedItemProfile,context:ItemMutationContext):D1PreparedStatement[]{
 const statements:D1PreparedStatement[]=[];
 for(const row of input.wholesalePrices??[]){
  statements.push(db.prepare("INSERT INTO item_wholesale_prices(item_id,unit,price,sort_order) VALUES((SELECT MAX(id) FROM items),?,?,?)")
    .bind(row.unit,row.priceScaled4,row.sortOrder));
  statements.push(db.prepare(`INSERT INTO audit_events(entity_type,entity_key,action,actor_employee_id,occurred_at,request_id,after_json)
   SELECT 'item',CAST(MAX(id) AS TEXT),'item.price.changed',?,?,?,? FROM items`)
   .bind(context.actorMemberId,context.now,context.requestId??null,JSON.stringify({["批發價/"+row.unit]:formatScaled4(row.priceScaled4)})));
 }
 for(const row of input.onlinePrices??[]){
  statements.push(db.prepare("INSERT INTO item_online_prices(item_id,platform_id,price) VALUES((SELECT MAX(id) FROM items),?,?)")
    .bind(row.platformId,row.priceScaled4));
  statements.push(db.prepare(`INSERT INTO audit_events(entity_type,entity_key,action,actor_employee_id,occurred_at,request_id,after_json)
   SELECT 'item',CAST(MAX(id) AS TEXT),'item.price.changed',?,?,?,? FROM items`)
   .bind(context.actorMemberId,context.now,context.requestId??null,JSON.stringify({["網路價/平台"+row.platformId]:formatScaled4(row.priceScaled4)})));
 }
 return statements;
}
function updatePriceStatements(db:D1Database,itemId:number,input:NormalizedUpdateItemRequest):D1PreparedStatement[]{
 const statements:D1PreparedStatement[]=[];
 if(input.wholesalePrices){
  statements.push(db.prepare(`DELETE FROM item_wholesale_prices WHERE item_id=?1 AND EXISTS(SELECT 1 FROM items WHERE id=?1 AND revision=?2)`).bind(itemId,input.expectedRevision));
  for(const row of input.wholesalePrices)statements.push(db.prepare(`INSERT INTO item_wholesale_prices(item_id,unit,price,sort_order)
   SELECT ?1,?2,?3,?4 WHERE EXISTS(SELECT 1 FROM items WHERE id=?1 AND revision=?5)`)
   .bind(itemId,row.unit,row.priceScaled4,row.sortOrder,input.expectedRevision));
 }
 if(input.onlinePrices){
  statements.push(db.prepare(`DELETE FROM item_online_prices WHERE item_id=?1 AND EXISTS(SELECT 1 FROM items WHERE id=?1 AND revision=?2)`).bind(itemId,input.expectedRevision));
  for(const row of input.onlinePrices)statements.push(db.prepare(`INSERT INTO item_online_prices(item_id,platform_id,price)
   SELECT ?1,?2,?3 WHERE EXISTS(SELECT 1 FROM items WHERE id=?1 AND revision=?4)`)
   .bind(itemId,row.platformId,row.priceScaled4,input.expectedRevision));
 }
 return statements;
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
        INSERT INTO items (id,
          item_no, name, spec, base_unit, item_category_id,
          cost, cost_tax_mode, store_price, clinic_price, notes, is_active,
          created_at, created_by, updated_at, updated_by, revision
        ) VALUES (${nextEntityIdSql("items")},
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
      ...createPriceStatements(this.db,input,context),
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
    const events:D1PreparedStatement[]=[];
    const auditValue=(key:string,before:number|null,after:number|null)=>{
      if(before===after)return;
      events.push(this.audit.prepareRecord({
        entityType:"item",entityKey:String(itemId),action:"item.price.changed",
        actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,
        before:{[key]:before==null?null:formatScaled4(before)},
        after:{[key]:after==null?null:formatScaled4(after)},
      },{sql:"EXISTS (SELECT 1 FROM items WHERE id = ? AND revision = ?)",values:[itemId,input.expectedRevision+1]}));
    };
    if(input.wholesalePrices){
      const old=await this.db.prepare("SELECT unit,price FROM item_wholesale_prices WHERE item_id=?").bind(itemId).all<{unit:string;price:number}>();
      const previous=new Map((old.results??[]).map(row=>[row.unit,row.price]));
      const next=new Map(input.wholesalePrices.map(row=>[row.unit,row.priceScaled4]));
      for(const unit of new Set([...previous.keys(),...next.keys()]))
        auditValue("批發價/"+unit,previous.get(unit)??null,next.get(unit)??null);
    }
    if(input.onlinePrices){
      const old=await this.db.prepare("SELECT platform_id,price FROM item_online_prices WHERE item_id=?").bind(itemId).all<{platform_id:number;price:number}>();
      const previous=new Map((old.results??[]).map(row=>[row.platform_id,row.price]));
      const next=new Map(input.onlinePrices.map(row=>[row.platformId,row.priceScaled4]));
      const names=await this.db.prepare("SELECT id,name FROM item_web_platforms").all<{id:number;name:string}>();
      const byId=new Map((names.results??[]).map(row=>[row.id,row.name]));
      for(const id of new Set([...previous.keys(),...next.keys()]))
        auditValue("網路價/"+(byId.get(id)??String(id)),previous.get(id)??null,next.get(id)??null);
    }
    const statements = [
      ...updateConversionStatements(this.db, itemId, input),
      ...updatePriceStatements(this.db,itemId,input),
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
      ...events,
    ];
    const results = await this.db.batch(statements);
    return Number(results[results.length - 1-events.length]?.meta?.changes ?? 0) === 1;
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

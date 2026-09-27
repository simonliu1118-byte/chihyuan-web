import type {
  BomDetail,
  BomListResult,
  BomSearchQuery,
  CreateBomRequest,
  UpdateBomRequest,
} from "../../shared/contractor-outsourcing";
import { formatScaled4, parseScaled4 } from "../../shared/fixed-point";
import { FieldValidationError, ValidationBag } from "../validation/fields";
import { allowedUnits, type UnitConversionEdge } from "../item/unit-conversion";

export interface BomMutationContext {
  actorMemberId: number;
  now: string;
}

interface NormalizedBomComponent {
  itemId: number;
  quantityScaled4: number;
  unit: string;
  sortOrder: number;
}

interface NormalizedBomProfile {
  recipeRef: string;
  finishedItemId: number;
  outputQuantityScaled4: number;
  outputUnit: string;
  isActive: boolean;
  components: readonly NormalizedBomComponent[];
}

interface ItemUnitRef {
  id: number;
  itemNo: string;
  itemName: string;
  baseUnit: string;
  allowedUnits: ReadonlySet<string>;
}

export type BomServiceErrorCode = "BOM_NOT_FOUND" | "BOM_REVISION_CONFLICT" | "BOM_REF_CONFLICT";

export class BomServiceError extends Error {
  constructor(readonly code: BomServiceErrorCode, readonly status: 404 | 409, message: string) {
    super(message);
    this.name = "BomServiceError";
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new FieldValidationError({ _request: "Request body must be a JSON object" });
  }
  return value as Record<string, unknown>;
}

function parsePositiveScaled4(value: unknown, path: string, errors: Record<string, string>): number {
  if (typeof value !== "string") {
    errors[path] = "請以十進位文字輸入";
    return 0;
  }
  try {
    const parsed = parseScaled4(value);
    if (parsed <= 0) errors[path] = "必須大於 0";
    return parsed;
  } catch {
    errors[path] = "最多支援 4 位小數";
    return 0;
  }
}

function normalizeProfile(raw: unknown): NormalizedBomProfile & { expectedRevision?: number } {
  const input = asObject(raw as CreateBomRequest | UpdateBomRequest);
  const bag = new ValidationBag(input);
  const recipeRef = bag.requiredText("recipeRef", { maxLength: 120 }) ?? "";
  const finishedItemId = bag.requiredPositiveInteger("finishedItemId") ?? 0;
  const outputUnit = bag.requiredText("outputUnit", { maxLength: 40 }) ?? "";
  const errors: Record<string, string> = { ...bag.fields() };
  const outputQuantityScaled4 = parsePositiveScaled4(input.outputQuantity, "outputQuantity", errors);
  const isActive = input.isActive == null ? true : input.isActive === true;
  if (input.isActive != null && typeof input.isActive !== "boolean") errors.isActive = "必須是布林值";

  const rawComponents = input.components;
  const components: NormalizedBomComponent[] = [];
  if (!Array.isArray(rawComponents) || rawComponents.length === 0) {
    errors.components = "至少需要 1 筆 BOM 組成";
  } else if (rawComponents.length > 100) {
    errors.components = "BOM 組成最多 100 筆";
  } else {
    rawComponents.forEach((entry, index) => {
      const path = `components.${index}`;
      const row = entry != null && typeof entry === "object" && !Array.isArray(entry) ? entry as Record<string, unknown> : {};
      const itemId = typeof row.itemId === "number" && Number.isInteger(row.itemId) && row.itemId > 0 ? row.itemId : 0;
      if (!itemId) errors[`${path}.itemId`] = "商品必填";
      const quantityScaled4 = parsePositiveScaled4(row.quantity, `${path}.quantity`, errors);
      const unit = typeof row.unit === "string" ? row.unit.trim() : "";
      if (!unit) errors[`${path}.unit`] = "單位必填";
      let sortOrder = index;
      if (row.sortOrder != null) {
        if (typeof row.sortOrder !== "number" || !Number.isInteger(row.sortOrder) || row.sortOrder < 0) errors[`${path}.sortOrder`] = "必須是 0 以上整數";
        else sortOrder = row.sortOrder;
      }
      components.push({ itemId, quantityScaled4, unit, sortOrder });
    });
  }

  const duplicate = new Set<string>();
  components.forEach((component, index) => {
    const key = `${component.itemId}:${component.unit}`;
    if (duplicate.has(key)) errors[`components.${index}.itemId`] = "同一 BOM 不可重複相同商品＋單位";
    duplicate.add(key);
  });

  let expectedRevision: number | undefined;
  if (input.expectedRevision != null) {
    if (typeof input.expectedRevision !== "number" || !Number.isInteger(input.expectedRevision) || input.expectedRevision <= 0) errors.expectedRevision = "必須是正整數";
    else expectedRevision = input.expectedRevision;
  }
  if (Object.keys(errors).length > 0) throw new FieldValidationError(errors);
  return { recipeRef, finishedItemId, outputQuantityScaled4, outputUnit, isActive, components, expectedRevision };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export class BomService {
  constructor(private readonly db: D1Database) {}

  async search(query: BomSearchQuery): Promise<BomListResult> {
    const where: string[] = [];
    const params: (string | number | null)[] = [];
    if (query.q?.trim()) {
      const like = `%${escapeLike(query.q.trim())}%`;
      where.push("(b.recipe_ref LIKE ? ESCAPE '\\' OR i.item_no LIKE ? ESCAPE '\\' OR i.name LIKE ? ESCAPE '\\')");
      params.push(like, like, like);
    }
    if (query.finishedItemId != null) {
      where.push("b.finished_item_id = ?");
      params.push(query.finishedItemId);
    }
    if (query.isActive != null) {
      where.push("b.is_active = ?");
      params.push(query.isActive ? 1 : 0);
    }
    const limit = query.limit != null && Number.isInteger(query.limit) && query.limit > 0 ? Math.min(query.limit, 100) : 30;
    let cursorId: number | null = null;
    if (query.cursor) {
      try { cursorId = Number(atob(query.cursor.replace(/-/g, "+").replace(/_/g, "/"))); } catch { cursorId = null; }
      if (!Number.isSafeInteger(cursorId) || (cursorId ?? 0) <= 0) return { items: [], nextCursor: null };
      where.push("b.id < ?");
      params.push(cursorId!);
    }
    params.push(limit + 1);
    const result = await this.db.prepare(`
      SELECT b.id,b.recipe_ref,b.finished_item_id,i.item_no,i.name,
             b.output_quantity,b.output_unit,b.is_active,b.revision,b.updated_at
        FROM bom_recipes AS b JOIN items AS i ON i.id=b.finished_item_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY b.id DESC LIMIT ?
    `).bind(...params).all<{
      id:number;recipe_ref:string;finished_item_id:number;item_no:string;name:string;
      output_quantity:number;output_unit:string;is_active:number;revision:number;updated_at:string;
    }>();
    const rows = result.results ?? [];
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    const last = visible[visible.length - 1];
    return {
      items: visible.map((row) => ({
        id: row.id, recipeRef: row.recipe_ref, finishedItemId: row.finished_item_id,
        finishedItemNo: row.item_no, finishedItemName: row.name,
        outputQuantity: formatScaled4(row.output_quantity), outputUnit: row.output_unit,
        isActive: row.is_active === 1, revision: row.revision, updatedAt: row.updated_at,
      })),
      nextCursor: hasMore && last ? btoa(String(last.id)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"") : null,
    };
  }

  async getDetail(bomId: number): Promise<BomDetail> {
    if (!Number.isInteger(bomId) || bomId <= 0) throw new FieldValidationError({ bomId: "必須是正整數" });
    const results = await this.db.batch([
      this.db.prepare(`
        SELECT b.id,b.recipe_ref,b.finished_item_id,i.item_no,i.name,b.output_quantity,b.output_unit,
               b.is_active,b.created_at,b.updated_at,b.revision
          FROM bom_recipes b JOIN items i ON i.id=b.finished_item_id WHERE b.id=? LIMIT 1
      `).bind(bomId),
      this.db.prepare(`
        SELECT c.id,c.component_item_id,i.item_no,i.name,c.quantity,c.unit,c.sort_order
          FROM bom_components c JOIN items i ON i.id=c.component_item_id
         WHERE c.bom_recipe_id=? ORDER BY c.sort_order,c.id
      `).bind(bomId),
    ]);
    const row = results[0]?.results?.[0] as {
      id:number;recipe_ref:string;finished_item_id:number;item_no:string;name:string;output_quantity:number;
      output_unit:string;is_active:number;created_at:string;updated_at:string;revision:number;
    } | undefined;
    if (!row) throw new BomServiceError("BOM_NOT_FOUND",404,"BOM not found");
    const components = (results[1]?.results ?? []) as Array<{id:number;component_item_id:number;item_no:string;name:string;quantity:number;unit:string;sort_order:number}>;
    return {
      id:row.id, recipeRef:row.recipe_ref, finishedItemId:row.finished_item_id,
      finishedItemNo:row.item_no, finishedItemName:row.name, outputQuantity:formatScaled4(row.output_quantity),
      outputUnit:row.output_unit, isActive:row.is_active===1, revision:row.revision, updatedAt:row.updated_at,
      createdAt:row.created_at,
      components:components.map(c=>({id:c.id,itemId:c.component_item_id,itemNo:c.item_no,itemName:c.name,quantity:formatScaled4(c.quantity),unit:c.unit,sortOrder:c.sort_order})),
    };
  }

  async create(raw: unknown, context: BomMutationContext): Promise<BomDetail> {
    this.assertContext(context);
    const input = normalizeProfile(raw);
    await this.validateItemUnits(input);
    if (await this.recipeRefExists(input.recipeRef)) throw new BomServiceError("BOM_REF_CONFLICT",409,"BOM reference already exists");
    const statements:D1PreparedStatement[]=[
      this.db.prepare(`INSERT INTO bom_recipes(recipe_ref,finished_item_id,output_quantity,output_unit,is_active,created_at,created_by,updated_at,updated_by,revision)
        VALUES(?1,?2,?3,?4,?5,?6,?7,?6,?7,1)`).bind(input.recipeRef,input.finishedItemId,input.outputQuantityScaled4,input.outputUnit,input.isActive?1:0,context.now,context.actorMemberId),
    ];
    input.components.forEach(c=>statements.push(this.db.prepare(`INSERT INTO bom_components(bom_recipe_id,component_item_id,quantity,unit,sort_order)
      SELECT (SELECT MAX(id) FROM bom_recipes),?1,?2,?3,?4`).bind(c.itemId,c.quantityScaled4,c.unit,c.sortOrder)));
    statements.push(this.db.prepare("SELECT MAX(id) AS bom_id FROM bom_recipes"));
    const results=await this.db.batch(statements);
    const id=Number((results[results.length-1]?.results?.[0] as {bom_id?:number}|undefined)?.bom_id??0);
    if(!Number.isSafeInteger(id)||id<=0)throw new Error("BOM_CREATE_ID_UNAVAILABLE");
    return this.getDetail(id);
  }

  async update(bomId:number,raw:unknown,context:BomMutationContext):Promise<BomDetail>{
    this.assertContext(context);
    if(!Number.isInteger(bomId)||bomId<=0)throw new FieldValidationError({bomId:"必須是正整數"});
    const input=normalizeProfile(raw);
    if(input.expectedRevision==null)throw new FieldValidationError({expectedRevision:"必填"});
    const current=await this.db.prepare("SELECT recipe_ref,revision FROM bom_recipes WHERE id=?").bind(bomId).first<{recipe_ref:string;revision:number}>();
    if(!current)throw new BomServiceError("BOM_NOT_FOUND",404,"BOM not found");
    if(current.revision!==input.expectedRevision)throw new BomServiceError("BOM_REVISION_CONFLICT",409,"BOM has changed since it was loaded");
    if(current.recipe_ref!==input.recipeRef&&await this.recipeRefExists(input.recipeRef,bomId))throw new BomServiceError("BOM_REF_CONFLICT",409,"BOM reference already exists");
    await this.validateItemUnits(input);
    const gate="EXISTS(SELECT 1 FROM bom_recipes WHERE id=? AND revision=?)";
    const statements:D1PreparedStatement[]=[this.db.prepare(`DELETE FROM bom_components WHERE bom_recipe_id=?1 AND ${gate}`).bind(bomId,bomId,input.expectedRevision)];
    input.components.forEach(c=>statements.push(this.db.prepare(`INSERT INTO bom_components(bom_recipe_id,component_item_id,quantity,unit,sort_order)
      SELECT ?1,?2,?3,?4,?5 WHERE ${gate}`).bind(bomId,c.itemId,c.quantityScaled4,c.unit,c.sortOrder,bomId,input.expectedRevision)));
    statements.push(this.db.prepare(`UPDATE bom_recipes SET recipe_ref=?1,finished_item_id=?2,output_quantity=?3,output_unit=?4,is_active=?5,
      updated_at=?6,updated_by=?7,revision=revision+1 WHERE id=?8 AND revision=?9`).bind(input.recipeRef,input.finishedItemId,input.outputQuantityScaled4,input.outputUnit,input.isActive?1:0,context.now,context.actorMemberId,bomId,input.expectedRevision));
    const results=await this.db.batch(statements);
    if(Number(results[results.length-1]?.meta?.changes??0)!==1)throw new BomServiceError("BOM_REVISION_CONFLICT",409,"BOM has changed since it was loaded");
    return this.getDetail(bomId);
  }

  private async recipeRefExists(recipeRef:string,excludeId?:number):Promise<boolean>{
    const row=excludeId==null
      ? await this.db.prepare("SELECT 1 AS found FROM bom_recipes WHERE recipe_ref=? LIMIT 1").bind(recipeRef).first<{found:number}>()
      : await this.db.prepare("SELECT 1 AS found FROM bom_recipes WHERE recipe_ref=? AND id<>? LIMIT 1").bind(recipeRef,excludeId).first<{found:number}>();
    return !!row;
  }

  private async resolveItemUnits(itemIds:readonly number[]):Promise<Map<number,ItemUnitRef>>{
    const ids=[...new Set(itemIds)];
    if(ids.length===0)return new Map();
    const placeholders=ids.map(()=>"?").join(",");
    const result=await this.db.prepare(`SELECT id,item_no,name,base_unit FROM items WHERE id IN (${placeholders})`).bind(...ids).all<{id:number;item_no:string;name:string;base_unit:string}>();
    const map=new Map<number,ItemUnitRef>();
    for(const item of result.results??[]){
      const conv=await this.db.prepare("SELECT from_unit,quantity,to_unit FROM item_unit_conversions WHERE item_id=? ORDER BY sort_order,id").bind(item.id).all<{from_unit:string;quantity:number;to_unit:string}>();
      const edges=(conv.results??[]).map(r=>({fromUnit:r.from_unit,quantityScaled4:r.quantity,toUnit:r.to_unit}));
      map.set(item.id,{id:item.id,itemNo:item.item_no,itemName:item.name,baseUnit:item.base_unit,allowedUnits:allowedUnits(item.base_unit,edges)});
    }
    return map;
  }

  private async validateItemUnits(input:NormalizedBomProfile):Promise<void>{
    const refs=await this.resolveItemUnits([input.finishedItemId,...input.components.map(c=>c.itemId)]);
    const errors:Record<string,string>={};
    const finished=refs.get(input.finishedItemId);
    if(!finished)errors.finishedItemId="成品不存在";
    else if(!finished.allowedUnits.has(input.outputUnit))errors.outputUnit=`成品單位必須是 ${[...finished.allowedUnits].join(" / ")}`;
    input.components.forEach((component,index)=>{
      const item=refs.get(component.itemId);
      if(!item)errors[`components.${index}.itemId`]="料件商品不存在";
      else if(!item.allowedUnits.has(component.unit))errors[`components.${index}.unit`]=`料件單位必須是 ${[...item.allowedUnits].join(" / ")}`;
    });
    if(Object.keys(errors).length>0)throw new FieldValidationError(errors);
  }

  private assertContext(context:BomMutationContext):void{
    if(!Number.isInteger(context.actorMemberId)||context.actorMemberId<=0)throw new Error("BOM_MUTATION_ACTOR_REQUIRED");
    if(!context.now||Number.isNaN(Date.parse(context.now)))throw new Error("BOM_MUTATION_TIMESTAMP_REQUIRED");
  }
}

import { onlineMargins } from "./item-online-margin";
import { ItemPlatformMarginRulesService } from "./item-platform-margin-rules";
import { parseScaled4 } from "../../shared/fixed-point";
import { calculateItemMargin } from "./item-margin-service";
import type {
  ItemDetail,
  ItemListResult,
  ItemNumberHistoryRecord,
  ItemSearchQuery,
  ItemWebPlatform,
  ItemPriceHistoryRecord,
} from "../../shared/item";
import { FieldValidationError } from "../validation/fields";
import { ItemPersistence, type ItemMutationContext } from "./item-persistence";
import { ItemRepository } from "./item-repository";
import {
  normalizeChangeItemNumberRequest,
  normalizeCreateItemRequest,
  normalizeUpdateItemRequest,
  type NormalizedChangeItemNumberRequest,
  type NormalizedCreateItemRequest,
  type NormalizedUpdateItemRequest,
} from "./item-validation";

export type ItemServiceErrorCode =
  | "ITEM_NOT_FOUND"
  | "ITEM_REVISION_CONFLICT"
  | "ITEM_NO_CONFLICT"
  | "ITEM_NO_UNCHANGED";

export class ItemServiceError extends Error {
  constructor(
    readonly code: ItemServiceErrorCode,
    readonly status: 404 | 409 | 422,
    message: string,
  ) {
    super(message);
    this.name = "ItemServiceError";
  }
}

function normalizeItemId(itemId: number): number {
  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw new FieldValidationError({ itemId: "必須是正整數" });
  }
  return itemId;
}

function isItemNumberConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed:\s*items\.item_no/i.test(message);
}

export class ItemService {
  private readonly repository: ItemRepository;
  private readonly persistence: ItemPersistence;

  constructor(private readonly db: D1Database) {
    this.repository = new ItemRepository(db);
    this.persistence = new ItemPersistence(db);
  }

  async marginFor(item: ItemDetail) {
    const rules = await new ItemPlatformMarginRulesService(this.db).list(item.onlinePrices.map(row=>row.platformId));
    return {...calculateItemMargin(item),online:onlineMargins(item,await this.repository.getPlatforms(),rules)};
  }
  async getMargin(itemId: number) { return this.marginFor(await this.getDetail(itemId)); }

  async getPlatforms():Promise<readonly ItemWebPlatform[]> {return this.repository.getPlatforms()}
  async listPriceHistory(itemId:number):Promise<readonly ItemPriceHistoryRecord[]> {
    const id=normalizeItemId(itemId);
    await this.getDetail(id);
    return this.repository.listPriceHistory(id);
  }
  async search(query: ItemSearchQuery): Promise<ItemListResult> {
    return this.repository.search(query);
  }

  async getDetail(itemId: number): Promise<ItemDetail> {
    const id = normalizeItemId(itemId);
    const item = await this.repository.getDetail(id);
    if (!item) throw new ItemServiceError("ITEM_NOT_FOUND", 404, "Item not found");
    return item;
  }

  async listNumberHistory(itemId: number, limit = 50): Promise<readonly ItemNumberHistoryRecord[]> {
    const id = normalizeItemId(itemId);
    const current = await this.repository.getRecordVersion(id);
    if (!current) throw new ItemServiceError("ITEM_NOT_FOUND", 404, "Item not found");
    return this.repository.listNumberHistory(id, limit);
  }

  async create(raw: unknown, context: ItemMutationContext): Promise<ItemDetail> {
    const input = await this.preflightCreate(raw);
    let itemId: number;
    try {
      itemId = await this.persistence.create(input, context);
    } catch (error) {
      if (isItemNumberConstraintError(error)) {
        throw new ItemServiceError("ITEM_NO_CONFLICT", 409, "Item number already exists");
      }
      if(input.platformFeeCategories?.length&&error instanceof Error&&/FOREIGN KEY constraint/i.test(error.message))throw new FieldValidationError({platformFeeCategories:"品類設定已變更，請重新選擇"});
      throw error;
    }
    return this.getDetail(itemId);
  }

  async update(itemId: number, raw: unknown, context: ItemMutationContext, preserveCost = false): Promise<ItemDetail> {
    const id = normalizeItemId(itemId);
    const input = await this.preflightUpdate(id, raw, preserveCost);
    let updated:boolean;
    try {updated=await this.persistence.update(id,input,context)} catch(error){
      if(input.platformFeeCategories?.length&&error instanceof Error&&/FOREIGN KEY constraint/i.test(error.message))throw new FieldValidationError({platformFeeCategories:'品類設定已變更，請重新選擇'});
      throw error;
    }
    if (!updated) {
      throw new ItemServiceError(
        "ITEM_REVISION_CONFLICT",
        409,
        "Item has changed since it was loaded",
      );
    }
    return this.getDetail(id);
  }

  async changeItemNumber(
    itemId: number,
    raw: unknown,
    context: ItemMutationContext,
  ): Promise<ItemDetail> {
    const id = normalizeItemId(itemId);
    const input = await this.preflightNumberChange(id, raw);
    const current = await this.repository.getRecordVersion(id);
    if (!current) throw new ItemServiceError("ITEM_NOT_FOUND", 404, "Item not found");

    let changed: boolean;
    try {
      changed = await this.persistence.changeItemNumber(current, input, context);
    } catch (error) {
      if (isItemNumberConstraintError(error)) {
        throw new ItemServiceError("ITEM_NO_CONFLICT", 409, "Item number already exists");
      }
      throw error;
    }
    if (!changed) {
      throw new ItemServiceError(
        "ITEM_REVISION_CONFLICT",
        409,
        "Item has changed since it was loaded",
      );
    }
    return this.getDetail(id);
  }

  async preflightCreate(raw: unknown): Promise<NormalizedCreateItemRequest> {
    const input = normalizeCreateItemRequest(raw);
    if (!await this.repository.categoryExists(input.itemCategoryId, true)) {
      throw new FieldValidationError({ itemCategoryId: "商品分類不存在或已停用" });
    }
    if (await this.repository.itemNumberExists(input.itemNo)) {
      throw new ItemServiceError("ITEM_NO_CONFLICT", 409, "Item number already exists");
    }
    await this.validatePlatforms(input.onlinePrices);
    await this.validateFeeSelections(input.platformFeeCategories);
    return input;
  }

  private async validateFeeSelections(entries:NormalizedCreateItemRequest['platformFeeCategories']):Promise<void>{
    if(!entries?.length)return;
    const result=await this.db.prepare(`SELECT platform_id,category_id FROM item_platform_fee_categories
      WHERE platform_id IN (SELECT json_extract(value,'$.platformId') FROM json_each(?))`).bind(JSON.stringify(entries))
      .all<{platform_id:number;category_id:string}>();
    const valid=new Set((result.results??[]).map(r=>r.platform_id+':'+r.category_id));
    if(entries.some(r=>!valid.has(r.platformId+':'+r.categoryId)))throw new FieldValidationError({platformFeeCategories:'品類不存在，請先至對應平台的品類費率設定新增'});
  }

  private async validatePlatforms(entries:readonly {platformId:number}[]|null,keep:readonly number[]=[]):Promise<void> {
    if(!entries?.length)return;
    const platforms=await this.repository.getPlatforms();
    const allowed=new Set([...platforms.filter(p=>p.isActive).map(p=>p.id),...keep]);
    for(const entry of entries)if(!allowed.has(entry.platformId))
      throw new FieldValidationError({onlinePrices:"網路平台不存在或已停用"});
  }

  async preflightUpdate(itemId: number, raw: unknown, preserveCost = false): Promise<NormalizedUpdateItemRequest> {
    const id = normalizeItemId(itemId);
    const current = await this.repository.getDetail(id);
    if (!current) throw new ItemServiceError("ITEM_NOT_FOUND", 404, "Item not found");
    const input = normalizeUpdateItemRequest(raw, preserveCost ? {
      costScaled4: current.cost == null ? null : parseScaled4(current.cost), costTaxMode: current.costTaxMode,
    } : undefined);
    if (current.revision !== input.expectedRevision) {
      throw new ItemServiceError(
        "ITEM_REVISION_CONFLICT",
        409,
        "Item has changed since it was loaded",
      );
    }

    const categoryChanged = (current.category?.id ?? null) !== input.itemCategoryId;
    if (!await this.repository.categoryExists(input.itemCategoryId, categoryChanged)) {
      throw new FieldValidationError({
        itemCategoryId: categoryChanged ? "商品分類不存在或已停用" : "商品分類不存在",
      });
    }
    await this.validatePlatforms(input.onlinePrices,current.onlinePrices.map(p=>p.platformId));
    await this.validateFeeSelections(input.platformFeeCategories);
    return input;
  }

  async preflightNumberChange(
    itemId: number,
    raw: unknown,
  ): Promise<NormalizedChangeItemNumberRequest> {
    const id = normalizeItemId(itemId);
    const input = normalizeChangeItemNumberRequest(raw);
    const current = await this.repository.getRecordVersion(id);
    if (!current) throw new ItemServiceError("ITEM_NOT_FOUND", 404, "Item not found");
    if (current.revision !== input.expectedRevision) {
      throw new ItemServiceError(
        "ITEM_REVISION_CONFLICT",
        409,
        "Item has changed since it was loaded",
      );
    }
    if (current.itemNo === input.newItemNo) {
      throw new ItemServiceError("ITEM_NO_UNCHANGED", 422, "New Item number is unchanged");
    }
    if (await this.repository.itemNumberExists(input.newItemNo, id)) {
      throw new ItemServiceError("ITEM_NO_CONFLICT", 409, "Item number already exists");
    }
    return input;
  }
}

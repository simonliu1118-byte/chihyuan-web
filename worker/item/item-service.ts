import type {
  ItemDetail,
  ItemListResult,
  ItemNumberHistoryRecord,
  ItemSearchQuery,
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

  constructor(db: D1Database) {
    this.repository = new ItemRepository(db);
    this.persistence = new ItemPersistence(db);
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
      throw error;
    }
    return this.getDetail(itemId);
  }

  async update(itemId: number, raw: unknown, context: ItemMutationContext): Promise<ItemDetail> {
    const id = normalizeItemId(itemId);
    const input = await this.preflightUpdate(id, raw);
    const updated = await this.persistence.update(id, input, context);
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
    return input;
  }

  async preflightUpdate(itemId: number, raw: unknown): Promise<NormalizedUpdateItemRequest> {
    const id = normalizeItemId(itemId);
    const input = normalizeUpdateItemRequest(raw);
    const current = await this.repository.getDetail(id);
    if (!current) throw new ItemServiceError("ITEM_NOT_FOUND", 404, "Item not found");
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

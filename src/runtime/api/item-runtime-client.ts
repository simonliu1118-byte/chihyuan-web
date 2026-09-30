import type { ItemModuleLookups } from "../../../shared/business-lookups";
import type {
  ChangeItemNumberRequest,
  CreateItemRequest,
  ItemDetail,
  ItemListResult,
  ItemNumberHistoryRecord,
  ItemSearchQuery,
  UpdateItemRequest,
} from "../../../shared/item";
import { apiRequest } from "../../api/client";

function itemSearchPath(query: ItemSearchQuery): string {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.itemCategoryId != null) params.set("itemCategoryId", String(query.itemCategoryId));
  if (query.isActive != null) params.set("isActive", query.isActive ? "true" : "false");
  if (query.limit != null) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  const encoded = params.toString();
  return encoded ? `/api/business/items?${encoded}` : "/api/business/items";
}

export function loadItemLookups(): Promise<ItemModuleLookups> {
  return apiRequest<ItemModuleLookups>("/api/business/items/lookups", { method: "GET" });
}

export function searchItems(query: ItemSearchQuery): Promise<ItemListResult> {
  return apiRequest<ItemListResult>(itemSearchPath(query), { method: "GET" });
}

export function loadItemDetail(itemId: number): Promise<ItemDetail> {
  return apiRequest<ItemDetail>(`/api/business/items/${encodeURIComponent(String(itemId))}`, { method: "GET" });
}

export function createItem(input: CreateItemRequest): Promise<ItemDetail> {
  return apiRequest<ItemDetail>("/api/business/items", { method: "POST", json: input });
}

export function updateItem(itemId: number, input: UpdateItemRequest): Promise<ItemDetail> {
  return apiRequest<ItemDetail>(`/api/business/items/${encodeURIComponent(String(itemId))}`, {
    method: "PATCH",
    json: input,
  });
}

export function changeItemNumber(itemId: number, input: ChangeItemNumberRequest): Promise<ItemDetail> {
  return apiRequest<ItemDetail>(`/api/business/items/${encodeURIComponent(String(itemId))}/number`, {
    method: "POST",
    json: input,
  });
}

export function loadItemNumberHistory(itemId: number, limit = 100): Promise<readonly ItemNumberHistoryRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  return apiRequest<readonly ItemNumberHistoryRecord[]>(
    `/api/business/items/${encodeURIComponent(String(itemId))}/number-history?${params.toString()}`,
    { method: "GET" },
  );
}

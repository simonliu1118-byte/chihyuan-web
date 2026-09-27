export type ItemCostTaxMode = "none" | "inclusive" | "exclusive";

export interface ItemCategoryRef {
  id: number;
  code: string | null;
  name: string;
  parentId: number | null;
}

export interface ItemSummary {
  id: number;
  itemNo: string;
  name: string;
  spec: string | null;
  baseUnit: string;
  category: ItemCategoryRef | null;
  cost: string | null;
  costTaxMode: ItemCostTaxMode | null;
  storePrice: string | null;
  clinicPrice: string | null;
  isActive: boolean;
  revision: number;
  updatedAt: string;
}

export interface ItemUnitConversion {
  id: number;
  fromUnit: string;
  quantity: string;
  toUnit: string;
  sortOrder: number;
}

export interface ItemDetail extends ItemSummary {
  notes: string | null;
  createdAt: string;
  unitConversions: readonly ItemUnitConversion[];
}

export interface ItemSearchQuery {
  q?: string;
  itemCategoryId?: number;
  isActive?: boolean;
  limit?: number;
  cursor?: string;
}

export interface ItemListResult {
  items: readonly ItemSummary[];
  nextCursor: string | null;
}

export interface ItemUnitConversionInput {
  fromUnit: string;
  quantity: string;
  toUnit: string;
  sortOrder?: number;
}

export interface ItemProfileInput {
  name: string;
  spec?: string | null;
  baseUnit: string;
  itemCategoryId?: number | null;
  cost?: string | null;
  costTaxMode?: ItemCostTaxMode | null;
  storePrice?: string | null;
  clinicPrice?: string | null;
  notes?: string | null;
  isActive?: boolean;
  unitConversions?: readonly ItemUnitConversionInput[];
}

export interface CreateItemRequest extends ItemProfileInput {
  /** Existing SMART ERP Item number. CY Web never generates this value. */
  itemNo: string;
}

export interface UpdateItemRequest extends ItemProfileInput {
  expectedRevision: number;
}

export interface ChangeItemNumberRequest {
  newItemNo: string;
  expectedRevision: number;
  changeSource?: string | null;
}

export interface ItemNumberHistoryRecord {
  id: number;
  itemId: number;
  itemNo: string;
  validFrom: string;
  validTo: string | null;
  changeSource: string | null;
  isSearchable: boolean;
  createdAt: string;
}

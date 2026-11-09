import type {
  ChangeItemNumberRequest,
  CreateItemRequest,
  ItemCostTaxMode,
  ItemProfileInput,
  UpdateItemRequest,
} from "../../shared/item";
import { parseScaled4 } from "../../shared/fixed-point";
import { FieldValidationError, ValidationBag } from "../validation/fields";

const MAX_UNIT_CONVERSIONS = 50;
const TAX_MODES = new Set<ItemCostTaxMode>(["none", "inclusive", "exclusive"]);

export interface NormalizedItemUnitConversion {
  fromUnit: string;
  quantityScaled4: number;
  toUnit: string;
  sortOrder: number;
}

export interface NormalizedItemProfile {
  name: string;
  spec: string | null;
  baseUnit: string;
  itemCategoryId: number | null;
  costScaled4: number | null;
  costTaxMode: ItemCostTaxMode | null;
  storePriceScaled4: number | null;
  clinicPriceScaled4: number | null;
  notes: string | null;
  isActive: boolean;
  unitConversions: readonly NormalizedItemUnitConversion[];
  wholesalePrices: readonly {unit:string;priceScaled4:number;sortOrder:number}[] | null;
  onlinePrices: readonly {platformId:number;priceScaled4:number}[] | null;
}

export interface NormalizedCreateItemRequest extends NormalizedItemProfile {
  itemNo: string;
}

export interface NormalizedUpdateItemRequest extends NormalizedItemProfile {
  expectedRevision: number;
}

export interface NormalizedChangeItemNumberRequest {
  newItemNo: string;
  expectedRevision: number;
  changeSource: string | null;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new FieldValidationError({ _request: "Request body must be a JSON object" });
  }
  return value as Record<string, unknown>;
}

function optionalBoolean(
  input: Record<string, unknown>,
  field: string,
  defaultValue: boolean,
  errors: Record<string, string>,
): boolean {
  const value = input[field];
  if (value == null) return defaultValue;
  if (typeof value !== "boolean") {
    errors[field] = "必須是布林值";
    return defaultValue;
  }
  return value;
}

function optionalTaxMode(
  input: Record<string, unknown>,
  errors: Record<string, string>,
): ItemCostTaxMode | null {
  const value = input.costTaxMode;
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !TAX_MODES.has(value as ItemCostTaxMode)) {
    errors.costTaxMode = "稅別格式錯誤";
    return null;
  }
  return value as ItemCostTaxMode;
}

function optionalScaled4(
  input: Record<string, unknown>,
  field: string,
  errors: Record<string, string>,
): number | null {
  const raw = input[field];
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") {
    errors[field] = "請以十進位文字輸入";
    return null;
  }
  try {
    const scaled = parseScaled4(raw);
    if (scaled < 0) {
      errors[field] = "不可小於 0";
      return null;
    }
    return scaled;
  } catch {
    errors[field] = "最多支援 4 位小數";
    return null;
  }
}

function normalizedUnitText(
  value: unknown,
  path: string,
  errors: Record<string, string>,
): string {
  if (typeof value !== "string") {
    errors[path] = "必填";
    return "";
  }
  const normalized = value.trim();
  if (!normalized) {
    errors[path] = "必填";
    return "";
  }
  if (normalized.length > 40) {
    errors[path] = "不可超過 40 個字元";
    return normalized.slice(0, 40);
  }
  return normalized;
}

function normalizeUnitConversions(
  input: Record<string, unknown>,
  baseUnit: string,
  errors: Record<string, string>,
): readonly NormalizedItemUnitConversion[] {
  const raw = input.unitConversions;
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    errors.unitConversions = "必須是陣列";
    return [];
  }
  if (raw.length > MAX_UNIT_CONVERSIONS) {
    errors.unitConversions = `單一商品最多 ${MAX_UNIT_CONVERSIONS} 組換算`;
  }

  const rows = raw.slice(0, MAX_UNIT_CONVERSIONS).map((entry, index) => {
    const path = `unitConversions.${index}`;
    const row = entry != null && typeof entry === "object" && !Array.isArray(entry)
      ? entry as Record<string, unknown>
      : {};
    if (Object.keys(row).length === 0) errors[path] = "格式錯誤";

    const fromUnit = normalizedUnitText(row.fromUnit, `${path}.fromUnit`, errors);
    const toUnit = normalizedUnitText(row.toUnit, `${path}.toUnit`, errors);

    let quantityScaled4 = 0;
    if (typeof row.quantity !== "string") {
      errors[`${path}.quantity`] = "必填";
    } else {
      try {
        quantityScaled4 = parseScaled4(row.quantity);
        if (quantityScaled4 <= 0) errors[`${path}.quantity`] = "必須大於 0";
      } catch {
        errors[`${path}.quantity`] = "最多支援 4 位小數";
      }
    }

    let sortOrder = index;
    if (row.sortOrder != null) {
      if (typeof row.sortOrder !== "number" || !Number.isInteger(row.sortOrder) || row.sortOrder < 0) {
        errors[`${path}.sortOrder`] = "必須是 0 以上整數";
      } else {
        sortOrder = row.sortOrder;
      }
    }

    if (fromUnit && fromUnit === baseUnit) {
      errors[`${path}.fromUnit`] = "換算來源單位不可與基準單位相同";
    }
    if (toUnit && toUnit !== baseUnit) {
      errors[`${path}.toUnit`] = "換算單位必須換成基準單位";
    }
    return { fromUnit, quantityScaled4, toUnit, sortOrder };
  });

  const seen = new Set<string>();
  rows.forEach((row, index) => {
    if (!row.fromUnit) return;
    if (seen.has(row.fromUnit)) {
      errors[`unitConversions.${index}.fromUnit`] = "此單位已有換算";
    }
    seen.add(row.fromUnit);
  });

  return rows;
}

function normalizeWholesale(input: Record<string,unknown>, errors:Record<string,string>):NormalizedItemProfile["wholesalePrices"] {
 const raw=input.wholesalePrices;if(raw==null)return null;
 if(!Array.isArray(raw)){errors.wholesalePrices="必須是陣列";return []}
 const used=new Set<string>();
 return raw.map((value,index)=>{
  const row=(value&&typeof value==="object"&&!Array.isArray(value)?value:{}) as Record<string,unknown>;
  const key="wholesalePrices."+index;
  const unit=normalizedUnitText(row.unit,key+".unit",errors);
  if(unit&&used.has(unit))errors[key+".unit"]="同一單位不可重複";
  used.add(unit);
  const price=optionalScaled4(row,"price",errors);
  if(price==null)errors[key+".price"]="必填價格";
  return {unit,priceScaled4:price??0,sortOrder:index};
 });
}
function normalizeOnline(input: Record<string,unknown>,errors:Record<string,string>):NormalizedItemProfile["onlinePrices"] {
 const raw=input.onlinePrices;if(raw==null)return null;
 if(!Array.isArray(raw)){errors.onlinePrices="必須是陣列";return []}
 const used=new Set<number>();
 return raw.map((value,index)=>{
  const row=(value&&typeof value==="object"&&!Array.isArray(value)?value:{}) as Record<string,unknown>;
  const key="onlinePrices."+index;
  const platformId=Number(row.platformId);
  if(!Number.isSafeInteger(platformId)||platformId<=0)errors[key+".platformId"]="平台無效";
  if(used.has(platformId))errors[key+".platformId"]="同一平台不可重複";
  used.add(platformId);
  const price=optionalScaled4(row,"price",errors);
  if(price==null)errors[key+".price"]="必填價格";
  return {platformId,priceScaled4:price??0};
 });
}

function normalizeProfile(raw: unknown): NormalizedItemProfile {
  const input = asObject(raw as ItemProfileInput);
  const bag = new ValidationBag(input);
  const errors: Record<string, string> = {};

  const name = bag.requiredText("name", { maxLength: 240 }) ?? "";
  const spec = bag.optionalText("spec", { maxLength: 500 });
  const baseUnit = bag.requiredText("baseUnit", { maxLength: 40 }) ?? "";
  const itemCategoryId = bag.optionalPositiveInteger("itemCategoryId");
  const notes = bag.optionalText("notes", { maxLength: 4000 });
  Object.assign(errors, bag.fields());

  const costScaled4 = optionalScaled4(input, "cost", errors);
  const storePriceScaled4 = optionalScaled4(input, "storePrice", errors);
  const clinicPriceScaled4 = optionalScaled4(input, "clinicPrice", errors);
  const costTaxMode = optionalTaxMode(input, errors);
  const isActive = optionalBoolean(input, "isActive", true, errors);
  const unitConversions = normalizeUnitConversions(input, baseUnit, errors);
  const wholesalePrices=normalizeWholesale(input,errors);
  const onlinePrices=normalizeOnline(input,errors);

  if (Object.keys(errors).length > 0) throw new FieldValidationError(errors);
  return {
    name,
    spec,
    baseUnit,
    itemCategoryId,
    costScaled4,
    costTaxMode,
    storePriceScaled4,
    clinicPriceScaled4,
    notes,
    isActive,
    unitConversions,
    wholesalePrices,
    onlinePrices,
  };
}

export function normalizeCreateItemRequest(raw: unknown): NormalizedCreateItemRequest {
  const input = asObject(raw as CreateItemRequest);
  const profile = normalizeProfile(input);
  const bag = new ValidationBag(input);
  const itemNo = bag.requiredText("itemNo", { maxLength: 64 }) ?? "";
  bag.throwIfInvalid();
  return { ...profile, itemNo };
}

export function normalizeUpdateItemRequest(raw: unknown): NormalizedUpdateItemRequest {
  const input = asObject(raw as UpdateItemRequest);
  const profile = normalizeProfile(input);
  const bag = new ValidationBag(input);
  const expectedRevision = bag.requiredPositiveInteger("expectedRevision");
  bag.throwIfInvalid();
  return { ...profile, expectedRevision: expectedRevision ?? 0 };
}

export function normalizeChangeItemNumberRequest(raw: unknown): NormalizedChangeItemNumberRequest {
  const input = asObject(raw as ChangeItemNumberRequest);
  const bag = new ValidationBag(input);
  const newItemNo = bag.requiredText("newItemNo", { maxLength: 64 }) ?? "";
  const expectedRevision = bag.requiredPositiveInteger("expectedRevision");
  const changeSource = bag.optionalText("changeSource", { maxLength: 120 });
  bag.throwIfInvalid();
  return { newItemNo, expectedRevision: expectedRevision ?? 0, changeSource };
}

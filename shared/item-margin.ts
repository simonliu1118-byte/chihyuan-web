import type { ItemCostTaxMode } from "./item";

export interface MarginValue {
  netSales: string;
  grossProfit: string;
  grossMarginPercent: string | null;
  negative: boolean;
}
export interface ItemMarginRow {
  channel: "store" | "clinic" | "wholesale";
  unit: string;
  price: string | null;
  netCost: string | null;
  status: string | null;
  exclusive: MarginValue | null;
  inclusive: MarginValue | null;
}
export interface ItemMarginResult {
  itemId: number;
  revision: number;
  baseUnit: string;
  originalCost: string | null;
  costTaxMode: ItemCostTaxMode | null;
  payment: string | null;
  inputTax: string | null;
  netCost: string | null;
  costStatus: string | null;
  rows: ItemMarginRow[];
}

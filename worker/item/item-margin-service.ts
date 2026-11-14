import type { ItemDetail } from "../../shared/item";
import type { ItemMarginResult, ItemMarginRow, MarginValue } from "../../shared/item-margin";
import { parseScaled4 } from "../../shared/fixed-point";
import { unitFactorToBase } from "../../shared/unit-conversion";

// Exact fractions retain tax and unit-conversion precision until the API display boundary.
export type Rational = { numerator: bigint; denominator: bigint };
export const value = (text: string): Rational => ({ numerator: BigInt(parseScaled4(text)), denominator: 10000n });
export const multiply = (a: Rational, n: bigint, d = 1n): Rational => ({ numerator: a.numerator * n, denominator: a.denominator * d });
export const subtract = (a: Rational, b: Rational): Rational => ({ numerator: a.numerator * b.denominator - b.numerator * a.denominator, denominator: a.denominator * b.denominator });
// Round halves away from zero, including negative profit. Decimal strings are JSON-safe.
export function display(a: Rational): string {
  const negative = a.numerator < 0n;
  const absolute = negative ? -a.numerator : a.numerator;
  const cents = (absolute * 200n + a.denominator) / (a.denominator * 2n);
  return `${negative && cents !== 0n ? "-" : ""}${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}
export function margin(revenue: Rational, cost: Rational): MarginValue {
  const profit = subtract(revenue, cost);
  return {
    netSales: display(revenue), grossProfit: display(profit), negative: profit.numerator < 0n,
    grossMarginPercent: revenue.numerator === 0n ? null : display({
      numerator: profit.numerator * revenue.denominator * 100n,
      denominator: profit.denominator * revenue.numerator,
    }),
  };
}

export function itemNetCost(item: Pick<ItemDetail, "cost"|"costTaxMode">): Rational|null {
  if (item.cost == null || item.costTaxMode == null) return null;
  const original=value(item.cost);
  return item.costTaxMode === "inclusive" ? multiply(original,100n,105n) : original;
}

/** Saved Item aggregate only. No client cost/price overrides, persistence or online analysis. */
export function calculateItemMargin(item: ItemDetail): ItemMarginResult {
  const costStatus = item.cost == null ? "待補成本" : item.costTaxMode == null ? "待補成本稅別" : null;
  const original = item.cost == null ? null : value(item.cost);
  const netCost = itemNetCost(item);
  const payment = original && !costStatus ? item.costTaxMode === "exclusive" ? multiply(original, 105n, 100n) : original : null;
  const edges = item.unitConversions.map(row => ({ fromUnit: row.fromUnit, toUnit: row.toUnit, quantityScaled4: parseScaled4(row.quantity) }));
  const row = (channel: ItemMarginRow["channel"], unit: string, price: string | null): ItemMarginRow => {
    let cost = netCost;
    let status = costStatus;
    if (cost) {
      try {
        const factor = unitFactorToBase(item.baseUnit, edges, unit);
        cost = multiply(cost, factor.numerator, factor.denominator);
      } catch { status = "待補單位換算"; cost = null; }
    }
    if (price == null) status = status ?? "未設定售價";
    const revenue = price == null ? null : value(price);
    return {
      channel, unit, price, netCost: cost ? display(cost) : null, status,
      exclusive: revenue && cost && channel !== "store" ? margin(revenue, cost) : null,
      inclusive: revenue && cost ? margin(multiply(revenue, 100n, 105n), cost) : null,
    };
  };
  return {
    itemId: item.id, revision: item.revision, baseUnit: item.baseUnit,
    originalCost: item.cost, costTaxMode: item.costTaxMode,
    payment: payment ? display(payment) : null,
    inputTax: payment && netCost ? display(subtract(payment, netCost)) : null,
    netCost: netCost ? display(netCost) : null, costStatus,
    rows: [row("store", item.baseUnit, item.storePrice), row("clinic", item.baseUnit, item.clinicPrice),
      ...(item.wholesalePrices.length ? item.wholesalePrices.map(entry => row("wholesale", entry.unit, entry.price)) : [row("wholesale", item.baseUnit, null)])],
  };
}

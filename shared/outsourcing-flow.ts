/**
 * WO-0.18.0 contractor-held stock. Quantities are scaled4 integers.
 * The ledger owns the balance; the latest non-cancelled issue owns the
 * denominator. Consumption, returns, adjustments and receipt reversals
 * never reset the denominator.
 */
export interface StockGaugeMovement {
  id: number;
  type: "issue" | "consumption" | "return" | "adjust" | "reversal";
  quantityDelta: number;
  reversalOfMovementId?: number | null;
}

export interface StockGaugeValue {
  balance: number;
  baseline: number;
  percentage: number | null;
  tone: "green" | "yellow" | "red";
}

export function stockGaugeFromMovements(movements: readonly StockGaugeMovement[]): StockGaugeValue {
  const reversed = new Set(movements.map(m => m.reversalOfMovementId).filter((id): id is number => id != null));
  let balance = 0;
  let baseline = 0;
  for (const movement of [...movements].sort((a,b) => a.id-b.id)) {
    // Reverse-issued rows are excluded from the historical baseline as if
    // their original issue had never happened; the reversal still cancels
    // the current balance in the authoritative ledger.
    if (movement.type === "issue" && reversed.has(movement.id)) continue;
    if (movement.type === "reversal" && movement.reversalOfMovementId != null) {
      const original = movements.find(x => x.id === movement.reversalOfMovementId);
      if (original?.type === "issue") continue;
    }
    balance += movement.quantityDelta;
    if (movement.type === "issue") baseline = balance;
  }
  const percentage = balance < 0 ? null : baseline > 0
    ? Math.min(100, Math.floor(balance * 100 / baseline + 0.5)) : null;
  return {
    balance, baseline, percentage,
    tone: balance < 0 || percentage === null || percentage < 20
      ? "red" : percentage < 50 ? "yellow" : "green",
  };
}

/** All operands use base-unit scaled4, and the returned capacity is whole units. */
export function productionCapacity(
  components: readonly { balance: number; requiredPerFinishedUnit: number }[],
): number | null {
  if (!components.length) return null;
  if (components.some(c => c.balance <= 0 || c.requiredPerFinishedUnit <= 0)) return 0;
  return Math.min(...components.map(c => Math.floor(c.balance / c.requiredPerFinishedUnit)));
}

/** quantity / 10,000 x unitPrice / 10,000 -> integer cents, HALF_UP. */
export function roundedLineMoney2(quantityScaled4: number, unitPriceScaled4: number): number {
  if (!Number.isSafeInteger(quantityScaled4) || !Number.isSafeInteger(unitPriceScaled4)
      || quantityScaled4 < 0 || unitPriceScaled4 < 0) throw new Error("INVALID_OUTSOURCING_MONEY");
  const product = BigInt(quantityScaled4) * BigInt(unitPriceScaled4);
  const cents = (product + 500_000n) / 1_000_000n;
  const value = Number(cents);
  if (!Number.isSafeInteger(value)) throw new Error("OUTSOURCING_MONEY_OVERFLOW");
  return value;
}

/** Statement total rounds a sum of cents to whole TWD. */
export function roundedStatementMoney2(linesAndAdjustmentsInCents: readonly number[]): number {
  const cents = linesAndAdjustmentsInCents.reduce((s, v) => s + v, 0);
  if (!Number.isSafeInteger(cents)) throw new Error("OUTSOURCING_MONEY_OVERFLOW");
  return Math.round(cents / 100) * 100;
}

export function outsourcingProgress(planned: number, delivered: number): number {
  if (planned <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor(delivered * 100 / planned + 0.5)));
}

export type OutsourcingLifecycleStatus = "pending_issue" | "in_production" | "delivered" | "closed";

export function outsourcingLifecycle(
  closedAt: string | null,
  effectiveIssueCount: number,
  products: readonly { planned: number; delivered: number }[],
): OutsourcingLifecycleStatus {
  if (closedAt) return "closed";
  if (effectiveIssueCount === 0) return "pending_issue";
  if (products.length && products.every(p => p.delivered >= p.planned)) return "delivered";
  return "in_production";
}

import type { ErpPurchaseOrder, ErpReceivableBill, ErpSalesOrder } from "./erp-item-query";

/**
 * 銷退單 ↔ 原銷貨單 presentation (user 2026-10-17: the Agent only passes ERP's data, CY Web links
 * it). A 銷退 line names its 原銷貨單 as 「單號-序號」 (「901A-20260101001-0002」); a 銷退單 without
 * one (it does not always have one) stands alone by its date.
 */
export function sourceOrderNo(lineRef: string): string | null {
  const value = lineRef.trim();
  if (!value.replace(/-/g, "")) return null;
  const parts = value.split("-");
  return parts.length >= 3 ? parts.slice(0, -1).join("-") : value;
}

/** A 銷貨單／銷退單 or 進貨單／退貨單: the shape the links need. */
interface LinkedOrder { kind: string; orderNo: string; date: string; lines: readonly { sourceOrder: string }[] }

export function sourcesOf(order: LinkedOrder): string[] {
  return [...new Set(order.lines.map(line => sourceOrderNo(line.sourceOrder)).filter((no): no is string => !!no))];
}

const newest = (a: LinkedOrder, b: LinkedOrder) =>
  b.date.localeCompare(a.date) || b.orderNo.localeCompare(a.orderNo);

/** One shown order; `under` is the order a return sits under, `related` the other side of each link. */
export interface LinkedEntry<T extends LinkedOrder> { order: T; under: string | null; related: { orderNo: string; inList: boolean }[] }
export type SalesEntry = LinkedEntry<ErpSalesOrder>;

/** Orders of `main` kind newest first, each followed by the returns that name it; unlinked returns by their own date. */
function arrangeLinked<T extends LinkedOrder>(orders: readonly T[], main: string, ret: string): LinkedEntry<T>[] {
  const sales = new Map(orders.filter(o => o.kind === main).map(o => [o.orderNo, o]));
  const returns = orders.filter(o => o.kind === ret);
  const under = new Map(returns.map(r => [r.orderNo,
    sourcesOf(r).map(no => sales.get(no)).filter((o): o is T => !!o).sort(newest)[0]?.orderNo ?? null]));
  const entries: LinkedEntry<T>[] = [];
  for (const order of [...orders].filter(o => o.kind === main || !under.get(o.orderNo)).sort(newest)) {
    if (order.kind === main) {
      const linked = returns.filter(r => sourcesOf(r).includes(order.orderNo)).sort(newest);
      entries.push({ order, under: null, related: linked.map(r => ({ orderNo: r.orderNo, inList: true })) });
      for (const r of linked.filter(r => under.get(r.orderNo) === order.orderNo))
        entries.push({ order: r, under: order.orderNo, related: sourcesOf(r).map(no => ({ orderNo: no, inList: sales.has(no) })) });
    } else entries.push({ order, under: null, related: sourcesOf(order).map(no => ({ orderNo: no, inList: sales.has(no) })) });
  }
  return entries;
}

/** 銷貨單 newest first, each followed by the 銷退單 that name it; unlinked 銷退單 by their own date. */
export const arrangeSales = (orders: readonly ErpSalesOrder[]) => arrangeLinked(orders, "銷貨", "銷退");
/** 進貨單 and 退貨單 the same way (user 2026-10-18: 有進貨就有退貨; a 退貨 line names its 原進貨單). */
export const arrangePurchases = (orders: readonly ErpPurchaseOrder[]) => arrangeLinked(orders, "進貨", "退貨");

/** ERP number text → number for CY Web's own sums (display only, never written back). */
export function erpNumber(text: string): number {
  const value = Number(text.replace(/,/g, "").trim());
  return Number.isFinite(value) ? value : 0;
}

/** ERP money for display (user 2026-10-17: with $): 「1420」→「$1,420」, 「-3250」→「-$3,250」; "" stays "". */
export function erpMoney(text: string | number): string {
  if (typeof text === "string" && !text.trim()) return "";
  const value = typeof text === "number" ? text : erpNumber(text);
  return (value < 0 ? "-$" : "$") + Math.abs(value).toLocaleString("zh-TW", { maximumFractionDigits: 3 });
}

/** 未收款 by customer, in ERP's order, with CY Web's per-customer 未收 subtotal. */
export function groupBills(bills: readonly ErpReceivableBill[]) {
  const groups = new Map<string, { customerCode: string; customerName: string; bills: ErpReceivableBill[]; unpaid: number }>();
  for (const bill of bills) {
    const group = groups.get(bill.customerCode) ?? { customerCode: bill.customerCode, customerName: bill.customerName, bills: [], unpaid: 0 };
    group.bills.push(bill);
    group.unpaid += erpNumber(bill.unpaid);
    groups.set(bill.customerCode, group);
  }
  return [...groups.values()];
}

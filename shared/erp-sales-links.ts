import type { ErpReceivableBill, ErpSalesOrder } from "./erp-item-query";

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

export function sourcesOf(order: ErpSalesOrder): string[] {
  return [...new Set(order.lines.map(line => sourceOrderNo(line.sourceOrder)).filter((no): no is string => !!no))];
}

const newest = (a: ErpSalesOrder, b: ErpSalesOrder) =>
  b.date.localeCompare(a.date) || b.orderNo.localeCompare(a.orderNo);

/** One shown order; `under` is the 銷貨單 a 銷退單 sits under, `related` the other side of each link. */
export interface SalesEntry { order: ErpSalesOrder; under: string | null; related: { orderNo: string; inList: boolean }[] }

/** 銷貨單 newest first, each followed by the 銷退單 that name it; unlinked 銷退單 by their own date. */
export function arrangeSales(orders: readonly ErpSalesOrder[]): SalesEntry[] {
  const sales = new Map(orders.filter(o => o.kind === "銷貨").map(o => [o.orderNo, o]));
  const returns = orders.filter(o => o.kind === "銷退");
  const under = new Map(returns.map(r => [r.orderNo,
    sourcesOf(r).map(no => sales.get(no)).filter((o): o is ErpSalesOrder => !!o).sort(newest)[0]?.orderNo ?? null]));
  const entries: SalesEntry[] = [];
  for (const order of [...orders].filter(o => o.kind === "銷貨" || !under.get(o.orderNo)).sort(newest)) {
    if (order.kind === "銷貨") {
      const linked = returns.filter(r => sourcesOf(r).includes(order.orderNo)).sort(newest);
      entries.push({ order, under: null, related: linked.map(r => ({ orderNo: r.orderNo, inList: true })) });
      for (const r of linked.filter(r => under.get(r.orderNo) === order.orderNo))
        entries.push({ order: r, under: order.orderNo, related: sourcesOf(r).map(no => ({ orderNo: no, inList: sales.has(no) })) });
    } else entries.push({ order, under: null, related: sourcesOf(order).map(no => ({ orderNo: no, inList: sales.has(no) })) });
  }
  return entries;
}

/** ERP number text → number for CY Web's own sums (display only, never written back). */
export function erpNumber(text: string): number {
  const value = Number(text.replace(/,/g, "").trim());
  return Number.isFinite(value) ? value : 0;
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

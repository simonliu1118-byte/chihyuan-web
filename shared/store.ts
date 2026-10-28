// 門市 顧客訂購 (user 2026-10-28): shared by the Worker and the page.

export const STORE_ORDER_STATUSES = ["ORDERED", "ARRIVED", "NOTIFIED", "PICKED_UP", "CANCELLED"] as const;
export type StoreOrderStatus = (typeof STORE_ORDER_STATUSES)[number];
export const STORE_ORDER_STATUS_LABELS: Record<StoreOrderStatus, string> = {
  ORDERED: "叫貨", ARRIVED: "到貨", NOTIFIED: "通知", PICKED_UP: "取貨", CANCELLED: "取消",
};

export const STORE_BLACKLIST_ACTIONS = ["REFUSE", "FULL_PAYMENT"] as const;
export type StoreBlacklistAction = (typeof STORE_BLACKLIST_ACTIONS)[number];
export const STORE_BLACKLIST_ACTION_LABELS: Record<StoreBlacklistAction, string> = {
  REFUSE: "拒絕訂購", FULL_PAYMENT: "收全款",
};

/** A notified order not picked up after this many days is flagged (user: 通知超過 7 天). */
export const STORE_PICKUP_OVERDUE_DAYS = 7;

export interface StoreOrderLine { id?: number; itemCode: string; itemName: string; quantity: number; unitPrice: number }
export interface StoreOrder {
  id: number; orderDate: string; customerName: string; phone: string; lineName: string; deposit: number; note: string;
  status: StoreOrderStatus; notifiedAt: string | null; cancelReason: string; version: number;
  createdAt: string; updatedAt: string; lines: StoreOrderLine[]; total: number;
}
export interface StoreBlacklistEntry { id: number; name: string; phone: string; reason: string; action: StoreBlacklistAction; createdAt: string; updatedAt: string }

/** Digits only: 0912-345-678, (07) 123 4567 and 0912345678 compare the same. */
export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

/** 金額 of one item: quantity × unit price, rounded to whole NT$. */
export function lineAmount(line: { quantity: number; unitPrice: number }): number {
  return Math.round(line.quantity * line.unitPrice);
}

export function orderTotal(lines: readonly { quantity: number; unitPrice: number }[]): number {
  return lines.reduce((sum, line) => sum + lineAmount(line), 0);
}

/** Whole days since a notification (Taipei calendar), or null when not notified. */
export function daysSinceNotified(notifiedAt: string | null, now: Date = new Date()): number | null {
  if (!notifiedAt) return null;
  const taipeiDay = (value: Date) => Math.floor((value.getTime() + 8 * 3600000) / 86400000);
  const from = new Date(notifiedAt);
  return Number.isFinite(from.getTime()) ? taipeiDay(now) - taipeiDay(from) : null;
}

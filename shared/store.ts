// 門市 顧客訂購 (user 2026-10-28): shared by the Worker and the page.
import {phoneDigits} from "./phone";

export const STORE_ORDER_STATUSES = ["REGISTERED", "ORDERED", "NOTIFIED", "PICKED_UP", "CANCELLED"] as const;
export type StoreOrderStatus = (typeof STORE_ORDER_STATUSES)[number];
export const STORE_ORDER_STATUS_LABELS: Record<StoreOrderStatus, string> = {
  REGISTERED: "訂購", ORDERED: "已叫貨", NOTIFIED: "待取貨", PICKED_UP: "已取貨", CANCELLED: "取消",
};
export const STORE_CALL_RESULTS={ORDERED:"已叫貨",OUT_OF_STOCK:"缺貨",DISCONTINUED:"絕版/停產",UNORDERABLE:"無法訂購"} as const;
export type StoreCallResult=keyof typeof STORE_CALL_RESULTS;
export type Honorific=""|"MR"|"MS";
export const displayCustomerName=(name:string,honorific:Honorific="")=>name+(honorific==="MR"?"'r":honorific==="MS"?"'s":"");
export const isSupplyUnavailable=(o:{callResult?:string})=>o.callResult==="OUT_OF_STOCK"||o.callResult==="DISCONTINUED"||o.callResult==="UNORDERABLE";
export const isOrderClosed=(o:{status:StoreOrderStatus;callResult?:string})=>o.status==="PICKED_UP"||o.status==="CANCELLED"||isSupplyUnavailable(o)&&o.status==="NOTIFIED";
export const STORE_MILESTONE_LABELS={ORDERED:"叫貨",NOTIFIED:"通知",PICKED_UP:"取貨"} as const;

export const STORE_BLACKLIST_ACTIONS = ["REFUSE", "FULL_PAYMENT", "OTHER"] as const;
export type StoreBlacklistAction = (typeof STORE_BLACKLIST_ACTIONS)[number];
export const STORE_BLACKLIST_ACTION_LABELS: Record<StoreBlacklistAction, string> = {
  REFUSE: "拒絕訂購", FULL_PAYMENT: "須全額預付", OTHER: "其他",
};

/** A notified order not picked up after this many days is flagged (user: 通知超過 7 天). */
export const STORE_PICKUP_OVERDUE_DAYS = 7;

export interface StoreOrderLine { id?: number; itemCode: string; itemName: string; quantity: number; unitPrice: number|null; metadataMode?:""|"BOOK"|"SPEC";publisher?:string;author?:string;specification?:string }
export interface StoreOrder {
  id: number; sequence:number; customerCode:string; closedAt:string|null;notificationAttempts:number;lastUnreachedDate:string|null;orderDate: string; customerName: string; honorific:Honorific; callResult:StoreCallResult|""; phone: string; mobile: string; lineName: string; deposit: number; note: string;
  status: StoreOrderStatus; dates: Record<StoreMilestone,string|null>; hasEverOrdered:boolean; legacy:boolean; notifiedAt: string | null; cancelReason: string; version: number;
  createdAt: string; updatedAt: string; lines: StoreOrderLine[]; total: number;
}
export interface StoreBlacklistEntry { id: number; active?:boolean; sequence?:number; joinedDate:string; actionDetail:string; name: string; honorific:Honorific; phone: string; mobile:string; lineName:string; version:number; eventCount:number; reason: string; action: StoreBlacklistAction; createdAt: string; updatedAt: string }

/** Digits only: 0912-345-678, (07) 123 4567 and 0912345678 compare the same. */
export function normalizePhone(value: string): string {
  return phoneDigits(value);
}

/** 金額 of one item: quantity × unit price, rounded to whole NT$. */
export function lineAmount(line: { quantity: number; unitPrice: number|null }): number {
  return Math.round(line.quantity * (line.unitPrice??0));
}

export function orderTotal(lines: readonly { quantity: number; unitPrice: number|null }[]): number {
  return lines.reduce((sum, line) => sum + lineAmount(line), 0);
}

/** Whole days since a notification (Taipei calendar), or null when not notified. */
export function daysSinceNotified(notifiedAt: string | null, now: Date = new Date()): number | null {
  if (!notifiedAt) return null;
  const taipeiDay = (value: Date) => Math.floor((value.getTime() + 8 * 3600000) / 86400000);
  const from = new Date(notifiedAt);
  return Number.isFinite(from.getTime()) ? taipeiDay(now) - taipeiDay(from) : null;
}

export const STORE_STEPS = ["REGISTERED","ORDERED","NOTIFIED","PICKED_UP"] as const;
export type StoreMilestone = "ORDERED"|"NOTIFIED"|"PICKED_UP";
export const STORE_MILESTONES:StoreMilestone[]=["ORDERED","NOTIFIED","PICKED_UP"];
export const STORE_CANCEL_REASONS=["顧客取消","通知未取","無法聯絡","其他"] as const;
export const pricesComplete=(lines:readonly {unitPrice:number|null}[])=>lines.every(line=>line.unitPrice!==null);
export const displayOrderItem=(line:Pick<StoreOrderLine,"itemName"|"metadataMode"|"publisher"|"author"|"specification">)=>[line.itemName,...(line.metadataMode==="SPEC"?[line.specification]:[line.publisher,line.author])].filter(Boolean).join("/");
export const canAmendClosure=(order:{status:StoreOrderStatus;callResult?:string;closedAt?:string|null},now=Date.now())=>isOrderClosed(order)&&!!order.closedAt&&Number.isFinite(Date.parse(order.closedAt))&&now<Date.parse(order.closedAt)+300000;
export const STORE_EDIT_REASONS=["顧客變更需求","品項／數量調整","價格／訂金更正","聯絡資料更正","備註補充","輸入錯誤","其他"] as const;
export interface StoreHistory {id:number;actorName:string;at:string;kind:string;before:Record<string,unknown>;after:Record<string,unknown>;reason:string}
export interface StoreHistoryPage {rows:StoreHistory[];nextCursor:number|null}
export function orderCancellationReason(order:Pick<StoreOrder,"orderDate"|"lines">,kind:string,detail:string){return (order.orderDate.replaceAll("-","/")+"訂購"+order.lines.map(line=>displayOrderItem(line)+"x"+line.quantity).join("、")+"，"+kind+(detail?"("+detail+")":"")).replaceAll(",","，")}
export interface StoreContactMatch {matches:StoreBlacklistEntry[];lineCandidates:StoreBlacklistEntry[]}

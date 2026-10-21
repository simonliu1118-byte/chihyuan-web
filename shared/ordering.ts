/**
 * 叫貨 (user 2026-10-21): the order-to-supplier workspace of 高雄門市. A 叫貨單 is one 來源 (台北,
 * 台中, 洲美 — transfers from the other stores, the same as 進貨 — a 廠商, 定期中國貨, 自訂中國貨, or a
 * tab the person added) and one cycle. Pure rules shared by the Worker, the page and the tests.
 */

/** GENERAL: 台北／台中／洲美 and every tab added with ＋; VENDOR: one 廠商 under the 廠商 tab. */
export type OrderingSourceKind = "GENERAL" | "VENDOR" | "CN_REGULAR" | "CN_CUSTOM";
/** 定期中國貨 is split in three blocks (user 2026-10-21). */
export type OrderingSection = "" | "SINGLE" | "BAG" | "OTHER";
export const CN_REGULAR_SECTIONS: readonly { key: Exclude<OrderingSection, "">; label: string }[] = [
  { key: "SINGLE", label: "針灸針－單支" }, { key: "BAG", label: "針灸針－氣包袋" }, { key: "OTHER", label: "其他" },
];
/** How a line's remainder was settled when it will not (all) come. */
export type OrderingClosedAs = "SHORTAGE" | "CANCELLED" | "OTHER";
export const CLOSED_AS_LABELS: Readonly<Record<OrderingClosedAs, string>> = { SHORTAGE: "缺貨", CANCELLED: "取消", OTHER: "其他" };

/** Stored state; 部分到貨／已結案 follow from the lines (see {@link orderStatus}). */
export type OrderingStoredStatus = "DRAFT" | "SENT" | "VOID";
export type OrderingStatus = "DRAFT" | "SENT" | "PARTIAL" | "CLOSED" | "VOID";
export const ORDERING_STATUS_LABELS: Readonly<Record<OrderingStatus, string>> = {
  DRAFT: "草稿", SENT: "已送出", PARTIAL: "部分到貨", CLOSED: "已結案", VOID: "作廢",
};
export type OrderingLineState = "OPEN" | "PARTIAL" | "RECEIVED" | "CLOSED" | "UNCOUNTED";
export const LINE_STATE_LABELS: Readonly<Record<OrderingLineState, string>> = {
  OPEN: "未到", PARTIAL: "部分到貨", RECEIVED: "已到貨", CLOSED: "已結掉", UNCOUNTED: "數量無法計算",
};

export interface OrderingSource {
  id: number; name: string; kind: OrderingSourceKind; conditions: string; sortOrder: number; isActive: boolean;
}
export interface OrderingDraftRef { id: number; sourceId: number; plannedSendDate: string | null; createdAt: string }
export interface OrderingLine {
  id: number; section: OrderingSection; sortOrder: number;
  itemCode: string; itemName: string; vendorItemCode: string; vendorItemName: string;
  /** True while 廠商品名 still copies 品名 (it was never typed). */
  vendorNameFollows: boolean;
  spec: string; quantityText: string; quantity: number | null; unit: string; note: string;
  closedAs: OrderingClosedAs | null; closedNote: string;
  received: number;
}
export interface OrderingReceipt { id: number; erpPurchaseNo: string; receivedDate: string; createdAt: string; createdBy: string; lines: { lineId: number; quantity: number }[] }
export interface OrderingRevision { revision: number; at: string; by: string; summary: string }
export interface OrderingOrder {
  id: number; sourceId: number; sourceName: string; sourceKind: OrderingSourceKind;
  status: OrderingStatus; plannedSendDate: string | null; sentAt: string | null; note: string;
  /** Optimistic lock, raised by every content write. */
  version: number;
  /** 版本 shown after 送出 (user 2026-10-21: plain numbers): 1 at 送出, +1 per change after. 0 while a draft. */
  revision: number;
  createdAt: string; updatedAt: string;
  lines: OrderingLine[]; receipts: OrderingReceipt[]; revisions: OrderingRevision[];
}
export interface OrderingListRow {
  id: number; sourceId: number; sourceName: string; sourceKind: OrderingSourceKind; status: OrderingStatus;
  plannedSendDate: string | null; sentAt: string | null; createdAt: string;
}
export interface OrderingPendingLine {
  orderId: number; lineId: number; sourceName: string; orderDate: string; itemCode: string; itemName: string;
  quantity: number; unit: string; received: number; remaining: number;
}

export const ORDERING_LIMITS = { name: 40, conditions: 500, itemCode: 40, text: 200, quantityText: 40, unit: 10, note: 300 } as const;
export const ERP_PURCHASE_PREFIX = "341A-";

/**
 * 「1」「1箱」「1.5 包」「1,000」 → number and 單位 (user 2026-10-21); null quantity when there is no
 * leading number (「各1」), the text then stays as written and the line counts no 到貨.
 */
export function parseQuantity(input: string): { text: string; quantity: number | null; unit: string } {
  const text = input.trim();
  const match = /^(\d{1,7}(?:,\d{3})*(?:\.\d{1,4})?)\s*([^\d\s][^\d]{0,9})?$/.exec(text);
  if (!match) return { text, quantity: null, unit: "" };
  const number = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(number)) return { text, quantity: null, unit: "" };
  return { text: String(number), quantity: number, unit: (match[2] ?? "").trim() };
}

/** 「20261019001」 → 「341A-20261019001」: 11 digits whose first 8 are a real date (user 2026-10-21: 341A is fixed). */
export function parseErpPurchaseNo(input: string): string | null {
  const digits = input.trim().replace(/^341A-?/i, "");
  if (!/^\d{11}$/.test(digits)) return null;
  const y = Number(digits.slice(0, 4)), m = Number(digits.slice(4, 6)), d = Number(digits.slice(6, 8));
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 2000 || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return ERP_PURCHASE_PREFIX + digits;
}

const dayNumber = (date: string) => Date.parse(date + "T00:00:00Z") / 86400000;

/**
 * The draft a tab opens (user 2026-10-21): the one whose 預計送出日期 is nearest today, the earlier on
 * a tie (today 10/21: 10/22 before 10/29, 10/19 before 10/29); drafts without a date come after every
 * dated one, the newest first.
 */
export function pickDraft<T extends Pick<OrderingDraftRef, "plannedSendDate" | "createdAt" | "id">>(drafts: readonly T[], today: string): T | null {
  if (!drafts.length) return null;
  const dated = drafts.filter((d) => d.plannedSendDate);
  if (dated.length) {
    return [...dated].sort((a, b) => {
      const da = Math.abs(dayNumber(a.plannedSendDate!) - dayNumber(today)), db = Math.abs(dayNumber(b.plannedSendDate!) - dayNumber(today));
      return da - db || a.plannedSendDate!.localeCompare(b.plannedSendDate!) || a.id - b.id;
    })[0];
  }
  return [...drafts].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)[0];
}

/** Drafts in the order the switcher lists them: the {@link pickDraft} order, then by date. */
export function sortDrafts<T extends Pick<OrderingDraftRef, "plannedSendDate" | "createdAt" | "id">>(drafts: readonly T[]): T[] {
  return [...drafts].sort((a, b) => !a.plannedSendDate !== !b.plannedSendDate ? (a.plannedSendDate ? -1 : 1)
    : a.plannedSendDate && b.plannedSendDate ? a.plannedSendDate.localeCompare(b.plannedSendDate) || a.id - b.id
    : b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
}

export function lineState(line: Pick<OrderingLine, "quantity" | "received" | "closedAs">): OrderingLineState {
  if (line.closedAs) return "CLOSED";
  if (line.quantity === null) return "UNCOUNTED";
  if (line.received >= line.quantity) return "RECEIVED";
  return line.received > 0 ? "PARTIAL" : "OPEN";
}

/** A line still waiting for goods: counted, not all received and not settled. */
export const lineIsOpen = (line: Pick<OrderingLine, "quantity" | "received" | "closedAs">) =>
  ["OPEN", "PARTIAL"].includes(lineState(line));

/**
 * 已送出 → 部分到貨 → 已結案 from the lines (user 2026-10-21): 已結案 when every line is received or
 * settled (a line whose 數量 is not a number counts once something came or it was settled).
 */
export function orderStatus(stored: OrderingStoredStatus, lines: readonly Pick<OrderingLine, "quantity" | "received" | "closedAs">[]): OrderingStatus {
  if (stored !== "SENT") return stored;
  if (!lines.length) return "SENT";
  const done = lines.every((line) => {
    const state = lineState(line);
    return state === "RECEIVED" || state === "CLOSED" || (state === "UNCOUNTED" && line.received > 0);
  });
  if (done) return "CLOSED";
  return lines.some((line) => line.received > 0 || line.closedAs) ? "PARTIAL" : "SENT";
}

/** The key 廠商品號／廠商品名 are remembered under for a 來源: the 品號, else the 品名. */
export function vendorItemKey(itemCode: string, itemName: string): { type: "CODE" | "NAME"; key: string } | null {
  const code = itemCode.trim(), name = itemName.trim();
  if (code) return { type: "CODE", key: code };
  return name ? { type: "NAME", key: name } : null;
}

/** 「台中20261021」: the export file name (user's own naming), from the 預計送出日期, else 送出日, else today. */
export function exportFileName(sourceName: string, date: string): string {
  return `${sourceName}${date.replace(/-/g, "")}.xlsx`;
}

/** UTC API timestamps must render as Asia/Taipei, including cross-midnight order dates. */
export function orderingTaipeiDateTime(value:string|null|undefined):{date:string;time:string}|null {
 if(!value)return null;
 if(!value.includes("T"))return {date:value.slice(0,10).replaceAll("-","/"),time:""};
 const d=new Date(value);
 if(!Number.isFinite(d.getTime()))return {date:value.slice(0,10).replaceAll("-","/"),time:""};
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(d);
 const get=(kind:string)=>parts.find(p=>p.type===kind)?.value??"";
 return {date:get("year")+"/"+get("month")+"/"+get("day"),time:get("hour")+":"+get("minute")};
}

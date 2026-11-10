/**
 * 自訂中國貨採購 (user 2026-11-10): the purchaser fills, on a sent 自訂中國貨 叫貨單, the real 採購數量
 * and 人民幣單價 of each item, splits items over card charges, and adds 運費, 營業稅 and 退貨. One table
 * shows all of it; this module holds the pure rules (stage, layout and the whole-table recalculation)
 * shared by the Worker, the page and the tests.
 *
 * Money: 人民幣 in 分 (0.01 元) as integers; 台幣 in whole dollars as integers.
 */

export type CnChargeKind = "CARD" | "SHIPPING" | "TAX";
export interface CnPiece { id: number; lineId: number; sortOrder: number; quantity: number; rmbPrice: number | null; chargeId: number | null }
export interface CnCharge { id: number; kind: CnChargeKind; sortOrder: number; chargedOn: string | null; amount: number | null; fee: number | null; note: string }
export interface CnReturn { lineId: number; quantity: number; rmbAmount: number | null; ntdAmount: number | null; fee: number | null; reason: string }
export interface CnPurchase { orderedAt: string | null; orderedBy: string; pieces: CnPiece[]; charges: CnCharge[]; returns: CnReturn[] }
/** What the calculation needs of a 叫貨 line. */
export interface CnLineRef { id: number; discontinued: boolean }

export type CnStage = "ORDERING" | "ORDERED" | "SHIPPED" | "ARRIVED" | "CLOSED";
export const CN_STAGE_LABELS: Readonly<Record<CnStage, string>> = {
  ORDERING: "訂購中", ORDERED: "已訂購", SHIPPED: "已發貨", ARRIVED: "已到台灣", CLOSED: "結案",
};
export const CN_LIMITS = { pieces: 1000, charges: 200, shipping: 20, reason: 200, quantity: 1_000_000, rmbFen: 100_000_000, ntd: 100_000_000 } as const;

/** 訂購中 → 已訂購 (完成訂購) → 已發貨 (first 運費) → 已到台灣 (營業稅) → 結案 (every line received or settled). */
export function cnStage(purchase: Pick<CnPurchase, "orderedAt" | "charges">, orderClosed: boolean): CnStage {
  if (orderClosed) return "CLOSED";
  if (!purchase.orderedAt) return "ORDERING";
  if (purchase.charges.some((c) => c.kind === "TAX")) return "ARRIVED";
  if (purchase.charges.some((c) => c.kind === "SHIPPING")) return "SHIPPED";
  return "ORDERED";
}

/** 「35」「35.5」「¥6.80」 → 分; null when empty; NaN when not a money amount. */
export function parseRmbFen(input: string): number | null {
  const text = input.trim().replace(/^[¥￥]/, "").replace(/,/g, "");
  if (!text) return null;
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(text)) return Number.NaN;
  return Math.round(Number(text) * 100);
}
/** 「1,234」 → 1234; null when empty; NaN when not a whole number. */
export function parseNtd(input: string): number | null {
  const text = input.trim().replace(/^NT\$\s*/i, "").replace(/,/g, "");
  if (!text) return null;
  return /^\d{1,9}$/.test(text) ? Number(text) : Number.NaN;
}
export const fenText = (fen: number | null | undefined) => fen === null || fen === undefined ? "" : (fen / 100).toFixed(2);
export const rmbText = (fen: number | null | undefined) => fen === null || fen === undefined ? "—" : "¥" + (fen / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const ntdText = (value: number | null | undefined, digits = 0) => value === null || value === undefined || !Number.isFinite(value) ? "—"
  : value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const qtyText = (value: number) => String(Math.round(value * 10000) / 10000);

export interface CnPieceResult {
  /** 人民幣小計 in 分 (null without a price). */
  rmbSubtotal: number | null;
  /** This piece's part of its card (金額＋手續費), by 人民幣小計; null until the card has an amount. */
  ntdShare: number | null;
  ntdUnit: number | null;
  rate: number | null;
  /** 含稅含運 in whole 台幣 (all pieces add up to the 總計), its 單價 over the goods kept, and 總匯率. */
  landedTotal: number | null;
  landedUnit: number | null;
  totalRate: number | null;
  /** The part of the line's 退貨 that falls on this piece (by quantity). */
  returnedQuantity: number;
}
export interface CnTotals {
  rmb: number; cardAmount: number; cardFee: number; shipping: number; tax: number; refund: number; refundFee: number;
  /** 含稅含運總計 = 刷卡 ＋ 運費 ＋ 營業稅 － 刷退 ＋ 刷退手續費 (null while a used card has no amount). */
  grand: number | null;
  missingCardAmount: number; missingFee: number; unchargedPieces: number;
}

/**
 * The whole-table recalculation (user 2026-11-10: a 退貨 changes every item's share, so everything is
 * recomputed together). Each piece's 台幣淨額 = its card share － its part of the line's 刷退 ＋ its part
 * of the 刷退手續費; 運費 and 營業稅 are spread over the pieces by 淨額 and borne only by the goods kept,
 * so 含稅含運單價 = allocated ÷ (數量 － 退貨數量). Discontinued lines take no part.
 */
export function computeCnPurchase(lines: readonly CnLineRef[], purchase: Pick<CnPurchase, "pieces" | "charges" | "returns">): { pieces: Map<number, CnPieceResult>; totals: CnTotals } {
  const active = new Set(lines.filter((l) => !l.discontinued).map((l) => l.id));
  const pieces = purchase.pieces.filter((p) => active.has(p.lineId));
  const cards = new Map(purchase.charges.filter((c) => c.kind === "CARD").map((c) => [c.id, c]));
  const lineQty = new Map<number, number>();
  for (const p of pieces) lineQty.set(p.lineId, (lineQty.get(p.lineId) ?? 0) + p.quantity);
  const returns = new Map(purchase.returns.filter((r) => active.has(r.lineId)).map((r) => [r.lineId, r]));
  const subtotal = (p: CnPiece) => p.rmbPrice === null ? null : Math.round(p.rmbPrice * p.quantity);
  const cardRmb = new Map<number, number>();
  for (const p of pieces) if (p.chargeId !== null && cards.has(p.chargeId)) cardRmb.set(p.chargeId, (cardRmb.get(p.chargeId) ?? 0) + (subtotal(p) ?? 0));

  const results = new Map<number, CnPieceResult>();
  // Pieces not yet charged wait outside the allocation; a charged piece whose card has no 台幣 yet
  // leaves the whole allocation open (待補).
  let complete = pieces.some((p) => p.chargeId !== null && cards.has(p.chargeId));
  // Whole 台幣 per piece (user 2026-11-11: 對帳 must match): each card's 金額＋手續費 is split by 人民幣小計
  // so the pieces add up to the card exactly; each line's 刷退 and 刷退手續費 likewise by quantity.
  const share = new Map<number, number>();
  for (const card of cards.values()) {
    const mine = pieces.filter((p) => p.chargeId === card.id && subtotal(p) !== null);
    if (!mine.length) continue;
    if (card.amount === null) { complete = false; continue; }
    allocate(card.amount + (card.fee ?? 0), mine.map((p) => subtotal(p)!)).forEach((v, i) => share.set(mine[i].id, v));
  }
  if (pieces.some((p) => p.chargeId !== null && cards.has(p.chargeId) && subtotal(p) === null)) complete = false;
  const refundOf = new Map<number, number>(), returned = new Map<number, number>();
  for (const r of returns.values()) {
    const mine = pieces.filter((p) => p.lineId === r.lineId), q = mine.map((p) => p.quantity);
    allocate((r.ntdAmount ?? 0) - (r.fee ?? 0), q).forEach((v, i) => refundOf.set(mine[i].id, v));
    const total = lineQty.get(r.lineId) || 1;
    mine.forEach((p) => returned.set(p.id, r.quantity * p.quantity / total));
  }
  for (const p of pieces) {
    const s = share.get(p.id) ?? null, ntdUnit = s === null ? null : s / p.quantity;
    results.set(p.id, { rmbSubtotal: subtotal(p), ntdShare: s, ntdUnit, rate: ntdUnit !== null && p.rmbPrice ? ntdUnit / (p.rmbPrice / 100) : null,
      landedTotal: null, landedUnit: null, totalRate: null, returnedQuantity: returned.get(p.id) ?? 0 });
  }
  const sum = (kind: CnChargeKind, field: "amount" | "fee") => purchase.charges.filter((c) => c.kind === kind).reduce((s, c) => s + (c[field] ?? 0), 0);
  const shipping = sum("SHIPPING", "amount") + sum("SHIPPING", "fee"), tax = sum("TAX", "amount") + sum("TAX", "fee");
  const refund = [...returns.values()].reduce((s, r) => s + (r.ntdAmount ?? 0), 0), refundFee = [...returns.values()].reduce((s, r) => s + (r.fee ?? 0), 0);
  const usedCards = [...cards.values()].filter((c) => pieces.some((p) => p.chargeId === c.id));
  const cardAmount = usedCards.reduce((s, c) => s + (c.amount ?? 0), 0), cardFee = usedCards.reduce((s, c) => s + (c.fee ?? 0), 0);
  const grand = complete ? cardAmount + cardFee + shipping + tax - refund + refundFee : null;
  if (complete && grand !== null) {
    // 含稅含運 in whole 台幣 per piece, by 淨額 (share － 刷退 ＋ 刷退手續費): the pieces add up to the 總計.
    const charged = pieces.filter((p) => share.has(p.id));
    const net = charged.map((p) => Math.max(0, share.get(p.id)! - (refundOf.get(p.id) ?? 0)));
    if (net.some((v) => v > 0)) allocate(grand, net).forEach((total, i) => {
      const p = charged[i], r = results.get(p.id)!, kept = p.quantity - r.returnedQuantity;
      r.landedTotal = total;
      if (kept > 0) { r.landedUnit = total / kept; r.totalRate = p.rmbPrice ? r.landedUnit / (p.rmbPrice / 100) : null; }
    });
  }
  return {
    pieces: results,
    totals: {
      rmb: pieces.reduce((s, p) => s + (subtotal(p) ?? 0), 0), cardAmount, cardFee, shipping, tax, refund, refundFee, grand,
      missingCardAmount: usedCards.filter((c) => c.amount === null).length,
      missingFee: usedCards.filter((c) => c.fee === null).length,
      unchargedPieces: pieces.filter((p) => p.chargeId === null || !cards.has(p.chargeId)).length,
    },
  };
}

/**
 * Whole numbers in proportion to <paramref name="weights"/> that add up to <paramref name="total"/>
 * exactly (largest remainder; ties go to the earlier row), so no rounding leaves 對帳 a dollar off.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (!weights.length) return [];
  if (sum <= 0) { const out = weights.map(() => 0); out[0] = total; return out; }
  const sign = total < 0 ? -1 : 1, abs = Math.abs(total);
  const raw = weights.map((w) => abs * Math.max(0, w) / sum), out = raw.map(Math.floor);
  let left = abs - out.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k][1]]++;
  return out.map((v) => v * sign);
}

export interface CnRow { piece: CnPiece; seq: number; firstOfLine: boolean; card: CnCharge | null; cardNo: number; cardSpan: number; unchargedSpan: number; discontinued: boolean }
/**
 * The table's rows: each card's pieces together (so its four columns merge), then the pieces not yet
 * charged, then discontinued lines. 項次 is the line's place in the 叫貨單.
 */
export function cnTableRows(lines: readonly CnLineRef[], purchase: Pick<CnPurchase, "pieces" | "charges">): CnRow[] {
  const seq = new Map(lines.map((l, i) => [l.id, i + 1])), dead = new Set(lines.filter((l) => l.discontinued).map((l) => l.id));
  const cards = purchase.charges.filter((c) => c.kind === "CARD").sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const order = (a: CnPiece, b: CnPiece) => a.sortOrder - b.sortOrder || (seq.get(a.lineId) ?? 0) - (seq.get(b.lineId) ?? 0) || a.id - b.id;
  const live = purchase.pieces.filter((p) => seq.has(p.lineId) && !dead.has(p.lineId));
  const rows: CnRow[] = [], seen = new Set<number>();
  const push = (piece: CnPiece, card: CnCharge | null, cardNo: number, discontinued = false) => {
    rows.push({ piece, seq: seq.get(piece.lineId) ?? 0, firstOfLine: !seen.has(piece.lineId), card, cardNo, cardSpan: 0, unchargedSpan: 0, discontinued });
    seen.add(piece.lineId);
  };
  cards.forEach((card, i) => {
    const mine = live.filter((p) => p.chargeId === card.id).sort(order);
    mine.forEach((p) => push(p, card, i + 1));
    if (mine.length) rows[rows.length - mine.length].cardSpan = mine.length;
  });
  const loose = live.filter((p) => p.chargeId === null || !cards.some((c) => c.id === p.chargeId))
    .sort((a, b) => (seq.get(a.lineId) ?? 0) - (seq.get(b.lineId) ?? 0) || a.sortOrder - b.sortOrder || a.id - b.id);
  loose.forEach((p) => push(p, null, 0));
  if (loose.length) rows[rows.length - loose.length].unchargedSpan = loose.length;
  for (const line of lines.filter((l) => l.discontinued)) {
    const mine = purchase.pieces.filter((p) => p.lineId === line.id).sort(order);
    (mine.length ? mine : [{ id: -line.id, lineId: line.id, sortOrder: 0, quantity: 0, rmbPrice: null, chargeId: null }]).forEach((p) => push(p, null, 0, true));
  }
  return rows;
}

export interface CnLineSummary {
  quantity: number; returnedQuantity: number;
  /** 人民幣小計 (分) and the weighted 人民幣單價 (分), over every piece of the line. */
  rmbSubtotal: number | null; rmbUnit: number | null;
  /** Card shares added up; null while a piece has none. */
  ntdShare: number | null; ntdUnit: number | null; rate: number | null;
  /** 含稅含運小計 (whole 台幣, the pieces' own), its 單價 over the goods kept, and 總匯率. */
  landedTotal: number | null; landedUnit: number | null; totalRate: number | null;
}
/**
 * 品項合計 (user 2026-11-11): the pieces of one item folded back into one row. A at ¥100×20 and
 * ¥120×10 reads 30 at (100×20＋120×10)÷30; 台幣 and 含稅含運 are weighted the same way.
 */
export function summarizeCnLines(lines: readonly CnLineRef[], pieces: readonly CnPiece[], result: Map<number, CnPieceResult>): Map<number, CnLineSummary> {
  const out = new Map<number, CnLineSummary>();
  for (const line of lines) {
    const mine = pieces.filter((p) => p.lineId === line.id);
    const quantity = mine.reduce((s, p) => s + p.quantity, 0);
    const rs = mine.map((p) => result.get(p.id));
    const all = <K extends keyof CnPieceResult>(k: K) => rs.length > 0 && rs.every((r) => r && r[k] !== null);
    const rmbSubtotal = all("rmbSubtotal") ? rs.reduce((s, r) => s + (r!.rmbSubtotal as number), 0) : null;
    const rmbUnit = rmbSubtotal !== null && quantity ? rmbSubtotal / quantity : null;
    const ntdShare = all("ntdShare") ? rs.reduce((s, r) => s + (r!.ntdShare as number), 0) : null;
    const ntdUnit = ntdShare !== null && quantity ? ntdShare / quantity : null;
    const returnedQuantity = rs.reduce((s, r) => s + (r?.returnedQuantity ?? 0), 0), kept = quantity - returnedQuantity;
    const landedTotal = all("landedTotal") ? rs.reduce((s, r) => s + (r!.landedTotal as number), 0) : null;
    const landed = landedTotal !== null && kept > 0 ? landedTotal / kept : null;
    out.set(line.id, {
      quantity, returnedQuantity, rmbSubtotal, rmbUnit, ntdShare, ntdUnit,
      rate: ntdUnit !== null && rmbUnit ? ntdUnit / (rmbUnit / 100) : null,
      landedTotal, landedUnit: landed, totalRate: landed !== null && rmbUnit ? landed / (rmbUnit / 100) : null,
    });
  }
  return out;
}

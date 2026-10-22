import { CN_REGULAR_SECTIONS, type OrderingLine, type OrderingSourceKind } from "./ordering";
import { columnName, type XlsxCell, type XlsxSheet } from "./xlsx-writer";

/**
 * The 叫貨單 as the person sends it (user 2026-10-21), laid out like their own sheets: 「叫貨單 【來源】」
 * with 「M/D叫貨」 on the right, the column titles, one row per line, and a last 「備註」 row.
 * 台北／台中／洲美、廠商 and added tabs send only the 廠商's own 品號／品名 (the receiver's codes), not ours.
 */
export interface ExportOrder {
  sourceName: string; sourceKind: OrderingSourceKind; date: string; note: string;
  lines: readonly Pick<OrderingLine, "section" | "itemCode" | "itemName" | "vendorItemCode" | "vendorItemName" | "spec" | "quantityText" | "quantity" | "unit" | "note">[];
}

const quantityCell = (line: ExportOrder["lines"][number]): XlsxCell => line.quantity ?? line.quantityText;
const dayLabel = (date: string) => `${Number(date.slice(5, 7))}/${date.slice(8, 10)}叫貨`;

export function orderSheet(order: ExportOrder, sheetName = order.sourceName): XlsxSheet {
  const rows: XlsxCell[][] = [];
  const merges: string[] = [];
  let titles: string[];
  let widths: number[];
  if (order.sourceKind === "CN_REGULAR") {
    // 單支／氣包袋 are named in the 產品編號 column across their rows; 其他 keeps each line's 品號 there.
    titles = ["項次", "產品編號", "品名", "數量", "單位", "備註"];
    widths = [6, 14, 40, 10, 8, 24];
    let n = 0;
    for (const section of CN_REGULAR_SECTIONS) {
      const lines = order.lines.filter((line) => line.section === section.key);
      if (!lines.length) continue;
      const first = rows.length + 1;
      for (const line of lines) {
        n++;
        const label = section.key === "OTHER" ? line.itemCode : line === lines[0] ? section.label.replace("針灸針－", "") : null;
        rows.push([n, label, line.itemName, quantityCell(line), line.unit, line.note]);
      }
      if (section.key !== "OTHER" && lines.length > 1) merges.push(`B${first + 1}:B${first + lines.length}`);
    }
  } else if (order.sourceKind === "CN_CUSTOM") {
    const withCode = true;
    titles = [...["項次"], ...(withCode ? ["品號"] : []), "品名", "規格", "數量", "單位", "備註"];
    widths = [6, ...(withCode ? [14] : []), 40, 30, 10, 8, 24];
    order.lines.forEach((line, i) => rows.push([i + 1, ...(withCode ? [line.itemCode] : []), line.itemName, line.spec, quantityCell(line), line.unit, line.note]));
  } else {
    titles = ["項次", "廠商品號", "廠商品名", "數量", "單位", "備註"];
    widths = [6, 16, 40, 10, 8, 24];
    order.lines.forEach((line, i) => rows.push([i + 1, line.vendorItemCode, line.vendorItemName || line.itemName, quantityCell(line), line.unit, line.note]));
  }
  const last = titles.length - 1;
  const title: XlsxCell[] = titles.map(() => null);
  title[0] = `叫貨單 【${order.sourceName}】`;
  title[last] = dayLabel(order.date);
  merges.unshift(`A1:${columnName(last - 1)}1`);
  const noteRow: XlsxCell[] = titles.map(() => null);
  noteRow[0] = "備註";
  noteRow[1] = order.note || null;
  const noteAt = rows.length + 3;
  merges.push(`B${noteAt}:${columnName(last)}${noteAt}`);
  return {
    name: sheetName, widths, merges,
    rows: [title, titles, ...rows, noteRow],
    boldRows: [0], plainRows: [0],
  };
}

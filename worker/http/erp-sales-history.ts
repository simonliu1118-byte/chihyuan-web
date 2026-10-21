import type { ErpRestockItem } from "../../shared/erp-item-query";

/** Rows per json_each statement, so one bound value stays well under D1's limits. */
const CHUNK = 1500;
const chunks = <T,>(rows: readonly T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
};
/** Every day of the range, YYYY-MM-DD. */
function rangeDays(from: string, to: string): string[] {
  const days: string[] = [];
  for (let t = Date.parse(from + "T00:00:00Z"); t <= Date.parse(to + "T00:00:00Z"); t += 86400000)
    days.push(new Date(t).toISOString().slice(0, 10));
  return days;
}

/**
 * 銷貨資料保存 (user 2026-10-21): the statements that keep erp_sales_daily／erp_sales_items／
 * erp_sales_days in step with a finished RESTOCK query, run in the same D1 batch as its completion
 * and only when that completion was written (the job row with this status and completed_at).
 * Unchanged rows are not written. A truncated result neither deletes rows nor marks days.
 */
export function salesHistoryStatements(db: D1Database, job: { id: string; from: string; to: string },
  restock: readonly ErpRestockItem[], truncated: boolean, status: string, completedAt: string): D1PreparedStatement[] {
  const written = "EXISTS (SELECT 1 FROM erp_item_queries WHERE id=?3 AND status=?4 AND completed_at=?2)";
  const days = restock.flatMap(item => item.days.map(day => ({
    c: item.itemCode, d: day.date, s: Number(day.sold), r: Number(day.returned), sg: Number(day.soldGift), rg: Number(day.returnedGift),
  })));
  const statements: D1PreparedStatement[] = [];
  for (const part of chunks(days))
    statements.push(db.prepare(
      `INSERT INTO erp_sales_daily(item_code,sale_date,sold,returned,sold_gift,returned_gift,updated_at,query_id)
       SELECT json_extract(value,'$.c'),json_extract(value,'$.d'),json_extract(value,'$.s'),json_extract(value,'$.r'),
              json_extract(value,'$.sg'),json_extract(value,'$.rg'),?2,?3
         FROM json_each(?1) WHERE ${written}
       ON CONFLICT(item_code,sale_date) DO UPDATE SET sold=excluded.sold,returned=excluded.returned,
              sold_gift=excluded.sold_gift,returned_gift=excluded.returned_gift,updated_at=excluded.updated_at,query_id=excluded.query_id
        WHERE erp_sales_daily.sold<>excluded.sold OR erp_sales_daily.returned<>excluded.returned
           OR erp_sales_daily.sold_gift<>excluded.sold_gift OR erp_sales_daily.returned_gift<>excluded.returned_gift`
    ).bind(JSON.stringify(part), completedAt, job.id, status));
  const items = restock.map(item => ({ c: item.itemCode, n: item.itemName, u: item.unit, k: item.stock == null ? null : Number(item.stock) }));
  for (const part of chunks(items))
    statements.push(db.prepare(
      `INSERT INTO erp_sales_items(item_code,item_name,unit,stock,stock_at,updated_at)
       SELECT json_extract(value,'$.c'),json_extract(value,'$.n'),json_extract(value,'$.u'),json_extract(value,'$.k'),
              CASE WHEN json_extract(value,'$.k') IS NULL THEN NULL ELSE ?2 END,?2
         FROM json_each(?1) WHERE ${written}
       ON CONFLICT(item_code) DO UPDATE SET item_name=excluded.item_name,unit=excluded.unit,
              stock=COALESCE(excluded.stock,erp_sales_items.stock),
              stock_at=CASE WHEN excluded.stock IS NOT NULL AND excluded.stock IS NOT erp_sales_items.stock THEN excluded.stock_at ELSE erp_sales_items.stock_at END,
              updated_at=excluded.updated_at
        WHERE erp_sales_items.item_name<>excluded.item_name OR erp_sales_items.unit<>excluded.unit
           OR (excluded.stock IS NOT NULL AND excluded.stock IS NOT erp_sales_items.stock)`
    ).bind(JSON.stringify(part), completedAt, job.id, status));
  if (truncated) return statements;
  // A (品號, 日期) inside the range that ERP no longer lists (an order deleted or changed) goes.
  statements.push(db.prepare(
    `DELETE FROM erp_sales_daily
      WHERE sale_date BETWEEN ?5 AND ?6 AND ${written}
        AND NOT EXISTS (SELECT 1 FROM json_each(?1) WHERE value = erp_sales_daily.item_code || char(9) || erp_sales_daily.sale_date)`
  ).bind(JSON.stringify(days.map(d => d.c + "\t" + d.d)), completedAt, job.id, status, job.from, job.to));
  statements.push(db.prepare(
    `INSERT INTO erp_sales_days(sale_date,synced_at,query_id)
     SELECT value,?2,?3 FROM json_each(?1) WHERE ${written}
     ON CONFLICT(sale_date) DO UPDATE SET synced_at=excluded.synced_at,query_id=excluded.query_id
      WHERE date(erp_sales_days.synced_at,'+8 hours') <= erp_sales_days.sale_date`
  ).bind(JSON.stringify(rangeDays(job.from, job.to)), completedAt, job.id, status));
  return statements;
}

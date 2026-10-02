/** Canonical inserts use the existing and retired high-water marks atomically.
 * Table names are trusted source constants, never HTTP input. Deletes retain
 * their high-water mark through database triggers, including direct SQL deletes.
 */
export type StableEntityTable = "customers" | "items" | "defect_reports" | "sales_work_orders" | "outsourcing_orders" | "contractors" | "work_logs" | "customer_visits" | "customer_frequent_items";
export function nextEntityIdSql(table: StableEntityTable): string {
  const high = `MAX(COALESCE((SELECT MAX(id) FROM ${table}),0),COALESCE((SELECT last_id FROM entity_id_high_watermarks WHERE table_name='${table}'),0))`;
  return `(SELECT CASE WHEN ${high} >= 9007199254740991 THEN json('') ELSE ${high}+1 END)`;
}

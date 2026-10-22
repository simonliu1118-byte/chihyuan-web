/**
 * Record counts per workflow status for a list's current filters (everything except the
 * status filter and paging), so the filter bar can show how many records wait in each status.
 */
export async function countByStatus<S extends string>(
  db: D1Database,
  from: string,
  statusColumn: string,
  where: readonly string[],
  params: readonly (string | number | null)[],
): Promise<Partial<Record<S, number>>> {
  const result = await db.prepare(`SELECT ${statusColumn} AS status, COUNT(*) AS total ${from}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""} GROUP BY ${statusColumn}`)
    .bind(...params).all<{ status: S; total: number }>();
  const counts: Partial<Record<S, number>> = {};
  for (const row of result.results ?? []) counts[row.status] = row.total;
  return counts;
}

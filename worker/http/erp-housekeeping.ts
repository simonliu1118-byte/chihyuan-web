import { AuditService } from "../audit/audit-service";
import { erpHousekeepingPhases } from "../../shared/erp-housekeeping";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const AGENT_TIMEOUT_MESSAGE = "查詢程式逾時，請重新查詢";
type ChangedJob = { id: string; owner_member_id: number; item_no: string };

/** Scheduled-only maintenance. No HTTP request can invoke this function. */
export async function runErpHousekeeping(db: D1Database, scheduledTime: number): Promise<void> {
  const phases = erpHousekeepingPhases(scheduledTime);
  const now = new Date(scheduledTime);
  const nowIso = now.toISOString();
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString();
  // One indexed probe, no UPDATE statements while neither queue nor Agent has active work.
  const active = await db.prepare(`SELECT
    EXISTS(SELECT 1 FROM erp_item_queries WHERE status='QUEUED') AS queued,
    EXISTS(SELECT 1 FROM erp_item_queries WHERE status='RUNNING') AS running`
  ).first<{ queued: number; running: number }>();

  let expired: ChangedJob[] = [];
  let timedOut: ChangedJob[] = [];
  if (active?.queued) {
    const rows = await db.prepare(
      `UPDATE erp_item_queries SET status='EXPIRED', completed_at=?1
       WHERE status='QUEUED' AND (expires_at<=?1 OR (COALESCE(not_before,created_at)<=?2
         AND NOT EXISTS(SELECT 1 FROM erp_item_queries WHERE status='RUNNING')
         AND NOT EXISTS(SELECT 1 FROM erp_item_agent_status WHERE id=1 AND last_seen_at>?3)))
       RETURNING id,owner_member_id,item_no`
    ).bind(nowIso, ago(120), ago(60)).all<ChangedJob>();
    expired = rows.results ?? [];
  }
  if (active?.running) {
    const rows = await db.prepare(
      `UPDATE erp_item_queries SET status='FAILED', completed_at=?1,
       error_code='AGENT_TIMEOUT', error_message=?2
       WHERE status='RUNNING' AND (
         (query_type='RESTOCK' AND started_at<=?6)
         OR (query_type IN ('SALES','PURCHASES','RECEIVABLE','ORDER') AND started_at<=?5)
         OR (query_type NOT IN ('SALES','PURCHASES','RECEIVABLE','ORDER','RESTOCK') AND include_history=0 AND started_at<=?3)
         OR (query_type NOT IN ('SALES','PURCHASES','RECEIVABLE','ORDER','RESTOCK') AND include_history=1 AND started_at<=?4))
       RETURNING id,owner_member_id,item_no`
    ).bind(nowIso, AGENT_TIMEOUT_MESSAGE, ago(180), ago(300), ago(600), ago(1800)).all<ChangedJob>();
    timedOut = rows.results ?? [];
  }
  const audit = new AuditService(db);
  for (const job of expired) {
    await audit.record({ entityType: "erp_item_query", entityKey: job.id,
      action: "erp_item_query.expired", actorEmployeeId: job.owner_member_id,
      statusFrom: "QUEUED", statusTo: "EXPIRED", metadata: { itemNo: job.item_no } });
  }
  for (const job of timedOut) {
    await audit.record({ entityType: "erp_item_query", entityKey: job.id,
      action: "erp_item_query.failed", actorEmployeeId: job.owner_member_id,
      statusFrom: "RUNNING", statusTo: "FAILED",
      metadata: { itemNo: job.item_no, outcome: "AGENT_TIMEOUT" } });
  }
  if (phases.purge) {
    await db.prepare(
      "UPDATE erp_item_queries SET fields_json=NULL,warehouses_json=NULL,batches_json=NULL,history_json=NULL,items_json=NULL,result_json=NULL WHERE completed_at<?1 AND (fields_json IS NOT NULL OR warehouses_json IS NOT NULL OR batches_json IS NOT NULL OR history_json IS NOT NULL OR items_json IS NOT NULL OR result_json IS NOT NULL)"
    ).bind(ago(300)).run();
  }
  if (phases.retention) {
    await db.prepare("DELETE FROM erp_item_queries WHERE completed_at<?1")
      .bind(new Date(now.getTime() - THIRTY_DAYS).toISOString()).run();
  }
}

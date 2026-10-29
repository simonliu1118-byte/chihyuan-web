import { AuditService } from "../audit/audit-service";
import { erpHousekeepingPhases } from "../../shared/erp-housekeeping";

// Finished queries are kept 7 days (user 2026-10-29): the cross-device recent list needs 24 hours
// and the 排程佇列 estimate has its own running averages.
const RETENTION_DAYS = 7 * 24 * 60 * 60 * 1000;
const AGENT_TIMEOUT_MESSAGE = "查詢程式逾時，請重新查詢";
type ChangedJob = { id: string; owner_member_id: number; item_no: string; query_type: string; target_code: string | null };

/** A failed/expired stocktake write cannot leave the sheet stuck in WRITING. */
async function failExpiredStocktakeWrite(db:D1Database,sheet:string,id:string,now:string,reason:string){
  const out=await db.prepare(`UPDATE stocktake_sheets
    SET status='WRITE_FAILED',write_result_json=?,version=version+1,updated_at=?
    WHERE sheet_no=? AND status='WRITING' AND write_query_id=?`)
    .bind(JSON.stringify({results:[],mismatches:[],error:reason}),now,sheet,id).run();
  if(out.meta.changes)await new AuditService(db).record({
    entityType:"stocktake",entityKey:sheet,action:"stocktake.write_failed",actorEmployeeId:null,
    statusFrom:"WRITING",statusTo:"WRITE_FAILED",metadata:{jobId:id,reason:"AGENT_TIMEOUT"}
  });
}


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
       RETURNING id,owner_member_id,item_no,query_type,target_code`
    ).bind(nowIso, ago(120), ago(60)).all<ChangedJob>();
    expired = rows.results ?? [];
  }
  if (active?.running) {
    const rows = await db.prepare(
    `UPDATE erp_item_queries SET status='FAILED', completed_at=?1, error_code='AGENT_TIMEOUT', error_message=?2
      WHERE status='RUNNING' AND (
        (query_type='STOCKTAKE_WRITE' AND started_at<=?7)
        OR (query_type IN ('RESTOCK','STOCKTAKE_SYNC') AND started_at<=?6)
        OR (query_type IN ('SALES','PURCHASES','RECEIVABLE','ORDER') AND started_at<=?5)
        OR (query_type NOT IN ('SALES','PURCHASES','RECEIVABLE','ORDER','RESTOCK','STOCKTAKE_SYNC','STOCKTAKE_WRITE') AND include_history=0 AND started_at<=?3)
        OR (query_type NOT IN ('SALES','PURCHASES','RECEIVABLE','ORDER','RESTOCK','STOCKTAKE_SYNC','STOCKTAKE_WRITE') AND include_history=1 AND started_at<=?4))
      RETURNING id,owner_member_id,item_no,query_type,target_code`
  ).bind(nowIso, AGENT_TIMEOUT_MESSAGE, ago(180), ago(300), ago(600), ago(1800), ago(3600)).all<ChangedJob>();
    timedOut = rows.results ?? [];
  }
  const audit = new AuditService(db);
  for (const job of expired) {
    await audit.record({ entityType: "erp_item_query", entityKey: job.id,
      action: "erp_item_query.expired", actorEmployeeId: job.owner_member_id,
      statusFrom: "QUEUED", statusTo: "EXPIRED", metadata: { itemNo: job.item_no } });
    if (job.query_type === "STOCKTAKE_WRITE" && job.target_code)
      await failExpiredStocktakeWrite(db, job.target_code, job.id, nowIso, "等待 ERP 處理逾時");
  }
  for (const job of timedOut) {
    await audit.record({ entityType: "erp_item_query", entityKey: job.id,
      action: "erp_item_query.failed", actorEmployeeId: job.owner_member_id,
      statusFrom: "RUNNING", statusTo: "FAILED",
      metadata: { itemNo: job.item_no, outcome: "AGENT_TIMEOUT" } });
    if (job.query_type === "STOCKTAKE_WRITE" && job.target_code)
      await failExpiredStocktakeWrite(db, job.target_code, job.id, nowIso, "ERP 寫回逾時，請管理員核對後重新寫回");
  }
  if (phases.purge) {
    // Every 5 minutes reads only the last hour's completions; the daily pass (lower bound '')
    // sweeps anything a missed run left, so reads do not grow with the retention.
    await db.prepare(
      "UPDATE erp_item_queries SET fields_json=NULL,warehouses_json=NULL,batches_json=NULL,history_json=NULL,items_json=NULL,result_json=NULL WHERE completed_at<?1 AND completed_at>=?2 AND (fields_json IS NOT NULL OR warehouses_json IS NOT NULL OR batches_json IS NOT NULL OR history_json IS NOT NULL OR items_json IS NOT NULL OR result_json IS NOT NULL)"
    ).bind(ago(300), phases.retention ? "" : ago(3600)).run();
  }
  if (phases.retention) {
    await db.prepare("DELETE FROM erp_item_queries WHERE completed_at<?1")
      .bind(new Date(now.getTime() - RETENTION_DAYS).toISOString()).run();
  }
}

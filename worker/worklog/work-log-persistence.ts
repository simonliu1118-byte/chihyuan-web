import { AuditService } from "../audit/audit-service";
import type { WorkLogStatusCode } from "../../shared/work-log";
import type {
  NormalizedReviewWorkLogRequest,
  NormalizedUpdateWorkLogRequest,
  NormalizedWorkLogProfile,
  NormalizedWorkLogTransitionRequest,
} from "./work-log-validation";
import type { WorkLogRecordState } from "./work-log-repository";

export interface WorkLogMutationContext {
  actorMemberId: number;
  now: string;
  requestId?: string | null;
  allowReview?: boolean;
  allowAdministrativeDelete?: boolean;
  allowCrossEmployeeRead?: boolean;
}

function assertContext(context: WorkLogMutationContext): void {
  if (!Number.isInteger(context.actorMemberId) || context.actorMemberId <= 0) throw new Error("WORK_LOG_MUTATION_ACTOR_REQUIRED");
  if (!context.now || Number.isNaN(Date.parse(context.now))) throw new Error("WORK_LOG_MUTATION_TIMESTAMP_REQUIRED");
}

function appendEntryStatements(
  db: D1Database,
  statements: D1PreparedStatement[],
  workLogIdSql: string,
  workLogIdValues: readonly number[],
  input: NormalizedWorkLogProfile,
  revisionGate?: { workLogId: number; expectedRevision: number },
): void {
  input.entries.forEach((entry) => {
    const gate = revisionGate
      ? " AND EXISTS(SELECT 1 FROM work_logs WHERE id=? AND revision=? AND status_code='created')"
      : "";
    statements.push(db.prepare(`
      INSERT INTO work_log_entries(
        work_log_id,entry_type_code,content,platform_id,review_remark,review_score,sort_order
      ) SELECT ${workLogIdSql},?${workLogIdValues.length + 1},?${workLogIdValues.length + 2},?${workLogIdValues.length + 3},NULL,NULL,?${workLogIdValues.length + 4}
      ${revisionGate ? `WHERE 1=1${gate}` : ""}
    `).bind(
      ...workLogIdValues,
      entry.entryTypeCode,
      entry.content,
      entry.platformId,
      entry.sortOrder,
      ...(revisionGate ? [revisionGate.workLogId, revisionGate.expectedRevision] : []),
    ));
    entry.categories.forEach((category) => {
      const categoryGate = revisionGate
        ? " WHERE EXISTS(SELECT 1 FROM work_logs WHERE id=? AND revision=? AND status_code='created')"
        : "";
      statements.push(db.prepare(`
        INSERT INTO work_log_entry_categories(
          work_log_entry_id,work_log_category_id,quantity,sort_order
        ) SELECT (SELECT MAX(id) FROM work_log_entries),?1,?2,?3${categoryGate}
      `).bind(
        category.workLogCategoryId,
        category.quantityScaled4,
        category.sortOrder,
        ...(revisionGate ? [revisionGate.workLogId, revisionGate.expectedRevision] : []),
      ));
    });
  });
}

export class WorkLogPersistence {
  private readonly audit: AuditService;

  constructor(private readonly db: D1Database) {
    this.audit = new AuditService(db);
  }

  async create(
    workLogRef: string,
    input: NormalizedWorkLogProfile,
    context: WorkLogMutationContext,
  ): Promise<number> {
    assertContext(context);
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`
        INSERT INTO work_logs(
          work_log_ref,log_date,date_from,date_to,work_days,type_code,employee_id,status_code,
          reviewed_by,reviewed_at,review_remark,final_score,average_daily_score,
          created_at,created_by,updated_at,updated_by,revision
        ) VALUES(?1,?2,?3,?4,?5,?6,?7,'created',NULL,NULL,NULL,NULL,NULL,?8,?7,?8,?7,1)
      `).bind(
        workLogRef,input.logDate,input.dateFrom,input.dateTo,input.workDaysScaled4,input.typeCode,
        context.actorMemberId,context.now,
      ),
    ];
    appendEntryStatements(this.db, statements, "(SELECT MAX(id) FROM work_logs)", [], input);
    statements.push(this.db.prepare("SELECT MAX(id) AS work_log_id FROM work_logs"));
    const results = await this.db.batch(statements);
    const id = Number((results[results.length - 1]?.results?.[0] as { work_log_id?: number } | undefined)?.work_log_id ?? 0);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("WORK_LOG_CREATE_ID_UNAVAILABLE");
    return id;
  }

  async updateCreated(
    workLogId: number,
    input: NormalizedUpdateWorkLogRequest,
    context: WorkLogMutationContext,
  ): Promise<boolean> {
    assertContext(context);
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`
        DELETE FROM work_log_entries
         WHERE work_log_id=?1
           AND EXISTS(SELECT 1 FROM work_logs WHERE id=?1 AND revision=?2 AND status_code='created')
      `).bind(workLogId,input.expectedRevision),
    ];
    appendEntryStatements(this.db, statements, "?1", [workLogId], input, { workLogId, expectedRevision: input.expectedRevision });
    statements.push(this.db.prepare(`
      UPDATE work_logs
         SET log_date=?1,date_from=?2,date_to=?3,work_days=?4,type_code=?5,
             updated_at=?6,updated_by=?7,revision=revision+1
       WHERE id=?8 AND revision=?9 AND status_code='created'
    `).bind(
      input.logDate,input.dateFrom,input.dateTo,input.workDaysScaled4,input.typeCode,
      context.now,context.actorMemberId,workLogId,input.expectedRevision,
    ));
    const results = await this.db.batch(statements);
    return Number(results[results.length - 1]?.meta?.changes ?? 0) === 1;
  }

  async transition(
    state: WorkLogRecordState,
    toStatus: WorkLogStatusCode,
    action: string,
    input: NormalizedWorkLogTransitionRequest,
    context: WorkLogMutationContext,
  ): Promise<boolean> {
    assertContext(context);
    const nextRevision = state.revision + 1;
    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE work_logs
           SET status_code=?1,updated_at=?2,updated_by=?3,revision=revision+1
         WHERE id=?4 AND revision=?5 AND status_code=?6
      `).bind(toStatus,context.now,context.actorMemberId,state.id,state.revision,state.statusCode),
      this.audit.prepareRecord({
        entityType:"work_log",entityKey:String(state.id),action,
        actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,
        statusFrom:state.statusCode,statusTo:toStatus,
        metadata:input.reason ? { reason:input.reason } : null,
      },{
        sql:"EXISTS(SELECT 1 FROM work_logs WHERE id=? AND revision=? AND status_code=?)",
        values:[state.id,nextRevision,toStatus],
      }),
    ]);
    return Number(results[0]?.meta?.changes ?? 0) === 1;
  }

  async review(
    state: WorkLogRecordState,
    input: NormalizedReviewWorkLogRequest,
    finalScoreScaled4: number,
    averageDailyScoreScaled4: number,
    context: WorkLogMutationContext,
  ): Promise<boolean> {
    assertContext(context);
    const nextRevision = state.revision + 1;
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`
        UPDATE work_log_entries
           SET review_remark=NULL,review_score=NULL
         WHERE work_log_id=?1
           AND EXISTS(SELECT 1 FROM work_logs WHERE id=?1 AND revision=?2 AND status_code='pending_review')
      `).bind(state.id,state.revision),
    ];
    input.entries.forEach((entry) => {
      statements.push(this.db.prepare(`
        UPDATE work_log_entries
           SET review_remark=?1,review_score=?2
         WHERE id=?3 AND work_log_id=?4
           AND EXISTS(SELECT 1 FROM work_logs WHERE id=?4 AND revision=?5 AND status_code='pending_review')
      `).bind(entry.reviewRemark,entry.reviewScoreScaled4,entry.entryId,state.id,state.revision));
    });
    statements.push(this.db.prepare(`
      UPDATE work_logs
         SET work_days=?1,status_code='reviewed',reviewed_by=?2,reviewed_at=?3,
             review_remark=?4,final_score=?5,average_daily_score=?6,
             updated_at=?3,updated_by=?2,revision=revision+1
       WHERE id=?7 AND revision=?8 AND status_code='pending_review'
    `).bind(
      input.workDaysScaled4,context.actorMemberId,context.now,input.reviewRemark,
      finalScoreScaled4,averageDailyScoreScaled4,state.id,state.revision,
    ));
    statements.push(this.audit.prepareRecord({
      entityType:"work_log",entityKey:String(state.id),action:"work_log.reviewed",
      actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,
      statusFrom:"pending_review",statusTo:"reviewed",
      before: state.workDaysScaled4 === input.workDaysScaled4 ? null : { workDaysScaled4:state.workDaysScaled4 },
      after: { workDaysScaled4:input.workDaysScaled4, finalScoreScaled4, averageDailyScoreScaled4 },
    },{
      sql:"EXISTS(SELECT 1 FROM work_logs WHERE id=? AND revision=? AND status_code='reviewed')",
      values:[state.id,nextRevision],
    }));
    const results = await this.db.batch(statements);
    const masterIndex = 1 + input.entries.length;
    return Number(results[masterIndex]?.meta?.changes ?? 0) === 1;
  }

  async cancelReview(
    state: WorkLogRecordState,
    input: NormalizedWorkLogTransitionRequest,
    context: WorkLogMutationContext,
  ): Promise<boolean> {
    assertContext(context);
    const nextRevision = state.revision + 1;
    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE work_log_entries
           SET review_remark=NULL,review_score=NULL
         WHERE work_log_id=?1
           AND EXISTS(SELECT 1 FROM work_logs WHERE id=?1 AND revision=?2 AND status_code='reviewed')
      `).bind(state.id,state.revision),
      this.db.prepare(`
        UPDATE work_logs
           SET status_code='pending_review',reviewed_by=NULL,reviewed_at=NULL,review_remark=NULL,
               final_score=NULL,average_daily_score=NULL,updated_at=?1,updated_by=?2,revision=revision+1
         WHERE id=?3 AND revision=?4 AND status_code='reviewed'
      `).bind(context.now,context.actorMemberId,state.id,state.revision),
      this.audit.prepareRecord({
        entityType:"work_log",entityKey:String(state.id),action:"work_log.review.cancelled",
        actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,
        statusFrom:"reviewed",statusTo:"pending_review",
        metadata:input.reason ? { reason:input.reason } : null,
      },{
        sql:"EXISTS(SELECT 1 FROM work_logs WHERE id=? AND revision=? AND status_code='pending_review')",
        values:[state.id,nextRevision],
      }),
    ]);
    return Number(results[1]?.meta?.changes ?? 0) === 1;
  }

  async deleteCreated(state: WorkLogRecordState, context: WorkLogMutationContext): Promise<boolean> {
    assertContext(context);
    const results = await this.db.batch([
      this.audit.prepareRecord({
        entityType:"work_log",entityKey:String(state.id),action:"work_log.deleted",
        actorEmployeeId:context.actorMemberId,occurredAt:context.now,requestId:context.requestId,
        before:{workLogRef:state.workLogRef,statusCode:state.statusCode,revision:state.revision},
      },{
        sql:"EXISTS(SELECT 1 FROM work_logs WHERE id=? AND revision=? AND status_code='created')",
        values:[state.id,state.revision],
      }),
      this.db.prepare("DELETE FROM work_logs WHERE id=?1 AND revision=?2 AND status_code='created'").bind(state.id,state.revision),
    ]);
    return Number(results[1]?.meta?.changes ?? 0) === 1;
  }
}

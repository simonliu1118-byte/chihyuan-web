import type { DefectStatusCode } from "../../shared/defect";
import { AuditService } from "../audit/audit-service";
import type { DefectReferenceSnapshot, DefectRecordState } from "./defect-repository";
import type {
  NormalizedCreateDefectRequest,
  NormalizedDefectTransitionRequest,
  NormalizedUpdateDefectRequest,
} from "./defect-validation";

export interface DefectMutationContext {
  actorMemberId: number;
  now: string;
  requestId?: string | null;
  allowAdministrativeDelete?: boolean;
}

function assertContext(context: DefectMutationContext): void {
  if (!Number.isInteger(context.actorMemberId) || context.actorMemberId <= 0) {
    throw new Error("DEFECT_MUTATION_ACTOR_REQUIRED");
  }
  if (!context.now || Number.isNaN(Date.parse(context.now))) {
    throw new Error("DEFECT_MUTATION_TIMESTAMP_REQUIRED");
  }
}

function assertResolvedReferences(refs: DefectReferenceSnapshot): asserts refs is DefectReferenceSnapshot & {
  customer: NonNullable<DefectReferenceSnapshot["customer"]>;
  item: NonNullable<DefectReferenceSnapshot["item"]>;
  owner: NonNullable<DefectReferenceSnapshot["owner"]>;
} {
  if (!refs.customer || !refs.item || !refs.owner) {
    throw new Error("DEFECT_REFERENCES_NOT_RESOLVED");
  }
}

export class DefectPersistence {
  private readonly audit: AuditService;

  constructor(private readonly db: D1Database) {
    this.audit = new AuditService(db);
  }

  async create(
    input: NormalizedCreateDefectRequest,
    refs: DefectReferenceSnapshot,
    context: DefectMutationContext,
  ): Promise<number> {
    assertContext(context);
    assertResolvedReferences(refs);
    const statements = [
      this.db.prepare(`
        INSERT INTO defect_reports (
          reported_date,
          customer_id, customer_no_snapshot, customer_name_snapshot,
          item_id, item_no_snapshot, item_name_snapshot, spec_snapshot,
          owner_employee_id, defect_description, handling, status_code,
          created_at, created_by, updated_at, updated_by, revision
        ) VALUES (
          ?1,
          ?2, ?3, ?4,
          ?5, ?6, ?7, ?8,
          ?9, ?10, ?11, 'created',
          ?12, ?13, ?12, ?13, 1
        )
      `).bind(
        input.reportedDate,
        refs.customer.id,
        refs.customer.customerNo,
        refs.customer.customerName,
        refs.item.id,
        refs.item.itemNo,
        refs.item.itemName,
        refs.item.spec,
        refs.owner.id,
        input.defectDescription,
        input.handling,
        context.now,
        context.actorMemberId,
      ),
      this.db.prepare("SELECT MAX(id) AS defect_id FROM defect_reports"),
    ];
    const results = await this.db.batch(statements);
    const row = results[1]?.results?.[0] as { defect_id?: number } | undefined;
    const defectId = Number(row?.defect_id ?? 0);
    if (!Number.isSafeInteger(defectId) || defectId <= 0) {
      throw new Error("DEFECT_CREATE_ID_UNAVAILABLE");
    }
    return defectId;
  }

  async update(
    defectId: number,
    input: NormalizedUpdateDefectRequest,
    refs: DefectReferenceSnapshot,
    context: DefectMutationContext,
  ): Promise<boolean> {
    assertContext(context);
    assertResolvedReferences(refs);
    const result = await this.db.prepare(`
      UPDATE defect_reports
         SET reported_date = ?1,
             customer_id = ?2,
             customer_no_snapshot = ?3,
             customer_name_snapshot = ?4,
             item_id = ?5,
             item_no_snapshot = ?6,
             item_name_snapshot = ?7,
             spec_snapshot = ?8,
             owner_employee_id = ?9,
             defect_description = ?10,
             handling = ?11,
             updated_at = ?12,
             updated_by = ?13,
             revision = revision + 1
       WHERE id = ?14
         AND revision = ?15
         AND invalidated_at IS NULL
         AND status_code IN ('created', 'processing')
    `).bind(
      input.reportedDate,
      refs.customer.id,
      refs.customer.customerNo,
      refs.customer.customerName,
      refs.item.id,
      refs.item.itemNo,
      refs.item.itemName,
      refs.item.spec,
      refs.owner.id,
      input.defectDescription,
      input.handling,
      context.now,
      context.actorMemberId,
      defectId,
      input.expectedRevision,
    ).run();
    return Number(result.meta.changes ?? 0) === 1;
  }

  async transition(
    defectId: number,
    fromStatus: DefectStatusCode,
    toStatus: DefectStatusCode,
    input: NormalizedDefectTransitionRequest,
    context: DefectMutationContext,
  ): Promise<boolean> {
    assertContext(context);
    const nextRevision = input.expectedRevision + 1;
    const action = toStatus === "processing" && fromStatus === "resolved"
      ? "defect.reopened"
      : toStatus === "processing"
        ? "defect.processing.started"
        : "defect.resolved";

    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE defect_reports
           SET status_code = ?1,
               updated_at = ?2,
               updated_by = ?3,
               revision = revision + 1
         WHERE id = ?4
           AND revision = ?5
           AND status_code = ?6
           AND invalidated_at IS NULL
      `).bind(
        toStatus,
        context.now,
        context.actorMemberId,
        defectId,
        input.expectedRevision,
        fromStatus,
      ),
      this.audit.prepareRecord({
        entityType: "defect",
        entityKey: String(defectId),
        action,
        actorEmployeeId: context.actorMemberId,
        occurredAt: context.now,
        requestId: context.requestId,
        statusFrom: fromStatus,
        statusTo: toStatus,
        metadata: input.reason ? { reason: input.reason } : null,
      }, {
        sql: "EXISTS (SELECT 1 FROM defect_reports WHERE id = ? AND revision = ? AND status_code = ? AND invalidated_at IS NULL)",
        values: [defectId, nextRevision, toStatus],
      }),
    ]);
    return Number(results[0]?.meta?.changes ?? 0) === 1;
  }

  async invalidate(
    state: DefectRecordState,
    input: NormalizedDefectTransitionRequest,
    context: DefectMutationContext,
  ): Promise<boolean> {
    assertContext(context);
    const nextRevision = input.expectedRevision + 1;
    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE defect_reports
           SET invalidated_at = ?1,
               invalidated_by = ?2,
               updated_at = ?1,
               updated_by = ?2,
               revision = revision + 1
         WHERE id = ?3
           AND revision = ?4
           AND invalidated_at IS NULL
           AND status_code IN ('processing', 'resolved')
      `).bind(
        context.now,
        context.actorMemberId,
        state.id,
        input.expectedRevision,
      ),
      this.audit.prepareRecord({
        entityType: "defect",
        entityKey: String(state.id),
        action: "defect.invalidated",
        actorEmployeeId: context.actorMemberId,
        occurredAt: context.now,
        requestId: context.requestId,
        metadata: {
          underlyingStatus: state.statusCode,
          ...(input.reason ? { reason: input.reason } : {}),
        },
      }, {
        sql: "EXISTS (SELECT 1 FROM defect_reports WHERE id = ? AND revision = ? AND invalidated_at = ?)",
        values: [state.id, nextRevision, context.now],
      }),
    ]);
    return Number(results[0]?.meta?.changes ?? 0) === 1;
  }

  async deleteCreated(
    state: DefectRecordState,
    context: DefectMutationContext,
  ): Promise<boolean> {
    assertContext(context);
    const results = await this.db.batch([
      this.audit.prepareRecord({
        entityType: "defect",
        entityKey: String(state.id),
        action: "defect.deleted",
        actorEmployeeId: context.actorMemberId,
        occurredAt: context.now,
        requestId: context.requestId,
        before: { statusCode: state.statusCode, revision: state.revision },
      }, {
        sql: "EXISTS (SELECT 1 FROM defect_reports WHERE id = ? AND revision = ? AND status_code = 'created' AND invalidated_at IS NULL)",
        values: [state.id, state.revision],
      }),
      this.db.prepare(`
        DELETE FROM defect_reports
         WHERE id = ?1
           AND revision = ?2
           AND status_code = 'created'
           AND invalidated_at IS NULL
      `).bind(state.id, state.revision),
    ]);
    return Number(results[1]?.meta?.changes ?? 0) === 1;
  }
}

import type {
  WorkLogConfiguration,
  WorkLogDetail,
  WorkLogListResult,
  WorkLogSearchQuery,
  WorkLogStatisticsQuery,
  WorkLogStatisticsResult,
} from "../../shared/work-log";
import { FieldValidationError } from "../validation/fields";
import { WorkLogPersistence, type WorkLogMutationContext } from "./work-log-persistence";
import { WorkLogRepository, type WorkLogRecordState } from "./work-log-repository";
import {
  normalizeCreateWorkLogRequest,
  normalizeReviewWorkLogRequest,
  normalizeUpdateWorkLogRequest,
  normalizeWorkLogSearchQuery,
  normalizeWorkLogTransitionRequest,
  type NormalizedWorkLogProfile,
} from "./work-log-validation";

export interface WorkLogReferenceProvider {
  nextReference(logDate: string): Promise<string>;
}

export interface WorkLogAccessContext {
  actorMemberId: number;
  allowCrossEmployeeRead?: boolean;
}

export type WorkLogServiceErrorCode =
  | "WORK_LOG_NOT_FOUND"
  | "WORK_LOG_REVISION_CONFLICT"
  | "WORK_LOG_ACCESS_DENIED"
  | "WORK_LOG_EDIT_NOT_ALLOWED"
  | "WORK_LOG_TRANSITION_NOT_ALLOWED"
  | "WORK_LOG_REVIEW_NOT_ALLOWED"
  | "WORK_LOG_DELETE_NOT_ALLOWED"
  | "WORK_LOG_REFERENCE_INVALID"
  | "WORK_LOG_REVIEW_ENTRY_INVALID";

export class WorkLogServiceError extends Error {
  constructor(
    readonly code: WorkLogServiceErrorCode,
    readonly status: 403 | 404 | 409 | 422,
    message: string,
  ) {
    super(message);
    this.name = "WorkLogServiceError";
  }
}

function normalizeId(value: number, field = "workLogId"): number {
  if (!Number.isInteger(value) || value <= 0) throw new FieldValidationError({ [field]: "必須是正整數" });
  return value;
}

function roundedScaled4Ratio(numeratorScaled4: number, denominatorScaled4: number): number {
  if (!Number.isSafeInteger(numeratorScaled4) || !Number.isSafeInteger(denominatorScaled4) || denominatorScaled4 <= 0) {
    throw new Error("WORK_LOG_SCORE_OPERAND_INVALID");
  }
  const numerator = BigInt(numeratorScaled4) * 10_000n;
  const denominator = BigInt(denominatorScaled4);
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  let quotient = abs / denominator;
  const remainder = abs % denominator;
  if (remainder * 2n >= denominator) quotient += 1n;
  const signed = negative ? -quotient : quotient;
  const result = Number(signed);
  if (!Number.isSafeInteger(result)) throw new Error("WORK_LOG_SCORE_RESULT_OUT_OF_RANGE");
  return result;
}

export class WorkLogService {
  private readonly repository: WorkLogRepository;
  private readonly persistence: WorkLogPersistence;

  constructor(db: D1Database, private readonly referenceProvider: WorkLogReferenceProvider) {
    this.repository = new WorkLogRepository(db);
    this.persistence = new WorkLogPersistence(db);
  }

  async search(query: WorkLogSearchQuery, access: WorkLogAccessContext): Promise<WorkLogListResult> {
    this.assertAccessActor(access);
    const normalized = normalizeWorkLogSearchQuery(query);
    return this.repository.search(access.allowCrossEmployeeRead === true
      ? normalized
      : { ...normalized, employeeId: access.actorMemberId });
  }

  async getDetail(workLogId: number, access: WorkLogAccessContext): Promise<WorkLogDetail> {
    this.assertAccessActor(access);
    const id = normalizeId(workLogId);
    const detail = await this.repository.getDetail(id);
    if (!detail) throw new WorkLogServiceError("WORK_LOG_NOT_FOUND", 404, "WorkLog not found");
    if (detail.employeeId !== access.actorMemberId && access.allowCrossEmployeeRead !== true) {
      throw new WorkLogServiceError("WORK_LOG_ACCESS_DENIED", 403, "WorkLog access is not allowed");
    }
    return detail;
  }

  async configuration(includeInactive: boolean, allowAdministration: boolean): Promise<WorkLogConfiguration> {
    return this.repository.getConfiguration(includeInactive && allowAdministration);
  }

  async statistics(query: WorkLogStatisticsQuery, access: WorkLogAccessContext): Promise<WorkLogStatisticsResult> {
    this.assertAccessActor(access);
    return this.repository.statistics(access.allowCrossEmployeeRead === true
      ? query
      : { ...query, employeeId: access.actorMemberId });
  }

  async create(raw: unknown, context: WorkLogMutationContext): Promise<WorkLogDetail> {
    const input = normalizeCreateWorkLogRequest(raw);
    await this.validateProfileReferences(input);
    const workLogRef = (await this.referenceProvider.nextReference(input.logDate)).trim();
    if (!workLogRef || workLogRef.length > 120) {
      throw new WorkLogServiceError("WORK_LOG_REFERENCE_INVALID", 422, "Generated WorkLog reference is invalid");
    }
    const id = await this.persistence.create(workLogRef, input, context);
    return this.getDetail(id, { actorMemberId: context.actorMemberId, allowCrossEmployeeRead: true });
  }

  async updateCreated(workLogId: number, raw: unknown, context: WorkLogMutationContext): Promise<WorkLogDetail> {
    const id = normalizeId(workLogId);
    const input = normalizeUpdateWorkLogRequest(raw);
    const state = await this.requireState(id);
    this.assertRevision(state, input.expectedRevision);
    this.assertOwner(state, context.actorMemberId);
    if (state.statusCode !== "created") {
      throw new WorkLogServiceError("WORK_LOG_EDIT_NOT_ALLOWED", 409, "Only created WorkLog may be ordinarily edited");
    }
    await this.validateProfileReferences(input);
    const changed = await this.persistence.updateCreated(id, input, context);
    if (!changed) this.throwRevisionConflict();
    return this.getDetail(id, { actorMemberId: context.actorMemberId, allowCrossEmployeeRead: true });
  }

  async submitForReview(workLogId: number, raw: unknown, context: WorkLogMutationContext): Promise<WorkLogDetail> {
    return this.ownerTransition(workLogId, raw, context, "created", "pending_review", "work_log.review.submitted");
  }

  async withdrawReview(workLogId: number, raw: unknown, context: WorkLogMutationContext): Promise<WorkLogDetail> {
    return this.ownerTransition(workLogId, raw, context, "pending_review", "created", "work_log.review.withdrawn");
  }

  async review(workLogId: number, raw: unknown, context: WorkLogMutationContext): Promise<WorkLogDetail> {
    if (context.allowReview !== true) {
      throw new WorkLogServiceError("WORK_LOG_REVIEW_NOT_ALLOWED", 403, "WorkLog review permission is required");
    }
    const id = normalizeId(workLogId);
    const input = normalizeReviewWorkLogRequest(raw);
    const state = await this.requireState(id);
    this.assertRevision(state, input.expectedRevision);
    if (state.statusCode !== "pending_review") {
      throw new WorkLogServiceError("WORK_LOG_TRANSITION_NOT_ALLOWED", 422, "WorkLog must be pending review");
    }
    const validEntryIds = await this.repository.entryIds(id);
    if (input.entries.some((entry) => !validEntryIds.has(entry.entryId))) {
      throw new WorkLogServiceError("WORK_LOG_REVIEW_ENTRY_INVALID", 422, "Review entry does not belong to this WorkLog");
    }
    let finalScoreScaled4 = 0;
    input.entries.forEach((entry) => {
      if (entry.reviewScoreScaled4 != null) {
        finalScoreScaled4 += entry.reviewScoreScaled4;
        if (!Number.isSafeInteger(finalScoreScaled4)) throw new Error("WORK_LOG_SCORE_RESULT_OUT_OF_RANGE");
      }
    });
    const averageDailyScoreScaled4 = roundedScaled4Ratio(finalScoreScaled4, input.workDaysScaled4);
    const changed = await this.persistence.review(
      state,input,finalScoreScaled4,averageDailyScoreScaled4,context,
    );
    if (!changed) this.throwRevisionConflict();
    return this.getDetail(id, { actorMemberId: context.actorMemberId, allowCrossEmployeeRead: true });
  }

  async cancelReview(workLogId: number, raw: unknown, context: WorkLogMutationContext): Promise<WorkLogDetail> {
    if (context.allowReview !== true) {
      throw new WorkLogServiceError("WORK_LOG_REVIEW_NOT_ALLOWED", 403, "WorkLog review permission is required");
    }
    const id = normalizeId(workLogId);
    const input = normalizeWorkLogTransitionRequest(raw);
    const state = await this.requireState(id);
    this.assertRevision(state, input.expectedRevision);
    if (state.statusCode !== "reviewed") {
      throw new WorkLogServiceError("WORK_LOG_TRANSITION_NOT_ALLOWED", 422, "Only reviewed WorkLog can cancel review");
    }
    const changed = await this.persistence.cancelReview(state, input, context);
    if (!changed) this.throwRevisionConflict();
    return this.getDetail(id, { actorMemberId: context.actorMemberId, allowCrossEmployeeRead: true });
  }

  async deleteCreated(workLogId: number, expectedRevision: number, context: WorkLogMutationContext): Promise<void> {
    const id = normalizeId(workLogId);
    if (!Number.isInteger(expectedRevision) || expectedRevision <= 0) throw new FieldValidationError({ expectedRevision: "必須是正整數" });
    const state = await this.requireState(id);
    this.assertRevision(state, expectedRevision);
    const owner = state.employeeId === context.actorMemberId;
    if (state.statusCode !== "created" || (!owner && context.allowAdministrativeDelete !== true)) {
      throw new WorkLogServiceError("WORK_LOG_DELETE_NOT_ALLOWED", owner ? 409 : 403, "WorkLog hard delete is not allowed");
    }
    const deleted = await this.persistence.deleteCreated(state, context);
    if (!deleted) this.throwRevisionConflict();
  }

  private async ownerTransition(
    workLogId: number,
    raw: unknown,
    context: WorkLogMutationContext,
    fromStatus: "created" | "pending_review",
    toStatus: "created" | "pending_review",
    action: string,
  ): Promise<WorkLogDetail> {
    const id = normalizeId(workLogId);
    const input = normalizeWorkLogTransitionRequest(raw);
    const state = await this.requireState(id);
    this.assertRevision(state, input.expectedRevision);
    this.assertOwner(state, context.actorMemberId);
    if (state.statusCode !== fromStatus) {
      throw new WorkLogServiceError("WORK_LOG_TRANSITION_NOT_ALLOWED", 422, `WorkLog must be ${fromStatus}`);
    }
    const changed = await this.persistence.transition(state, toStatus, action, input, context);
    if (!changed) this.throwRevisionConflict();
    return this.getDetail(id, { actorMemberId: context.actorMemberId, allowCrossEmployeeRead: true });
  }

  private async validateProfileReferences(input: NormalizedWorkLogProfile): Promise<void> {
    const categoryIds = input.entries.flatMap((entry) => entry.categories.map((category) => category.workLogCategoryId));
    const platformIds = input.entries.flatMap((entry) => entry.platformId == null ? [] : [entry.platformId]);
    const [categories, platforms] = await Promise.all([
      this.repository.resolveCategories(categoryIds),
      this.repository.resolvePlatforms(platformIds),
    ]);
    const errors: Record<string, string> = {};
    input.entries.forEach((entry, entryIndex) => {
      if (entry.platformId != null) {
        const platform = platforms.get(entry.platformId);
        if (!platform) errors[`entries.${entryIndex}.platformId`] = "平台不存在";
        else if (!platform.isActive) errors[`entries.${entryIndex}.platformId`] = "平台已停用";
      }
      entry.categories.forEach((categoryInput, categoryIndex) => {
        const category = categories.get(categoryInput.workLogCategoryId);
        const path = `entries.${entryIndex}.categories.${categoryIndex}`;
        if (!category) errors[`${path}.workLogCategoryId`] = "分類不存在";
        else if (!category.isActive) errors[`${path}.workLogCategoryId`] = "分類已停用";
        else if (category.inputMode === "boolean" && categoryInput.quantityScaled4 !== 10_000) {
          errors[`${path}.quantity`] = "boolean 分類的數量必須為 1";
        }
      });
    });
    if (Object.keys(errors).length > 0) throw new FieldValidationError(errors);
  }

  private assertAccessActor(access: WorkLogAccessContext): void {
    if (!Number.isInteger(access.actorMemberId) || access.actorMemberId <= 0) {
      throw new Error("WORK_LOG_ACCESS_ACTOR_REQUIRED");
    }
  }

  private async requireState(workLogId: number): Promise<WorkLogRecordState> {
    const state = await this.repository.getRecordState(workLogId);
    if (!state) throw new WorkLogServiceError("WORK_LOG_NOT_FOUND", 404, "WorkLog not found");
    return state;
  }

  private assertRevision(state: WorkLogRecordState, expectedRevision: number): void {
    if (state.revision !== expectedRevision) this.throwRevisionConflict();
  }

  private assertOwner(state: WorkLogRecordState, actorMemberId: number): void {
    if (state.employeeId !== actorMemberId) {
      throw new WorkLogServiceError("WORK_LOG_ACCESS_DENIED", 403, "Only the WorkLog owner may perform this action");
    }
  }

  private throwRevisionConflict(): never {
    throw new WorkLogServiceError("WORK_LOG_REVISION_CONFLICT", 409, "WorkLog has changed since it was loaded");
  }
}

import type {
  DefectDetail,
  DefectListResult,
  DefectSearchQuery,
  DefectStatusCode,
} from "../../shared/defect";
import { FieldValidationError } from "../validation/fields";
import {
  DefectPersistence,
  type DefectMutationContext,
} from "./defect-persistence";
import {
  DefectRepository,
  type DefectRecordState,
  type DefectReferenceSnapshot,
} from "./defect-repository";
import {
  normalizeCreateDefectRequest,
  normalizeDefectTransitionRequest,
  normalizeDeleteDefectRequest,
  normalizeUpdateDefectRequest,
  type NormalizedCreateDefectRequest,
  type NormalizedDefectTransitionRequest,
  type NormalizedUpdateDefectRequest,
} from "./defect-validation";

export type DefectServiceErrorCode =
  | "DEFECT_NOT_FOUND"
  | "DEFECT_REVISION_CONFLICT"
  | "DEFECT_EDIT_NOT_ALLOWED"
  | "DEFECT_TRANSITION_NOT_ALLOWED"
  | "DEFECT_INVALIDATED"
  | "DEFECT_DELETE_NOT_ALLOWED";

export class DefectServiceError extends Error {
  constructor(
    readonly code: DefectServiceErrorCode,
    readonly status: 403 | 404 | 409 | 422,
    message: string,
  ) {
    super(message);
    this.name = "DefectServiceError";
  }
}

function normalizeDefectId(defectId: number): number {
  if (!Number.isInteger(defectId) || defectId <= 0) {
    throw new FieldValidationError({ defectId: "必須是正整數" });
  }
  return defectId;
}

function assertReferences(refs: DefectReferenceSnapshot): void {
  const errors: Record<string, string> = {};
  if (!refs.customer) errors.customerId = "客戶不存在";
  if (!refs.item) errors.itemId = "商品不存在";
  if (!refs.owner) errors.ownerEmployeeId = "負責人不存在或已停用";
  if (Object.keys(errors).length > 0) throw new FieldValidationError(errors);
}

function assertExpectedRevision(state: DefectRecordState, expectedRevision: number): void {
  if (state.revision !== expectedRevision) {
    throw new DefectServiceError(
      "DEFECT_REVISION_CONFLICT",
      409,
      "Defect report has changed since it was loaded",
    );
  }
}

function assertNotInvalidated(state: DefectRecordState): void {
  if (state.invalidatedAt != null) {
    throw new DefectServiceError(
      "DEFECT_INVALIDATED",
      409,
      "Invalidated Defect report cannot be modified",
    );
  }
}

export class DefectService {
  private readonly repository: DefectRepository;
  private readonly persistence: DefectPersistence;

  constructor(db: D1Database) {
    this.repository = new DefectRepository(db);
    this.persistence = new DefectPersistence(db);
  }

  async search(query: DefectSearchQuery): Promise<DefectListResult> {
    return this.repository.search(query);
  }

  async getDetail(defectId: number): Promise<DefectDetail> {
    const id = normalizeDefectId(defectId);
    const detail = await this.repository.getDetail(id);
    if (!detail) throw new DefectServiceError("DEFECT_NOT_FOUND", 404, "Defect report not found");
    return detail;
  }

  async create(raw: unknown, context: DefectMutationContext): Promise<DefectDetail> {
    const input = normalizeCreateDefectRequest(raw);
    const refs = await this.resolveAndAssertReferences(input);
    const defectId = await this.persistence.create(input, refs, context);
    return this.getDetail(defectId);
  }

  async update(
    defectId: number,
    raw: unknown,
    context: DefectMutationContext,
  ): Promise<DefectDetail> {
    const id = normalizeDefectId(defectId);
    const input = normalizeUpdateDefectRequest(raw);
    const state = await this.requireState(id);
    assertExpectedRevision(state, input.expectedRevision);
    assertNotInvalidated(state);
    if (state.statusCode === "resolved") {
      throw new DefectServiceError(
        "DEFECT_EDIT_NOT_ALLOWED",
        409,
        "Resolved Defect report must be reopened before editing",
      );
    }

    const refs = await this.resolveAndAssertReferences(input);
    const updated = await this.persistence.update(id, input, refs, context);
    if (!updated) {
      throw new DefectServiceError(
        "DEFECT_REVISION_CONFLICT",
        409,
        "Defect report has changed since it was loaded",
      );
    }
    return this.getDetail(id);
  }

  async startProcessing(
    defectId: number,
    raw: unknown,
    context: DefectMutationContext,
  ): Promise<DefectDetail> {
    return this.transition(defectId, raw, context, "created", "processing");
  }

  async resolve(
    defectId: number,
    raw: unknown,
    context: DefectMutationContext,
  ): Promise<DefectDetail> {
    return this.transition(defectId, raw, context, "processing", "resolved");
  }

  async reopen(
    defectId: number,
    raw: unknown,
    context: DefectMutationContext,
  ): Promise<DefectDetail> {
    return this.transition(defectId, raw, context, "resolved", "processing");
  }

  async invalidate(
    defectId: number,
    raw: unknown,
    context: DefectMutationContext,
  ): Promise<DefectDetail> {
    const id = normalizeDefectId(defectId);
    const input = normalizeDefectTransitionRequest(raw);
    const state = await this.requireState(id);
    assertExpectedRevision(state, input.expectedRevision);
    assertNotInvalidated(state);
    if (state.statusCode === "created") {
      throw new DefectServiceError(
        "DEFECT_TRANSITION_NOT_ALLOWED",
        422,
        "Created Defect report should be corrected or deleted rather than invalidated",
      );
    }

    const invalidated = await this.persistence.invalidate(state, input, context);
    if (!invalidated) {
      throw new DefectServiceError(
        "DEFECT_REVISION_CONFLICT",
        409,
        "Defect report has changed since it was loaded",
      );
    }
    return this.getDetail(id);
  }

  async deleteCreated(
    defectId: number,
    raw: unknown,
    context: DefectMutationContext,
  ): Promise<void> {
    const id = normalizeDefectId(defectId);
    const input = normalizeDeleteDefectRequest(raw);
    const state = await this.requireState(id);
    assertExpectedRevision(state, input.expectedRevision);
    assertNotInvalidated(state);

    if (state.statusCode !== "created") {
      throw new DefectServiceError(
        "DEFECT_DELETE_NOT_ALLOWED",
        409,
        "Defect report can only be hard-deleted before handling starts",
      );
    }

    const creatorCanDelete = state.createdByEmployeeId === context.actorMemberId;
    if (!creatorCanDelete && context.allowAdministrativeDelete !== true) {
      throw new DefectServiceError(
        "DEFECT_DELETE_NOT_ALLOWED",
        403,
        "Only the creator or an authorized administrator may delete a created Defect report",
      );
    }

    const deleted = await this.persistence.deleteCreated(state, context);
    if (!deleted) {
      throw new DefectServiceError(
        "DEFECT_REVISION_CONFLICT",
        409,
        "Defect report has changed since it was loaded",
      );
    }
  }

  private async transition(
    defectId: number,
    raw: unknown,
    context: DefectMutationContext,
    fromStatus: DefectStatusCode,
    toStatus: DefectStatusCode,
  ): Promise<DefectDetail> {
    const id = normalizeDefectId(defectId);
    const input = normalizeDefectTransitionRequest(raw);
    const state = await this.requireState(id);
    assertExpectedRevision(state, input.expectedRevision);
    assertNotInvalidated(state);
    if (state.statusCode !== fromStatus) {
      throw new DefectServiceError(
        "DEFECT_TRANSITION_NOT_ALLOWED",
        422,
        `Defect transition requires status ${fromStatus}`,
      );
    }

    const changed = await this.persistence.transition(id, fromStatus, toStatus, input, context);
    if (!changed) {
      throw new DefectServiceError(
        "DEFECT_REVISION_CONFLICT",
        409,
        "Defect report has changed since it was loaded",
      );
    }
    return this.getDetail(id);
  }

  private async requireState(defectId: number): Promise<DefectRecordState> {
    const state = await this.repository.getRecordState(defectId);
    if (!state) throw new DefectServiceError("DEFECT_NOT_FOUND", 404, "Defect report not found");
    return state;
  }

  private async resolveAndAssertReferences(
    input: NormalizedCreateDefectRequest | NormalizedUpdateDefectRequest,
  ): Promise<DefectReferenceSnapshot> {
    const refs = await this.repository.resolveReferences(
      input.customerId,
      input.itemId,
      input.ownerEmployeeId,
    );
    assertReferences(refs);
    return refs;
  }
}

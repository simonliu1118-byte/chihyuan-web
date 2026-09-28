import type {
  CreateDefectRequest,
  DefectProfileInput,
  DefectTransitionRequest,
  DeleteDefectRequest,
  UpdateDefectRequest,
} from "../../shared/defect";
import { FieldValidationError, ValidationBag } from "../validation/fields";

export interface NormalizedDefectProfile {
  reportedDate: string;
  customerId: number;
  itemId: number;
  ownerEmployeeId: number;
  defectDescription: string;
  handling: string | null;
}

export interface NormalizedCreateDefectRequest extends NormalizedDefectProfile {}

export interface NormalizedUpdateDefectRequest extends NormalizedDefectProfile {
  expectedRevision: number;
}

export interface NormalizedDefectTransitionRequest {
  expectedRevision: number;
  reason: string | null;
}

export interface NormalizedDeleteDefectRequest {
  expectedRevision: number;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new FieldValidationError({ _request: "Request body must be a JSON object" });
  }
  return value as Record<string, unknown>;
}

function normalizeProfile(raw: unknown): NormalizedDefectProfile {
  const input = asObject(raw as DefectProfileInput);
  const bag = new ValidationBag(input);
  const reportedDate = bag.requiredIsoDate("reportedDate") ?? "";
  const customerId = bag.requiredPositiveInteger("customerId") ?? 0;
  const itemId = bag.requiredPositiveInteger("itemId") ?? 0;
  const ownerEmployeeId = bag.requiredPositiveInteger("ownerEmployeeId") ?? 0;
  const defectDescription = bag.requiredText("defectDescription", { maxLength: 1000 }) ?? "";
  const handling = bag.optionalText("handling", { maxLength: 2000 });
  bag.throwIfInvalid();
  return {
    reportedDate,
    customerId,
    itemId,
    ownerEmployeeId,
    defectDescription,
    handling,
  };
}

export function normalizeCreateDefectRequest(raw: unknown): NormalizedCreateDefectRequest {
  return normalizeProfile(raw as CreateDefectRequest);
}

export function normalizeUpdateDefectRequest(raw: unknown): NormalizedUpdateDefectRequest {
  const input = asObject(raw as UpdateDefectRequest);
  const profile = normalizeProfile(input);
  const bag = new ValidationBag(input);
  const expectedRevision = bag.requiredPositiveInteger("expectedRevision");
  bag.throwIfInvalid();
  return { ...profile, expectedRevision: expectedRevision ?? 0 };
}

export function normalizeDefectTransitionRequest(raw: unknown): NormalizedDefectTransitionRequest {
  const input = asObject(raw as DefectTransitionRequest);
  const bag = new ValidationBag(input);
  const expectedRevision = bag.requiredPositiveInteger("expectedRevision");
  const reason = bag.optionalText("reason", { maxLength: 1000 });
  bag.throwIfInvalid();
  return { expectedRevision: expectedRevision ?? 0, reason };
}

export function normalizeDeleteDefectRequest(raw: unknown): NormalizedDeleteDefectRequest {
  const input = asObject(raw as DeleteDefectRequest);
  const bag = new ValidationBag(input);
  const expectedRevision = bag.requiredPositiveInteger("expectedRevision");
  bag.throwIfInvalid();
  return { expectedRevision: expectedRevision ?? 0 };
}

import type {
  CreateWorkLogRequest,
  ReviewWorkLogRequest,
  UpdateWorkLogRequest,
  WorkLogSearchQuery,
  WorkLogStatusCode,
  WorkLogTransitionRequest,
} from "../../shared/work-log";
import { parseScaled4 } from "../../shared/fixed-point";
import { FieldValidationError, ValidationBag } from "../validation/fields";

const MAX_ENTRIES = 100;
const MAX_ENTRY_CATEGORIES = 50;
const STATUS_CODES = new Set<WorkLogStatusCode>(["created", "pending_review", "reviewed"]);

export interface NormalizedWorkLogEntryCategory {
  workLogCategoryId: number;
  quantityScaled4: number;
  sortOrder: number;
}

export interface NormalizedWorkLogEntry {
  entryTypeCode: string;
  content: string | null;
  platformId: number | null;
  sortOrder: number;
  categories: readonly NormalizedWorkLogEntryCategory[];
}

export interface NormalizedWorkLogProfile {
  logDate: string;
  dateFrom: string;
  dateTo: string;
  workDaysScaled4: number;
  typeCode: string;
  entries: readonly NormalizedWorkLogEntry[];
}

export interface NormalizedUpdateWorkLogRequest extends NormalizedWorkLogProfile {
  expectedRevision: number;
}

export interface NormalizedWorkLogTransitionRequest {
  expectedRevision: number;
  reason: string | null;
}

export interface NormalizedWorkLogEntryReview {
  entryId: number;
  reviewRemark: string | null;
  reviewScoreScaled4: number | null;
}

export interface NormalizedReviewWorkLogRequest {
  expectedRevision: number;
  workDaysScaled4: number;
  reviewRemark: string | null;
  entries: readonly NormalizedWorkLogEntryReview[];
}

function asObject(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new FieldValidationError({ _request: "Request body must be a JSON object" });
  }
  return value as Record<string, unknown>;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function positiveId(value: unknown, path: string, errors: Record<string, string>, nullable = false): number | null {
  if (nullable && (value == null || value === "")) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    errors[path] = "必須是正整數";
    return nullable ? null : 0;
  }
  return value;
}

function parsePositiveScaled4(value: unknown, path: string, errors: Record<string, string>): number {
  if (typeof value !== "string") {
    errors[path] = "請以十進位文字輸入";
    return 0;
  }
  try {
    const parsed = parseScaled4(value);
    if (parsed <= 0) errors[path] = "必須大於 0";
    return parsed;
  } catch {
    errors[path] = "最多支援 4 位小數";
    return 0;
  }
}

function normalizeProfile(raw: unknown): NormalizedWorkLogProfile {
  const input = asObject(raw as CreateWorkLogRequest | UpdateWorkLogRequest);
  const bag = new ValidationBag(input);
  const logDate = bag.requiredText("logDate", { maxLength: 10 }) ?? "";
  const dateFrom = bag.requiredText("dateFrom", { maxLength: 10 }) ?? "";
  const dateTo = bag.requiredText("dateTo", { maxLength: 10 }) ?? "";
  const typeCode = bag.requiredText("typeCode", { maxLength: 80 }) ?? "";
  const errors: Record<string, string> = { ...bag.fields() };
  if (!validDate(logDate)) errors.logDate = "日期格式必須為 YYYY-MM-DD";
  if (!validDate(dateFrom)) errors.dateFrom = "日期格式必須為 YYYY-MM-DD";
  if (!validDate(dateTo)) errors.dateTo = "日期格式必須為 YYYY-MM-DD";
  if (validDate(dateFrom) && validDate(dateTo) && dateTo < dateFrom) errors.dateTo = "結束日期不可早於開始日期";
  const workDaysScaled4 = parsePositiveScaled4(input.workDays, "workDays", errors);

  const entries: NormalizedWorkLogEntry[] = [];
  if (!Array.isArray(input.entries) || input.entries.length === 0) {
    errors.entries = "至少需要 1 筆工作內容";
  } else if (input.entries.length > MAX_ENTRIES) {
    errors.entries = `工作內容最多 ${MAX_ENTRIES} 筆`;
  } else {
    input.entries.forEach((entryRaw, index) => {
      const path = `entries.${index}`;
      const row = entryRaw != null && typeof entryRaw === "object" && !Array.isArray(entryRaw)
        ? entryRaw as Record<string, unknown>
        : {};
      const entryBag = new ValidationBag(row);
      const entryTypeCode = entryBag.requiredText("entryTypeCode", { maxLength: 80 }) ?? "";
      const content = entryBag.optionalText("content", { maxLength: 4000 });
      Object.entries(entryBag.fields()).forEach(([key, message]) => { errors[`${path}.${key}`] = message; });
      const platformId = positiveId(row.platformId, `${path}.platformId`, errors, true);
      let sortOrder = index;
      if (row.sortOrder != null) {
        if (typeof row.sortOrder !== "number" || !Number.isInteger(row.sortOrder) || row.sortOrder < 0) errors[`${path}.sortOrder`] = "必須是 0 以上整數";
        else sortOrder = row.sortOrder;
      }

      const categories: NormalizedWorkLogEntryCategory[] = [];
      if (row.categories != null) {
        if (!Array.isArray(row.categories)) errors[`${path}.categories`] = "必須是陣列";
        else if (row.categories.length > MAX_ENTRY_CATEGORIES) errors[`${path}.categories`] = `分類最多 ${MAX_ENTRY_CATEGORIES} 筆`;
        else {
          const seen = new Set<number>();
          row.categories.forEach((categoryRaw, categoryIndex) => {
            const categoryPath = `${path}.categories.${categoryIndex}`;
            const category = categoryRaw != null && typeof categoryRaw === "object" && !Array.isArray(categoryRaw)
              ? categoryRaw as Record<string, unknown>
              : {};
            const workLogCategoryId = positiveId(category.workLogCategoryId, `${categoryPath}.workLogCategoryId`, errors) ?? 0;
            const quantityScaled4 = parsePositiveScaled4(category.quantity, `${categoryPath}.quantity`, errors);
            let categorySortOrder = categoryIndex;
            if (category.sortOrder != null) {
              if (typeof category.sortOrder !== "number" || !Number.isInteger(category.sortOrder) || category.sortOrder < 0) errors[`${categoryPath}.sortOrder`] = "必須是 0 以上整數";
              else categorySortOrder = category.sortOrder;
            }
            if (workLogCategoryId > 0) {
              if (seen.has(workLogCategoryId)) errors[`${categoryPath}.workLogCategoryId`] = "同一工作項目不可重複相同分類";
              seen.add(workLogCategoryId);
            }
            categories.push({ workLogCategoryId, quantityScaled4, sortOrder: categorySortOrder });
          });
        }
      }
      if (!content && categories.length === 0) errors[`${path}.content`] = "內容與分類至少需要一項";
      entries.push({ entryTypeCode, content, platformId, sortOrder, categories });
    });
  }

  if (Object.keys(errors).length > 0) throw new FieldValidationError(errors);
  return { logDate, dateFrom, dateTo, workDaysScaled4, typeCode, entries };
}

export function normalizeCreateWorkLogRequest(raw: unknown): NormalizedWorkLogProfile {
  return normalizeProfile(raw);
}

export function normalizeUpdateWorkLogRequest(raw: unknown): NormalizedUpdateWorkLogRequest {
  const input = asObject(raw);
  const profile = normalizeProfile(input);
  const errors: Record<string, string> = {};
  const expectedRevision = positiveId(input.expectedRevision, "expectedRevision", errors) ?? 0;
  if (Object.keys(errors).length > 0) throw new FieldValidationError(errors);
  return { ...profile, expectedRevision };
}

export function normalizeWorkLogTransitionRequest(raw: unknown): NormalizedWorkLogTransitionRequest {
  const input = asObject(raw as WorkLogTransitionRequest);
  const bag = new ValidationBag(input);
  const expectedRevision = bag.requiredPositiveInteger("expectedRevision") ?? 0;
  const reason = bag.optionalText("reason", { maxLength: 1000 });
  bag.throwIfInvalid();
  return { expectedRevision, reason };
}

export function normalizeReviewWorkLogRequest(raw: unknown): NormalizedReviewWorkLogRequest {
  const input = asObject(raw as ReviewWorkLogRequest);
  const errors: Record<string, string> = {};
  const expectedRevision = positiveId(input.expectedRevision, "expectedRevision", errors) ?? 0;
  const workDaysScaled4 = parsePositiveScaled4(input.workDays, "workDays", errors);
  const reviewRemark = typeof input.reviewRemark === "string" ? (input.reviewRemark.trim() || null) : input.reviewRemark == null ? null : null;
  if (typeof input.reviewRemark === "string" && input.reviewRemark.length > 4000) errors.reviewRemark = "不可超過 4000 個字元";

  const entries: NormalizedWorkLogEntryReview[] = [];
  if (!Array.isArray(input.entries)) errors.entries = "必須是陣列";
  else if (input.entries.length > MAX_ENTRIES) errors.entries = `審核項目最多 ${MAX_ENTRIES} 筆`;
  else {
    const seen = new Set<number>();
    input.entries.forEach((entryRaw, index) => {
      const path = `entries.${index}`;
      const row = entryRaw != null && typeof entryRaw === "object" && !Array.isArray(entryRaw)
        ? entryRaw as Record<string, unknown>
        : {};
      const entryId = positiveId(row.entryId, `${path}.entryId`, errors) ?? 0;
      if (entryId > 0) {
        if (seen.has(entryId)) errors[`${path}.entryId`] = "審核項目不可重複";
        seen.add(entryId);
      }
      let reviewRemarkValue: string | null = null;
      if (row.reviewRemark != null) {
        if (typeof row.reviewRemark !== "string") errors[`${path}.reviewRemark`] = "必須是文字";
        else if (row.reviewRemark.length > 2000) errors[`${path}.reviewRemark`] = "不可超過 2000 個字元";
        else reviewRemarkValue = row.reviewRemark.trim() || null;
      }
      let reviewScoreScaled4: number | null = null;
      if (row.reviewScore != null && row.reviewScore !== "") {
        if (typeof row.reviewScore !== "string") errors[`${path}.reviewScore`] = "請以十進位文字輸入";
        else {
          try { reviewScoreScaled4 = parseScaled4(row.reviewScore); }
          catch { errors[`${path}.reviewScore`] = "最多支援 4 位小數"; }
        }
      }
      entries.push({ entryId, reviewRemark: reviewRemarkValue, reviewScoreScaled4 });
    });
  }
  if (Object.keys(errors).length > 0) throw new FieldValidationError(errors);
  return { expectedRevision, workDaysScaled4, reviewRemark, entries };
}

export function normalizeWorkLogSearchQuery(query: WorkLogSearchQuery): WorkLogSearchQuery {
  const errors: Record<string, string> = {};
  if (query.statusCode && !STATUS_CODES.has(query.statusCode)) errors.statusCode = "狀態無效";
  if (query.dateFrom && !validDate(query.dateFrom)) errors.dateFrom = "日期格式必須為 YYYY-MM-DD";
  if (query.dateTo && !validDate(query.dateTo)) errors.dateTo = "日期格式必須為 YYYY-MM-DD";
  if (query.dateFrom && query.dateTo && query.dateTo < query.dateFrom) errors.dateTo = "結束日期不可早於開始日期";
  if (Object.keys(errors).length > 0) throw new FieldValidationError(errors);
  return query;
}

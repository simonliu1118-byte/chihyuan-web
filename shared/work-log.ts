export type WorkLogStatusCode = "created" | "pending_review" | "reviewed";
export type WorkLogCategoryInputMode = "boolean" | "quantity";

export interface WorkLogCategoryRef {
  id: number;
  code: string;
  name: string;
  inputMode: WorkLogCategoryInputMode;
  unitLabel: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface WorkLogPlatformRef {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface WorkLogScoringRow {
  id: number;
  workLogCategoryId: number | null;
  customName: string | null;
  scoreValue: string | null;
  description: string | null;
  note: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface WorkLogScoringConfig {
  targetAverageDailyScore: string | null;
  minimumAverageDailyScore: string | null;
  revision: number;
  updatedAt: string;
}

export interface WorkLogConfiguration {
  categories: readonly WorkLogCategoryRef[];
  platforms: readonly WorkLogPlatformRef[];
  scoringRows: readonly WorkLogScoringRow[];
  scoringConfig: WorkLogScoringConfig | null;
}

export interface WorkLogEntryCategory {
  id: number;
  workLogCategoryId: number;
  quantity: string;
  sortOrder: number;
}

export interface WorkLogEntry {
  id: number;
  entryTypeCode: string;
  content: string | null;
  platformId: number | null;
  reviewRemark: string | null;
  reviewScore: string | null;
  sortOrder: number;
  categories: readonly WorkLogEntryCategory[];
}

export interface WorkLogSummary {
  id: number;
  workLogRef: string;
  logDate: string;
  dateFrom: string;
  dateTo: string;
  workDays: string;
  typeCode: string;
  employeeId: number;
  statusCode: WorkLogStatusCode;
  reviewedBy: number | null;
  reviewedAt: string | null;
  finalScore: string | null;
  averageDailyScore: string | null;
  revision: number;
  updatedAt: string;
}

export interface WorkLogDetail extends WorkLogSummary {
  reviewRemark: string | null;
  createdAt: string;
  entries: readonly WorkLogEntry[];
}

export interface WorkLogEntryCategoryInput {
  workLogCategoryId: number;
  quantity: string;
  sortOrder?: number;
}

export interface WorkLogEntryInput {
  entryTypeCode: string;
  content?: string | null;
  platformId?: number | null;
  sortOrder?: number;
  categories?: readonly WorkLogEntryCategoryInput[];
}

export interface CreateWorkLogRequest {
  logDate: string;
  dateFrom: string;
  dateTo: string;
  workDays: string;
  typeCode: string;
  entries: readonly WorkLogEntryInput[];
}

export interface UpdateWorkLogRequest extends CreateWorkLogRequest {
  expectedRevision: number;
}

export interface WorkLogTransitionRequest {
  expectedRevision: number;
  reason?: string | null;
}

export interface WorkLogEntryReviewInput {
  entryId: number;
  reviewRemark?: string | null;
  reviewScore?: string | null;
}

export interface ReviewWorkLogRequest {
  expectedRevision: number;
  workDays: string;
  reviewRemark?: string | null;
  entries: readonly WorkLogEntryReviewInput[];
}

export interface WorkLogSearchQuery {
  q?: string;
  employeeId?: number;
  statusCode?: WorkLogStatusCode;
  typeCode?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  cursor?: string;
}

export interface WorkLogListResult {
  items: readonly WorkLogSummary[];
  nextCursor: string | null;
}

export interface WorkLogStatisticsQuery {
  employeeId?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface WorkLogStatisticsPoint {
  workLogId: number;
  workLogRef: string;
  logDate: string;
  workDays: string;
  finalScore: string;
  averageDailyScore: string;
}

export interface WorkLogStatisticsResult {
  reviewedCount: number;
  totalWorkDays: string;
  totalFinalScore: string;
  weightedAverageDailyScore: string | null;
  points: readonly WorkLogStatisticsPoint[];
}

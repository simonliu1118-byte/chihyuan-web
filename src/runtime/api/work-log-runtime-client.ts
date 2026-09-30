import type {
  CreateWorkLogRequest,
  ReviewWorkLogRequest,
  UpdateWorkLogRequest,
  WorkLogConfiguration,
  WorkLogDetail,
  WorkLogListResult,
  WorkLogSearchQuery,
  WorkLogStatisticsQuery,
  WorkLogStatisticsResult,
  WorkLogTransitionRequest,
} from "../../../shared/work-log";
import { apiRequest } from "../../api/client";

function queryString(values: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value == null || value === "") continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export function loadWorkLogConfiguration(includeInactive = false): Promise<WorkLogConfiguration> {
  return apiRequest<WorkLogConfiguration>(
    `/api/business/worklogs/configuration${queryString({ includeInactive })}`,
    { method: "GET" },
  );
}

export function searchWorkLogs(query: WorkLogSearchQuery = {}): Promise<WorkLogListResult> {
  return apiRequest<WorkLogListResult>(
    `/api/business/worklogs${queryString({
      q: query.q?.trim() || undefined,
      employeeId: query.employeeId,
      statusCode: query.statusCode,
      typeCode: query.typeCode?.trim() || undefined,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      limit: query.limit,
      cursor: query.cursor,
    })}`,
    { method: "GET" },
  );
}

export function loadWorkLogDetail(workLogId: number): Promise<WorkLogDetail> {
  return apiRequest<WorkLogDetail>(
    `/api/business/worklogs/${encodeURIComponent(String(workLogId))}`,
    { method: "GET" },
  );
}

export function createWorkLog(input: CreateWorkLogRequest): Promise<WorkLogDetail> {
  return apiRequest<WorkLogDetail>("/api/business/worklogs", {
    method: "POST",
    json: input,
  });
}

export function updateWorkLogCreated(
  workLogId: number,
  input: UpdateWorkLogRequest,
): Promise<WorkLogDetail> {
  return apiRequest<WorkLogDetail>(
    `/api/business/worklogs/${encodeURIComponent(String(workLogId))}`,
    { method: "PATCH", json: input },
  );
}

export function deleteWorkLogCreated(
  workLogId: number,
  expectedRevision: number,
): Promise<{ deleted: true; workLogId: number }> {
  return apiRequest(
    `/api/business/worklogs/${encodeURIComponent(String(workLogId))}`,
    { method: "DELETE", json: { expectedRevision } },
  );
}

function transition(
  workLogId: number,
  action: "submit" | "withdraw" | "cancel-review",
  input: WorkLogTransitionRequest,
): Promise<WorkLogDetail> {
  return apiRequest<WorkLogDetail>(
    `/api/business/worklogs/${encodeURIComponent(String(workLogId))}/${action}`,
    { method: "POST", json: input },
  );
}

export function submitWorkLog(
  workLogId: number,
  input: WorkLogTransitionRequest,
): Promise<WorkLogDetail> {
  return transition(workLogId, "submit", input);
}

export function withdrawWorkLog(
  workLogId: number,
  input: WorkLogTransitionRequest,
): Promise<WorkLogDetail> {
  return transition(workLogId, "withdraw", input);
}

export function reviewWorkLog(
  workLogId: number,
  input: ReviewWorkLogRequest,
): Promise<WorkLogDetail> {
  return apiRequest<WorkLogDetail>(
    `/api/business/worklogs/${encodeURIComponent(String(workLogId))}/review`,
    { method: "POST", json: input },
  );
}

export function cancelWorkLogReview(
  workLogId: number,
  input: WorkLogTransitionRequest,
): Promise<WorkLogDetail> {
  return transition(workLogId, "cancel-review", input);
}

export function loadWorkLogStatistics(
  query: WorkLogStatisticsQuery = {},
): Promise<WorkLogStatisticsResult> {
  return apiRequest<WorkLogStatisticsResult>(
    `/api/business/worklogs/statistics${queryString({
      employeeId: query.employeeId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })}`,
    { method: "GET" },
  );
}

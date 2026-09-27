export type DefectStatusCode = "created" | "processing" | "resolved";

export interface DefectEmployeeRef {
  id: number;
  employeeNo: string | null;
  displayName: string | null;
}

export interface DefectSummary {
  id: number;
  reportedDate: string;
  customerId: number;
  customerNoSnapshot: string | null;
  customerNameSnapshot: string;
  itemId: number;
  itemNoSnapshot: string;
  itemNameSnapshot: string;
  specSnapshot: string | null;
  ownerEmployee: DefectEmployeeRef;
  defectDescription: string;
  handling: string | null;
  statusCode: DefectStatusCode;
  invalidatedAt: string | null;
  invalidatedByEmployeeId: number | null;
  revision: number;
  updatedAt: string;
}

export interface DefectDetail extends DefectSummary {
  createdAt: string;
  createdByEmployeeId: number | null;
}

export interface DefectSearchQuery {
  q?: string;
  customerId?: number;
  itemId?: number;
  ownerEmployeeId?: number;
  statusCode?: DefectStatusCode;
  includeInvalid?: boolean;
  reportedFrom?: string;
  reportedTo?: string;
  limit?: number;
  cursor?: string;
}

export interface DefectListResult {
  items: readonly DefectSummary[];
  nextCursor: string | null;
}

export interface DefectProfileInput {
  reportedDate: string;
  customerId: number;
  itemId: number;
  ownerEmployeeId: number;
  defectDescription: string;
  handling?: string | null;
}

export interface CreateDefectRequest extends DefectProfileInput {}

export interface UpdateDefectRequest extends DefectProfileInput {
  expectedRevision: number;
}

export interface DefectTransitionRequest {
  expectedRevision: number;
  reason?: string | null;
}

export interface DeleteDefectRequest {
  expectedRevision: number;
}

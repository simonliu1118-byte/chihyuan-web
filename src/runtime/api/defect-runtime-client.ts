import type { DefectModuleLookups } from "../../../shared/business-lookups";
import type {
  CreateDefectRequest,
  DefectDetail,
  DefectListResult,
  DefectSearchQuery,
  DefectTransitionRequest,
  DeleteDefectRequest,
  UpdateDefectRequest,
} from "../../../shared/defect";
import { apiRequest } from "../../api/client";

function searchPath(query: DefectSearchQuery): string {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.customerId != null) params.set("customerId", String(query.customerId));
  if (query.itemId != null) params.set("itemId", String(query.itemId));
  if (query.ownerEmployeeId != null) params.set("ownerEmployeeId", String(query.ownerEmployeeId));
  if (query.statusCode) params.set("statusCode", query.statusCode);
  if (query.includeInvalid === true) params.set("includeInvalid", "true");
  if (query.reportedFrom) params.set("reportedFrom", query.reportedFrom);
  if (query.reportedTo) params.set("reportedTo", query.reportedTo);
  if (query.limit != null) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  const encoded=params.toString();
  return encoded ? `/api/business/defects?${encoded}` : "/api/business/defects";
}

export function loadDefectLookups(selected: {
  customerId?: number | null;
  itemId?: number | null;
  ownerId?: number | null;
  customerQuery?: string;
  itemQuery?: string;
  limit?: number;
} = {}): Promise<DefectModuleLookups> {
  const params=new URLSearchParams();
  if(selected.customerId!=null) params.set("customerId",String(selected.customerId));
  if(selected.itemId!=null) params.set("itemId",String(selected.itemId));
  if(selected.ownerId!=null) params.set("ownerId",String(selected.ownerId));
  if(selected.customerQuery?.trim()) params.set("customerQ",selected.customerQuery.trim());
  if(selected.itemQuery?.trim()) params.set("itemQ",selected.itemQuery.trim());
  params.set("limit",String(selected.limit ?? 100));
  return apiRequest<DefectModuleLookups>(`/api/business/defects/lookups?${params.toString()}`,{method:"GET"});
}

export function searchDefects(query: DefectSearchQuery): Promise<DefectListResult> {
  return apiRequest<DefectListResult>(searchPath(query),{method:"GET"});
}

export function loadDefectDetail(defectId:number): Promise<DefectDetail> {
  return apiRequest<DefectDetail>(`/api/business/defects/${encodeURIComponent(String(defectId))}`,{method:"GET"});
}

export function createDefect(input:CreateDefectRequest): Promise<DefectDetail> {
  return apiRequest<DefectDetail>("/api/business/defects",{method:"POST",json:input});
}

export function updateDefect(defectId:number,input:UpdateDefectRequest): Promise<DefectDetail> {
  return apiRequest<DefectDetail>(`/api/business/defects/${encodeURIComponent(String(defectId))}`,{method:"PATCH",json:input});
}

function transition(defectId:number,action:"start-processing"|"resolve"|"reopen"|"invalidate",input:DefectTransitionRequest): Promise<DefectDetail> {
  return apiRequest<DefectDetail>(
    `/api/business/defects/${encodeURIComponent(String(defectId))}/${action}`,
    {method:"POST",json:input},
  );
}

export function startDefectProcessing(defectId:number,input:DefectTransitionRequest): Promise<DefectDetail> {
  return transition(defectId,"start-processing",input);
}

export function resolveDefect(defectId:number,input:DefectTransitionRequest): Promise<DefectDetail> {
  return transition(defectId,"resolve",input);
}

export function reopenDefect(defectId:number,input:DefectTransitionRequest): Promise<DefectDetail> {
  return transition(defectId,"reopen",input);
}

export function invalidateDefect(defectId:number,input:DefectTransitionRequest): Promise<DefectDetail> {
  return transition(defectId,"invalidate",input);
}

export function deleteDefect(defectId:number,input:DeleteDefectRequest): Promise<{deleted:true;defectId:number}> {
  return apiRequest(
    `/api/business/defects/${encodeURIComponent(String(defectId))}`,
    {method:"DELETE",json:input},
  );
}

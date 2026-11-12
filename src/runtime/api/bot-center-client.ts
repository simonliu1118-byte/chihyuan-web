import { apiRequest } from "../../api/client";
import type {
  BotCenterState, BotCredentialView, BotDraftDetail, BotDraftView, BotProfileView, BotProgressState, BotReviewStatus,
} from "../../../shared/bot-center";

export type BotCenterPageCursor = { botCode?: string; draftBefore?: number; reportBefore?: number; timelineBefore?: string };

export function loadBotProgress(): Promise<BotProgressState> {
  return apiRequest<BotProgressState>("/api/bot-center/progress");
}

export function loadBotCenter(
  draftStatus: BotReviewStatus | "all" = "pending",
  cursor: BotCenterPageCursor = {},
): Promise<BotCenterState> {
  const params = new URLSearchParams();
  if (cursor.botCode) params.set("botCode", cursor.botCode);
  if (draftStatus !== "pending") params.set("draftStatus", draftStatus);
  if (cursor.draftBefore != null) params.set("draftBefore", String(cursor.draftBefore));
  if (cursor.reportBefore != null) params.set("reportBefore", String(cursor.reportBefore));
  if (cursor.timelineBefore != null) params.set("timelineBefore", cursor.timelineBefore);
  const query = params.size ? "?" + params.toString() : "";
  return apiRequest<BotCenterState>(`/api/bot-center${query}`);
}

export function reviewDraft(id: number, decision: "approved" | "rejected", reason?: string): Promise<BotDraftView> {
  return apiRequest<BotDraftView>(`/api/bot-center/drafts/${id}/review`, { method: "POST", json: { decision, reason } });
}

export function issueBotCredential(code: string): Promise<{ token: string; botCode: string; createdAt: string }> {
  return apiRequest(`/api/bot-center/bots/${encodeURIComponent(code)}/credential`, { method: "POST" });
}

export function revokeBotCredential(code: string): Promise<BotCredentialView> {
  return apiRequest(`/api/bot-center/bots/${encodeURIComponent(code)}/credential`, { method: "DELETE" });
}

export function saveBotPush(code:string,json:{enabled:boolean;url?:string;key?:string}):Promise<BotProgressState['pushSettings'][number]>{
  return apiRequest(`/api/bot-center/bots/${encodeURIComponent(code)}/push`,{method:'PUT',json});
}
export function retryBotPush(id:number):Promise<BotDraftView>{
  return apiRequest(`/api/bot-center/drafts/${id}/push/retry`,{method:'POST'});
}

export function loadDraftDetail(id:number):Promise<BotDraftDetail>{
  return apiRequest<BotDraftDetail>(`/api/bot-center/drafts/${id}`);
}
export function reviewDraftItem(id:number,seq:number,decision:"approved"|"rejected",reason?:string):Promise<BotDraftDetail>{
  return apiRequest<BotDraftDetail>(`/api/bot-center/drafts/${id}/items/${seq}/review`,{method:"POST",json:{decision,reason}});
}
/** Same-origin image for review; the session cookie authorises it. */
export const reviewImageUrl=(id:number)=>`/api/bot-center/images/${id}`;

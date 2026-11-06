import { apiRequest } from "../../api/client";
import type {
  BotCenterState, BotCredentialView, BotDraftView, BotProfileView, BotReviewStatus,
} from "../../../shared/bot-center";

export type BotCenterPageCursor = { draftBefore?: number; reportBefore?: number; timelineBefore?: string };

export function loadBotCenter(
  draftStatus: BotReviewStatus | "all" = "pending",
  cursor: BotCenterPageCursor = {},
): Promise<BotCenterState> {
  const params = new URLSearchParams();
  if (draftStatus !== "pending") params.set("draftStatus", draftStatus);
  if (cursor.draftBefore != null) params.set("draftBefore", String(cursor.draftBefore));
  if (cursor.reportBefore != null) params.set("reportBefore", String(cursor.reportBefore));
  if (cursor.timelineBefore != null) params.set("timelineBefore", cursor.timelineBefore);
  const query = params.size ? "?" + params.toString() : "";
  return apiRequest<BotCenterState>(`/api/bot-center${query}`);
}

export function createBot(code: string, label: string): Promise<BotProfileView> {
  return apiRequest<BotProfileView>("/api/bot-center/bots", { method: "POST", json: { code, label } });
}

export function reviewDraft(id: number, decision: "approved" | "rejected", reason: string): Promise<BotDraftView> {
  return apiRequest<BotDraftView>(`/api/bot-center/drafts/${id}/review`, { method: "POST", json: { decision, reason } });
}

export function issueBotCredential(): Promise<{ token: string; createdAt: string }> {
  return apiRequest("/api/bot-center/credentials", { method: "POST" });
}

export function revokeBotCredential(): Promise<BotCredentialView> {
  return apiRequest("/api/bot-center/credentials", { method: "DELETE" });
}

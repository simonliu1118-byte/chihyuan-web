import { apiRequest } from "../../api/client";
import type {
  BotCenterState, BotCredentialView, BotDraftView, BotProfileView, BotReviewStatus,
} from "../../../shared/bot-center";

export function loadBotCenter(draftStatus: BotReviewStatus | "all" = "pending"): Promise<BotCenterState> {
  const query = draftStatus === "pending" ? "" : `?draftStatus=${draftStatus}`;
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

import { taipeiToday } from "./erp-query-history";

/** Stable identities. More can be added later without a migration. */
export const INITIAL_BOTS = [
  { code: "SOCIAL_EDITOR", label: "社群小編" },
  { code: "CONTENT_EXPERT", label: "內容專家" },
  { code: "CEO", label: "CEO" },
  { code: "IT", label: "IT" },
] as const;

export const BOT_STATUSES = ["idle", "working", "blocked", "done"] as const;
export type BotStatus = (typeof BOT_STATUSES)[number];
export const BOT_STATUS_LABELS: Record<BotStatus, string> = {
  idle: "待命",
  working: "進行中",
  blocked: "受阻",
  done: "已完成",
};

export const BOT_REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export type BotReviewStatus = (typeof BOT_REVIEW_STATUSES)[number];
export const BOT_REVIEW_LABELS: Record<BotReviewStatus, string> = {
  pending: "待審",
  approved: "通過",
  rejected: "退回",
};

export const BOT_LIMITS = {
  code: 32,
  label: 40,
  summary: 200,
  title: 120,
  body: 4000,
  reason: 500,
  externalRef: 80,
} as const;

export const BOT_PAGE_SIZE = 50;

export interface BotProfileView {
  id: number;
  code: string;
  label: string;
  status: BotStatus;
  summary: string;
  updatedAt: string;
}

export interface BotReviewerView {
  displayName: string | null;
  employeeNo: string | null;
}

export interface BotDraftView {
  id: number;
  botCode: string;
  botLabel: string;
  externalRef: string | null;
  title: string;
  body: string;
  status: BotReviewStatus;
  reason: string | null;
  reviewedAt: string | null;
  reviewer: BotReviewerView | null;
  createdAt: string;
}

export interface BotReportView {
  id: number;
  botCode: string;
  botLabel: string;
  title: string;
  body: string;
  reportedAt: string;
}

export interface BotCompletionView {
  id: number;
  botCode: string;
  botLabel: string;
  title: string;
  detail: string;
  completedAt: string;
}

export interface BotCredentialView {
  configured: boolean;
  createdAt: string | null;
  revokedAt: string | null;
}

export interface BotProgressState {
  bots: BotProfileView[];
  credential: BotCredentialView;
  canManageCredentials: boolean;
}

export interface BotCenterState extends BotProgressState {
  botCode: string | null;
  botStats: Record<string, { todayCompleted: number; draftCounts: Record<BotReviewStatus, number> }>;
  drafts: BotDraftView[];
  draftStatus: BotReviewStatus | "all";
  draftCounts: Record<BotReviewStatus, number>;
  draftsMore: boolean;
  draftNextBefore: number | null;
  reports: BotReportView[];
  reportsMore: boolean;
  reportNextBefore: number | null;
  timeline: BotCompletionView[];
  timelineDate: string;
  timelineMore: boolean;
  timelineNextBefore: string | null;
}

/** Inclusive start and exclusive end of a Taipei calendar day, as UTC ISO timestamps. */
export function taipeiDayRange(day: string): { start: string; end: string } {
  const startMs = Date.parse(`${day}T00:00:00+08:00`);
  return { start: new Date(startMs).toISOString(), end: new Date(startMs + 86_400_000).toISOString() };
}

export function taipeiTodayRange(now = new Date()): { day: string; start: string; end: string } {
  const day = taipeiToday(now);
  return { day, ...taipeiDayRange(day) };
}

import { taipeiToday } from "./erp-query-history";

/** Stable identities. More can be added later without a migration. */
export const INITIAL_BOTS = [
  { code: "SOCIAL_EDITOR", label: "社群小編" },
  { code: "CONTENT_EXPERT", label: "內容專家" },
  { code: "CEO", label: "CEO" },
  { code: "FINANCE", label: "財務會計" },
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

/** Multi-item drafts and review images (V0.15.0, user 2026-11-09). */
export const BOT_DRAFT_KINDS = ["general", "post", "patrol"] as const;
export type BotDraftKind = (typeof BOT_DRAFT_KINDS)[number];
export const BOT_DRAFT_KIND_LABELS: Record<BotDraftKind, string> = { general: "一般", post: "貼文", patrol: "海巡" };
export const BOT_ITEM_LIMITS = { items: 50, title: 120, body: 4000, ref: 80 } as const;
export const BOT_IMAGE_LIMITS = { bytes: 2_097_152, perTarget: 10, types: ["image/jpeg", "image/png", "image/webp"] as const } as const;
export type BotImageType = (typeof BOT_IMAGE_LIMITS.types)[number];

export const BOT_PAGE_SIZE = 50;
export const BOT_WORK_TYPES = ["general", "article_published", "threads_patrol"] as const;
export type BotWorkType = (typeof BOT_WORK_TYPES)[number];

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
  revisionNumber: number;
  previousDraftId: number | null;
  supersededById: number | null;
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
  pushStatus: "queued" | "sending" | "accepted" | "failed" | null;
  kind: BotDraftKind;
  /** Multi-item drafts only: how many items are in each review state. Null for a single draft. */
  itemCounts: { total: number; pending: number; approved: number; rejected: number } | null;
  /** Single draft: when the BOT reported it carried the approved work out. */
  sentAt: string | null;
  imageCount: number;
}

export interface BotDraftItemView {
  id: number;
  seq: number;
  ref: string | null;
  title: string;
  body: string;
  status: BotReviewStatus;
  reason: string | null;
  reviewedAt: string | null;
  sentAt: string | null;
}

export interface BotReviewImageView { id: number; itemId: number | null; contentType: BotImageType; bytes: number }

export interface BotDraftDetail { draft: BotDraftView; items: BotDraftItemView[]; images: BotReviewImageView[] }

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
  workType: BotWorkType;
  eventRef: string | null;
}

export interface BotSentItemSummary {id:number;draftId:number;seq:number;title:string;sentAt:string}
export interface BotSentItemView extends BotSentItemSummary {body:string;draftTitle:string;botCode:string;botLabel:string}
export interface BotSentItemPage<T=BotSentItemView> {day:string;items:T[];more:boolean;nextBefore:string|null}

export interface BotCredentialView {
  botCode: string;
  botLabel: string;
  configured: boolean;
  createdAt: string | null;
  revokedAt: string | null;
}

export interface BotProgressState {
  bots: BotProfileView[];
  credentials: BotCredentialView[];
  canManageCredentials: boolean;
  pushReady: boolean;
  pushSettings: {botCode:string;configured:boolean;enabled:boolean;updatedAt:string|null}[];
}

export interface BotCenterState extends BotProgressState {
  workSummary: {
    /** `reviewed`: legacy field name: post drafts with actual sent_at today (Taipei), newest first; open to read. */
    articles: { count: number; latest: BotCompletionView | null; reviewed: BotDraftView[]; published:BotSentItemPage<BotSentItemSummary> };
    /** count 保留巡視批次 API；主卡用 sentToday 顯示今日實際送出則數，toSend 是尚未退回也尚未送出的海巡則數; `reviewed` is the legacy name for actually sent patrol drafts. */
    patrols: { count: number; latest: BotCompletionView | null; sentToday: number; toSend: number; reviewed: BotDraftView[]; reports:BotCompletionView[] };
    /** Pending drafts, plus the undecided items of multi-item drafts by kind. */
    pending: { count: number; latest: BotDraftView | null; posts: number; patrols: number };
  };
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

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

export const BOT_REVIEW_STATUSES = ["pending", "approved", "rejected", "external"] as const;
export type BotReviewStatus = (typeof BOT_REVIEW_STATUSES)[number];
export const BOT_REVIEW_LABELS: Record<BotReviewStatus, string> = {
  pending: "待審",
  approved: "通過",
  rejected: "退回",
  external: "外部已處理",
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

/** V0.22.0 平台選項：新寫入只收這三種（不分大小寫），以標準寫法保存；既有自由文字照原樣顯示。 */
export const BOT_PLATFORMS = ["FB", "IG", "Threads"] as const;
export type BotPlatform = (typeof BOT_PLATFORMS)[number];
export function canonicalBotPlatform(value: string): BotPlatform | null {
  const lower = value.trim().toLowerCase();
  return BOT_PLATFORMS.find(platform => platform.toLowerCase() === lower) ?? null;
}

/** V0.22.0 拍板事項：BOT 自填類別（1–20 字）、金額（分）、期限、2–5 個選項（每個最多 80 字）。 */
export const BOT_DECISION_LIMITS = { category: 20, options: { min: 2, max: 5, length: 80 } } as const;
export interface BotDecisionView {
  category: string;
  /** 金額以「分」為單位（≥0）；沒有金額為 null。 */
  amount: number | null;
  deadline: string | null;
  options: string[] | null;
  chosenOption: number | null;
  /** 仍待決定、但期限已過：不能再決定。 */
  expired: boolean;
}

export const BOT_PAGE_SIZE = 50;
/** 狀態列：進行中超過此時數沒有回報就提醒。 */
export const BOT_STALE_HOURS = 6;
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
  itemCounts: { total: number; pending: number; approved: number; rejected: number; external?:number } | null;
  /** Single draft: when the BOT reported it carried the approved work out. */
  sentAt: string | null;
  imageCount: number;
  /** 拍板事項才有；一般稿、貼文、海巡為 null。 */
  decision: BotDecisionView | null;
  /** 海巡稿連結的巡視場次（V0.22.0）。 */
  sessionId: number | null;
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

export interface BotSentItemSummary {id:number;draftId:number|null;seq:number|null;title:string;sentAt:string;platform:string}
export interface BotSentItemView extends BotSentItemSummary {body:string;draftTitle:string;botCode:string;botLabel:string;platform:string;url:string;approvalSource:"cyweb"|"chat"|"line"|"other";approvalNote:string;sessionLabel:string}
export interface BotDeliveryDetail {item:BotSentItemView;images:(BotReviewImageView & {deliveryImage?:boolean})[]}
/** 場次狀態（V0.22.0）：pending 待審核、approved 已審核（待 BOT 留言）、done 已完成。 */
export type BotPatrolStatus = "pending" | "approved" | "done";
export const BOT_PATROL_STATUS_LABELS: Record<BotPatrolStatus, string> = { pending: "待審核", approved: "已審核", done: "已完成" };
export interface BotPatrolSummary {id:number;label:string;note:string;sent:number;status:BotPatrolStatus;pendingItems:number;awaitingItems:number;draftIds:number[]}
export interface BotPatrolSessionItem {id:number;draftId:number;seq:number;title:string;body:string;status:BotReviewStatus}
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
    articles: { count: number; published:BotSentItemPage<BotSentItemSummary> };
    /** count 保留巡視批次 API；主卡用 sentToday 顯示今日實際送出則數，toSend 是尚未退回也尚未送出的海巡則數。 */
    patrols: { count: number; latest: BotCompletionView | null; sentToday: number; toSend: number; reports:BotCompletionView[];sessions:BotPatrolSummary[] };
    /** 待核准（V0.22.0）：只計內容稿（不含拍板），單位為件。patrolItems 為待審的則數。 */
    pending: { count: number; posts: number; patrolDrafts: number; patrolItems: number; other: number };
    /** 拍板結案（V0.22.0）：尚未逾期的待決定事項，最近期限在前，最多 3 筆。 */
    decisions: { count: number; items: { id: number; title: string; deadline: string | null }[] };
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


export interface BotAttentionItem {
  code: string;
  label: string;
  kind: "blocked" | "stale";
  /** 晶片文字：受阻 HH:MM（台北時間）或 N 小時無回報。 */
  text: string;
  summary: string;
  updatedAt: string;
}

/**
 * 頁首 BOT 狀態列（V0.22.0）：只列需要注意的 BOT。blocked 一律列出；working 且最後回報超過 6 小時列出；
 * 其餘不列，只回正常的個數。資料來自既有 /progress，不另外輪詢。
 */
export function botAttention(bots: readonly Pick<BotProfileView, "code" | "label" | "status" | "summary" | "updatedAt">[], nowMs: number): { items: BotAttentionItem[]; normal: number } {
  const items: BotAttentionItem[] = [];
  for (const bot of bots) {
    const updated = Date.parse(bot.updatedAt);
    if (bot.status === "blocked") {
      const clock = Number.isFinite(updated)
        ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(updated))
        : "";
      items.push({ code: bot.code, label: bot.label, kind: "blocked", text: `${bot.label}・受阻${clock ? " " + clock : ""}`, summary: bot.summary, updatedAt: bot.updatedAt });
    } else if (bot.status === "working" && Number.isFinite(updated) && nowMs - updated > BOT_STALE_HOURS * 3_600_000) {
      const hours = Math.floor((nowMs - updated) / 3_600_000);
      items.push({ code: bot.code, label: bot.label, kind: "stale", text: `${bot.label}・${hours} 小時無回報`, summary: bot.summary, updatedAt: bot.updatedAt });
    }
  }
  return { items, normal: bots.length - items.length };
}

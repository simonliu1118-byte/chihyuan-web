import { AuditService } from "../audit/audit-service";
import { requireModuleAccess } from "../auth/guard";
import {
  BOT_LIMITS, BOT_PAGE_SIZE, BOT_REVIEW_STATUSES, BOT_STATUSES, INITIAL_BOTS,
  taipeiTodayRange, type BotCenterState, type BotCompletionView, type BotCredentialView,
  type BotDraftView, type BotProfileView, type BotProgressState, type BotReportView, type BotReviewStatus, type BotStatus,
} from "../../shared/bot-center";
import { identityClient, type IdentityRuntimeEnv } from "./auth-routes";
import { failure, success } from "./response";

class Bad extends Error {
  constructor(readonly code: string, message: string, readonly status = 422) { super(message); }
}

type ProfileRow = { id: number; code: string; label: string; status: BotStatus; summary: string; updated_at: string };
type DraftRow = {
  id: number; code: string; label: string; external_ref: string | null; title: string; body: string;
  review_status: BotReviewStatus; review_reason: string | null; reviewed_at: string | null;
  display_name: string | null; employee_no: string | null; created_at: string;
};
type ReportRow = { id: number; code: string; label: string; title: string; body: string; reported_at: string };
type CompletionRow = { id: number; code: string; label: string; title: string; detail: string; completed_at: string };

const chars = (value: string) => [...value].length;
const text = (value: unknown, name: string, max: number, required = false) => {
  if (value == null) value = "";
  if (typeof value !== "string" || chars(value.trim()) > max) throw new Bad("BOT_INVALID", `${name}不正確`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new Bad("BOT_INVALID", `${name}必填`);
  return trimmed;
};
async function readBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > 64_000) throw new Bad("BOT_INVALID", "資料過大");
  let parsed: unknown;
  try { parsed = raw ? JSON.parse(raw) : {}; } catch { throw new Bad("BOT_INVALID", "請提供有效資料"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Bad("BOT_INVALID", "請提供有效資料");
  return parsed as Record<string, unknown>;
}
const one = <T>(db: D1Database, sql: string, ...args: unknown[]) => db.prepare(sql).bind(...args).first<T>();
const many = async <T>(db: D1Database, sql: string, ...args: unknown[]) =>
  ((await db.prepare(sql).bind(...args).all<T>()).results ?? []) as T[];

async function digestToken(token: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
}
function sameDigest(a: string, b: string): boolean {
  if (a.length !== 64 || b.length !== 64) return false;
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function botCode(value: unknown): string {
  const code = text(value, "BOT 代碼", BOT_LIMITS.code, true).toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(code)) throw new Bad("BOT_INVALID", "BOT 代碼需為大寫英數，可含底線");
  return code;
}
function statusOf(value: unknown): BotStatus {
  if (typeof value !== "string" || !(BOT_STATUSES as readonly string[]).includes(value)) throw new Bad("BOT_INVALID", "進度狀態不正確");
  return value as BotStatus;
}
function completedAtOf(value: unknown, now: string): string {
  if (value == null || value === "") return now;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) throw new Bad("BOT_INVALID", "完成時間不正確");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Bad("BOT_INVALID", "完成時間不正確");
  return parsed.toISOString();
}
function cursor(value: string | null): number {
  if (!value) return 0;
  if (!/^[1-9]\d*$/.test(value)) throw new Bad("BOT_INVALID", "頁面位置不正確");
  const id = Number(value);
  if (!Number.isSafeInteger(id)) throw new Bad("BOT_INVALID", "頁面位置不正確");
  return id;
}
function timelineCursor(value: string | null): { at: string; id: number } | null {
  if (!value) return null;
  const parts = value.split("|");
  if (parts.length !== 2 || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(parts[0]) || !/^[1-9]\d*$/.test(parts[1]))
    throw new Bad("BOT_INVALID", "時間軸頁面位置不正確");
  const id = Number(parts[1]);
  if (!Number.isSafeInteger(id) || !Number.isFinite(Date.parse(parts[0])) || new Date(parts[0]).toISOString() !== parts[0])
    throw new Bad("BOT_INVALID", "時間軸頁面位置不正確");
  return { at: parts[0], id };
}

const profileView = (row: ProfileRow): BotProfileView => ({
  id: row.id, code: row.code, label: row.label, status: row.status, summary: row.summary, updatedAt: row.updated_at,
});
const draftView = (row: DraftRow): BotDraftView => ({
  id: row.id, botCode: row.code, botLabel: row.label, externalRef: row.external_ref, title: row.title, body: row.body,
  status: row.review_status, reason: row.review_reason, reviewedAt: row.reviewed_at, createdAt: row.created_at,
  reviewer: row.reviewed_at ? { displayName: row.display_name, employeeNo: row.employee_no } : null,
});
const reportView = (row: ReportRow): BotReportView => ({
  id: row.id, botCode: row.code, botLabel: row.label, title: row.title, body: row.body, reportedAt: row.reported_at,
});
const completionView = (row: CompletionRow): BotCompletionView => ({
  id: row.id, botCode: row.code, botLabel: row.label, title: row.title, detail: row.detail, completedAt: row.completed_at,
});

const DRAFT_SQL = `SELECT d.id,b.code,b.label,d.external_ref,d.title,d.body,d.review_status,d.review_reason,d.reviewed_at,d.created_at,m.display_name,m.employee_no
 FROM bot_drafts d JOIN bot_profiles b ON b.id=d.bot_id LEFT JOIN app_members m ON m.id=d.reviewed_by`;

async function ensureInitialBots(db: D1Database, now: string): Promise<void> {
  // Read-only when already initialized. Needed after recovery of an older backup.
  const rows = await many<{ code: string }>(db,
    "SELECT code FROM bot_profiles WHERE code IN (?,?,?,?)", ...INITIAL_BOTS.map(bot => bot.code));
  const present = new Set(rows.map(row => row.code));
  const missing = INITIAL_BOTS.filter(bot => !present.has(bot.code));
  if (!missing.length) return;
  await db.batch(missing.map(bot => db.prepare(
    "INSERT OR IGNORE INTO bot_profiles(code,label,status,summary,updated_at) VALUES(?,?,'idle','',?)",
  ).bind(bot.code, bot.label, now)));
}
async function profileByCode(db: D1Database, code: string): Promise<ProfileRow> {
  const row = await one<ProfileRow>(db, "SELECT id,code,label,status,summary,updated_at FROM bot_profiles WHERE code=?", code);
  if (!row) throw new Bad("BOT_NOT_FOUND", "沒有這個 BOT，請先在 BOT 管理中心新增", 404);
  return row;
}
async function draftById(db: D1Database, id: number): Promise<DraftRow> {
  const row = await one<DraftRow>(db, `${DRAFT_SQL} WHERE d.id=?`, id);
  if (!row) throw new Bad("BOT_NOT_FOUND", "找不到這篇審稿", 404);
  return row;
}

async function credential(db: D1Database): Promise<BotCredentialView> {
  const row = await one<{ token_hash: string | null; created_at: string | null; revoked_at: string | null }>(
    db, "SELECT token_hash,created_at,revoked_at FROM bot_ingest_credentials WHERE id=1",
  );
  return { configured: !!row?.token_hash, createdAt: row?.created_at ?? null, revokedAt: row?.revoked_at ?? null };
}

async function progress(db: D1Database, canManageCredentials: boolean): Promise<BotProgressState> {
  const bots = await many<ProfileRow>(db, "SELECT id,code,label,status,summary,updated_at FROM bot_profiles ORDER BY id");
  return { bots: bots.map(profileView), credential: await credential(db), canManageCredentials };
}

async function state(db: D1Database, url: URL, now: string, canManageCredentials: boolean): Promise<BotCenterState> {
  await ensureInitialBots(db, now);
  const requested = url.searchParams.get("draftStatus") ?? "pending";
  if (requested !== "all" && !(BOT_REVIEW_STATUSES as readonly string[]).includes(requested)) throw new Bad("BOT_INVALID", "審稿狀態不正確");
  const draftStatus = requested as BotCenterState["draftStatus"];
  const reportBefore = cursor(url.searchParams.get("reportBefore"));
  const draftBefore = cursor(url.searchParams.get("draftBefore"));
  const timelineBefore = timelineCursor(url.searchParams.get("timelineBefore"));
  const today = taipeiTodayRange(new Date(now));
  const currentProgress = await progress(db, canManageCredentials);
  const requestedBot = url.searchParams.get("botCode");
  const requestedCode = requestedBot === null ? null : botCode(requestedBot);
  const selected = requestedCode === null ? null : currentProgress.bots.find(bot => bot.code === requestedCode);
  if (requestedBot !== null && !selected) throw new Bad("BOT_NOT_FOUND", "沒有這個 BOT", 404);
  const scopedArgs = selected ? [selected.id] : [];
  // Static clauses with bound IDs let the per-BOT indexes serve every page.
  const draftRows = await many<DraftRow>(db, `${DRAFT_SQL} WHERE (?='all' OR d.review_status=?) AND (?=0 OR d.id<?) ${selected ? "AND d.bot_id=?" : ""} ORDER BY d.id DESC LIMIT ?`,
    draftStatus, draftStatus, draftBefore, draftBefore, ...scopedArgs, BOT_PAGE_SIZE + 1);
  const counts = await many<{ bot_id: number; review_status: BotReviewStatus; n: number }>(db,
    "SELECT bot_id,review_status,count(*) n FROM bot_drafts GROUP BY bot_id,review_status");
  const completions = await many<{bot_id:number;n:number}>(db,
    "SELECT bot_id,count(*) n FROM bot_completions WHERE completed_at>=? AND completed_at<? GROUP BY bot_id",today.start,today.end);
  const reportRows = await many<ReportRow>(db, `SELECT r.id,b.code,b.label,r.title,r.body,r.reported_at FROM bot_reports r JOIN bot_profiles b ON b.id=r.bot_id
    WHERE (?=0 OR r.id<?) ${selected ? "AND r.bot_id=?" : ""} ORDER BY r.id DESC LIMIT ?`, reportBefore, reportBefore, ...scopedArgs, BOT_PAGE_SIZE + 1);
  const timelineRows = await many<CompletionRow>(db, `SELECT c.id,b.code,b.label,c.title,c.detail,c.completed_at FROM bot_completions c JOIN bot_profiles b ON b.id=c.bot_id
    WHERE c.completed_at>=? AND c.completed_at<? AND (?='' OR c.completed_at<? OR (c.completed_at=? AND c.id<?))
    ${selected ? "AND c.bot_id=?" : ""} ORDER BY c.completed_at DESC,c.id DESC LIMIT ?`,
    today.start, today.end, timelineBefore?.at ?? "", timelineBefore?.at ?? "", timelineBefore?.at ?? "", timelineBefore?.id ?? 0, ...scopedArgs, BOT_PAGE_SIZE + 1);
  const draftCounts = { pending: 0, approved: 0, rejected: 0 };
  const botStats: BotCenterState["botStats"] = {};
  for (const bot of currentProgress.bots) {
    const totals = {pending:0,approved:0,rejected:0};
    for (const row of counts.filter(row=>row.bot_id===bot.id)) totals[row.review_status]=row.n;
    botStats[bot.code]={todayCompleted:completions.find(row=>row.bot_id===bot.id)?.n??0,draftCounts:totals};
    if (!selected || selected.id===bot.id) for (const status of BOT_REVIEW_STATUSES) draftCounts[status]+=totals[status];
  }
  const visibleDrafts = draftRows.slice(0, BOT_PAGE_SIZE);
  const visibleReports = reportRows.slice(0, BOT_PAGE_SIZE);
  const visibleTimeline = timelineRows.slice(0, BOT_PAGE_SIZE);
  return {
    ...currentProgress,
    botCode: selected?.code ?? null, botStats,
    drafts: visibleDrafts.map(draftView), draftStatus, draftCounts,
    draftsMore: draftRows.length > BOT_PAGE_SIZE,
    draftNextBefore: draftRows.length > BOT_PAGE_SIZE ? visibleDrafts.at(-1)!.id : null,
    reports: visibleReports.map(reportView),
    reportsMore: reportRows.length > BOT_PAGE_SIZE,
    reportNextBefore: reportRows.length > BOT_PAGE_SIZE ? visibleReports.at(-1)!.id : null,
    timeline: visibleTimeline.map(completionView), timelineDate: today.day,
    timelineMore: timelineRows.length > BOT_PAGE_SIZE,
    timelineNextBefore: timelineRows.length > BOT_PAGE_SIZE ? visibleTimeline.at(-1)!.completed_at + "|" + visibleTimeline.at(-1)!.id : null,
  };
}

async function human(request: Request, env: IdentityRuntimeEnv, requestId: string, url: URL): Promise<Response> {
  const provider = identityClient(env);
  if (!provider) return failure({ code: "IDENTITY_UNAVAILABLE", message: "帳號服務暫時無法使用" }, requestId, 503);
  const gate = await requireModuleAccess(provider, env.DB, request, "BOT_CENTER");
  if (!gate.ok) return failure({ code: gate.code, message: "沒有 BOT 管理中心的模組權限" }, requestId, gate.status);
  const db = env.DB;
  const now = new Date().toISOString();
  const actor = gate.member.id;
  const canManageCredentials = gate.principal.workspaceRole === "SUPER_ADMIN";
  const path = url.pathname.replace(/^\/api\/bot-center\/?/, "");
  if ((path === "" || path === "/") && request.method === "GET") return success(await state(db, url, now, canManageCredentials), requestId);
  if (path === "progress" && request.method === "GET") return success(await progress(db, canManageCredentials), requestId);

  if (path === "bots" && request.method === "POST") {
    await ensureInitialBots(db, now);
    const body = await readBody(request);
    const code = botCode(body.code);
    const label = text(body.label, "名稱", BOT_LIMITS.label, true);
    const existing = await one<{ id: number }>(db, "SELECT id FROM bot_profiles WHERE code=?", code);
    if (existing) throw new Bad("BOT_EXISTS", "這個 BOT 代碼已經存在", 409);
    const inserted = await db.prepare(
      "INSERT INTO bot_profiles(code,label,status,summary,updated_at) VALUES(?,?,'idle','',?)",
    ).bind(code, label, now).run();
    const id = Number(inserted.meta.last_row_id);
    await new AuditService(db).prepareRecord({
      entityType: "bot_profile", entityKey: String(id), action: "bot_profile.created",
      actorEmployeeId: actor, requestId, after: { name: label, code },
    }).run();
    const row = await one<ProfileRow>(db, "SELECT id,code,label,status,summary,updated_at FROM bot_profiles WHERE id=?", id);
    return success(profileView(row!), requestId);
  }

  const review = /^drafts\/(\d+)\/review$/.exec(path);
  if (review && request.method === "POST") {
    const id = Number(review[1]);
    const body = await readBody(request);
    if (body.decision !== "approved" && body.decision !== "rejected") throw new Bad("BOT_INVALID", "請選擇通過或退回");
    const decision = body.decision;
    const reason = text(body.reason, "理由", BOT_LIMITS.reason) || null;
    const current = await draftById(db, id);
    if (current.review_status !== "pending") throw new Bad("ALREADY_REVIEWED", "這篇審稿已經有結果", 409);
    // The only write is this review result plus its audit row.
    const [updated] = await db.batch([
      db.prepare("UPDATE bot_drafts SET review_status=?,review_reason=?,reviewed_by=?,reviewed_at=? WHERE id=? AND review_status='pending'")
        .bind(decision, reason, actor, now, id),
      new AuditService(db).prepareRecord({
        entityType: "bot_draft", entityKey: String(id), action: decision === "approved" ? "bot_draft.approved" : "bot_draft.rejected",
        actorEmployeeId: actor, requestId, statusFrom: "pending", statusTo: decision,
        after: { name: current.title, ...(reason ? { reason } : {}) },
      // This must immediately follow the UPDATE in the same atomic batch.
      // A concurrent loser changes zero rows, even when its timestamp matches.
      }, { sql: "changes()=1" }),
    ]);
    if (updated.meta.changes !== 1) throw new Bad("ALREADY_REVIEWED", "這篇審稿已經有結果", 409);
    const saved = await draftById(db, id);
    return success(draftView(saved), requestId);
  }

  if (path === "credentials" && (request.method === "GET" || request.method === "POST" || request.method === "DELETE")) {
    if (request.method !== "GET" && !canManageCredentials)
      return failure({ code: "ACCESS_DENIED", message: "只有超級管理員可以管理 BOT 連線憑證" }, requestId, 403);
    const current = await credential(db);
    if (request.method === "GET") return success(current, requestId);
    if (request.method === "POST") {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const hash = await digestToken(token);
      await db.batch([
        db.prepare(`INSERT INTO bot_ingest_credentials(id,token_hash,created_at,revoked_at,updated_by) VALUES(1,?,?,NULL,?)
          ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at,revoked_at=NULL,updated_by=excluded.updated_by`)
          .bind(hash, now, actor),
        new AuditService(db).prepareRecord({
          entityType: "bot_ingest", entityKey: "primary", action: "bot_ingest.credential_rotated",
          actorEmployeeId: actor, requestId, metadata: { operation: current.configured ? "rotated" : "created" },
        }),
      ]);
      return success({ token, createdAt: now }, requestId);
    }
    await db.batch([
      db.prepare("UPDATE bot_ingest_credentials SET token_hash=NULL,revoked_at=?,updated_by=? WHERE id=1").bind(now, actor),
      new AuditService(db).prepareRecord({
        entityType: "bot_ingest", entityKey: "primary", action: "bot_ingest.credential_revoked",
        actorEmployeeId: actor, requestId,
      }),
    ]);
    return success({ configured: false, revokedAt: now }, requestId);
  }
  return failure({ code: "NOT_FOUND", message: "找不到這個操作" }, requestId, request.method === "GET" || request.method === "POST" || request.method === "DELETE" ? 404 : 405);
}

async function ingestGuard(request: Request, env: IdentityRuntimeEnv, requestId: string): Promise<true | Response> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([\x21-\x7e]{32,256})$/.exec(header);
  if (!match) return failure({ code: "BOT_UNAUTHORIZED", message: "需要有效的 BOT 連線憑證" }, requestId, 401);
  const digest = await digestToken(match[1]);
  const row = await one<{ token_hash: string | null }>(env.DB, "SELECT token_hash FROM bot_ingest_credentials WHERE id=1");
  if (!row?.token_hash || !sameDigest(digest, row.token_hash))
    return failure({ code: "BOT_UNAUTHORIZED", message: "需要有效的 BOT 連線憑證" }, requestId, 401);
  return true;
}

async function saveDraft(db: D1Database, botId: number, externalRef: string | null, title: string, body: string, now: string): Promise<DraftRow> {
  if (externalRef) {
    const existing = await one<{ id: number }>(db, "SELECT id FROM bot_drafts WHERE bot_id=? AND external_ref=?", botId, externalRef);
    if (existing) return draftById(db, existing.id);
  }
  try {
    const inserted = await db.prepare(
      "INSERT INTO bot_drafts(bot_id,external_ref,title,body,created_at) VALUES(?,?,?,?,?)",
    ).bind(botId, externalRef, title, body, now).run();
    return draftById(db, Number(inserted.meta.last_row_id));
  } catch (error) {
    if (externalRef && String(error).includes("UNIQUE")) {
      const existing = await one<{ id: number }>(db, "SELECT id FROM bot_drafts WHERE bot_id=? AND external_ref=?", botId, externalRef);
      if (existing) return draftById(db, existing.id);
    }
    throw error;
  }
}

async function ingest(request: Request, env: IdentityRuntimeEnv, requestId: string, url: URL): Promise<Response> {
  const allowed = await ingestGuard(request, env, requestId);
  if (allowed !== true) return allowed;
  const db = env.DB;
  const now = new Date().toISOString();
  await ensureInitialBots(db, now);
  const path = url.pathname.replace(/^\/api\/bot-ingest\/?/, "");
  if (path === "reports" && request.method === "POST") {
    const body = await readBody(request);
    const bot = await profileByCode(db, botCode(body.botCode));
    const title = text(body.title, "標題", BOT_LIMITS.title, true);
    const report = text(body.body, "內容", BOT_LIMITS.body, true);
    const inserted = await db.prepare("INSERT INTO bot_reports(bot_id,title,body,reported_at) VALUES(?,?,?,?)").bind(bot.id, title, report, now).run();
    const row = await one<ReportRow>(db, `SELECT r.id,b.code,b.label,r.title,r.body,r.reported_at FROM bot_reports r JOIN bot_profiles b ON b.id=r.bot_id WHERE r.id=?`, Number(inserted.meta.last_row_id));
    return success(reportView(row!), requestId);
  }
  if (path === "drafts" && request.method === "POST") {
    const body = await readBody(request);
    const bot = await profileByCode(db, botCode(body.botCode));
    const externalRef = text(body.externalRef, "外部編號", BOT_LIMITS.externalRef) || null;
    const title = text(body.title, "標題", BOT_LIMITS.title, true);
    const draft = text(body.body, "內容", BOT_LIMITS.body, true);
    return success(draftView(await saveDraft(db, bot.id, externalRef, title, draft, now)), requestId);
  }
  if (path === "drafts" && request.method === "GET") {
    const bot = await profileByCode(db, botCode(url.searchParams.get("botCode")));
    const externalRef = text(url.searchParams.get("externalRef"), "外部編號", BOT_LIMITS.externalRef, true);
    const row = await one<DraftRow>(db, `${DRAFT_SQL} WHERE d.bot_id=? AND d.external_ref=?`, bot.id, externalRef);
    if (!row) throw new Bad("BOT_NOT_FOUND", "找不到這篇審稿", 404);
    return success(draftView(row), requestId);
  }
  const draft = /^drafts\/(\d+)$/.exec(path);
  if (draft && request.method === "GET") return success(draftView(await draftById(db, Number(draft[1]))), requestId);
  if (path === "progress" && request.method === "POST") {
    const body = await readBody(request);
    const bot = await profileByCode(db, botCode(body.botCode));
    const status = statusOf(body.status);
    const summary = text(body.summary, "進度", BOT_LIMITS.summary);
    await db.prepare("UPDATE bot_profiles SET status=?,summary=?,updated_at=? WHERE id=?").bind(status, summary, now, bot.id).run();
    const row = await one<ProfileRow>(db, "SELECT id,code,label,status,summary,updated_at FROM bot_profiles WHERE id=?", bot.id);
    return success(profileView(row!), requestId);
  }
  if (path === "completions" && request.method === "POST") {
    const body = await readBody(request);
    const bot = await profileByCode(db, botCode(body.botCode));
    const title = text(body.title, "完成項目", BOT_LIMITS.title, true);
    const detail = text(body.detail, "內容", BOT_LIMITS.body);
    const completedAt = completedAtOf(body.completedAt, now);
    const inserted = await db.prepare("INSERT INTO bot_completions(bot_id,title,detail,completed_at) VALUES(?,?,?,?)").bind(bot.id, title, detail, completedAt).run();
    const row = await one<CompletionRow>(db, `SELECT c.id,b.code,b.label,c.title,c.detail,c.completed_at FROM bot_completions c JOIN bot_profiles b ON b.id=c.bot_id WHERE c.id=?`, Number(inserted.meta.last_row_id));
    return success(completionView(row!), requestId);
  }
  return failure({ code: "NOT_FOUND", message: "找不到這個操作" }, requestId, 404);
}

export async function handleBotCenterRoute(request: Request, env: IdentityRuntimeEnv, requestId: string): Promise<Response | null> {
  const url = new URL(request.url);
  try {
    if (url.pathname.startsWith("/api/bot-ingest/") || url.pathname === "/api/bot-ingest") return await ingest(request, env, requestId, url);
    if (url.pathname.startsWith("/api/bot-center")) return await human(request, env, requestId, url);
    return null;
  } catch (error) {
    if (error instanceof Bad) return failure({ code: error.code, message: error.message }, requestId, error.status);
    return failure({ code: "BOT_UNAVAILABLE", message: "BOT 管理中心暫時無法使用" }, requestId, 500);
  }
}

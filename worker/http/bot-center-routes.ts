import { AuditService } from "../audit/audit-service";
import { requireModuleAccess } from "../auth/guard";
import {
  BOT_DECISION_LIMITS, canonicalBotPlatform, BOT_WORK_TYPES, BOT_LIMITS, BOT_DRAFT_KINDS, BOT_ITEM_LIMITS, BOT_IMAGE_LIMITS,
  type BotDeliveryDetail,type BotPatrolSummary,type BotSentItemSummary,type BotSentItemView,type BotSentItemPage,type BotDraftKind, type BotDraftDetail, type BotDraftItemView, type BotReviewImageView, type BotImageType, BOT_PAGE_SIZE, BOT_REVIEW_STATUSES, BOT_STATUSES, INITIAL_BOTS,
  taipeiTodayRange, type BotCenterState, type BotCompletionView, type BotCredentialView,
  type BotDecisionView, type BotPatrolStatus, type BotPatrolSessionItem, type BotDraftView, type BotProfileView, type BotProgressState, type BotReportView, type BotReviewStatus, type BotStatus, type BotWorkType,
} from "../../shared/bot-center";
import { identityClient, type IdentityRuntimeEnv } from "./auth-routes";
import { failure, success } from "./response";
import {deliverReviewPushes,openPushTarget,pushAvailable,sealPushTarget,PushError,type BotPushEnv} from "../bot/review-push";
type BotEnv = IdentityRuntimeEnv & BotPushEnv & { HR_FILES?: R2Bucket };

class Bad extends Error {
  constructor(readonly code: string, message: string, readonly status = 422) { super(message); }
}

type ProfileRow = { id: number; code: string; label: string; status: BotStatus; summary: string; updated_at: string; push_enabled?:number;push_configured?:number;push_updated_at?:string|null };
type DraftRow = {
  id: number; code: string; label: string; external_ref: string | null; title: string; body: string;
  review_status: BotReviewStatus; review_reason: string | null; reviewed_at: string | null;
  display_name: string | null; employee_no: string | null; created_at: string;bot_id:number;push_status:BotDraftView["pushStatus"];
  revision_number: number; previous_draft_id: number|null; superseded_by_id: number|null;
  kind: BotDraftKind; sent_at: string | null; item_total: number; item_pending: number; item_approved: number; item_rejected: number; image_count: number;
  session_id: number | null; is_decision: number; decision_category: string | null; decision_amount: number | null; decision_deadline: string | null; decision_options: string | null; decision_chosen: number | null;
};
type ReportRow = { id: number; code: string; label: string; title: string; body: string; reported_at: string };
type CompletionRow = { id: number; code: string; label: string; title: string; detail: string; completed_at: string; work_type: BotWorkType; event_ref: string | null };

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
  if (raw.length > 256_000) throw new Bad("BOT_INVALID", "資料過大");
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
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,19)!==value.slice(0,19)) throw new Bad("BOT_INVALID", "完成時間不正確");
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
const optionsOf = (json: string | null): string[] | null => {
  if (!json) return null;
  try { const parsed = JSON.parse(json); return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : null; } catch { return null; }
};
/** 逾期＝仍待決定、期限已過。 */
const decisionView = (row: DraftRow, nowMs = Date.now()): BotDecisionView | null => row.is_decision ? {
  category: row.decision_category ?? "", amount: row.decision_amount ?? null, deadline: row.decision_deadline ?? null,
  options: optionsOf(row.decision_options), chosenOption: row.decision_chosen ?? null,
  expired: row.review_status === "pending" && row.decision_deadline != null && Date.parse(row.decision_deadline) <= nowMs,
} : null;
const draftView = (row: DraftRow): BotDraftView => ({
  decision: decisionView(row), sessionId: row.session_id ?? null,
  revisionNumber: row.revision_number ?? 1, previousDraftId: row.previous_draft_id ?? null, supersededById: row.superseded_by_id ?? null,
  id: row.id, botCode: row.code, botLabel: row.label, externalRef: row.external_ref, title: row.title, body: row.body,
  status: row.review_status, reason: row.review_reason, reviewedAt: row.reviewed_at, createdAt: row.created_at,
  reviewer: row.reviewed_at ? { displayName: row.display_name, employeeNo: row.employee_no } : null,
  pushStatus:row.push_status, kind: row.kind ?? "general", sentAt: row.sent_at ?? null, imageCount: row.image_count ?? 0,
  itemCounts: row.item_total ? { total: row.item_total, pending: row.item_pending, approved: row.item_approved, rejected: row.item_rejected, ...(row.item_total>row.item_pending+row.item_approved+row.item_rejected?{external:row.item_total-row.item_pending-row.item_approved-row.item_rejected}:{}) } : null,
});
const reportView = (row: ReportRow): BotReportView => ({
  id: row.id, botCode: row.code, botLabel: row.label, title: row.title, body: row.body, reportedAt: row.reported_at,
});
const completionView = (row: CompletionRow): BotCompletionView => ({
  id: row.id, botCode: row.code, botLabel: row.label, title: row.title, detail: row.detail, completedAt: row.completed_at, workType: row.work_type, eventRef: row.event_ref,
});

const DRAFT_SQL = `SELECT d.id,d.bot_id,b.code,b.label,d.external_ref,d.title,d.body,CASE WHEN d.externally_completed_at IS NOT NULL THEN 'external' ELSE d.review_status END AS review_status,d.review_reason,d.reviewed_at,d.created_at,m.display_name,m.employee_no,p.status AS push_status,
 d.kind,d.sent_at,d.revision_number,d.previous_draft_id,(SELECT newer.id FROM bot_drafts newer WHERE newer.previous_draft_id=d.id) AS superseded_by_id,
 (SELECT count(*) FROM bot_draft_items i WHERE i.draft_id=d.id) AS item_total,
 (SELECT count(*) FROM bot_draft_items i WHERE i.draft_id=d.id AND i.review_status='pending' AND i.externally_completed_at IS NULL) AS item_pending,
 (SELECT count(*) FROM bot_draft_items i WHERE i.draft_id=d.id AND i.review_status='approved') AS item_approved,
 (SELECT count(*) FROM bot_draft_items i WHERE i.draft_id=d.id AND i.review_status='rejected') AS item_rejected,
 (SELECT count(*) FROM bot_review_images g WHERE g.draft_id=d.id) AS image_count,
 d.session_id,(dd.draft_id IS NOT NULL) AS is_decision,dd.category AS decision_category,dd.amount AS decision_amount,dd.deadline_at AS decision_deadline,dd.options_json AS decision_options,dd.chosen_option AS decision_chosen
 FROM bot_drafts d JOIN bot_profiles b ON b.id=d.bot_id LEFT JOIN app_members m ON m.id=d.reviewed_by LEFT JOIN bot_review_push_outbox p ON p.draft_id=d.id LEFT JOIN bot_draft_decisions dd ON dd.draft_id=d.id`;

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
  if (!row) throw new Bad("BOT_NOT_FOUND", "沒有這個 BOT，請聯絡管理員", 404);
  return row;
}
async function draftById(db: D1Database, id: number, owner?: number): Promise<DraftRow> {
  const row = await one<DraftRow>(db, `${DRAFT_SQL} WHERE d.id=?${owner === undefined ? "" : " AND d.bot_id=?"}`, id, ...(owner === undefined ? [] : [owner]));
  if (!row) throw new Bad("BOT_NOT_FOUND", "找不到這篇審稿", 404);
  return row;
}

type ItemRow = { id: number; seq: number; ref: string | null; title: string; body: string; review_status: BotReviewStatus; review_reason: string | null; reviewed_at: string | null; sent_at: string | null };
const itemView = (row: ItemRow): BotDraftItemView => ({ id: row.id, seq: row.seq, ref: row.ref, title: row.title, body: row.body, status: row.review_status, reason: row.review_reason, reviewedAt: row.reviewed_at, sentAt: row.sent_at });
async function draftDetail(db: D1Database, id: number, owner?: number): Promise<BotDraftDetail> {
  const draft = await draftById(db, id, owner);
  const items = await many<ItemRow>(db, "SELECT id,seq,ref,title,body,CASE WHEN externally_completed_at IS NOT NULL THEN 'external' ELSE review_status END AS review_status,review_reason,reviewed_at,sent_at FROM bot_draft_items WHERE draft_id=? ORDER BY seq", id);
  const images = await many<{ id: number; item_id: number | null; content_type: BotImageType; bytes: number }>(db, "SELECT id,item_id,content_type,bytes FROM bot_review_images WHERE draft_id=? ORDER BY id", id);
  return { draft: draftView(draft), items: items.map(itemView), images: images.map((row): BotReviewImageView => ({ id: row.id, itemId: row.item_id, contentType: row.content_type, bytes: row.bytes })) };
}
/**
 * A multi-item draft finishes when no item is pending: 通過 if any item passed (部分通過 when some were
 * rejected), otherwise 退回. Same atomic batch as the decision, then the optional push (V0.15.0).
 */
function finishDraftStatements(db: D1Database, id: number, actor: number, now: string, notify: boolean): D1PreparedStatement[] {
  return [
    db.prepare(`UPDATE bot_drafts SET review_status=CASE WHEN EXISTS(SELECT 1 FROM bot_draft_items WHERE draft_id=?1 AND review_status='approved') THEN 'approved' ELSE 'rejected' END,
      review_reason=CASE WHEN EXISTS(SELECT 1 FROM bot_draft_items WHERE draft_id=?1 AND review_status='approved') THEN
        CASE WHEN EXISTS(SELECT 1 FROM bot_draft_items WHERE draft_id=?1 AND review_status='rejected') THEN '部分通過' ELSE NULL END ELSE '全部退回' END,
      reviewed_by=?2,reviewed_at=?3 WHERE id=?1 AND review_status='pending' AND externally_completed_at IS NULL AND NOT EXISTS(SELECT 1 FROM bot_drafts newer WHERE newer.previous_draft_id=bot_drafts.id) AND NOT EXISTS(SELECT 1 FROM bot_draft_items WHERE draft_id=?1 AND review_status='pending' AND externally_completed_at IS NULL)`).bind(id, actor, now),
    ...(notify ? [db.prepare("INSERT INTO bot_review_push_outbox(draft_id,next_attempt_at,created_at,updated_at) SELECT ?,?,?,? WHERE changes()=1 ON CONFLICT DO NOTHING").bind(id, now, now, now)] : []),
  ];
}
function imageTypeOf(bytes: Uint8Array, declared: string | null): BotImageType {
  const type = (declared ?? "").split(";")[0].trim().toLowerCase();
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (type === "image/jpeg" && jpeg) return type;
  if (type === "image/png" && png) return type;
  if (type === "image/webp" && webp) return type;
  throw new Bad("BOT_IMAGE_INVALID", "圖片需為 JPEG、PNG 或 WebP，且內容與類型相符");
}

type CredentialRow = { bot_id: number; configured: number; created_at: string | null; revoked_at: string | null };
const credentialView = (bot: ProfileRow, row?: CredentialRow): BotCredentialView => ({
  botCode: bot.code, botLabel: bot.label, configured: !!row?.configured,
  createdAt: row?.created_at ?? null, revokedAt: row?.revoked_at ?? null,
});
const CREDENTIAL_SQL = "SELECT bot_id,(token_hash IS NOT NULL AND revoked_at IS NULL) AS configured,created_at,revoked_at FROM bot_ingest_credentials";
async function credential(db: D1Database, bot: ProfileRow): Promise<BotCredentialView> {
  const row = await one<CredentialRow>(db, CREDENTIAL_SQL + " WHERE bot_id=?", bot.id);
  return credentialView(bot, row ?? undefined);
}
async function progress(db: D1Database, canManageCredentials: boolean, ready:boolean): Promise<BotProgressState> {
  const bots = await many<ProfileRow>(db, "SELECT b.id,b.code,b.label,b.status,b.summary,b.updated_at,p.enabled AS push_enabled,(p.encrypted_target IS NOT NULL) AS push_configured,p.updated_at AS push_updated_at FROM bot_profiles b LEFT JOIN bot_review_push_settings p ON p.bot_id=b.id ORDER BY b.id");
  const rows = await many<CredentialRow>(db, CREDENTIAL_SQL);
  return { bots: bots.map(profileView), credentials: bots.map(bot => credentialView(bot, rows.find(row => row.bot_id === bot.id))), canManageCredentials,pushReady:ready,
    pushSettings:bots.map(bot=>({botCode:bot.code,configured:!!bot.push_configured,enabled:!!bot.push_enabled,updatedAt:bot.push_updated_at??null})) };
}
const COMPLETION_SQL = "SELECT c.id,b.code,b.label,c.title,c.detail,c.completed_at,c.work_type,c.event_ref FROM bot_completions c JOIN bot_profiles b ON b.id=c.bot_id";

type DeliveryRow={id:number;bot_id:number;event_ref:string;kind:"post"|"patrol";title:string;body:string;sent_at:string;platform:string;publication_url:string;approval_source:BotSentItemView["approvalSource"];approval_note:string;draft_id:number|null;item_id:number|null;session_id:number|null;seq:number|null;draft_title:string|null;code:string;label:string;session_label:string|null};
const DELIVERY_SQL=`SELECT x.*,i.seq,d.title AS draft_title,b.code,b.label,s.label AS session_label FROM bot_deliveries x
 JOIN bot_profiles b ON b.id=x.bot_id LEFT JOIN bot_drafts d ON d.id=x.draft_id
 LEFT JOIN bot_draft_items i ON i.id=x.item_id LEFT JOIN bot_patrol_sessions s ON s.id=x.session_id`;
const deliveryView=(r:DeliveryRow):BotSentItemView=>({id:r.id,draftId:r.draft_id,seq:r.seq,title:r.title,body:r.body,sentAt:r.sent_at,
 draftTitle:r.draft_title??"",botCode:r.code,botLabel:r.label,platform:r.platform,url:r.publication_url,approvalSource:r.approval_source,approvalNote:r.approval_note,sessionLabel:r.session_label??""});
async function deliveryDetail(db:D1Database,id:number,owner?:number):Promise<BotDeliveryDetail>{
 const row=await one<DeliveryRow>(db,DELIVERY_SQL+" WHERE x.id=?"+(owner===undefined?"":" AND x.bot_id=?"),id,...(owner===undefined?[]:[owner]));
 if(!row)throw new Bad("BOT_NOT_FOUND","找不到這筆發布紀錄",404);
 const images=await many<{id:number;content_type:BotImageType;bytes:number}>(db,"SELECT id,content_type,bytes FROM bot_delivery_images WHERE delivery_id=? ORDER BY id",id);
 const reviewImages=row.draft_id?await many<{id:number;item_id:number|null;content_type:BotImageType;bytes:number}>(db,
  "SELECT id,item_id,content_type,bytes FROM bot_review_images WHERE draft_id=? AND (item_id=? OR item_id IS NULL AND (SELECT count(*) FROM bot_draft_items WHERE draft_id=?)<=1) ORDER BY id",row.draft_id,row.item_id,row.draft_id):[];
 return {item:deliveryView(row),images:[...reviewImages.map(g=>({id:g.id,itemId:g.item_id,contentType:g.content_type,bytes:g.bytes})),...images.map(g=>({id:g.id,itemId:null,contentType:g.content_type,bytes:g.bytes,deliveryImage:true}))]};
}
async function sentItemsPage(db:D1Database,kind:"post"|"patrol",now:string,before:string|null,selectedId?:number,summaryOnly=false,sessionId?:number):Promise<BotSentItemPage<BotSentItemSummary|BotSentItemView>>{
 const today=taipeiTodayRange(new Date(now)),position=timelineCursor(before);
 const fields=summaryOnly?"SELECT x.id,x.draft_id,i.seq,x.title,x.sent_at,x.platform FROM bot_deliveries x LEFT JOIN bot_draft_items i ON i.id=x.item_id":DELIVERY_SQL;
 // sessionId 0 = 尚未歸入場次的舊成果；其他為場次編號。
 const sessionClause=sessionId===undefined?"":sessionId===0?"AND x.session_id IS NULL":"AND x.session_id=?";
 const rows=await many<DeliveryRow>(db,fields+` WHERE x.kind=? AND x.sent_at>=? AND x.sent_at<?
 AND (?='' OR x.sent_at<? OR (x.sent_at=? AND x.id<?)) ${selectedId===undefined?"":"AND x.bot_id=?"} ${sessionClause}
 ORDER BY x.sent_at DESC,x.id DESC LIMIT ?`,kind,today.start,today.end,position?.at??"",position?.at??"",position?.at??"",position?.id??0,...(selectedId===undefined?[]:[selectedId]),...(sessionId?[sessionId]:[]),BOT_PAGE_SIZE+1);
 const visible=rows.slice(0,BOT_PAGE_SIZE),last=visible.at(-1),more=rows.length>BOT_PAGE_SIZE;
 return {day:today.day,more,nextBefore:more&&last?last.sent_at+"|"+last.id:null,items:visible.map(r=>summaryOnly?{id:r.id,draftId:r.draft_id,seq:r.seq,title:r.title,sentAt:r.sent_at,platform:r.platform}:deliveryView(r))};
}
async function deliveryCount(db:D1Database,kind:string,start:string,end:string,owner?:number){
 return (await one<{n:number}>(db,`SELECT count(*) n FROM bot_deliveries WHERE kind=? AND sent_at>=? AND sent_at<? ${owner===undefined?"":"AND bot_id=?"}`,kind,start,end,...(owner===undefined?[]:[owner])))?.n??0;
}
/**
 * 場次狀態（V0.22.0）：連結的稿件有待審的則 → 待審核；否則有已通過但還沒有送出成果的則、且場次未被 BOT 明確結束 → 已審核；
 * 其餘 → 已完成。沒有連結稿件的舊場次：有送出成果才算已完成（沒有成果也沒有明確結束的空場次不列）。
 */
function patrolStatus(pending:number,awaiting:number,completed:boolean):BotPatrolStatus{
 return pending>0?"pending":awaiting>0&&!completed?"approved":"done";
}
async function patrolSummaries(db:D1Database,day:string,start:string,end:string,owner?:number):Promise<BotPatrolSummary[]>{
 // One row per declared session; counts come from the same delivery ledger as the clickable N.
 const sessions=await many<{id:number;label:string;note:string;completed_at:string|null;sent:number}>(db,`SELECT s.id,s.label,s.note,s.completed_at,(SELECT count(*) FROM bot_deliveries x WHERE x.session_id=s.id AND x.sent_at>=? AND x.sent_at<?) sent
 FROM bot_patrol_sessions s WHERE s.day=? ${owner===undefined?"":"AND s.bot_id=?"} ORDER BY s.updated_at DESC,s.id DESC LIMIT ?`,start,end,day,...(owner===undefined?[]:[owner]),BOT_PAGE_SIZE);
 // 連結稿件的待審／待送則數：只看最新版，依 idx_bot_drafts_session 以場次編號取稿。
 const linked=sessions.length?await many<{session_id:number;draft_id:number;pending:number;awaiting:number}>(db,`SELECT d.session_id,d.id AS draft_id,
  (SELECT count(*) FROM bot_draft_items i WHERE i.draft_id=d.id AND i.review_status='pending' AND i.externally_completed_at IS NULL) AS pending,
  (SELECT count(*) FROM bot_draft_items i WHERE i.draft_id=d.id AND i.review_status='approved' AND NOT EXISTS(SELECT 1 FROM bot_deliveries x WHERE x.item_id=i.id)) AS awaiting
  FROM bot_drafts d WHERE d.session_id IN(SELECT value FROM json_each(?)) AND NOT EXISTS(SELECT 1 FROM bot_drafts newer WHERE newer.previous_draft_id=d.id) ORDER BY d.id`,JSON.stringify(sessions.map(x=>x.id))):[];
 const rows:BotPatrolSummary[]=[];
 for(const s of sessions){
  const mine=linked.filter(x=>x.session_id===s.id),pending=mine.reduce((n,x)=>n+x.pending,0),awaiting=mine.reduce((n,x)=>n+x.awaiting,0);
  if(!mine.length&&!s.sent&&!s.completed_at)continue;
  rows.push({id:s.id,label:s.label,note:s.note,sent:s.sent,status:patrolStatus(pending,awaiting,!!s.completed_at),pendingItems:pending,awaitingItems:awaiting,draftIds:mine.map(x=>x.draft_id)});
 }
 const unassigned=await one<{n:number}>(db,`SELECT count(*) n FROM bot_deliveries WHERE kind='patrol' AND session_id IS NULL AND sent_at>=? AND sent_at<? ${owner===undefined?"":"AND bot_id=?"}`,start,end,...(owner===undefined?[]:[owner]));
 if(unassigned?.n)rows.push({id:0,label:"",note:"",sent:unassigned.n,status:"done",pendingItems:0,awaitingItems:0,draftIds:[]});
 return rows;
}
function publicationUrl(value:unknown):string{
 const raw=text(value,"發布連結",2048);if(!raw)return "";
 let url:URL;try{url=new URL(raw)}catch{throw new Bad("BOT_INVALID","發布連結不正確")}
 if(url.protocol!=="https:"||url.username||url.password)throw new Bad("BOT_INVALID","發布連結需為 HTTPS");
 return url.href;
}
async function patrolSession(db:D1Database,botId:number,body:Record<string,unknown>,now:string){
 const ref=text(body.sessionRef,"巡視固定編號",120,true),label=text(body.label,"巡視名稱",12,true),note=text(body.note,"巡視摘要",40);
 if(body.completed!==undefined&&body.completed!==true&&body.completed!==false)throw new Bad("BOT_INVALID","completed 須為 true 或 false");
 const completed=body.completed===true?1:0;
 const day=body.day??taipeiTodayRange(new Date(now)).day;
 if(typeof day!=="string"||!/^\d{4}-\d\d-\d\d$/.test(day)||!Number.isFinite(Date.parse(day+"T00:00:00Z"))||new Date(day+"T00:00:00Z").toISOString().slice(0,10)!==day)throw new Bad("BOT_INVALID","巡視日期不正確");
 // completed:true 只在第一次記下結束時間；不傳或 false 不會重新開啟，也不會改動已有的結束時間。
 await db.prepare(`INSERT INTO bot_patrol_sessions(bot_id,session_ref,day,label,note,updated_at,completed_at) VALUES(?,?,?,?,?,?,CASE WHEN ?=1 THEN ? ELSE NULL END)
 ON CONFLICT(bot_id,session_ref) DO UPDATE SET label=excluded.label,note=excluded.note,updated_at=excluded.updated_at,completed_at=CASE WHEN ?=1 THEN COALESCE(bot_patrol_sessions.completed_at,excluded.updated_at) ELSE bot_patrol_sessions.completed_at END WHERE day=excluded.day`).bind(botId,ref,day,label,note,now,completed,now,completed).run();
 const saved=await one<{id:number;day:string;completed_at:string|null}>(db,"SELECT id,day,completed_at FROM bot_patrol_sessions WHERE bot_id=? AND session_ref=?",botId,ref);
 if(saved?.day!==day)throw new Bad("BOT_EVENT_CONFLICT","同一巡視編號不能改日期",409);
 return {id:saved.id,sessionRef:ref,day,label,note,completed:!!saved.completed_at,completedAt:saved.completed_at};
}
/** Immutable actual-work receipt. External approval is provenance, never a CYWEB review decision. */
async function saveDelivery(db:D1Database,bot:ProfileRow,body:Record<string,unknown>,now:string){
 const ref=text(body.eventRef,"成果固定編號",120,true),kind=body.kind,source=body.approvalSource;
 if(kind!=="post"&&kind!=="patrol"||!["cyweb","chat","line","other"].includes(String(source)))throw new Bad("BOT_INVALID","成果分類或核准來源不正確");
 const note=text(body.approvalNote,"核准來源說明",200,source!=="cyweb"),url=publicationUrl(body.url);
 // V0.22.0：新寫入的平台只收 FB／IG／Threads（不分大小寫），以標準寫法保存；留空維持未填。
 const rawPlatform=text(body.platform,"平台",40),platform=rawPlatform===""?"":canonicalBotPlatform(rawPlatform)??"";
 if(rawPlatform!==""&&!platform)throw new Bad("BOT_INVALID","平台須為 FB、IG 或 Threads",400);
 let target:DraftRow|null=null,item:ItemRow|null=null;
 if(body.draftId!==undefined){
  if(!Number.isSafeInteger(body.draftId)||Number(body.draftId)<1)throw new Bad("BOT_INVALID","稿件編號不正確");
  target=await draftById(db,Number(body.draftId),bot.id);
  if(target.superseded_by_id)throw new Bad("BOT_SUPERSEDED","此稿已有新版",409);
  if(target.kind!==kind&&target.kind!=="general")throw new Bad("BOT_INVALID","稿件分類不相符");
  if(target.item_total){
   if(!Number.isSafeInteger(body.itemSeq)||Number(body.itemSeq)<1)throw new Bad("BOT_INVALID","請指定成果對應的則號");
   item=await one<ItemRow>(db,"SELECT id,seq,title,body,review_status,sent_at FROM bot_draft_items WHERE draft_id=? AND seq=?",target.id,body.itemSeq);
   if(!item)throw new Bad("BOT_NOT_FOUND","找不到這一則",404);
  }else if(body.itemSeq!==undefined)throw new Bad("BOT_INVALID","單篇稿件不帶則號");
 }else if(body.itemSeq!==undefined)throw new Bad("BOT_INVALID","請指定稿件");
 if(source==="cyweb"&&(!target||(item?.review_status??target.review_status)!=="approved"))throw new Bad("BOT_NOT_APPROVED","請連結 CYWEB 已通過的稿件或則號",409);
 const title=text(body.title??item?.title??target?.title,"標題",120,true),content=text(body.body??item?.body??target?.body,"內容",4000,true);
 if(source==="cyweb"&&(title!==(item?.title??target?.title)||content!==(item?.body??target?.body)))throw new Bad("BOT_INVALID","CYWEB 核准成果內容須與原稿相同");
 // A stable source is also a dedup key, so old sent and new delivery commands cannot count twice.
 const existing=await one<DeliveryRow>(db,"SELECT * FROM bot_deliveries WHERE bot_id=? AND (event_ref=? OR (? IS NOT NULL AND draft_id=? AND item_id IS ?))",bot.id,ref,target?.id??null,target?.id??null,item?.id??null);
 const at=body.sentAt===undefined?(existing?.sent_at??now):completedAtOf(body.sentAt,now);
 if(Date.parse(at)>Date.parse(now)+300000)throw new Bad("BOT_INVALID","送出時間不能在未來");
 let sessionId:number|null=null;
 if(body.sessionRef!==undefined){
  const session=await one<{id:number;day:string}>(db,"SELECT id,day FROM bot_patrol_sessions WHERE bot_id=? AND session_ref=?",bot.id,text(body.sessionRef,"巡視固定編號",120,true));
  if(kind!=="patrol"||!session||session.day!==taipeiTodayRange(new Date(at)).day)throw new Bad("BOT_INVALID","請先登錄同日的巡視場次");
  sessionId=session.id;
 }else if(kind==="patrol")throw new Bad("BOT_INVALID","海巡成果須指定巡視場次");
 const matches=(r:DeliveryRow)=>r.kind===kind&&r.title===title&&r.body===content&&r.sent_at===at&&r.approval_source===source&&r.approval_note===note&&r.platform===platform&&r.publication_url===url&&r.draft_id===(target?.id??null)&&r.item_id===(item?.id??null)&&r.session_id===sessionId;
 if(existing&&existing.event_ref==='legacy-item-'+existing.item_id&&source==='cyweb'&&existing.kind===kind&&existing.title===title&&existing.body===content&&existing.sent_at===at&&existing.draft_id===(target?.id??null)&&existing.item_id===(item?.id??null)){
  await db.prepare("UPDATE OR IGNORE bot_deliveries SET event_ref=?,platform=?,publication_url=?,session_id=?,approval_note=? WHERE id=? AND event_ref=?").bind(ref,platform,url,sessionId,note,existing.id,existing.event_ref).run();
  const upgraded=await one<DeliveryRow>(db,"SELECT * FROM bot_deliveries WHERE id=?",existing.id);
  if(!upgraded||upgraded.event_ref!==ref||!matches(upgraded))throw new Bad("BOT_EVENT_CONFLICT","成果已被其他回報更新，請核對原紀錄",409);
  return {id:existing.id,botCode:bot.code,eventRef:ref,duplicate:true};
 }
 if(existing){if(!matches(existing))throw new Bad("BOT_EVENT_CONFLICT","這筆成果已有不同內容，請核對原紀錄",409);return {id:existing.id,botCode:bot.code,eventRef:ref,duplicate:true}}
 const writeKey=crypto.randomUUID();
 const statements=[db.prepare(`INSERT INTO bot_deliveries(bot_id,event_ref,write_key,kind,title,body,sent_at,platform,publication_url,approval_source,approval_note,draft_id,item_id,session_id)
 SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ? IS NULL OR NOT EXISTS(SELECT 1 FROM bot_drafts WHERE previous_draft_id=?) ON CONFLICT DO NOTHING`).bind(bot.id,ref,writeKey,kind,title,content,at,platform,url,source,note,target?.id??null,item?.id??null,sessionId,target?.id??null,target?.id??null)];
 // Only a winning receipt resolves matching pending work; original reviewer/decision is unchanged.
 if(target){
  if(item)statements.push(db.prepare(`UPDATE bot_draft_items SET sent_at=CASE WHEN review_status='approved' THEN COALESCE(sent_at,?) ELSE sent_at END,externally_completed_at=CASE WHEN ?<>'cyweb' AND review_status='pending' THEN COALESCE(externally_completed_at,?) ELSE externally_completed_at END
   WHERE id=? AND EXISTS(SELECT 1 FROM bot_deliveries WHERE bot_id=? AND write_key=?)`).bind(at,source,now,item.id,bot.id,writeKey));
  statements.push(db.prepare(`UPDATE bot_drafts SET sent_at=CASE WHEN ? IS NULL THEN COALESCE(sent_at,?) ELSE sent_at END,
   externally_completed_at=CASE WHEN ?<>'cyweb' AND review_status='pending' AND NOT EXISTS(SELECT 1 FROM bot_draft_items WHERE draft_id=bot_drafts.id AND review_status='pending' AND externally_completed_at IS NULL) THEN COALESCE(externally_completed_at,?) ELSE externally_completed_at END
   WHERE id=? AND EXISTS(SELECT 1 FROM bot_deliveries WHERE bot_id=? AND write_key=?)`).bind(item?.id??null,at,source,now,target.id,bot.id,writeKey));
 }
 statements.push(db.prepare(`INSERT INTO bot_completions(bot_id,title,detail,completed_at,work_type,event_ref)
 SELECT bot_id,title,'',sent_at,CASE kind WHEN 'post' THEN 'article_published' ELSE 'general' END,'delivery:'||id FROM bot_deliveries WHERE bot_id=? AND write_key=? ON CONFLICT DO NOTHING`).bind(bot.id,writeKey));
 await db.batch(statements);
 const saved=await one<DeliveryRow>(db,"SELECT * FROM bot_deliveries WHERE bot_id=? AND event_ref=?",bot.id,ref);
 if(!saved||!matches(saved))throw new Bad("BOT_EVENT_CONFLICT","成果重複或原稿已有新版，請核對原紀錄",409);
 return {id:saved.id,botCode:bot.code,eventRef:ref,duplicate:false};
}

async function state(db: D1Database, url: URL, now: string, canManageCredentials: boolean,ready:boolean): Promise<BotCenterState> {
  await ensureInitialBots(db, now);
  const requested = url.searchParams.get("draftStatus") ?? "pending";
  if (requested !== "all" && !(BOT_REVIEW_STATUSES as readonly string[]).includes(requested)) throw new Bad("BOT_INVALID", "審稿狀態不正確");
  const draftStatus = requested as BotCenterState["draftStatus"];
  const reportBefore = cursor(url.searchParams.get("reportBefore"));
  const draftBefore = cursor(url.searchParams.get("draftBefore"));
  const timelineBefore = timelineCursor(url.searchParams.get("timelineBefore"));
  const today = taipeiTodayRange(new Date(now));
  const currentProgress = await progress(db, canManageCredentials,ready);
  const requestedBot = url.searchParams.get("botCode");
  const requestedCode = requestedBot === null ? null : botCode(requestedBot);
  const selected = requestedCode === null ? null : currentProgress.bots.find(bot => bot.code === requestedCode);
  if (requestedBot !== null && !selected) throw new Bad("BOT_NOT_FOUND", "沒有這個 BOT", 404);
  const scopedArgs = selected ? [selected.id] : [];
  // Static clauses with bound IDs let the per-BOT indexes serve every page.
  // 待審檢視：拍板事項另外取、固定排在最前（期限近到遠，沒有期限的在後），其餘內容稿照原順序分頁。
  const draftRows = await many<DraftRow>(db, `${DRAFT_SQL} WHERE NOT EXISTS(SELECT 1 FROM bot_drafts newer WHERE newer.previous_draft_id=d.id) AND (?='all' OR (CASE WHEN d.externally_completed_at IS NOT NULL THEN 'external' ELSE d.review_status END)=?) AND (?=0 OR d.id<?) ${draftStatus === "pending" ? "AND dd.draft_id IS NULL" : ""} ${selected ? "AND d.bot_id=?" : ""} ORDER BY d.id DESC LIMIT ?`,
    draftStatus, draftStatus, draftBefore, draftBefore, ...scopedArgs, BOT_PAGE_SIZE + 1);
  const decisionRows = draftStatus === "pending" && draftBefore === 0 ? await many<DraftRow>(db, `${DRAFT_SQL} WHERE d.review_status='pending' AND d.externally_completed_at IS NULL AND dd.draft_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM bot_drafts newer WHERE newer.previous_draft_id=d.id) ${selected ? "AND d.bot_id=?" : ""} ORDER BY dd.deadline_at IS NULL, dd.deadline_at, d.id DESC LIMIT ?`,
    ...scopedArgs, BOT_PAGE_SIZE) : [];
  const counts = await many<{ bot_id: number; review_status: BotReviewStatus; n: number }>(db,
    "SELECT bot_id,CASE WHEN d.externally_completed_at IS NOT NULL THEN 'external' ELSE d.review_status END AS review_status,count(*) n FROM bot_drafts d WHERE NOT EXISTS(SELECT 1 FROM bot_drafts newer WHERE newer.previous_draft_id=d.id) GROUP BY bot_id,(CASE WHEN d.externally_completed_at IS NOT NULL THEN 'external' ELSE d.review_status END)");
  const completions = await many<{bot_id:number;work_type:BotWorkType;n:number}>(db,
    "SELECT bot_id,work_type,count(*) n FROM bot_completions WHERE completed_at>=? AND completed_at<? GROUP BY bot_id,work_type",today.start,today.end);
  const reportRows = await many<ReportRow>(db, `SELECT r.id,b.code,b.label,r.title,r.body,r.reported_at FROM bot_reports r JOIN bot_profiles b ON b.id=r.bot_id
    WHERE (?=0 OR r.id<?) ${selected ? "AND r.bot_id=?" : ""} ORDER BY r.id DESC LIMIT ?`, reportBefore, reportBefore, ...scopedArgs, BOT_PAGE_SIZE + 1);
  const timelineRows = await many<CompletionRow>(db, `${COMPLETION_SQL}
    WHERE c.completed_at>=? AND c.completed_at<? AND (?='' OR c.completed_at<? OR (c.completed_at=? AND c.id<?))
    ${selected ? "AND c.bot_id=?" : ""} ORDER BY c.completed_at DESC,c.id DESC LIMIT ?`,
    today.start, today.end, timelineBefore?.at ?? "", timelineBefore?.at ?? "", timelineBefore?.at ?? "", timelineBefore?.id ?? 0, ...scopedArgs, BOT_PAGE_SIZE + 1);
  const draftCounts = { pending: 0, approved: 0, rejected: 0, external:0 };
  const botStats: BotCenterState["botStats"] = {};
  for (const bot of currentProgress.bots) {
    const totals = {pending:0,approved:0,rejected:0,external:0};
    for (const row of counts.filter(row=>row.bot_id===bot.id)) totals[row.review_status]=row.n;
    botStats[bot.code]={todayCompleted:completions.filter(row=>row.bot_id===bot.id).reduce((sum,row)=>sum+row.n,0),draftCounts:totals};
    if (!selected || selected.id===bot.id) for (const status of BOT_REVIEW_STATUSES) draftCounts[status]+=totals[status];
  }
  const countWork = (type: BotWorkType) => completions.filter(row => row.work_type===type && (!selected || row.bot_id===selected.id)).reduce((sum,row)=>sum+row.n,0);
  // V0.15.0: pending items by kind, patrol daily totals, and today's actually sent drafts per card.
  const scope = "AND NOT EXISTS(SELECT 1 FROM bot_drafts newer WHERE newer.previous_draft_id=d.id)" + (selected ? " AND d.bot_id=?" : "");
  const itemTotals = await one<{patrols:number;to_send:number}>(db, `SELECT
    (SELECT count(*) FROM bot_draft_items i JOIN bot_drafts d ON d.id=i.draft_id WHERE i.review_status='pending' AND i.externally_completed_at IS NULL AND d.kind='patrol' ${scope}) AS patrols,
    (SELECT count(*) FROM bot_draft_items i JOIN bot_drafts d ON d.id=i.draft_id WHERE d.kind='patrol' AND i.review_status IN ('pending','approved') AND i.sent_at IS NULL AND i.externally_completed_at IS NULL ${scope}) AS to_send`,
    ...scopedArgs, ...scopedArgs);
  // 待核准只計內容稿（不含拍板），單位為件；依 idx_bot_drafts_status 只掃待審範圍。
  const pendingScope = "d.review_status='pending' AND d.externally_completed_at IS NULL AND NOT EXISTS(SELECT 1 FROM bot_drafts newer WHERE newer.previous_draft_id=d.id)" + (selected ? " AND d.bot_id=?" : "");
  const contentPending = await one<{posts:number;patrol_drafts:number;other:number}>(db, `SELECT
    (SELECT count(*) FROM bot_drafts d WHERE d.kind='post' AND ${pendingScope}) AS posts,
    (SELECT count(*) FROM bot_drafts d WHERE d.kind='patrol' AND ${pendingScope}) AS patrol_drafts,
    (SELECT count(*) FROM bot_drafts d WHERE d.kind='general' AND NOT EXISTS(SELECT 1 FROM bot_draft_decisions dd WHERE dd.draft_id=d.id) AND ${pendingScope}) AS other`,
    ...scopedArgs, ...scopedArgs, ...scopedArgs);
  // 拍板結案：尚未逾期、等你決定的事項；逾期的仍留在審核表（顯示已逾期）但不能再決定，所以不計入。
  const decisionScope = `FROM bot_drafts d JOIN bot_draft_decisions dd ON dd.draft_id=d.id WHERE ${pendingScope} AND (dd.deadline_at IS NULL OR dd.deadline_at>?)`;
  const decisionCount = await one<{n:number}>(db, `SELECT count(*) n ${decisionScope}`, ...scopedArgs, now);
  const decisionTop = await many<{id:number;title:string;deadline_at:string|null}>(db, `SELECT d.id,d.title,dd.deadline_at ${decisionScope} ORDER BY dd.deadline_at IS NULL, dd.deadline_at, d.id DESC LIMIT 3`, ...scopedArgs, now);
  const patrolReports=await many<CompletionRow>(db,`${COMPLETION_SQL} WHERE c.work_type='threads_patrol' AND c.completed_at>=? AND c.completed_at<? ${selected?"AND c.bot_id=?":""} ORDER BY c.completed_at DESC,c.id DESC LIMIT ?`,today.start,today.end,...scopedArgs,BOT_PAGE_SIZE);
  const workSummary: BotCenterState["workSummary"] = {
    articles: { count: await deliveryCount(db,"post",today.start,today.end,selected?.id), published:await sentItemsPage(db,"post",now,null,selected?.id,true) },
    patrols: { count: countWork("threads_patrol"), latest: patrolReports[0]?completionView(patrolReports[0]):null, sentToday: await deliveryCount(db,"patrol",today.start,today.end,selected?.id), toSend: itemTotals?.to_send ?? 0,reports:patrolReports.map(completionView),sessions:await patrolSummaries(db,today.day,today.start,today.end,selected?.id) },
    pending: { count: (contentPending?.posts ?? 0) + (contentPending?.patrol_drafts ?? 0) + (contentPending?.other ?? 0), posts: contentPending?.posts ?? 0, patrolDrafts: contentPending?.patrol_drafts ?? 0, patrolItems: itemTotals?.patrols ?? 0, other: contentPending?.other ?? 0 },
    decisions: { count: decisionCount?.n ?? 0, items: decisionTop.map(row => ({ id: row.id, title: row.title, deadline: row.deadline_at })) },
  };
  const visibleDrafts = draftRows.slice(0, BOT_PAGE_SIZE);
  const visibleReports = reportRows.slice(0, BOT_PAGE_SIZE);
  const visibleTimeline = timelineRows.slice(0, BOT_PAGE_SIZE);
  return {
    ...currentProgress, workSummary,
    botCode: selected?.code ?? null, botStats,
    drafts: [...decisionRows, ...visibleDrafts].map(draftView), draftStatus, draftCounts,
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

async function human(request: Request, env: BotEnv, requestId: string, url: URL,ctx?:Pick<ExecutionContext,'waitUntil'>): Promise<Response> {
  const provider = identityClient(env);
  if (!provider) return failure({ code: "IDENTITY_UNAVAILABLE", message: "帳號服務暫時無法使用" }, requestId, 503);
  const gate = await requireModuleAccess(provider, env.DB, request, "BOT_CENTER");
  if (!gate.ok) return failure({ code: gate.code, message: "沒有 BOT 管理中心的模組權限" }, requestId, gate.status);
  const db = env.DB;
  const now = new Date().toISOString();
  const actor = gate.member.id;
  const canManageCredentials = gate.principal.workspaceRole === "SUPER_ADMIN";
  const path = url.pathname.replace(/^\/api\/bot-center\/?/, "");
  if ((path === "" || path === "/") && request.method === "GET") return success(await state(db, url, now, canManageCredentials,pushAvailable(env)), requestId);
  if (path === "progress" && request.method === "GET") return success(await progress(db, canManageCredentials,pushAvailable(env)), requestId);

  if(path==="sent-items"&&request.method==="GET"){
    const kind=url.searchParams.get("kind");if(kind!=="post"&&kind!=="patrol")throw new Bad("BOT_INVALID","請選擇貼文或海巡");
    const summary=url.searchParams.get("summary");if(summary!==null&&summary!=="1")throw new Bad("BOT_INVALID","顯示方式不正確");
    const code=url.searchParams.get("botCode"),selected=code===null?undefined:await profileByCode(db,botCode(code));
    const sessionParam=url.searchParams.get("sessionId");
    if(sessionParam!==null&&!/^\d{1,12}$/.test(sessionParam))throw new Bad("BOT_INVALID","場次編號不正確");
    return success(await sentItemsPage(db,kind,now,url.searchParams.get("before"),selected?.id,summary==="1",sessionParam===null?undefined:Number(sessionParam)),requestId);
  }
  // 場次詳情（V0.22.0）：這個場次連結稿件裡「待審」與「已通過但還沒有送出成果」的則；已送出的走 sent-items?sessionId=。
  const sessionItems=/^patrol-sessions\/(\d+)\/items$/.exec(path);
  if(sessionItems&&request.method==="GET"){
    const rows=await many<{id:number;draft_id:number;seq:number;title:string;body:string;review_status:BotReviewStatus}>(db,`SELECT i.id,d.id AS draft_id,i.seq,i.title,i.body,i.review_status
     FROM bot_drafts d JOIN bot_draft_items i ON i.draft_id=d.id WHERE d.session_id=? AND NOT EXISTS(SELECT 1 FROM bot_drafts newer WHERE newer.previous_draft_id=d.id)
     AND ((i.review_status='pending' AND i.externally_completed_at IS NULL) OR (i.review_status='approved' AND NOT EXISTS(SELECT 1 FROM bot_deliveries x WHERE x.item_id=i.id)))
     ORDER BY d.id,i.seq LIMIT ?`,Number(sessionItems[1]),BOT_PAGE_SIZE);
    return success({items:rows.map((r):BotPatrolSessionItem=>({id:r.id,draftId:r.draft_id,seq:r.seq,title:r.title,body:r.body,status:r.review_status}))},requestId);
  }

  const deliveryRoute=/^deliveries\/(\d+)$/.exec(path);
  if(deliveryRoute&&request.method==="GET")return success(await deliveryDetail(db,Number(deliveryRoute[1])),requestId);
  const deliveryImage=/^delivery-images\/(\d+)$/.exec(path);
  if(deliveryImage&&request.method==="GET"){
   const image=await one<{object_key:string;content_type:string}>(db,"SELECT object_key,content_type FROM bot_delivery_images WHERE id=?",Number(deliveryImage[1]));
   const object=image&&env.HR_FILES?await env.HR_FILES.get(image.object_key):null;
   if(!image||!object)throw new Bad("BOT_NOT_FOUND","圖片已刪除或不存在",404);
   return new Response(object.body,{headers:{"content-type":image.content_type,"cache-control":"private, max-age=3600","x-content-type-options":"nosniff","content-security-policy":"default-src 'none'"}});
  }
  const detailRoute = /^drafts\/(\d+)$/.exec(path);
  if (detailRoute && request.method === "GET") return success(await draftDetail(db, Number(detailRoute[1])), requestId);
  const imageRoute = /^images\/(\d+)$/.exec(path);
  if (imageRoute && request.method === "GET") {
    const image = await one<{ object_key: string; content_type: string }>(db, "SELECT object_key,content_type FROM bot_review_images WHERE id=?", Number(imageRoute[1]));
    const object = image && env.HR_FILES ? await env.HR_FILES.get(image.object_key) : null;
    if (!image || !object) return failure({ code: "BOT_NOT_FOUND", message: "圖片已刪除或不存在" }, requestId, 404);
    return new Response(object.body, { headers: { "content-type": image.content_type, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" } });
  }
  const itemReview = /^drafts\/(\d+)\/items\/(\d+)\/review$/.exec(path);
  if (itemReview && request.method === "POST") {
    const id = Number(itemReview[1]), seq = Number(itemReview[2]);
    const body = await readBody(request);
    if (body.decision !== "approved" && body.decision !== "rejected") throw new Bad("BOT_INVALID", "請選擇通過或退回");
    const decision = body.decision;
    const reason = decision === "rejected" ? text(body.reason, "退回理由", BOT_LIMITS.reason, true) : null;
    const current = await draftById(db, id);
    if(current.superseded_by_id)throw new Bad("BOT_SUPERSEDED","此稿已有新版",409);
    if (current.review_status !== "pending") throw new Bad("ALREADY_REVIEWED", "這篇審稿已經有結果", 409);
    const item = await one<ItemRow>(db, "SELECT id,seq,ref,title,body,CASE WHEN externally_completed_at IS NOT NULL THEN 'external' ELSE review_status END AS review_status,review_reason,reviewed_at,sent_at FROM bot_draft_items WHERE draft_id=? AND seq=?", id, seq);
    if (!item) throw new Bad("BOT_NOT_FOUND", "找不到這一則", 404);
    if (item.review_status !== "pending") throw new Bad("ALREADY_REVIEWED", "這一則已經有結果", 409);
    const notify = await one<{ enabled: number }>(db, "SELECT enabled FROM bot_review_push_settings WHERE bot_id=?", current.bot_id);
    const [updated] = await db.batch([
      db.prepare("UPDATE bot_draft_items SET review_status=?,review_reason=?,reviewed_by=?,reviewed_at=? WHERE id=? AND review_status='pending' AND externally_completed_at IS NULL AND NOT EXISTS(SELECT 1 FROM bot_drafts newer WHERE newer.previous_draft_id=bot_draft_items.draft_id)").bind(decision, reason, actor, now, item.id),
      new AuditService(db).prepareRecord({
        entityType: "bot_draft", entityKey: String(id), action: decision === "approved" ? "bot_draft.item_approved" : "bot_draft.item_rejected",
        actorEmployeeId: actor, requestId, after: { name: current.title + "｜" + item.seq + " " + item.title, ...(reason ? { reason } : {}) },
      }, { sql: "changes()=1" }),
      ...finishDraftStatements(db, id, actor, now, notify?.enabled === 1),
    ]);
    if (updated.meta.changes !== 1) throw new Bad("ALREADY_REVIEWED", "這一則已經有結果", 409);
    if (notify?.enabled === 1) ctx?.waitUntil(deliverReviewPushes(env, { draftId: id }).catch(() => undefined));
    return success(await draftDetail(db, id), requestId);
  }

  const review = /^drafts\/(\d+)\/review$/.exec(path);
  if (review && request.method === "POST") {
    const id = Number(review[1]);
    const body = await readBody(request);
    if (body.decision !== "approved" && body.decision !== "rejected") throw new Bad("BOT_INVALID", "請選擇通過或退回");
    const decision = body.decision;
    const reason = decision === "rejected" ? text(body.reason, "退回理由", BOT_LIMITS.reason, true) : null;
    const current = await draftById(db, id);
    if(current.superseded_by_id)throw new Bad("BOT_SUPERSEDED","此稿已有新版",409);
    if (current.review_status !== "pending") throw new Bad("ALREADY_REVIEWED", "這篇審稿已經有結果", 409);
    const notify=await one<{enabled:number}>(db,"SELECT enabled FROM bot_review_push_settings WHERE bot_id=?",current.bot_id);
    if (current.item_total) {
      // Multi-item draft: 全部通過／全部退回 decides every item still pending, then finishes the draft.
      const [items] = await db.batch([
        db.prepare("UPDATE bot_draft_items SET review_status=?,review_reason=?,reviewed_by=?,reviewed_at=? WHERE draft_id=? AND review_status='pending' AND externally_completed_at IS NULL AND NOT EXISTS(SELECT 1 FROM bot_drafts newer WHERE newer.previous_draft_id=bot_draft_items.draft_id)").bind(decision, reason, actor, now, id),
        new AuditService(db).prepareRecord({
          entityType: "bot_draft", entityKey: String(id), action: decision === "approved" ? "bot_draft.approved" : "bot_draft.rejected",
          actorEmployeeId: actor, requestId, statusFrom: "pending", statusTo: decision, after: { name: current.title, ...(reason ? { reason } : {}) },
        }, { sql: "changes()>0" }),
        ...finishDraftStatements(db, id, actor, now, notify?.enabled === 1),
      ]);
      if (items.meta.changes < 1) throw new Bad("ALREADY_REVIEWED", "這篇審稿已經有結果", 409);
      if (notify?.enabled === 1) ctx?.waitUntil(deliverReviewPushes(env, { draftId: id }).catch(() => undefined));
      return success(draftView(await draftById(db, id)), requestId);
    }
    // 拍板事項（V0.22.0）：逾期不能決定；有選項而同意時必須選一個（選項序號從 0 起）。
    let chosen: number | null = null, chosenText: string | undefined;
    if (current.is_decision) {
      const view = decisionView(current)!;
      if (view.expired) throw new Bad("BOT_DECISION_EXPIRED", "這項拍板已逾期，不能再決定", 409);
      if (decision === "approved" && view.options?.length) {
        if (!Number.isSafeInteger(body.choice) || Number(body.choice) < 0 || Number(body.choice) >= view.options.length) throw new Bad("BOT_INVALID", "請選擇一個選項");
        chosen = Number(body.choice); chosenText = view.options[chosen];
      }
    }
    // Commit the review, its audit and optional notification atomically before attempting delivery.
    const batch = await db.batch([
      ...(chosen !== null ? [db.prepare("UPDATE bot_draft_decisions SET chosen_option=? WHERE draft_id=? AND EXISTS(SELECT 1 FROM bot_drafts WHERE id=? AND review_status='pending' AND externally_completed_at IS NULL AND NOT EXISTS(SELECT 1 FROM bot_drafts newer WHERE newer.previous_draft_id=bot_drafts.id))").bind(chosen, id, id)] : []),
      db.prepare("UPDATE bot_drafts SET review_status=?,review_reason=?,reviewed_by=?,reviewed_at=? WHERE id=? AND review_status='pending' AND externally_completed_at IS NULL AND NOT EXISTS(SELECT 1 FROM bot_drafts newer WHERE newer.previous_draft_id=bot_drafts.id)")
        .bind(decision, reason, actor, now, id),
      new AuditService(db).prepareRecord({
        entityType: "bot_draft", entityKey: String(id), action: decision === "approved" ? "bot_draft.approved" : "bot_draft.rejected",
        actorEmployeeId: actor, requestId, statusFrom: "pending", statusTo: decision,
        after: { name: current.title, ...(reason ? { reason } : {}), ...(chosenText ? { choice: chosenText } : {}) },
      // This must immediately follow the UPDATE in the same atomic batch.
      // A concurrent loser changes zero rows, even when its timestamp matches.
      }, { sql: "changes()=1" }),
      ...(notify?.enabled===1?[db.prepare("INSERT INTO bot_review_push_outbox(draft_id,next_attempt_at,created_at,updated_at) SELECT ?,?,?,? WHERE changes()=1 ON CONFLICT DO NOTHING").bind(id,now,now,now)]:[]),
    ]);
    const updated = batch[chosen !== null ? 1 : 0];
    if (updated.meta.changes !== 1) throw new Bad("ALREADY_REVIEWED", "這篇審稿已經有結果", 409);
    if(notify?.enabled===1)ctx?.waitUntil(deliverReviewPushes(env,{draftId:id}).catch(()=>undefined));
    const saved = await draftById(db, id);
    return success(draftView(saved), requestId);
  }

  const pushRoute=/^bots\/([A-Z][A-Z0-9_]{1,31})\/push$/.exec(path);
  if(pushRoute&&request.method==='PUT'){
    if(!canManageCredentials)throw new Bad('ACCESS_DENIED','只有超級管理員可以設定推播',403);
    if(!pushAvailable(env))throw new Bad('PUSH_NOT_READY','推播服務尚未啟用',503);
    const bot=await profileByCode(db,botCode(pushRoute[1])),body=await readBody(request);
    if(typeof body.enabled!=='boolean')throw new Bad('BOT_INVALID','請選擇是否啟用推播');
    const current=await one<{encrypted_target:string|null}>(db,'SELECT encrypted_target FROM bot_review_push_settings WHERE bot_id=?',bot.id);
    const url=text(body.url,'Webhook 網址',2048),key=text(body.key,'Webhook 密鑰',1024);
    let sealed=current?.encrypted_target??null;
    if(url||key){
      const prior=sealed&&(!url||!key)?await openPushTarget(env,bot.id,sealed):null;
      sealed=await sealPushTarget(env,bot.id,{url:url||prior?.url||'',key:key||prior?.key||''});
    }
    if(body.enabled&&!sealed)throw new Bad('BOT_INVALID','請設定 Webhook 網址與密鑰');
    await db.batch([
      db.prepare('INSERT INTO bot_review_push_settings(bot_id,enabled,encrypted_target,updated_at,updated_by) VALUES(?,?,?,?,?) ON CONFLICT(bot_id) DO UPDATE SET enabled=excluded.enabled,encrypted_target=excluded.encrypted_target,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(bot.id,body.enabled?1:0,sealed,now,actor),
      new AuditService(db).prepareRecord({entityType:'bot_review_push',entityKey:bot.code,action:'bot_review_push.configured',actorEmployeeId:actor,requestId,after:{enabled:body.enabled,configured:!!sealed}}),
    ]);
    return success({botCode:bot.code,configured:!!sealed,enabled:body.enabled,updatedAt:now},requestId);
  }
  const retryPush=/^drafts\/(\d+)\/push\/retry$/.exec(path);
  if(retryPush&&request.method==='POST'){
    if(!canManageCredentials)throw new Bad('ACCESS_DENIED','只有超級管理員可以重送推播',403);
    const id=Number(retryPush[1]),draft=await draftById(db,id);
    const enabled=await one<{enabled:number}>(db,'SELECT enabled FROM bot_review_push_settings WHERE bot_id=?',draft.bot_id);
    if(!pushAvailable(env)||enabled?.enabled!==1)throw new Bad('PUSH_NOT_READY','此 BOT 推播尚未啟用',409);
    const result=await db.batch([
      db.prepare("UPDATE bot_review_push_outbox SET status='queued',attempts=0,next_attempt_at=?,lease_token=NULL,lease_until=NULL,last_error_code=NULL,updated_at=? WHERE draft_id=? AND status='failed'").bind(now,now,id),
      new AuditService(db).prepareRecord({entityType:'bot_review_push',entityKey:String(id),action:'bot_review_push.retried',actorEmployeeId:actor,requestId},{sql:'changes()=1'}),
    ]);
    if(result[0].meta.changes!==1)throw new Bad('PUSH_NOT_RETRYABLE','這筆推播目前不需重送',409);
    ctx?.waitUntil(deliverReviewPushes(env,{draftId:id}).catch(()=>undefined));
    return success(draftView(await draftById(db,id)),requestId);
  }
  const credentialRoute = /^bots\/([A-Z][A-Z0-9_]{1,31})\/credential$/.exec(path);
  if (credentialRoute && ["GET","POST","DELETE"].includes(request.method)) {
    if (request.method !== "GET" && !canManageCredentials)
      return failure({code:"ACCESS_DENIED",message:"只有超級管理員可以管理 BOT 連線憑證"},requestId,403);
    await ensureInitialBots(db, now);
    const bot = await profileByCode(db, botCode(credentialRoute[1]));
    if (request.method === "GET") return success(await credential(db, bot), requestId);
    if (request.method === "POST") {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""), hash = await digestToken(token);
      await db.batch([
        db.prepare(`INSERT INTO bot_ingest_credentials(bot_id,token_hash,created_at,revoked_at,updated_by) VALUES(?,?,?,NULL,?)
          ON CONFLICT(bot_id) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at,revoked_at=NULL,updated_by=excluded.updated_by`).bind(bot.id,hash,now,actor),
        new AuditService(db).prepareRecord({entityType:"bot_ingest",entityKey:bot.code,action:"bot_ingest.credential_rotated",actorEmployeeId:actor,requestId,metadata:{botCode:bot.code}}),
      ]);
      return success({token,botCode:bot.code,createdAt:now}, requestId);
    }
    await db.batch([
      db.prepare("UPDATE bot_ingest_credentials SET token_hash=NULL,revoked_at=?,updated_by=? WHERE bot_id=?").bind(now,actor,bot.id),
      new AuditService(db).prepareRecord({entityType:"bot_ingest",entityKey:bot.code,action:"bot_ingest.credential_revoked",actorEmployeeId:actor,requestId,metadata:{botCode:bot.code}}),
    ]);
    return success(await credential(db,bot),requestId);
  }

  return failure({ code: "NOT_FOUND", message: "找不到這個操作" }, requestId, request.method === "GET" || request.method === "POST" || request.method === "DELETE" ? 404 : 405);
}

async function ingestGuard(request: Request, env: IdentityRuntimeEnv, requestId: string): Promise<ProfileRow | Response> {
  const token = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get("Authorization") ?? "")?.[1];
  const denied = () => failure({code:"BOT_UNAUTHORIZED",message:"BOT 連線憑證無效"},requestId,401);
  if (!token) return denied();
  const digest = await digestToken(token);
  const bot = await one<ProfileRow>(env.DB,
    "SELECT b.id,b.code,b.label,b.status,b.summary,b.updated_at FROM bot_ingest_credentials c JOIN bot_profiles b ON b.id=c.bot_id WHERE c.token_hash=? AND c.revoked_at IS NULL",digest);
  return bot ?? denied();
}
function requireBotScope(value: unknown, owner: ProfileRow): void {
  if (value != null && botCode(value) !== owner.code) throw new Bad("BOT_SCOPE_MISMATCH","這組憑證不屬於指定 BOT",403);
}

type ItemInput = { ref: string | null; title: string; body: string };
function itemsOf(value: unknown): ItemInput[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length < 1 || value.length > BOT_ITEM_LIMITS.items) throw new Bad("BOT_INVALID", `多則稿需 1 至 ${BOT_ITEM_LIMITS.items} 則`);
  const items = value.map((raw, i) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Bad("BOT_INVALID", `第 ${i + 1} 則格式不正確`);
    const item = raw as Record<string, unknown>;
    return { ref: text(item.ref, `第 ${i + 1} 則編號`, BOT_ITEM_LIMITS.ref) || null, title: text(item.title, `第 ${i + 1} 則標題`, BOT_ITEM_LIMITS.title, true), body: text(item.body, `第 ${i + 1} 則內容`, BOT_ITEM_LIMITS.body, true) };
  });
  return items;
}
type DecisionInput = { category: string; amount: number | null; deadline: string | null; options: string[] | null };
/** 拍板事項內容的伺服器端驗證（V0.22.0）。錯誤一律 400。 */
function decisionOf(value: unknown): DecisionInput | null {
  if (value === undefined || value === null) return null;
  const invalid = (message: string) => new Bad("BOT_INVALID", message, 400);
  if (typeof value !== "object" || Array.isArray(value)) throw invalid("拍板內容格式不正確");
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some(key => !["category", "amount", "deadline", "options"].includes(key))) throw invalid("拍板內容只能包含 category、amount、deadline、options");
  const category = typeof raw.category === "string" ? raw.category.trim() : "";
  if (!category || chars(category) > BOT_DECISION_LIMITS.category) throw invalid(`拍板類別必填，最多 ${BOT_DECISION_LIMITS.category} 字`);
  let amount: number | null = null;
  if (raw.amount !== undefined && raw.amount !== null) {
    if (typeof raw.amount !== "number" || !Number.isSafeInteger(raw.amount) || raw.amount < 0) throw invalid("拍板金額須為不小於 0 的整數（單位：分）");
    amount = raw.amount;
  }
  let deadline: string | null = null;
  if (raw.deadline !== undefined && raw.deadline !== null) {
    if (typeof raw.deadline !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(raw.deadline)) throw invalid("拍板期限須為 UTC ISO 時間");
    const parsed = new Date(raw.deadline);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 19) !== raw.deadline.slice(0, 19)) throw invalid("拍板期限不正確");
    deadline = parsed.toISOString();
  }
  let options: string[] | null = null;
  if (raw.options !== undefined && raw.options !== null) {
    const { min, max, length } = BOT_DECISION_LIMITS.options;
    if (!Array.isArray(raw.options) || raw.options.length < min || raw.options.length > max) throw invalid(`拍板選項需 ${min} 至 ${max} 個`);
    options = raw.options.map(option => {
      const label = typeof option === "string" ? option.trim() : "";
      if (!label || chars(label) > length) throw invalid(`每個選項必填，最多 ${length} 字`);
      return label;
    });
    if (new Set(options).size !== options.length) throw invalid("拍板選項不可重複");
  }
  return { category, amount, deadline, options };
}
const decisionInsert = (db: D1Database, input: DecisionInput) => db.prepare("INSERT INTO bot_draft_decisions(draft_id,category,amount,deadline_at,options_json) VALUES(last_insert_rowid(),?,?,?,?)")
  .bind(input.category, input.amount, input.deadline, input.options ? JSON.stringify(input.options) : null);

async function saveDraft(db: D1Database, botId: number, externalRef: string | null, title: string, body: string, now: string, kind: BotDraftKind = "general", items: ItemInput[] = [], previousId?: number, decision: DecisionInput | null = null, sessionId: number | null = null): Promise<DraftRow> {
  if (externalRef) {
    const existing = await one<{ id: number }>(db, "SELECT id FROM bot_drafts WHERE bot_id=? AND external_ref=?", botId, externalRef);
    if (existing) return draftById(db, existing.id);
  }
  if (previousId !== undefined) {
    if(!externalRef || !Number.isSafeInteger(previousId) || previousId<1)throw new Bad("BOT_INVALID","覆蓋新版需新externalRef與有效previousDraftId");
    const old=await draftById(db,previousId,botId);
    if(old.kind!==kind||(!old.is_decision&&decision))throw new Bad("BOT_REVISION_CONFLICT","新版須保持原稿分類",409);
    if(old.is_decision&&!decision)throw new Bad("BOT_INVALID","拍板事項的新版也必須附 decision",400);
    if(old.superseded_by_id || old.sent_at || await one(db,"SELECT id FROM bot_draft_items WHERE draft_id=? AND (sent_at IS NOT NULL OR externally_completed_at IS NOT NULL) LIMIT 1",previousId))throw new Bad("BOT_REVISION_CONFLICT","原稿已有新版或已送出，不能覆蓋",409);
    try {
      const [inserted]=await db.batch([
        db.prepare(`INSERT INTO bot_drafts(bot_id,external_ref,title,body,created_at,kind,previous_draft_id,revision_number,session_id)
          SELECT ?,?,?,?,?,?,d.id,d.revision_number+1,COALESCE(?,d.session_id) FROM bot_drafts d WHERE d.id=? AND d.bot_id=? AND d.sent_at IS NULL
          AND NOT EXISTS(SELECT 1 FROM bot_draft_items WHERE draft_id=d.id AND (sent_at IS NOT NULL OR externally_completed_at IS NOT NULL))
          AND NOT EXISTS(SELECT 1 FROM bot_drafts newer WHERE newer.previous_draft_id=d.id)`).bind(botId,externalRef,title,body,now,kind,sessionId,previousId,botId),
        ...(decision?[db.prepare("INSERT INTO bot_draft_decisions(draft_id,category,amount,deadline_at,options_json) SELECT id,?,?,?,? FROM bot_drafts WHERE bot_id=? AND external_ref=?").bind(decision.category,decision.amount,decision.deadline,decision.options?JSON.stringify(decision.options):null,botId,externalRef)]:[]),
        ...items.map((item,i)=>db.prepare("INSERT INTO bot_draft_items(draft_id,seq,ref,title,body) VALUES((SELECT id FROM bot_drafts WHERE bot_id=? AND external_ref=?),?,?,?,?)").bind(botId,externalRef,i+1,item.ref,item.title,item.body))
      ]);
      if(inserted.meta.changes!==1)throw Error('conflict');
      return draftById(db,Number(inserted.meta.last_row_id));
    }catch(error){
      // Only real conflicts are 409: the guarded insert inserted nothing (so its items had no draft),
      // or a UNIQUE on previous_draft_id / external_ref. Anything else is rethrown so the client retries.
      const message=String(error);
      if(!(message.includes("UNIQUE")||message==="Error: conflict"||message.includes("bot_draft_items.draft_id")))throw error;
      // The same BOT resending identical content under the same externalRef gets the existing draft, like the non-revision path.
      const same=await one<{id:number;title:string;body:string;kind:string;previous_draft_id:number|null}>(db,"SELECT id,title,body,kind,previous_draft_id FROM bot_drafts WHERE bot_id=? AND external_ref=?",botId,externalRef);
      if(same){
        const stored=await many<{ref:string|null;title:string;body:string}>(db,"SELECT ref,title,body FROM bot_draft_items WHERE draft_id=? ORDER BY seq",same.id);
        if(same.previous_draft_id===previousId&&same.title===title&&same.body===body&&same.kind===kind
          &&stored.length===items.length&&stored.every((row,i)=>row.ref===items[i].ref&&row.title===items[i].title&&row.body===items[i].body))return draftById(db,same.id);
      }
      throw new Bad("BOT_REVISION_CONFLICT","原稿已變更，請重新讀取後再送新版",409);
    }
  }
  try {
    const insert = db.prepare("INSERT INTO bot_drafts(bot_id,external_ref,title,body,created_at,kind,session_id) VALUES(?,?,?,?,?,?,?)").bind(botId, externalRef, title, body, now, kind, sessionId);
    // 拍板事項與稿件同一批寫入，不會留下沒有拍板內容的稿件。
    const inserted = decision ? (await db.batch([insert, decisionInsert(db, decision)]))[0] : await insert.run();
    const id = Number(inserted.meta.last_row_id);
    if (items.length) {
      try {
        await db.batch(items.map((item, i) => db.prepare("INSERT INTO bot_draft_items(draft_id,seq,ref,title,body) VALUES(?,?,?,?,?)").bind(id, i + 1, item.ref, item.title, item.body)));
      } catch (error) { await db.prepare("DELETE FROM bot_drafts WHERE id=?").bind(id).run(); throw error; }
    }
    return draftById(db, id);
  } catch (error) {
    if (externalRef && String(error).includes("UNIQUE")) {
      const existing = await one<{ id: number }>(db, "SELECT id FROM bot_drafts WHERE bot_id=? AND external_ref=?", botId, externalRef);
      if (existing) return draftById(db, existing.id);
    }
    throw error;
  }
}

async function ingest(request: Request, env: BotEnv, requestId: string, url: URL): Promise<Response> {
  const allowed = await ingestGuard(request, env, requestId);
  if (allowed instanceof Response) return allowed;
  const bot = allowed;
  const db = env.DB;
  const now = new Date().toISOString();
  await ensureInitialBots(db, now);
  const path = url.pathname.replace(/^\/api\/bot-ingest\/?/, "");
  if (path === "identity" && request.method === "GET") return success({botCode:bot.code,botLabel:bot.label},requestId);
  if(path==="patrol-sessions"&&request.method==="POST"){
   const body=await readBody(request);requireBotScope(body.botCode,bot);
   return success({...await patrolSession(db,bot.id,body,now),botCode:bot.code},requestId);
  }
  if(path==="deliveries"&&request.method==="POST"){
   const body=await readBody(request);requireBotScope(body.botCode,bot);
   return success(await saveDelivery(db,bot,body,now),requestId);
  }
  if(path==="deliveries"&&request.method==="GET"){
   const ref=text(url.searchParams.get("eventRef"),"成果固定編號",120,true);
   const row=await one<{id:number}>(db,"SELECT id FROM bot_deliveries WHERE bot_id=? AND event_ref=?",bot.id,ref);
   if(!row)throw new Bad("BOT_NOT_FOUND","找不到這筆成果",404);
   return success(await deliveryDetail(db,row.id,bot.id),requestId);
  }
  const deliveredImage=/^deliveries\/(\d+)\/images$/.exec(path);
  if(deliveredImage&&request.method==="POST"){
   const id=Number(deliveredImage[1]);await deliveryDetail(db,id,bot.id);
   if(!env.HR_FILES)throw new Bad("BOT_IMAGE_UNAVAILABLE","圖片儲存空間尚未設定",503);
   const ref=text(url.searchParams.get("uploadRef"),"圖片固定編號",80,true);
   if(Number(request.headers.get("content-length")??0)>BOT_IMAGE_LIMITS.bytes)throw new Bad("BOT_IMAGE_TOO_LARGE","圖片不可超過2MB",413);
   const bytes=new Uint8Array(await request.arrayBuffer());
   if(!bytes.length||bytes.length>BOT_IMAGE_LIMITS.bytes)throw new Bad("BOT_IMAGE_TOO_LARGE","圖片不可超過2MB",413);
   const type=imageTypeOf(bytes,request.headers.get("content-type"));
   const digest=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(x=>x.toString(16).padStart(2,"0")).join("");
   if(ref!==digest)throw new Bad("BOT_INVALID","圖片編號須為內容SHA-256");
   const prior=await one<{id:number;bytes:number;content_type:string}>(db,"SELECT id,bytes,content_type FROM bot_delivery_images WHERE delivery_id=? AND upload_ref=?",id,ref);
   if(prior)return success({id:prior.id,contentType:prior.content_type,bytes:prior.bytes},requestId);
   const key='bot-delivery/'+id+'/'+crypto.randomUUID();
   await env.HR_FILES.put(key,bytes,{httpMetadata:{contentType:type}});
   try{
    const inserted=await db.prepare("INSERT INTO bot_delivery_images(delivery_id,upload_ref,object_key,content_type,bytes,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM bot_delivery_images WHERE delivery_id=?)<? ON CONFLICT DO NOTHING").bind(id,ref,key,type,bytes.length,now,id,BOT_IMAGE_LIMITS.perTarget).run();
    if(!inserted.meta.changes){await env.HR_FILES.delete(key);const raced=await one<{id:number;content_type:string;bytes:number}>(db,"SELECT id,content_type,bytes FROM bot_delivery_images WHERE delivery_id=? AND upload_ref=?",id,ref);if(raced)return success({id:raced.id,contentType:raced.content_type,bytes:raced.bytes},requestId);throw new Bad("BOT_IMAGE_LIMIT","每篇最多10張圖片",409)}
    return success({id:Number(inserted.meta.last_row_id),contentType:type,bytes:bytes.length},requestId);
   }catch(e){await env.HR_FILES.delete(key);throw e}
  }
  if (path === "reports" && request.method === "POST") {
    const body = await readBody(request);
    requireBotScope(body.botCode,bot);
    const title = text(body.title, "標題", BOT_LIMITS.title, true);
    const report = text(body.body, "內容", BOT_LIMITS.body, true);
    const inserted = await db.prepare("INSERT INTO bot_reports(bot_id,title,body,reported_at) VALUES(?,?,?,?)").bind(bot.id, title, report, now).run();
    const row = await one<ReportRow>(db, `SELECT r.id,b.code,b.label,r.title,r.body,r.reported_at FROM bot_reports r JOIN bot_profiles b ON b.id=r.bot_id WHERE r.id=?`, Number(inserted.meta.last_row_id));
    return success(reportView(row!), requestId);
  }
  if (path === "drafts" && request.method === "POST") {
    const body = await readBody(request);
    requireBotScope(body.botCode,bot);
    const externalRef = text(body.externalRef, "外部編號", BOT_LIMITS.externalRef) || null;
    const title = text(body.title, "標題", BOT_LIMITS.title, true);
    const draft = text(body.body, "內容", BOT_LIMITS.body, true);
    const kind = body.kind ?? "general";
    if (typeof kind !== "string" || !(BOT_DRAFT_KINDS as readonly string[]).includes(kind)) throw new Bad("BOT_INVALID", "稿件分類不正確");
    const items = itemsOf(body.items);
    // Same rule as the official client: only a general draft is single; post / patrol drafts need items.
    if ((kind === "general") !== !items.length) throw new Bad("BOT_INVALID", kind === "general" ? "一般稿不可附多則內容" : "貼文與海巡稿需附多則內容 items", 400);
    const decision = decisionOf(body.decision);
    if (decision && (kind !== "general" || items.length)) throw new Bad("BOT_INVALID", "拍板事項不可附多則內容，也不是貼文或海巡稿", 400);
    // 海巡稿可連結同 BOT、同一台北日已登錄的巡視場次。
    let sessionId: number | null = null;
    if (body.sessionRef !== undefined) {
      if (kind !== "patrol") throw new Bad("BOT_INVALID", "只有海巡稿可以指定巡視場次", 400);
      const ref = text(body.sessionRef, "巡視固定編號", 120, true);
      const session = await one<{ id: number; day: string }>(db, "SELECT id,day FROM bot_patrol_sessions WHERE bot_id=? AND session_ref=?", bot.id, ref);
      if (!session || session.day !== taipeiTodayRange(new Date(now)).day) throw new Bad("BOT_INVALID", "請先登錄同日的巡視場次", 400);
      sessionId = session.id;
    }
    return success(draftView(await saveDraft(db, bot.id, externalRef, title, draft, now, kind as BotDraftKind, items, body.previousDraftId as number|undefined, decision, sessionId)), requestId);
  }
  if (path === "drafts" && request.method === "GET") {
    requireBotScope(url.searchParams.get("botCode"),bot);
    const externalRef = text(url.searchParams.get("externalRef"), "外部編號", BOT_LIMITS.externalRef, true);
    const row = await one<DraftRow>(db, `${DRAFT_SQL} WHERE d.bot_id=? AND d.external_ref=?`, bot.id, externalRef);
    if (!row) throw new Bad("BOT_NOT_FOUND", "找不到這篇審稿", 404);
    return success(draftView(row), requestId);
  }
  const draft = /^drafts\/(\d+)$/.exec(path);
  if (draft && request.method === "GET") {
    // Single drafts keep their original shape; multi-item drafts add `items` with each result.
    const detail = await draftDetail(db, Number(draft[1]), bot.id);
    return success(detail.items.length ? { ...detail.draft, items: detail.items } : detail.draft, requestId);
  }
  const imageUpload = /^drafts\/(\d+)\/images$/.exec(path);
  if (imageUpload && request.method === "POST") {
    const target = await draftById(db, Number(imageUpload[1]), bot.id);
    if(target.superseded_by_id)throw new Bad("BOT_SUPERSEDED","此稿已有新版",409);
    if (target.review_status !== "pending") throw new Bad("ALREADY_REVIEWED", "已審完的稿件不能再加圖片", 409);
    if (!env.HR_FILES) throw new Bad("BOT_IMAGE_UNAVAILABLE", "圖片儲存空間尚未設定", 503);
    const seqParam = url.searchParams.get("item");
    const item = seqParam ? await one<{ id: number }>(db, "SELECT id FROM bot_draft_items WHERE draft_id=? AND seq=?", target.id, Number(seqParam)) : null;
    if (seqParam && !item) throw new Bad("BOT_NOT_FOUND", "找不到這一則", 404);
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > BOT_IMAGE_LIMITS.bytes) throw new Bad("BOT_IMAGE_TOO_LARGE", "圖片不可超過 2MB，請先縮小", 413);
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length || bytes.length > BOT_IMAGE_LIMITS.bytes) throw new Bad("BOT_IMAGE_TOO_LARGE", "圖片不可超過 2MB，請先縮小", 413);
    const type = imageTypeOf(bytes, request.headers.get("content-type"));
    const existing = await one<{ n: number }>(db, `SELECT count(*) n FROM bot_review_images WHERE draft_id=? AND ${item ? "item_id=?" : "item_id IS NULL"}`, target.id, ...(item ? [item.id] : []));
    if ((existing?.n ?? 0) >= BOT_IMAGE_LIMITS.perTarget) throw new Bad("BOT_IMAGE_LIMIT", `每則最多 ${BOT_IMAGE_LIMITS.perTarget} 張圖片`, 409);
    const key = `bot-review/${target.id}/${crypto.randomUUID()}.${type.split("/")[1]}`;
    await env.HR_FILES.put(key, bytes, { httpMetadata: { contentType: type } });
    try {
      const inserted = await db.prepare("INSERT INTO bot_review_images(draft_id,item_id,object_key,content_type,bytes,created_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM bot_drafts WHERE previous_draft_id=?) AND EXISTS(SELECT 1 FROM bot_drafts WHERE id=? AND review_status='pending' AND externally_completed_at IS NULL) AND (SELECT count(*) FROM bot_review_images WHERE draft_id=? AND item_id IS ?)<?").bind(target.id, item?.id ?? null, key, type, bytes.length, now,target.id,target.id,target.id,item?.id??null,BOT_IMAGE_LIMITS.perTarget).run();
      if(!inserted.meta.changes)throw new Bad("BOT_IMAGE_CONFLICT","稿件已變更或圖片已達上限，請重新讀取",409);
      return success({ id: Number(inserted.meta.last_row_id), itemSeq: seqParam ? Number(seqParam) : null, contentType: type, bytes: bytes.length }, requestId);
    } catch (error) { await env.HR_FILES.delete(key); throw error; }
  }
  const sentRoute = /^drafts\/(\d+)\/sent$/.exec(path);
  if (sentRoute && request.method === "POST") {
    // The BOT reports the approved work it actually carried out (posted, replied).
    const target = await draftById(db, Number(sentRoute[1]), bot.id);
    if(target.superseded_by_id)throw new Bad("BOT_SUPERSEDED","此稿已有新版",409);
    const body = await readBody(request);
    if (target.item_total) {
      if (!Array.isArray(body.items) || !body.items.length || body.items.length>50 || body.items.some(seq => !Number.isSafeInteger(seq) || Number(seq) < 1)) throw new Bad("BOT_INVALID", "請列出已送出的則號");
      const seqs=[...new Set(body.items as number[])];
      if(!await one(db,"SELECT id FROM bot_draft_items WHERE draft_id=? AND review_status='approved' AND seq IN(SELECT value FROM json_each(?))",target.id,JSON.stringify(seqs)))throw new Bad("BOT_NOT_APPROVED","只有通過的則號可以回報已送出",409);
      const [updated]=await db.batch([
       db.prepare("UPDATE bot_draft_items SET sent_at=? WHERE draft_id=? AND review_status='approved' AND sent_at IS NULL AND seq IN(SELECT value FROM json_each(?)) AND NOT EXISTS(SELECT 1 FROM bot_drafts WHERE previous_draft_id=?)").bind(now,target.id,JSON.stringify(seqs),target.id),
       db.prepare(`INSERT INTO bot_deliveries(bot_id,event_ref,kind,title,body,sent_at,approval_source,draft_id,item_id)
        SELECT d.bot_id,'legacy-item-'||i.id,d.kind,i.title,i.body,i.sent_at,'cyweb',d.id,i.id FROM bot_draft_items i JOIN bot_drafts d ON d.id=i.draft_id
        WHERE d.id=? AND i.seq IN(SELECT value FROM json_each(?)) AND i.sent_at IS NOT NULL AND d.kind IN('post','patrol') AND NOT EXISTS(SELECT 1 FROM bot_drafts WHERE previous_draft_id=d.id) ON CONFLICT DO NOTHING`).bind(target.id,JSON.stringify(seqs))
      ]);
      return success({draftId:target.id,sent:updated.meta.changes},requestId);
    }
    if(target.review_status!=="approved")throw new Bad("BOT_NOT_APPROVED","只有通過的稿件可以回報已送出",409);
    const result=await db.prepare("UPDATE bot_drafts SET sent_at=COALESCE(sent_at,?) WHERE id=? AND NOT EXISTS(SELECT 1 FROM bot_drafts newer WHERE newer.previous_draft_id=bot_drafts.id)").bind(now,target.id).run();
    if(!result.meta.changes)throw new Bad("BOT_SUPERSEDED","此稿已有新版",409);
    return success({draftId:target.id,sent:1},requestId);
  }

  if (path === "progress" && request.method === "POST") {
    const body = await readBody(request);
    requireBotScope(body.botCode,bot);
    const status = statusOf(body.status);
    const summary = text(body.summary, "進度", BOT_LIMITS.summary);
    await db.prepare("UPDATE bot_profiles SET status=?,summary=?,updated_at=? WHERE id=?").bind(status, summary, now, bot.id).run();
    const row = await one<ProfileRow>(db, "SELECT id,code,label,status,summary,updated_at FROM bot_profiles WHERE id=?", bot.id);
    return success(profileView(row!), requestId);
  }
  if (path === "completions" && request.method === "POST") {
    const body = await readBody(request);
    requireBotScope(body.botCode,bot);
    const title = text(body.title, "完成項目", BOT_LIMITS.title, true);
    const detail = text(body.detail, "內容", BOT_LIMITS.body);
    const completedAt = completedAtOf(body.completedAt, now);
    const workType = body.workType ?? "general";
    if (typeof workType !== "string" || !(BOT_WORK_TYPES as readonly string[]).includes(workType)) throw new Bad("BOT_INVALID","工作分類不正確");
    const eventRef = text(body.eventRef,"固定事件編號",120,workType!=="general") || null;
    const inserted = await db.prepare("INSERT INTO bot_completions(bot_id,title,detail,completed_at,work_type,event_ref) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING")
      .bind(bot.id,title,detail,completedAt,workType,eventRef).run();
    const row = await one<CompletionRow>(db, eventRef ? `${COMPLETION_SQL} WHERE c.bot_id=? AND c.event_ref=?` : `${COMPLETION_SQL} WHERE c.id=?`,
      ...(eventRef ? [bot.id,eventRef] : [Number(inserted.meta.last_row_id)]));
    if (!row) throw new Bad("BOT_UNAVAILABLE","無法確認完成紀錄",500);
    if (row.title!==title || row.detail!==detail || row.work_type!==workType || (body.completedAt && row.completed_at!==completedAt)) throw new Bad("BOT_EVENT_CONFLICT","同一事件編號已有不同內容",409);
    return success(completionView(row),requestId);
  }
  return failure({ code: "NOT_FOUND", message: "找不到這個操作" }, requestId, 404);
}

export async function handleBotCenterRoute(request: Request, env: BotEnv, requestId: string,ctx?:Pick<ExecutionContext,'waitUntil'>): Promise<Response | null> {
  const url = new URL(request.url);
  try {
    if (url.pathname.startsWith("/api/bot-ingest/") || url.pathname === "/api/bot-ingest") return await ingest(request, env, requestId, url);
    if (url.pathname.startsWith("/api/bot-center")) return await human(request, env, requestId, url,ctx);
    return null;
  } catch (error) {
    if (error instanceof Bad) return failure({ code: error.code, message: error.message }, requestId, error.status);
    if(error instanceof PushError)return failure({code:error.code,message:'推播設定無法儲存，請確認網址與密鑰'},requestId,422);
    return failure({ code: "BOT_UNAVAILABLE", message: "BOT 管理中心暫時無法使用" }, requestId, 500);
  }
}

/**
 * Review images are kept until the day after the review (user 2026-11-09): from Taipei midnight on, the
 * images of drafts reviewed before today are removed from storage and D1. Bounded per run.
 */
export async function cleanupReviewImages(env: BotEnv, now: string): Promise<number> {
  if (!env.HR_FILES) return 0;
  const discarded=await many<{object_key:string}>(env.DB,"SELECT object_key FROM bot_review_image_deletions LIMIT 100");
  if(discarded.length){await env.HR_FILES.delete(discarded.map(x=>x.object_key));await env.DB.prepare("DELETE FROM bot_review_image_deletions WHERE object_key IN(SELECT value FROM json_each(?))").bind(JSON.stringify(discarded.map(x=>x.object_key))).run();}
  const today = taipeiTodayRange(new Date(now));
  const rows = await many<{ id: number; object_key: string }>(env.DB, `SELECT g.id,g.object_key FROM bot_review_images g JOIN bot_drafts d ON d.id=g.draft_id
    WHERE (COALESCE(d.externally_completed_at,d.reviewed_at)<?) OR EXISTS(SELECT 1 FROM bot_drafts newer WHERE newer.previous_draft_id=d.id AND newer.created_at<?) ORDER BY g.id LIMIT 100`, today.start,today.start);
  const deliveries=await many<{id:number;object_key:string}>(env.DB,"SELECT id,object_key FROM bot_delivery_images WHERE created_at<? ORDER BY id LIMIT 100",today.start);
  if(deliveries.length){await env.HR_FILES.delete(deliveries.map(r=>r.object_key));await env.DB.prepare("DELETE FROM bot_delivery_images WHERE id IN(SELECT value FROM json_each(?))").bind(JSON.stringify(deliveries.map(r=>r.id))).run();}
  if (!rows.length) return discarded.length+deliveries.length;
  await env.HR_FILES.delete(rows.map(row => row.object_key));
  await env.DB.prepare("DELETE FROM bot_review_images WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(rows.map(row => row.id))).run();
  return rows.length+discarded.length+deliveries.length;
}

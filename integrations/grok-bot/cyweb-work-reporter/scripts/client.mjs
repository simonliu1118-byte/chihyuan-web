import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
class ReporterError extends Error {
  constructor(code, message, { rejected = false } = {}) {
    super(message);
    this.code = code;
    this.rejected = rejected;
  }
}
const bad = (code, message) => {
  throw new ReporterError(code, message);
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const string = (value, name, max, required = true) => {
  if (value === void 0 && !required) return void 0;
  if (typeof value !== "string" || [...value.trim()].length > max || required && !value.trim()) bad("INPUT_INVALID", `${name}格式或長度不正確`);
  return value.trim();
};
const fields = (input, allowed) => {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !allowed.includes(key))) bad("INPUT_INVALID", "輸入須為 JSON 物件，且只能包含此操作允許的欄位");
};
function configFromEnv(env = process.env) {
  let url;
  try {
    url = new URL(env.CYWEB_BASE_URL);
  } catch {
    bad("CONFIG_INVALID", "請設定 CYWEB_BASE_URL 為 CYWEB 的 HTTPS 根網址");
  }
  const local = env.CYWEB_ALLOW_LOCAL_HTTP === "1" && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !local || url.username || url.password || url.pathname !== "/" || url.search || url.hash) bad("CONFIG_INVALID", "連線網址只允許 HTTPS 根網址，不可含帳密、路徑或參數");
  const token = env.CYWEB_BOT_TOKEN;
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) bad("CONFIG_INVALID", "請透過安全祕密設定注入 CYWEB_BOT_TOKEN；不要貼在命令或聊天");
  const botCode = env.CYWEB_BOT_CODE;
  if (typeof botCode !== "string" || !/^[A-Z][A-Z0-9_]{1,31}$/.test(botCode)) bad("CONFIG_INVALID", "請設定這個 BOT 自己的 CYWEB_BOT_CODE");
  const stateDir = env.CYWEB_REPORTER_STATE_DIR;
  if (typeof stateDir !== "string" || !isAbsolute(stateDir)) bad("CONFIG_INVALID", "請設定持久儲存目錄 CYWEB_REPORTER_STATE_DIR，須為絕對路徑");
  return { origin: url.origin, token, botCode, stateDir };
}
function redact(value, secret) {
  if (typeof value === "string") return value.replaceAll(secret, "[REDACTED]");
  if (Array.isArray(value)) return value.map((item) => redact(item, secret));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item, secret)]));
  return value;
}
function createReporter(config, { fetchImpl = fetch, timeoutMs = 15e3 } = {}) {
  const { origin, token, botCode, stateDir } = config;
  async function request(path, body, { publicHealth = false, binary } = {}) {
    if (JSON.stringify(body ?? "").includes(token)) bad("INPUT_CONTAINS_SECRET", "回報內容不可包含連線憑證");
    let response;
    const send = binary ? { "content-type": binary.type } : body === void 0 ? {} : { "content-type": "application/json" };
    try {
      response = await fetchImpl(origin + path, { method: body === void 0 && !binary ? "GET" : "POST", redirect: "error", signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json", ...publicHealth ? {} : { authorization: "Bearer " + token }, ...send }, ...binary ? { body: binary.bytes } : body === void 0 ? {} : { body: JSON.stringify(body) } });
    } catch {
      bad("NETWORK_UNCONFIRMED", "連線未確認；寫入可能已送達，不可盲目重送");
    }
    let envelope;
    try {
      envelope = await response.json();
    } catch {
      bad("RESPONSE_UNCONFIRMED", "回應格式不正確，未確認是否送達");
    }
    if (!response.ok || envelope?.ok !== true) {
      const known = envelope?.ok === false && typeof envelope.error?.code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(envelope.error.code);
      throw new ReporterError(known ? envelope.error.code : "HTTP_UNCONFIRMED", `CYWEB 請求未成功（HTTP ${response.status}）`, { rejected: known && response.status >= 400 && response.status < 500 });
    }
    if (!envelope.data || typeof envelope.data !== "object") bad("RESPONSE_UNCONFIRMED", "回應缺少有效資料，未確認是否送達");
    return envelope.data;
  }
  const checkRecord = (data) => {
    if (!Number.isSafeInteger(data.id) || data.id < 1) bad("RESPONSE_UNCONFIRMED", "回應缺少有效紀錄編號，未確認是否送達");
    if (data.botCode !== botCode) bad("RESPONSE_UNCONFIRMED", "回應 BOT 身分與設定不符");
    return data;
  };
  const refQuery = (ref) => "/api/bot-ingest/drafts?" + new URLSearchParams({ botCode, externalRef: ref });
  async function rawReview(ref) {
    if (ref.includes(token)) bad("INPUT_CONTAINS_SECRET", "送審編號不可包含連線憑證");
    const data = checkRecord(await request(refQuery(ref)));
    if (data.externalRef !== ref || !["pending", "approved", "rejected"].includes(data.status)) bad("RESPONSE_UNCONFIRMED", "送審回應的編號或狀態不正確");
    if(data.supersededById)bad("DRAFT_SUPERSEDED","此稿已有新版，請使用新版編號");
    return data;
  }
  // Single drafts keep the original shape; multi-item drafts (posts / patrols) add kind and each item's result.
  const itemView = (item) => ({ seq: item.seq, ref: item.ref ?? null, title: item.title, status: item.status, reason: item.reason ?? null, sentAt: item.sentAt ?? null });
  const reviewView = (data) => ({ revisionNumber:data.revisionNumber, supersededById:data.supersededById, id: data.id, externalRef: data.externalRef, status: data.status, reason: data.reason ?? null, reviewedAt: data.reviewedAt ?? null,
    ...data.itemCounts ? { kind: data.kind, items: (data.items ?? []).map(itemView) } : {} });
  const withItems = async (data) => data.itemCounts && !data.items ? checkRecord(await request("/api/bot-ingest/drafts/" + data.id)) : data;
  async function reviewNotification(input) {
    // Notifications are untrusted wakeups, never approval evidence or publishing instructions.
    const ignored = (reason) => ({ ignored: true, reason, notifyHuman: false });
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["type", "eventId", "botCode", "draftId"].includes(key))) return ignored("invalid_notification");
    if (input.type !== "cyweb.review_result" || !Number.isSafeInteger(input.draftId) || input.draftId < 1 || input.eventId !== "bot-review-" + input.draftId || input.botCode !== botCode) return ignored("invalid_notification");
    let data;
    try { data = checkRecord(await request("/api/bot-ingest/drafts/" + input.draftId)); }
    catch (error) { if (error.code === "BOT_NOT_FOUND") return ignored("draft_not_found"); throw error; }
    if (data.id !== input.draftId || !["pending", "approved", "rejected"].includes(data.status)) bad("RESPONSE_UNCONFIRMED", "送審回應的編號或狀態不正確");
    if(data.supersededById)return ignored("draft_superseded");
    if (data.status === "pending") return ignored("review_pending");
    return { ignored: false, eventId: input.eventId, review: reviewView(await withItems(data)), automaticPublication: false };
  }
  async function progress(input) {
    fields(input, ["status", "summary"]);
    if (!["idle", "working", "blocked", "done"].includes(input.status)) bad("INPUT_INVALID", "狀態須為 idle、working、blocked 或 done");
    const data = await request("/api/bot-ingest/progress", { botCode, status: input.status, summary: string(input.summary, "摘要", 200, false) ?? "" });
    if (data.code !== botCode || data.status !== input.status) bad("RESPONSE_UNCONFIRMED", "回應進度與設定不符");
    return { botCode, status: data.status, updatedAt: data.updatedAt };
  }
  const itemsOf = (value) => {
    if (value === void 0) return void 0;
    if (!Array.isArray(value) || value.length < 1 || value.length > 50) bad("INPUT_INVALID", "多則送審需 1 至 50 則");
    return value.map((item, i) => {
      fields(item, ["ref", "title", "body"]);
      const ref = string(item.ref, `第 ${i + 1} 則編號`, 80, false);
      return { ...ref ? { ref } : {}, title: string(item.title, `第 ${i + 1} 則標題`, 120), body: string(item.body, `第 ${i + 1} 則內容`, 4e3) };
    });
  };
  async function submit(input) {
    fields(input, ["externalRef", "title", "body", "kind", "items", "previousDraftId"]);
    const externalRef = string(input.externalRef, "送審固定編號", 80), title = string(input.title, "標題", 120), body = string(input.body, "內容", 4e3);
    const kind = input.kind ?? (input.items ? "post" : "general");
    if (!["general", "post", "patrol"].includes(kind)) bad("INPUT_INVALID", "稿件分類須為 general、post 或 patrol");
    if(input.previousDraftId!==undefined&&(!Number.isSafeInteger(input.previousDraftId)||input.previousDraftId<1))bad("INPUT_INVALID","previousDraftId 須為原稿編號");
    const items = itemsOf(input.items);
    if ((kind === "general") !== !items) bad("INPUT_INVALID", "貼文／海巡請用 items 逐則送審；一般單篇不帶 items");
    if (JSON.stringify([externalRef, title, body, items ?? []]).includes(token)) bad("INPUT_CONTAINS_SECRET", "回報內容不可包含連線憑證");
    let existing;
    try {
      existing = await rawReview(externalRef);
    } catch (error) {
      if (error.code !== "BOT_NOT_FOUND") throw error;
    }
    const data = await withItems(existing ?? checkRecord(await request("/api/bot-ingest/drafts", { botCode, externalRef, title, body, ...(input.previousDraftId===undefined?{}:{previousDraftId:input.previousDraftId}), ...items ? { kind, items } : {} })));
    const sameItems = !items ? !data.itemCounts : (data.kind === kind && data.items?.length === items.length && items.every((item, i) => data.items[i].title === item.title && data.items[i].body === item.body && (data.items[i].ref ?? void 0) === item.ref));
    if (data.externalRef !== externalRef || data.title !== title || data.body !== body || !sameItems || (input.previousDraftId!==undefined&&data.previousDraftId!==input.previousDraftId)) bad("DRAFT_REVISION_REQUIRED", "這個送審編號已有不同內容；改稿請使用新的版本編號");
    return reviewView(data);
  }
  const imageType = (bytes) => bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg"
    : bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 ? "image/png"
    : String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP" ? "image/webp" : null;
  async function image(input) {
    // Review-only picture for a pending draft (or one item of it). Max 2MB and 10 per target; CYWEB deletes it the day after review.
    fields(input, ["externalRef", "item", "file"]);
    const externalRef = string(input.externalRef, "送審固定編號", 80), file = string(input.file, "圖片路徑", 1024);
    if (!isAbsolute(file)) bad("INPUT_INVALID", "圖片路徑須為絕對路徑");
    if (input.item !== void 0 && (!Number.isSafeInteger(input.item) || input.item < 1 || input.item > 50)) bad("INPUT_INVALID", "則號須為 1 至 50");
    let bytes;
    try { bytes = new Uint8Array(await readFile(file)); } catch { bad("INPUT_INVALID", "無法讀取圖片檔"); }
    if (!bytes.length || bytes.length > 2097152) bad("IMAGE_TOO_LARGE", "圖片不可超過 2MB，請先縮小（審核用，低畫質即可）");
    const type = imageType(bytes);
    if (!type) bad("INPUT_INVALID", "只接受 JPEG、PNG 或 WebP 圖片");
    const draft = await rawReview(externalRef);
    if (draft.status !== "pending") bad("ALREADY_REVIEWED", "已審完的稿件不能再加圖片");
    const data = await request(`/api/bot-ingest/drafts/${draft.id}/images${input.item ? "?item=" + input.item : ""}`, void 0, { binary: { type, bytes } });
    return { externalRef, imageId: data.id, item: data.itemSeq ?? null, contentType: data.contentType, bytes: data.bytes };
  }
  async function sent(input) {
    // Report approved work actually carried out (posted / replied). Patrol and post drafts list the item numbers sent.
    fields(input, ["externalRef", "items"]);
    const externalRef = string(input.externalRef, "送審固定編號", 80);
    const draft = await withItems(await rawReview(externalRef));
    if (draft.status !== "approved") bad(draft.status === "rejected" ? "REVIEW_REJECTED" : "APPROVAL_PENDING", draft.status === "rejected" ? "此稿件已全部退回，不可回報送出" : "尚未審完，不可回報送出");
    let body = {};
    if (draft.itemCounts) {
      if (!Array.isArray(input.items) || !input.items.length || input.items.some(seq => !Number.isSafeInteger(seq) || seq < 1)) bad("INPUT_INVALID", "請以 items 列出實際已送出的則號");
      const notApproved = input.items.filter(seq => draft.items.find(item => item.seq === seq)?.status !== "approved");
      if (notApproved.length) bad("ITEM_NOT_APPROVED", `第 ${notApproved.join("、")} 則未通過，不可回報送出`);
      body = { items: input.items };
    } else if (input.items !== void 0) bad("INPUT_INVALID", "單篇稿件不帶 items");
    const data = await request(`/api/bot-ingest/drafts/${draft.id}/sent`, body);
    return { externalRef, draftId: data.draftId, newlySent: data.sent };
  }
  async function append(kind, input) {
    fields(input, kind === "reports" ? ["eventId", "title", "body"] : ["eventId", "title", "detail", "completedAt", "reviewRef", "workType"]);
    const eventId = string(input.eventId, "固定事件編號", 120);
    const payload = { botCode, title: string(input.title, "標題", 120) };
    let approvalRef;
    if (kind === "reports") payload.body = string(input.body, "內容", 4e3);
    else {
      payload.detail = string(input.detail, "內容", 4e3, false) ?? "";
      if (input.completedAt !== void 0) {
        const at = string(input.completedAt, "完成時間", 30);
        if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,3})?Z$/.test(at) || !Number.isFinite(Date.parse(at))) bad("INPUT_INVALID", "完成時間須為有效 UTC ISO 日期；不填則由伺服器記錄現在時間");
        payload.completedAt = new Date(at).toISOString();
      }
      if (input.reviewRef !== void 0) {
        approvalRef = string(input.reviewRef, "送審固定編號", 80);
        const review = await rawReview(approvalRef);
        if (review.status !== "approved") bad(review.status === "rejected" ? "REVIEW_REJECTED" : "APPROVAL_PENDING", review.status === "rejected" ? "此事項已退回，請先處理退回理由" : "尚未核准，不可登記此送審事項完成");
      }
    }
    if (JSON.stringify({ eventId, payload, approvalRef }).includes(token)) bad("INPUT_CONTAINS_SECRET", "回報內容不可包含連線憑證");
    const fingerprintPayload = {...payload};
    if (kind === "completions") {
      const workType = input.workType ?? "general";
      if (!["general", "article_published", "threads_patrol"].includes(workType)) bad("INPUT_INVALID", "工作分類不正確");
      payload.workType = workType;
      payload.eventRef = eventId;
      // Preserve receipts made by the original general-completion client.
      if (workType !== "general") fingerprintPayload.workType = workType;
    }
    const fingerprint = hash(JSON.stringify({ payload: fingerprintPayload, approvalRef }));
    const name = hash(JSON.stringify([origin, botCode, kind, eventId])) + ".json", path = join(stateDir, name);
    try {
      await mkdir(stateDir, { recursive: true, mode: 448 });
    } catch {
      bad("LOCAL_STATE_UNAVAILABLE", "無法使用持久回報收據目錄；未送出寫入");
    }
    let handle;
    try {
      handle = await open(path, "wx", 384);
    } catch (error) {
      if (error.code !== "EEXIST") bad("LOCAL_STATE_UNAVAILABLE", "無法保存回報收據；未送出寫入");
      let saved;
      try {
        saved = JSON.parse(await readFile(path, "utf8"));
      } catch {
        bad("DELIVERY_UNCERTAIN", "收據無法讀取；請到 CYWEB 核對，勿刪收據重送");
      }
      if (saved.fingerprint !== fingerprint) bad("EVENT_CONFLICT", "同一事件編號不可改成不同內容");
      if (saved.status !== "delivered" || !Number.isSafeInteger(saved.id) || saved.id < 1) bad("DELIVERY_UNCERTAIN", "此事件正在送出或結果未確認；請到 CYWEB 核對，勿盲目重送");
      return { id: saved.id, eventId, delivered: true, duplicateSuppressed: true };
    }
    try {
      await handle.writeFile(JSON.stringify({ status: "pending", fingerprint }));
      await handle.sync();
    } catch {
      bad("LOCAL_STATE_UNAVAILABLE", "無法保存送出前收據；未送出寫入");
    } finally {
      await handle.close();
    }
    try {
      const data = checkRecord(await request("/api/bot-ingest/" + kind, payload));
      const temp = path + "." + randomUUID() + ".tmp";
      await writeFile(temp, JSON.stringify({ status: "delivered", fingerprint, id: data.id }), { mode: 384 });
      await rename(temp, path);
      return { id: data.id, eventId, delivered: true, duplicateSuppressed: false };
    } catch (error) {
      if (error.rejected) {
        try {
          await unlink(path);
        } catch {
        }
        throw error;
      }
      bad("DELIVERY_UNCERTAIN", "寫入結果未能確認；請到 CYWEB 核對，勿刪收據或更換事件編號盲目重送");
    }
  }
  async function run(command, input = {}) {
    if (command === "review-notification") return reviewNotification(input);
    if (command === "progress") return progress(input);
    if (command === "submit") return submit(input);
    if (command === "review") {
      fields(input, ["externalRef"]);
      return reviewView(await withItems(await rawReview(string(input.externalRef, "送審固定編號", 80))));
    }
    if (command === "image") return image(input);
    if (command === "sent") return sent(input);
    if (command === "report" || command === "complete") return append(command === "report" ? "reports" : "completions", input);
    if (command === "check") {
      fields(input, []);
      const health = await request("/api/health", void 0, { publicHealth: true });
      if (health.service !== "cyweb" || health.database !== "ok") bad("SERVICE_UNAVAILABLE", "目標不是可用的 CYWEB");
      const identity = await request("/api/bot-ingest/identity");
      if (identity.botCode !== botCode) bad("BOT_SCOPE_MISMATCH", "這組憑證不屬於設定的 BOT");
      await mkdir(stateDir, { recursive: true, mode: 448 });
      return { service: "cyweb", version: health.version, credentialAccepted: true, botCode, botLabel: identity.botLabel, probe: "read-only" };
    }
    if (command === "pilot-start" || command === "pilot-finish") {
      fields(input, ["reference"]);
      if (botCode !== "SOCIAL_EDITOR") bad("PILOT_ROLE_INVALID", "首輪測試限定 SOCIAL_EDITOR");
      const reference = string(input.reference, "測試固定編號", 70);
      if (command === "pilot-start") {
        await progress({ status: "working", summary: "CYWEB 小編連線測試：準備送審" });
        const draft = await submit({ externalRef: reference, title: "【連線測試】小編回報與核准", body: "這是 CYWEB 與 Grok Bot 的連線測試，沒有正式文案，也不會對外發文。請人工通過後，讓小編執行 pilot-finish 驗證完成回報。" });
        await append("reports", { eventId: reference + ":report", title: "【連線測試】小編已送出測試", body: "僅驗證回報與人工審核流程，沒有對外發文。" });
        await progress({ status: draft.status === "rejected" ? "blocked" : "idle", summary: draft.status === "pending" ? "CYWEB 連線測試待人工核准" : draft.status === "approved" ? "CYWEB 連線測試已核准，等待完成驗證" : "CYWEB 連線測試已退回" });
        return { reference, draft, needsHumanApproval: draft.status === "pending", next: draft.status === "rejected" ? "停止測試並確認退回理由" : "請到 CYWEB 核准後，再以相同 reference 執行 pilot-finish" };
      }
      const completion = await append("completions", { eventId: reference + ":completed", reviewRef: reference, title: "【連線測試】小編回報流程完成", detail: "已讀回人工核准並記錄完成；僅連線測試，未對外發文。" });
      await progress({ status: "done", summary: "CYWEB 小編連線測試完成，未對外發文" });
      return { reference, completion, externalPublication: false };
    }
    bad("COMMAND_INVALID", "不支援此操作；請使用 --help 查看可用操作");
  }
  return { run };
}
export {
  ReporterError,
  configFromEnv,
  createReporter,
  redact
};

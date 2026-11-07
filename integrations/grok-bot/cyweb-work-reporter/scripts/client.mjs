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
  async function request(path, body, { publicHealth = false } = {}) {
    if (JSON.stringify(body ?? "").includes(token)) bad("INPUT_CONTAINS_SECRET", "回報內容不可包含連線憑證");
    let response;
    try {
      response = await fetchImpl(origin + path, { method: body === void 0 ? "GET" : "POST", redirect: "error", signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json", ...publicHealth ? {} : { authorization: "Bearer " + token }, ...body === void 0 ? {} : { "content-type": "application/json" } }, ...body === void 0 ? {} : { body: JSON.stringify(body) } });
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
    return data;
  }
  const reviewView = (data) => ({ id: data.id, externalRef: data.externalRef, status: data.status, reason: data.reason ?? null, reviewedAt: data.reviewedAt ?? null });
  async function progress(input) {
    fields(input, ["status", "summary"]);
    if (!["idle", "working", "blocked", "done"].includes(input.status)) bad("INPUT_INVALID", "狀態須為 idle、working、blocked 或 done");
    const data = await request("/api/bot-ingest/progress", { botCode, status: input.status, summary: string(input.summary, "摘要", 200, false) ?? "" });
    if (data.code !== botCode || data.status !== input.status) bad("RESPONSE_UNCONFIRMED", "回應進度與設定不符");
    return { botCode, status: data.status, updatedAt: data.updatedAt };
  }
  async function submit(input) {
    fields(input, ["externalRef", "title", "body"]);
    const externalRef = string(input.externalRef, "送審固定編號", 80), title = string(input.title, "標題", 120), body = string(input.body, "內容", 4e3);
    if ([externalRef, title, body].some((value) => value.includes(token))) bad("INPUT_CONTAINS_SECRET", "回報內容不可包含連線憑證");
    let existing;
    try {
      existing = await rawReview(externalRef);
    } catch (error) {
      if (error.code !== "BOT_NOT_FOUND") throw error;
    }
    const data = existing ?? checkRecord(await request("/api/bot-ingest/drafts", { botCode, externalRef, title, body }));
    if (data.externalRef !== externalRef || data.title !== title || data.body !== body) bad("DRAFT_REVISION_REQUIRED", "這個送審編號已有不同內容；改稿請使用新的版本編號");
    return reviewView(data);
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
    if (command === "progress") return progress(input);
    if (command === "submit") return submit(input);
    if (command === "review") {
      fields(input, ["externalRef"]);
      return reviewView(await rawReview(string(input.externalRef, "送審固定編號", 80)));
    }
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

import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { build } from "esbuild";

const compiled = await build({ entryPoints: ["worker/http/bot-center-routes.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { handleBotCenterRoute } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));

function fixture(role = "SUPER_ADMIN", grant = false) {
  const sql = new DatabaseSync(":memory:");
  const queries = [];
  sql.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync(new URL("../migrations/", import.meta.url)).filter(name => name.endsWith(".sql")).sort())
    sql.exec(readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8"));
  const t = "2026-11-06T00:00:00.000Z";
  sql.prepare("INSERT INTO app_members(identity_employee_id,employee_no,display_name,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?)")
    .run("bot-center-synthetic", "9999", "合成同事", 1, t, t);
  if (grant) sql.prepare("INSERT INTO app_member_module_access(member_id,module_code,enabled,updated_at,updated_by) VALUES(1,'BOT_CENTER',1,?,1)").run(t);
  const db = {
    prepare(query) {
      let bind = [];
      const statement = sql.prepare(query);
      const exec = () => {
        queries.push(query);
        return { results: statement.all(...bind), meta: { changes: sql.prepare("SELECT changes() n").get().n, last_row_id: sql.prepare("SELECT last_insert_rowid() n").get().n } };
      };
      return { bind(...params) { bind = params; return this; }, async first() { return exec().results[0] ?? null; }, async all() { return exec(); }, async run() { return exec(); }, execute: exec };
    },
    async batch(statements) {
      sql.exec("BEGIN");
      try { const out = statements.map(statement => statement.execute()); sql.exec("COMMIT"); return out; }
      catch (error) { sql.exec("ROLLBACK"); throw error; }
    },
  };
  const principal = {
    workspaceId: "workspace-test", employeeId: "bot-center-synthetic", employeeNo: "9999", displayName: "合成同事",
    workspaceRole: role, isIdentityAdmin: false, emailVerified: true, isWorkspaceSuperAdmin: role === "SUPER_ADMIN",
    credentialVersion: 1, employeeRevision: 1,
  };
  const env = {
    DB: db, IDENTITY_APPLICATION_ID: "APP_TEST", IDENTITY_WORKSPACE_ID: "workspace-test",
    IDENTITY: { async fetch() { return Response.json({ principal, session: { expiresAt: "2999-01-01T00:00:00Z" } }); } },
  };
  const cookie = "cyweb_identity_session=cyid_" + "a".repeat(64);
  const call = async (path, method = "GET", json, headers = {}) => {
    const response = await handleBotCenterRoute(new Request("https://acceptance.test" + path, {
      method, headers: { cookie, "content-type": "application/json", ...headers },
      body: json === undefined ? undefined : JSON.stringify(json),
    }), env, "bot-center-test");
    return { status: response.status, body: await response.json() };
  };
  return { sql, call, db, queries };
}
const ok = result => { assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body.data; };
const taipeiNoon = shift => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(Date.parse(`${today}T00:00:00+08:00`) + shift * 86_400_000 + 12 * 3_600_000).toISOString();
};

test("module access follows the catalog: super admin is implicit, others need BOT_CENTER", async () => {
  const admin = fixture();
  try {
    const state = ok(await admin.call("/api/bot-center"));
    assert.equal(state.canManageCredentials, true);
    assert.deepEqual(state.bots.map(bot => bot.label), ["社群小編", "內容專家", "CEO", "IT"]);
    assert.equal(admin.sql.prepare("SELECT count(*) n FROM app_member_module_access").get().n, 0);
  } finally { admin.sql.close(); }
  const user = fixture("USER");
  try { assert.equal((await user.call("/api/bot-center")).status, 403); }
  finally { user.sql.close(); }
  const granted = fixture("USER", true);
  try {
    const state = ok(await granted.call("/api/bot-center"));
    assert.equal(state.bots.length, 4);
    assert.equal(state.canManageCredentials, false);
    assert.equal((await granted.call("/api/bot-center/credentials", "POST")).status, 403);
    assert.equal((await granted.call("/api/bot-center/credentials", "DELETE")).status, 403);
    assert.equal((await granted.call("/api/bot-center/credentials")).status, 200);
  } finally { granted.sql.close(); }
});

test("ingest is authenticated, and approve or reject only writes the review result", async () => {
  const { sql, call } = fixture();
  try {
    assert.equal((await call("/api/bot-ingest/reports", "POST", { botCode: "IT", title: "回報", body: "內容" })).status, 401);
    const issued = ok(await call("/api/bot-center/credentials", "POST"));
    const auth = { authorization: "Bearer " + issued.token };
    assert.equal((await call("/api/bot-ingest/reports", "POST", { botCode: "IT", title: "回報", body: "內容" }, { authorization: "Bearer not-the-token" })).status, 401);
    const report = ok(await call("/api/bot-ingest/reports", "POST", { botCode: "IT", title: "伺服器回報", body: "今晚已檢查" }, auth));
    assert.equal(report.botLabel, "IT");
    ok(await call("/api/bot-ingest/progress", "POST", { botCode: "CEO", status: "working", summary: "在看本週安排" }, auth));
    const draft = ok(await call("/api/bot-ingest/drafts", "POST", { botCode: "SOCIAL_EDITOR", externalRef: "post-1", title: "週三貼文", body: "草稿本文" }, auth));
    assert.equal(ok(await call("/api/bot-ingest/drafts", "POST", { botCode: "SOCIAL_EDITOR", externalRef: "post-1", title: "另一篇", body: "不應覆蓋" }, auth)).id, draft.id);
    const before = {
      erp: sql.prepare("SELECT count(*) n FROM erp_item_queries").get().n,
      orders: sql.prepare("SELECT count(*) n FROM ordering_orders").get().n,
      repairs: sql.prepare("SELECT count(*) n FROM store_repairs").get().n,
    };
    const approved = ok(await call(`/api/bot-center/drafts/${draft.id}/review`, "POST", { decision: "approved", reason: "可以" }));
    assert.equal(approved.status, "approved");
    assert.equal(approved.reason, "可以");
    assert.equal(approved.reviewer.displayName, "合成同事");
    const readBack = ok(await call("/api/bot-ingest/drafts?botCode=SOCIAL_EDITOR&externalRef=post-1", "GET", undefined, auth));
    assert.equal(readBack.status, "approved");
    assert.equal(readBack.reason, "可以");
    assert.equal(readBack.title, "週三貼文");
    assert.equal((await call(`/api/bot-center/drafts/${draft.id}/review`, "POST", { decision: "rejected", reason: "再改" })).status, 409);
    assert.deepEqual({
      erp: sql.prepare("SELECT count(*) n FROM erp_item_queries").get().n,
      orders: sql.prepare("SELECT count(*) n FROM ordering_orders").get().n,
      repairs: sql.prepare("SELECT count(*) n FROM store_repairs").get().n,
    }, before);
    const rejected = ok(await call("/api/bot-ingest/drafts", "POST", { botCode: "CONTENT_EXPERT", title: "長文", body: "待退回" }, auth));
    assert.equal(ok(await call(`/api/bot-center/drafts/${rejected.id}/review`, "POST", { decision: "rejected" })).status, "rejected");
    assert.equal(ok(await call("/api/bot-ingest/drafts/" + rejected.id, "GET", undefined, auth)).reason, null);
    ok(await call("/api/bot-ingest/completions", "POST", { botCode: "IT", title: "今天這件", detail: "已處理", completedAt: taipeiNoon(0) }, auth));
    ok(await call("/api/bot-ingest/completions", "POST", { botCode: "IT", title: "昨天那件", completedAt: taipeiNoon(-1) }, auth));
    const page = ok(await call("/api/bot-center"));
    assert.equal(page.bots.find(bot => bot.code === "CEO").summary, "在看本週安排");
    assert.deepEqual(page.timeline.map(item => item.title), ["今天這件"]);
    assert.equal(page.reports[0].title, "伺服器回報");
    assert.equal(page.draftCounts.approved, 1);
    assert.equal(sql.prepare("PRAGMA table_info(bot_ingest_credentials)").all().some(column => column.name === "token"), false);
    assert.equal(sql.prepare("SELECT token_hash FROM bot_ingest_credentials").get().token_hash.length, 64);
    assert.equal((await call("/api/bot-center/credentials", "DELETE")).status, 200);
    assert.equal((await call("/api/bot-ingest/reports", "POST", { botCode: "IT", title: "失效", body: "不應寫入" }, auth)).status, 401);
  } finally { sql.close(); }
});

test("a new bot identity can be added without a migration", async () => {
  const { sql, call } = fixture();
  try {
    assert.equal((await call("/api/bot-center/credentials", "POST")).status, 200);
    const token = ok(await call("/api/bot-center/credentials", "POST")).token;
    assert.equal((await call("/api/bot-ingest/progress", "POST", { botCode: "FINANCE", status: "idle" }, { authorization: "Bearer " + token })).status, 404);
    const created = ok(await call("/api/bot-center/bots", "POST", { code: "finance", label: "財務" }));
    assert.equal(created.code, "FINANCE");
    assert.equal(ok(await call("/api/bot-ingest/progress", "POST", { botCode: "FINANCE", status: "done", summary: "月結已送出" }, { authorization: "Bearer " + token })).status, "done");
  } finally { sql.close(); }
});

test("pagination can reach older drafts, reports and completed events without duplicates", async () => {
  const { sql, call } = fixture();
  try {
    ok(await call("/api/bot-center"));
    const botId = sql.prepare("SELECT id FROM bot_profiles WHERE code='IT'").get().id;
    const day = taipeiNoon(0);
    const dayStart = Date.parse(day) - 12 * 3_600_000;
    const addDraft = sql.prepare("INSERT INTO bot_drafts(bot_id,title,body,created_at) VALUES(?,?,?,?)");
    const addReport = sql.prepare("INSERT INTO bot_reports(bot_id,title,body,reported_at) VALUES(?,?,?,?)");
    const addCompletion = sql.prepare("INSERT INTO bot_completions(bot_id,title,detail,completed_at) VALUES(?,?,?,?)");
    for (let i = 0; i < 65; i++) addDraft.run(botId, "審稿 " + i, "測試內容", day);
    for (let i = 0; i < 63; i++) addReport.run(botId, "回報 " + i, "測試內容", day);
    // Deliberately insert out of time order to exercise the (completed_at, id) keyset.
    for (let i = 0; i < 73; i++) addCompletion.run(botId, "完成 " + i, "測試內容", new Date(dayStart + ((i * 37) % 1380) * 60_000).toISOString());

    const initial = ok(await call("/api/bot-center?draftStatus=all"));
    assert.deepEqual([initial.drafts.length, initial.reports.length, initial.timeline.length], [50, 50, 50]);
    assert.equal(initial.draftsMore, true);
    assert.equal(initial.reportsMore, true);
    assert.equal(initial.timelineMore, true);
    const drafts2 = ok(await call("/api/bot-center?draftStatus=all&draftBefore=" + initial.draftNextBefore));
    const reports2 = ok(await call("/api/bot-center?reportBefore=" + initial.reportNextBefore));
    const timeline2 = ok(await call("/api/bot-center?timelineBefore=" + encodeURIComponent(initial.timelineNextBefore)));
    const drafts = [...initial.drafts, ...drafts2.drafts];
    const reports = [...initial.reports, ...reports2.reports];
    const timeline = [...initial.timeline, ...timeline2.timeline];
    assert.deepEqual([drafts.length, reports.length, timeline.length], [65, 63, 73]);
    for (const list of [drafts, reports, timeline]) assert.equal(new Set(list.map(row => row.id)).size, list.length);
    assert.equal(drafts2.draftsMore, false);
    assert.equal(reports2.reportsMore, false);
    assert.equal(timeline2.timelineMore, false);
    const order = timeline.map(row => row.completedAt + "|" + String(row.id).padStart(8, "0"));
    assert.deepEqual(order, [...order].sort().reverse(), "timeline follows date and id, not id alone");
    assert.equal((await call("/api/bot-center?timelineBefore=invalid")).status, 422);
    assert.equal((await call("/api/bot-center?draftBefore=99999999999999999")).status, 422);
  } finally { sql.close(); }
});

test("initialized BOT page reads do not write the four default identities again", async () => {
  const { sql, call } = fixture();
  try {
    ok(await call("/api/bot-center"));
    const before = sql.prepare("SELECT total_changes() AS n").get().n;
    ok(await call("/api/bot-center"));
    assert.equal(sql.prepare("SELECT total_changes() AS n").get().n, before);
  } finally { sql.close(); }
});

test("progress polling reads no drafts, reports, completions or historical counts", async () => {
  const { sql, call, queries } = fixture();
  try {
    ok(await call("/api/bot-center"));
    const token = ok(await call("/api/bot-center/credentials", "POST")).token;
    ok(await call("/api/bot-ingest/progress", "POST", { botCode: "IT", status: "working", summary: "合成進度" }, { authorization: "Bearer " + token }));
    const before = sql.prepare("SELECT total_changes() n").get().n;
    queries.length = 0;
    const page = ok(await call("/api/bot-center/progress"));
    assert.deepEqual(Object.keys(page).sort(), ["bots", "canManageCredentials", "credential"]);
    assert.equal(page.bots.find(bot => bot.code === "IT").summary, "合成進度");
    assert.equal(page.credential.configured, true);
    assert.equal(page.canManageCredentials, true);
    assert.equal(sql.prepare("SELECT total_changes() n").get().n, before);
    assert.equal(queries.filter(query => /FROM bot_profiles/i.test(query)).length, 1);
    assert.equal(queries.filter(query => /FROM bot_ingest_credentials/i.test(query)).length, 1);
    assert.equal(queries.some(query => /bot_drafts|bot_reports|bot_completions|count\s*\(/i.test(query)), false);
  } finally { sql.close(); }
  const denied = fixture("USER");
  try { assert.equal((await denied.call("/api/bot-center/progress")).status, 403); }
  finally { denied.sql.close(); }
  const granted = fixture("USER", true);
  try { assert.equal(ok(await granted.call("/api/bot-center/progress")).canManageCredentials, false); }
  finally { granted.sql.close(); }
});

test("concurrent reviews in the same millisecond have one winner and one matching audit", { timeout: 5000 }, async t => {
  const { sql, call, db } = fixture();
  try {
    const token = ok(await call("/api/bot-center/credentials", "POST")).token;
    const draft = ok(await call("/api/bot-ingest/drafts", "POST", { botCode: "IT", title: "合成並行審稿", body: "測試" }, { authorization: "Bearer " + token }));
    t.mock.method(Date.prototype, "toISOString", () => "2026-11-07T01:00:00.000Z");
    // Hold both requests after the pending read, before either atomic batch runs.
    const batch = db.batch.bind(db);
    let arrivals = 0;
    let release;
    const ready = new Promise(resolve => { release = resolve; });
    db.batch = async statements => {
      if (++arrivals === 2) release();
      await ready;
      return batch(statements);
    };
    const results = await Promise.all([
      call(`/api/bot-center/drafts/${draft.id}/review`, "POST", { decision: "approved", reason: "第一位" }),
      call(`/api/bot-center/drafts/${draft.id}/review`, "POST", { decision: "approved", reason: "第二位" }),
    ]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    assert.equal(results.find(result => result.status === 409).body.error.code, "ALREADY_REVIEWED");
    const saved = sql.prepare("SELECT review_reason FROM bot_drafts WHERE id=?").get(draft.id);
    const audits = sql.prepare("SELECT after_json FROM audit_events WHERE entity_type='bot_draft' AND entity_key=?").all(String(draft.id));
    assert.equal(audits.length, 1);
    assert.equal(JSON.parse(audits[0].after_json).reason, saved.review_reason);
    assert.equal(results.find(result => result.status === 200).body.data.reason, saved.review_reason);
  } finally { sql.close(); }
});

test("review and audit still roll back together when recording the audit fails", async () => {
  const { sql, call } = fixture();
  try {
    const token = ok(await call("/api/bot-center/credentials", "POST")).token;
    const draft = ok(await call("/api/bot-ingest/drafts", "POST", { botCode: "IT", title: "合成回滾", body: "測試" }, { authorization: "Bearer " + token }));
    sql.exec("CREATE TRIGGER reject_bot_audit BEFORE INSERT ON audit_events WHEN NEW.entity_type='bot_draft' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");
    assert.equal((await call(`/api/bot-center/drafts/${draft.id}/review`, "POST", { decision: "approved" })).status, 500);
    const saved = sql.prepare("SELECT review_status,reviewed_by,reviewed_at FROM bot_drafts WHERE id=?").get(draft.id);
    assert.equal(saved.review_status, "pending");
    assert.equal(saved.reviewed_by, null);
    assert.equal(saved.reviewed_at, null);
    assert.equal(sql.prepare("SELECT count(*) n FROM audit_events WHERE entity_type='bot_draft'").get().n, 0);
  } finally { sql.close(); }
});

test("the shell registers the page under ERP 查詢 and review does not publish", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const modules = readFileSync(new URL("../shared/modules.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../worker/http/bot-center-routes.ts", import.meta.url), "utf8");
  assert.match(modules, /code: "BOT_CENTER", route: "bot-center", label: "BOT 管理中心"/);
  assert.doesNotMatch(modules, /BOT_CENTER: \[|BOT_CENTER": \[/);
  const group = app.slice(app.indexOf('key: "erp-query"'), app.indexOf('key: "business"'));
  assert.match(group, /ERP 查詢[\s\S]*BOT 管理中心/);
  assert.equal(group.includes("#bot-center"), true);
  assert.doesNotMatch(route, /facebook|instagram|threads|enqueue|auto-?reply|publish/i);
  assert.match(route, /review_status=\?/);
  const page = readFileSync(new URL("../src/runtime/modules/BotCenterPage.tsx", import.meta.url), "utf8");
  const polling = page.slice(page.indexOf("const timer = window.setInterval"), page.indexOf("async function run"));
  assert.match(polling, /loadBotProgress\(\)/);
  assert.doesNotMatch(polling, /loadBotCenter\(/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { build } from "esbuild";

const compiled = await build({ entryPoints: ["worker/http/bot-center-routes.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { handleBotCenterRoute } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));

function fixture(role = "SUPER_ADMIN", grant = false) {
  const sql = new DatabaseSync(":memory:");
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
      const exec = () => ({ results: statement.all(...bind), meta: { changes: sql.prepare("SELECT changes() n").get().n, last_row_id: sql.prepare("SELECT last_insert_rowid() n").get().n } });
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
  return { sql, call };
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
    assert.deepEqual(state.bots.map(bot => bot.label), ["社群小編", "內容專家", "CEO", "IT"]);
    assert.equal(admin.sql.prepare("SELECT count(*) n FROM app_member_module_access").get().n, 0);
  } finally { admin.sql.close(); }
  const user = fixture("USER");
  try { assert.equal((await user.call("/api/bot-center")).status, 403); }
  finally { user.sql.close(); }
  const granted = fixture("USER", true);
  try { assert.equal(ok(await granted.call("/api/bot-center")).bots.length, 4); }
  finally { granted.sql.close(); }
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
  const { sql, call } = fixture("USER", true);
  try {
    assert.equal((await call("/api/bot-center/credentials", "POST")).status, 200);
    const token = ok(await call("/api/bot-center/credentials", "POST")).token;
    assert.equal((await call("/api/bot-ingest/progress", "POST", { botCode: "FINANCE", status: "idle" }, { authorization: "Bearer " + token })).status, 404);
    const created = ok(await call("/api/bot-center/bots", "POST", { code: "finance", label: "財務" }));
    assert.equal(created.code, "FINANCE");
    assert.equal(ok(await call("/api/bot-ingest/progress", "POST", { botCode: "FINANCE", status: "done", summary: "月結已送出" }, { authorization: "Bearer " + token })).status, "done");
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
});

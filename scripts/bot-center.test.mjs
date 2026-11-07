import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {botCenterFixture as fixture} from "./test-support/bot-center-fixture.mjs";

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
    assert.equal((await granted.call("/api/bot-center/bots/IT/credential", "POST")).status, 403);
    assert.equal((await granted.call("/api/bot-center/bots/IT/credential", "DELETE")).status, 403);
    assert.equal((await granted.call("/api/bot-center/bots/IT/credential")).status, 200);
  } finally { granted.sql.close(); }
});

test("ingest is authenticated, and approve or reject only writes the review result", async () => {
  const { sql, call } = fixture();
  try {
    assert.equal((await call("/api/bot-ingest/reports", "POST", { botCode: "IT", title: "回報", body: "內容" })).status, 401);
    const issued = ok(await call("/api/bot-center/bots/IT/credential", "POST"));
    const auth = { authorization: "Bearer " + issued.token };
    assert.equal((await call("/api/bot-ingest/reports", "POST", { botCode: "IT", title: "回報", body: "內容" }, { authorization: "Bearer not-the-token" })).status, 401);
    const report = ok(await call("/api/bot-ingest/reports", "POST", { botCode: "IT", title: "伺服器回報", body: "今晚已檢查" }, auth));
    assert.equal(report.botLabel, "IT");
    ok(await call("/api/bot-ingest/progress", "POST", { botCode: "IT", status: "working", summary: "在看本週安排" }, auth));
    const draft = ok(await call("/api/bot-ingest/drafts", "POST", { botCode: "IT", externalRef: "post-1", title: "週三貼文", body: "草稿本文" }, auth));
    assert.equal(ok(await call("/api/bot-ingest/drafts", "POST", { botCode: "IT", externalRef: "post-1", title: "另一篇", body: "不應覆蓋" }, auth)).id, draft.id);
    const before = {
      erp: sql.prepare("SELECT count(*) n FROM erp_item_queries").get().n,
      orders: sql.prepare("SELECT count(*) n FROM ordering_orders").get().n,
      repairs: sql.prepare("SELECT count(*) n FROM store_repairs").get().n,
    };
    const approved = ok(await call(`/api/bot-center/drafts/${draft.id}/review`, "POST", { decision: "approved", reason: "可以" }));
    assert.equal(approved.status, "approved");
    assert.equal(approved.reason, null);
    assert.equal(approved.reviewer.displayName, "合成同事");
    const readBack = ok(await call("/api/bot-ingest/drafts?botCode=IT&externalRef=post-1", "GET", undefined, auth));
    assert.equal(readBack.status, "approved");
    assert.equal(readBack.reason, null);
    assert.equal(readBack.title, "週三貼文");
    assert.equal((await call(`/api/bot-center/drafts/${draft.id}/review`, "POST", { decision: "rejected", reason: "再改" })).status, 409);
    assert.deepEqual({
      erp: sql.prepare("SELECT count(*) n FROM erp_item_queries").get().n,
      orders: sql.prepare("SELECT count(*) n FROM ordering_orders").get().n,
      repairs: sql.prepare("SELECT count(*) n FROM store_repairs").get().n,
    }, before);
    const rejected = ok(await call("/api/bot-ingest/drafts", "POST", { botCode: "IT", title: "長文", body: "待退回" }, auth));
    assert.equal(ok(await call(`/api/bot-center/drafts/${rejected.id}/review`, "POST", { decision: "rejected", reason: "請補充" })).status, "rejected");
    assert.equal(ok(await call("/api/bot-ingest/drafts/" + rejected.id, "GET", undefined, auth)).reason, "請補充");
    ok(await call("/api/bot-ingest/completions", "POST", { botCode: "IT", title: "今天這件", detail: "已處理", completedAt: taipeiNoon(0) }, auth));
    ok(await call("/api/bot-ingest/completions", "POST", { botCode: "IT", title: "昨天那件", completedAt: taipeiNoon(-1) }, auth));
    const page = ok(await call("/api/bot-center"));
    assert.equal(page.bots.find(bot => bot.code === "IT").summary, "在看本週安排");
    assert.deepEqual(page.timeline.map(item => item.title), ["今天這件"]);
    assert.equal(page.reports[0].title, "伺服器回報");
    assert.equal(page.draftCounts.approved, 1);
    assert.equal(sql.prepare("PRAGMA table_info(bot_ingest_credentials)").all().some(column => column.name === "token"), false);
    assert.equal(sql.prepare("SELECT token_hash FROM bot_ingest_credentials").get().token_hash.length, 64);
    assert.equal((await call("/api/bot-center/bots/IT/credential", "DELETE")).status, 200);
    assert.equal((await call("/api/bot-ingest/reports", "POST", { botCode: "IT", title: "失效", body: "不應寫入" }, auth)).status, 401);
  } finally { sql.close(); }
});

test("a new bot identity receives its own credential without another migration", async () => {
  const {sql,call}=fixture();try{
    assert.equal((await call('/api/bot-center/bots/FINANCE/credential','POST')).status,404);
    const created=ok(await call('/api/bot-center/bots','POST',{code:'finance',label:'財務'}));
    assert.equal(created.code,'FINANCE');
    const token=ok(await call('/api/bot-center/bots/FINANCE/credential','POST')).token;
    assert.equal(ok(await call('/api/bot-ingest/progress','POST',{botCode:'FINANCE',status:'done',summary:'月結已送出'},{authorization:'Bearer '+token})).status,'done');
  }finally{sql.close()}
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

test("dashboard counts are complete, Taipei-day bounded and independent of bot-filtered keyset pages", async () => {
 const {sql,call}=fixture();
 try{
  ok(await call('/api/bot-center'));
  const it=sql.prepare("SELECT id FROM bot_profiles WHERE code='IT'").get().id;
  const ceo=sql.prepare("SELECT id FROM bot_profiles WHERE code='CEO'").get().id;
  const day=taipeiNoon(0),start=new Date(Date.parse(day)-12*3600000).toISOString(),end=new Date(Date.parse(start)+86400000).toISOString();
  const draft=sql.prepare('INSERT INTO bot_drafts(bot_id,title,body,created_at) VALUES(?,?,?,?)');
  const report=sql.prepare('INSERT INTO bot_reports(bot_id,title,body,reported_at) VALUES(?,?,?,?)');
  const complete=sql.prepare('INSERT INTO bot_completions(bot_id,title,completed_at) VALUES(?,?,?)');
  for(let i=0;i<65;i++)draft.run(it,'合成待審 '+i,'本文',day);
  for(let i=0;i<3;i++)draft.run(ceo,'其他待審 '+i,'本文',day);
  sql.prepare("INSERT INTO bot_drafts(bot_id,title,body,review_status,reviewed_by,reviewed_at,created_at) VALUES(?,'合成已審','本文','approved',1,?,?)").run(it,day,day);
  for(let i=0;i<55;i++)report.run(it,'合成回報 '+i,'本文',day);
  report.run(ceo,'其他回報','本文',day);
  for(let i=0;i<60;i++)complete.run(it,'合成完成 '+i,day);
  for(let i=0;i<5;i++)complete.run(ceo,'其他完成 '+i,day);
  complete.run(it,'當日邊界',start);
  complete.run(it,'隔日邊界',end);
  complete.run(it,'昨日',new Date(Date.parse(start)-1).toISOString());
  const global=ok(await call('/api/bot-center'));
  assert.equal(global.botCode,null);
  assert.equal(global.draftCounts.pending,68);
  assert.equal(global.botStats.IT.todayCompleted,61);
  assert.equal(global.botStats.CEO.todayCompleted,5);
  assert.deepEqual(global.botStats.SOCIAL_EDITOR,{todayCompleted:0,draftCounts:{pending:0,approved:0,rejected:0}});
  const page=ok(await call('/api/bot-center?botCode=IT'));
  assert.equal(page.botCode,'IT');
  assert.deepEqual(page.draftCounts,{pending:65,approved:1,rejected:0});
  assert.equal(page.botStats.CEO.todayCompleted,5,'global card totals remain available when one bot is selected');
  for(const key of ['drafts','reports','timeline']){assert.equal(page[key].length,50);assert(page[key].every(row=>row.botCode==='IT'))}
  const older=ok(await call('/api/bot-center?botCode=IT&draftBefore='+page.draftNextBefore+'&reportBefore='+page.reportNextBefore+'&timelineBefore='+encodeURIComponent(page.timelineNextBefore)));
  assert.deepEqual([older.drafts.length,older.reports.length,older.timeline.length],[15,5,11]);
  for(const key of ['drafts','reports','timeline'])assert.equal(new Set([...page[key],...older[key]].map(row=>row.id)).size,page[key].length+older[key].length);
  assert.deepEqual(older.botStats,page.botStats);
  const approved=ok(await call('/api/bot-center?botCode=IT&draftStatus=approved'));
  assert.equal(approved.drafts.length,1);assert.equal(approved.drafts[0].status,'approved');
  assert.equal((await call('/api/bot-center?botCode=UNKNOWN')).status,404);
  assert.equal((await call('/api/bot-center?botCode=')).status,422);
 }finally{sql.close()}
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
    const token = ok(await call("/api/bot-center/bots/IT/credential", "POST")).token;
    ok(await call("/api/bot-ingest/progress", "POST", { botCode: "IT", status: "working", summary: "合成進度" }, { authorization: "Bearer " + token }));
    const before = sql.prepare("SELECT total_changes() n").get().n;
    queries.length = 0;
    const page = ok(await call("/api/bot-center/progress"));
    assert.deepEqual(Object.keys(page).sort(), ["bots", "canManageCredentials", "credentials", "pushReady", "pushSettings"]);
    assert.equal(page.bots.find(bot => bot.code === "IT").summary, "合成進度");
    assert.equal(page.credentials.find(row=>row.botCode==="IT").configured, true);
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
    const token = ok(await call("/api/bot-center/bots/IT/credential", "POST")).token;
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
      call(`/api/bot-center/drafts/${draft.id}/review`, "POST", { decision: "rejected", reason: "第一位" }),
      call(`/api/bot-center/drafts/${draft.id}/review`, "POST", { decision: "rejected", reason: "第二位" }),
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
    const token = ok(await call("/api/bot-center/bots/IT/credential", "POST")).token;
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
  assert.doesNotMatch(route, /fetch\(\s*["']https?:|enqueue\(|auto-?reply/i);
  assert.match(route, /review_status=\?/);
  const page = readFileSync(new URL("../src/runtime/modules/BotCenterPage.tsx", import.meta.url), "utf8");
  const polling = page.slice(page.indexOf("const timer = window.setInterval"), page.indexOf("async function run"));
  assert.match(polling, /loadBotProgress\(\)/);
  assert.doesNotMatch(polling, /loadBotCenter\(/);
});

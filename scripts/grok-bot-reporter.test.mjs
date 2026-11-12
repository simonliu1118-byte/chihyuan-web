import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { botCenterFixture } from "./test-support/bot-center-fixture.mjs";
import { configFromEnv, createReporter, redact } from "../integrations/grok-bot/cyweb-work-reporter/scripts/client.mjs";
const fakeToken = "synthetic-test-only-credential-0000000000";
test("distributed skill has complete metadata and all referenced local resources", async () => {
  const root = new URL("../integrations/grok-bot/cyweb-work-reporter/", import.meta.url);
  const skill = await readFile(new URL("SKILL.md", root), "utf8");
  const front = skill.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(front, "skill frontmatter is required");
  const metadata = Object.fromEntries(front[1].split(/\r?\n/).map(line => {
    const match = line.match(/^(name|description): (.+)$/);
    assert.ok(match, "only the two scalar metadata fields are expected");
    return [match[1], match[2]];
  }));
  assert.match(metadata.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(metadata.name.length <= 64);
  assert.ok(metadata.description.length > 0 && metadata.description.length <= 1024);
  assert.equal(/[<>]/.test(metadata.description), false);
  assert.equal(/^\s*\[TODO:[^\n]*\]\s*$/m.test(skill), false);
  for (const file of ["scripts/client.mjs", "scripts/cyweb-reporter.mjs", ...[...skill.matchAll(/\]\((references\/[^)]+)\)/g)].map(match => match[1])]) {
    await access(new URL(file, root));
  }
});
const code = (expected) => (error) => error.code === expected;
test("webhook wakeups read only their own fresh result and never approve or publish", async t => {
  const f = await setup(t);
  const draft = await f.client.run("submit", {externalRef:"synthetic-push",title:"合成稿",body:"合成內容"});
  const event = {type:"cyweb.review_result",eventId:"bot-review-"+draft.id,botCode:"SOCIAL_EDITOR",draftId:draft.id};
  const before = f.calls.length;
  for (const invalid of [{},null,{...event,draftId:undefined},{...event,botCode:"FINANCE"},{...event,eventId:"other"},{...event,decision:"approved"}]) {
    assert.deepEqual(await f.client.run("review-notification", invalid), {ignored:true,reason:"invalid_notification",notifyHuman:false});
  }
  assert.equal(f.calls.length,before,"untrusted payloads must not query");
  assert.deepEqual(await f.client.run("review-notification",event), {ignored:true,reason:"review_pending",notifyHuman:false});
  data(await f.call(`/api/bot-center/drafts/${draft.id}/review`,"POST",{decision:"rejected",reason:"合成退回理由"}));
  const result = await f.client.run("review-notification",event);
  assert.equal(result.ignored,false); assert.equal(result.review.status,"rejected"); assert.equal(result.review.reason,"合成退回理由");
  assert.equal(result.automaticPublication,false);
  assert.deepEqual(await f.client.run("review-notification",event),result,"repeat wakeups still read the authoritative result");
  assert.equal(f.calls.at(-1).path,`/api/bot-ingest/drafts/${draft.id}`);
  assert.deepEqual(await f.client.run("review-notification",{...event,draftId:99999,eventId:"bot-review-99999"}),{ignored:true,reason:"draft_not_found",notifyHuman:false});
  const other = data(await f.call('/api/bot-center/bots/FINANCE/credential','POST')).token;
  const foreign = data(await f.call('/api/bot-ingest/drafts','POST',{title:"別人",body:"別人內容",externalRef:"foreign"},{authorization:'Bearer '+other}));
  assert.equal((await f.client.run("review-notification",{...event,draftId:foreign.id,eventId:"bot-review-"+foreign.id})).ignored,true);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM bot_completions').get().n,0);
});
const data = (result) => {
  assert.equal(result.status, 200);
  return result.body.data;
};
async function sandbox(t) {
  const parent = resolve(tmpdir()), dir = await mkdtemp(join(parent, "cyweb-reporter-test-"));
  t.after(async () => {
    const target = resolve(dir);
    assert.ok(target.startsWith(parent + sep));
    assert.ok(target.split(sep).at(-1).startsWith("cyweb-reporter-test-"));
    await rm(target, { recursive: true, force: true });
  });
  return dir;
}
async function setup(t) {
  const fixture = botCenterFixture();
  t.after(() => fixture.sql.close());
  data(await fixture.call("/api/bot-center"));
  const token = data(await fixture.call("/api/bot-center/bots/SOCIAL_EDITOR/credential", "POST")).token;
  const config = { origin: "https://synthetic.test", token, botCode: "SOCIAL_EDITOR", stateDir: await sandbox(t) };
  const calls = [];
  const fetchImpl = async (url, options) => {
    const at = new URL(url);
    calls.push({ path: at.pathname, options });
    if (at.pathname === "/api/health") return Response.json({ ok: true, data: { service: "cyweb", database: "ok", version: "synthetic" } });
    assert.ok(at.pathname.startsWith("/api/bot-ingest/"));
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.cookie, void 0);
    if (options.body instanceof Uint8Array) {
      const raw = await fixture.raw(at.pathname + at.search, options.method, options.body, options.headers);
      return Response.json(await raw.json(), { status: raw.status });
    }
    const result = await fixture.call(at.pathname + at.search, options.method, options.body === void 0 ? void 0 : JSON.parse(options.body), options.headers);
    return Response.json(result.body, { status: result.status });
  };
  return { ...fixture, config, calls, fetchImpl, client: createReporter(config, { fetchImpl }) };
}
test("configuration rejects insecure destinations and never accepts per-message identity or endpoint overrides", async (t) => {
  const env = { CYWEB_BASE_URL: "https://synthetic.test", CYWEB_BOT_TOKEN: fakeToken, CYWEB_BOT_CODE: "SOCIAL_EDITOR", CYWEB_REPORTER_STATE_DIR: await sandbox(t) };
  assert.equal(configFromEnv(env).origin, "https://synthetic.test");
  for (const url of ["http://synthetic.test", "https://user:pass@synthetic.test", "https://synthetic.test/api", "https://synthetic.test/?secret=1", "https://synthetic.test/#token"]) assert.throws(() => configFromEnv({ ...env, CYWEB_BASE_URL: url }), code("CONFIG_INVALID"));
  assert.throws(() => configFromEnv({ ...env, CYWEB_ALLOW_LOCAL_HTTP: "1", CYWEB_BASE_URL: "http://synthetic.test" }), code("CONFIG_INVALID"));
  assert.equal(configFromEnv({ ...env, CYWEB_ALLOW_LOCAL_HTTP: "1", CYWEB_BASE_URL: "http://127.0.0.1:1234" }).origin, "http://127.0.0.1:1234");
  for (const key of Object.keys(env)) assert.throws(() => configFromEnv({ ...env, [key]: "" }), code("CONFIG_INVALID"));
  let fetched = false;
  const client = createReporter(configFromEnv(env), { fetchImpl: async () => {
    fetched = true;
    throw Error("must not fetch");
  } });
  await assert.rejects(client.run("progress", { status: "working", botCode: "CEO" }), code("INPUT_INVALID"));
  await assert.rejects(client.run("report", { eventId: "one", title: "test", body: "test", url: "https://elsewhere.test" }), code("INPUT_INVALID"));
  await assert.rejects(client.run("submit", { externalRef: "secret", title: "test", body: fakeToken }), code("INPUT_CONTAINS_SECRET"));
  await assert.rejects(client.run("review", { externalRef: fakeToken }), code("INPUT_CONTAINS_SECRET"));
  await assert.rejects(client.run("approve", {}), code("COMMAND_INVALID"));
  assert.equal(fetched, false);
  assert.deepEqual(redact({ nested: [fakeToken] }, fakeToken), { nested: ["[REDACTED]"] });
});
test("small-editor pilot uses the real Worker approval flow, blocks pending work, and tolerates replay", async (t) => {
  const f = await setup(t), input = { reference: "synthetic-pilot-01" };
  const check = await f.client.run("check");
  assert.equal(check.credentialAccepted, true);
  assert.equal(f.calls[0].options.headers.authorization, void 0);
  const first = await f.client.run("pilot-start", input);
  const second = await f.client.run("pilot-start", input);
  assert.equal(first.draft.id, second.draft.id);
  assert.equal(first.needsHumanApproval, true);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM bot_drafts").get().n, 1);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM bot_reports").get().n, 1);
  await assert.rejects(f.client.run("pilot-finish", input), code("APPROVAL_PENDING"));
  assert.equal(f.sql.prepare("SELECT count(*) n FROM bot_completions").get().n, 0);
  data(await f.call(`/api/bot-center/drafts/${first.draft.id}/review`, "POST", { decision: "approved", reason: "\u5408\u6210\u6838\u51C6" }));
  assert.equal((await f.client.run("review", { externalRef: input.reference })).status, "approved");
  const finished = await f.client.run("pilot-finish", input);
  assert.equal(finished.externalPublication, false);
  assert.equal((await f.client.run("pilot-finish", input)).completion.duplicateSuppressed, true);
  const page = data(await f.call("/api/bot-center"));
  assert.equal(page.botStats.SOCIAL_EDITOR.todayCompleted, 1);
  assert.equal(page.botStats.SOCIAL_EDITOR.draftCounts.pending, 0);
  assert.equal(page.bots.find((bot) => bot.code === "SOCIAL_EDITOR").status, "done");
  assert.equal(f.sql.prepare("SELECT count(*) n FROM bot_completions").get().n, 1);
  await assert.rejects(f.client.run("submit", { externalRef: input.reference, title: "\u6539\u7A3F", body: "\u4E0D\u80FD\u8986\u84CB\u5DF2\u6838\u51C6\u5167\u5BB9" }), code("DRAFT_REVISION_REQUIRED"));
  assert.ok(f.calls.every((call) => call.path === "/api/health" || call.path.startsWith("/api/bot-ingest/")));
});
test("rejected review cannot finish; non-editor roles cannot run the pilot", async (t) => {
  const f = await setup(t), input = { reference: "synthetic-rejected" };
  const draft = await f.client.run("submit", { externalRef: input.reference, title: "\u5408\u6210\u8349\u7A3F", body: "\u5408\u6210\u5167\u5BB9" });
  data(await f.call(`/api/bot-center/drafts/${draft.id}/review`, "POST", { decision: "rejected", reason: "\u5408\u6210\u9000\u56DE" }));
  await assert.rejects(f.client.run("pilot-finish", input), code("REVIEW_REJECTED"));
  assert.equal(f.sql.prepare("SELECT count(*) n FROM bot_completions").get().n, 0);
  await assert.rejects(createReporter({ ...f.config, botCode: "FINANCE" }, { fetchImpl: f.fetchImpl }).run("pilot-start", input), code("PILOT_ROLE_INVALID"));
});
test("receipt replay suppresses duplicate reports, detects conflicts, and stores no report content or credentials", async (t) => {
  const f = await setup(t), input = { eventId: "synthetic-report-1", title: "unique-private-title", body: "unique-private-body" };
  const first = await f.client.run("report", input);
  const fresh = createReporter(f.config, { fetchImpl: f.fetchImpl });
  assert.equal((await fresh.run("report", input)).id, first.id);
  assert.equal(f.calls.filter((call) => call.options.method === "POST").length, 1);
  await assert.rejects(fresh.run("report", { ...input, body: "changed" }), code("EVENT_CONFLICT"));
  const receipt = await readFile(join(f.config.stateDir, (await readdir(f.config.stateDir))[0]), "utf8");
  for (const hidden of [f.config.token, input.title, input.body, input.eventId]) assert.equal(receipt.includes(hidden), false);
  assert.equal(JSON.parse(receipt).status, "delivered");
});
test("a write accepted by Worker followed by a dropped response remains blocked across process restarts", async (t) => {
  const f = await setup(t), input = { eventId: "synthetic-uncertain", title: "\u5408\u6210\u56DE\u5831", body: "\u53EA\u53EF\u9001\u4E00\u6B21" };
  let posts = 0;
  const dropping = createReporter(f.config, { fetchImpl: async (url, options) => {
    posts++;
    await f.fetchImpl(url, options);
    throw Error("synthetic disconnected");
  } });
  await assert.rejects(dropping.run("report", input), code("DELIVERY_UNCERTAIN"));
  await assert.rejects(createReporter(f.config, { fetchImpl: f.fetchImpl }).run("report", input), code("DELIVERY_UNCERTAIN"));
  assert.equal(posts, 1);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM bot_reports").get().n, 1);
});
test("known authentication rejection allows a corrected retry, while simultaneous sends write at most once", async (t) => {
  const f = await setup(t), input = { eventId: "synthetic-auth-retry", title: "\u5408\u6210\u56DE\u5831", body: "\u5408\u6210\u5167\u5BB9" };
  const denied = createReporter({ ...f.config, token: fakeToken }, { fetchImpl: f.fetchImpl });
  await assert.rejects(denied.run("report", input), code("BOT_UNAUTHORIZED"));
  assert.deepEqual(await readdir(f.config.stateDir), []);
  await f.client.run("report", input);
  const concurrent = { ...input, eventId: "synthetic-race" };
  const results = await Promise.allSettled([f.client.run("report", concurrent), createReporter(f.config, { fetchImpl: f.fetchImpl }).run("report", concurrent)]);
  assert.ok(results.some((result) => result.status === "fulfilled"));
  for (const result of results) if (result.status === "rejected") assert.equal(result.reason.code, "DELIVERY_UNCERTAIN");
  assert.equal(f.sql.prepare("SELECT count(*) n FROM bot_reports").get().n, 2);
});
test('check verifies the token owner and typed completions retain server deduplication across clients',async t=>{
 const f=await setup(t);
 await assert.rejects(createReporter({...f.config,botCode:'FINANCE'},{fetchImpl:f.fetchImpl}).run('check'),code('BOT_SCOPE_MISMATCH'));
 const input={eventId:'synthetic-article-1',title:'合成文章已發布',detail:'合成平台',workType:'article_published'};
 const first=await f.client.run('complete',input);
 const another=createReporter({...f.config,stateDir:await sandbox(t)},{fetchImpl:f.fetchImpl});
 assert.equal((await another.run('complete',input)).id,first.id);
 const page=data(await f.call('/api/bot-center'));
 assert.equal(page.workSummary.articles.count,1);assert.equal(page.timeline[0].workType,'article_published');
 await assert.rejects(f.client.run('complete',{...input,eventId:'invalid',workType:'arbitration'}),code('INPUT_INVALID'));
});

test('old general-completion receipts remain usable after the classified-client upgrade',async t=>{
 const f=await setup(t),input={eventId:'synthetic-old-receipt',title:'合成舊版完成',detail:'合成內容'};
 const hash=value=>createHash('sha256').update(value).digest('hex');
 const fingerprint=hash(JSON.stringify({payload:{botCode:f.config.botCode,title:input.title,detail:input.detail}}));
 const filename=hash(JSON.stringify([f.config.origin,f.config.botCode,'completions',input.eventId]))+'.json';
 await writeFile(join(f.config.stateDir,filename),JSON.stringify({status:'delivered',fingerprint,id:123}));
 const completed=await f.client.run('complete',input);assert.equal(completed.id,123);assert.equal(completed.duplicateSuppressed,true);
 assert.equal(f.calls.length,0);
 await assert.rejects(f.client.run('complete',{...input,workType:'article_published'}),code('EVENT_CONFLICT'));
});

function cli(args, input, env) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, ["integrations/grok-bot/cyweb-work-reporter/scripts/cyweb-reporter.mjs", ...args], { env: { ...process.env, CYWEB_BASE_URL: "", CYWEB_BOT_TOKEN: "", CYWEB_BOT_CODE: "", CYWEB_REPORTER_STATE_DIR: "", ...env }, windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", (part) => stdout += part);
    child.stderr.on("data", (part) => stderr += part);
    child.on("error", reject);
    child.on("close", (status) => resolveResult({ status, stdout, stderr }));
    child.stdin.end(input);
  });
}
test("portable CLI works via real HTTP, consumes JSON stdin, and does not reveal credentials on errors", async (t) => {
  const dir = await sandbox(t), requests = [];
  const server = createServer((req, res) => {
    requests.push({ url: req.url, auth: req.headers.authorization });
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/health") res.end(JSON.stringify({ ok: true, data: { service: "cyweb", database: "ok", version: "synthetic" } }));
    else if (req.url === "/api/bot-ingest/identity") res.end(JSON.stringify({ok:true,data:{botCode:"SOCIAL_EDITOR",botLabel:"合成小編"}}));
    else {
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: { code: "BOT_NOT_FOUND", message: "\u5408\u6210\u4E0D\u5B58\u5728" } }));
    }
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  t.after(() => new Promise((done) => server.close(done)));
  const env = { CYWEB_BASE_URL: `http://127.0.0.1:${server.address().port}`, CYWEB_ALLOW_LOCAL_HTTP: "1", CYWEB_BOT_TOKEN: fakeToken, CYWEB_BOT_CODE: "SOCIAL_EDITOR", CYWEB_REPORTER_STATE_DIR: dir };
  assert.equal((await cli(["--help"], "", {})).status, 0);
  const checked = await cli(["check"], "{}", env);
  assert.equal(checked.status, 0, checked.stdout);
  assert.equal(JSON.parse(checked.stdout).data.credentialAccepted, true);
  assert.equal(requests[0].auth, void 0);
  assert.equal(requests[1].auth, "Bearer " + fakeToken);
  for (const [args, input] of [[["check", fakeToken], "{}"], [["progress"], "{"], [["progress"], JSON.stringify({ status: "working", summary: fakeToken })], [["report"], "x".repeat(64001)]]) {
    const result = await cli(args, input, env);
    assert.equal(result.status, 1);
    assert.equal(result.stdout.includes(fakeToken), false);
    assert.equal(result.stderr.includes(fakeToken), false);
    assert.equal(JSON.parse(result.stdout).ok, false);
  }
  assert.equal(requests.length, 2);
});

test("patrol and post drafts go item by item; images and sent reports only touch approved work", async t => {
  const f = await setup(t);
  const store = new Map();
  f.env.HR_FILES = { async put(k, v) { store.set(k, v) }, async get(k) { return store.has(k) ? { body: store.get(k) } : null }, async delete(keys) { for (const k of [].concat(keys)) store.delete(k) } };
  const items = [{ ref: "t-1", title: "回覆甲", body: "合成回覆一" }, { title: "回覆乙", body: "合成回覆二" }];
  const draft = await f.client.run("submit", { externalRef: "synthetic-patrol-r1", title: "合成海巡", body: "合成說明", kind: "patrol", items });
  assert.equal(draft.kind, "patrol");
  assert.deepEqual(draft.items.map(i => [i.seq, i.ref, i.status]), [[1, "t-1", "pending"], [2, null, "pending"]]);
  assert.equal((await f.client.run("submit", { externalRef: "synthetic-patrol-r1", title: "合成海巡", body: "合成說明", kind: "patrol", items })).id, draft.id);
  await assert.rejects(f.client.run("submit", { externalRef: "synthetic-patrol-r1", title: "合成海巡", body: "合成說明", kind: "patrol", items: items.slice(0, 1) }), code("DRAFT_REVISION_REQUIRED"));
  await assert.rejects(f.client.run("submit", { externalRef: "synthetic-x", title: "a", body: "b", kind: "patrol" }), code("INPUT_INVALID"));
  await assert.rejects(f.client.run("submit", { externalRef: "synthetic-x", title: "a", body: "b", kind: "general", items }), code("INPUT_INVALID"));
  const dir = await sandbox(t), png = join(dir, "shot.png"), txt = join(dir, "note.png");
  await writeFile(png, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]));
  await writeFile(txt, "<html>not an image</html>");
  const uploaded = await f.client.run("image", { externalRef: "synthetic-patrol-r1", item: 2, file: png });
  assert.equal(uploaded.item, 2); assert.equal(uploaded.contentType, "image/png");
  await assert.rejects(f.client.run("image", { externalRef: "synthetic-patrol-r1", file: txt }), code("INPUT_INVALID"));
  await assert.rejects(f.client.run("image", { externalRef: "synthetic-patrol-r1", file: "shot.png" }), code("INPUT_INVALID"));
  await assert.rejects(f.client.run("sent", { externalRef: "synthetic-patrol-r1", items: [1] }), code("APPROVAL_PENDING"));
  data(await f.call(`/api/bot-center/drafts/${draft.id}/items/2/review`, "POST", { decision: "rejected", reason: "合成退回" }));
  data(await f.call(`/api/bot-center/drafts/${draft.id}/items/1/review`, "POST", { decision: "approved" }));
  const review = await f.client.run("review", { externalRef: "synthetic-patrol-r1" });
  assert.equal(review.status, "approved"); assert.equal(review.reason, "部分通過");
  assert.deepEqual(review.items.map(i => [i.seq, i.status, i.reason]), [[1, "approved", null], [2, "rejected", "合成退回"]]);
  await assert.rejects(f.client.run("image", { externalRef: "synthetic-patrol-r1", file: png }), code("ALREADY_REVIEWED"));
  await assert.rejects(f.client.run("sent", { externalRef: "synthetic-patrol-r1", items: [1, 2] }), code("ITEM_NOT_APPROVED"));
  assert.equal((await f.client.run("sent", { externalRef: "synthetic-patrol-r1", items: [1] })).newlySent, 1);
  assert.equal((await f.client.run("sent", { externalRef: "synthetic-patrol-r1", items: [1] })).newlySent, 0);
  assert.ok((await f.client.run("review", { externalRef: "synthetic-patrol-r1" })).items[0].sentAt);
});

test('new draft references replace the previous revision and stale wakeups stop silently',async t=>{
 const f=await setup(t),a=await f.client.run('submit',{externalRef:'replace-r1',title:'合成初稿',body:'合成全文'});
 data(await f.call(`/api/bot-center/drafts/${a.id}/review`,'POST',{decision:'approved'}));
 const b=await f.client.run('submit',{externalRef:'replace-r2',previousDraftId:a.id,title:'合成新版',body:'新版全文'});assert.equal(b.revisionNumber,2);assert.notEqual(a.id,b.id);assert.equal(b.status,'pending');
 assert.equal((await f.client.run('submit',{externalRef:'replace-r2',previousDraftId:a.id,title:'合成新版',body:'新版全文'})).id,b.id);
 await assert.rejects(f.client.run('sent',{externalRef:'replace-r1'}),code('DRAFT_SUPERSEDED'));
 assert.deepEqual(await f.client.run('review-notification',{type:'cyweb.review_result',eventId:'bot-review-'+a.id,botCode:'SOCIAL_EDITOR',draftId:a.id}),{ignored:true,reason:'draft_superseded',notifyHuman:false});
});

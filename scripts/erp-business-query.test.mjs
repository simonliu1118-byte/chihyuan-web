import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { taipeiToday } from "../shared/erp-query-history.ts";

// ERP 客戶／銷貨銷退／未收款 queries and the 標準進價 grant, through the actual Worker routes with
// synthetic values only.
const compiled = await build({ entryPoints: ["worker/http/erp-item-query-routes.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { handleErpItemQueryRoute } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const TOKEN = "t".repeat(43);

function fixture(role = "USER") {
  const sql = new DatabaseSync(":memory:");
  for (const file of readdirSync(new URL("../migrations/", import.meta.url)).filter(f => f.endsWith(".sql")).sort())
    sql.exec(readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8"));
  const db = { prepare(query) { let values = []; const statement = sql.prepare(query); const execute = () => ({ results: statement.all(...values), meta: { changes: sql.prepare("SELECT changes() AS n").get().n, last_row_id: sql.prepare("SELECT last_insert_rowid() AS n").get().n } }); return {
    bind(...params) { values = params; return this; }, async first() { return execute().results[0] ?? null; }, async all() { return execute(); }, async run() { return execute(); }, execute,
  }; }, async batch(statements) { sql.exec("BEGIN"); try { const results = statements.map(s => s.execute()); sql.exec("COMMIT"); return results; } catch (error) { sql.exec("ROLLBACK"); throw error; } } };
  const env = { DB: db, IDENTITY_APPLICATION_ID: "APP_TEST", IDENTITY_WORKSPACE_ID: "workspace-test", IDENTITY: { async fetch() { return Response.json({ principal: { workspaceId: "workspace-test", employeeId: "erp-business-synthetic", employeeNo: "0097", displayName: "Synthetic", workspaceRole: role, isIdentityAdmin: false, emailVerified: true, isWorkspaceSuperAdmin: role === "SUPER_ADMIN", credentialVersion: 1, employeeRevision: 1 }, session: { expiresAt: "2999-01-01T00:00:00Z" } }); } } };
  const now = new Date().toISOString();
  sql.prepare("INSERT INTO erp_item_agent_credentials(id,token_hash,created_at) VALUES(1,?,?)").run(createHash("sha256").update(TOKEN).digest("hex"), now);
  const call = (path, method, body, agent = false) => handleErpItemQueryRoute(new Request("https://acceptance.test" + path, {
    method, headers: { "content-type": "application/json", ...(agent ? { authorization: "Bearer " + TOKEN } : { cookie: "cyweb_identity_session=cyid_" + "a".repeat(64) }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env, "erp-business-synthetic");
  const json = async response => ({ status: response.status, body: await response.json() });
  const user = {
    create: async body => json(await call("/api/erp/item-queries", "POST", body)),
    load: async id => json(await call("/api/erp/item-queries/" + id, "GET")),
  };
  const agent = {
    claim: async queryTypes => json(await call("/api/erp-agent/item-queries/claim", "POST", { agentVersion: "test", erpState: "BROWSE", ...(queryTypes ? { queryTypes } : {}) }, true)),
    complete: async (id, body) => json(await call(`/api/erp-agent/item-queries/${id}/complete`, "POST", { elapsedMs: 1000, agentVersion: "test", ...body }, true)),
  };
  const grant = code => {
    sql.prepare("INSERT OR IGNORE INTO app_members(identity_employee_id,employee_no,is_active,created_at,updated_at) VALUES('erp-business-synthetic','0097',1,?,?)").run(now, now);
    const member = sql.prepare("SELECT id FROM app_members WHERE identity_employee_id='erp-business-synthetic'").get();
    sql.prepare("INSERT INTO app_member_module_access(member_id,module_code,enabled,updated_at) VALUES(?,?,1,?)").run(member.id, code, now);
  };
  return { sql, user, agent, grant };
}
const ALL_TYPES = ["ITEM_NO", "ITEM_NAME", "CUSTOMER_NO", "CUSTOMER_NAME", "SALES", "RECEIVABLE"];
const line = (seq, extra = {}) => ({ seq, itemCode: "X0001", itemName: "假品名", specification: "", warehouse: "W01 假倉", quantity: "1", unit: "包", unitPrice: "100", amount: "100", giftType: "", giftQuantity: "0", batch: "", note: "", sourceOrder: "", ...extra });
const order = (extra = {}) => ({ kind: "銷貨", orderNo: "901A-20260101001", date: taipeiToday(), customerCode: "CU0001", customerName: "假客戶", salesperson: "假業務", department: "", paymentTerm: "", taxType: "", invoiceType: "", totalQuantity: "1", amount: "100", tax: "0", total: "100", note: "", reason: "", lines: [line(1)], ...extra });
const bill = (extra = {}) => ({ customerCode: "CU0001", customerName: "假客戶", date: taipeiToday(), billNo: "903A-20260101001", salespersonCode: "SP01", salespersonName: "假業務", invoiceNo: "", currency: "NTD", receivable: "100", receivableTax: "0", unpaid: "100", vouchers: [{ voucherNo: "901A-20260101001", date: taipeiToday(), amount: "100", tax: "0" }], ...extra });

test("each query type needs its own ERP grant", async () => {
  const { sql, user, grant } = fixture();
  try {
    assert.equal((await user.create({ queryType: "CUSTOMER_NO", customerCode: "CU0001" })).status, 403);
    grant("ERP_ITEM_QUERY");
    assert.equal((await user.create({ queryType: "RECEIVABLE", scope: "ALL" })).status, 403);
    grant("ERP_CUSTOMER_QUERY");
    const created = await user.create({ queryType: "CUSTOMER_NO", customerCode: " CU0001 " });
    assert.equal(created.status, 202, JSON.stringify(created.body));
    assert.equal(created.body.data.code, "CU0001");
  } finally { sql.close(); }
});

test("codes are letters and digits; requests refuse fields of other types", async () => {
  const { sql, user } = fixture("SUPER_ADMIN");
  try {
    for (const body of [{ queryType: "CUSTOMER_NO", customerCode: "CU-01" }, { queryType: "ITEM_NO", itemNo: "A 1" },
      { queryType: "RECEIVABLE", scope: "ALL", code: "CU0001" }, { queryType: "RECEIVABLE", scope: "SALESPERSON" },
      { queryType: "CUSTOMER_NAME", keyword: "假%" }, { queryType: "SALES", customerCode: "CU0001", itemNo: "X1" }]) {
      const response = await user.create(body);
      assert.equal(response.status, 400, JSON.stringify(body));
    }
    const range = await user.create({ queryType: "SALES", customerCode: "CU0001", dateFrom: "2020-01-01", dateTo: "2024-01-02" });
    assert.equal(range.body.error.code, "INVALID_DATE_RANGE");
    assert.equal(sql.prepare("SELECT count(*) AS n FROM erp_item_queries").get().n, 0);
  } finally { sql.close(); }
});

test("an Agent only claims the query types it lists, and must list them", async () => {
  const { sql, user, agent } = fixture("SUPER_ADMIN");
  try {
    const created = await user.create({ queryType: "SALES", customerCode: "CU0001" });
    assert.equal((await agent.claim()).status, 400);
    assert.equal((await agent.claim(["ITEM_NO", "ITEM_NAME"])).body.data.job, null);
    const claimed = (await agent.claim(ALL_TYPES)).body.data.job;
    assert.equal(claimed.id, created.body.data.id);
    assert.equal(claimed.customerCode, "CU0001");
    assert.equal(claimed.dateTo, taipeiToday());
    assert.equal(claimed.itemNo, undefined);
  } finally { sql.close(); }
});

test("SALES results are the job's customer inside the range", async () => {
  const { sql, user, agent } = fixture("SUPER_ADMIN");
  try {
    const { id } = (await user.create({ queryType: "SALES", customerCode: "CU0001" })).body.data;
    const job = (await agent.claim(ALL_TYPES)).body.data.job;
    const base = { outcome: "FOUND", customerCode: "CU0001", dateFrom: job.dateFrom, dateTo: job.dateTo, total: 1, truncated: false };
    assert.equal((await agent.complete(id, { ...base, orders: [order({ customerCode: "CU0002" })] })).status, 400);
    assert.equal((await agent.complete(id, { ...base, orders: [order({ date: "2000-01-01" })] })).status, 400);
    const returned = order({ kind: "銷退", orderNo: "902A-20260102001", lines: [line(1, { sourceOrder: "901A-20260101001-0001" })] });
    const done = await agent.complete(id, { ...base, total: 2, orders: [order(), returned] });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    const result = (await user.load(id)).body.data;
    assert.equal(result.status, "DONE");
    assert.equal(result.orders.length, 2);
    assert.equal(result.orders[1].lines[0].sourceOrder, "901A-20260101001-0001");
    assert.equal(result.resultCleared, false);
  } finally { sql.close(); }
});

test("RECEIVABLE checks scope, code and bill ownership", async () => {
  const { sql, user, agent } = fixture("SUPER_ADMIN");
  try {
    const { id } = (await user.create({ queryType: "RECEIVABLE", scope: "SALESPERSON", code: "SP01" })).body.data;
    const job = (await agent.claim(ALL_TYPES)).body.data.job;
    assert.deepEqual([job.scope, job.code], ["SALESPERSON", "SP01"]);
    const base = { outcome: "FOUND", scope: "SALESPERSON", code: "SP01", total: 1, truncated: false };
    assert.equal((await agent.complete(id, { ...base, bills: [bill({ salespersonCode: "SP02" })] })).status, 400);
    assert.equal((await agent.complete(id, { ...base, bills: [bill()] })).status, 200);
    assert.equal((await user.load(id)).body.data.bills[0].vouchers.length, 1);
  } finally { sql.close(); }
});

test("customer lists must contain the keyword in 簡稱 or 全名; NOT_FOUND carries nothing", async () => {
  const { sql, user, agent } = fixture("SUPER_ADMIN");
  try {
    const { id } = (await user.create({ queryType: "CUSTOMER_NAME", keyword: "假" })).body.data;
    await agent.claim(ALL_TYPES);
    const row = (code, short, full) => [["客戶代號", code], ["客戶簡稱", short], ["客戶全名", full], ["TEL", ""], ["統一編號", ""], ["業務人員", ""]].map(([name, value]) => ({ name, value }));
    assert.equal((await agent.complete(id, { outcome: "FOUND", keyword: "假", items: [row("CU0003", "別家", "別家診所")], total: 1, truncated: false })).status, 400);
    assert.equal((await agent.complete(id, { outcome: "FOUND", keyword: "假", items: [row("CU0001", "某店", "假客戶全名")], total: 1, truncated: false })).status, 200);
    const second = (await user.create({ queryType: "CUSTOMER_NO", customerCode: "CU0009" })).body.data;
    await agent.claim(ALL_TYPES);
    assert.equal((await agent.complete(second.id, { outcome: "NOT_FOUND", customerCode: "CU0009", fields: [] })).status, 200);
    assert.equal((await user.load(second.id)).body.data.status, "NOT_FOUND");
  } finally { sql.close(); }
});

test("標準進價 is only claimed, stored and shown with ERP_ITEM_COST", async () => {
  for (const withCost of [false, true]) {
    const { sql, user, agent, grant } = fixture();
    try {
      grant("ERP_ITEM_QUERY");
      if (withCost) grant("ERP_ITEM_COST");
      const { id } = (await user.create({ queryType: "ITEM_NO", itemNo: "T0001" })).body.data;
      const job = (await agent.claim(ALL_TYPES)).body.data.job;
      assert.equal(job.includeCost, withCost);
      // Stored and shown only with the grant, whatever the Agent sends.
      const fields = [{ name: "品號", value: "T0001" }, { name: "標準進價", value: "123" }];
      assert.equal((await agent.complete(id, { outcome: "FOUND", fields, warehouses: [] })).status, 200);
      const stored = JSON.parse(sql.prepare("SELECT fields_json FROM erp_item_queries WHERE id=?").get(id).fields_json);
      assert.equal(stored.some(f => f.name === "標準進價"), withCost);
      assert.equal((await user.load(id)).body.data.fields.some(f => f.name === "標準進價"), withCost);
    } finally { sql.close(); }
  }
});

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
    recent: async () => json(await call("/api/erp/item-queries/recent", "GET")),
    queue: async () => json(await call("/api/erp/queue", "GET")),
    agentStatus: async () => json(await call("/api/erp/agent-status", "GET")),
    control: async body => json(await call("/api/erp/agent-control", "POST", body)),
  };
  const agent = {
    claim: async queryTypes => json(await call("/api/erp-agent/item-queries/claim", "POST", { agentVersion: "test", erpState: "BROWSE", ...(queryTypes ? { queryTypes } : {}) }, true)),
    complete: async (id, body) => json(await call(`/api/erp-agent/item-queries/${id}/complete`, "POST", { elapsedMs: 1000, agentVersion: "test", ...body }, true)),
    progress: async (id, body) => json(await call(`/api/erp-agent/item-queries/${id}/progress`, "POST", body, true)),
    control: async body => json(await call("/api/erp-agent/control", "POST", body, true)),
  };
  const grant = code => {
    sql.prepare("INSERT OR IGNORE INTO app_members(identity_employee_id,employee_no,is_active,created_at,updated_at) VALUES('erp-business-synthetic','0097',1,?,?)").run(now, now);
    const member = sql.prepare("SELECT id FROM app_members WHERE identity_employee_id='erp-business-synthetic'").get();
    sql.prepare("INSERT INTO app_member_module_access(member_id,module_code,enabled,updated_at) VALUES(?,?,1,?)").run(member.id, code, now);
  };
  return { sql, user, agent, grant };
}
const ALL_TYPES = ["ITEM_NO", "ITEM_NAME", "CUSTOMER_NO", "CUSTOMER_NAME", "SUPPLIER_NO", "SUPPLIER_NAME", "PURCHASES", "SALES", "RECEIVABLE", "ORDER", "RESTOCK"];
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

test("codes are letters, digits and a dash; requests refuse fields of other types", async () => {
  const { sql, user } = fixture("SUPER_ADMIN");
  try {
    for (const body of [{ queryType: "CUSTOMER_NO", customerCode: "-CU01" }, { queryType: "ITEM_NO", itemNo: "A 1" },
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

test("suppliers need ERP_SUPPLIER_QUERY; the Agent echoes supplierCode and the 廠商代號 must match", async () => {
  const { sql, user, agent, grant } = fixture();
  try {
    grant("ERP_CUSTOMER_QUERY");
    assert.equal((await user.create({ queryType: "SUPPLIER_NO", supplierCode: "SU0001" })).status, 403);
    grant("ERP_SUPPLIER_QUERY");
    assert.equal((await user.create({ queryType: "SUPPLIER_NO", customerCode: "SU0001" })).status, 400);
    assert.equal((await user.create({ queryType: "SUPPLIER_NO", supplierCode: "SU_01" })).status, 400);
    const { id } = (await user.create({ queryType: "SUPPLIER_NO", supplierCode: " SU0001 " })).body.data;
    // An Agent without the supplier types does not get the job.
    assert.equal((await agent.claim(["ITEM_NO", "CUSTOMER_NO"])).body.data.job, null);
    const job = (await agent.claim(ALL_TYPES)).body.data.job;
    assert.deepEqual([job.queryType, job.supplierCode, job.customerCode], ["SUPPLIER_NO", "SU0001", undefined]);
    const fields = code => [{ name: "廠商代號", value: code }, { name: "廠商簡稱", value: "假廠商" }, { name: "結帳日期", value: "驗收後 0 個月逢 25 日" }];
    assert.equal((await agent.complete(id, { outcome: "FOUND", customerCode: "SU0001", fields: fields("SU0001") })).status, 400);
    assert.equal((await agent.complete(id, { outcome: "FOUND", supplierCode: "SU0001", fields: fields("SU0002") })).status, 400);
    assert.equal((await agent.complete(id, { outcome: "FOUND", supplierCode: "SU0001", fields: [{ name: "客戶代號", value: "SU0001" }] })).status, 400);
    const done = await agent.complete(id, { outcome: "FOUND", supplierCode: "SU0001", fields: fields("SU0001") });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    const result = (await user.load(id)).body.data;
    assert.deepEqual([result.status, result.code, result.fields[2].value], ["DONE", "SU0001", "驗收後 0 個月逢 25 日"]);

    const list = (await user.create({ queryType: "SUPPLIER_NAME", keyword: "假" })).body.data;
    assert.equal((await agent.claim(ALL_TYPES)).body.data.job.keyword, "假");
    const row = (code, short, full) => [["廠商代號", code], ["廠商簡稱", short], ["廠商全名", full], ["TEL", ""], ["FAX", ""], ["統一編號", ""]].map(([name, value]) => ({ name, value }));
    assert.equal((await agent.complete(list.id, { outcome: "FOUND", keyword: "假", items: [row("SU0003", "別家", "別家公司")], total: 1, truncated: false })).status, 400);
    assert.equal((await agent.complete(list.id, { outcome: "FOUND", keyword: "假", items: [row("SU0001", "某廠", "假材料行")], total: 1, truncated: false })).status, 200);
    assert.equal((await user.load(list.id)).body.data.items[0][0].value, "SU0001");
  } finally { sql.close(); }
});

test("PURCHASES are the job's supplier inside the range, under ERP_SUPPLIER_QUERY", async () => {
  const { sql, user, agent, grant } = fixture();
  try {
    grant("ERP_CUSTOMER_QUERY");
    assert.equal((await user.create({ queryType: "PURCHASES", supplierCode: "SU0001" })).status, 403);
    grant("ERP_SUPPLIER_QUERY");
    assert.equal((await user.create({ queryType: "PURCHASES", supplierCode: "SU0001", dateFrom: "2020-01-01", dateTo: "2024-01-02" })).body.error.code, "INVALID_DATE_RANGE");
    const { id } = (await user.create({ queryType: "PURCHASES", supplierCode: "SU0001" })).body.data;
    const job = (await agent.claim(ALL_TYPES)).body.data.job;
    assert.deepEqual([job.queryType, job.supplierCode, job.dateTo], ["PURCHASES", "SU0001", taipeiToday()]);
    const pline = (extra = {}) => ({ seq: 1, itemCode: "X0001", itemName: "假品名", specification: "", acceptDate: taipeiToday(), warehouse: "假倉", quantity: "10", acceptedQuantity: "10", returnedQuantity: "0", unit: "個", unitPrice: "23", amount: "230", tax: "11.5", batch: "", purchaseOrderNo: "", note: "", sourceOrder: "", ...extra });
    const porder = (extra = {}) => ({ kind: "進貨", orderNo: "341A-20260212001", date: taipeiToday(), supplierCode: "SU0001", supplierName: "假廠商", supplierOrderNo: "FAKE01", invoiceNo: "", invoiceType: "三聯式發票", taxType: "應稅外加", currency: "NTD", totalQuantity: "10", amount: "230", deduction: "0", tax: "11.5", total: "241.5", settled: "N", lines: [pline()], ...extra });
    const base = { outcome: "FOUND", supplierCode: "SU0001", dateFrom: job.dateFrom, dateTo: job.dateTo, total: 1, truncated: false };
    assert.equal((await agent.complete(id, { ...base, orders: [porder({ supplierCode: "SU0002" })] })).status, 400);
    assert.equal((await agent.complete(id, { ...base, orders: [porder({ kind: "銷貨" })] })).status, 400);
    assert.equal((await agent.complete(id, { ...base, supplierCode: "SU0002", orders: [porder()] })).status, 400);
    const returned = porder({ kind: "退貨", orderNo: "351A-20260301001", lines: [pline({ acceptDate: "", sourceOrder: "341A-20260212001-0001" })] });
    const done = await agent.complete(id, { ...base, total: 2, orders: [porder(), returned] });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    const result = (await user.load(id)).body.data;
    assert.equal(result.status, "DONE");
    assert.deepEqual([result.purchases.length, result.orders.length, result.dateTo], [2, 0, taipeiToday()]);
    assert.equal(result.purchases[1].lines[0].sourceOrder, "341A-20260212001-0001");
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

test("ORDER opens one 23x／24x order with either the customer or the receivable grant", async () => {
  const { sql, user, agent, grant } = fixture();
  try {
    assert.equal((await user.create({ queryType: "ORDER", orderNo: "901A-20260101001" })).status, 403);
    grant("ERP_RECEIVABLE_QUERY");
    assert.equal((await user.create({ queryType: "ORDER", orderNo: "631A-20260101001" })).status, 400);
    const created = await user.create({ queryType: "ORDER", orderNo: " 232a-20260101001 " });
    assert.equal(created.status, 202, JSON.stringify(created.body));
    assert.equal(created.body.data.code, "232A-20260101001");
    const job = (await agent.claim(ALL_TYPES)).body.data.job;
    assert.equal(job.orderNo, "232A-20260101001");
    const base = { outcome: "FOUND", orderNo: "232A-20260101001", total: 1, truncated: false };
    assert.equal((await agent.complete(job.id, { ...base, orders: [order({ orderNo: "232A-20260101002" })] })).status, 400);
    // A single order may be any customer and any date.
    const done = await agent.complete(job.id, { ...base, orders: [order({ orderNo: "232A-20260101001", customerCode: "CU0777", date: "2020-01-01" })] });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal((await user.load(job.id)).body.data.orders[0].customerCode, "CU0777");
  } finally { sql.close(); }
});

const shiftDay = (date, days) => new Date(Date.parse(date + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);

test("RESTOCK needs ERP_RESTOCK_ASSIST with ERP_ITEM_QUERY and ERP_CUSTOMER_QUERY, both dates and at most 31 days", async () => {
  const { sql, user, agent, grant } = fixture();
  try {
    const today = taipeiToday();
    const from = shiftDay(today, -8);
    grant("ERP_CUSTOMER_QUERY");
    assert.equal((await user.create({ queryType: "RESTOCK", dateFrom: from, dateTo: today })).status, 403);
    // 進貨輔助 alone or with one requirement is not enough (user 2026-10-21); the refusal names them.
    grant("ERP_RESTOCK_ASSIST");
    const refused = await user.create({ queryType: "RESTOCK", dateFrom: from, dateTo: today });
    assert.equal(refused.status, 403);
    assert.match(refused.body.error.message, /ERP 商品查詢.*ERP 客戶查詢/);
    grant("ERP_ITEM_QUERY");
    for (const body of [{ queryType: "RESTOCK", dateFrom: from }, { queryType: "RESTOCK", dateTo: today },
      { queryType: "RESTOCK", dateFrom: shiftDay(today, -31), dateTo: today }, { queryType: "RESTOCK", dateFrom: today, dateTo: shiftDay(today, 1) },
      { queryType: "RESTOCK", dateFrom: today, dateTo: from }, { queryType: "RESTOCK", dateFrom: from, dateTo: today, customerCode: "CU0001" }]) {
      const response = await user.create(body);
      assert.equal(response.status, 400, JSON.stringify(body));
    }
    const created = await user.create({ queryType: "RESTOCK", dateFrom: shiftDay(today, -30), dateTo: today });
    assert.equal(created.status, 202, JSON.stringify(created.body));
    assert.deepEqual([created.body.data.dateFrom, created.body.data.dateTo], [shiftDay(today, -30), today]);
    assert.equal((await agent.claim(ALL_TYPES.filter(type => type !== "RESTOCK"))).body.data.job, null);
    const job = (await agent.claim(ALL_TYPES)).body.data.job;
    assert.deepEqual([job.queryType, job.dateFrom, job.dateTo, job.customerCode, job.itemNo], ["RESTOCK", shiftDay(today, -30), today, undefined, undefined]);
  } finally { sql.close(); }
});

test("RESTOCK results are per 品號 inside the range and keep only the summary fields", async () => {
  const { sql, user, agent, grant } = fixture();
  try {
    grant("ERP_RESTOCK_ASSIST"); grant("ERP_ITEM_QUERY"); grant("ERP_CUSTOMER_QUERY");
    // The Agent status is open to a member who has 進貨輔助 (with its requirements).
    assert.equal((await user.agentStatus()).status, 200);
    const today = taipeiToday();
    const from = shiftDay(today, -2);
    const { id } = (await user.create({ queryType: "RESTOCK", dateFrom: from, dateTo: today })).body.data;
    await agent.claim(ALL_TYPES);
    const item = (extra = {}) => ({ itemCode: "X0001", itemName: "假品名", unit: "盒", days: [{ date: today, sold: "3", returned: "1" }], sold: "3", returned: "1", stock: "45", stockNote: "", ...extra });
    const base = { outcome: "FOUND", dateFrom: from, dateTo: today, total: 1, truncated: false };
    for (const bad of [{ ...base, dateFrom: shiftDay(today, -3), items: [item()] },
      { ...base, items: [item({ days: [{ date: shiftDay(today, -5), sold: "1", returned: "0" }] })] },
      { ...base, items: [item({ sold: "三" })] },
      { ...base, total: 2, items: [item(), item()] },
      { ...base, items: [item()], orders: [order()] }]) {
      assert.equal((await agent.complete(id, bad)).status, 400, JSON.stringify(bad));
    }
    const done = await agent.complete(id, { ...base, total: 2, items: [
      item({ secret: "dropped" }),
      item({ itemCode: "X0002-1", days: [{ date: today, sold: "0", returned: "2" }, { date: from, sold: "5.5", returned: "0" }], sold: "5.5", returned: "2", stock: null, stockNote: "查無品號" }),
    ] });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    const result = (await user.load(id)).body.data;
    assert.deepEqual([result.status, result.total, result.dateFrom, result.dateTo], ["DONE", 2, from, today]);
    assert.equal(result.restock.length, 2);
    assert.equal(result.restock[0].secret, undefined);
    assert.deepEqual(result.restock[1].days.map(d => d.date), [from, today]);
    assert.deepEqual([result.restock[1].stock, result.restock[1].stockNote], [null, "查無品號"]);
    // NOT_FOUND carries nothing.
    const second = (await user.create({ queryType: "RESTOCK", dateFrom: from, dateTo: today })).body.data;
    await agent.claim(ALL_TYPES);
    assert.equal((await agent.complete(second.id, { outcome: "NOT_FOUND", dateFrom: from, dateTo: today, items: [item()], total: 1, truncated: false })).status, 400);
    assert.equal((await agent.complete(second.id, { outcome: "NOT_FOUND", dateFrom: from, dateTo: today, items: [], total: 0, truncated: false })).status, 200);
    assert.equal((await user.load(second.id)).body.data.status, "NOT_FOUND");
  } finally { sql.close(); }
});

test("RESTOCK may run 30 minutes and PURCHASES 10 before the Agent is timed out", async () => {
  const { sql, user, agent } = fixture("SUPER_ADMIN");
  try {
    const today = taipeiToday();
    const restock = (await user.create({ queryType: "RESTOCK", dateFrom: today, dateTo: today })).body.data;
    await agent.claim(ALL_TYPES);
    const ago = minutes => new Date(Date.now() - minutes * 60000).toISOString();
    sql.prepare("UPDATE erp_item_queries SET started_at=? WHERE id=?").run(ago(20), restock.id);
    assert.equal((await user.load(restock.id)).body.data.status, "RUNNING");
    sql.prepare("UPDATE erp_item_queries SET started_at=? WHERE id=?").run(ago(31), restock.id);
    assert.equal((await user.load(restock.id)).body.data.status, "FAILED");
    const purchases = (await user.create({ queryType: "PURCHASES", supplierCode: "SU0001" })).body.data;
    await agent.claim(ALL_TYPES);
    sql.prepare("UPDATE erp_item_queries SET started_at=? WHERE id=?").run(ago(5), purchases.id);
    assert.equal((await user.load(purchases.id)).body.data.status, "RUNNING");
    sql.prepare("UPDATE erp_item_queries SET started_at=? WHERE id=?").run(ago(11), purchases.id);
    assert.equal((await user.load(purchases.id)).body.data.status, "FAILED");
  } finally { sql.close(); }
});

test("RESTOCK shows the progress the Agent reports while it runs", async () => {
  const { sql, user, agent } = fixture("SUPER_ADMIN");
  try {
    const today = taipeiToday();
    const { id } = (await user.create({ queryType: "RESTOCK", dateFrom: today, dateTo: today })).body.data;
    assert.equal((await agent.progress(id, { stage: "REPORT", done: 0, total: 2 })).status, 409, "not claimed yet");
    await agent.claim(ALL_TYPES);
    assert.equal((await user.load(id)).body.data.progress, null);
    assert.equal((await agent.progress(id, { stage: "REPORT", done: 1, total: 2 })).status, 200);
    assert.deepEqual((await user.load(id)).body.data.progress, { stage: "REPORT", done: 1, total: 2 });
    assert.equal((await agent.progress(id, { stage: "STOCK", done: 7, total: 40 })).status, 200);
    assert.equal((await agent.progress(id, { stage: "STOCK", done: 5, total: 40 })).status, 200, "an older report is ignored");
    assert.deepEqual((await user.load(id)).body.data.progress, { stage: "STOCK", done: 7, total: 40 });
    for (const body of [{ stage: "OTHER", done: 1, total: 2 }, { stage: "STOCK", done: 3, total: 2 }, { stage: "STOCK", done: -1, total: 2 }, { stage: "STOCK", done: "1", total: 2 }])
      assert.equal((await agent.progress(id, body)).status, 400, JSON.stringify(body));
    await agent.complete(id, { outcome: "NOT_FOUND", dateFrom: today, dateTo: today, items: [], total: 0, truncated: false });
    const done = (await user.load(id)).body.data;
    assert.equal(done.progress, null);
    assert.equal((await agent.progress(id, { stage: "STOCK", done: 8, total: 40 })).status, 409);
    const sales = (await user.create({ queryType: "SALES", customerCode: "CU0001" })).body.data;
    await agent.claim(ALL_TYPES);
    assert.equal((await agent.progress(sales.id, { stage: "STOCK", done: 1, total: 2 })).status, 409, "only RESTOCK reports progress");
  } finally { sql.close(); }
});

test("a finished RESTOCK keeps per-day sales and rewrites only what changed", async () => {
  const { sql, user, agent } = fixture("SUPER_ADMIN");
  try {
    const today = taipeiToday();
    const from = shiftDay(today, -2), mid = shiftDay(today, -1);
    const item = (code, days, extra = {}) => ({ itemCode: code, itemName: "假品名" + code, unit: "盒", days,
      sold: "0", returned: "0", stock: "10", stockNote: "", ...extra });
    const run = async (items, extra = {}) => {
      const { id } = (await user.create({ queryType: "RESTOCK", dateFrom: from, dateTo: today })).body.data;
      await agent.claim(ALL_TYPES);
      const done = await agent.complete(id, { outcome: items.length ? "FOUND" : "NOT_FOUND", dateFrom: from, dateTo: today, items, total: items.length, truncated: false, ...extra });
      assert.equal(done.status, 200, JSON.stringify(done.body));
      return id;
    };
    const daily = () => sql.prepare("SELECT item_code,sale_date,sold,returned,sold_gift,returned_gift,query_id FROM erp_sales_daily ORDER BY item_code,sale_date").all()
      .map(r => ({ ...r }));
    const first = await run([
      item("X0001", [{ date: from, sold: "3", returned: "0", soldGift: "1" }, { date: today, sold: "2", returned: "1" }]),
      item("X0002", [{ date: mid, sold: "5", returned: "0" }], { stock: null, stockNote: "查無品號" }),
    ]);
    assert.deepEqual(daily(), [
      { item_code: "X0001", sale_date: from, sold: 3, returned: 0, sold_gift: 1, returned_gift: 0, query_id: first },
      { item_code: "X0001", sale_date: today, sold: 2, returned: 1, sold_gift: 0, returned_gift: 0, query_id: first },
      { item_code: "X0002", sale_date: mid, sold: 5, returned: 0, sold_gift: 0, returned_gift: 0, query_id: first },
    ]);
    assert.deepEqual(sql.prepare("SELECT item_code,stock FROM erp_sales_items ORDER BY item_code").all().map(r => ({ ...r })),
      [{ item_code: "X0001", stock: 10 }, { item_code: "X0002", stock: null }]);
    assert.equal(sql.prepare("SELECT count(*) AS n FROM erp_sales_days WHERE query_id=?").get(first).n, 3);
    const itemsBefore = sql.prepare("SELECT updated_at FROM erp_sales_items WHERE item_code='X0001'").get().updated_at;

    // The same data again: no row is rewritten (query_id stays the first one).
    await run([
      item("X0001", [{ date: from, sold: "3", returned: "0", soldGift: "1" }, { date: today, sold: "2", returned: "1" }]),
      item("X0002", [{ date: mid, sold: "5", returned: "0" }], { stock: null }),
    ]);
    assert.ok(daily().every(r => r.query_id === first));
    assert.equal(sql.prepare("SELECT updated_at FROM erp_sales_items WHERE item_code='X0001'").get().updated_at, itemsBefore);

    // One quantity changes and X0002 is gone: only that row is written, X0002's row is deleted;
    // X0002 keeps its item row. The past days stay marked by the first query, today is synced again.
    const third = await run([item("X0001", [{ date: from, sold: "3", returned: "0", soldGift: "1" }, { date: today, sold: "4", returned: "1" }], { stock: "8" })]);
    assert.deepEqual(daily().map(r => [r.item_code, r.sale_date, r.sold, r.query_id]),
      [["X0001", from, 3, first], ["X0001", today, 4, third]]);
    assert.equal(sql.prepare("SELECT stock FROM erp_sales_items WHERE item_code='X0001'").get().stock, 8);
    assert.equal(sql.prepare("SELECT count(*) AS n FROM erp_sales_items").get().n, 2);
    assert.equal(sql.prepare("SELECT query_id FROM erp_sales_days WHERE sale_date=?").get(today).query_id, third);
    sql.prepare("UPDATE erp_sales_days SET synced_at=? WHERE sale_date=?").run(shiftDay(today, 1) + "T00:00:00.000Z", mid);

    // A truncated result writes what it has but deletes nothing and marks no day.
    const fourth = await run([item("X0003", [{ date: mid, sold: "1", returned: "0" }])], { truncated: true, total: 600 });
    assert.deepEqual(daily().map(r => r.item_code), ["X0001", "X0001", "X0003"]);
    assert.equal(sql.prepare("SELECT count(*) AS n FROM erp_sales_days WHERE query_id=?").get(fourth).n, 0);

    // NOT_FOUND empties the range; a day synced after it ended is not marked again.
    const fifth = await run([]);
    assert.deepEqual(daily(), []);
    assert.equal(sql.prepare("SELECT query_id FROM erp_sales_days WHERE sale_date=?").get(mid).query_id, first);
    assert.equal(sql.prepare("SELECT query_id FROM erp_sales_days WHERE sale_date=?").get(today).query_id, fifth);
  } finally { sql.close(); }
});

test("ERP_SEATS_FULL is accepted and shown as 人數已滿", async () => {
  const { sql, user, agent, grant } = fixture();
  try {
    grant("ERP_ITEM_QUERY");
    const created = await user.create({ queryType: "ITEM_NO", itemNo: "X0001" });
    assert.equal(created.status, 202, JSON.stringify(created.body));
    const job = (await agent.claim(ALL_TYPES)).body.data.job;
    const done = await agent.complete(job.id, { outcome: "FAILED", fields: [], warehouses: [], errorCode: "ERP_SEATS_FULL", errorMessage: null });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    const loaded = (await user.load(created.body.data.id)).body.data;
    assert.equal(loaded.status, "FAILED");
    assert.equal(loaded.errorCode, "ERP_SEATS_FULL");
    assert.match(loaded.errorMessage, /人數已滿/);
  } finally { sql.close(); }
});

test("ERP close and hold: any ERP grant may ask; the Agent sees it on claim and reports back", async () => {
  const { sql, user, agent, grant } = fixture();
  try {
    assert.equal((await user.control({ action: "CLOSE", minutes: 30 })).status, 403);
    grant("ERP_CUSTOMER_QUERY");
    assert.equal((await user.control({ action: "CLOSE", minutes: 20 })).status, 400);
    const held = await user.control({ action: "CLOSE", minutes: 30 });
    assert.equal(held.status, 200, JSON.stringify(held.body));
    assert.equal(held.body.data.request, "CLOSE");
    assert.ok(Date.parse(held.body.data.holdUntil) > Date.now() + 29 * 60000);
    grant("ERP_ITEM_QUERY");
    const refused = await user.create({ queryType: "ITEM_NO", itemNo: "X0001" });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error.code, "ERP_HELD");
    assert.match(refused.body.error.message, /\d\d:\d\d 後可再查詢/);
    const claimed = (await agent.claim(ALL_TYPES)).body.data;
    assert.equal(claimed.job, null);
    assert.equal(claimed.control.request, "CLOSE");
    assert.equal((await agent.control({ request: "FORCE_CLOSE", result: "CLOSED" })).body.data.request, "CLOSE", "a different request stays pending");
    const done = await agent.control({ request: "CLOSE", result: "CLOSED" });
    assert.equal(done.body.data.request, null);
    assert.equal(done.body.data.result, "CLOSED");
    const status = (await user.agentStatus()).body.data.control;
    assert.equal(status.result, "CLOSED");
    assert.ok(status.holdUntil);
    assert.equal((await user.control({ action: "RESUME" })).body.data.holdUntil, null);
    assert.equal((await user.create({ queryType: "ITEM_NO", itemNo: "X0001" })).status, 202);
    const forced = await user.control({ action: "FORCE_CLOSE" });
    assert.equal(forced.body.data.request, "FORCE_CLOSE");
    assert.equal((await agent.control({ request: "FORCE_CLOSE", result: "BOGUS" })).status, 400);
  } finally { sql.close(); }
});

test("the Agent counts as connected while it runs a job", async () => {
  const { sql, user, agent, grant } = fixture();
  try {
    grant("ERP_ITEM_QUERY");
    assert.equal((await user.create({ queryType: "ITEM_NO", itemNo: "X0001" })).status, 202);
    assert.ok((await agent.claim(ALL_TYPES)).body.data.job);
    sql.prepare("UPDATE erp_item_agent_status SET last_seen_at=? WHERE id=1").run(new Date(Date.now() - 60000).toISOString());
    assert.equal((await user.agentStatus()).body.data.online, true);
    sql.prepare("UPDATE erp_item_queries SET status='FAILED'").run();
    assert.equal((await user.agentStatus()).body.data.online, false);
  } finally { sql.close(); }
});

test("a member's recent queries are listed newest first, only types still granted", async () => {
  const { sql, user, agent, grant } = fixture();
  try {
    grant("ERP_ITEM_QUERY");
    const first = (await user.create({ queryType: "ITEM_NO", itemNo: "X0001" })).body.data;
    const job = (await agent.claim(ALL_TYPES)).body.data.job;
    await agent.complete(job.id, { outcome: "NOT_FOUND", fields: [], warehouses: [], errorCode: null, errorMessage: null });
    grant("ERP_CUSTOMER_QUERY");
    const second = (await user.create({ queryType: "CUSTOMER_NO", customerCode: "CU0001" })).body.data;
    const recent = await user.recent();
    assert.equal(recent.status, 200, JSON.stringify(recent.body));
    assert.deepEqual(recent.body.data.map(r => [r.id, r.queryType]), [[second.id, "CUSTOMER_NO"], [first.id, "ITEM_NO"]]);
    sql.prepare("DELETE FROM app_member_module_access WHERE module_code='ERP_CUSTOMER_QUERY'").run();
    assert.deepEqual((await user.recent()).body.data.map(r => r.queryType), ["ITEM_NO"]);
  } finally { sql.close(); }
});

test("a member may have three queries queued or running; the queue lists them in the order sent", async () => {
  const { sql, user, agent, grant } = fixture();
  try {
    grant("ERP_ITEM_QUERY");
    const ids = [];
    for (const itemNo of ["X0001", "X0002", "X0003"]) {
      const created = await user.create({ queryType: "ITEM_NO", itemNo });
      assert.equal(created.status, 202, JSON.stringify(created.body));
      ids.push(created.body.data.id);
    }
    const fourth = await user.create({ queryType: "ITEM_NO", itemNo: "X0004" });
    assert.equal(fourth.status, 409);
    assert.equal(fourth.body.error.code, "QUERY_ALREADY_ACTIVE");
    // Another member's query sent later waits behind them.
    sql.prepare("INSERT INTO app_members(identity_employee_id,employee_no,display_name,is_active,created_at,updated_at) VALUES('other','0098','假同事',1,?,?)").run(new Date().toISOString(), new Date().toISOString());
    const other = sql.prepare("SELECT id FROM app_members WHERE identity_employee_id='other'").get().id;
    sql.prepare(`INSERT INTO erp_item_queries(id,owner_member_id,item_no,status,created_at,expires_at,query_type,receivable_scope,target_code)
      VALUES('00000000-0000-4000-8000-000000000001',?,'CU0001','QUEUED',?,?,'RECEIVABLE','CUSTOMER','CU0001')`)
      .run(other, new Date(Date.now() + 1000).toISOString(), new Date(Date.now() + 3600000).toISOString());
    const claimed = (await agent.claim(ALL_TYPES)).body.data.job;
    assert.equal(claimed.id, ids[0]);
    const queue = await user.queue();
    assert.equal(queue.status, 200, JSON.stringify(queue.body));
    const jobs = queue.body.data.jobs;
    assert.deepEqual(jobs.map(j => [j.status, j.mine, j.target]),
      [["RUNNING", true, "X0001"], ["QUEUED", true, "X0002"], ["QUEUED", true, "X0003"], ["QUEUED", false, null]]);
    assert.equal(jobs[3].member, "假同事");
    assert.equal(queue.body.data.maxPerMember, 3);
    // Each estimate is after the one before it.
    for (let i = 1; i < jobs.length; i++) assert.ok(Date.parse(jobs[i].estimatedDoneAt) > Date.parse(jobs[i - 1].estimatedDoneAt));
    // A receivable grant shows what the receivable query is for.
    grant("ERP_RECEIVABLE_QUERY");
    assert.equal((await user.queue()).body.data.jobs[3].target, "客戶 CU0001");
    await agent.complete(claimed.id, { outcome: "NOT_FOUND", fields: [], warehouses: [], errorCode: null, errorMessage: null });
    assert.equal((await user.create({ queryType: "ITEM_NO", itemNo: "X0004" })).status, 202);
  } finally { sql.close(); }
});

test("a queued query waits while the Agent is busy or connected, and expires once it is gone", async () => {
  const { sql, user, agent, grant } = fixture();
  try {
    grant("ERP_ITEM_QUERY");
    await user.create({ queryType: "ITEM_NO", itemNo: "X0001" });
    const waiting = (await user.create({ queryType: "ITEM_NO", itemNo: "X0002" })).body.data;
    await agent.claim(ALL_TYPES);
    const old = new Date(Date.now() - 10 * 60000).toISOString();
    sql.prepare("UPDATE erp_item_queries SET created_at=? WHERE id=?").run(old, waiting.id);
    sql.prepare("UPDATE erp_item_agent_status SET last_seen_at=? WHERE id=1").run(old);
    // A query is running: the queued one waits.
    assert.equal((await user.load(waiting.id)).body.data.status, "QUEUED");
    sql.prepare("UPDATE erp_item_queries SET status='FAILED' WHERE status='RUNNING'").run();
    // Nothing running, but the Agent claimed in the last minute: still waits.
    sql.prepare("UPDATE erp_item_agent_status SET last_seen_at=? WHERE id=1").run(new Date().toISOString());
    assert.equal((await user.load(waiting.id)).body.data.status, "QUEUED");
    // The Agent is gone.
    sql.prepare("UPDATE erp_item_agent_status SET last_seen_at=? WHERE id=1").run(old);
    assert.equal((await user.load(waiting.id)).body.data.status, "EXPIRED");
  } finally { sql.close(); }
});

test("關閉到 a chosen time; a query sent while paused may wait for the pause and follows it", async () => {
  const { sql, user, agent, grant } = fixture();
  try {
    grant("ERP_ITEM_QUERY");
    assert.equal((await user.control({ action: "CLOSE", until: new Date(Date.now() + 30000).toISOString() })).status, 400, "under a minute");
    assert.equal((await user.control({ action: "CLOSE", until: new Date(Date.now() + 25 * 3600000).toISOString() })).status, 400, "over 24 hours");
    const until = new Date(Date.now() + 2 * 3600000).toISOString();
    const held = await user.control({ action: "CLOSE", until });
    assert.equal(held.status, 200, JSON.stringify(held.body));
    assert.equal(held.body.data.holdUntil, until);
    assert.equal((await user.create({ queryType: "ITEM_NO", itemNo: "X0001" })).body.error.code, "ERP_HELD");
    const waiting = await user.create({ queryType: "ITEM_NO", itemNo: "X0001", afterHold: true });
    assert.equal(waiting.status, 202, JSON.stringify(waiting.body));
    assert.equal(waiting.body.data.notBefore, until);
    assert.equal((await user.load(waiting.body.data.id)).body.data.notBefore, until);
    assert.equal((await agent.claim(ALL_TYPES)).body.data.job, null, "not claimed during the pause");
    const queue = (await user.queue()).body.data.jobs;
    assert.equal(queue[0].notBefore, until);
    assert.ok(Date.parse(queue[0].estimatedDoneAt) > Date.parse(until));
    // An old agent heartbeat does not expire a query waiting for the pause.
    sql.prepare("UPDATE erp_item_agent_status SET last_seen_at=? WHERE id=1").run(new Date(Date.now() - 600000).toISOString());
    assert.equal((await user.load(waiting.body.data.id)).body.data.status, "QUEUED");
    // A longer pause moves it; 取消暫停 releases it.
    const later = new Date(Date.now() + 3 * 3600000).toISOString();
    await user.control({ action: "CLOSE", until: later });
    assert.equal((await user.load(waiting.body.data.id)).body.data.notBefore, later);
    await user.control({ action: "RESUME" });
    assert.equal((await user.load(waiting.body.data.id)).body.data.notBefore, null);
    assert.equal((await agent.claim(ALL_TYPES)).body.data.job.id, waiting.body.data.id);
  } finally { sql.close(); }
});

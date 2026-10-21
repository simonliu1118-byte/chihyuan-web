import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { build } from "esbuild";
import { effectiveModules, moduleChangeProblem, moduleRequirementProblem } from "../shared/modules.ts";

// 進貨輔助 needs ERP 商品查詢 and ERP 客戶查詢 (user 2026-10-21): the shared rule and the Module
// Access routes that enforce it, with synthetic employees only.
const compiled = await build({ entryPoints: ["worker/http/module-access-routes.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { handleModuleAccessRoute } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));

test("a grant counts only with the grants it requires", () => {
  assert.deepEqual(effectiveModules(["ERP_RESTOCK_ASSIST", "ERP_ITEM_QUERY"]), ["ERP_ITEM_QUERY"]);
  assert.deepEqual(effectiveModules(["ERP_RESTOCK_ASSIST", "ERP_ITEM_QUERY", "ERP_CUSTOMER_QUERY"]), ["ERP_RESTOCK_ASSIST", "ERP_ITEM_QUERY", "ERP_CUSTOMER_QUERY"]);
  assert.match(moduleRequirementProblem(["ERP_RESTOCK_ASSIST", "ERP_ITEM_QUERY"]), /缺少「ERP 客戶查詢」/);
  assert.equal(moduleRequirementProblem(["ERP_ITEM_QUERY"]), null);
  assert.match(moduleChangeProblem(new Set(["ERP_ITEM_QUERY"]), "ERP_RESTOCK_ASSIST", true), /請先開啟「ERP 客戶查詢」/);
  assert.equal(moduleChangeProblem(new Set(["ERP_ITEM_QUERY", "ERP_CUSTOMER_QUERY"]), "ERP_RESTOCK_ASSIST", true), null);
  assert.match(moduleChangeProblem(new Set(["ERP_RESTOCK_ASSIST", "ERP_ITEM_QUERY", "ERP_CUSTOMER_QUERY"]), "ERP_ITEM_QUERY", false), /請先關閉「進貨輔助」/);
  assert.equal(moduleChangeProblem(new Set(["ERP_ITEM_QUERY"]), "ERP_ITEM_QUERY", false), null);
});

function fixture() {
  const sql = new DatabaseSync(":memory:");
  for (const file of readdirSync(new URL("../migrations/", import.meta.url)).filter(f => f.endsWith(".sql")).sort())
    sql.exec(readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8"));
  const db = { prepare(query) { let values = []; const statement = sql.prepare(query); const execute = () => ({ results: statement.all(...values), meta: { changes: sql.prepare("SELECT changes() AS n").get().n, last_row_id: sql.prepare("SELECT last_insert_rowid() AS n").get().n } }); return {
    bind(...params) { values = params; return this; }, async first() { return execute().results[0] ?? null; }, async all() { return execute(); }, async run() { return execute(); }, execute,
  }; }, async batch(statements) { sql.exec("BEGIN"); try { const results = statements.map(s => s.execute()); sql.exec("COMMIT"); return results; } catch (error) { sql.exec("ROLLBACK"); throw error; } } };
  const principal = { workspaceId: "workspace-test", employeeId: "admin-synthetic", employeeNo: "0001", displayName: "Synthetic", workspaceRole: "SUPER_ADMIN", isIdentityAdmin: false, emailVerified: true, isWorkspaceSuperAdmin: true, credentialVersion: 1, employeeRevision: 1 };
  const employees = [{ employee_id: "target-synthetic", employee_no: "0002", workspace_role: "USER", identity_admin: 0 }];
  const env = { DB: db, IDENTITY_APPLICATION_ID: "APP_TEST", IDENTITY_WORKSPACE_ID: "workspace-test", IDENTITY: { async fetch(request) {
    return new URL(request.url).pathname.endsWith("/admin/identity/snapshot")
      ? Response.json({ ok: true, employees, applications: [], directAccess: [] })
      : Response.json({ principal, session: { expiresAt: "2999-01-01T00:00:00Z" } });
  } } };
  const call = async (path, method, body) => {
    const response = await handleModuleAccessRoute(new Request("https://acceptance.test" + path, { method,
      headers: { "content-type": "application/json", cookie: "cyweb_identity_session=cyid_" + "a".repeat(64) }, body: body === undefined ? undefined : JSON.stringify(body) }), env, "module-requirements");
    return { status: response.status, body: await response.json() };
  };
  const set = (code, enabled) => call(`/api/module-access/admin/employees/target-synthetic/modules/${code}`, "PUT", { enabled });
  return { sql, call, set };
}

test("saving 進貨輔助 without its requirements, or removing one under it, is refused", async () => {
  const { sql, set } = fixture();
  try {
    const refused = await set("ERP_RESTOCK_ASSIST", true);
    assert.equal(refused.status, 409, JSON.stringify(refused.body));
    assert.equal(refused.body.error.code, "MODULE_REQUIREMENT_MISSING");
    assert.match(refused.body.error.message, /ERP 商品查詢.*ERP 客戶查詢/);
    assert.equal((await set("ERP_ITEM_QUERY", true)).status, 200);
    assert.equal((await set("ERP_RESTOCK_ASSIST", true)).status, 409);
    assert.equal((await set("ERP_CUSTOMER_QUERY", true)).status, 200);
    assert.equal((await set("ERP_RESTOCK_ASSIST", true)).status, 200);
    const removing = await set("ERP_CUSTOMER_QUERY", false);
    assert.equal(removing.status, 409);
    assert.match(removing.body.error.message, /請先關閉「進貨輔助」/);
    assert.equal((await set("ERP_RESTOCK_ASSIST", false)).status, 200);
    assert.equal((await set("ERP_CUSTOMER_QUERY", false)).status, 200);
  } finally { sql.close(); }
});

test("a 權限群組 with 進貨輔助 must hold its requirements", async () => {
  const { sql, call } = fixture();
  try {
    const refused = await call("/api/module-access/admin/groups", "POST", { name: "假群組", modules: ["ERP_RESTOCK_ASSIST", "ERP_ITEM_QUERY"], applications: [] });
    assert.equal(refused.status, 409, JSON.stringify(refused.body));
    assert.equal(refused.body.error.code, "MODULE_REQUIREMENT_MISSING");
    const created = await call("/api/module-access/admin/groups", "POST", { name: "假群組", modules: ["ERP_RESTOCK_ASSIST", "ERP_ITEM_QUERY", "ERP_CUSTOMER_QUERY"], applications: [] });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const { id, revision } = created.body.data.group;
    const narrowed = await call(`/api/module-access/admin/groups/${id}`, "PATCH", { name: "假群組", modules: ["ERP_RESTOCK_ASSIST", "ERP_CUSTOMER_QUERY"], applications: [], expectedRevision: revision });
    assert.equal(narrowed.status, 409);
    assert.match(narrowed.body.error.message, /缺少「ERP 商品查詢」/);
  } finally { sql.close(); }
});

import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { build } from "esbuild";

const compiled = await build({ entryPoints: ["worker/http/bot-center-routes.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { handleBotCenterRoute } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));

export function botCenterFixture(role = "SUPER_ADMIN", grant = false, {beforeScopedMigration, seedMember = true} = {}) {
  const sql = new DatabaseSync(":memory:");
  const queries = [];
  sql.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync(new URL("../../migrations/", import.meta.url)).filter(name => name.endsWith(".sql")).sort()) {
    if (file.startsWith("0057_")) beforeScopedMigration?.(sql);
    sql.exec(readFileSync(new URL("../../migrations/" + file, import.meta.url), "utf8"));
  }
  const t = "2026-11-06T00:00:00.000Z";
  if (seedMember) sql.prepare("INSERT INTO app_members(identity_employee_id,employee_no,display_name,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?)")
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
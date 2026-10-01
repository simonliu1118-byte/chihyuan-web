import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { pathToFileURL } from "node:url";

const directory = mkdtempSync(join(tmpdir(), "cyweb-identity-test-"));
let CYCloudIdentityClient, handleIdentityManagementRoute;
try {
  for (const name of ["identity/cycloud-identity-adapter", "http/identity-management-routes", "http/response"]) {
    const source = readFileSync(new URL(`../worker/${name}.ts`, import.meta.url), "utf8");
    const path = join(directory, `${name}.mjs`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, stripTypeScriptTypes(source, { mode: "transform" })
      .replace(/from "(\.\.?\/[^"]+)"/g, 'from "$1.mjs"'));
  }
  ({ CYCloudIdentityClient } = await import(pathToFileURL(join(directory, "identity/cycloud-identity-adapter.mjs"))));
  ({ handleIdentityManagementRoute } = await import(pathToFileURL(join(directory, "http/identity-management-routes.mjs"))));
} finally { rmSync(directory, { recursive: true, force: true }); }

const principal = { workspaceId: "workspace-test", employeeId: "employee-test", employeeNo: "0001", displayName: "Synthetic Employee", workspaceRole: "ADMIN", isIdentityAdmin: false, emailVerified: true, isWorkspaceSuperAdmin: false, credentialVersion: 1, employeeRevision: 1 };
const token = `cyid_${"a".repeat(64)}`;
const request = new Request("https://web.test/api/auth/session", { headers: { cookie: `cyweb_identity_session=${token}` } });
function client(value) {
  return new CYCloudIdentityClient({ async fetch(req) {
    assert.equal(req.headers.get("authorization"), `Bearer ${token}`);
    assert.equal(req.headers.get("x-identity-application"), "APP_TEST");
    return Response.json({ principal: value, session: { expiresAt: "2999-01-01T00:00:00.000Z" } });
  } }, "APP_TEST", "workspace-test");
}
test("valid direct-role principal needs no legacy Group projection", async () => {
  for (const value of [principal, { ...principal, groupKeys: ["OLD"] }, { ...principal, groupKeys: "obsolete" }]) {
    const result = await client(value).resolve(request);
    assert.equal(result.status, "authenticated");
    assert.deepEqual(result.principal, principal);
  }
});
test("removing Group dependency preserves required authority validation", async () => {
  for (const patch of [{ workspaceRole: "HR" }, { isIdentityAdmin: true, workspaceRole: "USER" }, { isWorkspaceSuperAdmin: true }, { credentialVersion: -1 }, { employeeNo: "invalid" }]) {
    assert.equal((await client({ ...principal, ...patch }).resolve(request)).status, "unavailable");
  }
  assert.equal((await client({ ...principal, workspaceId: "other-workspace" }).resolve(request)).status, "unauthenticated");
});
test("retired Group and compatibility-mode routes never reach the provider", async () => {
  const env = { IDENTITY: { fetch() { throw new Error("retired route reached provider"); } } };
  for (const [method, path] of [["POST", "groups"], ["PATCH", "groups/group-test"], ["PUT", "groups/group-test/members/employee-test"], ["DELETE", "groups/group-test/members/employee-test"], ["PUT", "groups/group-test/applications/APP_TEST"], ["PUT", "applications/APP_TEST/compatibility-role-mode"]]) {
    assert.equal(await handleIdentityManagementRoute(new Request(`https://web.test/api/identity/admin/${path}`, { method }), env, "test"), null);
  }
});

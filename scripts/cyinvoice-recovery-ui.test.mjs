import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const tmp = mkdtempSync(fileURLToPath(new URL("../node_modules/.cyweb-recovery-ui-", import.meta.url)));
let ui, checkpoint, client;
try {
  for (const [name, path] of [["ui", "CyInvoiceRecoveryAdminPanel.tsx"],
    ["checkpoint", "cyinvoice-recovery-checkpoint.ts"], ["client", "cyinvoice-recovery-client.ts"]]) {
    const outfile = join(tmp, name + ".mjs");
    await build({ entryPoints: ["src/identity/" + path], outfile, bundle: true,
      platform: "node", format: "esm", jsx: "automatic", packages: "external" });
  }
  ui = await import(pathToFileURL(join(tmp, "ui.mjs")));
  checkpoint = await import(pathToFileURL(join(tmp, "checkpoint.mjs")));
  client = await import(pathToFileURL(join(tmp, "client.mjs")));
} finally { rmSync(tmp, { recursive: true, force: true }); }
const id = "11111111-1111-4111-8111-111111111111";
const user = { workspaceId: "synthetic-ws", employeeId: "synthetic-employee", employeeNo: "0001",
  displayName: "Synthetic Administrator", workspaceRole: "SUPER_ADMIN", isIdentityAdmin: false,
  isWorkspaceSuperAdmin: true, emailVerified: true };
function storage() {
  const map = new Map();
  return { getItem(key) { return map.get(key) ?? null; }, setItem(key, value) { map.set(key, value); }, map };
}
function render(userInput = user, stored = storage()) {
  const oldWindow = globalThis.window;
  globalThis.window = { sessionStorage: stored };
  try { return renderToStaticMarkup(createElement(ui.CyInvoiceRecoveryAdminPanel, {session: {user: userInput}})); }
  finally { globalThis.window = oldWindow; }
}
const key = checkpoint.recoveryCheckpointKey(user.workspaceId, user.employeeId);
test("checkpoint survives remount and projects only ID/local attempted/closed metadata", () => {
  const s = storage();
  checkpoint.writeRecoveryCheckpoint(s, key, { operationId: id, attempted: true, closed: false,
    password: "must-not-save", recoveryCode: "must-not-save", token: "must-not-save" });
  assert.deepEqual(checkpoint.readRecoveryCheckpoint(s, key), { operationId: id, attempted: true, closed: false });
  assert.doesNotMatch([...s.map.values()].join(), /must-not-save|password|recoveryCode|token/);
  const html = render(user, s);
  assert.match(html, new RegExp(id));
  assert.match(html, /readOnly=""/);
  assert.match(html, /disabled=""[^>]*>新的操作 ID/);
  assert.match(html, /disabled=""[^>]*>簽發並寄送邀請/);
});
test("checkpoint is separated by employee and workspace; corrupt/blocked storage does not generate a replacement", () => {
  assert.notEqual(key, checkpoint.recoveryCheckpointKey(user.workspaceId, "other"));
  assert.notEqual(key, checkpoint.recoveryCheckpointKey("other", user.employeeId));
  const s = storage(); s.setItem(key, '{"operationId":"broken"}');
  assert.throws(() => checkpoint.readRecoveryCheckpoint(s, key));
  assert.match(render(user, s), /簽發已停用/);
  assert.equal(s.getItem(key), '{"operationId":"broken"}');
  const blocked = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  assert.match(render(user, blocked), /簽發已停用/);
});
test("all presentations share labelled inputs and deny USER/ADMIN/unverified/false superadmin marker", () => {
  assert.match(render(), /當次 CYID 超級管理員密碼/);
  assert.match(render(), /關閉頁籤或清除瀏覽器資料後/);
  assert.equal((render().match(/type="password"/g) ?? []).length, 1);
  for (const u of [{...user, workspaceRole:"USER"}, {...user, workspaceRole:"ADMIN", isIdentityAdmin:true},
    {...user, emailVerified:false}, {...user, isWorkspaceSuperAdmin:false}]) assert.equal(render(u), "");
});
test("fresh operation is not issued by rendering; explicitly confirmed revoked checkpoint permits new ID", () => {
  const s = storage();
  render(user, s);
  const row = checkpoint.readRecoveryCheckpoint(s, key);
  assert.equal(row.attempted, false);
  checkpoint.writeRecoveryCheckpoint(s, key, { operationId:id, attempted:true, closed:true });
  assert.match(render(user, s), /<button[^>]*type="button"[^>]*>新的操作 ID/);
});
test("actual browser client makes one same-origin POST and rejects malformed/mismatched revoke proof", async () => {
  const oldFetch = globalThis.fetch;
  let calls = 0, returned = {status:"pending", operationId:id};
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.match(url, /^\/api\/identity\/admin\/cyinvoice\/device-recovery\/invitations/);
    assert.equal(init.credentials, "same-origin");
    assert.equal(init.method, "POST"); assert.equal(init.cache, "no-store");
    assert.deepEqual(JSON.parse(init.body), {operationId:id, password:"syntheticpass"});
    return Response.json({ok:true, data:returned, requestId:"synthetic"});
  };
  try {
    assert.equal((await client.executeCyInvoiceRecoveryAction("issue", id, "syntheticpass")).status, "pending");
    returned={status:"revoked", operationId:"other"};
    await assert.rejects(client.executeCyInvoiceRecoveryAction("revoke", id, "syntheticpass"), /操作回應無法確認/);
    returned={status:"sent", invitationId:"inv_22222222-2222-4222-8222-222222222222", expiresAt:new Date().toISOString()};
    await assert.rejects(client.executeCyInvoiceRecoveryAction("revoke", id, "syntheticpass"));
    returned={status:"revoked", operationId:id, password:"must-not-reflect"};
    assert.deepEqual(await client.executeCyInvoiceRecoveryAction("status", id, "syntheticpass"), {status:"revoked",operationId:id});
    const before=calls;
    globalThis.fetch=async()=>{calls++; throw new Error("lost");};
    await assert.rejects(client.executeCyInvoiceRecoveryAction("issue", id, "syntheticpass"));
    assert.equal(calls,before+1,"no automatic replay");
  } finally { globalThis.fetch=oldFetch; }
});

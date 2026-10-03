import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const directory = mkdtempSync(fileURLToPath(new URL("../node_modules/.cyweb-navigation-", import.meta.url)));
let createGuardedHashNavigation;
try {
  const outfile = join(directory, "navigation.mjs");
  await build({ entryPoints: [fileURLToPath(new URL("../src/ui/foundation/guarded-hash-navigation.ts", import.meta.url))],
    outfile, bundle: true, platform: "node", format: "esm" });
  ({ createGuardedHashNavigation } = await import(pathToFileURL(outfile)));
} finally { rmSync(directory, { recursive: true, force: true }); }

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function screen(canLeave) {
  const writes = [], mounts = [];
  const navigation = createGuardedHashNavigation({ initial: "customers", canLeave,
    write(route, replace) { writes.push({ route, replace }); }, commit(route) { mounts.push(route); } });
  return { navigation, writes, mounts };
}
test("sidebar cancellation preserves editor; acceptance asks once and commits without saving", async () => {
  let calls = 0, accepted = false;
  const s = screen(async () => { calls++; return accepted; });
  assert.equal(await s.navigation.request("worklogs", "link"), false);
  assert.deepEqual(s.mounts, []); assert.deepEqual(s.writes, []);
  accepted = true;
  assert.equal(await s.navigation.request("worklogs", "link"), true);
  assert.equal(calls, 2); assert.deepEqual(s.mounts, ["worklogs"]);
  assert.deepEqual(s.writes, [{ route: "worklogs", replace: false }]);
  assert.equal(await s.navigation.request("worklogs", "hash"), true);
  assert.equal(calls, 2); // Own hash event must not ask again or remount.
});
test("Back/hash cancellation restores address without adding a history entry or unmounting", async () => {
  const decision = deferred(), s = screen(() => decision.promise);
  const pending = s.navigation.request("worklogs", "hash");
  assert.deepEqual(s.mounts, []);
  assert.deepEqual(s.writes, [{ route: "customers", replace: true }]);
  decision.resolve(false); assert.equal(await pending, false);
  assert.deepEqual(s.mounts, []); assert.equal(s.writes.length, 1);
});
test("Back/hash acceptance uses the visited history entry and mounts only after confirmation", async () => {
  const decision = deferred(), s = screen(() => decision.promise);
  const pending = s.navigation.request("worklogs", "hash");
  assert.deepEqual(s.mounts, []);
  decision.resolve(true); assert.equal(await pending, true);
  assert.deepEqual(s.mounts, ["worklogs"]);
  assert.deepEqual(s.writes, [{ route: "customers", replace: true }, { route: "worklogs", replace: true }]);
});
test("multiple navigation attempts share one pending decision and never mount a second target", async () => {
  const decision = deferred(); let calls = 0;
  const s = screen(() => { calls++; return decision.promise; });
  const first = s.navigation.request("worklogs", "link");
  assert.equal(await s.navigation.request("items", "hash"), false);
  assert.equal(calls, 1); assert.deepEqual(s.mounts, []);
  decision.resolve(true); assert.equal(await first, true); assert.deepEqual(s.mounts, ["worklogs"]);
});
test("permission enforcement invalidates a pending decision; it cannot remount forbidden content", async () => {
  const decision = deferred(), s = screen(() => decision.promise);
  const pending = s.navigation.request("items", "link");
  s.navigation.replace("identity"); decision.resolve(true);
  assert.equal(await pending, false); assert.deepEqual(s.mounts, ["identity"]);
  assert.deepEqual(s.writes, [{ route: "identity", replace: true }]);
});
test("failed decision releases transition lock so a later deliberate request can succeed", async () => {
  let failed = true; const s = screen(async () => { if (failed) throw new Error("cancelled provider"); return true; });
  assert.equal(await s.navigation.request("worklogs", "link"), false);
  assert.deepEqual(s.mounts, []); failed = false;
  assert.equal(await s.navigation.request("worklogs", "link"), true);
});

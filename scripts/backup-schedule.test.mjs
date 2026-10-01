import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const directory = mkdtempSync(join(tmpdir(), "cyweb-schedule-test-"));
let worker;
try {
  const outfile = join(directory, "worker.mjs");
  await build({ entryPoints: [new URL("../worker/index.ts", import.meta.url).pathname], outfile,
    bundle: true, platform: "node", format: "esm", logLevel: "silent" });
  worker = (await import(pathToFileURL(outfile))).default;
} finally { rmSync(directory, { recursive: true, force: true }); }

test("disabled or absent schedule flag never touches D1 or backup providers", async () => {
  for (const flag of [undefined, "", "false", "TRUE"]) {
    const env = { BACKUP_SCHEDULE_ENABLED: flag };
    for (const name of ["DB", "BACKUP_R2", "GCS_SERVICE_ACCOUNT_JSON", "BACKUP_ENABLED"]) {
      Object.defineProperty(env, name, { get() { throw new Error("Disabled schedule accessed " + name); } });
    }
    await worker.scheduled({ scheduledTime: Date.now() }, env);
  }
});

test("schedule opt-in still requires backup opt-in", async () => {
  const env = { BACKUP_SCHEDULE_ENABLED: "true", BACKUP_ENABLED: "false" };
  Object.defineProperty(env, "DB", { get() { throw new Error("Disabled backup accessed D1"); } });
  await worker.scheduled({ scheduledTime: Date.now() }, env);
  assert.equal(env.BACKUP_ENABLED, "false");
});

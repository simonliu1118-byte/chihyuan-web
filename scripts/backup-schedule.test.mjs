import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const directory = mkdtempSync(join(tmpdir(), "cyweb-schedule-test-"));
let worker;
try {
  const outfile = join(directory, "worker.mjs");
  await build({ entryPoints: [fileURLToPath(new URL("../worker/index.ts", import.meta.url))], outfile,
    bundle: true, platform: "node", format: "esm", logLevel: "silent" });
  worker = (await import(pathToFileURL(outfile))).default;
} finally { rmSync(directory, { recursive: true, force: true }); }

test("disabled or absent schedule flag never touches D1 or backup providers", async () => {
  for (const flag of [undefined, "", "false", "TRUE"]) {
    const env = { BACKUP_SCHEDULE_ENABLED: flag };
    for (const name of ["DB", "BACKUP_R2", "GCS_SERVICE_ACCOUNT_JSON", "BACKUP_ENABLED"]) {
      Object.defineProperty(env, name, { get() { throw new Error("Disabled schedule accessed " + name); } });
    }
    await worker.scheduled({ cron: "30 19 * * *", scheduledTime: Date.now() }, env);
  }
});

test("schedule opt-in still requires backup opt-in", async () => {
  const env = { BACKUP_SCHEDULE_ENABLED: "true", BACKUP_ENABLED: "false" };
  Object.defineProperty(env, "DB", { get() { throw new Error("Disabled backup accessed D1"); } });
  await worker.scheduled({ cron: "30 19 * * *", scheduledTime: Date.now() }, env);
  assert.equal(env.BACKUP_ENABLED, "false");
});

test("in-app Super Admin reminder observes Taiwan calendar quarter and only successful Audit completion", async () => {
  const { taiwanQuarter, quarterlyRehearsalReminder } = await import("../shared/backup-quarterly.ts");
  assert.equal(taiwanQuarter("2026-12-31T15:59:59Z"), "2026-Q4");
  assert.equal(taiwanQuarter("2026-12-31T16:00:00Z"), "2027-Q1");
  assert.equal(quarterlyRehearsalReminder("2027-01-01T00:30:00Z", "2026-10-28T13:11:00Z").due, true);
  assert.equal(quarterlyRehearsalReminder("2027-01-01T00:30:00Z", "2027-01-01T00:00:00Z").due, false);
  assert.equal(quarterlyRehearsalReminder("2027-01-01T00:30:00Z", null).due, true);
});

test("V0.9.51 quarterly reminder rechecks once daily instead of every hour", async () => {
  const { QUARTERLY_REMINDER_RECHECK_MS } = await import("../shared/backup-quarterly.ts");
  assert.equal(QUARTERLY_REMINDER_RECHECK_MS, 24 * 60 * 60 * 1000);
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /now - lastCheck < QUARTERLY_REMINDER_RECHECK_MS/);
  assert.match(app, /window\.setInterval\(\(\) => refresh\(\), QUARTERLY_REMINDER_RECHECK_MS\)/);
});

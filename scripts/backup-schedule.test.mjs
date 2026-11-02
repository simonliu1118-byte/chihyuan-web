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

// The daily backup rides the every-minute housekeeping trigger (Free plan: 5 cron triggers per account).
const at = time => Date.parse("2026-11-03T" + time + ":00Z");
const quietDb = () => ({ prepare() { return { bind() { return this; }, async first() { return { queued: 0, running: 0 }; },
  async all() { return { results: [] }; }, async run() { return { meta: { changes: 0 } }; } }; }, async batch() { return []; } });

test("backup minutes are Taiwan 03:30 and 03:45 only", async () => {
  const { isScheduledBackupMinute } = await import("../shared/backup-schedule.ts");
  for (const t of ["19:30", "19:45"]) assert.equal(isScheduledBackupMinute(at(t)), true, t);
  for (const t of ["19:29", "19:31", "03:30", "11:30", "19:00"]) assert.equal(isScheduledBackupMinute(at(t)), false, t);
});

test("disabled or absent schedule flag never touches backup providers, even at the backup minute", async () => {
  for (const flag of [undefined, "", "false", "TRUE"]) {
    const env = { BACKUP_SCHEDULE_ENABLED: flag, DB: quietDb() };
    for (const name of ["BACKUP_R2", "GCS_SERVICE_ACCOUNT_JSON", "BACKUP_ENABLED"]) {
      Object.defineProperty(env, name, { get() { throw new Error("Disabled schedule accessed " + name); } });
    }
    await worker.scheduled({ cron: "* * * * *", scheduledTime: at("19:30") }, env);
  }
});

test("schedule opt-in still requires backup opt-in; other minutes never start a backup", async () => {
  const env = { BACKUP_SCHEDULE_ENABLED: "true", BACKUP_ENABLED: "false", DB: quietDb() };
  await worker.scheduled({ cron: "* * * * *", scheduledTime: at("19:30") }, env);
  const busy = { BACKUP_SCHEDULE_ENABLED: "true", DB: quietDb() };
  Object.defineProperty(busy, "BACKUP_ENABLED", { get() { throw new Error("backup started outside its minute"); } });
  await worker.scheduled({ cron: "* * * * *", scheduledTime: at("19:31") }, busy);
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

import test from "node:test";
import assert from "node:assert/strict";
import { quarterlyRehearsalReminder, taiwanQuarter } from "../shared/backup-quarterly.ts";

test("quarter boundaries use Taiwan midnight, not UTC or browser timezone", () => {
  assert.equal(taiwanQuarter("2026-12-31T15:59:59.000Z"), "2026-Q4");
  assert.equal(taiwanQuarter("2026-12-31T16:00:00.000Z"), "2027-Q1");
  assert.equal(taiwanQuarter("2027-04-01T00:00:00.000Z"), "2027-Q2");
});
test("quarterly Super Admin reminder clears only after a successful rehearsal in current quarter", () => {
  const now = "2027-01-01T00:30:00.000Z";
  assert.deepEqual(quarterlyRehearsalReminder(now, null), {
    quarter: "2027-Q1", due: true, lastVerifiedAt: null, frequency: "quarterly"
  });
  assert.equal(quarterlyRehearsalReminder(now, "2026-10-28T13:11:00.000Z").due, true);
  assert.equal(quarterlyRehearsalReminder(now, "2027-01-01T00:00:00.000Z").due, false);
});

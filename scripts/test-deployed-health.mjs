import test from "node:test";
import assert from "node:assert/strict";
import { observeHealth } from "./verify-deployed-health.mjs";

const expected = { version: "0.7.9", consumer: "1.0.2", sourceCommit: "a".repeat(40) };
const targets = [{ label: "canonical", url: "https://canonical.invalid" }, { label: "workers_dev", url: "https://worker.invalid" }];
const health = overrides => Response.json({ ok: true, data: { service: "cyweb", database: "ok",
  version: expected.version, identityConsumerVersion: expected.consumer, sourceCommit: expected.sourceCommit, ...overrides } });

test("older canonical deployment becomes ready without redeployment; both origins checked", async () => {
  let clock = 0;
  const urls = [];
  const result = await observeHealth({ targets, expected, now: () => clock, sleep: async ms => { clock += ms; }, log: () => {},
    fetchImpl: async url => { urls.push(url); return url.includes("canonical") && clock < 12000 ? health({ version: "0.7.8", sourceCommit: "b".repeat(40) }) : health(); } });
  assert.equal(result.elapsedMs, 12000);
  assert.equal(result.observations[0].result, "source_version_mismatch");
  assert.equal(result.observations[1].result, "ready");
  assert.equal(urls.length, 26);
  assert.ok(urls.every(url => url.endsWith("/api/health")));
});

for (const [category, response] of [
  ["source_commit_mismatch", () => health({ sourceCommit: "b".repeat(40) })],
  ["consumer_mismatch", () => health({ identityConsumerVersion: "1.0.1" })],
  ["d1_unavailable", () => health({ database: "unavailable" })],
  ["http_failure", () => Response.json({ secret: "never-print-this" }, { status: 503 })],
  ["invalid_json", () => new Response("never-print-this")],
  ["invalid_health_envelope", () => Response.json({ ok: false, secret: "never-print-this" })],
  ["network_failure", () => { throw new Error("never-print-this"); }],
]) {
  test("permanent " + category + " fails with bounded safe diagnostics", async () => {
    let clock = 0;
    const logs = [];
    await assert.rejects(observeHealth({ targets, expected, timeoutMs: 2000, now: () => clock,
      sleep: async ms => { clock += ms; }, log: value => logs.push(value), fetchImpl: async () => response() }), /HEALTH_MISMATCH/);
    assert.equal(clock, 2000);
    assert.equal(logs.length, 6);
    assert.ok(logs.every(value => JSON.parse(value).result === category));
    assert.ok(logs.every(value => !value.includes("never-print-this") && !value.includes("https://")));
  });
}

test("untrusted health version/commit/cache values cannot leak via diagnostics", async () => {
  const logs = [];
  await assert.rejects(observeHealth({ targets, expected, timeoutMs: 0, log: value => logs.push(value),
    fetchImpl: async () => health({ version: "private-identity", sourceCommit: "secret" }) }), /HEALTH_MISMATCH/);
  assert.ok(logs.every(value => !value.includes("private-identity") && !value.includes("secret")));
});

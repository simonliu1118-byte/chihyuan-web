#!/usr/bin/env node
/**
 * Synthetic ERP bridge acceptance against an EXISTING, isolated CY Web deployment.
 * Environment ONLY: CYWEB_ACCEPTANCE_BASE_URL, CYWEB_ACCEPTANCE_USER_COOKIE,
 * CYWEB_ACCEPTANCE_AGENT_TOKEN, optional CYWEB_ACCEPTANCE_NO_ACCESS_COOKIE.
 * Never log credentials, never use real ERP data or production Work Items.
 */
import assert from "node:assert/strict";

const base = process.env.CYWEB_ACCEPTANCE_BASE_URL?.replace(/\/$/, "");
const cookie = process.env.CYWEB_ACCEPTANCE_USER_COOKIE;
const token = process.env.CYWEB_ACCEPTANCE_AGENT_TOKEN;
if (!base || !cookie || !token || !/^https?:\/\//.test(base)) {
  console.error("Set isolated CYWEB_ACCEPTANCE_BASE_URL, CYWEB_ACCEPTANCE_USER_COOKIE and CYWEB_ACCEPTANCE_AGENT_TOKEN.");
  process.exit(2);
}
async function api(path, method = "GET", body, headers = {}) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "error",
  });
  const payload = await response.json();
  assert.equal(typeof payload.requestId, "string");
  assert.equal(typeof payload.ok, "boolean");
  return { status: response.status, payload };
}
const user = (path, method, body) => api(path, method, body, { cookie });
const agent = (path, body, bearer = token) => api(path, "POST", body, { authorization: `Bearer ${bearer}` });
async function newJob(itemNo) {
  const response = await user("/api/erp/item-queries", "POST", { itemNo });
  assert.equal(response.status, 202);
  assert.equal(response.payload.data.status, "QUEUED");
  return response.payload.data.id;
}
async function claim(id) {
  const response = await agent("/api/erp-agent/item-queries/claim", { agentVersion: "acceptance", erpState: "BROWSE" });
  assert.equal(response.status, 200);
  assert.equal(response.payload.data.job.id, id);
}
async function complete(id, outcome, extra) {
  const response = await agent(`/api/erp-agent/item-queries/${id}/complete`, {
    outcome, fields: [], warehouses: [], elapsedMs: 42, agentVersion: "acceptance", ...extra,
  });
  assert.equal(response.status, 200);
  const lookup = await user(`/api/erp/item-queries/${id}`);
  assert.equal(lookup.status, 200);
  assert.equal(lookup.payload.data.status, outcome === "FOUND" ? "DONE" : outcome);
  return lookup.payload.data;
}
const badToken = await agent("/api/erp-agent/item-queries/claim", { agentVersion: "acceptance", erpState: "BROWSE" }, "invalid-credential-string-placeholder");
assert.equal(badToken.status, 401);
const cannotUseBrowser = await api("/api/erp/agent-status", "GET", undefined, { authorization: `Bearer ${token}` });
assert.equal(cannotUseBrowser.status, 401);
const first = await newJob("T0001");
assert.equal((await user("/api/erp/item-queries", "POST", { itemNo: "T0002" })).status, 409);
await claim(first);
const emptyClaim = await agent("/api/erp-agent/item-queries/claim", { agentVersion: "acceptance", erpState: "BROWSE" });
assert.deepEqual(emptyClaim.payload.data, { job: null });
const invalidField = await agent(`/api/erp-agent/item-queries/${first}/complete`, {
  outcome: "FOUND", fields: [{ name: "品號", value: "T0001" }, { name: "庫存金額", value: "999" }],
  warehouses: [], elapsedMs: 42, agentVersion: "acceptance",
});
assert.equal(invalidField.status, 400);
const found = await complete(first, "FOUND", {
  fields: [{ name: "品號", value: "T0001" }, { name: "品名", value: "假品名" }],
  warehouses: [[{ name: "庫別", value: "W01" }, { name: "庫別名稱", value: "測試倉" }]],
});
assert.equal(found.fields[1].value, "假品名");
assert.equal((await agent(`/api/erp-agent/item-queries/${first}/complete`, {
  outcome: "FOUND", fields: [], warehouses: [], elapsedMs: 42, agentVersion: "acceptance",
})).status, 409);
const second = await newJob("T0002");
await claim(second);
await complete(second, "NOT_FOUND");
const third = await newJob("T0003");
await claim(third);
const failure = await complete(third, "FAILED", { errorCode: "ERP_BUSY", errorMessage: "Should never be persisted" });
assert.equal(failure.errorMessage, "ERP 正在忙碌");
const noAccess = process.env.CYWEB_ACCEPTANCE_NO_ACCESS_COOKIE;
if (noAccess) {
  const denied = await api("/api/erp/agent-status", "GET", undefined, { cookie: noAccess });
  assert.equal(denied.status, 403);
}
console.log("PASS ERP bridge synthetic acceptance: 401, queue 409, claim, busy, white-list 400, FOUND, NOT_FOUND, FAILED, repeat 409.");

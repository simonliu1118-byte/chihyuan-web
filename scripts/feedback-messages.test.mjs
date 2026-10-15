import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const directory = mkdtempSync(join(tmpdir(), "cyweb-feedback-"));
let localizeApiError, chineseMessage, ApiClientError, apiRequest;
try {
  for (const name of ["error-messages", "client"]) {
    const source = readFileSync(new URL(`../src/api/${name}.ts`, import.meta.url), "utf8");
    writeFileSync(join(directory, `${name}.mjs`), stripTypeScriptTypes(source, { mode: "transform" }).replace('"./error-messages"', '"./error-messages.mjs"'));
  }
  ({ localizeApiError, chineseMessage } = await import(pathToFileURL(join(directory, "error-messages.mjs"))));
  ({ ApiClientError, apiRequest } = await import(pathToFileURL(join(directory, "client.mjs"))));
} finally { rmSync(directory, { recursive: true, force: true }); }

test("duplicate identities, stale writes and domain conflicts remain distinct Chinese explanations", () => {
  assert.match(localizeApiError("EMPLOYEE_CONFLICT", "Employee No or Email already exists in this Workspace."), /員工編號或電子郵件已被使用/);
  assert.match(localizeApiError("EMPLOYEE_REVISION_CONFLICT"), /資料已變更/);
  assert.match(localizeApiError("ITEM_NO_CONFLICT"), /商品編號已被使用/);
  assert.match(localizeApiError("OUTSOURCING_TRANSITION_NOT_ALLOWED"), /狀態及前後流程/);
  assert.match(localizeApiError("CURRENT_PASSWORD_INVALID"), /目前密碼不正確/);
});
test("all literal current Worker error codes have Chinese safe output, including unknown diagnostics", () => {
  const codes = new Set();
  function walk(directory) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      if (item.name === "acceptance") continue;
      const path = new URL(item.name + (item.isDirectory() ? "/" : ""), directory);
      if (item.isDirectory()) walk(path);
      else if (item.name.endsWith(".ts")) {
        for (const match of readFileSync(path, "utf8").matchAll(/(?:Error\(|code:)\s*"([A-Z][A-Z0-9_]+)"/g)) codes.add(match[1]);
      }
    }
  }
  walk(new URL("../worker/", import.meta.url));
  assert(codes.size > 100);
  for (const code of codes) {
    const message = localizeApiError(code, "Internal English diagnostic, do not display");
    assert.match(message, /[\u3400-\u9fff]/u, code);
    assert.doesNotMatch(message, /Internal English|[A-Z]{3,}_[A-Z_]+/, code);
  }
  assert.match(chineseMessage("TypeError: failed to fetch"), /操作未完成/);
});
test("localization preserves status/code/request identity and replaces English field diagnostics", () => {
  const error = new ApiClientError({ status: 409, code: "EMPLOYEE_CONFLICT", requestId: "synthetic", message: "Employee conflict", fields: { email: "Email is invalid", name: "請填寫姓名" } });
  assert.equal(error.status, 409); assert.equal(error.code, "EMPLOYEE_CONFLICT"); assert.equal(error.requestId, "synthetic");
  assert.match(error.fields.email, /此欄位內容不符合要求/); assert.equal(error.fields.name, "請填寫姓名");
});
test("network failure and malformed responses become Chinese errors; deliberate abort remains abort", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
    await assert.rejects(apiRequest("/synthetic"), error => error.code === "NETWORK_ERROR" && /無法連線/.test(error.message));
    globalThis.fetch = async () => new Response("invalid");
    await assert.rejects(apiRequest("/synthetic"), error => error.code === "INVALID_API_RESPONSE" && /回應格式異常/.test(error.message));
    globalThis.fetch = async () => { throw new DOMException("aborted", "AbortError"); };
    await assert.rejects(apiRequest("/synthetic"), error => error.name === "AbortError");
  } finally { globalThis.fetch = original; }
});

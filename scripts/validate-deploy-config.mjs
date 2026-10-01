import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderDeployConfig } from "./render-deploy-config.mjs";

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cyweb-deploy-config-"));
const output = path.join(temporary, "wrangler.generated.jsonc");

const env = {
  CF_WORKER_NAME: "cyweb-ci",
  CF_PUBLIC_HOSTNAME: "admin.chihyuancm.com",
  CF_D1_DATABASE_NAME: "cyweb-ci-db",
  CF_D1_DATABASE_ID: "11111111-1111-4111-8111-111111111111",
  CF_IDENTITY_SERVICE: "cycloud-identity-ci-placeholder",
  CF_IDENTITY_APPLICATION_ID: "CYWEB",
  CF_IDENTITY_WORKSPACE_ID: "ws_11111111-1111-4111-8111-111111111111",
};

try {
  renderDeployConfig({ env, outputPath: output });
  const raw = fs.readFileSync(output, "utf8");
  const config = JSON.parse(raw);

  if (config.name !== env.CF_WORKER_NAME) throw new Error("worker name mismatch");
  if (config.workers_dev !== true) throw new Error("workers.dev fallback must remain enabled");
  if (config.routes?.length !== 1) throw new Error("canonical Custom Domain route missing");
  if (config.routes[0]?.pattern !== env.CF_PUBLIC_HOSTNAME) throw new Error("public hostname mismatch");
  if (config.routes[0]?.custom_domain !== true) throw new Error("public hostname must be a Custom Domain");
  if (config.d1_databases?.[0]?.binding !== "DB") throw new Error("DB binding missing");
  if (config.d1_databases?.[0]?.database_id !== env.CF_D1_DATABASE_ID) {
    throw new Error("D1 database id mismatch");
  }
  if (config.services?.[0]?.binding !== "IDENTITY") throw new Error("IDENTITY binding missing");
  if (config.services?.[0]?.service !== env.CF_IDENTITY_SERVICE) {
    throw new Error("IDENTITY service mismatch");
  }
  if (config.vars?.IDENTITY_APPLICATION_ID !== env.CF_IDENTITY_APPLICATION_ID) {
    throw new Error("Identity application mismatch");
  }
  if (config.vars?.IDENTITY_WORKSPACE_ID !== env.CF_IDENTITY_WORKSPACE_ID) {
    throw new Error("Identity Workspace mismatch");
  }
  if (config.vars?.SOURCE_VERSION !== fs.readFileSync(new URL("../VERSION", import.meta.url), "utf8").trim()) throw new Error("deployed source marker mismatch");
  if (config.vars?.IDENTITY_CONSUMER_VERSION !== fs.readFileSync(new URL("../CYID_CONSUMER_VERSION", import.meta.url), "utf8").trim()) throw new Error("consumer declaration missing from deployed health marker");
  if (/__CF_[A-Z0-9_]+__/.test(raw)) throw new Error("unresolved placeholder remains");

  let missingRejected = false;
  try {
    renderDeployConfig({ env: { ...env, CF_PUBLIC_HOSTNAME: "" }, outputPath: output });
  } catch {
    missingRejected = true;
  }
  if (!missingRejected) throw new Error("missing deployment variable was not rejected");

  let invalidRejected = false;
  try {
    renderDeployConfig({ env: { ...env, CF_PUBLIC_HOSTNAME: "https://admin.chihyuancm.com" }, outputPath: output });
  } catch {
    invalidRejected = true;
  }
  if (!invalidRejected) throw new Error("hostname with URL scheme was not rejected");

  console.log("PASS Cloudflare deployment config render contract");
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

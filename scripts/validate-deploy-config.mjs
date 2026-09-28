import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderDeployConfig } from "./render-deploy-config.mjs";

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cyweb-deploy-config-"));
const output = path.join(temporary, "wrangler.generated.jsonc");

const env = {
  CF_WORKER_NAME: "cyweb-ci",
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
  if (/__CF_[A-Z0-9_]+__/.test(raw)) throw new Error("unresolved placeholder remains");

  let missingRejected = false;
  try {
    renderDeployConfig({ env: { ...env, CF_IDENTITY_WORKSPACE_ID: "" }, outputPath: output });
  } catch {
    missingRejected = true;
  }
  if (!missingRejected) throw new Error("missing deployment variable was not rejected");

  console.log("PASS Cloudflare deployment config render contract");
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

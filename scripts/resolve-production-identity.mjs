import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inspectAccountPortal } from "./audit-account-portal.mjs";

/** The existing Worker and business D1 remain unchanged. Only Identity runtime
 * is resolved from canonical production authority on EVERY real deployment. */
export async function resolveCyWebProductionIdentity({ env, canonical, fetchImpl = fetch }) {
  const { report, runtime, coreApplicationId } = await inspectAccountPortal({
    accountId: env.CLOUDFLARE_ACCOUNT_ID, apiToken: env.CLOUDFLARE_API_TOKEN,
    configuredIdentityService: env.CYID_LOOKUP_SERVICE ?? env.CF_IDENTITY_SERVICE,
    configuredWorker: env.CF_WORKER_NAME, configuredDatabaseId: env.CF_D1_DATABASE_ID,
    resolveProductionRuntime: canonical.resolveCyidProductionRuntime,
    verifyProductionPortal: canonical.verifyCyWebProductionPortal, fetchImpl,
  });
  // The explicitly approved transition may change only this known authority
  // mismatch. All other topology, Workspace, App and health checks must pass.
  if (!report.portalIsConfiguredDevelopmentWorker || !report.portalUsesConfiguredDevelopmentBusinessDatabase
      || !report.workspaceMatchesProductionConsumer || !report.applicationMatchesProductionCore
      || !report.healthMatchesRuntime || !report.identityBindingEnvironmentAllowed
      || (!report.productionPortalReady && (report.failureCode !== "CYWEB_PRODUCTION_AUTHORITY_MISMATCH"
        || !report.portalUsesConfiguredDevelopmentIdentity))
      || env.CF_IDENTITY_APPLICATION_ID !== coreApplicationId
      || env.CF_IDENTITY_WORKSPACE_ID !== runtime.workspaceId)
    throw new Error("CYWEB_PRODUCTION_TRANSITION_SCOPE_MISMATCH");
  // No Worker/D1/Module Access/Employee/cookie/grant output or mutation.
  return { CF_IDENTITY_SERVICE: runtime.service,
    CF_IDENTITY_APPLICATION_ID: coreApplicationId, CF_IDENTITY_WORKSPACE_ID: runtime.workspaceId };
}

async function cli() {
  try {
    const root = path.resolve(process.env.CYAPPS_SOURCE_ROOT ?? ".tmp/canonical-cyapps");
    const canonical = await import(pathToFileURL(path.join(root,
      "apps/CYAccountingWeb/scripts/resolve-cyid-production-runtime.mjs")));
    const values = await resolveCyWebProductionIdentity({ env: process.env, canonical });
    if (!process.env.GITHUB_ENV) throw new Error("CYWEB_PRODUCTION_RUNNER_REQUIRED");
    for (const value of Object.values(values)) console.log("::add-mask::" + value);
    fs.appendFileSync(process.env.GITHUB_ENV,
      Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(""), {encoding:"utf8"});
    console.log("CYWEB_PRODUCTION_IDENTITY_RESOLVED: verified canonical provider; existing Worker/business D1 and Module Access retained.");
  } catch (error) {
    const code = /^(CYWEB_[A-Z_]+( [^\r\n]{1,300})?|PRODUCTION_CORE_CONSUMER_NOT_READY)$/.test(error?.message ?? "")
      ? error.message : "CYWEB_PRODUCTION_RUNTIME_UNAVAILABLE";
    console.error(code); process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await cli();

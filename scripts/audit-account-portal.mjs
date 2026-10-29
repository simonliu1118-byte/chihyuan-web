import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const workerName = /^[a-z0-9][a-z0-9._-]{1,62}$/i;
const version = /^\d+\.\d+\.\d+$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const value = (settings, name) => settings?.result?.bindings?.find(b => b.type === "plain_text" && b.name === name)?.text;
const binding = (settings, name, type) => settings?.result?.bindings?.filter(b => b.name === name && b.type === type);
function fail(code) { throw new Error(code); }

/** Read-only topology audit. The CYID/CYACC canonical resolver owns readiness. */
export async function inspectAccountPortal({ accountId, apiToken, configuredIdentityService,
  configuredWorker, configuredDatabaseId, resolveProductionRuntime, verifyProductionPortal,
  fetchImpl = fetch }) {
  if (!accountId || !apiToken || !workerName.test(configuredIdentityService ?? "")
      || !workerName.test(configuredWorker ?? "") || !uuid.test(configuredDatabaseId ?? ""))
    fail("CYWEB_AUDIT_INPUT_INVALID");
  const api = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}`;
  // This adapter also constrains calls made by the imported canonical resolver:
  // only GET, HTTPS, no redirects/retry, no credential forwarding to health URLs.
  const observations = new Map();
  const readOnlyFetch = async (url, init = {}) => {
    const target = new URL(url);
    if ((init.method ?? "GET") !== "GET" || target.protocol !== "https:" || init.body != null)
      fail("CYWEB_AUDIT_NON_READ_REQUEST");
    const headers = new Headers(init.headers);
    if (headers.has("authorization") && (!target.href.startsWith(api + "/")
        || target.origin !== "https://api.cloudflare.com")) fail("CYWEB_AUDIT_CREDENTIAL_TARGET_INVALID");
    const response = await fetchImpl(url, { ...init, method: "GET", redirect: "error", signal: AbortSignal.timeout(20000) });
    const payload = await response.clone().json().catch(() => null);
    // Health envelopes have a fresh requestId per read; compare deployed
    // provenance and health, not per-request tracing metadata.
    const snapshot = target.origin === "https://api.cloudflare.com" ? payload?.result : {
      ok: payload?.ok, service: payload?.data?.service, database: payload?.data?.database,
      identityConsumerVersion: payload?.data?.identityConsumerVersion,
      version: payload?.data?.version, sourceCommit: payload?.data?.sourceCommit,
    };
    const fingerprint = JSON.stringify(snapshot);
    if (observations.has(target.href) && observations.get(target.href) !== fingerprint)
      fail("CYWEB_AUDIT_SNAPSHOT_CHANGED");
    observations.set(target.href, fingerprint);
    return response;
  };
  async function read(resource, { missingOk = false } = {}) {
    const response = await readOnlyFetch(api + resource, { headers: {authorization: `Bearer ${apiToken}`} });
    const data = await response.json().catch(() => null);
    if (missingOk && response.status === 404) return null;
    // Which read failed and why (HTTP status, Cloudflare error codes); ids are masked.
    if (!response.ok || data?.success !== true)
      fail(`CYWEB_AUDIT_RESOURCE_UNAVAILABLE ${resource.replace(/[0-9a-f-]{36}/gi, "<id>").split("?")[0]} HTTP ${response.status} cf=${(data?.errors ?? []).map(e => e.code).join(",")}`);
    return data;
  }
  // The DEVELOPMENT deployment input only seeds the canonical production name. The
  // development CYID Worker was removed (user, 2026-10-29: unused D1／Workers cleaned up);
  // when it still exists it must really be development.
  const configuredIdentity = await read(`/workers/scripts/${encodeURIComponent(configuredIdentityService)}/settings`, { missingOk: true });
  if (configuredIdentity && value(configuredIdentity, "APP_ENV") !== "development") fail("CYWEB_AUDIT_DEVELOPMENT_INPUT_UNVERIFIED");
  const runtime = await resolveProductionRuntime({ accountId, apiToken,
    developmentService: configuredIdentityService, requirePortal: false, fetchImpl: readOnlyFetch });
  const provider = await read(`/workers/scripts/${encodeURIComponent(runtime.service)}/settings`);
  const productionDb = binding(provider, "DB", "d1");
  const developmentDb = configuredIdentity ? binding(configuredIdentity, "DB", "d1") : [];
  if (productionDb?.length !== 1 || !uuid.test(productionDb[0].id ?? "")
      || (configuredIdentity && (developmentDb?.length !== 1 || !uuid.test(developmentDb[0].id ?? "")
        || productionDb[0].id === developmentDb[0].id))) fail("CYWEB_AUDIT_PROVIDER_DB_ISOLATION_UNVERIFIED");
  const productionMetadata = await read(`/d1/database/${encodeURIComponent(productionDb[0].id)}`);
  if (productionMetadata.result?.uuid !== productionDb[0].id) fail("CYWEB_AUDIT_PROVIDER_DB_METADATA_MISMATCH");
  let portal;
  try {
    portal = new URL(value(provider, "ACCOUNT_PORTAL_URL"));
    if (portal.protocol !== "https:" || portal.username || portal.password || portal.search || portal.hash || portal.pathname !== "/") throw new Error();
  } catch { fail("CYWEB_PRODUCTION_PORTAL_INVALID"); }
  const domains = await read(`/workers/domains?hostname=${encodeURIComponent(portal.hostname)}`);
  const matches = domains.result?.filter(row => row.hostname === portal.hostname && row.enabled !== false
    && [undefined, "production"].includes(row.environment));
  if (matches?.length !== 1 || !workerName.test(matches[0].service ?? "")) fail("CYWEB_PRODUCTION_DOMAIN_UNVERIFIED");
  const portalSettings = await read(`/workers/scripts/${encodeURIComponent(matches[0].service)}/settings`);
  const portalIdentity = binding(portalSettings, "IDENTITY", "service");
  const portalDb = binding(portalSettings, "DB", "d1");
  if (portalIdentity?.length !== 1 || portalDb?.length !== 1 || !uuid.test(portalDb[0].id ?? ""))
    fail("CYWEB_AUDIT_PORTAL_BINDINGS_UNVERIFIED");
  const database = await read(`/d1/database/${encodeURIComponent(portalDb[0].id)}`);
  if (database.result?.uuid !== portalDb[0].id) fail("CYWEB_AUDIT_PORTAL_DB_METADATA_MISMATCH");
  if ([productionDb[0].id, developmentDb[0]?.id].includes(portalDb[0].id))
    fail("CYWEB_AUDIT_IDENTITY_BUSINESS_DB_COLLISION");
  const healthResponse = await readOnlyFetch(new URL("/api/health", portal).href);
  const health = await healthResponse.json().catch(() => null);
  const currentProvider = configuredIdentity && portalIdentity[0].service === configuredIdentityService ? configuredIdentity
    : portalIdentity[0].service === runtime.service ? provider : null;
  // Repeat the SAME canonical strict guard after observing topology, so drift
  // during the audit cannot be reported as readiness merely from local fields.
  let ready = false, failureCode = "CYWEB_PRODUCTION_PREFLIGHT_FAILED";
  try {
    await verifyProductionPortal({ account: accountId, token: apiToken, runtime, provider, fetchImpl: readOnlyFetch });
    ready = true; failureCode = null;
  } catch (error) {
    if (error?.message === "CYWEB_AUDIT_SNAPSHOT_CHANGED") throw error;
    if (/^(CYWEB_[A-Z_]+|PRODUCTION_CORE_CONSUMER_NOT_READY)$/.test(error?.message ?? "")) failureCode = error.message;
  }
  const consumerVersion = value(portalSettings, "IDENTITY_CONSUMER_VERSION");
  const report = {
    checkedAt: new Date().toISOString(), mutationPerformed: false,
    canonicalProductionProviderVerified: true, productionIdentityDatabaseMetadataVerified: true,
    identityDatabasesSeparated: true, portalDomainResolved: true, portalBusinessDatabaseMetadataVerified: true,
    portalIsConfiguredDevelopmentWorker: matches[0].service === configuredWorker,
    portalUsesConfiguredDevelopmentBusinessDatabase: portalDb[0].id === configuredDatabaseId,
    portalUsesConfiguredDevelopmentIdentity: portalIdentity[0].service === configuredIdentityService,
    portalUsesCanonicalProductionIdentity: portalIdentity[0].service === runtime.service,
    portalIdentityProviderEnvironment: currentProvider ? value(currentProvider, "APP_ENV") === "production" ? "production" : "development" : "unverified",
    workspaceMatchesProductionConsumer: value(portalSettings, "IDENTITY_WORKSPACE_ID") === runtime.workspaceId,
    applicationMatchesProductionCore: value(portalSettings, "IDENTITY_APPLICATION_ID") === value(provider, "CORE_ACCOUNT_APPLICATION_ID"),
    identityBindingEnvironmentAllowed: [undefined, "production"].includes(portalIdentity[0].environment),
    consumerVersion: typeof consumerVersion === "string" && version.test(consumerVersion) ? consumerVersion : null,
    healthMatchesRuntime: healthResponse.ok && health?.ok === true && health.data?.service === "cyweb"
      && health.data?.database === "ok" && health.data?.identityConsumerVersion === consumerVersion,
    productionPortalReady: ready, failureCode,
  };
  // Private deployment context is returned only to the resolver; CLI and audit
  // consumers project report exclusively. No identifiers go to public evidence.
  return { report, runtime, coreApplicationId: value(provider, "CORE_ACCOUNT_APPLICATION_ID") };
}

export async function auditAccountPortal(options) {
  return (await inspectAccountPortal(options)).report;
}

async function cli() {
  try {
    // Both functions come directly from the currently checked-out canonical
    // CYapps source. This repo does not mirror/reimplement their decision.
    const root = path.resolve(process.env.CYAPPS_SOURCE_ROOT ?? ".tmp/canonical-cyapps");
    const canonical = await import(pathToFileURL(path.join(root,
      "apps/CYAccountingWeb/scripts/resolve-cyid-production-runtime.mjs")));
    const report = await auditAccountPortal({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN, configuredIdentityService: process.env.CYID_LOOKUP_SERVICE ?? process.env.CF_IDENTITY_SERVICE,
      configuredWorker: process.env.CF_WORKER_NAME, configuredDatabaseId: process.env.CF_D1_DATABASE_ID,
      resolveProductionRuntime: canonical.resolveCyidProductionRuntime,
      verifyProductionPortal: canonical.verifyCyWebProductionPortal });
    // Report has only booleans, normalized version/environment, stable codes/time.
    console.log("CYWEB_IDENTITY_AUDIT " + JSON.stringify(report));
    if (process.argv.includes("--require-production") && !report.productionPortalReady)
      fail(report.failureCode ?? "CYWEB_PRODUCTION_PREFLIGHT_FAILED");
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      "## CYWEB account portal read-only audit\n\n```json\n" + JSON.stringify(report, null, 2) + "\n```\n");
  } catch (error) {
    const code = /^(CYWEB_[A-Z_]+|PRODUCTION_CORE_CONSUMER_NOT_READY)$/.test(error?.message ?? "")
      ? error.message : "CYWEB_AUDIT_UNAVAILABLE";
    console.error(code); process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await cli();

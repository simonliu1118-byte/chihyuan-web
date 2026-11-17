import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Resolves the deployment identifiers of the live CY Web Worker from Cloudflare, starting from the public
 * hostname, so the workflow never reads them from GitHub variables (runner env blocks print those in clear
 * text before any ::add-mask:: can run; the repository and its Actions logs are public).
 *
 * The Worker currently serving CF_PUBLIC_HOSTNAME is the source of truth for its own bindings: to retarget a
 * binding, change it in Cloudflare first. Every value is masked before it reaches GITHUB_ENV.
 */
const workerName = /^[a-z0-9][a-z0-9._-]{1,62}$/i;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hostname = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const bucket = /^[a-z0-9][a-z0-9_-]{1,61}[a-z0-9]$/;
const applicationId = /^[A-Z0-9][A-Z0-9_-]{1,63}$/;
const workspaceId = /^[A-Za-z0-9_-]{5,80}$/;
const fail = code => { throw new Error(code); };

/** Temporary: the canonical CYapps resolver still derives production from a development seed name
 * (`-dev` → `-prod`). Until that naming cleanup lands, hand it the seed that maps back to the live binding. */
export function identitySeedFor(productionService) {
  if (productionService.endsWith("-prod")) return productionService.slice(0, -"-prod".length) + "-dev";
  if (productionService.endsWith("-production")) return productionService.slice(0, -"-production".length) + "-development";
  return fail("CYWEB_DEPLOY_IDENTITY_NAME_UNSUPPORTED");
}

export async function resolveDeployRuntime({ accountId, apiToken, publicHostname, backupEnabled = "", fetchImpl = fetch }) {
  if (!accountId || !apiToken || !hostname.test(publicHostname ?? "")) fail("CYWEB_DEPLOY_INPUT_INVALID");
  const api = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}`;
  async function read(resource) {
    const response = await fetchImpl(api + resource, { method: "GET", redirect: "error",
      headers: { authorization: `Bearer ${apiToken}` }, signal: AbortSignal.timeout(20000) });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true)
      fail(`CYWEB_DEPLOY_RESOURCE_UNAVAILABLE ${resource.split("/")[1].split("?")[0]} HTTP ${response.status} cf=${(data?.errors ?? []).map(e => e.code).join(",")}`);
    return data.result;
  }

  const domains = (await read(`/workers/domains?hostname=${encodeURIComponent(publicHostname)}`)) ?? [];
  const served = domains.filter(row => row.hostname === publicHostname && row.enabled !== false
    && [undefined, "production"].includes(row.environment));
  if (served.length !== 1 || !workerName.test(served[0].service ?? "")) fail("CYWEB_DEPLOY_DOMAIN_UNVERIFIED");
  const worker = served[0].service;

  const bindings = (await read(`/workers/scripts/${encodeURIComponent(worker)}/settings`))?.bindings ?? [];
  const only = (name, type) => {
    const found = bindings.filter(b => b.name === name && b.type === type);
    if (found.length > 1) fail("CYWEB_DEPLOY_BINDING_AMBIGUOUS " + name);
    return found[0] ?? null;
  };
  const text = name => only(name, "plain_text")?.text?.trim() ?? "";
  // Proves the hostname is served by a CY Web build, not some other Worker.
  if (!/^\d+\.\d+\.\d+$/.test(text("IDENTITY_CONSUMER_VERSION")) || !/^\d+\.\d+\.\d+$/.test(text("SOURCE_VERSION")))
    fail("CYWEB_DEPLOY_WORKER_NOT_CYWEB");

  const db = only("DB", "d1");
  if (!uuid.test(db?.id ?? "")) fail("CYWEB_DEPLOY_DB_UNBOUND");
  const database = await read(`/d1/database/${encodeURIComponent(db.id)}`);
  if (database?.uuid !== db.id || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(database?.name ?? "")) fail("CYWEB_DEPLOY_DB_METADATA_MISMATCH");

  const identity = only("IDENTITY", "service");
  if (!workerName.test(identity?.service ?? "") || identity.service === worker) fail("CYWEB_DEPLOY_IDENTITY_UNBOUND");
  const seed = identitySeedFor(identity.service);
  const application = text("IDENTITY_APPLICATION_ID"), workspace = text("IDENTITY_WORKSPACE_ID");
  if (!applicationId.test(application) || !workspaceId.test(workspace)) fail("CYWEB_DEPLOY_IDENTITY_SCOPE_INVALID");

  const values = {
    CF_WORKER_NAME: worker, CF_D1_DATABASE_ID: db.id, CF_D1_DATABASE_NAME: database.name,
    CF_IDENTITY_SERVICE: seed, CYID_LOOKUP_SERVICE: seed,
    CF_IDENTITY_APPLICATION_ID: application, CF_IDENTITY_WORKSPACE_ID: workspace,
  };
  const hrFiles = only("HR_FILES", "r2_bucket")?.bucket_name;
  if (hrFiles !== undefined) values.CF_HR_FILES_R2_BUCKET = bucket.test(hrFiles) ? hrFiles : fail("CYWEB_DEPLOY_BINDING_INVALID HR_FILES");
  const recovery = only("CYINVOICE_RECOVERY", "service")?.service;
  if (recovery !== undefined) values.CF_CYINVOICE_RECOVERY_SERVICE = workerName.test(recovery) ? recovery : fail("CYWEB_DEPLOY_BINDING_INVALID CYINVOICE_RECOVERY");
  if (backupEnabled === "true") {
    // Turning backup on keeps its switch in GitHub; the bucket targets come from the live Worker.
    const r2 = only("BACKUP_R2", "r2_bucket")?.bucket_name ?? "", gcs = text("GCS_BUCKET");
    if (!bucket.test(r2) || !bucket.test(gcs)) fail("CYWEB_DEPLOY_BACKUP_TARGET_UNBOUND");
    Object.assign(values, { CF_BACKUP_R2_BUCKET: r2, GCS_BUCKET: gcs });
  }

  // wrangler prints the workers.dev URL, which carries the account subdomain.
  const subdomain = (await read("/workers/subdomain"))?.subdomain ?? "";
  if (!/^[a-z0-9-]{1,63}$/i.test(subdomain)) fail("CYWEB_DEPLOY_SUBDOMAIN_UNAVAILABLE");
  return { values, masks: [...new Set([...Object.values(values), identity.service, subdomain])] };
}

async function cli() {
  try {
    if (!process.env.GITHUB_ENV) fail("CYWEB_DEPLOY_RUNNER_REQUIRED");
    const { values, masks } = await resolveDeployRuntime({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN, publicHostname: process.env.CF_PUBLIC_HOSTNAME,
      backupEnabled: process.env.CF_BACKUP_ENABLED });
    for (const value of masks) console.log("::add-mask::" + value);
    fs.appendFileSync(process.env.GITHUB_ENV, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(""), "utf8");
    console.log(`CYWEB_DEPLOY_RUNTIME_RESOLVED: ${Object.keys(values).join(", ")}`);
  } catch (error) {
    const message = error?.message ?? "";
    console.error(/^CYWEB_DEPLOY_[A-Z_]+( [^\r\n]{1,200})?$/.test(message) ? message : "CYWEB_DEPLOY_RUNTIME_UNAVAILABLE");
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await cli();

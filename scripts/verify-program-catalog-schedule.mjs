import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROGRAM_CATALOG_CRON } from "../shared/program-catalog.ts";

/** Protected-runner GET only. Never expose resource identifiers, credentials or provider bodies. */
export async function verifyProgramCatalogSchedule({ env = process.env, fetcher = fetch } = {}) {
  if (!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID ?? "")
    || !/^[a-z0-9][a-z0-9._-]{1,62}$/i.test(env.CF_WORKER_NAME ?? "") || !env.CLOUDFLARE_API_TOKEN
    || ![undefined, "", "false", "true"].includes(env.CF_BACKUP_SCHEDULE_ENABLED)) throw new Error("PROGRAM_SCHEDULE_INPUT_INVALID");
  const expected = [PROGRAM_CATALOG_CRON, ...(env.CF_BACKUP_SCHEDULE_ENABLED === "true" ? ["30 19 * * *"] : [])].sort();
  let payload;
  try {
    const response = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${encodeURIComponent(env.CF_WORKER_NAME)}/schedules`, {
      method: "GET", redirect: "manual", signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, Accept: "application/json" },
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error(); }
    payload = await response.json();
  } catch { throw new Error("PROGRAM_SCHEDULE_READ_FAILED"); }
  const schedules = payload?.result?.schedules;
  if (payload?.success !== true || !Array.isArray(schedules) || schedules.some(row => typeof row?.cron !== "string")
    || JSON.stringify(schedules.map(row => row.cron).sort()) !== JSON.stringify(expected)) throw new Error("PROGRAM_SCHEDULE_MISMATCH");
  return { dailyCatalogSchedule: true, backupSchedule: env.CF_BACKUP_SCHEDULE_ENABLED === "true" };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await verifyProgramCatalogSchedule())); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

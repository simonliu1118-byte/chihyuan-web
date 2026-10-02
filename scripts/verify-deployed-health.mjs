import fs from "node:fs";
import { pathToFileURL } from "node:url";

const versionValue = value => typeof value === "string" && /^\d+\.\d+\.\d+$/.test(value) ? value : null;
const commitValue = value => typeof value === "string" && /^[0-9a-f]{40}$/.test(value) ? value : null;

export async function observeHealth({ targets, expected, fetchImpl = fetch,
  now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  timeoutMs = 90000, intervalMs = 1000, log = console.log }) {
  const start = now(), observations = [];
  async function probe(target) {
    const sample = { target: target.label, elapsedMs: now() - start };
    try {
      const response = await fetchImpl(target.url + "/api/health", { signal: AbortSignal.timeout(10000) });
      sample.httpStatus = response.status;
      const age = response.headers.get("age");
      sample.ageSeconds = age && /^\d{1,10}$/.test(age) ? Number(age) : null;
      const cache = response.headers.get("cf-cache-status");
      sample.cacheStatus = ["HIT", "MISS", "DYNAMIC", "BYPASS", "EXPIRED", "STALE", "REVALIDATED", "UPDATING"].includes(cache) ? cache : null;
      let body;
      try { body = await response.json(); } catch { sample.result = "invalid_json"; return sample; }
      sample.version = versionValue(body?.data?.version);
      sample.consumer = versionValue(body?.data?.identityConsumerVersion);
      sample.sourceCommit = commitValue(body?.data?.sourceCommit);
      sample.database = body?.data?.database === "ok" ? "ok" : "unavailable";
      if (!response.ok) sample.result = "http_failure";
      else if (body?.ok !== true || body?.data?.service !== "cyweb") sample.result = "invalid_health_envelope";
      else if (sample.database !== "ok") sample.result = "d1_unavailable";
      else if (sample.consumer !== expected.consumer) sample.result = "consumer_mismatch";
      else if (sample.version !== expected.version) sample.result = "source_version_mismatch";
      else if (sample.sourceCommit !== expected.sourceCommit) sample.result = "source_commit_mismatch";
      else sample.result = "ready";
    } catch { sample.result = "network_failure"; }
    return sample;
  }
  do {
    const samples = await Promise.all(targets.map(probe));
    for (const sample of samples) { observations.push(sample); log(JSON.stringify(sample)); }
    if (samples.every(sample => sample.result === "ready")) {
      const elapsedMs = now() - start;
      log(JSON.stringify({ result: "both_targets_ready", elapsedMs, exceededFormerWindow: elapsedMs > 10000 }));
      return { elapsedMs, observations };
    }
    if (now() - start >= timeoutMs) break;
    await sleep(Math.min(intervalMs, timeoutMs - (now() - start)));
  } while (now() - start <= timeoutMs);
  throw new Error("DEPLOYED_SOURCE_CONSUMER_OR_D1_HEALTH_MISMATCH: bounded observations above; no redeployment performed");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await observeHealth({
    targets: [
      { label: "canonical", url: "https://" + process.env.CF_PUBLIC_HOSTNAME },
      { label: "workers_dev", url: process.env.CYWEB_WORKER_URL },
    ],
    expected: { version: fs.readFileSync("VERSION", "utf8").trim(),
      consumer: fs.readFileSync("CYID_CONSUMER_VERSION", "utf8").trim(), sourceCommit: process.env.CF_SOURCE_COMMIT },
  });
}

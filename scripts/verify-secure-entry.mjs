import { pathToFileURL } from "node:url";

async function smallHtml(response) {
  if (!response.body) throw Error();
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) throw Error();
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

const hasHsts = response => {
  const match = /(?:^|;)\s*max-age=(\d+)\s*(?:;|$)/i.exec(response.headers.get("strict-transport-security") ?? "");
  return match && Number(match[1]) >= 31536000;
};

export async function verifySecureEntry({ targets, fetchImpl = fetch, timeoutMs = 60000,
  intervalMs = 5000, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const origins = targets.map(target => {
    const url = new URL(target.url);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash)
      throw Error("SECURE_ENTRY_TARGET_INVALID");
    return url.origin;
  });
  if (origins.length !== 2 || new Set(origins).size !== 2) throw Error("SECURE_ENTRY_TARGET_INVALID");
  const deadline = now() + timeoutMs;
  async function get(url) {
    if (now() >= deadline) throw Error();
    return fetchImpl(url, { method: "GET", redirect: "manual", cache: "no-store",
      signal: AbortSignal.timeout(Math.max(1, Math.min(8000, deadline - now()))) });
  }
  async function redirectToHttps(url) {
    const insecure = new URL(url); insecure.protocol = "http:";
    const response = await get(insecure.href);
    await response.body?.cancel();
    if (![301, 302, 307, 308].includes(response.status)
      || new URL(response.headers.get("location") ?? "", insecure).href !== url) throw Error();
  }
  async function probe(origin) {
    const entry = origin + "/?secure-entry-check=1";
    await redirectToHttps(entry);
    const response = await get(entry);
    if (response.status !== 200 || !hasHsts(response)) { await response.body?.cancel(); throw Error(); }
    const html = await smallHtml(response);
    const script = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(html)?.[1];
    if (!script) throw Error();
    const asset = new URL(script, entry);
    if (asset.origin !== origin || !asset.pathname.startsWith("/assets/") || asset.username || asset.password || asset.hash) throw Error();
    await redirectToHttps(asset.href);
    const builtAsset = await get(asset.href);
    await builtAsset.body?.cancel();
    if (builtAsset.status !== 200 || !hasHsts(builtAsset)) throw Error();
  }
  do {
    const checks = await Promise.allSettled(origins.map(probe));
    if (checks.every(check => check.status === "fulfilled")) return;
    if (now() >= deadline) break;
    await sleep(Math.min(intervalMs, deadline - now()));
  } while (now() < deadline);
  throw Error("DEPLOYED_HTTPS_ENTRY_NOT_READY");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const hostname = process.env.CF_PUBLIC_HOSTNAME;
    if (!hostname || new URL("https://" + hostname).hostname !== hostname) throw Error("SECURE_ENTRY_TARGET_INVALID");
    const fallback = new URL(process.env.CYWEB_WORKER_URL);
    if (!fallback.hostname.endsWith(".workers.dev")) throw Error("SECURE_ENTRY_TARGET_INVALID");
    await verifySecureEntry({ targets: [{ url: "https://" + hostname }, { url: fallback.href }] });
    console.log("Canonical and workers.dev HTTPS entry, HSTS and static assets verified.");
  } catch {
    console.error("DEPLOYED_HTTPS_ENTRY_NOT_READY");
    process.exitCode = 1;
  }
}

import { verifiedProgramCatalog, type ProgramCatalog, type ProgramEntry, type ProgramId } from "../../shared/program-catalog";

const repository = "https://github.com/simonliu1118-byte/CYapps";
const prefixes: Partial<Record<ProgramId, string>> = {
  "accounting-web": "cyaccountingweb", accounting: "cyaccounting", invoice: "cyinvoice", "tri-invoice-calc": "TriINVCalc",
};
const files: Partial<Record<ProgramId, (version: string) => string>> = {
  accounting: version => `CYAccounting_V${version}_Windows_x64.zip`,
  invoice: version => `CYInvoice_V${version}.zip`,
  "tri-invoice-calc": version => `TriINVCalc_V${version}.zip`,
};
interface Release {
  draft?: unknown; prerelease?: unknown; tag_name?: unknown; published_at?: unknown;
  assets?: { name?: unknown; browser_download_url?: unknown; state?: unknown; size?: unknown }[];
}

class CatalogFailure extends Error {
  constructor(readonly detail: NonNullable<ProgramCatalog["refreshFailure"]>, readonly retryAt?: number) { super(detail.code); }
}

function rateLimitDeadline(response: Response, now: number): number {
  const seconds = (value: string | null) => value && /^\d{1,12}$/.test(value) ? Number(value) : 0;
  const retry = seconds(response.headers.get("retry-after"));
  const reset = seconds(response.headers.get("x-ratelimit-reset"));
  // Headers stay inside the reader. Never sleep/retry in the HTTP request.
  return Math.min(now + 86400000, Math.max(now + 60000, now + retry * 1000, reset * 1000 + 1000));
}

/** A release is usable only when its known tag, published date and asset agree. */
export function selectProgramRelease(program: ProgramEntry, values: readonly unknown[]): ProgramEntry | null {
  if (!prefixes[program.id]) return null;
  const candidates: { release: Release; version: string; numbers: number[] }[] = [];
  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const release = value as Release;
    if (release.draft !== false || release.prerelease !== false || typeof release.tag_name !== "string"
      || typeof release.published_at !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(release.published_at)
      || !Number.isFinite(Date.parse(release.published_at))) continue;
    const match = new RegExp("^" + prefixes[program.id] + "-v(\\d+\\.\\d+\\.\\d+)$").exec(release.tag_name);
    if (!match) continue;
    const numbers = match[1].split(".").map(Number);
    if (numbers.some(n => !Number.isSafeInteger(n))) continue;
    candidates.push({ release, version: match[1], numbers });
  }
  candidates.sort((a, b) => b.numbers[0] - a.numbers[0] || b.numbers[1] - a.numbers[1] || b.numbers[2] - a.numbers[2]
    || Date.parse(b.release.published_at as string) - Date.parse(a.release.published_at as string));
  const latest = candidates[0];
  if (!latest) return null;
  const tag = latest.release.tag_name as string;
  const filename = files[program.id]?.(latest.version);
  const expectedUrl = filename ? `${repository}/releases/download/${tag}/${filename}` : null;
  const asset = Array.isArray(latest.release.assets) ? latest.release.assets.find(row => row?.name === filename
    && row.browser_download_url === expectedUrl && row.state === "uploaded" && typeof row.size === "number" && row.size > 0) : undefined;
  return { ...program, version: latest.version, publishedAt: latest.release.published_at as string,
    releaseUrl: `${repository}/releases/tag/${tag}`, downloadUrl: asset ? expectedUrl : null };
}

async function readPage(response: Response, now: number): Promise<unknown[]> {
  if (!response.ok) {
    const rateLimited = response.status === 429 || ((response.status === 403)
      && (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after")));
    await response.body?.cancel().catch(() => undefined);
    throw new CatalogFailure({ code: rateLimited ? "RATE_LIMIT" : "HTTP", httpStatus: response.status },
      rateLimited ? rateLimitDeadline(response, now) : undefined);
  }
  if (!response.body) throw new CatalogFailure({ code: "BODY" });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let length = 0, text = "";
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > 1048576) throw new CatalogFailure({ code: "TOO_LARGE" });
      text += decoder.decode(result.value, { stream: true });
    }
    text += decoder.decode();
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new CatalogFailure({ code: "INVALID" }); }
    if (!Array.isArray(value) || value.length > 100) throw new CatalogFailure({ code: "INVALID" });
    return value;
  } finally { await reader.cancel().catch(() => undefined); }
}

/** Fixed public source; no user URL, credential, request retry or DB mutation. */
export async function readProgramCatalog(fetcher: typeof fetch = fetch, now = new Date().toISOString(),
  onCooldown?: (retryAt: number) => void, clock: () => number = Date.now): Promise<ProgramCatalog> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 8000);
  try {
    const releases: unknown[] = [];
    for (let page = 1; page <= 4; page++) {
      const response = await fetcher(`https://api.github.com/repos/simonliu1118-byte/CYapps/releases?per_page=100&page=${page}`, {
        // Workers reject redirect:"error" at request construction. Manual
        // returns 3xx to readPage, which rejects it without following Location.
        signal: abort.signal, redirect: "manual", headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "CYWeb-ProgramCatalog" },
      });
      const rows = await readPage(response, clock());
      releases.push(...rows);
      if (rows.length < 100) break;
      if (page === 4) throw new CatalogFailure({ code: "PAGE_LIMIT" });
    }
    const programs = verifiedProgramCatalog.programs.map(program =>
      prefixes[program.id] ? selectProgramRelease(program, releases) : program);
    if (programs.some(program => program === null)) throw new CatalogFailure({ code: "MISSING" });
    return { programs: programs as ProgramEntry[], checkedAt: now, current: true };
  } catch (error) {
    if (error instanceof CatalogFailure && error.retryAt !== undefined) onCooldown?.(error.retryAt);
    // Only an allowlisted classification/status crosses the authenticated API.
    // Never return provider bodies, exception text, headers, credentials or IPs.
    return { ...verifiedProgramCatalog, refreshFailure: error instanceof CatalogFailure ? error.detail
      : { code: abort.signal.aborted ? "TIMEOUT" : "NETWORK" } };
  }
  finally { clearTimeout(timer); }
}

export function createProgramCatalogLoader(fetcher: typeof fetch = fetch, clock: () => number = Date.now): () => Promise<ProgramCatalog> {
  let cached: { value: ProgramCatalog; expires: number } | undefined;
  let pending: Promise<ProgramCatalog> | undefined;
  let lastSuccess: ProgramCatalog | undefined;
  return () => {
    if (cached && cached.expires > clock()) return Promise.resolve(cached.value);
    if (pending) return pending;
    let retryAt: number | undefined;
    pending = readProgramCatalog(fetcher, new Date(clock()).toISOString(), until => { retryAt = until; }, clock).then(value => {
      if (value.current) lastSuccess = value;
      else if (lastSuccess) value = { ...lastSuccess, current: false, refreshFailure: value.refreshFailure };
      cached = { value, expires: value.current ? clock() + 300000 : retryAt ?? clock() + 30000 };
      return value;
    }).finally(() => { pending = undefined; });
    return pending;
  };
}
export const loadProgramCatalog = createProgramCatalogLoader();

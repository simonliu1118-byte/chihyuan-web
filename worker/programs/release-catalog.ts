import { verifiedProgramCatalog, programCatalogDay, nextProgramCatalogUpdate, type ProgramCatalog, type ProgramEntry, type ProgramId } from "../../shared/program-catalog";

const repository = "https://github.com/simonliu1118-byte/CYapps";
const prefixes: Partial<Record<ProgramId, string>> = {
  "accounting-web": "cyaccountingweb", accounting: "cyaccounting", invoice: "cyinvoice", "tri-invoice-calc": "TriINVCalc",
  converter: "smartcopiconverter",
  "erp-auto-input": "cyerp-auto-input",
};
const files: Partial<Record<ProgramId, (version: string) => string>> = {
  accounting: version => `CYAccounting_V${version}_Windows_x64.zip`,
  invoice: version => `CYInvoice_V${version}.zip`,
  "tri-invoice-calc": version => `TriINVCalc_V${version}.zip`,
  converter: version => `SMARTCOPIConverter_V${version}_Windows_x64.zip`,
  "erp-auto-input": version => `CYERPAutoInput_V${version}.zip`,
};
interface Release {
  draft?: unknown; prerelease?: unknown; tag_name?: unknown; published_at?: unknown;
  assets?: { name?: unknown; browser_download_url?: unknown; state?: unknown; size?: unknown }[];
}

class CatalogFailure extends Error {
  constructor(readonly detail: NonNullable<ProgramCatalog["refreshFailure"]>) { super(detail.code); }
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

async function readPage(response: Response): Promise<unknown[]> {
  if (!response.ok) {
    const rateLimited = response.status === 429 || ((response.status === 403)
      && (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after")));
    await response.body?.cancel().catch(() => undefined);
    throw new CatalogFailure({ code: rateLimited ? "RATE_LIMIT" : "HTTP", httpStatus: response.status });
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
export async function readProgramCatalog(fetcher: typeof fetch = fetch, now = new Date().toISOString()): Promise<ProgramCatalog> {
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
      const rows = await readPage(response);
      releases.push(...rows);
      if (rows.length < 100) break;
      if (page === 4) throw new CatalogFailure({ code: "PAGE_LIMIT" });
    }
    const programs = verifiedProgramCatalog.programs.map(program =>
      prefixes[program.id] ? selectProgramRelease(program, releases) : program);
    if (programs.some(program => program === null)) throw new CatalogFailure({ code: "MISSING" });
    return { programs: programs as ProgramEntry[], checkedAt: now, current: true };
  } catch (error) {
    // Only an allowlisted classification/status crosses the authenticated API.
    // Never return provider bodies, exception text, headers, credentials or IPs.
    return { ...verifiedProgramCatalog, refreshFailure: error instanceof CatalogFailure ? error.detail
      : { code: abort.signal.aborted ? "TIMEOUT" : "NETWORK" } };
  }
  finally { clearTimeout(timer); }
}

interface CatalogState {
  attempted_day: string;
  attempted_at: string;
  completed_at: string | null;
  catalog_json: string | null;
  failure_json: string | null;
}

/** One durable daily claim across Worker instances; no browser or retry producer. */
export async function updateProgramCatalog(db: D1Database, now = new Date().toISOString(), fetcher: typeof fetch = fetch): Promise<boolean> {
  const token = crypto.randomUUID();
  const claimed = await db.prepare(`INSERT INTO program_catalog_state (id, attempted_day, attempted_at, attempt_token)
    VALUES (1, ?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET attempted_day=excluded.attempted_day,
      attempted_at=excluded.attempted_at, attempt_token=excluded.attempt_token, completed_at=NULL, failure_json=NULL
    WHERE program_catalog_state.attempted_day < excluded.attempted_day RETURNING id`)
    .bind(programCatalogDay(Date.parse(now)), now, token).first<{ id: number }>();
  if (!claimed) return false;
  const value = await readProgramCatalog(fetcher, now);
  await db.prepare(`UPDATE program_catalog_state SET completed_at=?1,
    catalog_json=COALESCE(?2, catalog_json), failure_json=?3 WHERE id=1 AND attempt_token=?4`)
    .bind(now, value.current ? JSON.stringify(value) : null, value.refreshFailure ? JSON.stringify(value.refreshFailure) : null, token).run();
  return true;
}

/** Reads public metadata only; permissions remain in the authenticated route. */
export async function loadProgramCatalog(db: D1Database, now = Date.now()): Promise<ProgramCatalog> {
  const row = await db.prepare("SELECT attempted_day, attempted_at, completed_at, catalog_json, failure_json FROM program_catalog_state WHERE id=1").first<CatalogState>();
  let value = verifiedProgramCatalog;
  let completeSnapshot = true;
  let failure: ProgramCatalog["refreshFailure"];
  try {
    if (row?.catalog_json) {
      const stored = JSON.parse(row.catalog_json) as ProgramCatalog;
      if (!Array.isArray(stored.programs) || !Number.isFinite(Date.parse(stored.checkedAt))) throw new Error("INVALID");
      const programs = verifiedProgramCatalog.programs.map(base => {
        if (!prefixes[base.id]) return base;
        const release = stored.programs.find(item => item.id === base.id);
        // A newly listed program can use its verified source snapshot until the next daily run.
        if (!release) { completeSnapshot = false; return base; }
        if (!/^\d+\.\d+\.\d+$/.test(release.version ?? "") || !Number.isFinite(Date.parse(release.publishedAt ?? ""))) throw new Error("INVALID");
        const tag = `${prefixes[base.id]}-v${release.version}`;
        const filename = files[base.id]?.(release.version!);
        const download = filename ? `${repository}/releases/download/${tag}/${filename}` : null;
        if (release.releaseUrl !== `${repository}/releases/tag/${tag}` || (release.downloadUrl !== null && release.downloadUrl !== download)) throw new Error("INVALID");
        return { ...base, version: release.version, publishedAt: release.publishedAt, releaseUrl: release.releaseUrl, downloadUrl: release.downloadUrl };
      });
      value = { programs, checkedAt: stored.checkedAt, current: true };
    }
    if (row?.failure_json) {
      const detail = JSON.parse(row.failure_json) as NonNullable<ProgramCatalog["refreshFailure"]>;
      if (!["HTTP", "RATE_LIMIT", "TIMEOUT", "NETWORK", "BODY", "TOO_LARGE", "INVALID", "PAGE_LIMIT", "MISSING"].includes(detail.code)) throw new Error("INVALID");
      failure = { code: detail.code, ...(Number.isInteger(detail.httpStatus) && detail.httpStatus! >= 100 && detail.httpStatus! <= 599 ? { httpStatus: detail.httpStatus } : {}) };
    }
  } catch { value = verifiedProgramCatalog; failure = { code: "INVALID" }; }
  const current = Boolean(value.current && completeSnapshot && row?.completed_at && !failure && row.attempted_day === programCatalogDay(now));
  const status = failure ? "failed" : !row?.completed_at || !completeSnapshot ? "pending" : current ? "ready" : "overdue";
  return { ...value, current, ...(failure ? { refreshFailure: failure } : {}), automaticUpdate: {
    status, lastAttemptAt: row?.attempted_at ?? null, nextUpdateAt: nextProgramCatalogUpdate(now),
  } };
}

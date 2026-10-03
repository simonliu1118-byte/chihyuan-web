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
  if (!response.ok || !response.body) throw new Error("RELEASE_UNAVAILABLE");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let length = 0, text = "";
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > 1048576) throw new Error("RELEASE_TOO_LARGE");
      text += decoder.decode(result.value, { stream: true });
    }
    text += decoder.decode();
    const value: unknown = JSON.parse(text);
    if (!Array.isArray(value) || value.length > 100) throw new Error("RELEASE_INVALID");
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
        signal: abort.signal, redirect: "error", headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "CYWeb-ProgramCatalog" },
      });
      const rows = await readPage(response);
      releases.push(...rows);
      if (rows.length < 100) break;
      if (page === 4) throw new Error("RELEASE_PAGE_LIMIT");
    }
    const programs = verifiedProgramCatalog.programs.map(program =>
      prefixes[program.id] ? selectProgramRelease(program, releases) : program);
    if (programs.some(program => program === null)) throw new Error("RELEASE_MISSING");
    return { programs: programs as ProgramEntry[], checkedAt: now, current: true };
  } catch { return verifiedProgramCatalog; }
  finally { clearTimeout(timer); }
}

let cached: { value: ProgramCatalog; expires: number } | undefined;
let pending: Promise<ProgramCatalog> | undefined;
export function loadProgramCatalog(): Promise<ProgramCatalog> {
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.value);
  if (pending) return pending;
  pending = readProgramCatalog().then(value => {
    cached = { value, expires: Date.now() + (value.current ? 300000 : 30000) };
    return value;
  }).finally(() => { pending = undefined; });
  return pending;
}

import { verifiedProgramCatalog } from "../../shared/program-catalog";
import { handleProgramCatalogRoute } from "../http/program-catalog-routes";
import type { IdentityRuntimeEnv } from "../http/auth-routes";
import { readProgramCatalog, selectProgramRelease } from "../programs/release-catalog";

export async function acceptProgramCatalog(): Promise<void> {
  function check(condition: unknown, code: string): asserts condition {
    if (!condition) throw new Error("ACCEPT_PROGRAMS_" + code);
  }
  const releases = verifiedProgramCatalog.programs.filter(program => program.releaseUrl).map(program => ({
    tag_name: program.releaseUrl!.split("/").at(-1), draft: false, prerelease: false, published_at: program.publishedAt,
    assets: program.downloadUrl ? [{ name: program.downloadUrl.split("/").at(-1), browser_download_url: program.downloadUrl, state: "uploaded", size: 100 }] : [],
  }));
  const invoice = verifiedProgramCatalog.programs.find(program => program.id === "invoice")!;
  const base = releases[2];
  const newest = { ...base, tag_name: "cyinvoice-v2.10.0", published_at: "2026-10-03T00:00:00Z", assets: [{
    name: "CYInvoice_V2.10.0.zip", state: "uploaded", size: 100,
    browser_download_url: "https://github.com/simonliu1118-byte/CYapps/releases/download/cyinvoice-v2.10.0/CYInvoice_V2.10.0.zip",
  }] };
  const selected = selectProgramRelease(invoice, [
    { ...newest, tag_name: "cyinvoice-v9.0.0", prerelease: true },
    { ...newest, tag_name: "cyinvoice-v8.0.0", draft: true },
    { ...newest, tag_name: "cyinvoice-v7.0.0", published_at: null },
    { ...newest, tag_name: "other-v6.0.0" }, base, newest,
  ]);
  check(selected?.version === "2.10.0" && selected.downloadUrl === newest.assets[0].browser_download_url, "FORMAL_SEMVER_AND_ASSET");
  const badAsset = selectProgramRelease(invoice, [{ ...newest, assets: [{ ...newest.assets[0], browser_download_url: "https://untrusted.test/download.zip" }] }]);
  check(badAsset?.version === "2.10.0" && badAsset.downloadUrl === null, "UNTRUSTED_DOWNLOAD_REJECTED");
  const noAsset = selectProgramRelease(invoice, [{ ...newest, assets: [] }, base]);
  check(noAsset?.version === "2.10.0" && noAsset.downloadUrl === null, "NO_OLDER_DOWNLOAD_UNDER_NEW_VERSION");
  let calls = 0;
  const result = await readProgramCatalog((async (input, init) => {
    calls++;
    check(String(input) === "https://api.github.com/repos/simonliu1118-byte/CYapps/releases?per_page=100&page=1"
      && init?.redirect === "error" && init.signal instanceof AbortSignal, "FIXED_SOURCE_AND_BOUND");
    return Response.json([...releases, newest]);
  }) as typeof fetch, "2026-10-03T01:00:00Z");
  check(result.current && calls === 1 && result.programs.length === 7 && result.programs[2]?.version === "2.10.0", "LIVE_CATALOG");
  const pending = result.programs.filter(program => !program.version);
  check(pending.length === 3 && pending.every(program => program.publishedAt === null && program.releaseUrl === null
    && program.downloadUrl === null && program.websiteUrl === null), "UNRELEASED_NO_FABRICATED_LINKS");
  check(selectProgramRelease(pending[0], [newest]) === null, "PENDING_RELEASE_NOT_GUESSED");
  let pages = 0;
  const paginated = await readProgramCatalog((async () => {
    pages++;
    return Response.json(pages === 1 ? Array(100).fill({}) : releases);
  }) as typeof fetch);
  check(paginated.current && pages === 2, "PAGINATION");
  for (const [response, code, status] of [
    [new Response("private provider body", { status: 403 }), "HTTP", 403],
    [new Response("private provider body", { status: 403, headers: { "x-ratelimit-remaining": "0" } }), "RATE_LIMIT", 403],
    [new Response("private provider body", { status: 429 }), "RATE_LIMIT", 429],
    [Response.json({}), "INVALID", undefined], [Response.json([]), "MISSING", undefined],
    [new Response("x".repeat(1048577)), "TOO_LARGE", undefined], [new Response("invalid JSON"), "INVALID", undefined],
  ] as const) {
    const fallback = await readProgramCatalog((async () => response) as typeof fetch);
    check(!fallback.current && fallback.checkedAt === verifiedProgramCatalog.checkedAt
      && JSON.stringify(fallback.programs) === JSON.stringify(verifiedProgramCatalog.programs), "LABELLED_VERIFIED_FALLBACK");
    check(fallback.refreshFailure?.code === code && fallback.refreshFailure.httpStatus === status
      && !JSON.stringify(fallback).includes("private provider body"), "SAFE_FAILURE_CLASSIFICATION");
  }
  const network = await readProgramCatalog((async () => { throw new Error("private network details"); }) as typeof fetch);
  check(network.refreshFailure?.code === "NETWORK" && !JSON.stringify(network).includes("private network details"), "NO_EXCEPTION_LEAK");
  let limitedCalls = 0;
  const limited = await readProgramCatalog((async () => { limitedCalls++; return Response.json(Array(100).fill({})); }) as typeof fetch);
  check(!limited.current && limitedCalls === 4 && limited.refreshFailure?.code === "PAGE_LIMIT", "PAGE_LIMIT");

  let role = "USER", provider = "ready", reads = 0;
  const env = { DB: { prepare() { throw new Error("PROGRAMS_MUST_NOT_REQUIRE_D1_ACCESS"); } },
    IDENTITY_APPLICATION_ID: "APP_TEST", IDENTITY_WORKSPACE_ID: "workspace-test",
    IDENTITY: { async fetch() {
      if (provider === "invalid") return Response.json({ error: { code: "SESSION_INVALID" } }, { status: 401 });
      if (provider === "unavailable") return new Response("unavailable", { status: 503 });
      return Response.json({ principal: { workspaceId: "workspace-test", employeeId: "program-acceptance", employeeNo: "0097",
        displayName: "Program Acceptance", workspaceRole: role, isIdentityAdmin: false, emailVerified: true,
        isWorkspaceSuperAdmin: role === "SUPER_ADMIN", credentialVersion: 1, employeeRevision: 1 },
      session: { expiresAt: "2999-01-01T00:00:00Z" } });
    } },
  } as unknown as IdentityRuntimeEnv;
  async function route(method = "GET", cookie = true) {
    return handleProgramCatalogRoute(new Request("https://acceptance.test/api/programs", { method,
      headers: cookie ? { cookie: "cyweb_identity_session=cyid_" + "a".repeat(64) } : {} }), env, "program-acceptance",
    async () => { reads++; return result; });
  }
  check((await route("GET", false))?.status === 401 && reads === 0, "AUTH_BEFORE_RELEASE_LOOKUP");
  for (role of ["USER", "ADMIN", "SUPER_ADMIN"]) check((await route())?.status === 200, "EVERY_ROLE_NO_MODULE_ACCESS");
  check((await route("POST"))?.status === 405 && Number(reads) === 3, "READ_ONLY");
  provider = "invalid";
  check((await route())?.status === 401 && Number(reads) === 3, "INVALID_SESSION");
  provider = "unavailable";
  check((await route())?.status === 503 && Number(reads) === 3, "PROVIDER_FAILURE");
}

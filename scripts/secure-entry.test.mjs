import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from "miniflare";

const directory = mkdtempSync(join(tmpdir(), "cyweb-secure-entry-"));
const scriptPath = join(directory, "worker.mjs");
await build({ entryPoints: [new URL("../worker/index.ts", import.meta.url).pathname], outfile: scriptPath,
  bundle: true, platform: "neutral", format: "esm", logLevel: "silent" });
const worker = (await import(pathToFileURL(scriptPath))).default;
after(() => rmSync(directory, { recursive: true, force: true }));

test("public HTTP redirects before assets, credentials, Identity or D1 are accessed", async () => {
  const env = new Proxy({}, { get() { throw Error("HTTP must not access a binding"); } });
  for (const pathname of ["/", "/login?next=%2Forders", "/assets/app.js", "/api/auth/login"]) {
    for (const method of ["GET", "HEAD", "POST"]) {
      const request = new Request("http://portal.example.test" + pathname, { method,
        ...(method === "POST" ? { body: "synthetic-credential-body" } : {}) });
      const response = await worker.fetch(request, env);
      assert.equal(response.status, 308);
      assert.equal(response.headers.get("location"), "https://portal.example.test" + pathname);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(request.bodyUsed, false);
      assert.equal(await response.text(), "");
    }
  }
});

test("HTTPS preserves asset responses and multiple cookies, with host-only HSTS", async () => {
  const headers = new Headers({ "content-type": "text/javascript", etag: '"fixture"' });
  headers.append("set-cookie", "first=a; Secure; HttpOnly");
  headers.append("set-cookie", "second=b; Secure; HttpOnly");
  const response = await worker.fetch(new Request("https://portal.example.test/assets/app.js", {
    headers: { "x-forwarded-proto": "http", "x-forwarded-host": "untrusted.example" },
  }), { ASSETS: { fetch: async () => new Response("asset", { headers }) } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("etag"), '"fixture"');
  assert.deepEqual(response.headers.getSetCookie(), headers.getSetCookie());
  assert.equal(await response.text(), "asset");
});

test("HTTPS API failures keep JSON and never fall through to SPA assets", async () => {
  const response = await worker.fetch(new Request("https://portal.example.test/api/missing"), {
    ASSETS: { fetch() { throw Error("API must not use SPA fallback"); } },
  });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");
  assert.equal((await response.json()).error.code, "NOT_FOUND");
});

test("local loopback development stays on HTTP without persistent HSTS", async () => {
  for (const host of ["localhost:5173", "127.0.0.1:5173", "[::1]:5173"]) {
    for (const scheme of ["http", "https"]) {
      const response = await worker.fetch(new Request(`${scheme}://${host}/`), {
        ASSETS: { fetch: async () => new Response("local shell") },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("strict-transport-security"), null);
    }
  }
  const response = await worker.fetch(new Request("http://localhost.untrusted.example/"), {});
  assert.equal(response.status, 308);
});

test("real asset router cannot bypass HTTPS for HTML, SPA navigation or JS", async () => {
  const assetsDirectory = join(directory, "public");
  mkdirSync(join(assetsDirectory, "assets"), { recursive: true });
  writeFileSync(join(assetsDirectory, "index.html"), '<!doctype html><script type="module" src="/assets/app.js"></script>');
  writeFileSync(join(assetsDirectory, "assets/app.js"), 'console.log("synthetic app");');
  for (const filename of ["wrangler.jsonc", "wrangler.deploy.template.jsonc"]) {
    const config = JSON.parse(readFileSync(new URL("../" + filename, import.meta.url), "utf8"));
    const mf = new Miniflare(convertV4MiniflareOptions({ log: new Log(LogLevel.ERROR), workers: [{ name: "secure-entry", modules: true, scriptPath, modulesRoot: directory, compatibilityDate: config.compatibility_date,
      assets: { directory: assetsDirectory, binding: config.assets.binding,
        run_worker_first: config.assets.run_worker_first,
        routerConfig: { has_user_worker: true },
        assetConfig: { not_found_handling: config.assets.not_found_handling } },
    }] }));
    try {
      for (const pathname of ["/", "/settings/account", "/assets/app.js"]) {
        const insecure = await mf.dispatchFetch("http://portal.example.test" + pathname, { redirect: "manual" });
        assert.equal(insecure.status, 308, `${filename}: ${pathname}: ${await insecure.text()}`);
        assert.equal(insecure.headers.get("location"), "https://portal.example.test" + pathname);
        const secure = await mf.dispatchFetch("https://portal.example.test" + pathname, { redirect: "manual" });
        assert.equal(secure.status, 200, `${filename}: ${pathname}`);
        assert.equal(secure.headers.get("strict-transport-security"), "max-age=31536000");
        assert.ok((await secure.text()).includes(pathname.endsWith(".js") ? "synthetic app" : "doctype html"));
      }
      const local = await mf.dispatchFetch("http://localhost/");
      assert.equal(local.status, 200);
    } finally { await mf.dispose(); }
  }
});

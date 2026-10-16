import test from "node:test";
import assert from "node:assert/strict";
import { verifySecureEntry } from "./verify-secure-entry.mjs";

const targets = [{ url: "https://portal.example.test" }, { url: "https://worker.example.workers.dev" }];
function fixture({ redirectHost, hsts = true, assetHsts = true, rootType = "text/html; charset=utf-8",
  assetType = "text/javascript; charset=utf-8", script = "/assets/app.js", oldUntil = 0, fail } = {}) {
  let clock = 0;
  const calls = [];
  return { calls, run: () => verifySecureEntry({ targets, timeoutMs: 2000, intervalMs: 1000,
    now: () => clock, sleep: async ms => { clock += ms; }, fetchImpl: async (value, init) => {
      assert.equal(init.method, "GET"); assert.equal(init.redirect, "manual");
      assert.equal(init.headers, undefined, "public checks must not forward credentials");
      const url = new URL(value); calls.push(new URL(url));
      if (fail) throw Error("sensitive provider error");
      if (url.protocol === "http:") {
        if (clock < oldUntil) return new Response("old entry", { status: 200 });
        url.protocol = "https:";
        if (redirectHost) url.hostname = redirectHost;
        return new Response(null, { status: 308, headers: { location: url.href } });
      }
      if (url.pathname.startsWith("/assets/")) return new Response("fixture JS", {
        headers: { "content-type": assetType, ...(assetHsts ? { "strict-transport-security": "max-age=31536000" } : {}) } });
      return new Response(`<script type="module" src="${script}"></script>`, {
        headers: { "content-type": rootType, ...(hsts ? { "strict-transport-security": "max-age=31536000" } : {}) } });
    } }) };
}

test("deployed smoke verifies both origins, including static assets", async () => {
  const f = fixture(); await f.run();
  assert.equal(f.calls.length, 8);
  assert.equal(new Set(f.calls.map(url => url.host)).size, 2);
});

test("propagation can settle within the existing run without redeployment", async () => {
  const f = fixture({ oldUntil: 1000 }); await f.run();
  assert.ok(f.calls.length > 8);
});

test("wrong redirects, missing HSTS and external asset targets fail closed", async () => {
  for (const options of [{ redirectHost: "untrusted.example" }, { hsts: false }, { assetHsts: false },
    { script: "https://untrusted.example/assets/app.js" }, { script: "/api/auth/me" }]) {
    const f = fixture(options);
    await assert.rejects(f.run(), { message: "DEPLOYED_HTTPS_ENTRY_NOT_READY" });
    assert.ok(f.calls.every(url => targets.some(target => new URL(target.url).host === url.host)));
  }
});

test("network failures expose only stable codes and invalid target URLs never fetch", async () => {
  await assert.rejects(fixture({ fail: true }).run(), { message: "DEPLOYED_HTTPS_ENTRY_NOT_READY" });
  for (const url of ["http://portal.example.test", "https://user:credential@portal.example.test", "https://portal.example.test/api"]) {
    await assert.rejects(verifySecureEntry({ targets: [{ url }, targets[1]], fetchImpl: () => { throw Error("must not fetch"); } }), /TARGET_INVALID/);
  }
});

test("SPA HTML returned for a missing JS asset and non-HTML entry both fail", async () => {
  for (const options of [{ assetType: "text/html" }, { rootType: "text/plain" }, { assetType: "" }]) {
    await assert.rejects(fixture(options).run(), { message: "DEPLOYED_HTTPS_ENTRY_NOT_READY" });
  }
  await fixture({ assetType: "Application/JavaScript; charset=UTF-8" }).run();
});

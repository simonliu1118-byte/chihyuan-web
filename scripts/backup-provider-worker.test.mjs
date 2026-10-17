import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { build } from "esbuild";
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from "miniflare";
import { fileURLToPath } from "node:url";

// Node injected-send mocks cannot detect native fetch receiver/redirect failures.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const account = JSON.stringify({ type: "service_account", client_email: "synthetic@test.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
const built = await build({ stdin: { resolveDir: fileURLToPath(new URL("..", import.meta.url)), loader: "ts", contents: `
  import { GCSBackupProvider } from './worker/backup/gcs-provider';
  export default { async fetch(request, env) {
    try {
      const provider = new GCSBackupProvider('synthetic-test-bucket', env.ACCOUNT);
      await provider.verifyAccess();
      const key = 'cyweb/00000000-0000-4000-8000-000000000001/data.json';
      const bytes = new TextEncoder().encode('{"synthetic":true}');
      await provider.putObject(key, bytes);
      const copy = await provider.getObject(key);
      return Response.json({ verified: copy?.length === bytes.length && copy.every((v, i) => v === bytes[i]) });
    } catch (error) { return Response.json({ code: error.message }, { status: 503 }); }
  } };` }, bundle: true, write: false, format: "esm", platform: "browser" });

for (const redirect of [false, true]) test(`native workerd GCS: ${redirect ? "reject OAuth redirect" : "JWT, IAM, immutable upload and exact readback"}`, async () => {
  const calls = []; let stored;
  const mf = new Miniflare(convertV4MiniflareOptions({ log: new Log(LogLevel.ERROR), workers: [{ name: "gcs-provider", modules: true,
    script: built.outputFiles[0].text, compatibilityDate: "2026-09-26", bindings: { ACCOUNT: account },
    outboundService: async request => {
      const url = new URL(request.url); calls.push(url.origin);
      if (url.hostname === "oauth2.googleapis.com") {
        assert.equal(new URLSearchParams(await request.text()).get("assertion").split(".").length, 3);
        return redirect ? new Response(null, { status: 302, headers: { location: "https://untrusted.invalid" } })
          : Response.json({ access_token: "synthetic-token", expires_in: 3600 });
      }
      assert.equal(url.origin, "https://storage.googleapis.com");
      assert.equal(request.headers.get("authorization"), "Bearer synthetic-token");
      if (url.pathname.endsWith("/testPermissions")) return Response.json({ permissions: ["storage.objects.create", "storage.objects.get", "storage.objects.list", "storage.objects.delete"] });
      if (request.method === "POST") {
        assert.equal(url.searchParams.get("ifGenerationMatch"), "0"); stored = new Uint8Array(await request.arrayBuffer()); return Response.json({});
      }
      assert.equal(url.searchParams.get("alt"), "media"); return new Response(stored);
    },
  }] }));
  try {
    const response = await mf.dispatchFetch("https://synthetic.test");
    assert.equal(response.status, redirect ? 503 : 200);
    assert.deepEqual(await response.json(), redirect ? { code: "BACKUP_GCS_AUTH_FAILED" } : { verified: true });
    assert.equal(calls.length, redirect ? 1 : 4);
  } finally { await mf.dispose(); }
});

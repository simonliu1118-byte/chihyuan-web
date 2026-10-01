import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { pathToFileURL } from "node:url";

const directory = mkdtempSync(join(tmpdir(), "cyweb-backup-test-"));
let GCSBackupProvider, R2BackupProvider;
try {
  for (const name of ["storage-guard", "gcs-provider", "r2-provider"]) {
    writeFileSync(join(directory, name + ".mjs"), stripTypeScriptTypes(readFileSync(new URL(`../worker/backup/${name}.ts`, import.meta.url), "utf8"), { mode: "transform" })
      .replace(/from "(\.\.?\/[^"]+)"/g, 'from "$1.mjs"'));
  }
  ({ GCSBackupProvider } = await import(pathToFileURL(join(directory, "gcs-provider.mjs"))));
  ({ R2BackupProvider } = await import(pathToFileURL(join(directory, "r2-provider.mjs"))));
} finally { rmSync(directory, { recursive: true, force: true }); }
const key = "cyweb/00000000-0000-4000-8000-000000000001/data.json";
const bytes = new TextEncoder().encode('{"synthetic":true}');
// Keys exist only in process memory and are never committed or printed.
const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
const account = JSON.stringify({ type: "service_account", client_email: "synthetic@test.iam.gserviceaccount.com",
  private_key: `-----BEGIN PRIVATE KEY-----\n${der.toString("base64")}\n-----END PRIVATE KEY-----`, token_uri: "https://untrusted.invalid/token" });
function gcs(extra, timeout = 1000) {
  let tokenCalls = 0;
  const provider = new GCSBackupProvider("synthetic-test-bucket", account, async (url, init) => {
    assert.equal(init.redirect, "error");
    if (url === "https://oauth2.googleapis.com/token") {
      tokenCalls++;
      const assertion = new URLSearchParams(init.body).get("assertion");
      const [header, payload, signature] = assertion.split(".");
      assert.equal(JSON.parse(Buffer.from(header, "base64url")).alg, "RS256");
      const claims = JSON.parse(Buffer.from(payload, "base64url"));
      assert.equal(claims.aud, url);
      assert.equal(claims.iss, "synthetic@test.iam.gserviceaccount.com");
      assert.equal(claims.scope, "https://www.googleapis.com/auth/devstorage.read_write");
      assert.ok(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", pair.publicKey, Buffer.from(signature, "base64url"), new TextEncoder().encode(header + "." + payload)));
      return Response.json({ access_token: "synthetic-token", expires_in: 3600 });
    }
    assert.equal(new URL(url).origin, "https://storage.googleapis.com");
    assert.equal(init.headers.authorization, "Bearer synthetic-token");
    return extra(new URL(url), init);
  }, timeout);
  return { provider, tokenCalls: () => tokenCalls };
}
test("GCS immutable retry uses exact bytes, fixed JWT endpoint and cached token", async () => {
  let content = null;
  const { provider, tokenCalls } = gcs((url, init) => {
    if (init.method === "POST") {
      assert.equal(url.searchParams.get("ifGenerationMatch"), "0");
      assert.equal(url.searchParams.get("uploadType"), "media");
      assert.equal(url.searchParams.get("name"), key);
      if (content) return new Response("", { status: 412 });
      content = init.body.slice(); return Response.json({});
    }
    assert.equal(url.searchParams.get("alt"), "media");
    return new Response(content);
  });
  await provider.putObject(key, bytes);
  await provider.putObject(key, bytes);
  await assert.rejects(provider.putObject(key, new Uint8Array([1])), /COLLISION/);
  assert.deepEqual(await provider.getObject(key), bytes);
  assert.equal(tokenCalls(), 1);
});
test("GCS paginated list preserves opaque generations and guards deletion", async () => {
  let calls = 0;
  const { provider } = gcs((url, init) => {
    if (init.method === "DELETE") {
      assert.equal(url.searchParams.get("ifGenerationMatch"), "90071992547409930");
      return new Response(null, { status: 412 });
    }
    calls++;
    return Response.json(calls === 1 ? { items: [{ name: key, size: "18", generation: "90071992547409930" }], nextPageToken: "next" } : {});
  });
  const objects = await provider.listObjects("cyweb/");
  assert.equal(calls, 2);
  assert.equal(objects[0].versionToken, "90071992547409930");
  await assert.rejects(provider.deleteObject(key), /VERSION_REQUIRED/);
  await assert.rejects(provider.deleteObject(key, objects[0].versionToken), /VERSION_CHANGED/);
});
test("GCS fails closed on looping pagination, bad scope, missing objects and oversized responses", async () => {
  const looping = gcs(() => Response.json({ nextPageToken: "repeat" })).provider;
  await assert.rejects(looping.listObjects("cyweb/"), /PAGINATION_INVALID/);
  await assert.rejects(looping.getObject("cyacc/secret/data.json"), /KEY_INVALID/);
  assert.equal(await gcs(() => new Response(null, { status: 404 })).provider.getObject(key), null);
  await assert.rejects(gcs(() => new Response(new Uint8Array(5 * 1024 * 1024 + 1))).provider.getObject(key), /REQUEST_FAILED/);
});
test("GCS deadline covers stalled body and errors reveal no credential/provider body", async () => {
  const stalled = gcs(() => new Response(new ReadableStream({ start() {} })), 25).provider;
  await assert.rejects(stalled.getObject(key), /^Error: BACKUP_GCS_REQUEST_FAILED$/);
  const authFailure = new GCSBackupProvider("synthetic-test-bucket", account, async () => new Response("PRIVATE-PROVIDER-DETAIL", { status: 401 }));
  await assert.rejects(authFailure.getObject(key), /^Error: BACKUP_GCS_AUTH_FAILED$/);
});
test("R2 conditional create, byte collision and immutable generation guard", async () => {
  let content = null, deletes = 0;
  const provider = new R2BackupProvider({
    async put(k, b, options) { assert.deepEqual(options.onlyIf, { etagDoesNotMatch: "*" }); if (content) return null; content = b.slice(); return {}; },
    async get() { return content ? { size: content.length, body: new Response(content).body } : null; },
    async head() { return { version: "opaque" }; }, async delete() { deletes++; },
    async list() { return { objects: [{ key, size: bytes.length, version: "opaque" }], truncated: false }; },
  });
  await provider.putObject(key, bytes); await provider.putObject(key, bytes);
  await assert.rejects(provider.putObject(key, new Uint8Array([1])), /COLLISION/);
  await assert.rejects(provider.deleteObject(key, "changed"), /VERSION_CHANGED/);
  assert.equal(deletes, 0);
  await provider.deleteObject(key, "opaque"); assert.equal(deletes, 1);
  assert.equal((await provider.listObjects("cyweb/"))[0].versionToken, "opaque");
});

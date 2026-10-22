import type { BackupStorageProvider } from "./portable-backup";
import { boundedBytes, equalBytes, MAX_OBJECT_BYTES, objectKey, objectPrefix, storageCheck } from "./storage-guard";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://storage.googleapis.com";
const SCOPE = "https://www.googleapis.com/auth/devstorage.read_write";
const encoder = new TextEncoder();
function base64url(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
export class GCSBackupProvider implements BackupStorageProvider {
  private token: { value: string; expires: number } | null = null;
  constructor(private readonly bucket: string, private readonly serviceAccountJson: string,
    // Workers' native fetch requires the global receiver. A stored bare fetch
    // called as this.send() throws before any outbound request in workerd.
    private readonly send: typeof fetch = (input, init) => globalThis.fetch(input, init), private readonly timeoutMs = 10000) {
    storageCheck(/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucket), "BACKUP_GCS_CONFIG_INVALID");
  }
  /** One attempt, bounded headers + body, fixed endpoints and no redirects. */
  private async request(url: string, init: RequestInit, limit = 65536): Promise<{ status: number; bytes: Uint8Array }> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          // workerd accepts manual/follow only. Refuse redirects explicitly so
          // neither JWT assertions nor bearer tokens reach another endpoint.
          const response = await this.send(url, { ...init, redirect: "manual", signal: controller.signal });
          if (response.status >= 300 && response.status < 400) {
            await response.body?.cancel(); throw new Error("BACKUP_GCS_REDIRECT_REJECTED");
          }
          return { status: response.status, bytes: await boundedBytes(response.body, limit) };
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => {
          controller.abort(); reject(new Error("BACKUP_GCS_TIMEOUT"));
        }, this.timeoutMs); }),
      ]);
    } catch { throw new Error("BACKUP_GCS_REQUEST_FAILED"); }
    finally { if (timer !== undefined) clearTimeout(timer); }
  }
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expires > Date.now() + 60000) return this.token.value;
    try {
      const account = JSON.parse(this.serviceAccountJson);
      storageCheck(account.type === "service_account" && typeof account.client_email === "string"
        && /^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(account.client_email)
        && typeof account.private_key === "string", "BACKUP_GCS_CONFIG_INVALID");
      const pem = account.private_key.replace(/\\n/g, "\n");
      storageCheck(pem.startsWith("-----BEGIN PRIVATE KEY-----") && pem.trim().endsWith("-----END PRIVATE KEY-----"), "BACKUP_GCS_CONFIG_INVALID");
      const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")), c => c.charCodeAt(0));
      const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
      const now = Math.floor(Date.now() / 1000);
      const unsigned = base64url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" }))) + "."
        + base64url(encoder.encode(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now - 5, exp: now + 3600 })));
      const assertion = unsigned + "." + base64url(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(unsigned))));
      const response = await this.request(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString() });
      storageCheck(response.status === 200, "BACKUP_GCS_AUTH_FAILED");
      const token = JSON.parse(new TextDecoder().decode(response.bytes));
      storageCheck(typeof token.access_token === "string" && token.access_token.length > 0 && token.access_token.length <= 8192
        && Number.isInteger(token.expires_in) && token.expires_in > 60 && token.expires_in <= 3600, "BACKUP_GCS_AUTH_FAILED");
      this.token = { value: token.access_token, expires: Date.now() + token.expires_in * 1000 };
      return this.token.value;
    } catch { throw new Error("BACKUP_GCS_AUTH_FAILED"); }
  }
  private async api(path: string, init: RequestInit, limit?: number): Promise<{ status: number; bytes: Uint8Array }> {
    const token = await this.accessToken();
    return this.request(API + path, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}` } }, limit);
  }
  private objectPath(key: string): string { objectKey(key); return `/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(key)}`; }
  /** Read-only IAM probe. This does not create, read or delete backup objects. */
  async verifyAccess(): Promise<void> {
    const required = ["storage.objects.create", "storage.objects.get", "storage.objects.list", "storage.objects.delete"];
    const query = new URLSearchParams(required.map(permission => ["permissions", permission]));
    const response = await this.api(`/storage/v1/b/${encodeURIComponent(this.bucket)}/iam/testPermissions?${query}`, { method: "GET" });
    storageCheck(response.status === 200, "BACKUP_GCS_PERMISSION_CHECK_FAILED");
    let body: { permissions?: unknown };
    try { body = JSON.parse(new TextDecoder().decode(response.bytes)); } catch { throw new Error("BACKUP_GCS_PERMISSION_CHECK_FAILED"); }
    const permissions = body?.permissions;
    storageCheck(Array.isArray(permissions) && required.every(permission => permissions.includes(permission)), "BACKUP_GCS_PERMISSIONS_MISSING");
  }
  async putObject(key: string, bytes: Uint8Array): Promise<void> {
    objectKey(key);
    storageCheck(bytes.byteLength <= MAX_OBJECT_BYTES, "BACKUP_STORAGE_CAPACITY_EXCEEDED");
    const query = new URLSearchParams({ uploadType: "media", name: key, ifGenerationMatch: "0" });
    const response = await this.api(`/upload/storage/v1/b/${encodeURIComponent(this.bucket)}/o?${query}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: bytes });
    if (response.status === 412) storageCheck(equalBytes(await this.getObject(key), bytes), "BACKUP_STORAGE_COLLISION");
    else if (response.status < 200 || response.status >= 300) {
      // Persist only a fixed diagnostic vocabulary, never provider messages,
      // URLs, bucket names, account metadata or credential material.
      let reason = "";
      try {
        const payload = JSON.parse(new TextDecoder().decode(response.bytes));
        const reasons = payload?.error?.errors;
        if (Array.isArray(reasons) && reasons.some(error => ["accountDisabled", "billingNotEnabled", "userProjectMissing"].includes(error?.reason))) reason = "BILLING";
      } catch {}
      throw new Error(reason === "BILLING" ? "BACKUP_GCS_UPLOAD_BILLING_REQUIRED" : response.status === 403
        ? "BACKUP_GCS_UPLOAD_DENIED" : response.status === 404 ? "BACKUP_GCS_BUCKET_UNAVAILABLE" : "BACKUP_GCS_UPLOAD_FAILED");
    }
  }
  async getObject(key: string): Promise<Uint8Array | null> {
    const response = await this.api(this.objectPath(key) + "?alt=media", { method: "GET" }, MAX_OBJECT_BYTES);
    if (response.status === 404) return null;
    storageCheck(response.status === 200, "BACKUP_GCS_READ_FAILED");
    return response.bytes;
  }
  async listObjects(prefix: string): Promise<{ key: string; byteSize: number; versionToken: string }[]> {
    objectPrefix(prefix);
    const objects: { key: string; byteSize: number; versionToken: string }[] = [], pages = new Set<string>();
    let pageToken = "";
    do {
      const query = new URLSearchParams({ prefix, maxResults: "100", fields: "items(name,size,generation),nextPageToken" });
      if (pageToken) query.set("pageToken", pageToken);
      const response = await this.api(`/storage/v1/b/${encodeURIComponent(this.bucket)}/o?${query}`, { method: "GET" });
      storageCheck(response.status === 200, "BACKUP_GCS_LIST_FAILED");
      let page: any;
      try { page = JSON.parse(new TextDecoder().decode(response.bytes)); } catch { throw new Error("BACKUP_GCS_LIST_INVALID"); }
      storageCheck(page && typeof page === "object" && (page.items === undefined || Array.isArray(page.items)), "BACKUP_GCS_LIST_INVALID");
      for (const item of page.items ?? []) {
        storageCheck(typeof item.name === "string" && item.name.startsWith(prefix), "BACKUP_GCS_LIST_INVALID");
        objectKey(item.name);
        storageCheck(typeof item.size === "string" && /^\d+$/.test(item.size) && Number.isSafeInteger(Number(item.size))
          && typeof item.generation === "string" && /^\d+$/.test(item.generation), "BACKUP_GCS_LIST_INVALID");
        objects.push({ key: item.name, byteSize: Number(item.size), versionToken: item.generation });
      }
      storageCheck(objects.length <= 2000, "BACKUP_STORAGE_LIST_CAPACITY_EXCEEDED");
      pageToken = page.nextPageToken ?? "";
      storageCheck(typeof pageToken === "string" && pageToken.length <= 8192 && (!pageToken || !pages.has(pageToken)), "BACKUP_STORAGE_PAGINATION_INVALID");
      if (pageToken) pages.add(pageToken);
    } while (pageToken);
    return objects;
  }
  async deleteObject(key: string, versionToken?: string): Promise<void> {
    const path = this.objectPath(key);
    storageCheck(versionToken && /^\d+$/.test(versionToken), "BACKUP_STORAGE_VERSION_REQUIRED");
    const response = await this.api(path + "?" + new URLSearchParams({ ifGenerationMatch: versionToken }), { method: "DELETE" });
    storageCheck(response.status === 204 || response.status === 404, response.status === 412 ? "BACKUP_STORAGE_VERSION_CHANGED" : "BACKUP_GCS_DELETE_FAILED");
  }
}

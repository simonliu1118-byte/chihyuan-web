import type { BackupStorageProvider } from "./portable-backup";
import { boundedBytes, equalBytes, MAX_OBJECT_BYTES, objectKey, objectPrefix, storageCheck } from "./storage-guard";

/** This binding must have an application-owned bucket with no external overwrite writer. */
export class R2BackupProvider implements BackupStorageProvider {
  constructor(private readonly bucket: R2Bucket) {}
  async putObject(key: string, bytes: Uint8Array): Promise<void> {
    objectKey(key);
    storageCheck(bytes.byteLength <= MAX_OBJECT_BYTES, "BACKUP_STORAGE_CAPACITY_EXCEEDED");
    const written = await this.bucket.put(key, bytes, { onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/json" } });
    if (!written) storageCheck(equalBytes(await this.getObject(key), bytes), "BACKUP_STORAGE_COLLISION");
  }
  async getObject(key: string): Promise<Uint8Array | null> {
    objectKey(key);
    const object = await this.bucket.get(key);
    if (!object) return null;
    if (object.size > MAX_OBJECT_BYTES) { await object.body.cancel(); throw new Error("BACKUP_STORAGE_CAPACITY_EXCEEDED"); }
    return boundedBytes(object.body);
  }
  async listObjects(prefix: string): Promise<{ key: string; byteSize: number; versionToken: string }[]> {
    objectPrefix(prefix);
    const objects: { key: string; byteSize: number; versionToken: string }[] = [], cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await this.bucket.list({ prefix, cursor, limit: 100 });
      for (const object of page.objects) {
        objectKey(object.key);
        storageCheck(object.key.startsWith(prefix), "BACKUP_STORAGE_LIST_INVALID");
        objects.push({ key: object.key, byteSize: object.size, versionToken: object.version });
      }
      storageCheck(objects.length <= 2000, "BACKUP_STORAGE_LIST_CAPACITY_EXCEEDED");
      cursor = page.truncated ? page.cursor : undefined;
      if (page.truncated) {
        storageCheck(cursor && !cursors.has(cursor), "BACKUP_STORAGE_PAGINATION_INVALID");
        cursors.add(cursor);
      }
    } while (cursor);
    return objects;
  }
  async deleteObject(key: string, versionToken?: string): Promise<void> {
    objectKey(key);
    storageCheck(versionToken, "BACKUP_STORAGE_VERSION_REQUIRED");
    const current = await this.bucket.head(key);
    if (!current) return;
    storageCheck(current.version === versionToken, "BACKUP_STORAGE_VERSION_CHANGED");
    // Workers R2 delete has no generation precondition. The app-owned immutable
    // writer boundary is therefore required; HEAD is not an atomic delete lock.
    await this.bucket.delete(key);
  }
}

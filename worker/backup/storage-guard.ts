export const MAX_OBJECT_BYTES = 5 * 1024 * 1024;
export const BACKUP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function storageCheck(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}
export function objectKey(key: string): void {
  const parts = key.split("/");
  storageCheck(parts.length === 3 && parts[0] === "cyweb" && BACKUP_ID.test(parts[1])
    && ["data.json", "manifest.json"].includes(parts[2]), "BACKUP_STORAGE_KEY_INVALID");
}
export function objectPrefix(prefix: string): void {
  storageCheck(prefix === "cyweb/" || (prefix.endsWith("/") && BACKUP_ID.test(prefix.slice(6, -1))
    && prefix.startsWith("cyweb/")), "BACKUP_STORAGE_PREFIX_INVALID");
}
export function equalBytes(a: Uint8Array | null, b: Uint8Array): boolean {
  return !!a && a.byteLength === b.byteLength && a.every((v, i) => v === b[i]);
}
export async function boundedBytes(stream: ReadableStream<Uint8Array> | null, limit = MAX_OBJECT_BYTES): Promise<Uint8Array> {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      storageCheck(size <= limit, "BACKUP_STORAGE_CAPACITY_EXCEEDED");
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

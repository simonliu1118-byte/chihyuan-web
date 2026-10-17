export class RequestInputError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "RequestInputError";
    this.code = code;
    this.status = status;
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function readJsonObject(
  request: Request,
  maxBytes = 64 * 1024,
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new RequestInputError("UNSUPPORTED_CONTENT_TYPE", "Request body must be JSON", 400);
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    const parsed = Number(declaredLength);
    if (Number.isFinite(parsed) && parsed > maxBytes) {
      throw new RequestInputError("REQUEST_TOO_LARGE", "Request body is too large", 400);
    }
  }

  // Enforce the same canonical limit while reading, including chunked bodies
  // and a missing/incorrect Content-Length. Never buffer an unbounded request.
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    if (reader) for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new RequestInputError("REQUEST_TOO_LARGE", "Request body is too large", 400);
      }
      chunks.push(value);
    }
  } finally { reader?.releaseLock(); }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  const text = new TextDecoder().decode(body);

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new RequestInputError("INVALID_JSON", "Request body is not valid JSON", 400);
  }

  if (!isPlainObject(value)) {
    throw new RequestInputError("INVALID_REQUEST_SHAPE", "Request body must be a JSON object", 400);
  }

  return value;
}

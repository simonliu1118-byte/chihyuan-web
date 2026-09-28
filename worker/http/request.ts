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

  const text = await request.text();
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > maxBytes) {
    throw new RequestInputError("REQUEST_TOO_LARGE", "Request body is too large", 400);
  }

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

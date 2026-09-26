import type { ApiErrorDetail, ApiFailure, ApiSuccess } from "../../shared/api";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
} as const;

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(JSON_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function success<T>(data: T, requestId: string, init: ResponseInit = {}): Response {
  const body: ApiSuccess<T> = { ok: true, data, requestId };
  return json(body, init);
}

export function failure(
  error: ApiErrorDetail,
  requestId: string,
  status: number,
): Response {
  const body: ApiFailure = {
    ok: false,
    error,
    requestId,
  };
  return json(body, { status });
}

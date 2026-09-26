import type { ApiFailure, ApiResponse } from "../../shared/api";

export interface ApiRequestInit extends Omit<RequestInit, "body"> {
  json?: unknown;
  body?: BodyInit | null;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly fields: Record<string, string> | undefined;

  constructor(options: {
    message: string;
    status: number;
    code: string;
    requestId?: string | null;
    fields?: Record<string, string>;
  }) {
    super(options.message);
    this.name = "ApiClientError";
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId ?? null;
    this.fields = options.fields;
  }
}

function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
  if (!value || typeof value !== "object" || !("ok" in value) || !("requestId" in value)) {
    return false;
  }

  const response = value as { ok?: unknown; requestId?: unknown; data?: unknown; error?: unknown };
  if (typeof response.ok !== "boolean" || typeof response.requestId !== "string") return false;

  if (response.ok) return "data" in response;

  if (!response.error || typeof response.error !== "object") return false;
  const error = response.error as { code?: unknown; message?: unknown };
  return typeof error.code === "string" && typeof error.message === "string";
}

async function readEnvelope<T>(response: Response): Promise<ApiResponse<T>> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new ApiClientError({
      status: response.status,
      code: "INVALID_API_RESPONSE",
      message: "伺服器回應格式不正確",
    });
  }

  if (!isApiResponse<T>(value)) {
    throw new ApiClientError({
      status: response.status,
      code: "INVALID_API_RESPONSE",
      message: "伺服器回應格式不正確",
    });
  }

  return value;
}

export async function apiRequest<T>(
  input: string,
  init: ApiRequestInit = {},
): Promise<T> {
  const { json, body: explicitBody, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  if (!headers.has("accept")) headers.set("accept", "application/json");

  let body = explicitBody ?? null;
  if (json !== undefined) {
    if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
    body = JSON.stringify(json);
  }

  const response = await fetch(input, {
    ...requestInit,
    headers,
    body,
    credentials: requestInit.credentials ?? "same-origin",
    cache: "no-store",
  });

  const envelope = await readEnvelope<T>(response);

  if (!response.ok || !envelope.ok) {
    const failure = envelope as ApiFailure;
    throw new ApiClientError({
      status: response.status,
      code: failure.error.code,
      message: failure.error.message,
      requestId: failure.requestId,
      fields: failure.error.fields,
    });
  }

  return envelope.data;
}

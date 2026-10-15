import type { ApiResponse } from "../../shared/api";
import { chineseMessage, localizeApiError } from "./error-messages";

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
    super(localizeApiError(options.code, options.message));
    this.name = "ApiClientError";
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId ?? null;
    this.fields = options.fields && Object.fromEntries(Object.entries(options.fields).map(([key, message]) => [key, chineseMessage(message, "此欄位內容不符合要求，請檢查後重新輸入。") ]));
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

  let response: Response;
  try { response = await fetch(input, {
    ...requestInit,
    headers,
    body,
    credentials: requestInit.credentials ?? "same-origin",
    cache: "no-store",
  }); } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiClientError({ status: 0, code: "NETWORK_ERROR", message: "無法連線至伺服器，請確認網路後再試。" });
  }

  const envelope = await readEnvelope<T>(response);

  if (!envelope.ok) {
    throw new ApiClientError({
      status: response.status,
      code: envelope.error.code,
      message: envelope.error.message,
      requestId: envelope.requestId,
      fields: envelope.error.fields,
    });
  }

  if (!response.ok) {
    throw new ApiClientError({
      status: response.status,
      code: "HTTP_ENVELOPE_MISMATCH",
      message: `伺服器回應狀態異常（HTTP ${response.status}）`,
      requestId: envelope.requestId,
    });
  }

  return envelope.data;
}

import type { ApiFailure, ApiSuccess, HealthData } from "../shared/api";

interface Env {
  DB: D1Database;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
} as const;

function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(JSON_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Response(JSON.stringify(body), { ...init, headers });
}

function success<T>(data: T, requestId: string, init: ResponseInit = {}): Response {
  const body: ApiSuccess<T> = { ok: true, data, requestId };
  return json(body, init);
}

function failure(
  code: string,
  message: string,
  requestId: string,
  status: number,
): Response {
  const body: ApiFailure = {
    ok: false,
    error: { code, message },
    requestId,
  };
  return json(body, { status });
}

async function health(env: Env, requestId: string): Promise<Response> {
  try {
    await env.DB.prepare("SELECT 1 AS ok").first();
    const data: HealthData = {
      service: "cyweb",
      database: "ok",
      time: new Date().toISOString(),
    };
    return success(data, requestId);
  } catch {
    return failure("SERVICE_UNAVAILABLE", "Local database is not ready", requestId, 503);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return health(env, requestId);
    }

    if (url.pathname.startsWith("/api/")) {
      return failure("NOT_FOUND", "API route not found", requestId, 404);
    }

    return failure("NOT_FOUND", "Route not found", requestId, 404);
  },
} satisfies ExportedHandler<Env>;

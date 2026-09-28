import type { HealthData } from "../shared/api";
import { failure, success } from "./http/response";

interface Env {
  DB: D1Database;
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
    return failure(
      { code: "SERVICE_UNAVAILABLE", message: "Local database is not ready" },
      requestId,
      503,
    );
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
      return failure({ code: "NOT_FOUND", message: "API route not found" }, requestId, 404);
    }

    return failure({ code: "NOT_FOUND", message: "Route not found" }, requestId, 404);
  },
} satisfies ExportedHandler<Env>;

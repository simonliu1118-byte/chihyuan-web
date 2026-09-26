interface Env {
  DB: D1Database;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
} as const;

function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(JSON_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Response(JSON.stringify(body), { ...init, headers });
}

async function health(env: Env): Promise<Response> {
  try {
    await env.DB.prepare("SELECT 1 AS ok").first();
    return json({
      ok: true,
      service: "cyweb",
      database: "ok",
      time: new Date().toISOString(),
    });
  } catch {
    return json(
      {
        ok: false,
        service: "cyweb",
        database: "error",
        time: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return health(env);
    }

    if (url.pathname.startsWith("/api/")) {
      return json(
        { ok: false, error: { code: "NOT_FOUND", message: "API route not found" } },
        { status: 404 },
      );
    }

    return json(
      { ok: false, error: { code: "NOT_FOUND", message: "Route not found" } },
      { status: 404 },
    );
  },
} satisfies ExportedHandler<Env>;

export const CYWEB_IDENTITY_COOKIE = "cyweb_identity_session";
export const CYWEB_FIRST_LOGIN_COOKIE = "cyweb_first_login";

export function cookieValue(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return null; }
  }
  return null;
}
export function isSessionToken(value: unknown): value is string {
  return typeof value === "string" && /^cyid_[0-9a-f]{64}$/.test(value);
}
export function normalizedApplicationId(env: { IDENTITY_APPLICATION_ID?: string }): string | null {
  const value = env.IDENTITY_APPLICATION_ID?.trim().toUpperCase() ?? "";
  return /^[A-Z0-9_-]{2,64}$/.test(value) ? value : null;
}
export function normalizedWorkspaceId(env: { IDENTITY_WORKSPACE_ID?: string }): string | null {
  const value = env.IDENTITY_WORKSPACE_ID?.trim() ?? "";
  return /^[A-Za-z0-9_-]{5,80}$/.test(value) ? value : null;
}
export function forwardedHeaders(request: Request): Headers {
  const headers = new Headers({ "content-type": "application/json" });
  for (const name of ["cf-connecting-ip", "x-request-id"]) {
    const value = request.headers.get(name)?.trim();
    if (value) headers.set(name, value);
  }
  return headers;
}

/** One attempt and a deadline covering both headers and body. No retries. */
export async function fetchIdentityProvider(binding: Fetcher, request: Request, timeoutMs = 5000): Promise<Response | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await binding.fetch(new Request(request, { signal: controller.signal }));
        const body = await response.arrayBuffer();
        return new Response([204, 205, 304].includes(response.status) ? null : body, { status: response.status, statusText: response.statusText, headers: response.headers });
      })(),
      new Promise<null>(resolve => { timer = setTimeout(() => { controller.abort(); resolve(null); }, timeoutMs); }),
    ]);
  } catch { return null; }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

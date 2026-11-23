import { CYWEB_IDENTITY_COOKIE, cookieValue, isSessionToken } from "../identity/provider-transport";
import { failure, success } from "./response";
import { identityClient, type IdentityRuntimeEnv } from "./auth-routes";

/**
 * Single sign-on portal (SSO_PORTAL_DESIGN §5, AUTH_CONTRACT §13, CONSUMER_INTEGRATION_STANDARD §21.2).
 *
 *   GET  /sso?app&state          SPA shell (the page decides login / confirmation). Never issues a code.
 *   GET  /api/sso/context        same-origin read for the SPA: who is signing in, to which App (name and whether access
 *                                is allowed, from the provider's read-only preview), plus a CSRF token only when allowed/unknown.
 *   POST /sso/continue           the only place a code is requested. CSRF protected, answers 303.
 *
 * `state` is opaque and passed back verbatim; nothing is stored server-side. The destination is always the
 * return URL registered at the provider. The code and the Session token are never logged or echoed
 * except inside the final redirect Location.
 */

export const SSO_CSRF_COOKIE = "__Host-cyweb_sso_csrf";
const CSRF_MAX_AGE_SECONDS = 600;
const APP_PATTERN = /^[A-Z0-9_-]{2,64}$/;
const STATE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

type SsoEnv = IdentityRuntimeEnv & { ASSETS?: Fetcher };

export function validSsoParams(app: unknown, state: unknown): { app: string; state: string } | null {
  if (typeof app !== "string" || typeof state !== "string") return null;
  if (!APP_PATTERN.test(app) || !STATE_PATTERN.test(state)) return null;
  return { app, state };
}

function noStore(response: Response): Response {
  const result = new Response(response.body, response);
  result.headers.set("cache-control", "no-store");
  result.headers.set("referrer-policy", "no-referrer");
  return result;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Token = SHA-256(nonce, Session token): bound to this Session and unguessable without the HttpOnly cookie nonce. */
async function csrfToken(nonce: string, sessionToken: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`cyweb-sso-csrf\n${nonce}\n${sessionToken}`));
  return base64url(new Uint8Array(digest));
}

function sameValue(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function csrfCookie(nonce: string, maxAge = CSRF_MAX_AGE_SECONDS): string {
  return `${SSO_CSRF_COOKIE}=${nonce}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function sameOriginPost(request: Request, url: URL): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") return false;
  return request.headers.get("origin") === url.origin;
}

function pageUrl(origin: string, app: string, state: string, result?: string): string {
  const target = new URL("/sso", origin);
  target.searchParams.set("app", app);
  target.searchParams.set("state", state);
  if (result) target.searchParams.set("result", result);
  return target.toString();
}

function redirect(location: string, extra?: string): Response {
  const headers = new Headers({ location });
  if (extra) headers.append("set-cookie", extra);
  return noStore(new Response(null, { status: 303, headers }));
}

function errorPage(status: number, message: string): Response {
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>CY Web</title></head><body style="font-family:system-ui,sans-serif;margin:16px"><h1 style="font-size:1.2rem">無法前往</h1><p>${message}</p><p><a href="/">回到 CY Web 首頁</a></p></body></html>`;
  return noStore(new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } }));
}

async function context(request: Request, env: SsoEnv, requestId: string, url: URL): Promise<Response> {
  const params = validSsoParams(url.searchParams.get("app"), url.searchParams.get("state"));
  if (!params) return noStore(failure({ code: "SSO_REQUEST_INVALID", message: "Single sign-on request is invalid" }, requestId, 400));
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") return noStore(failure({ code: "SSO_REQUEST_INVALID", message: "Cross-site request refused" }, requestId, 403));

  const provider = identityClient(env);
  if (!provider) return noStore(failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider is not configured" }, requestId, 503));
  const resolution = await provider.resolve(request);
  if (resolution.status === "unavailable") return noStore(failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider is unavailable" }, requestId, 503));
  if (resolution.status !== "authenticated") return noStore(failure({ code: "AUTH_REQUIRED", message: "Authentication required" }, requestId, 401));

  const sessionToken = cookieValue(request, CYWEB_IDENTITY_COOKIE);
  if (!isSessionToken(sessionToken)) return noStore(failure({ code: "AUTH_REQUIRED", message: "Authentication required" }, requestId, 401));
  const preview = await provider.previewSsoHandoff(request, params.app);
  if (preview.status === "application_unavailable") return noStore(failure({ code: "SSO_APPLICATION_UNAVAILABLE", message: "Application is not available for single sign-on" }, requestId, 404));
  if (preview.status === "session_invalid") return noStore(failure({ code: "AUTH_REQUIRED", message: "Authentication required" }, requestId, 401));
  if (preview.status !== "ok") return noStore(failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider is unavailable" }, requestId, 503));

  const user = { displayName: resolution.principal.displayName, employeeNo: resolution.principal.employeeNo };
  const application = { id: params.app, name: preview.name, origin: preview.origin };
  // Denied / first-login: the page shows the message and offers no way forward, so no CSRF token or cookie exists.
  if (preview.access === "denied" || preview.access === "first_login_required") {
    return noStore(success({ user, application, access: preview.access, csrf: null }, requestId));
  }
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(32)));
  return noStore(success({
    user, application, access: preview.access,
    csrf: await csrfToken(nonce, sessionToken),
  }, requestId, { headers: { "set-cookie": csrfCookie(nonce) } }));
}

async function proceed(request: Request, env: SsoEnv, url: URL): Promise<Response> {
  if (!sameOriginPost(request, url)) return errorPage(403, "此要求不是從 CY Web 發出，已拒絕。");
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/x-www-form-urlencoded")) return errorPage(400, "要求格式不正確。");
  const form = await request.formData().catch(() => null);
  const app = form?.get("app"), state = form?.get("state"), csrf = form?.get("csrf");
  const params = validSsoParams(app, state);
  if (!params) return errorPage(400, "要求不正確，請回到原系統重新操作。");

  const sessionToken = cookieValue(request, CYWEB_IDENTITY_COOKIE);
  // No Session: send the browser back to the page, which shows the login form.
  if (!isSessionToken(sessionToken)) return redirect(pageUrl(url.origin, params.app, params.state));

  const nonce = cookieValue(request, SSO_CSRF_COOKIE);
  const expected = nonce && /^[A-Za-z0-9_-]{43}$/.test(nonce) ? await csrfToken(nonce, sessionToken) : null;
  if (!expected || typeof csrf !== "string" || !sameValue(csrf, expected)) {
    return errorPage(403, "安全驗證失敗，請回到原系統重新操作。");
  }

  const provider = identityClient(env);
  const clear = csrfCookie("", 0); // single use
  if (!provider) return redirect(pageUrl(url.origin, params.app, params.state, "unavailable"), clear);
  const result = await provider.issueSsoHandoff(request, params.app);
  if (result.status === "access_denied") return redirect(pageUrl(url.origin, params.app, params.state, "denied"), clear);
  if (result.status === "first_login_required") return redirect(pageUrl(url.origin, params.app, params.state, "first_login"), clear);
  if (result.status === "session_invalid") return redirect(pageUrl(url.origin, params.app, params.state), clear);
  if (result.status !== "issued") return redirect(pageUrl(url.origin, params.app, params.state, "unavailable"), clear);

  let target: URL;
  try { target = new URL(result.returnUrl); } catch { return redirect(pageUrl(url.origin, params.app, params.state, "unavailable"), clear); }
  // The provider only registers plain https URLs; refuse anything else instead of forwarding a code to it.
  if (target.protocol !== "https:" || target.search || target.hash || target.username || target.password) {
    return redirect(pageUrl(url.origin, params.app, params.state, "unavailable"), clear);
  }
  target.searchParams.set("code", result.code);
  target.searchParams.set("state", params.state);
  return redirect(target.toString(), clear);
}

export async function handleSsoRoute(request: Request, env: SsoEnv, requestId: string): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/sso/continue") {
    if (request.method !== "POST") return noStore(new Response(null, { status: 405, headers: { allow: "POST" } }));
    return proceed(request, env, url);
  }
  if (url.pathname === "/api/sso/context" && request.method === "GET") return context(request, env, requestId, url);
  if (url.pathname === "/sso" && (request.method === "GET" || request.method === "HEAD")) {
    if (!env.ASSETS) return errorPage(404, "頁面不存在。");
    // A GET only serves the page shell; it never reaches the provider.
    return noStore(await env.ASSETS.fetch(request));
  }
  return null;
}

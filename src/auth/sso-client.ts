import { apiRequest } from "../api/client";

export const SSO_APP_PATTERN = /^[A-Z0-9_-]{2,64}$/;
export const SSO_STATE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export interface SsoContext {
  user: { displayName: string; employeeNo: string };
  application: { id: string; name: string | null };
  csrf: string;
}

/** Same checks as the Worker; the page never calls the server with values that fail them. */
export function parseSsoLocation(search: string): { app: string; state: string; result: string | null } | null {
  const params = new URLSearchParams(search);
  const app = params.get("app") ?? "", state = params.get("state") ?? "";
  if (!SSO_APP_PATTERN.test(app) || !SSO_STATE_PATTERN.test(state)) return null;
  return { app, state, result: params.get("result") };
}

export function loadSsoContext(app: string, state: string): Promise<SsoContext> {
  return apiRequest<SsoContext>(`/api/sso/context?app=${encodeURIComponent(app)}&state=${encodeURIComponent(state)}`, { method: "GET" });
}

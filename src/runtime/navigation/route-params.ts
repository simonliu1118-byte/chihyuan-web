/** Shareable record links are fragments: #customers?id=1 or #defects?id=2. */
export function readRouteParams(): URLSearchParams {
  const hash = window.location.hash.slice(1);
  const separator = hash.indexOf("?");
  return new URLSearchParams(separator < 0 ? "" : hash.slice(separator + 1));
}

export function routeHref(route: string, params: Record<string, string | number | null | undefined> = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && String(value)) query.set(key, String(value));
  }
  return `#${route}${query.size ? `?${query}` : ""}`;
}

/** Clear or replace only the current route query without adding browser history. */
export function replaceRouteParams(params: Record<string, string | number | null | undefined>): void {
  const route = window.location.hash.slice(1).split("?")[0] || "account";
  window.history.replaceState(null, "", routeHref(route, params));
}

export function recordIdFromHash(): number | null {
  const raw = readRouteParams().get("id");
  if (!raw || !/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

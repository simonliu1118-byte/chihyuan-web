import type { ProgramEntry } from "../../../shared/program-catalog";
import type { NavigationItem } from "../../ui/foundation/navigation";

/** One web App the signed-in Employee may enter, as answered by GET /api/sso/applications. */
export interface WebApplicationEntry { applicationId: string; name: string; origin: string }

function originOf(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).origin; } catch { return null; }
}

/**
 * Sidebar「工具」entries for registered web Apps. The label is the registered name (Chinese name when set),
 * the link is the App origin (opening it starts the CY Web login flow), and the icon comes from the web
 * program in the verified catalog whose website has the same origin; otherwise the shell's generic external icon
 * is used (the `web-` key prefix). Nothing here names a specific App.
 */
export function webApplicationNavigation(
  applications: readonly WebApplicationEntry[],
  programs: readonly ProgramEntry[],
  icons: Readonly<Record<string, string>>,
): NavigationItem[] {
  const iconByOrigin = new Map<string, string>();
  for (const program of programs) {
    const origin = program.platform === "web" ? originOf(program.websiteUrl) : null;
    const icon = program.icon ? icons[program.icon] : undefined;
    if (origin && icon && !iconByOrigin.has(origin)) iconByOrigin.set(origin, icon);
  }
  return applications.map(app => ({
    key: "web-" + app.applicationId,
    label: app.name,
    href: app.origin + "/",
    external: true,
    iconSrc: iconByOrigin.get(app.origin),
  }));
}

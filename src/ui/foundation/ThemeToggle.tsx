import { useSyncExternalStore } from "react";

/**
 * Appearance preference: follow the system (default), or a fixed light/dark choice.
 * Stored in a non-sensitive cookie so it survives reloads; it carries no domain data.
 */
export type ThemePreference = "system" | "light" | "dark";
const cookieKey = "cyweb-ui-theme";
const listeners = new Set<() => void>();

function readPreference(): ThemePreference {
  try {
    const entry = document.cookie.split("; ").find(item => item.startsWith(`${cookieKey}=`));
    const value = entry?.slice(cookieKey.length + 1);
    return value === "light" || value === "dark" ? value : "system";
  } catch { return "system"; }
}

let preference: ThemePreference = typeof document === "undefined" ? "system" : readPreference();

function apply(value: ThemePreference) {
  const root = document.documentElement;
  if (value === "system") delete root.dataset.cyTheme;
  else root.dataset.cyTheme = value;
}

/** Called once before the first render so the page never flashes the wrong theme. */
export function applyStoredTheme() { apply(preference); }

function setPreference(value: ThemePreference) {
  preference = value;
  apply(value);
  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = value === "system"
      ? `${cookieKey}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
      : `${cookieKey}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  } catch { /* Cookie storage may be disabled; the choice still applies to this page. */ }
  listeners.forEach(listener => listener());
}

function useThemePreference() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); },
    () => preference, () => "system" as ThemePreference);
}

const options: readonly { value: ThemePreference; label: string }[] = [
  { value: "system", label: "系統" },
  { value: "light", label: "淺色" },
  { value: "dark", label: "深色" },
];

/** Segmented 系統／淺色／深色 control (account area). */
export function ThemeSwitch() {
  const current = useThemePreference();
  return <div className="cy-theme-switch" role="group" aria-label="外觀">
    {options.map(option => <button key={option.value} type="button" aria-pressed={current === option.value}
      onClick={() => setPreference(option.value)}>{option.label}</button>)}
  </div>;
}

/** Single icon button that cycles 系統 → 淺色 → 深色 (sign-in screen). */
export function ThemeToggle() {
  const current = useThemePreference();
  const index = options.findIndex(option => option.value === current);
  const next = options[(index + 1) % options.length];
  const label = `外觀：${options[index].label}（按一下改為${next.label}）`;
  return <button type="button" className="cy-op-button quiet cy-theme-toggle" aria-label={label} title={label}
    onClick={() => setPreference(next.value)}>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {current === "dark"
        ? <path d="M20.9 13a9 9 0 0 1-9.9-9.9A9 9 0 1 0 20.9 13Z" />
        : current === "light"
          ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>
          : <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>}
    </svg>
    <span>{options[index].label}</span>
  </button>;
}

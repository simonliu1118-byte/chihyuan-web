import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const key = "cyweb-ui-theme";

function initialTheme(): Theme {
  try { return document.cookie.split("; ").some(entry => entry === `${key}=dark`) ? "dark" : "light"; }
  catch { return "light"; }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.cyTheme = theme;
    document.documentElement.style.colorScheme = theme;
    try { document.cookie = `${key}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`; }
    catch { /* Cookie storage may be disabled. */ }
  }, [theme]);

  return (
    <button type="button" className="cy-theme-toggle"
      aria-label={theme === "dark" ? "切換淺色主題" : "切換深色主題"}
      title={theme === "dark" ? "切換淺色主題" : "切換深色主題"}
      aria-pressed={theme === "dark"}
      onClick={() => setTheme(current => current === "dark" ? "light" : "dark")}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true">
        {theme === "dark"
          ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>
          : <path d="M20.9 13a9 9 0 0 1-9.9-9.9A9 9 0 1 0 20.9 13Z" />}
      </svg>
    </button>
  );
}

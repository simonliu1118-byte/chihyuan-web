import { useEffect, useState, type PropsWithChildren, type ReactNode, type CSSProperties, type MouseEvent } from "react";
import { Dialog, Drawer } from "../overlays/Dialog";
import { useCompactLayout } from "../foundation/useCompactLayout";
import type { NavigationGroup, NavigationItem } from "../foundation/navigation";

export interface AppShellProps {
  appName: string;
  pageTitle: string;
  pageDescription?: string;
  pageTools?: ReactNode;
  subtitle?: string;
  navigation: readonly NavigationGroup[];
  activeNavigationKey?: string;
  /** Top-right controls, left to right: appearance switch, then the person's menu. */
  appearance?: ReactNode;
  account?: ReactNode;
  onNavigate?: (item: NavigationItem) => void;
}

const navIconPaths: Record<string, string[]> = {
  customers: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2","M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8","M22 21v-2a4 4 0 0 0-3-3.87","M16 3.13a4 4 0 0 1 0 7.75"],
  items: ["m12 2 9 5-9 5-9-5 9-5Z","m3 7 9 5 9-5","M3 7v10l9 5 9-5V7","M12 12v10"],
  defects: ["m10.3 3.9-8.4 14.6A2 2 0 0 0 3.6 21h16.8a2 2 0 0 0 1.7-2.5L13.7 3.9a2 2 0 0 0-3.4 0Z","M12 9v4","M12 17h.01"],
  orders: ["M8 2v4","M16 2v4","M4 6h16","M4 4h16v18H4z","M8 11h8","M8 15h6"],
  outsourcing: ["M10 17h4V5H2v12h3","M14 9h4l4 4v4h-3","M5 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0","M15 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0","M14 17V9"],
  worklogs: ["M8 2v4","M16 2v4","M4 6h16","M4 4h16v18H4z","m8 14 2 2 5-5"],
  "erp-item-query": ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16","m21 21-4.4-4.4"],
  identity: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z","M9 12l2 2 4-4"],
  settings: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8","M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 2-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-3v-.8a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-2-2 .1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 5.6 14H5v-3h.6A1.7 1.7 0 0 0 7.2 10a1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-2 .1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V4h3v.8a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 2 2-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 11h.5v3H21a1.7 1.7 0 0 0-1.6 1Z"],
  audit: ["M3 12a9 9 0 1 0 3-6.7","M3 3v6h6","M12 7v5l3 2"],
  backups: ["M3 5h18v6H3z","M3 13h18v6H3z","M7 8h.01","M7 16h.01"],
  programs: ["M3 3h7v7H3z","M14 3h7v7h-7z","M3 14h7v7H3z","M14 14h7v7h-7z"]
};
function NavIcon({ name }: { name: string }) {
  const paths = navIconPaths[name] ?? navIconPaths.programs;
  return <svg className="cy-shell-nav-icon" viewBox="0 0 24 24" width="16" height="16"
    fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true">{paths.map((d, i) => <path key={i} d={d} />)}</svg>;
}

export function AppShell({
  appName,
  pageTitle,
  pageDescription,
  pageTools,
  subtitle,
  navigation,
  activeNavigationKey,
  appearance,
  account,
  onNavigate,
  children,
}: PropsWithChildren<AppShellProps>) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [helpPosition, setHelpPosition] = useState<CSSProperties>();
  const compact = useCompactLayout();
  // A route change never leaves the previous module's help text or menu open.
  useEffect(() => { setHelpOpen(false); setNavigationOpen(false); }, [pageTitle]);
  useEffect(() => { setNavigationOpen(false); setHelpOpen(false); }, [compact]);
  function openHelp(event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect(), width = Math.min(400, window.innerWidth - 32);
    const top = Math.min(rect.bottom + 8, window.innerHeight - 120);
    setHelpPosition({ position: "fixed", inset: "auto", margin: 0, width,
      left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)), top,
      maxHeight: Math.min(window.innerHeight * 0.6, window.innerHeight - top - 16) });
    setHelpOpen(true);
  }
  // The same list is mounted once: sidebar on desktop, modal drawer on compact screens.
  const navigationContent = <>
    <div className="cy-shell-brand"><span className="cy-shell-brand-mark" aria-hidden="true">CY</span>
      <div><div className="cy-shell-brand-name">{appName}</div>{subtitle ? <div className="cy-shell-brand-subtitle">{subtitle}</div> : null}</div>
    </div>
    <nav className="cy-shell-nav-groups" aria-label="模組導覽">
      {navigation.filter(group => group.items.length > 0).map((group, index) => <div key={group.key}
        className={["cy-shell-nav-group", group.dividerBefore && index > 0 ? "has-divider" : ""].filter(Boolean).join(" ")}>
        {group.label ? <div className="cy-shell-nav-label">{group.label}</div> : null}
        <div className="cy-shell-nav-items">{group.items.map(item => <a key={item.key}
          className={["cy-shell-nav-item", item.key === activeNavigationKey ? "is-active" : ""].filter(Boolean).join(" ")}
          href={item.href} aria-current={item.key === activeNavigationKey ? "page" : undefined}
          aria-disabled={item.disabled || undefined} data-disabled={item.disabled || undefined} title={item.description}
          onClick={event => {
            if (item.disabled) { event.preventDefault(); return; }
            if (!onNavigate || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            if (item.key === activeNavigationKey) setNavigationOpen(false);
            onNavigate(item);
          }}><NavIcon name={item.key} /><span>{item.label}</span></a>)}</div>
      </div>)}
    </nav>
  </>;
  return (
    <div className="cy-app-shell">
      <a className="cy-skip-link" href="#cy-main-content" onClick={(event) => {
        // Hash identifies the current module; moving focus must not route away.
        event.preventDefault();
        document.getElementById("cy-main-content")?.focus();
      }}>
        跳到主要內容
      </a>

      {!compact ? <aside className="cy-shell-nav" aria-label="主要導覽">{navigationContent}</aside> : null}

      <div className="cy-shell-workspace">
        <header className="cy-shell-topbar">
          {compact ? <button type="button" className="cy-shell-menu-toggle" aria-label="開啟模組選單" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button> : null}
          <div className="cy-shell-topbar-heading">
            <h1 className="cy-shell-topbar-title">{pageTitle}</h1>
            {pageDescription ? <button type="button" className="cy-shell-help-button" title="說明"
              aria-label={`查看${pageTitle}說明`} onClick={openHelp}><span aria-hidden="true">ⓘ</span></button> : null}
          </div>
          {pageTools ? <div className="cy-shell-page-tools">{pageTools}</div> : null}
          <div className="cy-shell-topbar-end">{appearance}{account}</div>
        </header>

        <main className="cy-shell-main" id="cy-main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
      {pageDescription && <Dialog open={helpOpen} title={pageTitle + "說明"}
        onClose={() => setHelpOpen(false)} size="small" hideHeader className="cy-shell-help" style={compact ? undefined : helpPosition}>
        <p>{pageDescription}</p>
      </Dialog>}
      {compact ? <Drawer open={navigationOpen} title="模組選單" onClose={() => setNavigationOpen(false)} className="cy-shell-navigation-drawer">{navigationContent}</Drawer> : null}
    </div>
  );
}

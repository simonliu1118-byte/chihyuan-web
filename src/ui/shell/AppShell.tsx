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
  headerActions?: ReactNode;
  accountLabel?: string;
  accountRole?: string;
  footer?: ReactNode;
  onNavigate?: (item: NavigationItem) => void;
}

export function AppShell({
  appName,
  pageTitle,
  pageDescription,
  pageTools,
  subtitle,
  navigation,
  activeNavigationKey,
  headerActions,
  accountLabel = "帳號",
  accountRole,
  footer,
  onNavigate,
  children,
}: PropsWithChildren<AppShellProps>) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [helpPosition, setHelpPosition] = useState<CSSProperties>();
  const compact = useCompactLayout();
  // A route change never leaves the previous module's help text open.
  useEffect(() => { setHelpOpen(false); setNavigationOpen(false); setAccountOpen(false); }, [pageTitle]);
  useEffect(() => { setNavigationOpen(false); setAccountOpen(false); setHelpOpen(false); }, [compact]);
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
          }}><span>{item.label}</span></a>)}</div>
      </div>)}
    </nav>
    {footer ? <div className="cy-shell-nav-footer">{footer}</div> : null}
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
        <header className={["cy-shell-topbar", pageTools ? "has-tools" : ""].filter(Boolean).join(" ")}>
          {compact ? <button type="button" className="cy-shell-menu-toggle" aria-label="開啟模組選單" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(true)}>☰</button> : null}
          <div className="cy-shell-topbar-heading">
            <h1 className="cy-shell-topbar-title">{pageTitle}</h1>
            {pageDescription ? <button type="button" className="cy-shell-help-button"
              aria-label={`查看${pageTitle}說明`} onClick={openHelp}>
              <span aria-hidden="true">ⓘ</span><span className="cy-shell-help-label"> 說明</span>
            </button> : null}
          </div>
          {headerActions ? compact
            ? <button type="button" className="cy-shell-account-toggle" data-role={accountRole} aria-label={accountLabel} onClick={() => setAccountOpen(true)}>帳號</button>
            : <div className="cy-shell-topbar-actions">{headerActions}</div> : null}
          {pageTools ? <div className="cy-shell-page-tools">{pageTools}</div> : null}
        </header>

        <main className="cy-shell-main" id="cy-main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
      {pageDescription && <Dialog open={helpOpen} title={pageTitle + "說明"}
        onClose={() => setHelpOpen(false)} size="small" hideHeader className="cy-shell-help" style={compact ? undefined : helpPosition}>
        <p>{pageDescription}</p>
      </Dialog>}
      {compact ? <>
        <Drawer open={navigationOpen} title="模組選單" onClose={() => setNavigationOpen(false)} className="cy-shell-navigation-drawer">{navigationContent}</Drawer>
        {headerActions ? <Dialog open={accountOpen} title="帳號" onClose={() => setAccountOpen(false)} size="small"><div className="cy-shell-account-panel">{headerActions}</div></Dialog> : null}
      </> : null}
    </div>
  );
}

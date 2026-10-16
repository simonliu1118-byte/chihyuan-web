import { useEffect, useState, type PropsWithChildren, type ReactNode } from "react";
import { Dialog } from "../overlays/Dialog";
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
  footer,
  onNavigate,
  children,
}: PropsWithChildren<AppShellProps>) {
  const [helpOpen, setHelpOpen] = useState(false);
  // A route change never leaves the previous module's help text open.
  useEffect(() => { setHelpOpen(false); }, [pageTitle]);
  return (
    <div className="cy-app-shell">
      <a className="cy-skip-link" href="#cy-main-content" onClick={(event) => {
        // Hash identifies the current module; moving focus must not route away.
        event.preventDefault();
        document.getElementById("cy-main-content")?.focus();
      }}>
        跳到主要內容
      </a>

      <aside className="cy-shell-nav" aria-label="主要導覽">
        <div className="cy-shell-brand">
          <span className="cy-shell-brand-mark" aria-hidden="true">
            CY
          </span>
          <div>
            <div className="cy-shell-brand-name">{appName}</div>
            {subtitle ? <div className="cy-shell-brand-subtitle">{subtitle}</div> : null}
          </div>
        </div>

        <nav className="cy-shell-nav-groups">
          {navigation.map((group) => (
            <div className="cy-shell-nav-group" key={group.key}>
              {group.label ? <div className="cy-shell-nav-label">{group.label}</div> : null}
              <div className="cy-shell-nav-items">
                {group.items.map((item) => {
                  const active = item.key === activeNavigationKey;
                  return (
                    <a
                      key={item.key}
                      className={["cy-shell-nav-item", active ? "is-active" : ""]
                        .filter(Boolean)
                        .join(" ")}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      aria-disabled={item.disabled || undefined}
                      data-disabled={item.disabled || undefined}
                      title={item.description}
                      onClick={event => {
                        if (item.disabled) { event.preventDefault(); return; }
                        if (!onNavigate || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                        event.preventDefault();
                        onNavigate(item);
                      }}
                    >
                      <span>{item.label}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {footer ? <div className="cy-shell-nav-footer">{footer}</div> : null}
      </aside>

      <div className="cy-shell-workspace">
        <header className="cy-shell-topbar">
          <div className="cy-shell-topbar-heading">
            <h1 className="cy-shell-topbar-title">{pageTitle}</h1>
            {pageDescription ? <button type="button" className="cy-shell-help-button"
              aria-label={`查看${pageTitle}說明`} onClick={() => setHelpOpen(true)}>
              <span aria-hidden="true">ⓘ</span> 說明
            </button> : null}
            {pageTools}
          </div>
          {headerActions ? <div className="cy-shell-topbar-actions">{headerActions}</div> : null}
        </header>

        <main className="cy-shell-main" id="cy-main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
      {pageDescription && <Dialog open={helpOpen} title={pageTitle + "說明"}
        onClose={() => setHelpOpen(false)} size="small">
        <p>{pageDescription}</p>
      </Dialog>}
    </div>
  );
}

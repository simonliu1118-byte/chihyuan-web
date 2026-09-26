import type { PropsWithChildren, ReactNode } from "react";
import type { NavigationGroup } from "../foundation/navigation";

export interface AppShellProps {
  appName: string;
  subtitle?: string;
  navigation: readonly NavigationGroup[];
  activeNavigationKey?: string;
  headerActions?: ReactNode;
  footer?: ReactNode;
}

export function AppShell({
  appName,
  subtitle,
  navigation,
  activeNavigationKey,
  headerActions,
  footer,
  children,
}: PropsWithChildren<AppShellProps>) {
  return (
    <div className="cy-app-shell">
      <a className="cy-skip-link" href="#cy-main-content">
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
          <div className="cy-shell-topbar-title">{appName}</div>
          {headerActions ? <div className="cy-shell-topbar-actions">{headerActions}</div> : null}
        </header>

        <main className="cy-shell-main" id="cy-main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

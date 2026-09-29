import { useEffect, useMemo, useState } from "react";
import { ApiClientError } from "./api/client";
import { checkModuleAccess, loadCurrentModuleAccess, type CurrentModuleAccess } from "./access/module-access-client";
import { AuthGate } from "./auth/AuthGate";
import type { AuthSession, WorkspaceRole } from "./auth/auth-client";
import { SharedIdentityPage } from "./identity/SharedIdentityPage";
import { moduleCodeForRoute, type CyWebModuleCode } from "../shared/modules";
import type { NavigationGroup } from "./ui/foundation/navigation";
import { AppShell } from "./ui/shell/AppShell";
import { OperationalWorkspace, type OperationalRoute } from "./runtime/OperationalWorkspace";
import { CustomerOperationalPage } from "./runtime/modules/CustomerOperationalPage";
import { DefectOperationalPage } from "./runtime/modules/DefectOperationalPage";
import { ItemOperationalPage } from "./runtime/modules/ItemOperationalPage";

type AppRoute = OperationalRoute | "defects" | "identity";

const baseNavigation: readonly NavigationGroup[] = [
  {
    key: "business",
    label: "業務",
    items: [
      { key: "customers", label: "客戶", href: "#customers" },
      { key: "items", label: "商品", href: "#items" },
      { key: "defects", label: "瑕疵", href: "#defects" },
      { key: "orders", label: "銷售工單", href: "#orders" },
      { key: "outsourcing", label: "委外", href: "#outsourcing" },
      { key: "worklogs", label: "工作日誌", href: "#worklogs" },
    ],
  },
  {
    key: "administration",
    label: "管理",
    items: [
      { key: "identity", label: "帳號與權限", href: "#identity" },
      { key: "settings", label: "設定", href: "#settings" },
      { key: "audit", label: "稽核紀錄", href: "#audit" },
    ],
  },
];

const routes = new Set<AppRoute>([
  "customers",
  "items",
  "defects",
  "orders",
  "outsourcing",
  "worklogs",
  "identity",
  "settings",
  "audit",
]);

function currentRoute(): AppRoute {
  const value = window.location.hash.replace(/^#/, "") as AppRoute;
  return routes.has(value) ? value : "identity";
}

function accountPermissionLabel(role: WorkspaceRole): string {
  if (role === "SUPER_ADMIN") return "超級使用者";
  if (role === "ADMIN") return "管理員";
  return "一般使用者";
}

function messageOf(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "ACCESS_DENIED") return "你目前沒有此 CY Web 模組的使用權。";
    if (error.code === "IDENTITY_UNAVAILABLE") return "帳號服務目前無法確認模組權限。";
    return error.message || error.code;
  }
  return "目前無法確認模組權限。";
}

function OperationalApp({
  session,
  logout,
  signingOut,
}: {
  session: AuthSession;
  logout: () => Promise<void>;
  signingOut: boolean;
}) {
  const [route, setRoute] = useState<AppRoute>(currentRoute);
  const [moduleAccess, setModuleAccess] = useState<CurrentModuleAccess | null>(null);
  const [moduleAccessError, setModuleAccessError] = useState<string | null>(null);
  const [routeAccess, setRouteAccess] = useState<"idle" | "checking" | "allowed" | "denied">("idle");

  useEffect(() => {
    let cancelled = false;
    setModuleAccess(null);
    setModuleAccessError(null);
    void loadCurrentModuleAccess()
      .then((value) => {
        if (cancelled) return;
        setModuleAccess(value);
      })
      .catch((error) => {
        if (cancelled) return;
        setModuleAccessError(messageOf(error));
      });
    return () => { cancelled = true; };
  }, [session.user.employeeId, session.user.employeeRevision, session.user.workspaceRole]);

  const allowedModules = useMemo(
    () => new Set<CyWebModuleCode>(moduleAccess?.allowedModules ?? []),
    [moduleAccess],
  );

  const navigation = useMemo<readonly NavigationGroup[]>(() => {
    const business = baseNavigation[0].items.filter((item) => {
      const moduleCode = moduleCodeForRoute(item.key);
      return moduleCode ? allowedModules.has(moduleCode) : false;
    });
    const administration = baseNavigation[1].items.filter((item) => {
      if (item.key === "identity") return true;
      return session.user.workspaceRole === "ADMIN" || session.user.workspaceRole === "SUPER_ADMIN";
    });
    return [
      { ...baseNavigation[0], items: business },
      { ...baseNavigation[1], items: administration },
    ];
  }, [allowedModules, session.user.workspaceRole]);

  useEffect(() => {
    const handleHashChange = () => setRoute(currentRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (!moduleAccess) return;
    const routeNow = currentRoute();
    const moduleCode = moduleCodeForRoute(routeNow);
    const adminOnly = routeNow === "settings" || routeNow === "audit";
    const adminAllowed = session.user.workspaceRole === "ADMIN" || session.user.workspaceRole === "SUPER_ADMIN";

    if (!window.location.hash) {
      const firstBusiness = baseNavigation[0].items.find((item) => {
        const code = moduleCodeForRoute(item.key);
        return code ? allowedModules.has(code) : false;
      });
      window.location.hash = firstBusiness?.href ?? "#identity";
      return;
    }

    if ((moduleCode && !allowedModules.has(moduleCode)) || (adminOnly && !adminAllowed)) {
      window.location.hash = "#identity";
    }
  }, [moduleAccess, allowedModules, session.user.workspaceRole]);

  useEffect(() => {
    const moduleCode = moduleCodeForRoute(route);
    if (!moduleCode) {
      setRouteAccess("idle");
      return;
    }
    let cancelled = false;
    setRouteAccess("checking");
    void checkModuleAccess(moduleCode)
      .then(() => {
        if (!cancelled) setRouteAccess("allowed");
      })
      .catch((error) => {
        if (cancelled) return;
        setRouteAccess("denied");
        setModuleAccessError(messageOf(error));
        window.location.hash = "#identity";
      });
    return () => { cancelled = true; };
  }, [route]);

  let content: React.ReactNode;
  const moduleCode = moduleCodeForRoute(route);
  if (moduleCode && routeAccess !== "allowed") {
    content = <section className="cy-op-panel"><h2>{routeAccess === "denied" ? "無模組使用權" : "正在確認模組權限…"}</h2><p>{moduleAccessError ?? "CY Web 會由 Worker 重新確認目前權限。"}</p></section>;
  } else if (route === "customers") content = <CustomerOperationalPage />;
  else if (route === "items") content = <ItemOperationalPage />;
  else if (route === "defects") content = <DefectOperationalPage />;
  else if (route === "identity") content = <SharedIdentityPage session={session} />;
  else content = <OperationalWorkspace route={route as OperationalRoute} />;

  return (
    <AppShell
      appName="CY Web"
      subtitle="Chihyuan Enterprise Management System"
      navigation={navigation}
      activeNavigationKey={route}
      headerActions={
        <>
          <div className="cy-op-runtime-banner">業務資料暫存模式 · localStorage</div>
          <div className="cy-auth-account-control">
            <div className="cy-auth-user">
              <span><strong>{session.user.employeeNo}</strong> {session.user.displayName} <span className="cy-auth-permission-badge">[{accountPermissionLabel(session.user.workspaceRole)}]</span></span>
            </div>
            <button
              className="cy-auth-logout-button"
              type="button"
              disabled={signingOut}
              onClick={() => void logout()}
            >
              {signingOut ? "登出中…" : "登出"}
            </button>
          </div>
        </>
      }
      footer={<span className="cy-shell-foundation-note">Development · CYCloud Identity · 業務資料尚未切換 D1</span>}
    >
      {moduleAccessError && route === "identity" ? <div className="cy-notice cy-notice-warning"><div className="cy-notice-title">模組權限狀態</div><div className="cy-notice-body">{moduleAccessError}</div></div> : null}
      {content}
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthGate>
      {(session, logout, signingOut) => (
        <OperationalApp session={session} logout={logout} signingOut={signingOut} />
      )}
    </AuthGate>
  );
}

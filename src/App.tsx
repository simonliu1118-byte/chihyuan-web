import { useEffect, useState } from "react";
import { AuthGate } from "./auth/AuthGate";
import type { AuthSession } from "./auth/auth-client";
import type { NavigationGroup } from "./ui/foundation/navigation";
import { AppShell } from "./ui/shell/AppShell";
import { OperationalWorkspace, type OperationalRoute } from "./runtime/OperationalWorkspace";
import { CustomerOperationalPage } from "./runtime/modules/CustomerOperationalPage";
import { DefectOperationalPage } from "./runtime/modules/DefectOperationalPage";
import { ItemOperationalPage } from "./runtime/modules/ItemOperationalPage";

type AppRoute = OperationalRoute | "defects";

const navigation: readonly NavigationGroup[] = [
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
  "settings",
  "audit",
]);

function currentRoute(): AppRoute {
  const value = window.location.hash.replace(/^#/, "") as AppRoute;
  return routes.has(value) ? value : "customers";
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

  useEffect(() => {
    if (!window.location.hash) window.location.hash = "#customers";
    const handleHashChange = () => setRoute(currentRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  let content: React.ReactNode;
  if (route === "customers") content = <CustomerOperationalPage />;
  else if (route === "items") content = <ItemOperationalPage />;
  else if (route === "defects") content = <DefectOperationalPage />;
  else content = <OperationalWorkspace route={route as OperationalRoute} />;

  const authorityLabel = session.user.isWorkspaceSuperAdmin ? "最高權限" : "一般帳號";

  return (
    <AppShell
      appName="CY Web"
      subtitle="Chihyuan Enterprise Management System"
      navigation={navigation}
      activeNavigationKey={route}
      headerActions={
        <>
          <div className="cy-op-runtime-banner">業務資料暫存模式 · localStorage</div>
          <div className="cy-auth-user">
            <strong>{session.user.displayName}</strong>
            <span>{session.user.employeeNo} · {authorityLabel}</span>
          </div>
          <button
            className="cy-auth-logout-button"
            type="button"
            disabled={signingOut}
            onClick={() => void logout()}
          >
            {signingOut ? "登出中…" : "登出"}
          </button>
        </>
      }
      footer={<span className="cy-shell-foundation-note">Development · CYCloud Identity · 業務資料尚未切換 D1</span>}
    >
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

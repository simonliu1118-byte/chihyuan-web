import { useEffect, useState } from "react";
import type { NavigationGroup } from "./ui/foundation/navigation";
import { AppShell } from "./ui/shell/AppShell";
import { OperationalWorkspace, type OperationalRoute } from "./runtime/OperationalWorkspace";
import { CustomerOperationalPage } from "./runtime/modules/CustomerOperationalPage";

const navigation: readonly NavigationGroup[] = [
  {
    key: "business",
    label: "業務",
    items: [
      { key: "customers", label: "客戶", href: "#customers" },
      { key: "items", label: "商品", href: "#items" },
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

const routes = new Set<OperationalRoute>([
  "customers",
  "items",
  "orders",
  "outsourcing",
  "worklogs",
  "settings",
  "audit",
]);

function currentRoute(): OperationalRoute {
  const value = window.location.hash.replace(/^#/, "") as OperationalRoute;
  return routes.has(value) ? value : "customers";
}

export default function App() {
  const [route, setRoute] = useState<OperationalRoute>(currentRoute);

  useEffect(() => {
    if (!window.location.hash) window.location.hash = "#customers";
    const handleHashChange = () => setRoute(currentRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return (
    <AppShell
      appName="CY Web"
      subtitle="Chihyuan Enterprise Management System"
      navigation={navigation}
      activeNavigationKey={route}
      headerActions={<div className="cy-op-runtime-banner">本機操作模式 · localStorage 持久保存</div>}
      footer={<span className="cy-shell-foundation-note">Operational Local Runtime · 尚未連接 D1 / Shared Identity</span>}
    >
      {route === "customers" ? <CustomerOperationalPage /> : <OperationalWorkspace route={route} />}
    </AppShell>
  );
}

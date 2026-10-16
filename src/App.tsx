import { useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError } from "./api/client";
import { checkModuleAccess } from "./access/module-access-client";
import { AuthGate } from "./auth/AuthGate";
import type { AuthSession, WorkspaceRole } from "./auth/auth-client";
import { SharedIdentityPage } from "./identity/SharedIdentityPage";
import { CYWEB_MODULES, moduleCodeForRoute, type CyWebModuleCode } from "../shared/modules";
import type { NavigationGroup } from "./ui/foundation/navigation";
import { AppShell } from "./ui/shell/AppShell";
import { SettingsOperationalPage } from "./runtime/modules/SettingsOperationalPage";
import { AuditOperationalPage } from "./runtime/modules/AuditOperationalPage";
import { CustomerOperationalPage } from "./runtime/modules/CustomerOperationalPage";
import { DefectOperationalPage } from "./runtime/modules/DefectOperationalPage";
import { ErpItemQueryPage } from "./runtime/modules/ErpItemQueryPage";
import { ErpAgentCredentialControl } from "./runtime/modules/ErpAgentCredentialControl";
import { ItemOperationalPage } from "./runtime/modules/ItemOperationalPage";
import { OutsourcingOperationalPage } from "./runtime/modules/OutsourcingOperationalPage";
import { SalesOrderOperationalPage } from "./runtime/modules/SalesOrderOperationalPage";
import { WorkLogOperationalPage } from "./runtime/modules/WorkLogOperationalPage";
import { BackupOperationalPage } from "./runtime/modules/BackupOperationalPage";
import { ProgramCatalogPage } from "./runtime/modules/ProgramCatalogPage";
import { UnsavedChangesBoundary, useNavigationGuard } from "./ui/foundation/useUnsavedChangesGuard";
import { createGuardedHashNavigation } from "./ui/foundation/guarded-hash-navigation";
import { FeedbackProvider, useFeedback, useFeedbackMessage } from "./ui/feedback/FeedbackProvider";

type AppRoute = "customers" | "items" | "defects" | "orders" | "outsourcing" | "worklogs" | "erp-item-query" | "settings" | "audit" | "identity" | "backups" | "programs";

// One source of truth for the topbar titles and on-demand module descriptions.
const PAGE_META: Record<AppRoute, { title: string; description: string }> = {
  customers: { title:"客戶", description:"管理客戶資料、聯絡人、拜訪紀錄、報價與常用商品。" },
  items: { title:"商品", description:"管理商品資料、品號、價格及單位換算。" },
  defects: { title:"瑕疵", description:"管理瑕疵紀錄、處理進度及作廢。" },
  orders: { title:"銷售工單", description:"管理銷售工單、ERP 單號與出貨流程；正式單號由 SMART ERP 提供。" },
  outsourcing: { title:"委外／代工", description:"管理代工單、材料清單、代工單價與庫存。" },
  worklogs: { title:"工作日誌", description:"建立工作日誌、送交審核及檢視評分統計。" },
  "erp-item-query": { title:"ERP 品號查詢", description:"僅供查閱 SMART ERP 現有品號，不會新增或修改 ERP 或 CY Web 商品資料。" },
  identity: { title:"帳號與權限", description:"CYID 身分、Email 與系統准入的管理入口。" },
  settings: { title:"設定／管理", description:"結構設定由超級管理員維護；管理員可維護工作日誌與計分設定。" },
  audit: { title:"稽核紀錄", description:"檢視重要業務操作與設定變更；只有管理員與超級管理員可讀取詳細內容。" },
  backups: { title:"備份管理", description:"查看備份與副本狀態，建立手動備份或重試未完成的 GCS 副本。" },
  programs: { title:"CY 程式", description:"CY 程式功能、正式版本與使用入口；開發中的程式先提供功能介紹。" },
};

const baseNavigation: readonly NavigationGroup[] = [
  {
    key: "business",
    items: [
      { key: "customers", label: "客戶", href: "#customers" },
      { key: "items", label: "商品", href: "#items" },
      { key: "defects", label: "瑕疵", href: "#defects" },
      { key: "orders", label: "銷售工單", href: "#orders" },
      { key: "outsourcing", label: "委外", href: "#outsourcing" },
      { key: "worklogs", label: "工作日誌", href: "#worklogs" },
      { key: "erp-item-query", label: "ERP 品號查詢", href: "#erp-item-query" },
    ],
  },
  {
    key: "administration",
    dividerBefore: true,
    items: [
      { key: "identity", label: "帳號與權限", href: "#identity" },
      { key: "settings", label: "設定", href: "#settings" },
      { key: "audit", label: "稽核紀錄", href: "#audit" },
      { key: "backups", label: "備份管理", href: "#backups" },
    ],
  },
];

const programsNavigation: NavigationGroup = {
  key: "tools", label: "工具", items: [{ key: "programs", label: "CY 程式", href: "#programs" }],
};

const routes = new Set<AppRoute>([
  "customers",
  "items",
  "defects",
  "orders",
  "outsourcing",
  "worklogs",
  "erp-item-query",
  "identity",
  "settings",
  "audit",
  "backups",
  "programs",
]);

function currentRoute(): AppRoute {
  const value = window.location.hash.replace(/^#/, "") as AppRoute;
  return routes.has(value) ? value : "identity";
}

function accountPermissionLabel(role: WorkspaceRole): string {
  if (role === "SUPER_ADMIN") return "超級管理員";
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
  const moduleAccess = session.moduleAccess;
  const notify = useFeedback();
  const previousAccess = useRef(moduleAccess);
  const [moduleAccessError, , setModuleAccessError] = useFeedbackMessage<string | null>(null);
  const [routeAccess, setRouteAccess] = useState<"idle" | "checking" | "allowed" | "denied">("idle");
  const [checkedRoute, setCheckedRoute] = useState<AppRoute | null>(null);
  const { canLeave, cancel } = useNavigationGuard();
  const guardedNavigation = useMemo(() => createGuardedHashNavigation<AppRoute>({
    initial: currentRoute(), canLeave, commit: setRoute,
    write: (next, replace) => {
      if (replace) window.history.replaceState(null, "", `#${next}`);
      else window.location.hash = next;
    },
  }), [canLeave]);

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
      if (item.key === "backups") return session.user.workspaceRole === "SUPER_ADMIN";
      return session.user.workspaceRole === "ADMIN" || session.user.workspaceRole === "SUPER_ADMIN";
    });
    return [
      { ...baseNavigation[0], items: business },
      { ...baseNavigation[1], items: administration },
      programsNavigation,
    ];
  }, [allowedModules, session.user.workspaceRole]);

  useEffect(() => {
    const handleHashChange = () => { void guardedNavigation.request(currentRoute(), "hash"); };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [guardedNavigation]);

  useEffect(() => {
    if (!moduleAccess) return;
    const previous = previousAccess.current;
    previousAccess.current = moduleAccess;
    const routeNow = route;
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

    if ((moduleCode && !allowedModules.has(moduleCode)) || (adminOnly && !adminAllowed)
      || (routeNow === "backups" && session.user.workspaceRole !== "SUPER_ADMIN")) {
      cancel();
      guardedNavigation.replace("identity");
      const label = CYWEB_MODULES.find(item => item.code === moduleCode)?.label;
      const revoked = moduleCode && previous?.allowedModules.includes(moduleCode);
      notify(label
        ? revoked ? `「${label}」模組的使用權已被取消，已退出該模組並返回帳號頁。尚未儲存的內容不會自動送出。` : `你目前沒有「${label}」模組的使用權，已返回帳號頁。`
        : "你的管理權限已變更，已返回帳號頁。尚未儲存的內容不會自動送出。", "權限變更", { replace: true });
    }
  }, [moduleAccess, allowedModules, session.user.workspaceRole, guardedNavigation, cancel, notify, route]);

  const routeModuleCode = moduleCodeForRoute(route);
  const routeAllowed = !routeModuleCode || allowedModules.has(routeModuleCode);
  useEffect(() => {
    const moduleCode = moduleCodeForRoute(route);
    if (!moduleCode || !routeAllowed) {
      setRouteAccess("idle");
      return;
    }
    if (checkedRoute === route && routeAccess === "allowed") return;
    let cancelled = false;
    setCheckedRoute(route);
    setRouteAccess("checking");
    void checkModuleAccess(moduleCode)
      .then(() => {
        if (!cancelled) setRouteAccess("allowed");
      })
      .catch((error) => {
        if (cancelled) return;
        setRouteAccess("denied");
        setModuleAccessError(messageOf(error));
      });
    return () => { cancelled = true; };
  }, [route, routeAllowed, moduleAccess]);

  let content: React.ReactNode;
  const moduleCode = moduleCodeForRoute(route);
  const adminAllowed = session.user.workspaceRole === "ADMIN" || session.user.workspaceRole === "SUPER_ADMIN";
  if ((route === "settings" || route === "audit") && !adminAllowed) {
    content = <section className="cy-op-panel">管理權限已變更，正在返回帳號頁…</section>;
  } else if (moduleCode && (!routeAllowed || routeAccess !== "allowed" || checkedRoute !== route)) {
    content = <section className="cy-op-panel"><h2>{routeAccess === "denied" ? "目前無法確認模組權限" : "正在確認模組權限…"}</h2><p>{moduleAccessError ?? "正在確認目前的模組使用權限。"}</p></section>;
  } else if (route === "customers") content = <CustomerOperationalPage />;
  else if (route === "items") content = <ItemOperationalPage />;
  else if (route === "defects") content = <DefectOperationalPage />;
  else if (route === "orders") content = <SalesOrderOperationalPage />;
  else if (route === "outsourcing") content = <OutsourcingOperationalPage />;
  else if (route === "worklogs") content = <WorkLogOperationalPage />;
  else if (route === "erp-item-query") content = <ErpItemQueryPage />;
  else if (route === "identity") content = <SharedIdentityPage session={session} />;
  else if (route === "programs") content = <ProgramCatalogPage />;
  else if (route === "settings") content = <SettingsOperationalPage role={session.user.workspaceRole} />;
  else if (route === "backups") content = session.user.workspaceRole === "SUPER_ADMIN" ? <BackupOperationalPage /> : <section className="cy-op-panel">需要最高管理員權限。</section>;
  else content = <AuditOperationalPage />;

  return (
    <AppShell
      appName="CY Web"
      pageTitle={PAGE_META[route].title}
      pageDescription={PAGE_META[route].description}
      accountLabel={`帳號：${session.user.employeeNo} ${session.user.displayName} ${accountPermissionLabel(session.user.workspaceRole)}`}
      accountRole={session.user.workspaceRole}
      pageTools={route === "erp-item-query"
        ? <ErpAgentCredentialControl isSuperAdmin={session.user.workspaceRole === "SUPER_ADMIN"} />
        : undefined}
      subtitle="Chihyuan Enterprise Management System"
      navigation={navigation}
      activeNavigationKey={route}
      onNavigate={item => { if (routes.has(item.key as AppRoute)) void guardedNavigation.request(item.key as AppRoute, "link"); }}
      headerActions={
        <>
          <div className="cy-auth-account-control" data-role={session.user.workspaceRole}>
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
      footer={<span className="cy-shell-foundation-note">CY Web</span>}
    >
      {moduleAccessError && route === "identity" ? <div className="cy-notice cy-notice-warning"><div className="cy-notice-title">模組權限狀態</div><div className="cy-notice-body">{moduleAccessError}</div></div> : null}
      {content}
    </AppShell>
  );
}

export default function App() {
  return (
    <FeedbackProvider><AuthGate>
      {(session, logout, signingOut) => (
        <UnsavedChangesBoundary key={`${session.user.workspaceId}:${session.user.employeeId}`}><OperationalApp session={session} logout={logout} signingOut={signingOut} /></UnsavedChangesBoundary>
      )}
    </AuthGate></FeedbackProvider>
  );
}

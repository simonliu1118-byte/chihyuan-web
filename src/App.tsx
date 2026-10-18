import { Loading } from "./ui/feedback/Loading";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError } from "./api/client";
import { checkModuleAccess } from "./access/module-access-client";
import { AuthGate } from "./auth/AuthGate";
import type { AuthSession, WorkspaceRole } from "./auth/auth-client";
import { MyAccountPage, SharedIdentityPage } from "./identity/SharedIdentityPage";
import { CYWEB_MODULES, moduleCodesForRoute, type CyWebModuleCode } from "../shared/modules";
import type { NavigationGroup } from "./ui/foundation/navigation";
import { AppShell } from "./ui/shell/AppShell";
import { ThemeSwitch, ThemeToggle } from "./ui/foundation/ThemeToggle";
import { AccountMenu } from "./ui/shell/AccountMenu";
import { useCompactLayout } from "./ui/foundation/useCompactLayout";
import { WithModuleSettings } from "./runtime/modules/ModuleSettingsPanel";
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

type AppRoute = "customers" | "items" | "defects" | "orders" | "outsourcing" | "worklogs" | "erp-item-query" | "audit" | "identity" | "account" | "backups" | "programs";

// One source of truth for the topbar titles and on-demand module descriptions.
const PAGE_META: Record<AppRoute, { title: string; description: string }> = {
  customers: { title:"客戶", description:"管理客戶資料、聯絡人、拜訪紀錄、報價與常用商品。" },
  items: { title:"商品", description:"管理商品資料、品號、價格及單位換算。" },
  defects: { title:"瑕疵", description:"管理瑕疵紀錄、處理進度及作廢。" },
  orders: { title:"銷售工單", description:"管理銷售工單、ERP 單號與出貨流程；正式單號由 SMART ERP 提供。" },
  outsourcing: { title:"委外／代工", description:"管理代工單、材料清單、代工單價與庫存。" },
  worklogs: { title:"工作日誌", description:"建立工作日誌、送交審核及檢視評分統計。" },
  "erp-item-query": { title:"ERP 查詢", description:"查閱 SMART ERP 的商品、客戶、銷貨銷退單與未收款；只讀取，不會新增或修改 ERP 或 CY Web 資料。" },
  identity: { title:"帳號與權限", description:"管理使用者、權限群組與系統使用權；系統與安全設定由超級管理員維護。" },
  account: { title:"我的帳號", description:"變更自己的密碼與 Email；密碼與驗證碼由 CYID 帳號服務保管。" },
  audit: { title:"稽核紀錄", description:"檢視重要業務操作與設定變更；只有管理員與超級管理員可讀取詳細內容。" },
  backups: { title:"備份管理", description:"查看備份與副本狀態，建立手動備份或重試未完成的 GCS 副本。" },
  programs: { title:"CY 程式", description:"CY 程式功能、正式版本與使用入口；開發中的程式先提供功能介紹。" },
};

const baseNavigation: readonly NavigationGroup[] = [
  {
    key: "business", label: "業務模組",
    items: [
      { key: "customers", label: "客戶", href: "#customers" },
      { key: "items", label: "商品", href: "#items" },
      { key: "defects", label: "瑕疵", href: "#defects" },
      { key: "orders", label: "銷售工單", href: "#orders" },
      { key: "outsourcing", label: "委外", href: "#outsourcing" },
      { key: "worklogs", label: "工作日誌", href: "#worklogs" },
      { key: "erp-item-query", label: "ERP 查詢", href: "#erp-item-query" },
    ],
  },
  {
    key: "administration", label: "系統管理",
    dividerBefore: true,
    items: [
      { key: "identity", label: "帳號與權限", href: "#identity" },
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
  "account",
  "audit",
  "backups",
  "programs",
]);

function currentRoute(): AppRoute {
  const value = window.location.hash.replace(/^#/, "") as AppRoute;
  return routes.has(value) ? value : "account";
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
  const compact = useCompactLayout();
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
    const business = baseNavigation[0].items.filter((item) =>
      moduleCodesForRoute(item.key).some((code) => allowedModules.has(code)));
    const administration = baseNavigation[1].items.filter((item) => {
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
    const routeCodes = moduleCodesForRoute(routeNow);
    const adminOnly = routeNow === "audit" || routeNow === "identity";
    const adminAllowed = session.user.workspaceRole === "ADMIN" || session.user.workspaceRole === "SUPER_ADMIN";

    if (!window.location.hash) {
      const firstBusiness = baseNavigation[0].items.find((item) =>
        moduleCodesForRoute(item.key).some((code) => allowedModules.has(code)));
      window.location.hash = firstBusiness?.href ?? "#account";
      return;
    }

    if ((routeCodes.length && !routeCodes.some((code) => allowedModules.has(code))) || (adminOnly && !adminAllowed)
      || (routeNow === "backups" && session.user.workspaceRole !== "SUPER_ADMIN")) {
      cancel();
      guardedNavigation.replace("account");
      // A page opened by several grants (ERP 查詢) is named by its page title.
      const label = routeCodes.length > 1 ? PAGE_META[routeNow].title
        : CYWEB_MODULES.find(item => item.code === routeCodes[0])?.label;
      const revoked = routeCodes.some((code) => previous?.allowedModules.includes(code));
      notify(label
        ? revoked ? `「${label}」模組的使用權已被取消，已退出該模組並返回「我的帳號」。尚未儲存的內容不會自動送出。` : `你目前沒有「${label}」模組的使用權，已返回「我的帳號」。`
        : "你的管理權限已變更，已返回「我的帳號」。尚未儲存的內容不會自動送出。", "權限變更", { replace: true });
    }
  }, [moduleAccess, allowedModules, session.user.workspaceRole, guardedNavigation, cancel, notify, route]);

  // The grant this page is checked with: one the member holds (any of the page's grants opens it).
  const routeCodes = moduleCodesForRoute(route);
  const routeModuleCode = routeCodes.find((code) => allowedModules.has(code)) ?? routeCodes[0] ?? null;
  const routeAllowed = !routeModuleCode || allowedModules.has(routeModuleCode);
  useEffect(() => {
    const moduleCode = routeModuleCode;
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
  }, [route, routeAllowed, routeModuleCode, moduleAccess]);

  let content: React.ReactNode;
  const role = session.user.workspaceRole;
  const moduleCode = routeModuleCode;
  const adminAllowed = session.user.workspaceRole === "ADMIN" || session.user.workspaceRole === "SUPER_ADMIN";
  if ((route === "audit" || route === "identity") && !adminAllowed) {
    content = <Loading />;
  } else if (moduleCode && (!routeAllowed || routeAccess !== "allowed" || checkedRoute !== route)) {
    content = routeAccess === "denied"
      ? <section className="cy-op-panel"><h2>目前無法確認模組權限</h2><p>{moduleAccessError ?? "請重新整理頁面後再試。"}</p></section>
      : <Loading />;
  } else if (route === "customers") content = <WithModuleSettings key={route} role={role} label="客戶" only={["customer_category", "customer_status", "department"]}><CustomerOperationalPage /></WithModuleSettings>;
  else if (route === "items") content = <WithModuleSettings key={route} role={role} label="商品" only={["item_category"]}><ItemOperationalPage /></WithModuleSettings>;
  else if (route === "defects") content = <DefectOperationalPage />;
  else if (route === "orders") content = <SalesOrderOperationalPage />;
  else if (route === "outsourcing") content = <OutsourcingOperationalPage />;
  else if (route === "worklogs") content = <WithModuleSettings key={route} role={role} label="工作日誌" only={["worklog-categories", "worklog-platforms", "scoring"]}><WorkLogOperationalPage /></WithModuleSettings>;
  else if (route === "erp-item-query") content = <ErpItemQueryPage allowedModules={allowedModules} />;
  else if (route === "identity") content = <SharedIdentityPage session={session} />;
  else if (route === "account") content = <MyAccountPage session={session} />;
  else if (route === "programs") content = <ProgramCatalogPage />;
  else if (route === "backups") content = session.user.workspaceRole === "SUPER_ADMIN" ? <BackupOperationalPage /> : <section className="cy-op-panel">需要最高管理員權限。</section>;
  else content = <AuditOperationalPage />;

  return (
    <AppShell
      appName="CY Web"
      pageTitle={PAGE_META[route].title}
      pageDescription={PAGE_META[route].description}
      pageTools={route === "erp-item-query"
        ? <ErpAgentCredentialControl isSuperAdmin={session.user.workspaceRole === "SUPER_ADMIN"} />
        : undefined}
      subtitle="志遠企業管理系統"
      navigation={navigation}
      activeNavigationKey={route}
      onNavigate={item => { if (routes.has(item.key as AppRoute)) void guardedNavigation.request(item.key as AppRoute, "link"); }}
      appearance={compact ? <ThemeToggle iconOnly /> : <ThemeSwitch />}
      account={<AccountMenu displayName={session.user.displayName} employeeNo={session.user.employeeNo}
        role={session.user.workspaceRole} roleLabel={accountPermissionLabel(session.user.workspaceRole)} compact={compact}
        signingOut={signingOut} onAccount={() => void guardedNavigation.request("account", "link")} onLogout={() => void logout()} />}
    >
      {moduleAccessError && route === "account" ? <div className="cy-notice cy-notice-warning"><div className="cy-notice-title">模組權限狀態</div><div className="cy-notice-body">{moduleAccessError}</div></div> : null}
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

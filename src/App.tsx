import { routeHref } from "./runtime/navigation/route-params";
import { Loading } from "./ui/feedback/Loading";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError, apiRequest } from "./api/client";
import { usageRatio, type D1UsageReport } from "../shared/cloudflare-usage";
import { checkModuleAccess } from "./access/module-access-client";
import { AuthGate } from "./auth/AuthGate";
import type { AuthSession, WorkspaceRole } from "./auth/auth-client";
import { MyAccountPage, SharedIdentityPage } from "./identity/SharedIdentityPage";
import { effectiveModules, CYWEB_MODULES, moduleCodesForRoute, type CyWebModuleCode } from "../shared/modules";
import { verifiedProgramCatalog } from "../shared/program-catalog";
import type { NavigationGroup } from "./ui/foundation/navigation";
import { AppShell } from "./ui/shell/AppShell";
import { ThemeSwitch, ThemeToggle } from "./ui/foundation/ThemeToggle";
import { AccountMenu } from "./ui/shell/AccountMenu";
import { useCompactLayout } from "./ui/foundation/useCompactLayout";
import { ModuleSettingsButton } from "./runtime/modules/ModuleSettingsPanel";
import { AuditOperationalPage } from "./runtime/modules/AuditOperationalPage";
import { CustomerOperationalPage } from "./runtime/modules/CustomerOperationalPage";
import { DefectOperationalPage } from "./runtime/modules/DefectOperationalPage";
import { ERP_OPEN_CATEGORY_EVENT, ErpItemQueryPage } from "./runtime/modules/ErpItemQueryPage";
import { ERP_QUERY_DONE_EVENT, ErpPageVisibleContext, type ErpQueryDoneDetail } from "./runtime/modules/useErpJob";
import { useToastQueue } from "./ui/feedback/useToastQueue";
import { ErpHeldPrompt } from "./runtime/modules/ErpHeldPrompt";
import { ToastRegion } from "./ui/feedback/ToastRegion";
import {OrderingPage} from "./runtime/modules/OrderingPage";
import {StorePage} from "./runtime/modules/StorePage";
import { ErpAgentCredentialControl } from "./runtime/modules/ErpAgentCredentialControl";
import { ItemOperationalPage } from "./runtime/modules/ItemOperationalPage";
import { OutsourcingOperationalPage } from "./runtime/modules/OutsourcingOperationalPage";
import { SalesOrderOperationalPage } from "./runtime/modules/SalesOrderOperationalPage";
import { WorkLogOperationalPage } from "./runtime/modules/WorkLogOperationalPage";
import { BackupOperationalPage } from "./runtime/modules/BackupOperationalPage";
import { ProgramCatalogPage } from "./runtime/modules/ProgramCatalogPage";
import { HrOperationalPage } from "./runtime/modules/HrOperationalPage";
import { HrSettingsButton } from "./runtime/modules/HrSettingsButton";
import { UnsavedChangesBoundary, useNavigationGuard } from "./ui/foundation/useUnsavedChangesGuard";
import { createGuardedHashNavigation } from "./ui/foundation/guarded-hash-navigation";
import { FeedbackProvider, useFeedback, useFeedbackMessage } from "./ui/feedback/FeedbackProvider";

type AppRoute = "hr" | "customers" | "items" | "defects" | "orders" | "outsourcing" | "worklogs" | "erp-item-query" | "ordering" | "store" | "audit" | "identity" | "account" | "backups" | "programs";

// One source of truth for the topbar titles and on-demand module descriptions.
const PAGE_META: Record<AppRoute, { title: string; description: string }> = {
  hr: { title:"人事", description:"人事資料、年資特休與薪資紀錄" },
  customers: { title:"客戶", description:"客戶資料、聯絡人、拜訪與報價紀錄" },
  items: { title:"商品", description:"商品資料、品號、價格與單位換算" },
  defects: { title:"瑕疵", description:"瑕疵回報、處理進度與作廢" },
  orders: { title:"銷售工單", description:"銷售工單與出貨流程，正式單號由 ERP 提供" },
  outsourcing: { title:"委外/代工", description:"代工單、協力廠商、單價、BOM 與庫存" },
  worklogs: { title:"工作日誌", description:"填寫日誌、送審與評分統計" },
  "erp-item-query": { title:"ERP 查詢", description:"查閱 SMART ERP 資料，只讀不改" },
  ordering: {title:"叫貨",description:"叫貨草稿、送出、到貨紀錄與未到貨管理"},
  store: {title:"門市",description:"顧客訂購、取貨通知與黑名單"},
  identity: { title:"帳號與權限", description:"使用者、權限群組與系統安全" },
  account: { title:"我的帳號", description:"變更自己的密碼與 Email" },
  audit: { title:"異動紀錄", description:"誰在什麼時候改了什麼" },
  backups: { title:"備份管理", description:"備份狀態、手動備份與重試副本" },
  programs: { title:"CY 程式", description:"CY 程式的功能、版本與使用入口" },
};

const baseNavigation: readonly NavigationGroup[] = [
  {
    key: "erp-query", items: [
      { key: "erp-item-query", label: "ERP 查詢", href: "#erp-item-query" },
    ],
  },
  {
    key: "business", label: "業務模組",
    items: [
      { key: "customers", label: "客戶", href: "#customers" },
      { key: "items", label: "商品", href: "#items" },
      { key: "defects", label: "瑕疵", href: "#defects" },
      { key: "orders", label: "銷售工單", href: "#orders" },
      { key: "ordering", label: "叫貨", href: "#ordering" },
      { key: "store", label: "門市", href: "#store" },
      { key: "outsourcing", label: "委外/代工", href: "#outsourcing" },
      { key: "worklogs", label: "工作日誌", href: "#worklogs" },
      { key: "hr", label: "人事", href: "#hr" },
    ],
  },
  {
    key: "administration", label: "系統管理",
    dividerBefore: true,
    items: [
      { key: "identity", label: "帳號與權限", href: "#identity" },
      { key: "audit", label: "異動紀錄", href: "#audit" },
      { key: "backups", label: "備份管理", href: "#backups" },
    ],
  },
];

const programsNavigation: NavigationGroup = {
  key: "tools", label: "工具", items: [
    { key:"programs",label:"CY 程式",href:"#programs" },
    ...verifiedProgramCatalog.programs.filter(program => program.platform === "web" && !!program.websiteUrl)
      .map(program => ({ key:"web-"+program.id,label:program.navLabel ?? program.name,href:program.websiteUrl!,external:true })),
  ],
};

const routes = new Set<AppRoute>([
  "hr",
  "customers",
  "items",
  "defects",
  "orders",
  "outsourcing",
  "worklogs",
  "erp-item-query",
  "ordering",
  "store",
  "identity",
  "account",
  "audit",
  "backups",
  "programs",
]);

function currentRoute(): AppRoute {
  const hash = window.location.hash.replace(/^#/, "").split("?")[0];
  // 進貨輔助 is a category of ERP 查詢 since V0.9.41; its old link still opens it.
  const value = (hash === "restock-assist" ? "erp-item-query" : hash) as AppRoute;
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
  const [usageReport, setUsageReport] = useState<D1UsageReport | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageRequested, setUsageRequested] = useState(false);
  const [dismissedUsageDay, setDismissedUsageDay] = useState<string | null>(null);
  const refreshUsage = useCallback(async () => {
    setUsageLoading(true);
    try {
      const report = await apiRequest<D1UsageReport>("/api/business/usage/d1?days=7");
      setUsageReport(report); setUsageError(null);
    } catch (error) {
      setUsageError(error instanceof ApiClientError ? error.code : "USAGE_UNAVAILABLE");
      setUsageReport(null);
    } finally { setUsageLoading(false); }
  }, []);
  useEffect(() => { if (route !== "identity") setUsageRequested(false); }, [route]);
  useEffect(() => {
    if (session.user.workspaceRole !== "SUPER_ADMIN") return;
    void refreshUsage();
    const timer = window.setInterval(() => { void refreshUsage(); }, 30 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [session.user.workspaceRole, refreshUsage]);
  const previousAccess = useRef(moduleAccess);
  const [moduleAccessError, , setModuleAccessError] = useFeedbackMessage<string | null>(null);
  const [routeAccess, setRouteAccess] = useState<"idle" | "checking" | "allowed" | "denied">("idle");
  const [checkedRoute, setCheckedRoute] = useState<AppRoute | null>(null);
  const { canLeave, cancel } = useNavigationGuard();
  const compact = useCompactLayout();
  const pendingRecordHash = useRef<string | null>(null);
  const guardedNavigation = useMemo(() => createGuardedHashNavigation<AppRoute>({
    initial: currentRoute(), canLeave, commit: setRoute,
    write: (next, replace) => {
      const requested = pendingRecordHash.current;
      const href = requested && requested.slice(1).split("?")[0] === next ? requested : routeHref(next);
      if (replace) window.history.replaceState(null, "", href);
      else window.location.hash = href;
    },
  }), [canLeave]);

  const allowedModules = useMemo(
    // The grants in effect: 進貨輔助 counts only with ERP 商品查詢 and ERP 客戶查詢 (user 2026-10-21).
    () => new Set<CyWebModuleCode>(effectiveModules(moduleAccess?.allowedModules ?? [])),
    [moduleAccess],
  );

  const navigation = useMemo<readonly NavigationGroup[]>(() => {
    const erp = baseNavigation.find(group => group.key === "erp-query")!;
    const business = baseNavigation.find(group => group.key === "business")!;
    const administration = baseNavigation.find(group => group.key === "administration")!;
    const erpItems = erp.items.filter(item =>
      moduleCodesForRoute(item.key).some(code => allowedModules.has(code)));
    const businessItems = business.items.filter(item => item.key === "hr"
      ? session.user.workspaceRole === "SUPER_ADMIN"
      : moduleCodesForRoute(item.key).some(code => allowedModules.has(code)));
    const adminItems = administration.items.filter(item =>
      item.key === "backups" ? session.user.workspaceRole === "SUPER_ADMIN"
        : session.user.workspaceRole === "ADMIN" || session.user.workspaceRole === "SUPER_ADMIN");
    return [
      { ...erp, items: erpItems },
      { ...business, items: businessItems },
      { ...administration, items: adminItems },
      programsNavigation,
    ];
  }, [allowedModules, session.user.workspaceRole]);

  useEffect(() => {
    const handleHashChange = () => {
      pendingRecordHash.current = window.location.hash;
      void guardedNavigation.request(currentRoute(), "hash").finally(() => { pendingRecordHash.current = null; });
    };
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
      const erpAllowed = moduleCodesForRoute("erp-item-query").some(code => allowedModules.has(code));
      const firstBusiness = baseNavigation.find(group => group.key === "business")?.items.find(item =>
        moduleCodesForRoute(item.key).some(code => allowedModules.has(code)));
      window.location.hash = erpAllowed ? "#erp-item-query" : firstBusiness?.href ?? "#account";
      return;
    }

    if ((routeCodes.length && !routeCodes.some((code) => allowedModules.has(code))) || (adminOnly && !adminAllowed)
      || ((routeNow === "backups" || routeNow === "hr") && session.user.workspaceRole !== "SUPER_ADMIN")) {
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
  if ((route === "audit" || route === "identity") && !adminAllowed || (route === "hr" && role !== "SUPER_ADMIN")) {
    content = <Loading />;
  } else if (moduleCode && (!routeAllowed || routeAccess !== "allowed" || checkedRoute !== route)) {
    content = routeAccess === "denied"
      ? <section className="cy-op-panel"><h2>目前無法確認模組權限</h2><p>{moduleAccessError ?? "請重新整理頁面後再試。"}</p></section>
      : <Loading />;
  } else if (route === "hr") content = <HrOperationalPage />;
  else if (route === "customers") content = <CustomerOperationalPage role={role} />;
  else if (route === "items") content = <ItemOperationalPage canViewDefects={allowedModules.has("DEFECTS")} canViewCustomers={allowedModules.has("CUSTOMERS")} />;
  else if (route === "defects") content = <DefectOperationalPage />;
  else if (route === "orders") content = <SalesOrderOperationalPage />;
  else if (route === "outsourcing") content = <OutsourcingOperationalPage />;
  else if (route === "worklogs") content = <WorkLogOperationalPage />;
  else if (route === "erp-item-query") content = null; // the kept ERP 查詢 page below
  else if (route === "ordering") content = <OrderingPage />;
  else if (route === "store") content = <StorePage />;
  else if (route === "identity") content = <SharedIdentityPage session={session}
    showUsage={usageRequested && role === "SUPER_ADMIN"}
    usage={role === "SUPER_ADMIN" ? {report:usageReport,error:usageError,loading:usageLoading,onRefresh:refreshUsage} : undefined} />;
  else if (route === "account") content = <MyAccountPage session={session} />;
  else if (route === "programs") content = <ProgramCatalogPage />;
  else if (route === "backups") content = session.user.workspaceRole === "SUPER_ADMIN" ? <BackupOperationalPage session={session} /> : <section className="cy-op-panel">需要最高管理員權限。</section>;
  else content = <AuditOperationalPage role={role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN"} />;

  // ERP 查詢 stays mounted once opened (user 2026-10-27: switching modules must not close it); its
  // queries keep running and a finished one is announced while another module or category is open.
  const erpShown = route === "erp-item-query" && content === null;
  const erpAllowed = moduleCodesForRoute("erp-item-query").some(code => allowedModules.has(code));
  const [erpOpened, setErpOpened] = useState(false);
  useEffect(() => { if (erpShown) setErpOpened(true); }, [erpShown]);
  const { toasts, pushToast, dismissToast } = useToastQueue(10000);
  useEffect(() => {
    const done = (event: Event) => {
      const detail = (event as CustomEvent<ErpQueryDoneDetail>).detail;
      if (detail.visible) return;
      const failed = detail.status === "FAILED" || detail.status === "EXPIRED";
      const id = pushToast({
        tone: failed ? "danger" : "success",
        title: `${detail.label}查詢${failed ? "失敗" : detail.status === "NOT_FOUND" ? "完成（查無資料）" : "完成"}`,
        message: <>{failed && detail.message ? <span>{detail.message} </span> : null}
          <button className="cy-op-button compact" type="button" onClick={() => {
            dismissToast(id);
            void guardedNavigation.request(detail.route as AppRoute, "link").then(() =>
              window.dispatchEvent(new CustomEvent(ERP_OPEN_CATEGORY_EVENT, { detail: detail.key })));
          }}>查看</button></>,
      });
    };
    window.addEventListener(ERP_QUERY_DONE_EVENT, done);
    return () => window.removeEventListener(ERP_QUERY_DONE_EVENT, done);
  }, [pushToast, dismissToast, guardedNavigation]);

  const usageToday = usageReport?.today;
  const usageDate = usageToday?.date ?? "";
  const dismissKey = "cyweb:d1-usage-dismissed:" + usageDate;
  let dismissedInSession = false;
  if (usageDate) {
    try { dismissedInSession = window.sessionStorage.getItem(dismissKey) === "1"; } catch { /* blocked storage */ }
  }
  const readRatio = usageReport ? usageRatio(usageToday!.rowsRead, usageReport.limits.rowsReadPerDay) : 0;
  const writeRatio = usageReport ? usageRatio(usageToday!.rowsWritten, usageReport.limits.rowsWrittenPerDay) : 0;
  const isReadPrimary = readRatio >= writeRatio;
  const primaryKey = isReadPrimary ? "rowsRead" : "rowsWritten";
  const topDatabase = usageToday?.databases.reduce<typeof usageToday.databases[number] | undefined>(
    (top, db) => !top || db[primaryKey] > top[primaryKey] ? db : top, undefined);
  const databaseShare = topDatabase && usageToday?.[primaryKey]
    ? Math.round(topDatabase[primaryKey] / usageToday[primaryKey] * 100) : 0;
  const showUsageAlert = role === "SUPER_ADMIN" && !usageError && usageToday
    && usageToday.level !== "ok" && dismissedUsageDay !== usageDate && !dismissedInSession;
  const usageBanner = showUsageAlert
    ? <div role="status" className={"cy-notice cy-usage-alert " + (usageToday.level === "danger" ? "cy-notice-danger" : "cy-notice-warning")}>
      <span>今日 D1 {isReadPrimary ? "讀取" : "寫入"}已用 {Math.round(Math.max(readRatio,writeRatio)*100)}%
        {topDatabase && databaseShare ? "（" + topDatabase.name + " 占 " + databaseShare + "%）" : ""}
        ，每日 08:00（台灣時間）重置</span>
      <button className="cy-op-button compact" type="button" onClick={() => {
        setUsageRequested(true); void guardedNavigation.request("identity", "link");
      }}>查看</button>
      <button className="cy-op-button compact" type="button" aria-label="關閉用量警示" onClick={() => {
        try { window.sessionStorage.setItem(dismissKey, "1"); } catch { /* still dismiss in memory */ }
        setDismissedUsageDay(usageDate);
      }}>關閉</button>
    </div> : null;

  return (
    <AppShell
      systemNotice={usageBanner}
      appName="CY Web"
      pageTitle={PAGE_META[route].title}
      pageDescription={PAGE_META[route].description}
      pageTools={route === "hr" ? <HrSettingsButton />
        : route === "erp-item-query"
        ? <ErpAgentCredentialControl isSuperAdmin={session.user.workspaceRole === "SUPER_ADMIN"} />
        : route === "customers" ? <ModuleSettingsButton key={route} role={role} label="客戶" only={["customer_category","customer_status","department"]} />
        : route === "items" ? <ModuleSettingsButton key={route} role={role} label="商品" only={["item_category"]} />
        : route === "worklogs" ? <ModuleSettingsButton key={route} role={role} label="工作日誌" only={["worklog-categories","worklog-platforms","scoring"]} />
        : undefined}
      subtitle="志遠企業管理系統"
      navigation={navigation}
      activeNavigationKey={route}
      onNavigate={item => { if (routes.has(item.key as AppRoute)) void guardedNavigation.request(item.key as AppRoute, "link"); }}
      appearance={compact ? <ThemeToggle iconOnly /> : <ThemeSwitch />}
      account={<AccountMenu displayName={session.user.displayName}
        role={session.user.workspaceRole} roleLabel={accountPermissionLabel(session.user.workspaceRole)} compact={compact}
        signingOut={signingOut} onAccount={() => void guardedNavigation.request("account", "link")} onLogout={() => void logout()} />}
    >
      {moduleAccessError && route === "account" ? <div className="cy-notice cy-notice-warning"><div className="cy-notice-title">模組權限狀態</div><div className="cy-notice-body">{moduleAccessError}</div></div> : null}
      {content}
      {erpAllowed && (erpOpened || erpShown) && <div className="cy-kept-page" hidden={!erpShown}>
        <ErpPageVisibleContext.Provider value={erpShown}><ErpItemQueryPage allowedModules={allowedModules} /></ErpPageVisibleContext.Provider>
      </div>}
      <ToastRegion toasts={toasts} onDismiss={dismissToast} label="ERP 查詢通知" />
      <ErpHeldPrompt />
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

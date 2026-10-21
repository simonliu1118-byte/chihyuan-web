import {Field,CheckField,FormSection} from "../ui/forms/Field";
import { Loading } from "../ui/feedback/Loading";
import { CloudflareUsagePanel, type CloudflareUsagePanelProps } from "./CloudflareUsagePanel";
import { enterAdvancesFields, enterAdvancesThenSubmits } from "../ui/foundation/enter-advance";
import { FormEvent, type ReactNode, useCallback, useEffect, useId, useMemo, useState } from "react";
import { Dialog, Drawer } from "../ui/overlays/Dialog";
import { useConfirmation } from "../ui/overlays/useConfirmation";
import { useFormPrompt } from "../ui/overlays/useFormPrompt";
import { useUnsavedChangesGuard } from "../ui/foundation/useUnsavedChangesGuard";
import { TextInput } from "../ui/primitives/TextInput";
import { PasswordInput } from "../ui/forms/PasswordInput";
import { StatusChip } from "../ui/primitives/StatusChip";
import { StatusFilter } from "../ui/data/StatusFilter";
import { NextStep } from "../ui/feedback/NextStep";
import { ApiClientError } from "../api/client";
import { chineseMessage } from "../api/error-messages";
import { FeedbackBanner, useFeedbackMessage } from "../ui/feedback/FeedbackProvider";
import { usePendingAction } from "../ui/feedback/usePendingAction";
import {
  createModuleAccessGroup,
  deleteModuleAccessGroup,
  loadModuleAccessAdminSnapshot,
  setEmployeeModuleAccess,
  setEmployeeModuleGroup,
  syncModuleAccessGroup,
  updateModuleAccessGroup,
  type ModuleAccessAdminSnapshot,
  type ModuleAccessGroup,
} from "../access/module-access-client";
import type { AuthSession } from "../auth/auth-client";
import { MODULE_REQUIREMENTS, moduleChangeProblem, moduleLabel, moduleLockReason, modulesDroppedWith, modulesRequiring } from "../../shared/modules";
import type { StatusTone } from "../runtime/modules/status-flow";
import {
  changeOwnPassword,
  confirmHighestAuthorityTransfer,
  confirmOwnEmailChange,
  createIdentityEmployee,
  deleteIdentityEmployee,
  forceEmployeeEmailRecovery,
  loadIdentityAdminSnapshot,
  loadSecurityPolicy,
  registerWorkspaceApplication,
  resendActivatedEmailVerification,
  resendEmployeeEmailVerification,
  setEmployeeApplicationAccess,
  setEmployeeIdentityAdmin,
  startCurrentEmailVerification,
  startHighestAuthorityTransfer,
  startOwnEmailChange,
  updateIdentityEmployee,
  updateSecurityPolicy,
  type IdentityAdminSnapshot,
  type IdentityEmployeeRow,
  type SecurityPolicyView,
} from "./identity-client";

function messageOf(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  return chineseMessage(error instanceof Error ? error.message : undefined);
}

function permissionLabel(role: "SUPER_ADMIN" | "ADMIN" | "USER"): string {
  if (role === "SUPER_ADMIN") return "超級管理員";
  if (role === "ADMIN") return "管理員";
  return "一般使用者";
}

/** Account lifecycle as one status, coloured with the shared status language. */
type AccountState = "pending" | "unverified" | "active" | "disabled";
const accountStates: readonly { code: AccountState; label: string; tone: StatusTone }[] = [
  { code: "pending", label: "尚未啟用", tone: "info" },
  { code: "unverified", label: "Email 待驗證", tone: "warning" },
  { code: "active", label: "啟用", tone: "success" },
  { code: "disabled", label: "停用", tone: "neutral" },
];
function accountState(row: IdentityEmployeeRow): AccountState {
  if (!row.activated_at) return "pending";
  if (row.enabled !== 1) return "disabled";
  return row.email_verified_at ? "active" : "unverified";
}
const stateOf = (row: IdentityEmployeeRow) => accountStates.find((state) => state.code === accountState(row))!;

/** Blocking notice before the page reloads into a fresh sign-in. */
function useReloadNotice() {
  const { confirm, confirmationDialog } = useConfirmation();
  const reloadAfter = useCallback(async (title: string, description: string) => {
    await confirm({ title, description, confirmLabel: "重新登入", cancelLabel: "關閉" });
    window.location.reload();
  }, [confirm]);
  return { reloadAfter, reloadDialog: confirmationDialog };
}

// ---------- 我的帳號 ----------

function SelfServicePanel({ session }: { session: AuthSession }) {
  const [dialog, setDialog] = useState<"password" | "email" | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [verifyingCurrentEmail, setVerifyingCurrentEmail] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage, reportError, messageTone] = useFeedbackMessage<string | null>(null);
  const { reloadAfter, reloadDialog } = useReloadNotice();
  const validLength = Array.from(newPassword).length >= 8 && Array.from(newPassword).length <= 16;
  const matching = newPassword.length > 0 && newPassword === confirmPassword;
  const countdown = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    if (!resendAt || now >= resendAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [resendAt, now >= resendAt]);

  const closeDialog = () => {
    if (busy) return;
    setDialog(null); setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    setNewEmail(""); setEmailPassword(""); setChallengeId(null); setOtp("");
    setVerifyingCurrentEmail(false); setMessage(null);
  };

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (!validLength || !matching || !currentPassword) return;
    setBusy(true); setMessage(null);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      await reloadAfter("密碼已變更", "既有登入已撤銷，請用新密碼重新登入。");
    } catch (error) { reportError(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function startEmail(event?: FormEvent) {
    event?.preventDefault();
    if (busy || countdown > 0) return;
    setBusy(true); setMessage(null);
    try {
      const result = await startOwnEmailChange(emailPassword, newEmail);
      setChallengeId(result.verification.challengeId);
      setNow(Date.now()); setResendAt(Date.now() + 60000);
      setMessage("驗證碼已寄出，請輸入 Email 中的 6 位數驗證碼。");
    } catch (error) { reportError(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function verifyCurrentEmail() {
    if (busy || countdown > 0) return;
    setDialog("email"); setBusy(true); setMessage(null); setVerifyingCurrentEmail(true);
    try {
      const result = await startCurrentEmailVerification();
      setChallengeId(result.verification.challengeId);
      setNow(Date.now()); setResendAt(Date.now() + 60000);
      setMessage(result.reused ? "沿用已寄出的驗證碼，請輸入 6 位數驗證碼。" : "驗證碼已寄至目前 Email。");
    } catch (error) { setChallengeId(null); reportError(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function confirmEmail(event: FormEvent) {
    event.preventDefault();
    if (!challengeId || !/^\d{6}$/.test(otp)) return;
    setBusy(true); setMessage(null);
    try {
      await confirmOwnEmailChange(challengeId, otp);
      await reloadAfter(verifyingCurrentEmail ? "Email 驗證完成" : "Email 已更新", "請重新登入。");
    } catch (error) { reportError(messageOf(error)); }
    finally { setBusy(false); }
  }

  return <>
    {reloadDialog}
    <section className="cy-op-panel cy-my-account">
      <h2>{session.user.displayName} <span>{session.user.employeeNo}</span> <span>{permissionLabel(session.user.workspaceRole)}</span></h2>
      <div className="cy-my-account-row">
        <strong>Email</strong><span>{session.user.emailVerified ? "已驗證" : "待驗證"}</span>
        {session.user.emailVerified
          ? <button type="button" className="cy-op-button" onClick={() => setDialog("email")}>變更</button>
          : <button type="button" className="cy-op-button" disabled={busy} onClick={() => void verifyCurrentEmail()}>寄送驗證碼</button>}
      </div>
      <div className="cy-my-account-row">
        <strong>密碼</strong><span>••••••••</span>
        <button type="button" className="cy-op-button" onClick={() => setDialog("password")}>變更</button>
      </div>
    </section>
    <Dialog open={dialog === "password"} title="變更密碼" size="small" dismissible={!busy} onClose={closeDialog}>
      <FeedbackBanner message={message} tone={messageTone} />
      <form onKeyDown={enterAdvancesThenSubmits} className="cy-op-form" onSubmit={submitPassword} noValidate>
    <FormSection>
        <Field  label="目前密碼" size="m" required><PasswordInput value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoComplete="current-password" /></Field>
        <Field  label="新密碼" size="m" required><PasswordInput value={newPassword} onChange={event => setNewPassword(event.target.value)} autoComplete="new-password" /></Field>
        <Field  label="確認新密碼" size="m" required><PasswordInput value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" /></Field>
        <div className="cy-password-checks" aria-live="polite">
          <span className={validLength ? "valid" : ""}>{validLength ? "✓" : "○"} 8～16 字元</span>
          <span className={matching ? "valid" : ""}>{matching ? "✓" : "○"} 兩次輸入相同</span>
        </div>
        <div className="cy-op-form-footer">
          <button type="button" className="cy-op-button" onClick={closeDialog} disabled={busy}>取消</button>
          <button className="cy-op-button primary" disabled={busy || !currentPassword || !validLength || !matching}>變更密碼</button>
        </div>
      
    </FormSection>
  </form>
    </Dialog>
    <Dialog open={dialog === "email"} title={verifyingCurrentEmail ? "驗證目前 Email" : "變更 Email"} size="small" dismissible={!busy} onClose={closeDialog}>
      <FeedbackBanner message={message} tone={messageTone} />
      {!challengeId && verifyingCurrentEmail ? <div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={closeDialog}>取消</button><button type="button" className="cy-op-button primary" disabled={busy || countdown > 0} onClick={() => void verifyCurrentEmail()}>{countdown > 0 ? String(countdown) + " 秒後可重新寄送" : "重新寄送驗證碼"}</button></div> : !challengeId ? <form onKeyDown={enterAdvancesThenSubmits} className="cy-op-form" onSubmit={startEmail}>
    <FormSection>
        <Field  label="新 Email" size="m" required><input className="cy-op-input" type="email" value={newEmail} onChange={event => setNewEmail(event.target.value)} /></Field>
        <Field  label="目前密碼" size="m" required><PasswordInput value={emailPassword} onChange={event => setEmailPassword(event.target.value)} autoComplete="current-password" /></Field>
        <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={closeDialog}>取消</button><button className="cy-op-button primary" disabled={busy || countdown > 0}>{countdown > 0 ? `${countdown} 秒後可重新寄送` : "寄送驗證碼"}</button></div>
      
    </FormSection>
  </form> : <form onKeyDown={enterAdvancesThenSubmits} className="cy-op-form" onSubmit={confirmEmail}>
    <FormSection>
        <Field  label="6 位數驗證碼" size="m" required><input className="cy-op-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} /></Field>
        <div className="cy-op-form-footer">
          <button type="button" className="cy-op-button" disabled={busy} onClick={() => { if (verifyingCurrentEmail) { closeDialog(); } else { setChallengeId(null); setOtp(""); setMessage(null); } }}>{verifyingCurrentEmail ? "關閉" : "返回"}</button>
          <button type="button" className="cy-op-button" disabled={busy || countdown > 0} onClick={() => void (verifyingCurrentEmail ? verifyCurrentEmail() : startEmail())}>{countdown > 0 ? String(countdown) + " 秒後可重新寄送" : "重新寄送"}</button>
          <button className="cy-op-button primary" disabled={busy || otp.length !== 6}>確認</button>
        </div>
      
    </FormSection>
  </form>}
    </Dialog>
  </>;
}

// ---------- 使用者：可編輯的使用權總表＋個人抽屜 ----------

interface UserWorkspaceProps {
  snapshot: IdentityAdminSnapshot;
  session: AuthSession;
  refresh: () => Promise<void>;
}

/** One column of the access table: another CY system, or a CY Web module. */
interface AccessColumn {
  key: string;
  label: string;
  group: "系統使用權" | "業務模組" | "ERP 查詢";
  kind: "app" | "module";
  /** The grants this module needs too (進貨輔助, user 2026-10-21), shown by the column. */
  hint?: string;
  /** How the column relates to a required grant: the grant that needs others, or one of those it needs. */
  role?: "dependent" | "required";
  code: string;
  disabledReason?: string;
}

type ModuleCode = Parameters<typeof setEmployeeModuleAccess>[1];

function UserWorkspace({ snapshot, session, refresh }: UserWorkspaceProps) {
  const isSuperAdmin = session.user.workspaceRole === "SUPER_ADMIN";
  const canIdentityAdmin = isSuperAdmin || session.user.isIdentityAdmin;
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [view, setView] = useState<"people" | "groups">("people");
  const [moduleView, setModuleView] = useState<ModuleAccessAdminSnapshot | null>(null);
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const [message, setMessage, reportError, messageTone] = useFeedbackMessage<string | null>(null);
  const { confirm, confirmationDialog } = useConfirmation();
  const [createOpen, setCreateOpen] = useState(false);
  // A newly created account opens once the refreshed snapshot contains it.
  const [openNo, setOpenNo] = useState<string | null>(null);
  useEffect(() => {
    if (!openNo) return;
    const row = snapshot.employees.find((item) => item.employee_no === openNo);
    if (row) { setDrawerId(row.employee_id); setOpenNo(null); }
  }, [snapshot, openNo]);

  const loadModules = useCallback(async () => {
    if (!canIdentityAdmin) return;
    try { setModuleView(await loadModuleAccessAdminSnapshot()); }
    catch (error) { reportError(messageOf(error)); }
  }, [canIdentityAdmin, reportError]);
  useEffect(() => { void loadModules(); }, [loadModules]);

  const columns = useMemo<AccessColumn[]>(() => {
    if (!canIdentityAdmin) return [];
    const apps = snapshot.applications.filter((app) => app.core_access_locked !== 1).map((app): AccessColumn => ({
      key: `app:${app.application_id}`, label: app.display_name, group: "系統使用權", kind: "app", code: app.application_id,
      disabledReason: app.enabled === 1 ? undefined : "系統已停用",
    }));
    const modules = (moduleView?.modules ?? []).map((module): AccessColumn => {
      const needs = MODULE_REQUIREMENTS[module.code as ModuleCode];
      const neededBy = modulesRequiring(module.code as ModuleCode);
      return {
        key: `module:${module.code}`, label: module.label, group: module.code.startsWith("ERP_") ? "ERP 查詢" : "業務模組", kind: "module", code: module.code,
        hint: needs ? `需先開啟${needs.map((need) => `「${moduleLabel(need)}」`).join("＋")}` : neededBy.length ? `${neededBy.map(moduleLabel).join("、")}的前提` : undefined,
        role: needs ? "dependent" : neededBy.length ? "required" : undefined,
      };
    });
    // A grant with requirements sits right after them (user 2026-10-21: the 進貨輔助 prerequisites must be easy to see).
    const erp = modules.filter((column) => column.group === "ERP 查詢");
    const linked = erp.filter((column) => column.role === "required").concat(erp.filter((column) => column.role === "dependent"));
    return [...apps, ...modules.filter((column) => column.group === "業務模組"), ...linked, ...erp.filter((column) => !column.role)];
  }, [canIdentityAdmin, snapshot.applications, moduleView]);
  const groups = useMemo(() => {
    const result: { group: AccessColumn["group"]; span: number }[] = [];
    for (const column of columns) {
      const last = result[result.length - 1];
      if (last?.group === column.group) last.span++; else result.push({ group: column.group, span: 1 });
    }
    return result;
  }, [columns]);

  const appAccess = useMemo(() => new Set(snapshot.directAccess.filter((row) => row.enabled === 1).map((row) => `${row.employee_id}:${row.application_id}`)), [snapshot.directAccess]);
  const moduleAccess = useMemo(() => new Set((moduleView?.grants ?? []).filter((row) => row.enabled === 1).map((row) => `${row.employee_id}:${row.module_code}`)), [moduleView]);
  const allowed = (employee: IdentityEmployeeRow, column: AccessColumn) => employee.workspace_role === "SUPER_ADMIN"
    || (column.kind === "app" ? appAccess : moduleAccess).has(`${employee.employee_id}:${column.code}`);
  const groupOf = useMemo(() => new Map((moduleView?.memberships ?? []).flatMap((row) => {
    const group = moduleView?.groups.find((item) => item.id === row.group_id);
    return group ? [[row.employee_id, group] as const] : [];
  })), [moduleView]);
  /** Read-only reasons that do not depend on 權限群組. */
  const baseLock = (employee: IdentityEmployeeRow, column: AccessColumn) => employee.workspace_role === "SUPER_ADMIN" ? "超級管理員固定可用"
    : employee.employee_id === session.user.employeeId ? "自己的使用權由其他管理員設定" : column.disabledReason ?? null;
  const heldModules = (employee: IdentityEmployeeRow) => new Set((moduleView?.grants ?? [])
    .filter((row) => row.enabled === 1 && row.employee_id === employee.employee_id).map((row) => row.module_code as string));
  /** Why a cell is read-only, or null when it can be changed; a group decides all of its members' access. */
  const lockReason = (employee: IdentityEmployeeRow, column: AccessColumn) => baseLock(employee, column)
    ?? (groupOf.has(employee.employee_id) ? `由群組「${groupOf.get(employee.employee_id)!.name}」設定` : null)
    ?? (column.kind === "module" ? moduleLockReason(heldModules(employee), column.code as ModuleCode) : null);

  /** Sets one access cell; module grants update in place, system access reloads the snapshot. */
  const setAccess = useCallback(async (employee: IdentityEmployeeRow, column: AccessColumn, next: boolean) => {
    const cell = `${employee.employee_id}:${column.key}`;
    setSaving((current) => new Set(current).add(cell));
    try {
      if (column.kind === "app") { await setEmployeeApplicationAccess(employee.employee_id, column.code, next); await refresh(); }
      else {
        // Required grants are checked before saving; the server refuses the same (shared rule). Off
        // takes the grants that need this one off too (user 2026-10-21), as the server does.
        const problem = moduleChangeProblem(heldModules(employee), column.code as ModuleCode, next);
        if (problem) { reportError(`${employee.name}：${problem}`); return false; }
        const result = await setEmployeeModuleAccess(employee.employee_id, column.code as ModuleCode, next);
        const changed = [column.code as ModuleCode, ...(result.alsoDisabled ?? [])];
        const now = new Date().toISOString();
        setModuleView((view) => view && {
          ...view,
          grants: [...view.grants.filter((row) => !(row.employee_id === employee.employee_id && changed.includes(row.module_code))),
            ...changed.map((code) => ({ employee_id: employee.employee_id, module_code: code, enabled: code === column.code && next ? 1 : 0, updated_at: now }))],
        });
        if (result.alsoDisabled?.length) return result.alsoDisabled.map(moduleLabel);
      }
      return true;
    } catch (error) { reportError(`${employee.name}「${column.label}」：${messageOf(error)}`); return false; }
    finally { setSaving((current) => { const copy = new Set(current); copy.delete(cell); return copy; }); }
  }, [refresh, reportError, moduleView]);

  /** Both snapshots: a group change touches CY Web modules and CYID system access. */
  const reloadAll = useCallback(async () => { await Promise.all([loadModules(), refresh()]); }, [loadModules, refresh]);

  /** Joins a group (its systems and modules replace the person's) or leaves it (current access stays as personal settings). */
  async function setGroup(employee: IdentityEmployeeRow, groupId: number | null, ask = true) {
    const group = groupId === null ? null : moduleView?.groups.find((item) => item.id === groupId) ?? null;
    if (ask && group && !await confirm({ title: `${employee.name} 加入「${group.name}」`, confirmLabel: "加入群組",
      description: "加入後系統使用權與 CY Web 模組使用權都改成群組的設定，不能個別修改；之後移出群組，會保留當時的設定成為個人設定。" })) return false;
    const cell = `${employee.employee_id}:group`;
    setSaving((current) => new Set(current).add(cell)); setMessage(null);
    try {
      const result = await setEmployeeModuleGroup(employee.employee_id, groupId);
      await reloadAll();
      if (result.applicationSyncFailed.length) reportError(`${employee.name} 已加入「${group?.name}」，模組已套用，但系統使用權未能套用；請到「權限群組」按「重新套用」。`);
      else setMessage(group ? `${employee.name} 已加入「${group.name}」，使用權已套用。` : `${employee.name} 已移出群組，目前的使用權保留為個人設定。`);
      return true;
    } catch (error) { reportError(`${employee.name}：${messageOf(error)}`); return false; }
    finally { setSaving((current) => { const copy = new Set(current); copy.delete(cell); return copy; }); }
  }

  async function toggleCell(employee: IdentityEmployeeRow, column: AccessColumn, next: boolean) {
    setMessage(null);
    const done = await setAccess(employee, column, next);
    if (done) setMessage(`${employee.name}「${column.label}」${next ? "已允許" : "已取消"}${Array.isArray(done) ? `，「${done.join("」、「")}」也一併取消` : ""}，立即生效。`);
  }

  const counts = useMemo(() => {
    const result: Partial<Record<string, number>> = {};
    for (const row of snapshot.employees) result[accountState(row)] = (result[accountState(row)] ?? 0) + 1;
    return result;
  }, [snapshot.employees]);
  const rows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return snapshot.employees.filter((row) => (!stateFilter || accountState(row) === stateFilter)
      && (!keyword || [row.employee_no, row.name, row.email_normalized].some((value) => value.toLowerCase().includes(keyword))));
  }, [snapshot.employees, query, stateFilter]);
  const drawerEmployee = snapshot.employees.find((row) => row.employee_id === drawerId) ?? null;

  /** Applies several cell changes one by one and reports how many succeeded. */
  async function applyChanges(changes: readonly { employee: IdentityEmployeeRow; column: AccessColumn; next: boolean }[], what: string) {
    setMessage(null);
    let done = 0;
    for (const change of changes) if (await setAccess(change.employee, change.column, change.next)) done++;
    if (done === changes.length) setMessage(changes.length ? `${what}：已更新 ${done} 項。` : `${what}：沒有需要變更的項目。`);
    else reportError(`${what}：${changes.length} 項中有 ${changes.length - done} 項未完成，請檢查後再試。`);
  }

  /** A source in a group means joining that group; otherwise its personal settings are copied cell by cell. */
  async function copyFrom(target: IdentityEmployeeRow, source: IdentityEmployeeRow) {
    const sourceGroup = groupOf.get(source.employee_id) ?? null;
    const targetGroup = groupOf.get(target.employee_id) ?? null;
    if (sourceGroup) {
      if (targetGroup?.id === sourceGroup.id) setMessage(`${target.name} 已經在「${sourceGroup.name}」。`);
      else await setGroup(target, sourceGroup.id, false);
      return;
    }
    // Leaving a group keeps the target's access, so the current view still describes it.
    if (targetGroup && !await setGroup(target, null, false)) return;
    const changes = columns.filter((column) => !baseLock(target, column) && allowed(target, column) !== allowed(source, column))
      .map((column) => ({ employee: target, column, next: allowed(source, column) }));
    await applyChanges(changes, `${target.name} 套用 ${source.name} 的使用權`);
  }

  const busyAny = saving.size > 0;
  const moduleGroups = moduleView?.groups ?? [];
  const groupControl = (employee: IdentityEmployeeRow) => {
    if (employee.workspace_role === "SUPER_ADMIN") return <span className="cy-access-muted">—</span>;
    const current = groupOf.get(employee.employee_id) ?? null;
    if (employee.employee_id === session.user.employeeId || !moduleGroups.length) return <span className="cy-access-muted">{current?.name ?? "個人設定"}</span>;
    return <GroupSelect employee={employee} groups={moduleGroups} current={current} saving={saving.has(`${employee.employee_id}:group`)} onChange={setGroup} />;
  };
  const switcher = canIdentityAdmin ? <div className="cy-segmented" role="group" aria-label="檢視">
    <button type="button" aria-pressed={view === "people"} onClick={() => setView("people")}>人員</button>
    <button type="button" aria-pressed={view === "groups"} onClick={() => setView("groups")}>權限群組</button>
  </div> : null;
  if (view === "groups" && moduleView) return <GroupWorkspace snapshot={snapshot} session={session} view={moduleView} columns={columns} reload={reloadAll} switcher={switcher} />;
  return <>
    {confirmationDialog}
    {createOpen ? <CreateUserDialog canIdentityAdmin={canIdentityAdmin} onClose={() => setCreateOpen(false)}
      onCreated={async (employeeNo, done) => { setCreateOpen(false); setMessage(done); setOpenNo(employeeNo); await refresh(); }}
      reportError={reportError} /> : null}
    {drawerEmployee ? <UserDrawer key={drawerEmployee.employee_id} employee={drawerEmployee} snapshot={snapshot} session={session} refresh={refresh}
      columns={columns} allowed={allowed} lockReason={lockReason} saving={saving} onToggle={toggleCell} onCopy={copyFrom}
      group={groupOf.get(drawerEmployee.employee_id) ?? null} groupControl={groupControl(drawerEmployee)}
      onClose={() => setDrawerId(null)} onDeleted={() => setDrawerId(null)} /> : null}

    <FeedbackBanner message={message} tone={messageTone} />
    <section className="cy-op-panel cy-identity-table-panel">
      <div className="cy-identity-table-toolbar">
        {switcher}
        <button type="button" className="cy-op-button primary" onClick={() => setCreateOpen(true)}>＋ 新增使用者</button>
        <input className="cy-op-input" type="search" aria-label="搜尋使用者" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋編號、姓名、Email" />
        <StatusFilter label="帳號狀態" options={accountStates} counts={counts} value={stateFilter} onChange={setStateFilter} />
        <span className="cy-md-count">{busyAny ? <Loading inline /> : `共 ${rows.length} 位`}</span>
      </div>
      {canIdentityAdmin && !moduleView ? <Loading /> : <div className="cy-identity-access-scroll">
        <table className="cy-op-table cy-identity-access-table">
          <thead>
            <tr>
              <th rowSpan={columns.length ? 2 : 1} className="cy-access-person">使用者</th>
              <th rowSpan={columns.length ? 2 : 1}>狀態</th>
              <th rowSpan={columns.length ? 2 : 1} className="cy-access-role">權限</th>
              {canIdentityAdmin ? <th rowSpan={columns.length ? 2 : 1} className="cy-access-role">權限群組</th> : null}
              {groups.map((group) => <th key={group.group} colSpan={group.span} className="cy-access-group">{group.group}</th>)}
            </tr>
            {columns.length ? <tr>{columns.map((column) => <th key={column.key} className={`cy-access-col${column.role ? ` cy-access-${column.role}` : ""}`} title={column.hint}>
              {column.label}{column.hint ? <small className="cy-access-col-hint">{column.hint}</small> : null}
            </th>)}</tr> : null}
          </thead>
          <tbody>{rows.map((employee) => {
            const state = stateOf(employee);
            const own = employee.employee_id === session.user.employeeId;
            return <tr key={employee.employee_id}>
              <th scope="row" className="cy-access-person">
                <button type="button" className="cy-access-person-button" onClick={() => setDrawerId(employee.employee_id)}>
                  <strong>{employee.name}{own ? "（你）" : ""}</strong>
                  <span><span className="cy-mono">{employee.employee_no}</span>{employee.identity_admin === 1 ? " · 帳號管理員" : ""}</span>
                </button>
              </th>
              <td><StatusChip tone={state.tone}>{state.label}</StatusChip></td>
              <td className="cy-access-role"><RoleCell employee={employee} session={session} refresh={refresh} onError={reportError} onSaved={setMessage} /></td>
              {canIdentityAdmin ? <td className="cy-access-role">{groupControl(employee)}</td> : null}
              {columns.map((column) => {
                const reason = lockReason(employee, column);
                const cell = `${employee.employee_id}:${column.key}`;
                return <td key={column.key} className={`cy-access-cell${column.role ? ` cy-access-${column.role}` : ""}`}>
                  {saving.has(cell) ? <span className="cy-loading-spinner" role="status" aria-label="儲存中" />
                    : <input type="checkbox" checked={allowed(employee, column)} disabled={!!reason} title={reason ?? `${employee.name}「${column.label}」`}
                        aria-label={`${employee.name}「${column.label}」`} onChange={(event) => void toggleCell(employee, column, event.target.checked)} />}
                </td>;
              })}
            </tr>;
          })}</tbody>
        </table>
        {rows.length === 0 ? <div className="cy-op-empty">沒有符合條件的使用者。</div> : null}
      </div>}
    </section>
  </>;
}

/** Role select in the table; only where the current admin may change it. */
function RoleCell({ employee, session, refresh, onError, onSaved }: {
  employee: IdentityEmployeeRow; session: AuthSession; refresh: () => Promise<void>;
  onError: (message: string) => void; onSaved: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const isSuperAdmin = session.user.workspaceRole === "SUPER_ADMIN";
  const canIdentityAdmin = isSuperAdmin || session.user.isIdentityAdmin;
  const editable = canIdentityAdmin && manageableBy(session, employee) && employee.identity_admin !== 1;
  if (!editable) return <span>{permissionLabel(employee.workspace_role)}</span>;
  async function change(next: "USER" | "ADMIN") {
    setBusy(true);
    try { await updateIdentityEmployee(employee.employee_id, { roleKey: next, revision: employee.revision }); await refresh(); onSaved(`${employee.name} 已改為${permissionLabel(next)}。`); }
    catch (error) { onError(messageOf(error)); }
    finally { setBusy(false); }
  }
  return <select className="cy-op-input compact" aria-label={`${employee.name} 的權限`} value={employee.role_key} disabled={busy}
    aria-busy={busy || undefined} onChange={(event) => void change(event.target.value as "USER" | "ADMIN")}>
    <option value="USER">一般使用者</option><option value="ADMIN">管理員</option></select>;
}

/** 權限群組 select: 個人設定 or one group (one group per person). */
function GroupSelect({ employee, groups, current, saving, onChange }: {
  employee: IdentityEmployeeRow; groups: readonly ModuleAccessGroup[]; current: ModuleAccessGroup | null; saving: boolean;
  onChange: (employee: IdentityEmployeeRow, groupId: number | null) => Promise<boolean>;
}) {
  return <select className="cy-op-input compact" aria-label={`${employee.name} 的權限群組`} value={current?.id ?? ""} disabled={saving}
    aria-busy={saving || undefined} onChange={(event) => void onChange(employee, event.target.value ? Number(event.target.value) : null)}>
    <option value="">個人設定</option>
    {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
  </select>;
}

function manageableBy(session: AuthSession, row: IdentityEmployeeRow): boolean {
  if (row.workspace_role === "SUPER_ADMIN" || row.employee_id === session.user.employeeId) return false;
  if (session.user.workspaceRole === "SUPER_ADMIN") return true;
  if (session.user.isIdentityAdmin) return row.identity_admin !== 1;
  return row.workspace_role === "USER" && row.identity_admin !== 1;
}

/** One person's account actions and access, opened from the table (and the way to edit on a phone). */
function UserDrawer({ employee, snapshot, session, refresh, columns, allowed, lockReason, saving, onToggle, onCopy, group, groupControl, onClose, onDeleted }: {
  employee: IdentityEmployeeRow;
  snapshot: IdentityAdminSnapshot;
  session: AuthSession;
  refresh: () => Promise<void>;
  columns: readonly AccessColumn[];
  allowed: (employee: IdentityEmployeeRow, column: AccessColumn) => boolean;
  lockReason: (employee: IdentityEmployeeRow, column: AccessColumn) => string | null;
  saving: ReadonlySet<string>;
  onToggle: (employee: IdentityEmployeeRow, column: AccessColumn, next: boolean) => Promise<void>;
  onCopy: (target: IdentityEmployeeRow, source: IdentityEmployeeRow) => Promise<void>;
  group: ModuleAccessGroup | null;
  groupControl: ReactNode;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const isSuperAdmin = session.user.workspaceRole === "SUPER_ADMIN";
  const canIdentityAdmin = isSuperAdmin || session.user.isIdentityAdmin;
  const [busy, setBusy] = useState(false);
  const { pending, track } = usePendingAction();
  const [message, setMessage, reportError, messageTone] = useFeedbackMessage<string | null>(null);
  const { confirm, confirmationDialog } = useConfirmation();
  const { ask, promptDialog } = useFormPrompt();
  const [transferOpen, setTransferOpen] = useState(false);
  const [copySource, setCopySource] = useState("");

  const own = employee.employee_id === session.user.employeeId;
  const rowManageable = manageableBy(session, employee);
  const isPending = !employee.activated_at;
  const state = stateOf(employee);
  const canRecover = canIdentityAdmin && employee.workspace_role !== "SUPER_ADMIN" && !own && !isPending;
  const canEditAccess = canIdentityAdmin && employee.workspace_role !== "SUPER_ADMIN" && !own;
  const copyCandidates = snapshot.employees.filter((row) => row.employee_id !== employee.employee_id && row.workspace_role !== "SUPER_ADMIN");

  async function act(work: () => Promise<string | null>) {
    setBusy(true); setMessage(null);
    try { const done = await work(); if (done) setMessage(done); await refresh(); }
    catch (error) { reportError(messageOf(error)); }
    finally { setBusy(false); }
  }
  async function editPending() {
    const answer = await ask({ title: "修改尚未啟用的帳號", description: "Email 變更後會寄出新的驗證信，先前的首次登入密碼會失效。",
      fields: [
        { name: "employeeNo", label: "員工編號", defaultValue: employee.employee_no, required: true, inputMode: "numeric" },
        { name: "name", label: "姓名", defaultValue: employee.name, required: true },
        { name: "email", label: "Email", defaultValue: employee.email_normalized, required: true },
      ], confirmLabel: "儲存" });
    if (!answer) return;
    await act(async () => {
      const result = await updateIdentityEmployee(employee.employee_id, { employeeNo: answer.employeeNo, displayName: answer.name, email: answer.email, revision: employee.revision });
      if (result.emailVerificationDelivery?.sent === false) reportError("帳號資料已更新，但驗證信未能寄出，請稍後按「重寄驗證 Email」。");
      return result.emailVerificationDelivery?.sent ? "資料已更新，新的驗證信已寄出；舊的首次登入密碼已失效。" : "資料已更新。";
    });
  }
  const resendInvite = () => act(async () => {
    const result = await resendEmployeeEmailVerification(employee.employee_id);
    if (!result.emailVerificationDelivery.sent) { reportError("驗證信未能寄出，請稍後重試；請勿繼續使用先前的首次登入密碼。"); return null; }
    return "驗證信已重新寄出，先前的首次登入密碼已失效。";
  });
  async function deleteEmployee() {
    if (!await confirm({ title: "刪除使用者帳號", confirmTone: "danger",
      description: `確定刪除「${employee.employee_no} ${employee.name}」？刪除後將無法登入；重新新增會是全新帳號，不會繼承原有使用權。`,
      confirmLabel: "刪除帳號", cancelLabel: "保留帳號" })) return;
    setBusy(true);
    try { await deleteIdentityEmployee(employee.employee_id); onDeleted(); await refresh(); }
    catch (error) { reportError(messageOf(error)); }
    finally { setBusy(false); }
  }
  async function toggleEnabled() {
    if (employee.enabled === 1 && !await confirm({ title: `停用 ${employee.name}`, description: "停用後立即無法登入，所有使用權保留；之後可以再啟用。",
      confirmLabel: "停用帳號", confirmTone: "danger" })) return;
    await act(async () => { await updateIdentityEmployee(employee.employee_id, { enabled: employee.enabled !== 1, revision: employee.revision }); return employee.enabled === 1 ? "帳號已停用。" : "帳號已啟用。"; });
  }
  const setIdentityAdmin = (enabled: boolean) => act(async () => {
    await setEmployeeIdentityAdmin(employee.employee_id, enabled);
    return enabled ? "已設為帳號管理員。" : "已撤銷帳號管理員。";
  });
  async function recoverEmail() {
    const answer = await ask({ title: `替 ${employee.employee_no} ${employee.name} 更換 Email`,
      description: "變更後會立即登出此使用者，並要求以新 Email 重新驗證。",
      fields: [{ name: "email", label: "新的 Email", defaultValue: employee.email_normalized, required: true }], confirmLabel: "更換並登出", confirmTone: "danger" });
    const nextEmail = answer?.email ?? "";
    if (!nextEmail || nextEmail === employee.email_normalized) return;
    await act(async () => {
      const result = await forceEmployeeEmailRecovery(employee.employee_id, nextEmail);
      if (!result.verificationDelivery.sent) { reportError("Email 已變更並撤銷原有登入，但驗證信未能寄出，請稍後按「重寄 Email 驗證」。"); return null; }
      return "Email 已更換，新 Email 驗證信已寄出。";
    });
  }
  const resendVerification = () => act(async () => {
    const result = await resendActivatedEmailVerification(employee.employee_id);
    if (!result.verificationDelivery.sent) { reportError("Email 驗證信未能寄出，請稍後重試。"); return null; }
    return "Email 驗證信已重新寄出。";
  });
  async function copy() {
    const source = snapshot.employees.find((row) => row.employee_id === copySource);
    if (!source) return;
    if (!await confirm({ title: `套用 ${source.name} 的使用權`, description: `${employee.name} 的系統與模組使用權會改成和 ${source.name} 一樣，權限群組也會跟著一致。帳號權限（管理員／一般使用者）不變。`,
      confirmLabel: "套用" })) return;
    setBusy(true);
    try { await onCopy(employee, source); setCopySource(""); }
    finally { setBusy(false); }
  }

  const nextStep = own ? null : isPending ? "等待本人用驗證信完成首次登入；沒收到可以「重寄驗證 Email」。"
    : accountState(employee) === "unverified" ? "Email 尚未驗證，密碼找回等功能暫停；可以「重寄 Email 驗證」。"
    : accountState(employee) === "disabled" ? "已停用，無法登入；使用權仍保留，需要時按「啟用」。" : null;
  const button = (key: string, label: string, onClick: () => Promise<void>, tone = "") =>
    <button type="button" className={`cy-op-button ${tone}`} disabled={busy} aria-busy={(busy && pending === key) || undefined}
      onClick={() => track(key, onClick())}>{label}</button>;
  const accessGroups = (["系統使用權", "業務模組", "ERP 查詢"] as const).map((group) => ({ group, columns: columns.filter((column) => column.group === group) })).filter((item) => item.columns.length);

  return <Drawer open title={employee.name} description={`${employee.employee_no} · ${employee.email_normalized}`} dismissible={!busy} onClose={onClose}>
    {confirmationDialog}
    {promptDialog}
    {transferOpen ? <TransferDialog employees={snapshot.employees} onClose={() => setTransferOpen(false)} /> : null}
    <div className="cy-identity-drawer">
      <div className="cy-identity-drawer-status">
        <StatusChip tone={state.tone}>{state.label}</StatusChip>
        <RoleCell employee={employee} session={session} refresh={refresh} onError={reportError} onSaved={setMessage} />
        {employee.identity_admin === 1 ? <span>帳號管理員</span> : null}
      </div>
      <FeedbackBanner message={message} tone={messageTone} />
      {own ? <p className="cy-next-step finished">這是你的帳號；密碼與 Email 請到「我的帳號」變更，自己的權限與使用權由其他管理員設定。</p>
        : nextStep ? <NextStep tone={state.tone}>{nextStep}</NextStep> : null}

      <div className="cy-identity-drawer-actions">
        {employee.workspace_role === "SUPER_ADMIN" && isSuperAdmin ? <button type="button" className="cy-op-button" disabled={busy || !snapshot.employees.some(eligibleForTransfer)} onClick={() => setTransferOpen(true)}>移交超級管理員</button> : null}
        {isPending && rowManageable ? <>
          <button type="button" className="cy-op-button" disabled={busy} onClick={() => void editPending()}>修改資料</button>
          {button("resendInvite", "重寄驗證 Email", resendInvite)}
        </> : null}
        {!isPending && rowManageable ? button("toggle", employee.enabled === 1 ? "停用帳號" : "啟用帳號", toggleEnabled, employee.enabled === 1 ? "danger" : "primary") : null}
        {canRecover ? <button type="button" className="cy-op-button" disabled={busy} onClick={() => void recoverEmail()}>更換 Email</button> : null}
        {canRecover && !employee.email_verified_at ? button("resendVerification", "重寄 Email 驗證", resendVerification) : null}
        {isSuperAdmin && employee.workspace_role === "ADMIN" && !own ? button("identityAdmin", employee.identity_admin === 1 ? "撤銷帳號管理員" : "設為帳號管理員", () => setIdentityAdmin(employee.identity_admin !== 1)) : null}
        {rowManageable && (isPending || (isSuperAdmin && snapshot.testingAccountDeletionAllowed === true)) ? button("delete", "刪除帳號", deleteEmployee, "danger") : null}
      </div>

      {canEditAccess && copyCandidates.length ? <div className="cy-op-subsection">
        <h3>從某人複製使用權</h3>
        <div className="cy-identity-copy-row">
          <select className="cy-op-input" aria-label="複製來源" value={copySource} disabled={busy} onChange={(event) => setCopySource(event.target.value)}>
            <option value="">選擇同事</option>
            {copyCandidates.map((row) => <option key={row.employee_id} value={row.employee_id}>{row.employee_no} · {row.name}</option>)}
          </select>
          <button type="button" className="cy-op-button" disabled={busy || !copySource} aria-busy={busy || undefined} onClick={() => void copy()}>套用</button>
        </div>
      </div> : null}

      {canIdentityAdmin ? <div className="cy-op-subsection">
        <h3>權限群組</h3>
        <label className="cy-identity-group-row">群組{groupControl}</label>
        <p className="cy-identity-intro">{group ? `系統與模組使用權由群組「${group.name}」決定，不能個別修改；要調整請到「權限群組」，或改回「個人設定」（保留目前的勾選）。`
          : "個人設定：下面逐項勾選，立即生效。加入群組後改由群組決定。"}</p>
      </div> : null}
      {canIdentityAdmin ? accessGroups.map((item) => item.group === "系統使用權"
        ? <ApplicationAccessSection key={item.group} employee={employee} columns={item.columns} allowed={allowed} lockReason={lockReason} saving={saving} onToggle={onToggle} quiet={!!group} />
        : null) : null}
      {canIdentityAdmin ? <ModuleAccessPanel employee={employee} group={group} groups={accessGroups.filter((item) => item.group !== "系統使用權")}
        allowed={allowed} lockReason={lockReason} saving={saving} onToggle={onToggle} /> : null}
    </div>
  </Drawer>;
}

function AccessChecks({ employee, columns, allowed, lockReason, saving, onToggle, quiet }: {
  employee: IdentityEmployeeRow;
  columns: readonly AccessColumn[];
  allowed: (employee: IdentityEmployeeRow, column: AccessColumn) => boolean;
  lockReason: (employee: IdentityEmployeeRow, column: AccessColumn) => string | null;
  saving: ReadonlySet<string>;
  onToggle: (employee: IdentityEmployeeRow, column: AccessColumn, next: boolean) => Promise<void>;
  /** The section already explains the lock, so items do not repeat it. */
  quiet?: boolean;
}) {
  return <div className="cy-identity-access-list">
    {columns.map((column) => {
      const reason = lockReason(employee, column);
      return <label key={column.key} className={`cy-identity-access-item${column.role ? ` cy-access-${column.role}` : ""}`} title={reason ?? undefined}>
        <input type="checkbox" checked={allowed(employee, column)} disabled={!!reason || saving.has(`${employee.employee_id}:${column.key}`)}
          onChange={(event) => void onToggle(employee, column, event.target.checked)} />
        <span>{column.label}{column.hint ? <small className="cy-access-col-hint">{column.hint}</small> : null}</span>
        {saving.has(`${employee.employee_id}:${column.key}`) ? <span className="cy-loading-spinner" aria-hidden="true" /> : reason && !quiet ? <small>{reason}</small> : null}
      </label>;
    })}
  </div>;
}

/** The person's access to other CY systems (CY Web itself is always available). */
function ApplicationAccessSection(props: Omit<Parameters<typeof AccessChecks>[0], "columns"> & { columns: readonly AccessColumn[] }) {
  return <div className="cy-op-subsection"><h3>系統使用權</h3><AccessChecks {...props} /></div>;
}

/** CY Web 模組使用權 for one person, grouped so 業務模組 and ERP 查詢 read separately (writes via setEmployeeModuleAccess). */
function ModuleAccessPanel({ groups, group, ...props }: Omit<Parameters<typeof AccessChecks>[0], "columns"> & {
  groups: readonly { group: string; columns: readonly AccessColumn[] }[]; group: ModuleAccessGroup | null;
}) {
  return <div className="cy-op-subsection">
    <h3>CY Web 模組使用權</h3>
    {groups.map((item) => <fieldset key={item.group} className="cy-identity-module-group"><legend>{item.group}</legend><AccessChecks {...props} columns={item.columns} quiet={!!group} /></fieldset>)}
  </div>;
}

function eligibleForTransfer(row: IdentityEmployeeRow): boolean {
  return row.workspace_role !== "SUPER_ADMIN" && Boolean(row.activated_at) && row.enabled === 1 && row.credential_present === 1 && Boolean(row.email_verified_at);
}

function CreateUserDialog({ canIdentityAdmin, onClose, onCreated, reportError }: {
  canIdentityAdmin: boolean;
  onClose: () => void;
  onCreated: (employeeNo: string, message: string) => Promise<void>;
  reportError: (message: string) => void;
}) {
  const [employeeNo, setEmployeeNo] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState<"USER" | "ADMIN">("USER");
  const [busy, setBusy] = useState(false);
  const formId = useId();
  const guard = useUnsavedChangesGuard({ active: Boolean(employeeNo || displayName || email || roleKey !== "USER"), blocked: busy });
  const { confirm, confirmationDialog } = useConfirmation();

  async function close() {
    if (busy) return;
    const decision = await guard.confirmNavigationAsync((description) => confirm({
      title: "放棄新增使用者？", description, confirmLabel: "放棄新增", cancelLabel: "繼續填寫", confirmTone: "danger",
    }));
    if (decision.allowed) onClose();
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!/^\d{4}$/.test(employeeNo) || !displayName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      reportError("請輸入 4 碼員工編號、姓名與有效的電子郵件。"); return;
    }
    setBusy(true);
    try {
      const result = await createIdentityEmployee({ employeeNo, displayName, email, roleKey: canIdentityAdmin ? roleKey : "USER" });
      if (!result.emailVerificationDelivery.sent) reportError("使用者已建立，但驗證信未能寄出。請在明細按「重寄驗證 Email」，不需重複新增帳號。");
      await onCreated(employeeNo, result.emailVerificationDelivery.sent
        ? "使用者已建立，驗證信已寄出。請本人開啟 CY Web，用信中的一次性首次登入密碼完成驗證並設定正式密碼。"
        : "使用者已建立，但驗證信未能寄出。");
    } catch (error) { reportError(messageOf(error)); }
    finally { setBusy(false); }
  }

  return <>
    {confirmationDialog}
    <Dialog open title="新增使用者" size="small" dismissible={!busy} onClose={() => void close()}
      description="系統會寄出驗證信與一次性首次登入密碼，本人完成驗證後即可使用。"
      footer={<div className="cy-dialog-action-row"><button type="button" className="cy-op-button" disabled={busy} onClick={() => void close()}>取消</button><button type="submit" form={formId} className="cy-op-button primary" disabled={busy} aria-busy={busy || undefined}>新增使用者</button></div>}>
      <form onKeyDown={enterAdvancesFields} id={formId} className="cy-op-form" onSubmit={create} noValidate>
    <FormSection>
        <TextInput label="員工編號" inputMode="numeric" autoComplete="off" maxLength={4} value={employeeNo} onChange={(event) => setEmployeeNo(event.target.value.replace(/\D/g, "").slice(0, 4))} disabled={busy} autoFocus required />
        <TextInput label="姓名" autoComplete="off" value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={busy} required />
        <TextInput label="電子郵件" type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} required />
        <Field  label="權限" size="s"><select className="cy-op-input" value={canIdentityAdmin ? roleKey : "USER"} disabled={busy || !canIdentityAdmin} onChange={(event) => setRoleKey(event.target.value as "USER" | "ADMIN")}><option value="USER">一般使用者</option>{canIdentityAdmin ? <option value="ADMIN">管理員</option> : null}</select></Field>
      
    </FormSection>
  </form>
    </Dialog>
  </>;
}

function TransferDialog({ employees, onClose }: { employees: readonly IdentityEmployeeRow[]; onClose: () => void }) {
  const eligible = employees.filter(eligibleForTransfer);
  const [targetEmployeeId, setTargetEmployeeId] = useState(eligible[0]?.employee_id ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage, reportError, messageTone] = useFeedbackMessage<string | null>(null);
  const { reloadAfter, reloadDialog } = useReloadNotice();
  const formId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage(null);
    try {
      if (!challengeId) {
        if (!targetEmployeeId) return;
        const result = await startHighestAuthorityTransfer(targetEmployeeId, currentPassword);
        setChallengeId(result.transfer.challengeId); setCurrentPassword("");
        setMessage("移交驗證碼已寄至目前超級管理員的已驗證 Email。");
      } else {
        if (!/^\d{6}$/.test(otp)) return;
        await confirmHighestAuthorityTransfer(targetEmployeeId, challengeId, otp);
        await reloadAfter("超級管理員已移交", "目前登入已撤銷，請重新登入。");
      }
    } catch (error) { reportError(messageOf(error)); }
    finally { setBusy(false); }
  }

  return <>
    {reloadDialog}
    <Dialog open title="移交超級管理員" size="small" dismissible={!busy} onClose={onClose}
      description="移交後立即生效，雙方既有登入都會撤銷。只能移交給已啟用且 Email 已驗證的使用者。"
      footer={<div className="cy-dialog-action-row"><button type="button" className="cy-op-button" disabled={busy} onClick={onClose}>取消</button>
        <button type="submit" form={formId} className="cy-op-button danger-solid" disabled={busy || (challengeId !== null && otp.length !== 6)} aria-busy={busy || undefined}>{challengeId ? "確認移交" : "寄送移交驗證碼"}</button></div>}>
      <FeedbackBanner message={message} tone={messageTone} />
      <form onKeyDown={enterAdvancesThenSubmits} id={formId} className="cy-op-form" onSubmit={(event) => void submit(event)}>
    <FormSection>
        {!challengeId ? <>
          <Field  label="新的超級管理員" size="m"><select className="cy-op-input" value={targetEmployeeId} disabled={busy} onChange={(event) => setTargetEmployeeId(event.target.value)}>{eligible.map((row) => <option key={row.employee_id} value={row.employee_id}>{row.employee_no} · {row.name}</option>)}</select></Field>
          <Field  label="目前超級管理員密碼" size="m" required><input className="cy-op-input" type="password" value={currentPassword} disabled={busy} onChange={(event) => setCurrentPassword(event.target.value)} /></Field>
        </> : <Field  label="6 位數驗證碼" size="m" required><input className="cy-op-input" inputMode="numeric" maxLength={6} value={otp} disabled={busy} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} autoFocus /></Field>}
      
    </FormSection>
  </form>
    </Dialog>
  </>;
}

// ---------- 權限群組 ----------

/** 權限群組 (BD-057): each group is a set of systems and CY Web modules that its members use exactly. */
function GroupWorkspace({ snapshot, session, view, columns, reload, switcher }: {
  snapshot: IdentityAdminSnapshot;
  session: AuthSession;
  view: ModuleAccessAdminSnapshot;
  columns: readonly AccessColumn[];
  reload: () => Promise<void>;
  switcher: ReactNode;
}) {
  const [savingId, setSavingId] = useState<number | null>(null);
  const [message, setMessage, reportError, messageTone] = useFeedbackMessage<string | null>(null);
  const { confirm, confirmationDialog } = useConfirmation();
  const { ask, promptDialog } = useFormPrompt();

  const headerGroups = useMemo(() => (["系統使用權", "業務模組", "ERP 查詢"] as const)
    .map((group) => ({ group, span: columns.filter((column) => column.group === group).length })).filter((item) => item.span), [columns]);
  const nameOf = (employeeId: string) => snapshot.employees.find((employee) => employee.employee_id === employeeId)?.name;
  const memberIds = (groupId: number) => view.memberships.filter((row) => row.group_id === groupId).map((row) => row.employee_id);
  const included = (group: ModuleAccessGroup, column: AccessColumn) => column.kind === "app"
    ? group.applications.includes(column.code) : group.modules.includes(column.code as ModuleCode);
  /** Members whose CYID system access differs from the group (a failed sync or a change made outside CY Web). */
  const pending = useMemo(() => {
    const access = new Set(snapshot.directAccess.filter((row) => row.enabled === 1).map((row) => `${row.employee_id}:${row.application_id}`));
    const apps = columns.filter((column) => column.kind === "app" && !column.disabledReason);
    return new Map(view.groups.map((group) => [group.id, memberIds(group.id).filter((employeeId) => employeeId !== session.user.employeeId
      && apps.some((column) => access.has(`${employeeId}:${column.code}`) !== group.applications.includes(column.code)))]));
  }, [snapshot.directAccess, columns, view, session.user.employeeId]);

  const inputOf = (group: ModuleAccessGroup) => ({ name: group.name, modules: group.modules, applications: group.applications });
  async function save(group: ModuleAccessGroup, input: ReturnType<typeof inputOf>, done: string) {
    setSavingId(group.id); setMessage(null);
    try {
      const result = await updateModuleAccessGroup(group.id, input, group.revision);
      await reload();
      if (result.applicationSyncFailed.length) reportError(`${done}但 ${result.applicationSyncFailed.length} 人的系統使用權未能套用，請按「重新套用」。`);
      else setMessage(done);
    } catch (error) { reportError(messageOf(error)); await reload(); }
    finally { setSavingId(null); }
  }
  function toggle(group: ModuleAccessGroup, column: AccessColumn, enabled: boolean) {
    const input = inputOf(group);
    if (column.kind === "app") input.applications = enabled ? [...group.applications, column.code] : group.applications.filter((code) => code !== column.code);
    let dropped: ModuleCode[] = [];
    if (column.kind === "module") {
      const held = new Set<string>(group.modules);
      const problem = moduleChangeProblem(held, column.code as ModuleCode, enabled);
      if (problem) { reportError(`「${group.name}」：${problem}`); return; }
      // Off takes the grants that need this one off too (user 2026-10-21).
      dropped = enabled ? [] : modulesDroppedWith(held, column.code as ModuleCode);
      input.modules = enabled ? [...group.modules, column.code as ModuleCode] : group.modules.filter((code) => code !== column.code && !dropped.includes(code));
    }
    void save(group, input, `「${group.name}」${enabled ? "已開放" : "已取消"}「${column.label}」${dropped.length ? `，「${dropped.map(moduleLabel).join("」、「")}」也一併取消` : ""}，已套用到 ${group.memberCount} 位成員。`);
  }
  async function resync(group: ModuleAccessGroup) {
    setSavingId(group.id); setMessage(null);
    try {
      const result = await syncModuleAccessGroup(group.id);
      await reload();
      if (result.applicationSyncFailed.length) reportError(`仍有 ${result.applicationSyncFailed.length} 人未能套用，請稍後再試。`);
      else setMessage(`「${group.name}」的系統使用權已重新套用。`);
    } catch (error) { reportError(messageOf(error)); }
    finally { setSavingId(null); }
  }
  async function rename(group: ModuleAccessGroup) {
    const answer = await ask({ title: "重新命名群組", fields: [{ name: "name", label: "群組名稱", defaultValue: group.name, required: true }], confirmLabel: "儲存" });
    if (!answer || answer.name === group.name) return;
    await save(group, { ...inputOf(group), name: answer.name }, `群組已改名為「${answer.name}」。`);
  }
  async function remove(group: ModuleAccessGroup) {
    if (!await confirm({ title: `刪除群組「${group.name}」`, confirmLabel: "刪除群組", confirmTone: "danger",
      description: group.memberCount ? `${group.memberCount} 位成員會移出群組，目前的系統與模組使用權保留為個人設定。` : "這個群組沒有成員。" })) return;
    setSavingId(group.id); setMessage(null);
    try { await deleteModuleAccessGroup(group.id, group.revision); await reload(); setMessage(`群組「${group.name}」已刪除。`); }
    catch (error) { reportError(messageOf(error)); await reload(); }
    finally { setSavingId(null); }
  }
  async function create() {
    const answer = await ask({ title: "新增權限群組", description: "例如「業務」「倉管」。建立後勾選要開放的系統與模組，再到「人員」把人加入群組。",
      fields: [{ name: "name", label: "群組名稱", required: true }], confirmLabel: "建立" });
    if (!answer) return;
    setMessage(null);
    try { await createModuleAccessGroup({ name: answer.name, modules: [], applications: [] }); await reload(); setMessage(`已建立「${answer.name}」，請勾選要開放的系統與模組。`); }
    catch (error) { reportError(messageOf(error)); }
  }

  return <>
    {confirmationDialog}
    {promptDialog}
    <FeedbackBanner message={message} tone={messageTone} />
    <section className="cy-op-panel cy-identity-table-panel cy-identity-group-panel">
      <div className="cy-identity-table-toolbar">
        {switcher}
        <button type="button" className="cy-op-button primary" disabled={savingId !== null} onClick={() => void create()}>＋ 新增群組</button>
        <span className="cy-md-count">{savingId !== null ? <Loading inline /> : `共 ${view.groups.length} 個群組`}</span>
      </div>
      {view.groups.filter((group) => pending.get(group.id)?.length).map((group) => <div key={group.id} className="cy-notice cy-notice-warning cy-identity-sync-notice" role="status">
        <span><strong>「{group.name}」有 {pending.get(group.id)!.length} 人的系統使用權尚未套用：</strong>{pending.get(group.id)!.map(nameOf).filter(Boolean).join("、")}。</span>
        <button type="button" className="cy-op-button" disabled={savingId !== null} aria-busy={savingId === group.id || undefined} onClick={() => void resync(group)}>重新套用</button>
      </div>)}
      <div className="cy-identity-access-scroll">
        <table className="cy-op-table cy-identity-access-table cy-identity-group-table">
          <thead>
            <tr>
              <th rowSpan={2} className="cy-access-person">群組</th>
              {headerGroups.map((item) => <th key={item.group} colSpan={item.span} className="cy-access-group">{item.group}</th>)}
              <th rowSpan={2}>操作</th>
            </tr>
            <tr>{columns.map((column) => <th key={column.key} className={`cy-access-col${column.role ? ` cy-access-${column.role}` : ""}`} title={column.hint}>{column.label}{column.hint ? <small className="cy-access-col-hint">{column.hint}</small> : null}</th>)}</tr>
          </thead>
          <tbody>{view.groups.map((group) => {
            const names = memberIds(group.id).map(nameOf).filter((name): name is string => !!name);
            return <tr key={group.id}>
              <th scope="row" className="cy-access-person">
                <div className="cy-access-person-text">
                  <strong>{group.name}</strong>
                  <span title={names.join("、")}>{names.length ? `${names.length} 位：${names.slice(0, 3).join("、")}${names.length > 3 ? "…" : ""}` : "尚無成員"}</span>
                </div>
              </th>
              {columns.map((column) => <td key={column.key} className={`cy-access-cell${column.role ? ` cy-access-${column.role}` : ""}`}>
                {(() => {
                  const lock = column.disabledReason ?? (column.kind === "module" ? moduleLockReason(new Set<string>(group.modules), column.code as ModuleCode) : null);
                  return <input type="checkbox" checked={included(group, column)} disabled={savingId !== null || !!lock}
                    title={lock ?? undefined} aria-label={`${group.name}「${column.label}」`} onChange={(event) => toggle(group, column, event.target.checked)} />;
                })()}
              </td>)}
              <td><div className="cy-identity-row-actions">
                <button type="button" className="cy-op-button compact" disabled={savingId !== null} onClick={() => void rename(group)}>重新命名</button>
                <button type="button" className="cy-op-button compact danger" disabled={savingId !== null} onClick={() => void remove(group)}>刪除</button>
              </div></td>
            </tr>;
          })}</tbody>
        </table>
        {view.groups.length === 0 ? <div className="cy-op-empty">尚未建立權限群組。按「＋ 新增群組」建立，例如「業務」「倉管」。</div> : null}
      </div>
    </section>
  </>;
}

// ---------- 系統與安全（超級管理員） ----------

function ApplicationRegistryPanel({ snapshot, refresh }: { snapshot: IdentityAdminSnapshot; refresh: () => Promise<void> }) {
  const [registration, setRegistration] = useState<{ applicationId: string; displayName: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage, reportError, messageTone] = useFeedbackMessage<string | null>(null);
  const [registrationError, , setRegistrationError] = useFeedbackMessage<string | null>(null);
  const formId = useId();
  const { confirm, confirmationDialog } = useConfirmation();
  const guard = useUnsavedChangesGuard({
    active: !!registration && (registration.applicationId !== "" || registration.displayName !== ""),
    blocked: busy, message: "尚有未完成的系統登記，確定放棄？",
  });

  async function close() {
    if (busy) return;
    const decision = await guard.confirmNavigationAsync((description) => confirm({ title: "放棄系統登記", description, confirmLabel: "放棄", confirmTone: "danger" }));
    if (decision.allowed) { setRegistration(null); setRegistrationError(null); }
  }
  async function register(event: FormEvent) {
    event.preventDefault();
    if (busy || !registration) return;
    const input = { applicationId: registration.applicationId.trim().toUpperCase(), displayName: registration.displayName.trim() };
    if (!/^[A-Z0-9_-]{2,64}$/.test(input.applicationId) || !input.displayName) { setRegistrationError("請填寫有效的系統識別碼與顯示名稱。"); return; }
    setBusy(true); setRegistrationError(null); setMessage(null);
    try {
      await registerWorkspaceApplication(input);
      setRegistration(null);
      setMessage("系統已登記並啟用，請到「使用者」為員工開放使用權。");
      try { await refresh(); } catch { reportError("系統已完成登記，但清單更新失敗；請重新整理此頁。"); }
    } catch (error) {
      const explanations: Record<string, string> = {
        CORE_SUPER_ADMIN_REQUIRED: "只有目前 Workspace 的超級管理員能登記系統，請確認登入權限。",
        CORE_APPLICATION_ACCESS_LOCKED: "CY Web 是固定啟用的核心帳號入口，不需要另外登記。",
        APPLICATION_REGISTRATION_CONFLICT: "這個識別碼已使用不同名稱，或系統已由中央停用；原有設定已保留。",
      };
      setRegistrationError(error instanceof ApiClientError ? explanations[error.code] ?? messageOf(error) : messageOf(error));
    } finally { setBusy(false); }
  }

  return <section className="cy-op-panel">
    {confirmationDialog}
    <div className="cy-op-panel-header"><div><h3>已登記的系統</h3></div>
      <button type="button" className="cy-op-button" disabled={busy} onClick={() => { setRegistration({ applicationId: "", displayName: "" }); setRegistrationError(null); }}>＋ 登記系統</button></div>
    <FeedbackBanner message={message} tone={messageTone} />
    <div className="cy-op-table-wrap"><table className="cy-op-table"><thead><tr><th>系統</th><th>狀態</th></tr></thead>
      <tbody>{snapshot.applications.map((app) => <tr key={app.application_id}><td title={"識別碼：" + app.application_id}>{app.display_name}</td>
        <td><StatusChip tone={app.enabled === 1 ? "success" : "neutral"}>{app.core_access_locked === 1 ? "核心・固定啟用" : app.enabled === 1 ? "啟用" : "停用"}</StatusChip></td></tr>)}</tbody></table></div>
    {registration ? <Dialog open title="登記並啟用系統" size="small" dismissible={!busy} onClose={() => void close()}
      description="為目前 Workspace 加入系統。超級管理員可直接使用；其他員工仍須另外開放使用權。已停用的系統重新登記後會啟用，原有使用權會保留。"
      footer={<div className="cy-dialog-action-row"><button type="button" className="cy-op-button" disabled={busy} onClick={() => void close()}>取消</button><button type="submit" form={formId} className="cy-op-button primary" disabled={busy} aria-busy={busy || undefined}>登記並啟用</button></div>}>
      <form onKeyDown={enterAdvancesFields} id={formId} className="cy-form-grid" onSubmit={(event) => void register(event)}>
    <FormSection>
        <div className="cy-form-grid-full"><TextInput label="系統識別碼" description="使用該系統核准的識別碼，由英文字母、數字、底線或連字號組成。" value={registration.applicationId} maxLength={64} required disabled={busy} autoFocus onChange={(event) => setRegistration({ ...registration, applicationId: event.target.value })} /></div>
        <div className="cy-form-grid-full"><TextInput label="顯示名稱" value={registration.displayName} maxLength={120} required disabled={busy} onChange={(event) => setRegistration({ ...registration, displayName: event.target.value })} /></div>
        {registrationError ? <p className="cy-form-grid-full cy-notice cy-notice-danger" role="alert">{registrationError}</p> : null}
      
    </FormSection>
  </form>
    </Dialog> : null}
  </section>;
}

function SecurityPanel() {
  const [view, setView] = useState<SecurityPolicyView | null>(null);
  const [draft, setDraft] = useState<SecurityPolicyView["policy"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage, reportError, messageTone] = useFeedbackMessage<string | null>(null);
  const [dialogError, , setDialogError] = useFeedbackMessage<string | null>(null);
  const formId = useId();
  useEffect(() => { void loadSecurityPolicy().then(setView).catch((e) => reportError(messageOf(e))); }, []);

  function close() { if (!busy) { setDraft(null); setDialogError(null); } }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!view || !draft) return; setBusy(true); setMessage(null); setDialogError(null);
    try {
      const updated = await updateSecurityPolicy({
        otpResendCooldownSeconds: draft.otpResendCooldownSeconds,
        otpMaxAttempts: draft.otpMaxAttempts,
        otpMaxSentPerEmailPurposeHour: draft.otpMaxSentPerEmailPurposeHour,
        emailDailyLimit: draft.emailDailyLimit,
      });
      setView({ ...view, policy: updated.policy }); setDraft(null); setMessage("驗證碼與 Email 安全設定已更新。");
    } catch (error) { setDialogError(messageOf(error)); }
    finally { setBusy(false); }
  }

  const policy = view?.policy;
  const field = (key: keyof SecurityPolicyView["policy"]) => (event: { target: { value: string } }) =>
    draft && setDraft({ ...draft, [key]: Number(event.target.value) });
  return <section className="cy-op-panel">
    <div className="cy-op-panel-header"><h3>驗證碼與 Email 安全設定</h3>
      <button type="button" className="cy-op-button" disabled={!view} onClick={() => view && setDraft({ ...view.policy })}>變更</button></div>
    <FeedbackBanner message={message} tone={messageTone} />
    {policy && view ? <dl className="cy-identity-policy-summary">
      <dt>驗證碼重寄間隔</dt><dd>{policy.otpResendCooldownSeconds} 秒</dd>
      <dt>驗證碼最多嘗試</dt><dd>{policy.otpMaxAttempts} 次</dd>
      <dt>同一 Email 同用途</dt><dd>每小時 {policy.otpMaxSentPerEmailPurposeHour} 封</dd>
      <dt>每日 Email 上限</dt><dd>{policy.emailDailyLimit} 封（系統上限 {view.systemEmailDailyCeiling}）</dd>
    </dl> : <Loading />}
    {draft && view ? <Dialog open title="變更驗證碼與 Email 安全設定" size="small" dismissible={!busy} onClose={close}
      description="限制驗證碼重寄與 Email 寄送次數，避免被濫用。"
      footer={<div className="cy-dialog-action-row"><button type="button" className="cy-op-button" disabled={busy} onClick={close}>取消</button><button type="submit" form={formId} className="cy-op-button primary" disabled={busy} aria-busy={busy || undefined}>儲存</button></div>}>
      <form onKeyDown={enterAdvancesFields} id={formId} className="cy-identity-policy-grid" onSubmit={(event) => void save(event)}>
    <FormSection>
        <Field  label="驗證碼重寄間隔（秒）" size="s"><input className="cy-op-input" type="number" min={30} max={600} value={draft.otpResendCooldownSeconds} onChange={field("otpResendCooldownSeconds")} /></Field>
        <Field  label="驗證碼最多嘗試次數" size="m"><input className="cy-op-input" type="number" min={3} max={10} value={draft.otpMaxAttempts} onChange={field("otpMaxAttempts")} /></Field>
        <Field  label="同一 Email、同一用途每小時最多" size="m"><input className="cy-op-input" type="number" min={1} max={20} value={draft.otpMaxSentPerEmailPurposeHour} onChange={field("otpMaxSentPerEmailPurposeHour")} /></Field>
        <Field label="每日 Email 上限" size="m" hint={<>系統上限：{view.systemEmailDailyCeiling}</>}><input className="cy-op-input" type="number" min={1} max={view.systemEmailDailyCeiling} value={draft.emailDailyLimit} onChange={field("emailDailyLimit")} /></Field>
        {dialogError ? <p className="wide cy-notice cy-notice-danger" role="alert">{dialogError}</p> : null}
      
    </FormSection>
  </form>
    </Dialog> : null}
  </section>;
}

// ---------- Page ----------

type Tab = "users" | "system";

/** 我的帳號: opened from the top-right person menu, for everyone. */
export function MyAccountPage({ session }: { session: AuthSession }) {
  return <div className="cy-identity-page"><SelfServicePanel session={session} /></div>;
}

export function SharedIdentityPage({ session, usage, showUsage = false }: { session: AuthSession; usage?: CloudflareUsagePanelProps; showUsage?: boolean }) {
  const [snapshot, setSnapshot] = useState<IdentityAdminSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, , setError] = useFeedbackMessage<string | null>(null);
  const isWorkspaceAdmin = session.user.workspaceRole === "ADMIN" || session.user.workspaceRole === "SUPER_ADMIN";
  const isSuperAdmin = session.user.workspaceRole === "SUPER_ADMIN";
  const [tab, setTab] = useState<Tab>(showUsage && isSuperAdmin ? "system" : "users");
  useEffect(() => { if (showUsage && isSuperAdmin) setTab("system"); }, [showUsage, isSuperAdmin]);
  useEffect(() => { if (showUsage && tab === "system" && snapshot) document.getElementById("cy-cloudflare-usage")?.scrollIntoView({ block: "start" }); }, [showUsage, tab, snapshot]);

  const refresh = useCallback(async () => {
    if (!isWorkspaceAdmin) return;
    setLoading(true); setError(null);
    try { setSnapshot(await loadIdentityAdminSnapshot()); }
    catch (e) { setError(messageOf(e)); }
    finally { setLoading(false); }
  }, [isWorkspaceAdmin]);
  useEffect(() => { void refresh(); }, [refresh]);

  if (!isWorkspaceAdmin) return <MyAccountPage session={session} />;
  const tabs: readonly { key: Tab; label: string }[] = [
    { key: "users", label: "使用者" },
    ...(isSuperAdmin ? [{ key: "system" as const, label: "系統與安全" }] : []),
  ];
  return <div className="cy-identity-page">
    <div className="cy-op-tabs" role="tablist" aria-label="帳號與權限">
      {tabs.map((item) => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={tab === item.key ? "active" : ""} onClick={() => setTab(item.key)}>{item.label}</button>)}
    </div>
    {!snapshot ? (error
      ? <section className="cy-op-panel"><p className="cy-notice cy-notice-danger" role="alert">{error}</p><button type="button" className="cy-op-button" disabled={loading} aria-busy={loading || undefined} onClick={() => void refresh()}>重新讀取</button></section>
      : <Loading />)
      : tab === "users" ? <UserWorkspace snapshot={snapshot} session={session} refresh={refresh} />
      : <div className="cy-identity-admin-stack cy-system-security">
        <div className="cy-system-security-pair">
          <ApplicationRegistryPanel snapshot={snapshot} refresh={refresh} />
          <SecurityPanel />
        </div>
        {isSuperAdmin && usage ? <CloudflareUsagePanel {...usage} /> : null}
      </div>}
  </div>;
}

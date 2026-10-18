import { Loading } from "../ui/feedback/Loading";
import { enterAdvancesFields, enterAdvancesThenSubmits } from "../ui/foundation/enter-advance";
import { FormEvent, useCallback, useEffect, useId, useMemo, useState } from "react";
import { Dialog } from "../ui/overlays/Dialog";
import { useConfirmation } from "../ui/overlays/useConfirmation";
import { PagePrimaryActions } from "../ui/shell/PagePrimaryActions";
import { useFormPrompt } from "../ui/overlays/useFormPrompt";
import { useUnsavedChangesGuard } from "../ui/foundation/useUnsavedChangesGuard";
import { TextInput } from "../ui/primitives/TextInput";
import { StatusChip } from "../ui/primitives/StatusChip";
import { StatusFilter } from "../ui/data/StatusFilter";
import { NextStep } from "../ui/feedback/NextStep";
import { MasterDetailBack, MasterDetailEmpty, useMasterDetailPane } from "../ui/layout/MasterDetail";
import { ApiClientError } from "../api/client";
import { chineseMessage } from "../api/error-messages";
import { FeedbackBanner, useFeedbackMessage } from "../ui/feedback/FeedbackProvider";
import { usePendingAction } from "../ui/feedback/usePendingAction";
import { loadModuleAccessAdminSnapshot, setEmployeeModuleAccess, type ModuleAccessAdminSnapshot } from "../access/module-access-client";
import type { AuthSession } from "../auth/auth-client";
import type { StatusTone } from "../runtime/modules/status-flow";
import { CyInvoiceRecoveryAdminPanel } from "./CyInvoiceRecoveryAdminPanel";
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
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [verifyingCurrentEmail, setVerifyingCurrentEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage, reportError, messageTone] = useFeedbackMessage<string | null>(null);
  const { reloadAfter, reloadDialog } = useReloadNotice();

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) { reportError("兩次新密碼不一致。"); return; }
    const length = Array.from(newPassword).length;
    if (length < 8 || length > 16) { reportError("新密碼必須為 8～16 字元。"); return; }
    setBusy(true); setMessage(null);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      await reloadAfter("密碼已變更", "既有登入已撤銷，請用新密碼重新登入。");
    } catch (error) { reportError(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function startEmail(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null); setVerifyingCurrentEmail(false);
    try {
      const result = await startOwnEmailChange(emailPassword, newEmail);
      setChallengeId(result.verification.challengeId);
      setMessage("驗證碼已寄出，請輸入 Email 中的 6 位數驗證碼。");
    } catch (error) { reportError(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function verifyCurrentEmail() {
    setBusy(true); setMessage(null); setVerifyingCurrentEmail(true);
    try {
      const result = await startCurrentEmailVerification();
      setChallengeId(result.verification.challengeId);
      setMessage(result.reused ? "沿用已寄出的驗證碼，請輸入 6 位數驗證碼。" : "驗證碼已寄至目前 Email。");
    } catch (error) { setVerifyingCurrentEmail(false); reportError(messageOf(error)); }
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
    <p className="cy-identity-intro">{session.user.employeeNo} {session.user.displayName} · {permissionLabel(session.user.workspaceRole)}。密碼與驗證碼由 CYID 帳號服務保管，CY Web 不會保存。</p>
    {!session.user.emailVerified ? <div className="cy-notice cy-notice-warning"><div className="cy-notice-title">Email 待重新驗證</div><div className="cy-notice-body">帳號已啟用，原密碼仍有效。請完成目前 Email 驗證，密碼找回等 Email 安全功能才會恢復正常。</div><button className="cy-op-button" type="button" disabled={busy} aria-busy={(busy && verifyingCurrentEmail) || undefined} onClick={() => void verifyCurrentEmail()}>寄送 Email 驗證碼</button></div> : null}
    <FeedbackBanner message={message} tone={messageTone} />
    <div className="cy-op-grid-two">
      <section className="cy-op-panel">
        <h3>變更密碼</h3>
        <form onKeyDown={enterAdvancesThenSubmits} className="cy-op-form" onSubmit={submitPassword} noValidate>
          <label>目前密碼<input className="cy-op-input" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></label>
          <label>新密碼（8～16 字元）<input className="cy-op-input" type="password" autoComplete="new-password" maxLength={16} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></label>
          <label>確認新密碼<input className="cy-op-input" type="password" autoComplete="new-password" maxLength={16} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></label>
          <div className="cy-op-form-footer"><button className="cy-op-button primary" disabled={busy} aria-busy={busy || undefined}>變更密碼</button></div>
        </form>
      </section>
      <section className="cy-op-panel">
        <h3>{verifyingCurrentEmail ? "驗證目前 Email" : "變更 Email"}</h3>
        {!challengeId ? <form onKeyDown={enterAdvancesThenSubmits} className="cy-op-form" onSubmit={startEmail}>
          <label>新 Email<input className="cy-op-input" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required /></label>
          <label>目前密碼<input className="cy-op-input" type="password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} required /></label>
          <div className="cy-op-form-footer"><button className="cy-op-button primary" disabled={busy} aria-busy={busy || undefined}>寄送驗證碼</button></div>
        </form> : <form onKeyDown={enterAdvancesThenSubmits} className="cy-op-form" onSubmit={confirmEmail}>
          <label>6 位數驗證碼<input className="cy-op-input" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} required /></label>
          <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={() => { setChallengeId(null); setOtp(""); setVerifyingCurrentEmail(false); }}>返回</button><button className="cy-op-button primary" disabled={busy || otp.length !== 6} aria-busy={busy || undefined}>確認驗證</button></div>
        </form>}
      </section>
    </div>
  </>;
}

// ---------- 使用者：左清單、右明細 ----------

interface UserWorkspaceProps {
  snapshot: IdentityAdminSnapshot;
  session: AuthSession;
  refresh: () => Promise<void>;
}

function UserWorkspace({ snapshot, session, refresh }: UserWorkspaceProps) {
  const isSuperAdmin = session.user.workspaceRole === "SUPER_ADMIN";
  const canIdentityAdmin = isSuperAdmin || session.user.isIdentityAdmin;
  const pane = useMasterDetailPane();
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(snapshot.employees[0]?.employee_id ?? null);
  const [busy, setBusy] = useState(false);
  const { pending, track } = usePendingAction();
  const [message, setMessage, reportError, messageTone] = useFeedbackMessage<string | null>(null);
  const { confirm, confirmationDialog } = useConfirmation();
  const { ask, promptDialog } = useFormPrompt();
  const [createOpen, setCreateOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  // A newly created account is selected once the refreshed snapshot contains it.
  const [selectNo, setSelectNo] = useState<string | null>(null);
  useEffect(() => {
    if (!selectNo) return;
    const row = snapshot.employees.find((item) => item.employee_no === selectNo);
    if (row) { setSelectedId(row.employee_id); setSelectNo(null); }
  }, [snapshot, selectNo]);

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
  const selected = snapshot.employees.find((row) => row.employee_id === selectedId) ?? null;

  function manageable(row: IdentityEmployeeRow): boolean {
    if (row.workspace_role === "SUPER_ADMIN" || row.employee_id === session.user.employeeId) return false;
    if (isSuperAdmin) return true;
    if (session.user.isIdentityAdmin) return row.identity_admin !== 1;
    return row.workspace_role === "USER" && row.identity_admin !== 1;
  }

  /** Every account action: one busy flag, a result line, and a fresh snapshot. */
  async function act(work: () => Promise<string | null>) {
    setBusy(true); setMessage(null);
    try {
      const done = await work();
      if (done) setMessage(done);
      await refresh();
    } catch (error) { reportError(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function editPending(row: IdentityEmployeeRow) {
    const answer = await ask({ title: "修改尚未啟用的帳號", description: "Email 變更後會寄出新的驗證信，先前的首次登入密碼會失效。",
      fields: [
        { name: "employeeNo", label: "員工編號", defaultValue: row.employee_no, required: true, inputMode: "numeric" },
        { name: "name", label: "姓名", defaultValue: row.name, required: true },
        { name: "email", label: "Email", defaultValue: row.email_normalized, required: true },
      ], confirmLabel: "儲存" });
    if (!answer) return;
    await act(async () => {
      const result = await updateIdentityEmployee(row.employee_id, { employeeNo: answer.employeeNo, displayName: answer.name, email: answer.email, revision: row.revision });
      if (result.emailVerificationDelivery?.sent === false) reportError("帳號資料已更新，但驗證信未能寄出，請稍後按「重寄驗證 Email」。");
      return result.emailVerificationDelivery?.sent ? "資料已更新，新的驗證信已寄出；舊的首次登入密碼已失效。" : "資料已更新。";
    });
  }
  const resendInvite = (row: IdentityEmployeeRow) => act(async () => {
    const result = await resendEmployeeEmailVerification(row.employee_id);
    if (!result.emailVerificationDelivery.sent) { reportError("驗證信未能寄出，請稍後重試；請勿繼續使用先前的首次登入密碼。"); return null; }
    return "驗證信已重新寄出，先前的首次登入密碼已失效。";
  });
  async function deleteEmployee(row: IdentityEmployeeRow) {
    if (!await confirm({ title: "刪除使用者帳號", confirmTone: "danger",
      description: `確定刪除「${row.employee_no} ${row.name}」？刪除後將無法登入；重新新增會是全新帳號，不會繼承原有使用權。`,
      confirmLabel: "刪除帳號", cancelLabel: "保留帳號" })) return;
    await act(async () => { await deleteIdentityEmployee(row.employee_id); setSelectedId(null); pane.close(); return "使用者帳號已刪除。"; });
  }
  async function toggleEnabled(row: IdentityEmployeeRow) {
    if (row.enabled === 1 && !await confirm({ title: `停用 ${row.name}`, description: "停用後立即無法登入，所有使用權保留；之後可以再啟用。",
      confirmLabel: "停用帳號", confirmTone: "danger" })) return;
    await act(async () => { await updateIdentityEmployee(row.employee_id, { enabled: row.enabled !== 1, revision: row.revision }); return row.enabled === 1 ? "帳號已停用。" : "帳號已啟用。"; });
  }
  const changeRole = (row: IdentityEmployeeRow, nextRole: "USER" | "ADMIN") => act(async () => {
    await updateIdentityEmployee(row.employee_id, { roleKey: nextRole, revision: row.revision });
    return `已改為${permissionLabel(nextRole)}。`;
  });
  const setIdentityAdmin = (row: IdentityEmployeeRow, enabled: boolean) => act(async () => {
    await setEmployeeIdentityAdmin(row.employee_id, enabled);
    return enabled ? "已設為帳號管理員。" : "已撤銷帳號管理員。";
  });
  async function recoverEmail(row: IdentityEmployeeRow) {
    const answer = await ask({ title: `替 ${row.employee_no} ${row.name} 更換 Email`,
      description: "變更後會立即登出此使用者，並要求以新 Email 重新驗證。",
      fields: [{ name: "email", label: "新的 Email", defaultValue: row.email_normalized, required: true }], confirmLabel: "更換並登出", confirmTone: "danger" });
    const nextEmail = answer?.email ?? "";
    if (!nextEmail || nextEmail === row.email_normalized) return;
    await act(async () => {
      const result = await forceEmployeeEmailRecovery(row.employee_id, nextEmail);
      if (!result.verificationDelivery.sent) { reportError("Email 已變更並撤銷原有登入，但驗證信未能寄出，請稍後按「重寄 Email 驗證」。"); return null; }
      return "Email 已更換，新 Email 驗證信已寄出。";
    });
  }
  const resendVerification = (row: IdentityEmployeeRow) => act(async () => {
    const result = await resendActivatedEmailVerification(row.employee_id);
    if (!result.verificationDelivery.sent) { reportError("Email 驗證信未能寄出，請稍後重試。"); return null; }
    return "Email 驗證信已重新寄出。";
  });

  function select(row: IdentityEmployeeRow) { setSelectedId(row.employee_id); setMessage(null); pane.open(); }

  const selectedState = selected ? stateOf(selected) : null;
  const own = selected?.employee_id === session.user.employeeId;
  const rowManageable = selected ? manageable(selected) : false;
  const isPending = selected ? !selected.activated_at : false;
  const canRecover = !!selected && canIdentityAdmin && selected.workspace_role !== "SUPER_ADMIN" && !own && !isPending;
  const canChangeRole = !!selected && canIdentityAdmin && rowManageable && selected.identity_admin !== 1;
  const nextStep = !selected || own ? null : isPending ? "等待本人用驗證信完成首次登入；沒收到可以「重寄驗證 Email」。"
    : accountState(selected) === "unverified" ? "Email 尚未驗證，密碼找回等功能暫停；可以「重寄 Email 驗證」。"
    : accountState(selected) === "disabled" ? "已停用，無法登入；使用權仍保留，需要時按「啟用」。" : null;
  const button = (key: string, label: string, onClick: () => Promise<void>, tone = "") =>
    <button type="button" className={`cy-op-button ${tone}`} disabled={busy} aria-busy={(busy && pending === key) || undefined}
      onClick={() => track(key, onClick())}>{label}</button>;

  return <>
    {confirmationDialog}
    {promptDialog}
    <PagePrimaryActions><button type="button" className="cy-op-button primary" disabled={busy} onClick={() => setCreateOpen(true)}>＋ 新增使用者</button></PagePrimaryActions>
    {createOpen ? <CreateUserDialog canIdentityAdmin={canIdentityAdmin} onClose={() => setCreateOpen(false)}
      onCreated={async (employeeNo, done) => { setCreateOpen(false); setMessage(done); setSelectNo(employeeNo); await refresh(); }}
      reportError={reportError} /> : null}
    {transferOpen ? <TransferDialog employees={snapshot.employees} onClose={() => setTransferOpen(false)} /> : null}
    <FeedbackBanner message={message} tone={messageTone} />
    {snapshot.testingAccountDeletionAllowed === true && isSuperAdmin ? <p className="cy-identity-intro">測試期間可刪除已啟用的帳號；刪除後可重新新增。</p> : null}
    <div className="cy-md" data-pane={pane.pane}>
      <section className="cy-op-panel cy-md-list" aria-label="使用者清單">
        <div className="cy-md-toolbar">
          <input className="cy-op-input" type="search" aria-label="搜尋使用者" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋編號、姓名、Email" />
          <StatusFilter label="帳號狀態" options={accountStates} counts={counts} value={stateFilter} onChange={setStateFilter} />
          <div className="cy-md-count">共 {rows.length} 位</div>
        </div>
        <div className="cy-op-list">
          {rows.map((row) => <button key={row.employee_id} type="button" className={`cy-op-list-row cy-status-row ${selectedId === row.employee_id ? "active" : ""}`}
            aria-current={selectedId === row.employee_id ? "true" : undefined} onClick={() => select(row)}>
            <strong>{row.name}{row.employee_id === session.user.employeeId ? "（你）" : ""}</strong>
            <span><span className="cy-mono">{row.employee_no}</span> · {permissionLabel(row.workspace_role)}{row.identity_admin === 1 ? " · 帳號管理員" : ""}</span>
            <StatusChip tone={stateOf(row).tone}>{stateOf(row).label}</StatusChip>
          </button>)}
          {rows.length === 0 ? <div className="cy-op-empty">沒有符合條件的使用者。</div> : null}
        </div>
      </section>
      <section className="cy-op-panel cy-md-detail">
        <MasterDetailBack label="使用者清單" disabled={busy} onBack={pane.close} />
        {selected && selectedState ? <div>
          <div className="cy-record-header">
            <div><h2>{selected.name}</h2><p><span className="cy-mono">{selected.employee_no}</span> · {selected.email_normalized}</p></div>
            <div className="cy-record-actions">
              <StatusChip tone={selectedState.tone}>{selectedState.label}</StatusChip>
              {selected.workspace_role === "SUPER_ADMIN" && isSuperAdmin ? <button type="button" className="cy-op-button" disabled={busy || !snapshot.employees.some(eligibleForTransfer)} onClick={() => setTransferOpen(true)}>移交超級管理員</button> : null}
              {isPending && rowManageable ? <>
                <button type="button" className="cy-op-button" disabled={busy} onClick={() => void editPending(selected)}>修改</button>
                {button("resendInvite", "重寄驗證 Email", () => resendInvite(selected))}
              </> : null}
              {!isPending && rowManageable ? button("toggle", selected.enabled === 1 ? "停用" : "啟用", () => toggleEnabled(selected), selected.enabled === 1 ? "danger" : "primary") : null}
              {rowManageable && (isPending || (isSuperAdmin && snapshot.testingAccountDeletionAllowed === true)) ? button("delete", "刪除", () => deleteEmployee(selected), "danger") : null}
            </div>
          </div>
          {own ? <p className="cy-next-step finished">這是你的帳號；密碼與 Email 請到「我的帳號」變更，自己的權限與使用權由其他管理員設定。</p>
            : nextStep ? <NextStep tone={selectedState.tone}>{nextStep}</NextStep> : null}

          <div className="cy-op-detail-grid">
            <div><span>權限</span>{canChangeRole
              ? <select className="cy-op-input compact" aria-label={`${selected.name} 的權限`} value={selected.role_key} disabled={busy}
                  onChange={(event) => void changeRole(selected, event.target.value as "USER" | "ADMIN")}><option value="USER">一般使用者</option><option value="ADMIN">管理員</option></select>
              : <strong>{permissionLabel(selected.workspace_role)}</strong>}</div>
            <div><span>帳號管理員</span><strong>{selected.workspace_role === "SUPER_ADMIN" ? "—" : selected.identity_admin === 1 ? "是" : "否"}</strong>
              {isSuperAdmin && selected.workspace_role === "ADMIN" && !own
                ? button("identityAdmin", selected.identity_admin === 1 ? "撤銷" : "設為帳號管理員", () => setIdentityAdmin(selected, selected.identity_admin !== 1), "compact quiet") : null}</div>
            <div><span>Email</span><strong>{selected.email_verified_at ? "已驗證" : "尚未驗證"}</strong>
              <span className="cy-identity-inline-actions">
                {canRecover ? <button type="button" className="cy-op-button compact quiet" disabled={busy} onClick={() => void recoverEmail(selected)}>更換 Email</button> : null}
                {canRecover && !selected.email_verified_at ? button("resendVerification", "重寄 Email 驗證", () => resendVerification(selected), "compact quiet") : null}
              </span></div>
          </div>

          {isSuperAdmin || session.user.isIdentityAdmin ? <>
            <ApplicationAccessSection snapshot={snapshot} employee={selected} own={own} onChange={act} />
            <ModuleAccessPanel employee={selected} own={own} onError={reportError} onSaved={setMessage} />
          </> : <p className="cy-identity-intro">系統與模組使用權由帳號管理員或超級管理員設定。</p>}
        </div> : <MasterDetailEmpty title="尚未選擇使用者" hint="從左側清單選一位，或按右上角「新增使用者」。" />}
      </section>
    </div>
  </>;
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
        <TextInput label="員工編號" inputMode="numeric" autoComplete="off" maxLength={4} value={employeeNo} onChange={(event) => setEmployeeNo(event.target.value.replace(/\D/g, "").slice(0, 4))} disabled={busy} autoFocus required />
        <TextInput label="姓名" autoComplete="off" value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={busy} required />
        <TextInput label="電子郵件" type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} required />
        <label>權限<select className="cy-op-input" value={canIdentityAdmin ? roleKey : "USER"} disabled={busy || !canIdentityAdmin} onChange={(event) => setRoleKey(event.target.value as "USER" | "ADMIN")}><option value="USER">一般使用者</option>{canIdentityAdmin ? <option value="ADMIN">管理員</option> : null}</select></label>
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
        {!challengeId ? <>
          <label>新的超級管理員<select className="cy-op-input" value={targetEmployeeId} disabled={busy} onChange={(event) => setTargetEmployeeId(event.target.value)}>{eligible.map((row) => <option key={row.employee_id} value={row.employee_id}>{row.employee_no} · {row.name}</option>)}</select></label>
          <label>目前超級管理員密碼<input className="cy-op-input" type="password" value={currentPassword} disabled={busy} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
        </> : <label>6 位數驗證碼<input className="cy-op-input" inputMode="numeric" maxLength={6} value={otp} disabled={busy} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} required autoFocus /></label>}
      </form>
    </Dialog>
  </>;
}

/** The selected person's access to other CY systems (CY Web itself is always available). */
function ApplicationAccessSection({ snapshot, employee, own, onChange }: {
  snapshot: IdentityAdminSnapshot;
  employee: IdentityEmployeeRow;
  own: boolean;
  onChange: (work: () => Promise<string | null>) => Promise<void>;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const applications = snapshot.applications.filter((app) => app.core_access_locked !== 1);
  const allowed = new Set(snapshot.directAccess.filter((row) => row.enabled === 1 && row.employee_id === employee.employee_id).map((row) => row.application_id));
  const superAdmin = employee.workspace_role === "SUPER_ADMIN";
  async function change(applicationId: string, name: string, enabled: boolean) {
    setSaving(applicationId);
    await onChange(async () => { await setEmployeeApplicationAccess(employee.employee_id, applicationId, enabled); return `${name}${enabled ? "已允許" : "已取消"}。`; });
    setSaving(null);
  }
  return <div className="cy-op-subsection">
    <h3>系統使用權</h3>
    <p className="cy-identity-intro">CY Web 所有啟用的使用者都能登入；其他志遠系統在這裡逐一開放。</p>
    {applications.length === 0 ? <p className="cy-identity-intro">目前沒有其他已登記的系統。</p> : <div className="cy-identity-access-list">
      {applications.map((app) => {
        const checked = superAdmin || allowed.has(app.application_id);
        return <label key={app.application_id} className="cy-identity-access-item">
          <input type="checkbox" checked={checked} disabled={superAdmin || own || saving !== null || app.enabled !== 1}
            onChange={(event) => void change(app.application_id, app.display_name, event.target.checked)} />
          <span>{app.display_name}</span>
          {saving === app.application_id ? <span className="cy-loading-spinner" aria-hidden="true" /> : null}
          {superAdmin ? <small>超級管理員永遠可用</small> : app.enabled !== 1 ? <small>系統已停用</small> : null}
        </label>;
      })}
    </div>}
  </div>;
}

/** CY Web 模組使用權 for the selected person, grouped so 業務模組 and ERP 查詢 read separately. */
function ModuleAccessPanel({ employee, own, onError, onSaved }: {
  employee: IdentityEmployeeRow;
  own: boolean;
  onError: (message: string) => void;
  onSaved: (message: string) => void;
}) {
  const [view, setView] = useState<ModuleAccessAdminSnapshot | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setView(await loadModuleAccessAdminSnapshot()); }
    catch (error) { onError(messageOf(error)); }
  }, [onError]);
  useEffect(() => { void load(); }, [load]);

  const superAdmin = employee.workspace_role === "SUPER_ADMIN";
  const enabled = new Set((view?.grants ?? []).filter((row) => row.enabled === 1 && row.employee_id === employee.employee_id).map((row) => row.module_code));
  async function change(moduleCode: Parameters<typeof setEmployeeModuleAccess>[1], label: string, next: boolean) {
    setSaving(moduleCode);
    try {
      await setEmployeeModuleAccess(employee.employee_id, moduleCode, next);
      onSaved(`${label}${next ? "已允許" : "已取消"}，立即生效。`);
      await load();
    } catch (error) { onError(messageOf(error)); }
    finally { setSaving(null); }
  }
  const groups = view ? [
    { title: "業務模組", modules: view.modules.filter((module) => !module.code.startsWith("ERP_")) },
    { title: "ERP 查詢", modules: view.modules.filter((module) => module.code.startsWith("ERP_")) },
  ].filter((group) => group.modules.length) : [];

  return <div className="cy-op-subsection">
    <h3>CY Web 模組使用權</h3>
    <p className="cy-identity-intro">{superAdmin ? "超級管理員固定可用所有模組。" : own ? "自己的模組使用權由其他帳號管理員設定。" : "勾選後立即生效。模組使用權與權限（管理員／一般使用者）各自獨立，改權限不會改這裡。"}</p>
    {!view ? <Loading inline /> : groups.map((group) => <fieldset key={group.title} className="cy-identity-module-group">
      <legend>{group.title}</legend>
      <div className="cy-identity-access-list">
        {group.modules.map((module) => <label key={module.code} className="cy-identity-access-item">
          <input type="checkbox" checked={superAdmin || enabled.has(module.code)} disabled={superAdmin || own || saving !== null}
            onChange={(event) => void change(module.code, module.label, event.target.checked)} />
          <span>{module.label}</span>
          {saving === module.code ? <span className="cy-loading-spinner" aria-hidden="true" /> : null}
        </label>)}
      </div>
    </fieldset>)}
  </div>;
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
    <div className="cy-op-panel-header"><div><h3>已登記的系統</h3><p>員工能使用的志遠系統。CY Web 是固定啟用的核心入口。</p></div>
      <button type="button" className="cy-op-button" disabled={busy} onClick={() => { setRegistration({ applicationId: "", displayName: "" }); setRegistrationError(null); }}>＋ 登記系統</button></div>
    <FeedbackBanner message={message} tone={messageTone} />
    <div className="cy-op-table-wrap"><table className="cy-op-table"><thead><tr><th>系統</th><th>識別碼</th><th>狀態</th></tr></thead>
      <tbody>{snapshot.applications.map((app) => <tr key={app.application_id}><td>{app.display_name}</td><td className="cy-mono">{app.application_id}</td>
        <td><StatusChip tone={app.enabled === 1 ? "success" : "neutral"}>{app.core_access_locked === 1 ? "核心・固定啟用" : app.enabled === 1 ? "啟用" : "停用"}</StatusChip></td></tr>)}</tbody></table></div>
    {registration ? <Dialog open title="登記並啟用系統" size="small" dismissible={!busy} onClose={() => void close()}
      description="為目前 Workspace 加入系統。超級管理員可直接使用；其他員工仍須另外開放使用權。已停用的系統重新登記後會啟用，原有使用權會保留。"
      footer={<div className="cy-dialog-action-row"><button type="button" className="cy-op-button" disabled={busy} onClick={() => void close()}>取消</button><button type="submit" form={formId} className="cy-op-button primary" disabled={busy} aria-busy={busy || undefined}>登記並啟用</button></div>}>
      <form onKeyDown={enterAdvancesFields} id={formId} className="cy-form-grid" onSubmit={(event) => void register(event)}>
        <div className="cy-form-grid-full"><TextInput label="系統識別碼" description="使用該系統核准的識別碼，由英文字母、數字、底線或連字號組成。" value={registration.applicationId} maxLength={64} required disabled={busy} autoFocus onChange={(event) => setRegistration({ ...registration, applicationId: event.target.value })} /></div>
        <div className="cy-form-grid-full"><TextInput label="顯示名稱" value={registration.displayName} maxLength={120} required disabled={busy} onChange={(event) => setRegistration({ ...registration, displayName: event.target.value })} /></div>
        {registrationError ? <p className="cy-form-grid-full cy-notice cy-notice-danger" role="alert">{registrationError}</p> : null}
      </form>
    </Dialog> : null}
  </section>;
}

function SecurityPanel() {
  const [view, setView] = useState<SecurityPolicyView | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage, reportError, messageTone] = useFeedbackMessage<string | null>(null);
  useEffect(() => { void loadSecurityPolicy().then(setView).catch((e) => reportError(messageOf(e))); }, []);

  async function save(event: FormEvent) {
    event.preventDefault(); if (!view) return; setBusy(true); setMessage(null);
    try {
      const updated = await updateSecurityPolicy({
        otpResendCooldownSeconds: view.policy.otpResendCooldownSeconds,
        otpMaxAttempts: view.policy.otpMaxAttempts,
        otpMaxSentPerEmailPurposeHour: view.policy.otpMaxSentPerEmailPurposeHour,
        emailDailyLimit: view.policy.emailDailyLimit,
      });
      setView({ ...view, policy: updated.policy }); setMessage("驗證碼與 Email 安全設定已更新。");
    } catch (error) { reportError(messageOf(error)); }
    finally { setBusy(false); }
  }

  return <section className="cy-op-panel">
    <h3>驗證碼與 Email 安全設定</h3><p className="cy-identity-intro">限制驗證碼重寄與 Email 寄送次數，避免被濫用。每日 Email 不能超過系統上限。</p>
    <FeedbackBanner message={message} tone={messageTone} />
    {view ? <form onKeyDown={enterAdvancesFields} className="cy-identity-policy-grid" onSubmit={save}>
      <label>驗證碼重寄間隔（秒）<input className="cy-op-input" type="number" min={30} max={600} value={view.policy.otpResendCooldownSeconds} onChange={(e) => setView({ ...view, policy: { ...view.policy, otpResendCooldownSeconds: Number(e.target.value) } })} /></label>
      <label>驗證碼最多嘗試次數<input className="cy-op-input" type="number" min={3} max={10} value={view.policy.otpMaxAttempts} onChange={(e) => setView({ ...view, policy: { ...view.policy, otpMaxAttempts: Number(e.target.value) } })} /></label>
      <label>同一 Email、同一用途每小時最多<input className="cy-op-input" type="number" min={1} max={20} value={view.policy.otpMaxSentPerEmailPurposeHour} onChange={(e) => setView({ ...view, policy: { ...view.policy, otpMaxSentPerEmailPurposeHour: Number(e.target.value) } })} /></label>
      <label>每日 Email 上限<input className="cy-op-input" type="number" min={1} max={view.systemEmailDailyCeiling} value={view.policy.emailDailyLimit} onChange={(e) => setView({ ...view, policy: { ...view.policy, emailDailyLimit: Number(e.target.value) } })} /><small>系統上限：{view.systemEmailDailyCeiling}</small></label>
      <div className="cy-op-form-footer wide"><button className="cy-op-button primary" disabled={busy} aria-busy={busy || undefined}>儲存安全設定</button></div>
    </form> : <Loading />}
  </section>;
}

// ---------- Page ----------

type Tab = "users" | "self" | "system";

export function SharedIdentityPage({ session }: { session: AuthSession }) {
  const [snapshot, setSnapshot] = useState<IdentityAdminSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, , setError] = useFeedbackMessage<string | null>(null);
  const isWorkspaceAdmin = session.user.workspaceRole === "ADMIN" || session.user.workspaceRole === "SUPER_ADMIN";
  const isSuperAdmin = session.user.workspaceRole === "SUPER_ADMIN";
  const [tab, setTab] = useState<Tab>(isWorkspaceAdmin ? "users" : "self");

  const refresh = useCallback(async () => {
    if (!isWorkspaceAdmin) return;
    setLoading(true); setError(null);
    try { setSnapshot(await loadIdentityAdminSnapshot()); }
    catch (e) { setError(messageOf(e)); }
    finally { setLoading(false); }
  }, [isWorkspaceAdmin]);
  useEffect(() => { void refresh(); }, [refresh]);

  if (!isWorkspaceAdmin) return <div className="cy-identity-page"><SelfServicePanel session={session} /></div>;
  const tabs: readonly { key: Tab; label: string }[] = [
    { key: "users", label: "使用者" },
    { key: "self", label: "我的帳號" },
    ...(isSuperAdmin ? [{ key: "system" as const, label: "系統與安全" }] : []),
  ];
  return <div className="cy-identity-page">
    <div className="cy-op-tabs" role="tablist" aria-label="帳號與權限">
      {tabs.map((item) => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={tab === item.key ? "active" : ""} onClick={() => setTab(item.key)}>{item.label}</button>)}
    </div>
    {tab === "self" ? <SelfServicePanel session={session} /> : !snapshot ? (error
      ? <section className="cy-op-panel"><p className="cy-notice cy-notice-danger" role="alert">{error}</p><button type="button" className="cy-op-button" disabled={loading} aria-busy={loading || undefined} onClick={() => void refresh()}>重新讀取</button></section>
      : <Loading />)
      : tab === "users" ? <UserWorkspace snapshot={snapshot} session={session} refresh={refresh} />
      : <div className="cy-identity-admin-stack">
        <ApplicationRegistryPanel snapshot={snapshot} refresh={refresh} />
        <SecurityPanel />
        <CyInvoiceRecoveryAdminPanel key={JSON.stringify([session.user.workspaceId, session.user.employeeId, session.user.workspaceRole, session.user.emailVerified, session.user.isWorkspaceSuperAdmin])} session={session} />
      </div>}
  </div>;
}

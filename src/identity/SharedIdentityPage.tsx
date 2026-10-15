import { FormEvent, useCallback, useEffect, useId, useMemo, useState } from "react";
import { Dialog } from "../ui/overlays/Dialog";
import { useConfirmation } from "../ui/overlays/useConfirmation";
import { useUnsavedChangesGuard } from "../ui/foundation/useUnsavedChangesGuard";
import { TextInput } from "../ui/primitives/TextInput";
import { ToastRegion } from "../ui/feedback/ToastRegion";
import { useToastQueue } from "../ui/feedback/useToastQueue";
import { ApiClientError } from "../api/client";
import { loadModuleAccessAdminSnapshot, setEmployeeModuleAccess, type ModuleAccessAdminSnapshot } from "../access/module-access-client";
import type { AuthSession } from "../auth/auth-client";
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
  if (error instanceof ApiClientError) return error.message || error.code;
  return error instanceof Error ? error.message : "操作失敗";
}

function permissionLabel(role: "SUPER_ADMIN" | "ADMIN" | "USER"): string {
  if (role === "SUPER_ADMIN") return "超級管理員";
  if (role === "ADMIN") return "管理員";
  return "一般使用者";
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return <div className="cy-identity-section-title"><h2>{title}</h2><p>{description}</p></div>;
}

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
  const [message, setMessage] = useState<string | null>(null);

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) { setMessage("兩次新密碼不一致。"); return; }
    const length = Array.from(newPassword).length;
    if (length < 8 || length > 16) { setMessage("新密碼必須為 8～16 字元。"); return; }
    setBusy(true); setMessage(null);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      window.alert("密碼已變更，既有登入已撤銷，請重新登入。");
      window.location.reload();
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function startEmail(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null); setVerifyingCurrentEmail(false);
    try {
      const result = await startOwnEmailChange(emailPassword, newEmail);
      setChallengeId(result.verification.challengeId);
      setMessage("驗證碼已寄出，請輸入 Email 中的 6 位數驗證碼。");
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function verifyCurrentEmail() {
    setBusy(true); setMessage(null); setVerifyingCurrentEmail(true);
    try {
      const result = await startCurrentEmailVerification();
      setChallengeId(result.verification.challengeId);
      setMessage(result.reused ? "沿用已寄出的驗證碼，請輸入 6 位數驗證碼。" : "驗證碼已寄至目前 Email。");
    } catch (error) { setVerifyingCurrentEmail(false); setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function confirmEmail(event: FormEvent) {
    event.preventDefault();
    if (!challengeId || !/^\d{6}$/.test(otp)) return;
    setBusy(true); setMessage(null);
    try {
      await confirmOwnEmailChange(challengeId, otp);
      window.alert(verifyingCurrentEmail ? "Email 驗證完成，請重新登入。" : "Email 已更新，請重新登入。");
      window.location.reload();
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  return <>
    <SectionTitle title="我的帳號" description="所有 CYID 使用者都可進入 CY Web 管理自己的帳號；CY Web 不保存密碼或驗證碼。" />
    {!session.user.emailVerified ? <div className="cy-notice cy-notice-warning"><div className="cy-notice-title">Email 待重新驗證</div><div className="cy-notice-body">帳號已啟用，原密碼仍有效。請完成目前 Email 驗證，密碼找回等 Email 安全功能才會恢復正常。</div><button className="cy-op-button" type="button" disabled={busy} onClick={() => void verifyCurrentEmail()}>寄送 Email 驗證碼</button></div> : null}
    {message ? <div className="cy-identity-message" role="status">{message}</div> : null}
    <div className="cy-op-grid-two">
      <section className="cy-op-panel">
        <h3>變更密碼</h3>
        <form className="cy-op-form" onSubmit={submitPassword} noValidate>
          <label>目前密碼<input className="cy-op-input" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></label>
          <label>新密碼<input className="cy-op-input" type="password" autoComplete="new-password" maxLength={16} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></label>
          <label>確認新密碼<input className="cy-op-input" type="password" autoComplete="new-password" maxLength={16} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></label>
          <div className="cy-op-form-footer"><button className="cy-op-button primary" disabled={busy}>變更密碼</button></div>
        </form>
      </section>
      <section className="cy-op-panel">
        <h3>{verifyingCurrentEmail ? "驗證目前 Email" : "變更 Email"}</h3>
        {!challengeId ? <form className="cy-op-form" onSubmit={startEmail}>
          <label>新 Email<input className="cy-op-input" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required /></label>
          <label>目前密碼<input className="cy-op-input" type="password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} required /></label>
          <div className="cy-op-form-footer"><button className="cy-op-button primary" disabled={busy}>寄送驗證碼</button></div>
        </form> : <form className="cy-op-form" onSubmit={confirmEmail}>
          <label>6 位數驗證碼<input className="cy-op-input" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} required /></label>
          <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={() => { setChallengeId(null); setOtp(""); setVerifyingCurrentEmail(false); }}>返回</button><button className="cy-op-button primary" disabled={busy || otp.length !== 6}>確認驗證</button></div>
        </form>}
      </section>
    </div>
  </>;
}

function lifecycleStatus(row: IdentityEmployeeRow): string {
  if (!row.activated_at) return "Email 未驗證";
  if (row.enabled !== 1) return "停用";
  return row.email_verified_at ? "啟用" : "啟用 · Email 待驗證";
}

function EmployeeManagement({ snapshot, session, refresh }: {
  snapshot: IdentityAdminSnapshot;
  session: AuthSession;
  refresh: () => Promise<void>;
}) {
  const isSuperAdmin = session.user.workspaceRole === "SUPER_ADMIN";
  const canIdentityAdmin = isSuperAdmin || session.user.isIdentityAdmin;
  const [employeeNo, setEmployeeNo] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState<"USER" | "ADMIN">("USER");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [targetEmployeeId, setTargetEmployeeId] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [transferChallengeId, setTransferChallengeId] = useState<string | null>(null);
  const [transferOtp, setTransferOtp] = useState("");

  const superAdmin = snapshot.employees.find((row) => row.workspace_role === "SUPER_ADMIN") ?? null;
  const eligibleTransferEmployees = useMemo(
    () => snapshot.employees.filter((row) => row.workspace_role !== "SUPER_ADMIN" && Boolean(row.activated_at) && row.enabled === 1 && row.credential_present === 1 && Boolean(row.email_verified_at)),
    [snapshot.employees],
  );

  function manageable(row: IdentityEmployeeRow): boolean {
    if (row.workspace_role === "SUPER_ADMIN" || row.employee_id === session.user.employeeId) return false;
    if (isSuperAdmin) return true;
    if (session.user.isIdentityAdmin) return row.identity_admin !== 1;
    return row.workspace_role === "USER" && row.identity_admin !== 1;
  }

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const result = await createIdentityEmployee({ employeeNo, displayName, email, roleKey: canIdentityAdmin ? roleKey : "USER" });
      setEmployeeNo(""); setDisplayName(""); setEmail(""); setRoleKey("USER");
      setMessage(result.emailVerificationDelivery.sent
        ? "使用者已建立，Email 驗證信已寄出。請開啟 CY Web，使用信中的一次性首次登入密碼完成 Email 驗證並設定正式密碼。"
        : `使用者已建立，但驗證 Email 尚未寄出（${result.emailVerificationDelivery.errorCode ?? "寄送失敗"}）。可在下方按「重寄驗證 Email」。`);
      await refresh();
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function resend(row: IdentityEmployeeRow) {
    setBusy(true); setMessage(null);
    try { await resendEmployeeEmailVerification(row.employee_id); setMessage("驗證 Email 已重新寄出，先前的首次登入密碼已失效。"); }
    catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function editPending(row: IdentityEmployeeRow) {
    const nextNo = window.prompt("使用者編號", row.employee_no)?.trim();
    if (!nextNo) return;
    const nextName = window.prompt("姓名", row.name)?.trim();
    if (!nextName) return;
    const nextEmail = window.prompt("Email", row.email_normalized)?.trim();
    if (!nextEmail) return;
    setBusy(true); setMessage(null);
    try {
      const result = await updateIdentityEmployee(row.employee_id, {
        employeeNo: nextNo,
        displayName: nextName,
        email: nextEmail,
        revision: row.revision,
      });
      setMessage(result.emailVerificationDelivery?.sent
        ? "Email 未驗證資料已更新，新驗證 Email 已寄出；舊首次登入密碼已失效。"
        : "Email 未驗證資料已更新。若 Email 有變更，舊首次登入密碼已失效。");
      await refresh();
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  const { confirm: confirmDelete, confirmationDialog: deleteConfirmationDialog } = useConfirmation();
  async function deleteEmployee(row: IdentityEmployeeRow) {
    if (busy) return;
    if (!await confirmDelete({ title: "刪除使用者帳號", confirmTone: "danger",
      description: `確定刪除「${row.employee_no} ${row.name}」？刪除後將無法登入；重新新增會是全新帳號，不會繼承原有使用權。`,
      confirmLabel: "確定刪除帳號", cancelLabel: "保留帳號" })) return;
    setBusy(true); setMessage(null);
    try { await deleteIdentityEmployee(row.employee_id); setMessage("使用者帳號已刪除。"); await refresh(); }
    catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function toggle(row: IdentityEmployeeRow) {
    setBusy(true); setMessage(null);
    try {
      await updateIdentityEmployee(row.employee_id, { enabled: row.enabled !== 1, revision: row.revision });
      await refresh();
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function changeRole(row: IdentityEmployeeRow, nextRole: "USER" | "ADMIN") {
    if (row.role_key === nextRole) return;
    setBusy(true); setMessage(null);
    try { await updateIdentityEmployee(row.employee_id, { roleKey: nextRole, revision: row.revision }); await refresh(); }
    catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function identityAdmin(row: IdentityEmployeeRow, enabled: boolean) {
    setBusy(true); setMessage(null);
    try { await setEmployeeIdentityAdmin(row.employee_id, enabled); await refresh(); }
    catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function recoverEmail(row: IdentityEmployeeRow) {
    const nextEmail = window.prompt(`替 ${row.employee_no} ${row.name} 設定新的 Email`, row.email_normalized)?.trim();
    if (!nextEmail || nextEmail === row.email_normalized) return;
    if (!window.confirm("變更後會立即撤銷此使用者現有登入，並要求新 Email 重新驗證。確定繼續？")) return;
    setBusy(true); setMessage(null);
    try {
      const result = await forceEmployeeEmailRecovery(row.employee_id, nextEmail);
      setMessage(result.verificationDelivery.sent ? "Email 已替換，新 Email 驗證信已寄出。" : "Email 已替換並撤銷既有登入，但驗證信寄送失敗；可使用「重寄 Email 驗證」。");
      await refresh();
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function resendEmailVerification(row: IdentityEmployeeRow) {
    setBusy(true); setMessage(null);
    try { await resendActivatedEmailVerification(row.employee_id); setMessage("Email 驗證信已重新寄出。"); }
    catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function startTransfer(event: FormEvent) {
    event.preventDefault(); if (!targetEmployeeId) return;
    setBusy(true); setMessage(null);
    try {
      const result = await startHighestAuthorityTransfer(targetEmployeeId, currentPassword);
      setTransferChallengeId(result.transfer.challengeId); setCurrentPassword("");
      setMessage("移交驗證碼已寄至目前超級管理員的已驗證 Email。");
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function confirmTransfer(event: FormEvent) {
    event.preventDefault(); if (!transferChallengeId || !/^\d{6}$/.test(transferOtp)) return;
    setBusy(true); setMessage(null);
    try {
      await confirmHighestAuthorityTransfer(targetEmployeeId, transferChallengeId, transferOtp);
      window.alert("超級管理員已移交，目前登入已撤銷，請重新登入。");
      window.location.reload();
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  return <section className="cy-op-panel">
    <div className="cy-op-panel-header"><div><h3>使用者帳號</h3><p>新增時直接指定權限；系統會自動寄出 Email 驗證信與一次性首次登入密碼。一般管理員只能建立與管理一般使用者。</p></div></div>
    {deleteConfirmationDialog}
    {snapshot.testingAccountDeletionAllowed === true && isSuperAdmin ? <p>測試期間可刪除已驗證帳號；刪除後可重新新增測試。</p> : null}
    {message ? <div className="cy-identity-message" role="status">{message}</div> : null}
    <form className="cy-identity-create-row" onSubmit={create}>
      <input className="cy-op-input" inputMode="numeric" placeholder="4 碼使用者編號" maxLength={4} value={employeeNo} onChange={(e) => setEmployeeNo(e.target.value.replace(/\D/g, "").slice(0, 4))} required />
      <input className="cy-op-input" placeholder="姓名" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      <input className="cy-op-input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      {canIdentityAdmin ? <select className="cy-op-input" value={roleKey} onChange={(e) => setRoleKey(e.target.value as "USER" | "ADMIN")}><option value="USER">一般使用者</option><option value="ADMIN">管理員</option></select> : <div className="cy-identity-subtext">權限：一般使用者</div>}
      <button className="cy-op-button primary" disabled={busy}>新增使用者</button>
    </form>
    <div className="cy-identity-table-wrap"><table className="cy-op-table"><thead><tr><th>編號</th><th>姓名</th><th className="cy-identity-email-col">Email</th><th>權限</th><th>狀態</th><th>操作</th></tr></thead><tbody>{snapshot.employees.map((row) => {
      const pending = !row.activated_at;
      const rowManageable = manageable(row);
      const canRecover = canIdentityAdmin && row.workspace_role !== "SUPER_ADMIN" && row.employee_id !== session.user.employeeId && Boolean(row.activated_at);
      return <tr key={row.employee_id}>
        <td>{row.employee_no}</td>
        <td>{row.name}{row.identity_admin === 1 ? <small className="cy-identity-subtext">Identity Admin</small> : null}</td>
        <td className="cy-identity-email-col"><div className="cy-identity-email-line"><span className="cy-identity-email-value">{row.email_normalized}</span><span className={`cy-identity-email-tag ${row.email_verified_at ? "verified" : "unverified"}`}>{row.email_verified_at ? "已驗證" : "尚未驗證"}</span></div></td>
        <td>{row.workspace_role === "SUPER_ADMIN" ? "超級管理員" : canIdentityAdmin && rowManageable && row.identity_admin !== 1 ? <select className="cy-op-input compact" value={row.role_key} disabled={busy} onChange={(e) => void changeRole(row, e.target.value as "USER" | "ADMIN")}><option value="USER">一般使用者</option><option value="ADMIN">管理員</option></select> : permissionLabel(row.workspace_role)}</td>
        <td>{lifecycleStatus(row)}</td>
        <td><div className="cy-identity-actions">
          {row.workspace_role === "SUPER_ADMIN" && isSuperAdmin ? <button type="button" className="cy-op-button" disabled={busy || eligibleTransferEmployees.length === 0} onClick={() => { setTargetEmployeeId(eligibleTransferEmployees[0]?.employee_id ?? ""); setTransferOpen(true); }}>移交</button> : null}
          {pending && rowManageable ? <><button type="button" className="cy-op-button" disabled={busy} onClick={() => void editPending(row)}>編輯</button><button type="button" className="cy-op-button" disabled={busy} onClick={() => void resend(row)}>重寄驗證 Email</button></> : null}
          {rowManageable && (pending || (isSuperAdmin && snapshot.testingAccountDeletionAllowed === true)) ? <button type="button" className="cy-op-button danger" disabled={busy} onClick={() => void deleteEmployee(row)}>刪除</button> : null}
          {!pending && rowManageable ? <button type="button" className="cy-op-button" disabled={busy} onClick={() => void toggle(row)}>{row.enabled === 1 ? "停用" : "啟用"}</button> : null}
          {canRecover ? <button type="button" className="cy-op-button" disabled={busy} onClick={() => void recoverEmail(row)}>變更 Email</button> : null}
          {canRecover && !row.email_verified_at ? <button type="button" className="cy-op-button" disabled={busy} onClick={() => void resendEmailVerification(row)}>重寄 Email 驗證</button> : null}
          {isSuperAdmin && row.workspace_role === "ADMIN" && row.employee_id !== session.user.employeeId ? <button type="button" className="cy-op-button" disabled={busy} onClick={() => void identityAdmin(row, row.identity_admin !== 1)}>{row.identity_admin === 1 ? "撤銷 Identity Admin" : "設為 Identity Admin"}</button> : null}
        </div></td>
      </tr>;
    })}</tbody></table></div>

    {transferOpen && superAdmin ? <div className="cy-identity-modal-backdrop" role="presentation"><div className="cy-identity-modal" role="dialog" aria-modal="true">
      <div className="cy-identity-modal-header"><div><h3>移交超級管理員</h3><p>移交後立即生效，雙方既有 Identity Session 都會撤銷。</p></div><button type="button" className="cy-identity-modal-close" disabled={busy} onClick={() => setTransferOpen(false)}>×</button></div>
      {!transferChallengeId ? <form className="cy-op-form" onSubmit={startTransfer}>
        <label>新的超級管理員<select className="cy-op-input" value={targetEmployeeId} onChange={(e) => setTargetEmployeeId(e.target.value)}>{eligibleTransferEmployees.map((row) => <option key={row.employee_id} value={row.employee_id}>{row.employee_no} · {row.name}</option>)}</select></label>
        <label>目前超級管理員密碼<input className="cy-op-input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></label>
        <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={() => setTransferOpen(false)}>取消</button><button className="cy-op-button danger" disabled={busy}>寄送移交驗證碼</button></div>
      </form> : <form className="cy-op-form" onSubmit={confirmTransfer}>
        <label>6 位數驗證碼<input className="cy-op-input" inputMode="numeric" maxLength={6} value={transferOtp} onChange={(e) => setTransferOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} required /></label>
        <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={() => setTransferOpen(false)}>取消</button><button className="cy-op-button danger" disabled={busy || transferOtp.length !== 6}>確認移交</button></div>
      </form>}
    </div></div> : null}
  </section>;
}

function ApplicationAccessPanel({ snapshot, session, refresh }: {
  snapshot: IdentityAdminSnapshot;
  session: AuthSession;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [registration, setRegistration] = useState<{ applicationId: string; displayName: string } | null>(null);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const formId = useId();
  const isSuperAdmin = session.user.workspaceRole === "SUPER_ADMIN";
  const { confirm, confirmationDialog } = useConfirmation();
  const { toasts, pushToast, dismissToast } = useToastQueue();
  const registrationGuard = useUnsavedChangesGuard({
    active: !!registration && (registration.applicationId !== "" || registration.displayName !== ""),
    blocked: busy, message: "尚有未完成的系統登記，確定放棄？",
  });
  useEffect(() => { if (!isSuperAdmin) setRegistration(null); }, [isSuperAdmin]);
  const direct = useMemo(() => new Set(snapshot.directAccess.filter((row) => row.enabled === 1).map((row) => `${row.employee_id}:${row.application_id}`)), [snapshot.directAccess]);
  const applications = useMemo(() => snapshot.applications.filter((app) => app.core_access_locked !== 1), [snapshot.applications]);

  async function change(employeeId: string, applicationId: string, enabled: boolean) {
    setBusy(true); setMessage(null);
    try { await setEmployeeApplicationAccess(employeeId, applicationId, enabled); await refresh(); }
    catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function closeRegistration() {
    if (busy) return;
    const decision = await registrationGuard.confirmNavigationAsync(description => confirm({
      title: "放棄系統登記", description, confirmLabel: "放棄", confirmTone: "danger",
    }));
    if (decision.allowed) { setRegistration(null); setRegistrationError(null); }
  }

  async function register(event: FormEvent) {
    event.preventDefault();
    if (busy || !registration || !isSuperAdmin) return;
    const input = { applicationId: registration.applicationId.trim().toUpperCase(), displayName: registration.displayName.trim() };
    if (!/^[A-Z0-9_-]{2,64}$/.test(input.applicationId) || !input.displayName) {
      setRegistrationError("請填寫有效的系統識別碼與顯示名稱。"); return;
    }
    setBusy(true); setRegistrationError(null); setMessage(null);
    try {
      await registerWorkspaceApplication(input);
      setRegistration(null);
      pushToast({ message: "系統已登記並啟用，請在清單設定員工使用權。", tone: "success" });
      try { await refresh(); }
      catch { setMessage("系統已完成登記，但清單更新失敗；請重新整理此頁。"); }
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
    <div className="cy-op-panel-header"><div><h3>系統使用權</h3><p>Identity Admin 與超級管理員設定各系統准入；CY Web 是所有有效使用者固定可使用的核心帳號入口，因此不列入此表。</p></div>
      {isSuperAdmin ? <button type="button" className="cy-op-button" disabled={busy} onClick={() => { setRegistration({ applicationId: "", displayName: "" }); setRegistrationError(null); }}>登記系統</button> : null}
    </div>
    {confirmationDialog}
    <ToastRegion toasts={toasts} onDismiss={dismissToast} />
    {isSuperAdmin && registration ? <Dialog open title="登記並啟用系統" size="small" dismissible={!busy} onClose={() => void closeRegistration()}
      description="為目前 Workspace 加入系統。超級管理員可使用；其他員工仍須另外設定使用權。已停用的 Workspace 系統重新登記後會啟用，原有員工使用權會保留。"
      footer={<div className="cy-dialog-action-row"><button type="button" className="cy-op-button" disabled={busy} onClick={() => void closeRegistration()}>取消</button><button type="submit" form={formId} className="cy-op-button primary" disabled={busy}>{busy ? "登記中…" : "登記並啟用"}</button></div>}>
      <form id={formId} className="cy-form-grid" onSubmit={event => void register(event)}>
        <div className="cy-form-grid-full"><TextInput label="系統識別碼" description="使用該系統核准的識別碼，由英文字母、數字、底線或連字號組成。" value={registration.applicationId} maxLength={64} required disabled={busy} autoFocus onChange={event => setRegistration({ ...registration, applicationId: event.target.value })} /></div>
        <div className="cy-form-grid-full"><TextInput label="顯示名稱" value={registration.displayName} maxLength={120} required disabled={busy} onChange={event => setRegistration({ ...registration, displayName: event.target.value })} /></div>
        {registrationError ? <p className="cy-form-grid-full" role="alert">{registrationError}</p> : null}
      </form>
    </Dialog> : null}
    {message ? <div className="cy-identity-message">{message}</div> : null}
    <div className="cy-identity-table-wrap"><table className="cy-op-table cy-identity-access-table"><thead><tr><th className="cy-access-user-col">使用者</th><th className="cy-access-permission-col">權限</th>{applications.map((app) => <th className="cy-access-app-col" key={app.application_id}>{app.display_name}</th>)}</tr></thead><tbody>{snapshot.employees.map((employee) => <tr key={employee.employee_id}><td>{employee.employee_no} {employee.name}</td><td>{permissionLabel(employee.workspace_role)}{employee.identity_admin === 1 ? <small className="cy-identity-subtext">Identity Admin</small> : null}</td>{applications.map((app) => {
      const sa = employee.workspace_role === "SUPER_ADMIN";
      if (sa) return <td key={app.application_id}><span className="cy-identity-access-fixed">永遠允許</span></td>;
      const own = employee.employee_id === session.user.employeeId;
      const checked = direct.has(`${employee.employee_id}:${app.application_id}`);
      const disabled = busy || app.enabled !== 1 || own;
      const title = own ? "Identity Admin 不可修改自己的 Access" : undefined;
      return <td key={app.application_id}><label title={title}><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => void change(employee.employee_id, app.application_id, e.target.checked)} /></label></td>;
    })}</tr>)}</tbody></table></div>
    <p className="cy-identity-subtext">CY Web 各業務 Module Access 由 CY Web 自己管理；本階段先完成 Identity/App Access 切換，不在 CYID 建立細部模組權限。</p>
  </section>;
}

function ModuleAccessPanel({ snapshot, session }: {
  snapshot: IdentityAdminSnapshot;
  session: AuthSession;
}) {
  const [view, setView] = useState<ModuleAccessAdminSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setMessage(null);
    try { setView(await loadModuleAccessAdminSnapshot()); }
    catch (error) { setMessage(messageOf(error)); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const enabled = useMemo(
    () => new Set((view?.grants ?? []).filter((row) => row.enabled === 1).map((row) => `${row.employee_id}:${row.module_code}`)),
    [view],
  );

  async function change(employeeId: string, moduleCode: Parameters<typeof setEmployeeModuleAccess>[1], next: boolean) {
    setBusy(true); setMessage(null);
    try {
      const result = await setEmployeeModuleAccess(employeeId, moduleCode, next);
      setMessage(result.access.enabled
        ? `${moduleCode} 已允許；後續 request 立即生效。`
        : `${moduleCode} 已取消；後續 request 立即生效。`);
      await load();
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  return <section className="cy-op-panel">
    <div className="cy-op-panel-header"><div><h3>CY Web 模組使用權</h3><p>這裡只管理 CY Web 內的業務模組。Identity Admin／超級管理員可設定他人的 Module Access；一般管理員沒有此管理權。</p></div><button type="button" className="cy-op-button" disabled={busy} onClick={() => void load()}>重新整理</button></div>
    {message ? <div className="cy-identity-message" role="status">{message}</div> : null}
    {view ? <div className="cy-identity-table-wrap"><table className="cy-op-table cy-identity-access-table">
      <thead><tr><th className="cy-access-user-col">使用者</th><th className="cy-access-permission-col">權限</th>{view.modules.map((module) => <th className="cy-access-app-col" key={module.code}>{module.label}</th>)}</tr></thead>
      <tbody>{snapshot.employees.map((employee) => {
        const own = employee.employee_id === session.user.employeeId;
        const superAdmin = employee.workspace_role === "SUPER_ADMIN";
        return <tr key={employee.employee_id}>
          <td>{employee.employee_no} {employee.name}</td>
          <td>{permissionLabel(employee.workspace_role)}{employee.identity_admin === 1 ? <small className="cy-identity-subtext">Identity Admin</small> : null}</td>
          {view.modules.map((module) => {
            if (superAdmin) return <td key={module.code}><span className="cy-identity-access-fixed">永遠允許</span></td>;
            const checked = enabled.has(`${employee.employee_id}:${module.code}`);
            const disabled = busy || own;
            const title = own ? "Identity Admin 不可修改自己的 Module Access" : `${module.label} Module Access`;
            return <td key={module.code}><label title={title}><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => void change(employee.employee_id, module.code, event.target.checked)} /></label></td>;
          })}
        </tr>;
      })}</tbody>
    </table></div> : <p>{message ? "Module Access 尚未載入。" : "正在讀取 Module Access…"}</p>}
    <p className="cy-identity-subtext">模組權限與 Workspace Role、CYID App Access 是獨立維度；Role 升降不會自動重算這張表。Super Admin 全模組固定允許。</p>
  </section>;
}

function SecurityPanel() {
  const [view, setView] = useState<SecurityPolicyView | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { void loadSecurityPolicy().then(setView).catch((e) => setMessage(messageOf(e))); }, []);

  async function save(event: FormEvent) {
    event.preventDefault(); if (!view) return; setBusy(true); setMessage(null);
    try {
      const updated = await updateSecurityPolicy({
        otpResendCooldownSeconds: view.policy.otpResendCooldownSeconds,
        otpMaxAttempts: view.policy.otpMaxAttempts,
        otpMaxSentPerEmailPurposeHour: view.policy.otpMaxSentPerEmailPurposeHour,
        emailDailyLimit: view.policy.emailDailyLimit,
      });
      setView({ ...view, policy: updated.policy }); setMessage("OTP 安全設定已更新。");
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  return <section className="cy-op-panel">
    <h3>Identity 安全設定</h3><p>僅 Super Admin 可設定。全域 Email 上限仍由系統安全設定控制。</p>
    {message ? <div className="cy-identity-message">{message}</div> : null}
    {view ? <form className="cy-identity-policy-grid" onSubmit={save}>
      <label>OTP 重寄冷卻（秒）<input className="cy-op-input" type="number" min={30} max={600} value={view.policy.otpResendCooldownSeconds} onChange={(e) => setView({ ...view, policy: { ...view.policy, otpResendCooldownSeconds: Number(e.target.value) } })} /></label>
      <label>OTP 最大嘗試次數<input className="cy-op-input" type="number" min={3} max={10} value={view.policy.otpMaxAttempts} onChange={(e) => setView({ ...view, policy: { ...view.policy, otpMaxAttempts: Number(e.target.value) } })} /></label>
      <label>同 Email／用途每小時上限<input className="cy-op-input" type="number" min={1} max={20} value={view.policy.otpMaxSentPerEmailPurposeHour} onChange={(e) => setView({ ...view, policy: { ...view.policy, otpMaxSentPerEmailPurposeHour: Number(e.target.value) } })} /></label>
      <label>Workspace 每日 Email 上限<input className="cy-op-input" type="number" min={1} max={view.systemEmailDailyCeiling} value={view.policy.emailDailyLimit} onChange={(e) => setView({ ...view, policy: { ...view.policy, emailDailyLimit: Number(e.target.value) } })} /><small>系統上限：{view.systemEmailDailyCeiling}</small></label>
      <div className="cy-op-form-footer wide"><button className="cy-op-button primary" disabled={busy}>儲存 OTP 設定</button></div>
    </form> : <p>讀取中…</p>}
  </section>;
}

export function SharedIdentityPage({ session }: { session: AuthSession }) {
  const [snapshot, setSnapshot] = useState<IdentityAdminSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isWorkspaceAdmin = session.user.workspaceRole === "ADMIN" || session.user.workspaceRole === "SUPER_ADMIN";
  const canManageAccess = session.user.workspaceRole === "SUPER_ADMIN" || session.user.isIdentityAdmin;

  const refresh = useCallback(async () => {
    if (!isWorkspaceAdmin) return;
    setLoading(true); setError(null);
    try { setSnapshot(await loadIdentityAdminSnapshot()); }
    catch (e) { setError(messageOf(e)); }
    finally { setLoading(false); }
  }, [isWorkspaceAdmin]);

  useEffect(() => { void refresh(); }, [refresh]);

  return <div className="cy-identity-page">
    <div className="cy-op-page-header"><div><h1>帳號與權限</h1><p>CYID 身分、Email 與系統准入的管理入口。</p></div>{isWorkspaceAdmin ? <button className="cy-op-button" disabled={loading} onClick={() => void refresh()}>重新整理</button> : null}</div>
    <SelfServicePanel session={session} />
    {isWorkspaceAdmin ? <>
      <SectionTitle title="Workspace 管理" description={canManageAccess ? "管理使用者生命週期、權限與系統准入。" : "一般管理員可管理一般使用者帳號生命週期；Access 由 Identity Admin / 超級管理員管理。"} />
      {error ? <div className="cy-identity-message error">{error}</div> : null}
      {snapshot ? <div className="cy-identity-admin-stack">
        <EmployeeManagement snapshot={snapshot} session={session} refresh={refresh} />
        {canManageAccess ? <ApplicationAccessPanel snapshot={snapshot} session={session} refresh={refresh} /> : null}
        {canManageAccess ? <ModuleAccessPanel snapshot={snapshot} session={session} /> : null}
        {session.user.workspaceRole === "SUPER_ADMIN" ? <SecurityPanel /> : null}
      </div> : <section className="cy-op-panel"><p>{loading ? "正在讀取 Identity 資料…" : "尚未取得 Identity 管理資料。"}</p></section>}
    </> : null}
  </div>;
}

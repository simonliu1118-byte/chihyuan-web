import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../api/client";
import type { AuthSession } from "../auth/auth-client";
import {
  changeOwnPassword,
  confirmHighestAuthorityTransfer,
  confirmOwnEmailChange,
  createIdentityEmployee,
  createIdentityGroup,
  deletePendingIdentityEmployee,
  loadIdentityAdminSnapshot,
  loadSecurityPolicy,
  setApplicationCompatibilityRoleMode,
  setEmployeeApplicationAccess,
  setGroupApplicationAccess,
  setIdentityGroupMember,
  startHighestAuthorityTransfer,
  startOwnEmailChange,
  updateIdentityEmployee,
  updateIdentityGroup,
  updateSecurityPolicy,
  type IdentityAdminSnapshot,
  type IdentityApplicationRow,
  type IdentityEmployeeRow,
  type IdentityGroupRow,
  type SecurityPolicyView,
} from "./identity-client";

function messageOf(error: unknown): string {
  if (error instanceof ApiClientError) return error.message || error.code;
  return error instanceof Error ? error.message : "操作失敗";
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return <div className="cy-identity-section-title"><h2>{title}</h2><p>{description}</p></div>;
}

function SelfServicePanel() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
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
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      window.alert("密碼已變更，既有登入已撤銷，請重新登入。");
      window.location.reload();
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function startEmail(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const result = await startOwnEmailChange(emailPassword, newEmail);
      setChallengeId(result.verification.challengeId);
      setMessage("驗證碼已寄出，請輸入 Email 中的 6 位數驗證碼。");
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function confirmEmail(event: FormEvent) {
    event.preventDefault();
    if (!challengeId || !/^\d{6}$/.test(otp)) return;
    setBusy(true); setMessage(null);
    try {
      await confirmOwnEmailChange(challengeId, otp);
      window.alert("Email 已更新，既有登入已撤銷，請重新登入。");
      window.location.reload();
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  return <>
    <SectionTitle title="我的帳號" description="密碼與 Email 由 CYCloud Identity 管理；CY Web 不保存密碼或驗證碼。" />
    {message ? <div className="cy-identity-message" role="status">{message}</div> : null}
    <div className="cy-op-grid-two">
      <section className="cy-op-panel">
        <h3>變更密碼</h3>
        <form className="cy-op-form" onSubmit={submitPassword}>
          <label>目前密碼<input className="cy-op-input" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></label>
          <label>新密碼<input className="cy-op-input" type="password" autoComplete="new-password" minLength={8} maxLength={16} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></label>
          <label>確認新密碼<input className="cy-op-input" type="password" autoComplete="new-password" minLength={8} maxLength={16} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></label>
          <div className="cy-op-form-footer"><button className="cy-op-button primary" disabled={busy}>變更密碼</button></div>
        </form>
      </section>
      <section className="cy-op-panel">
        <h3>變更 Email</h3>
        {!challengeId ? <form className="cy-op-form" onSubmit={startEmail}>
          <label>新 Email<input className="cy-op-input" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required /></label>
          <label>目前密碼<input className="cy-op-input" type="password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} required /></label>
          <div className="cy-op-form-footer"><button className="cy-op-button primary" disabled={busy}>寄送驗證碼</button></div>
        </form> : <form className="cy-op-form" onSubmit={confirmEmail}>
          <p>驗證信已寄至 <strong>{newEmail}</strong>。</p>
          <label>6 位數驗證碼<input className="cy-op-input" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} required /></label>
          <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={() => { setChallengeId(null); setOtp(""); }}>返回</button><button className="cy-op-button primary" disabled={busy || otp.length !== 6}>確認變更</button></div>
        </form>}
      </section>
    </div>
  </>;
}

function EmployeeManagement({ snapshot, refresh, superAdminEmployeeId }: {
  snapshot: IdentityAdminSnapshot;
  refresh: () => Promise<void>;
  superAdminEmployeeId: string;
}) {
  const [employeeNo, setEmployeeNo] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [targetEmployeeId, setTargetEmployeeId] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [transferChallengeId, setTransferChallengeId] = useState<string | null>(null);
  const [transferOtp, setTransferOtp] = useState("");
  const [transferMessage, setTransferMessage] = useState<string | null>(null);

  const eligibleTransferEmployees = useMemo(
    () => snapshot.employees.filter((row) => row.employee_id !== superAdminEmployeeId && row.enabled === 1 && Boolean(row.email_verified_at)),
    [snapshot.employees, superAdminEmployeeId],
  );

  useEffect(() => {
    if (!transferOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) closeTransfer();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [transferOpen, busy]);

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      await createIdentityEmployee({ employeeNo, displayName, email });
      setEmployeeNo(""); setDisplayName(""); setEmail("");
      setMessage("員工已建立，目前為「尚未驗證／待啟用」。請由該員工在登入頁執行『啟用帳號』並設定自己的密碼。");
      await refresh();
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function toggle(row: IdentityEmployeeRow) {
    if (!row.email_verified_at) return;
    if (row.employee_id === superAdminEmployeeId) {
      setMessage("超級管理員不能直接停用；如需更換請先完成超級管理員移交。");
      return;
    }
    setBusy(true); setMessage(null);
    try {
      await updateIdentityEmployee(row.employee_id, {
        employeeNo: row.employee_no,
        displayName: row.name,
        enabled: row.enabled !== 1,
        revision: row.revision,
      });
      await refresh();
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function deletePending(row: IdentityEmployeeRow) {
    if (row.email_verified_at) return;
    const confirmed = window.confirm(`確定刪除尚未啟用的員工帳號「${row.employee_no} ${row.name}」？\n\n刪除後，該帳號必須重新建立才能啟用。`);
    if (!confirmed) return;
    setBusy(true); setMessage(null);
    try {
      await deletePendingIdentityEmployee(row.employee_id);
      setMessage(`已刪除尚未啟用的員工帳號 ${row.employee_no} ${row.name}。`);
      await refresh();
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  function openTransfer() {
    if (eligibleTransferEmployees.length === 0) return;
    setTargetEmployeeId(eligibleTransferEmployees[0]?.employee_id ?? "");
    setCurrentPassword("");
    setTransferChallengeId(null);
    setTransferOtp("");
    setTransferMessage(null);
    setTransferOpen(true);
  }

  function closeTransfer() {
    if (busy) return;
    setTransferOpen(false);
    setTargetEmployeeId("");
    setCurrentPassword("");
    setTransferChallengeId(null);
    setTransferOtp("");
    setTransferMessage(null);
  }

  async function startTransfer(event: FormEvent) {
    event.preventDefault();
    if (!targetEmployeeId) { setTransferMessage("請選擇新的超級管理員。"); return; }
    setBusy(true); setTransferMessage(null);
    try {
      const result = await startHighestAuthorityTransfer(targetEmployeeId, currentPassword);
      setTransferChallengeId(result.transfer.challengeId);
      setCurrentPassword("");
      setTransferMessage("移交驗證碼已寄至目前超級管理員的已驗證 Email。請輸入 6 位數驗證碼完成移交。");
    } catch (error) { setTransferMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function confirmTransfer(event: FormEvent) {
    event.preventDefault();
    if (!transferChallengeId || !targetEmployeeId || !/^\d{6}$/.test(transferOtp)) return;
    setBusy(true); setTransferMessage(null);
    try {
      await confirmHighestAuthorityTransfer(targetEmployeeId, transferChallengeId, transferOtp);
      window.alert("超級管理員已移交。Recovery Email 會跟隨新的超級管理員，目前登入已撤銷，請重新登入。");
      window.location.reload();
    } catch (error) { setTransferMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  const transferTarget = eligibleTransferEmployees.find((row) => row.employee_id === targetEmployeeId) ?? null;

  return <section className="cy-op-panel">
    <div className="cy-op-panel-header"><div><h3>員工帳號</h3><p>管理者只建立帳號資料；第一次密碼由員工透過 Email OTP 自行設定。超級管理員移交也在本表操作。</p></div></div>
    {message ? <div className="cy-identity-message" role="status">{message}</div> : null}
    <form className="cy-identity-create-row" onSubmit={create}>
      <input className="cy-op-input" inputMode="numeric" placeholder="4 碼員工編號" maxLength={4} value={employeeNo} onChange={(e) => setEmployeeNo(e.target.value.replace(/\D/g, "").slice(0, 4))} required />
      <input className="cy-op-input" placeholder="姓名" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      <input className="cy-op-input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <button className="cy-op-button primary" disabled={busy}>新增員工</button>
    </form>
    <div className="cy-identity-table-wrap"><table className="cy-op-table"><thead><tr><th>編號</th><th>姓名</th><th>Email</th><th>狀態</th><th>操作</th></tr></thead><tbody>{snapshot.employees.map((row) => {
      const isSuperAdmin = row.employee_id === superAdminEmployeeId;
      const pendingActivation = !row.email_verified_at;
      const status = pendingActivation
        ? "尚未驗證／待啟用"
        : isSuperAdmin
          ? "超級管理員 · 啟用"
          : row.enabled === 1 ? "啟用" : "停用";
      return <tr key={row.employee_id}>
        <td>{row.employee_no}</td>
        <td>{row.name}{isSuperAdmin ? <small className="cy-identity-subtext">超級管理員</small> : null}</td>
        <td>{row.email_normalized}<small className="cy-identity-subtext">{row.email_verified_at ? "已驗證" : "尚未驗證"}</small></td>
        <td>{status}</td>
        <td><div className="cy-identity-actions">
          {isSuperAdmin ? <button type="button" className="cy-op-button" disabled={busy || eligibleTransferEmployees.length === 0} title={eligibleTransferEmployees.length === 0 ? "目前沒有已啟用且 Email 已驗證的可移交員工" : "移交超級管理員"} onClick={openTransfer}>移交</button> : pendingActivation ? <button type="button" className="cy-op-button danger" disabled={busy} onClick={() => void deletePending(row)}>刪除</button> : <button type="button" className="cy-op-button" disabled={busy} onClick={() => void toggle(row)}>{row.enabled === 1 ? "停用" : "啟用"}</button>}
        </div></td>
      </tr>;
    })}</tbody></table></div>
    {transferOpen ? <div className="cy-identity-modal-backdrop" role="presentation">
      <div className="cy-identity-modal" role="dialog" aria-modal="true" aria-labelledby="cy-super-admin-transfer-title">
        <div className="cy-identity-modal-header">
          <div><h3 id="cy-super-admin-transfer-title">移交超級管理員</h3><p>只有已啟用、Email 已驗證且已完成密碼設定的員工可接任。</p></div>
          <button type="button" className="cy-identity-modal-close" aria-label="關閉" disabled={busy} onClick={closeTransfer}>×</button>
        </div>
        {transferMessage ? <div className="cy-identity-message" role="status">{transferMessage}</div> : null}
        <div className="cy-notice cy-notice-warning"><div className="cy-notice-title">移交後立即生效</div><div className="cy-notice-body">完成後 Recovery Email 會切換為新超級管理員的已驗證 Email，原超級管理員既有 Session 會撤銷。</div></div>
        {!transferChallengeId ? <form className="cy-op-form" onSubmit={startTransfer}>
          <label>新的超級管理員<select className="cy-op-input" value={targetEmployeeId} onChange={(e) => setTargetEmployeeId(e.target.value)} required>{eligibleTransferEmployees.map((row) => <option key={row.employee_id} value={row.employee_id}>{row.employee_no} · {row.name} · {row.email_normalized}</option>)}</select></label>
          <label>目前超級管理員密碼<input className="cy-op-input" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></label>
          <div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={closeTransfer}>取消</button><button className="cy-op-button danger" disabled={busy || !targetEmployeeId || !currentPassword}>寄送移交驗證碼</button></div>
        </form> : <form className="cy-op-form" onSubmit={confirmTransfer}>
          <p>準備移交給 <strong>{transferTarget ? `${transferTarget.employee_no} ${transferTarget.name}` : "所選員工"}</strong>。</p>
          <label>6 位數驗證碼<input className="cy-op-input" inputMode="numeric" maxLength={6} value={transferOtp} onChange={(e) => setTransferOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} required /></label>
          <div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={closeTransfer}>取消</button><button className="cy-op-button danger" disabled={busy || transferOtp.length !== 6}>確認移交</button></div>
        </form>}
      </div>
    </div> : null}
  </section>;
}

function GroupManagement({ snapshot, refresh, superAdminEmployeeId }: {
  snapshot: IdentityAdminSnapshot;
  refresh: () => Promise<void>;
  superAdminEmployeeId: string;
}) {
  const [groupKey, setGroupKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const membershipSet = useMemo(() => new Set(snapshot.memberships.map((row) => `${row.group_id}:${row.employee_id}`)), [snapshot.memberships]);
  const groupAccess = useMemo(() => new Map(snapshot.groupAccess.map((row) => [`${row.group_id}:${row.application_id}`, row])), [snapshot.groupAccess]);
  const directAccess = useMemo(() => new Set(snapshot.directAccess.filter((row) => row.enabled === 1).map((row) => `${row.employee_id}:${row.application_id}`)), [snapshot.directAccess]);

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      await createIdentityGroup({ groupKey, displayName, description: description || null });
      setGroupKey(""); setDisplayName(""); setDescription(""); await refresh();
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function toggleGroup(row: IdentityGroupRow) {
    setBusy(true); setMessage(null);
    try {
      await updateIdentityGroup(row.group_id, {
        groupKey: row.group_key,
        displayName: row.display_name,
        description: row.description,
        status: row.status === "active" ? "disabled" : "active",
        revision: row.revision,
      });
      await refresh();
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function membership(groupId: string, employeeId: string, enabled: boolean) {
    setBusy(true); setMessage(null);
    try { await setIdentityGroupMember(groupId, employeeId, enabled); await refresh(); }
    catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function groupApp(groupId: string, app: IdentityApplicationRow, enabled: boolean, role: "USER" | "ADMIN" | null) {
    setBusy(true); setMessage(null);
    try { await setGroupApplicationAccess(groupId, app.application_id, enabled, role); await refresh(); }
    catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function directApp(employeeId: string, appId: string, enabled: boolean) {
    setBusy(true); setMessage(null);
    try { await setEmployeeApplicationAccess(employeeId, appId, enabled); await refresh(); }
    catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  return <section className="cy-op-panel">
    <div className="cy-op-panel-header"><div><h3>權限組與系統使用權</h3><p>群組是可擴充的身分組；CYInvoice 類型的相容權限只在該系統的授權列設定 User / Admin。</p></div></div>
    {message ? <div className="cy-identity-message">{message}</div> : null}
    <form className="cy-identity-create-row" onSubmit={create}>
      <input className="cy-op-input" placeholder="Group Key，例如 SALES" value={groupKey} onChange={(e) => setGroupKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} required />
      <input className="cy-op-input" placeholder="群組名稱" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      <input className="cy-op-input" placeholder="說明（選填）" value={description} onChange={(e) => setDescription(e.target.value)} />
      <button className="cy-op-button primary" disabled={busy}>新增群組</button>
    </form>
    <div className="cy-identity-group-grid">{snapshot.groups.map((group) => <article className="cy-identity-group-card" key={group.group_id}>
      <div className="cy-op-panel-header"><div><h4>{group.display_name}</h4><p>{group.group_key}{group.description ? ` · ${group.description}` : ""}</p></div><button className="cy-op-button" disabled={busy} onClick={() => void toggleGroup(group)}>{group.status === "active" ? "停用群組" : "啟用群組"}</button></div>
      <h5>成員</h5><div className="cy-op-chip-list">{snapshot.employees.map((employee) => { const active = membershipSet.has(`${group.group_id}:${employee.employee_id}`); return <label className={`cy-identity-toggle-chip ${active ? "active" : ""}`} key={employee.employee_id}><input type="checkbox" checked={active} disabled={busy || group.status !== "active"} onChange={(e) => void membership(group.group_id, employee.employee_id, e.target.checked)} />{employee.employee_no} {employee.name}</label>; })}</div>
      <h5>系統使用權</h5>{snapshot.applications.map((app) => { const current = groupAccess.get(`${group.group_id}:${app.application_id}`); const enabled = current?.enabled === 1; const roleMode = app.compatibility_role_mode === "USER_ADMIN"; return <div className="cy-identity-access-row" key={app.application_id}><label><input type="checkbox" checked={enabled} disabled={busy || group.status !== "active" || app.enabled !== 1} onChange={(e) => void groupApp(group.group_id, app, e.target.checked, e.target.checked && roleMode ? (current?.application_role_key ?? "USER") : null)} /><span>{app.display_name}</span></label>{roleMode && enabled ? <select className="cy-op-input compact" value={current?.application_role_key ?? "USER"} disabled={busy} onChange={(e) => void groupApp(group.group_id, app, true, e.target.value as "USER" | "ADMIN")}><option value="USER">User</option><option value="ADMIN">Admin</option></select> : null}</div>; })}
    </article>)}</div>
    <div className="cy-identity-direct-access"><h4>個別系統使用權</h4><p>只有需要例外開放時使用；若系統採 User/Admin 相容模式，單獨授權預設視為 User。超級管理員不需要額外勾選，會自動擁有已啟用系統的使用權。</p><div className="cy-identity-table-wrap"><table className="cy-op-table"><thead><tr><th>員工</th>{snapshot.applications.map((app) => <th key={app.application_id}>{app.display_name}</th>)}</tr></thead><tbody>{snapshot.employees.map((employee) => <tr key={employee.employee_id}><td>{employee.employee_no} {employee.name}</td>{snapshot.applications.map((app) => {
      if (employee.employee_id === superAdminEmployeeId) return <td key={app.application_id}><span className="cy-identity-subtext">超級管理員自動允許</span></td>;
      const active = directAccess.has(`${employee.employee_id}:${app.application_id}`);
      return <td key={app.application_id}><input type="checkbox" checked={active} disabled={busy || app.enabled !== 1} onChange={(e) => void directApp(employee.employee_id, app.application_id, e.target.checked)} /></td>;
    })}</tr>)}</tbody></table></div></div>
  </section>;
}

function SecurityPanel({ snapshot }: { snapshot: IdentityAdminSnapshot }) {
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

  async function mode(app: IdentityApplicationRow, value: "USER_ADMIN" | null) {
    setBusy(true); setMessage(null);
    try { await setApplicationCompatibilityRoleMode(app.application_id, value); window.location.reload(); }
    catch (error) { setMessage(messageOf(error)); setBusy(false); }
  }

  return <section className="cy-op-panel">
    <h3>Identity 安全設定</h3><p>此區只對超級管理員呈現。全域 Email 上限由系統安全設定控制，這裡只能設較低的 Workspace 上限。</p>
    {message ? <div className="cy-identity-message">{message}</div> : null}
    {view ? <form className="cy-identity-policy-grid" onSubmit={save}>
      <label>OTP 重寄冷卻（秒）<input className="cy-op-input" type="number" min={30} max={600} value={view.policy.otpResendCooldownSeconds} onChange={(e) => setView({ ...view, policy: { ...view.policy, otpResendCooldownSeconds: Number(e.target.value) } })} /></label>
      <label>OTP 最大嘗試次數<input className="cy-op-input" type="number" min={3} max={10} value={view.policy.otpMaxAttempts} onChange={(e) => setView({ ...view, policy: { ...view.policy, otpMaxAttempts: Number(e.target.value) } })} /></label>
      <label>同 Email／用途每小時上限<input className="cy-op-input" type="number" min={1} max={20} value={view.policy.otpMaxSentPerEmailPurposeHour} onChange={(e) => setView({ ...view, policy: { ...view.policy, otpMaxSentPerEmailPurposeHour: Number(e.target.value) } })} /></label>
      <label>Workspace 每日 Email 上限<input className="cy-op-input" type="number" min={1} max={view.systemEmailDailyCeiling} value={view.policy.emailDailyLimit} onChange={(e) => setView({ ...view, policy: { ...view.policy, emailDailyLimit: Number(e.target.value) } })} /><small>系統上限：{view.systemEmailDailyCeiling}</small></label>
      <div className="cy-op-form-footer wide"><button className="cy-op-button primary" disabled={busy}>儲存 OTP 設定</button></div>
    </form> : <p>讀取中…</p>}
    <div className="cy-identity-role-modes"><h4>系統相容權限模式</h4>{snapshot.applications.map((app) => <div className="cy-identity-access-row" key={app.application_id}><span>{app.display_name}</span><select className="cy-op-input compact" value={app.compatibility_role_mode ?? ""} disabled={busy} onChange={(e) => void mode(app, e.target.value === "USER_ADMIN" ? "USER_ADMIN" : null)}><option value="">不使用</option><option value="USER_ADMIN">User / Admin</option></select></div>)}</div>
  </section>;
}

export function SharedIdentityPage({ session }: { session: AuthSession }) {
  const [snapshot, setSnapshot] = useState<IdentityAdminSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session.user.isWorkspaceSuperAdmin) return;
    setLoading(true); setError(null);
    try { setSnapshot(await loadIdentityAdminSnapshot()); }
    catch (e) { setError(messageOf(e)); }
    finally { setLoading(false); }
  }, [session.user.isWorkspaceSuperAdmin]);

  useEffect(() => { void refresh(); }, [refresh]);

  return <div className="cy-identity-page">
    <div className="cy-op-page-header"><div><h1>帳號與權限</h1><p>Shared Identity 帳號、Email、權限組與系統使用權的管理入口。</p></div>{session.user.isWorkspaceSuperAdmin ? <button className="cy-op-button" disabled={loading} onClick={() => void refresh()}>重新整理</button> : null}</div>
    <SelfServicePanel />
    {session.user.isWorkspaceSuperAdmin ? <>
      <SectionTitle title="Workspace 管理" description="以下設定由 CYCloud Identity 保存與驗證；CY Web 只提供管理介面。" />
      {error ? <div className="cy-identity-message error">{error}</div> : null}
      {snapshot ? <div className="cy-identity-admin-stack">
        <EmployeeManagement snapshot={snapshot} refresh={refresh} superAdminEmployeeId={session.user.employeeId} />
        <GroupManagement snapshot={snapshot} refresh={refresh} superAdminEmployeeId={session.user.employeeId} />
        <SecurityPanel snapshot={snapshot} />
      </div> : <section className="cy-op-panel"><p>{loading ? "正在讀取 Identity 資料…" : "尚未取得 Identity 管理資料。"}</p></section>}
    </> : null}
  </div>;
}

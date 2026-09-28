import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../api/client";
import type { AuthSession } from "../auth/auth-client";
import {
  changeOwnPassword,
  confirmHighestAuthorityTransfer,
  confirmOwnEmailChange,
  createIdentityEmployee,
  createIdentityGroup,
  loadHighestAuthority,
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
  type HighestAuthorityView,
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

function EmployeeManagement({ snapshot, refresh, highestAuthorityEmployeeId }: {
  snapshot: IdentityAdminSnapshot;
  refresh: () => Promise<void>;
  highestAuthorityEmployeeId: string;
}) {
  const [employeeNo, setEmployeeNo] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      await createIdentityEmployee({ employeeNo, displayName, email });
      setEmployeeNo(""); setDisplayName(""); setEmail("");
      setMessage("員工已建立為待啟用狀態。請由該員工在登入頁執行『啟用帳號』並設定自己的密碼。");
      await refresh();
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function toggle(row: IdentityEmployeeRow) {
    if (row.employee_id === highestAuthorityEmployeeId && row.enabled === 1) {
      setMessage("目前最高權限帳號不能直接停用；請先完成最高管理權移交。");
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

  return <section className="cy-op-panel">
    <div className="cy-op-panel-header"><div><h3>員工帳號</h3><p>管理者只建立帳號資料；第一次密碼由員工透過 Email OTP 自行設定。</p></div></div>
    {message ? <div className="cy-identity-message">{message}</div> : null}
    <form className="cy-identity-create-row" onSubmit={create}>
      <input className="cy-op-input" inputMode="numeric" placeholder="4 碼員工編號" maxLength={4} value={employeeNo} onChange={(e) => setEmployeeNo(e.target.value.replace(/\D/g, "").slice(0, 4))} required />
      <input className="cy-op-input" placeholder="姓名" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      <input className="cy-op-input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <button className="cy-op-button primary" disabled={busy}>新增員工</button>
    </form>
    <div className="cy-identity-table-wrap"><table className="cy-op-table"><thead><tr><th>編號</th><th>姓名</th><th>Email</th><th>狀態</th><th>操作</th></tr></thead><tbody>{snapshot.employees.map((row) => {
      const isHighestAuthority = row.employee_id === highestAuthorityEmployeeId;
      return <tr key={row.employee_id}><td>{row.employee_no}</td><td>{row.name}{isHighestAuthority ? <small className="cy-identity-subtext">Workspace 最高權限</small> : null}</td><td>{row.email_normalized}<small className="cy-identity-subtext">{row.email_verified_at ? "已驗證" : "待驗證"}</small></td><td>{isHighestAuthority ? "最高權限 · 啟用" : row.enabled === 1 ? "啟用" : "停用／待啟用"}</td><td><button className="cy-op-button" disabled={busy || !row.email_verified_at || isHighestAuthority} onClick={() => void toggle(row)}>{isHighestAuthority ? "需先移交" : row.enabled === 1 ? "停用" : "啟用"}</button></td></tr>;
    })}</tbody></table></div>
  </section>;
}

function GroupManagement({ snapshot, refresh, highestAuthorityEmployeeId }: {
  snapshot: IdentityAdminSnapshot;
  refresh: () => Promise<void>;
  highestAuthorityEmployeeId: string;
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
    <div className="cy-identity-direct-access"><h4>個別系統使用權</h4><p>只有需要例外開放時使用；若系統採 User/Admin 相容模式，單獨授權預設視為 User。Workspace 最高權限不需要額外勾選，會自動擁有已啟用系統的使用權。</p><div className="cy-identity-table-wrap"><table className="cy-op-table"><thead><tr><th>員工</th>{snapshot.applications.map((app) => <th key={app.application_id}>{app.display_name}</th>)}</tr></thead><tbody>{snapshot.employees.map((employee) => <tr key={employee.employee_id}><td>{employee.employee_no} {employee.name}</td>{snapshot.applications.map((app) => {
      if (employee.employee_id === highestAuthorityEmployeeId) return <td key={app.application_id}><span className="cy-identity-subtext">最高權限自動允許</span></td>;
      const active = directAccess.has(`${employee.employee_id}:${app.application_id}`);
      return <td key={app.application_id}><input type="checkbox" checked={active} disabled={busy || app.enabled !== 1} onChange={(e) => void directApp(employee.employee_id, app.application_id, e.target.checked)} /></td>;
    })}</tr>)}</tbody></table></div></div>
  </section>;
}

function HighestAuthorityPanel({ snapshot, currentEmployeeId }: {
  snapshot: IdentityAdminSnapshot;
  currentEmployeeId: string;
}) {
  const [view, setView] = useState<HighestAuthorityView | null>(null);
  const [targetEmployeeId, setTargetEmployeeId] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const eligibleEmployees = useMemo(
    () => snapshot.employees.filter((row) => row.employee_id !== currentEmployeeId && row.enabled === 1 && Boolean(row.email_verified_at)),
    [snapshot.employees, currentEmployeeId],
  );

  useEffect(() => {
    void loadHighestAuthority().then(setView).catch((error) => setMessage(messageOf(error)));
  }, []);

  async function startTransfer(event: FormEvent) {
    event.preventDefault();
    if (!targetEmployeeId) { setMessage("請先選擇新的最高權限員工。"); return; }
    setBusy(true); setMessage(null);
    try {
      const result = await startHighestAuthorityTransfer(targetEmployeeId, currentPassword);
      setChallengeId(result.transfer.challengeId);
      setCurrentPassword("");
      setMessage("移交驗證碼已寄至目前最高權限帳號的已驗證 Email。請輸入 6 位數驗證碼完成移交。");
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  async function confirmTransfer(event: FormEvent) {
    event.preventDefault();
    if (!challengeId || !targetEmployeeId || !/^\d{6}$/.test(otp)) return;
    setBusy(true); setMessage(null);
    try {
      await confirmHighestAuthorityTransfer(targetEmployeeId, challengeId, otp);
      window.alert("Workspace 最高管理權已移交。Recovery Email 已跟隨新的最高權限帳號，目前登入已撤銷，請重新登入。");
      window.location.reload();
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }

  const target = eligibleEmployees.find((row) => row.employee_id === targetEmployeeId) ?? null;

  return <section className="cy-op-panel">
    <div className="cy-op-panel-header"><div><h3>Workspace 最高管理權</h3><p>目前最高權限帳號不可直接停用。需要更換時，必須先完成密碼再驗證與 Email OTP 移交。</p></div></div>
    {message ? <div className="cy-identity-message" role="status">{message}</div> : null}
    {view ? <div className="cy-op-detail-grid">
      <div><span>目前最高權限</span><strong>{snapshot.employees.find((row) => row.employee_id === view.authority.superAdminEmployeeId)?.employee_no ?? "—"} {snapshot.employees.find((row) => row.employee_id === view.authority.superAdminEmployeeId)?.name ?? ""}</strong></div>
      <div><span>Recovery Email</span><strong>{view.authority.recoveryEmail ?? "尚未設定"}</strong><small className="cy-identity-subtext">{view.authority.recoveryEmailVerified ? "已驗證" : "未驗證"}</small></div>
    </div> : <p>正在讀取最高管理權資料…</p>}
    <div className="cy-notice cy-notice-warning"><div className="cy-notice-title">移交後立即生效</div><div className="cy-notice-body">新的最高權限必須是已啟用、Email 已驗證且已有登入密碼的員工。移交完成後 Recovery Email 會改為新最高權限的已驗證 Email，舊最高權限的既有 Session 會撤銷。</div></div>
    {eligibleEmployees.length === 0 ? <p>目前沒有可移交的員工。請先建立並完成另一個員工帳號的啟用與 Email 驗證。</p> : !challengeId ? <form className="cy-op-form" onSubmit={startTransfer}>
      <label>新的最高權限員工<select className="cy-op-input" value={targetEmployeeId} onChange={(e) => setTargetEmployeeId(e.target.value)} required><option value="">請選擇</option>{eligibleEmployees.map((row) => <option key={row.employee_id} value={row.employee_id}>{row.employee_no} · {row.name} · {row.email_normalized}</option>)}</select></label>
      <label>目前最高權限密碼<input className="cy-op-input" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></label>
      <div className="cy-op-form-footer"><button className="cy-op-button danger" disabled={busy || !targetEmployeeId}>寄送移交驗證碼</button></div>
    </form> : <form className="cy-op-form" onSubmit={confirmTransfer}>
      <p>準備移交給 <strong>{target ? `${target.employee_no} ${target.name}` : "所選員工"}</strong>。</p>
      <label>6 位數驗證碼<input className="cy-op-input" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} required /></label>
      <div className="cy-op-form-footer"><button type="button" className="cy-op-button" disabled={busy} onClick={() => { setChallengeId(null); setOtp(""); }}>取消</button><button className="cy-op-button danger" disabled={busy || otp.length !== 6}>確認移交最高管理權</button></div>
    </form>}
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
    <h3>Identity 安全設定</h3><p>此區只對 Workspace 最高權限帳號呈現。全域 Email 上限由系統安全設定控制，這裡只能設較低的 Workspace 上限。</p>
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
        <EmployeeManagement snapshot={snapshot} refresh={refresh} highestAuthorityEmployeeId={session.user.employeeId} />
        <HighestAuthorityPanel snapshot={snapshot} currentEmployeeId={session.user.employeeId} />
        <GroupManagement snapshot={snapshot} refresh={refresh} highestAuthorityEmployeeId={session.user.employeeId} />
        <SecurityPanel snapshot={snapshot} />
      </div> : <section className="cy-op-panel"><p>{loading ? "正在讀取 Identity 資料…" : "尚未取得 Identity 管理資料。"}</p></section>}
    </> : null}
  </div>;
}

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../api/client";
import type { AuthSession } from "../auth/auth-client";
import {
  changeOwnPassword,
  confirmOwnEmailChange,
  createIdentityEmployee,
  createIdentityGroup,
  loadIdentityAdminSnapshot,
  loadSecurityPolicy,
  setApplicationCompatibilityRoleMode,
  setEmployeeApplicationAccess,
  setGroupApplicationAccess,
  setIdentityGroupMember,
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

function EmployeeManagement({ snapshot, refresh }: { snapshot: IdentityAdminSnapshot; refresh: () => Promise<void> }) {
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
    <div className="cy-identity-table-wrap"><table className="cy-op-table"><thead><tr><th>編號</th><th>姓名</th><th>Email</th><th>狀態</th><th>操作</th></tr></thead><tbody>{snapshot.employees.map((row) => <tr key={row.employee_id}><td>{row.employee_no}</td><td>{row.name}</td><td>{row.email_normalized}<small className="cy-identity-subtext">{row.email_verified_at ? "已驗證" : "待驗證"}</small></td><td>{row.enabled === 1 ? "啟用" : "停用／待啟用"}</td><td><button className="cy-op-button" disabled={busy || !row.email_verified_at} onClick={() => void toggle(row)}>{row.enabled === 1 ? "停用" : "啟用"}</button></td></tr>)}</tbody></table></div>
  </section>;
}

function GroupManagement({ snapshot, refresh }: { snapshot: IdentityAdminSnapshot; refresh: () => Promise<void> }) {
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
    <div className="cy-identity-direct-access"><h4>個別系統使用權</h4><p>只有需要例外開放時使用；若系統採 User/Admin 相容模式，單獨授權預設視為 User。</p><div className="cy-identity-table-wrap"><table className="cy-op-table"><thead><tr><th>員工</th>{snapshot.applications.map((app) => <th key={app.application_id}>{app.display_name}</th>)}</tr></thead><tbody>{snapshot.employees.map((employee) => <tr key={employee.employee_id}><td>{employee.employee_no} {employee.name}</td>{snapshot.applications.map((app) => { const active = directAccess.has(`${employee.employee_id}:${app.application_id}`); return <td key={app.application_id}><input type="checkbox" checked={active} disabled={busy || app.enabled !== 1} onChange={(e) => void directApp(employee.employee_id, app.application_id, e.target.checked)} /></td>; })}</tr>)}</tbody></table></div></div>
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
      {snapshot ? <div className="cy-identity-admin-stack"><EmployeeManagement snapshot={snapshot} refresh={refresh} /><GroupManagement snapshot={snapshot} refresh={refresh} /><SecurityPanel snapshot={snapshot} /></div> : <section className="cy-op-panel"><p>{loading ? "正在讀取 Identity 資料…" : "尚未取得 Identity 管理資料。"}</p></section>}
    </> : null}
  </div>;
}

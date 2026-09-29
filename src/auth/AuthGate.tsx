import { FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { ApiClientError } from "../api/client";
import {
  confirmPasswordRecovery,
  startPasswordRecovery,
} from "../identity/identity-client";
import {
  completeFirstLogin,
  loadCurrentSession,
  loginWithPassword,
  logoutCurrentSession,
  type AuthSession,
  type FirstLoginRequirement,
} from "./auth-client";

interface AuthGateProps {
  children: (session: AuthSession, logout: () => Promise<void>, signingOut: boolean) => ReactNode;
}

type AuthState =
  | { status: "checking" }
  | { status: "anonymous"; message?: string }
  | { status: "authenticated"; session: AuthSession }
  | { status: "unavailable"; message: string };

type LoginMode = "login" | "recover" | "first_login";

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "LOGIN_FAILED") return "員工編號或密碼不正確。";
    if (error.code === "FIRST_LOGIN_PASSWORD_EXPIRED") return "Email 驗證已逾期，請聯絡有權限的管理員重寄驗證 Email。";
    if (error.code === "FIRST_LOGIN_EXPIRED") return "Email 驗證流程已逾期，請聯絡有權限的管理員重寄驗證 Email。";
    if (error.code === "ACCESS_DENIED") return "此帳號目前無法進入 CY Web。";
    if (error.code === "LOGIN_RATE_LIMITED") return "登入嘗試過於頻繁，請稍後再試。";
    if (error.code === "IDENTITY_UNAVAILABLE") return "帳號服務目前無法連線，請稍後再試。";
    if (error.code === "INVALID_LOGIN_REQUEST") return "請確認員工編號與密碼格式。";
    if (error.code === "INVALID_FIRST_LOGIN_REQUEST") return "新密碼必須為 8～16 字元。";
    return error.message || "操作失敗，請稍後再試。";
  }
  return "操作失敗，請稍後再試。";
}

function passwordLength(value: string): number {
  return Array.from(value).length;
}

export function AuthGate({ children }: AuthGateProps) {
  const [state, setState] = useState<AuthState>({ status: "checking" });
  const [mode, setMode] = useState<LoginMode>("login");
  const [employeeNo, setEmployeeNo] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [flowMessage, setFlowMessage] = useState<string | null>(null);
  const [firstLogin, setFirstLogin] = useState<FirstLoginRequirement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const resetFlow = useCallback((nextMode: "login" | "recover") => {
    setMode(nextMode);
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setChallengeId(null);
    setOtp("");
    setFlowMessage(null);
    setFirstLogin(null);
    setState((current) => current.status === "anonymous" ? { status: "anonymous" } : current);
  }, []);

  const checkSession = useCallback(async () => {
    setState({ status: "checking" });
    try {
      const session = await loadCurrentSession();
      setMode("login");
      setFirstLogin(null);
      setState({ status: "authenticated", session });
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.code === "FIRST_LOGIN_REQUIRED") {
          setMode("first_login");
          setState({ status: "anonymous" });
          return;
        }
        if (error.code === "AUTH_REQUIRED" || error.code === "AUTH_INVALID") {
          setMode("login");
          setFirstLogin(null);
          setState({ status: "anonymous" });
          return;
        }
        if (error.code === "ACCESS_DENIED") {
          setMode("login");
          setState({ status: "anonymous", message: "此帳號目前無法進入 CY Web。" });
          return;
        }
      }
      setState({ status: "unavailable", message: errorMessage(error) });
    }
  }, []);

  useEffect(() => { void checkSession(); }, [checkSession]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const normalizedEmployeeNo = employeeNo.trim();
    const length = passwordLength(password);
    if (!/^\d{4}$/.test(normalizedEmployeeNo) || length < 8 || length > 16) {
      setState({ status: "anonymous", message: "請輸入 4 碼員工編號與 8～16 字元密碼。" });
      return;
    }

    setSubmitting(true);
    try {
      const result = await loginWithPassword(normalizedEmployeeNo, password);
      setPassword("");
      if (result.status === "first_login") {
        setEmployeeNo(result.firstLogin.employeeNo ?? normalizedEmployeeNo);
        setFirstLogin(result.firstLogin);
        setNewPassword("");
        setConfirmPassword("");
        setFlowMessage(null);
        setMode("first_login");
        setState({ status: "anonymous" });
      } else {
        setFirstLogin(null);
        setMode("login");
        setState({ status: "authenticated", session: result.session });
      }
    } catch (error) {
      setMode("login");
      setState({ status: "anonymous", message: errorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  }

  async function startRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmployeeNo = employeeNo.trim();
    if (!/^\d{4}$/.test(normalizedEmployeeNo)) {
      setFlowMessage("請輸入 4 碼員工編號。");
      return;
    }
    setSubmitting(true);
    setFlowMessage(null);
    try {
      const result = await startPasswordRecovery(normalizedEmployeeNo);
      setChallengeId(result.recovery.challengeId);
      setFlowMessage("若帳號符合條件，驗證碼已寄至登記 Email。請輸入 6 位數驗證碼。");
    } catch (error) {
      setFlowMessage(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challengeId || !/^\d{6}$/.test(otp)) return;
    const length = passwordLength(newPassword);
    if (length < 8 || length > 16) {
      setFlowMessage("新密碼必須為 8～16 字元。");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFlowMessage("兩次新密碼不一致。");
      return;
    }

    setSubmitting(true);
    setFlowMessage(null);
    try {
      await confirmPasswordRecovery(employeeNo.trim(), challengeId, otp, newPassword);
      setChallengeId(null);
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
      setMode("login");
      setState({ status: "anonymous", message: "密碼已重設，請重新登入。" });
    } catch (error) {
      setFlowMessage(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitFirstLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const length = passwordLength(newPassword);
    if (length < 8 || length > 16) {
      setFlowMessage("正式密碼必須為 8～16 字元。");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFlowMessage("兩次新密碼不一致。");
      return;
    }

    setSubmitting(true);
    setFlowMessage(null);
    try {
      await completeFirstLogin(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      setFirstLogin(null);
      setMode("login");
      setState({ status: "anonymous", message: "Email 驗證完成，請使用新密碼登入。" });
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "FIRST_LOGIN_EXPIRED") {
        setNewPassword("");
        setConfirmPassword("");
        setFirstLogin(null);
        setMode("login");
        setState({ status: "anonymous", message: errorMessage(error) });
      } else {
        setFlowMessage(errorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    if (signingOut || state.status !== "authenticated") return;
    setSigningOut(true);
    try {
      await logoutCurrentSession();
      setPassword("");
      setState({ status: "anonymous" });
    } catch (error) {
      setState({ status: "authenticated", session: state.session });
      throw error;
    } finally {
      setSigningOut(false);
    }
  }

  if (state.status === "authenticated") return <>{children(state.session, handleLogout, signingOut)}</>;
  if (state.status === "checking") return <main className="cy-auth-screen" aria-busy="true"><section className="cy-auth-card cy-auth-status-card"><div className="cy-auth-brand-mark" aria-hidden="true">CY</div><h1>CY Web</h1><p>正在確認登入狀態…</p></section></main>;
  if (state.status === "unavailable") return <main className="cy-auth-screen"><section className="cy-auth-card cy-auth-status-card"><div className="cy-auth-brand-mark" aria-hidden="true">CY</div><h1>CY Web</h1><p className="cy-auth-error" role="alert">{state.message}</p><button className="cy-auth-primary-button" type="button" onClick={() => void checkSession()}>重新連線</button></section></main>;

  return <main className="cy-auth-screen"><section className="cy-auth-card" aria-labelledby="cy-auth-title">
    <div className="cy-auth-heading"><div className="cy-auth-brand-mark" aria-hidden="true">CY</div><div><h1 id="cy-auth-title">CY Web</h1><p>志遠企業管理系統</p></div></div>

    {mode === "login" ? <form className="cy-auth-form" onSubmit={handleLogin} noValidate>
      <label><span>員工編號</span><input autoComplete="username" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={employeeNo} onChange={(e) => setEmployeeNo(e.target.value.replace(/\D/g, "").slice(0, 4))} disabled={submitting} autoFocus required /></label>
      <label><span>密碼</span><input type="password" autoComplete="current-password" maxLength={16} value={password} onChange={(e) => setPassword(e.target.value)} disabled={submitting} required /></label>
      {state.message ? <p className="cy-auth-error" role="alert">{state.message}</p> : null}
      <button className="cy-auth-primary-button" type="submit" disabled={submitting}>{submitting ? "登入中…" : "登入"}</button>
      <div className="cy-auth-secondary-actions"><button type="button" onClick={() => resetFlow("recover")}>忘記密碼</button></div>
    </form> : mode === "first_login" ? <form className="cy-auth-form" onSubmit={submitFirstLogin} noValidate>
      <div className="cy-auth-flow-title">
        <h2>完成 Email 驗證</h2>
        <p>{firstLogin?.displayName ? `${firstLogin.displayName} · ${firstLogin.employeeNo ?? employeeNo}` : employeeNo ? `員工編號 ${employeeNo}` : "請設定您的正式登入密碼。"}</p>
      </div>
      <p className="cy-auth-note-inline">首次登入密碼已完成一次性驗證。請在驗證時效內設定正式密碼；設定成功後會回到登入頁，並需使用新密碼重新登入。</p>
      <label><span>正式密碼</span><input type="password" autoComplete="new-password" maxLength={16} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={submitting} autoFocus required /></label>
      <label><span>確認正式密碼</span><input type="password" autoComplete="new-password" maxLength={16} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={submitting} required /></label>
      {flowMessage ? <p className="cy-auth-error" role="status">{flowMessage}</p> : null}
      <button className="cy-auth-primary-button" disabled={submitting}>{submitting ? "設定中…" : "設定正式密碼"}</button>
    </form> : !challengeId ? <form className="cy-auth-form" onSubmit={startRecovery}>
      <div className="cy-auth-flow-title"><h2>忘記密碼</h2><p>驗證登記 Email 後重新設定密碼。</p></div>
      <label><span>員工編號</span><input inputMode="numeric" maxLength={4} value={employeeNo} onChange={(e) => setEmployeeNo(e.target.value.replace(/\D/g, "").slice(0, 4))} required /></label>
      {flowMessage ? <p className="cy-auth-error" role="status">{flowMessage}</p> : null}
      <button className="cy-auth-primary-button" disabled={submitting}>{submitting ? "處理中…" : "取得驗證碼"}</button>
      <button className="cy-auth-link-button" type="button" onClick={() => resetFlow("login")}>返回登入</button>
    </form> : <form className="cy-auth-form" onSubmit={confirmRecovery} noValidate>
      <div className="cy-auth-flow-title"><h2>重設密碼</h2><p>員工編號 {employeeNo}</p></div>
      <label><span>6 位數驗證碼</span><input inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} required /></label>
      <label><span>新密碼</span><input type="password" autoComplete="new-password" maxLength={16} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></label>
      <label><span>確認新密碼</span><input type="password" autoComplete="new-password" maxLength={16} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></label>
      {flowMessage ? <p className="cy-auth-error" role="status">{flowMessage}</p> : null}
      <button className="cy-auth-primary-button" disabled={submitting || otp.length !== 6}>{submitting ? "處理中…" : "重設密碼"}</button>
      <button className="cy-auth-link-button" type="button" onClick={() => { setChallengeId(null); setOtp(""); setFlowMessage(null); }}>重新取得驗證碼</button>
    </form>}

    <p className="cy-auth-note">帳號由 CYCloud Identity 驗證；CY Web 不保存密碼、OTP 或憑證雜湊。首次登入票證只透過 HttpOnly 安全 Cookie 傳遞。</p>
  </section></main>;
}

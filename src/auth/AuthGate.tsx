import { FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { useFeedback } from "../ui/feedback/FeedbackProvider";
import { advanceFocusOnEnter } from "../ui/foundation/enter-advance";
import { getRememberedEmployee, saveRememberedEmployee } from "./remember-employee";
import { ThemeToggle } from "../ui/foundation/ThemeToggle";
import { ApiClientError } from "../api/client";
import { subscribeAuthorityRefresh } from "../api/authority-events";
import { createAuthorityMonitor } from "./authority-monitor";
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
  const notify = useFeedback();
  const [state, setState] = useState<AuthState>({ status: "checking" });
  const [mode, setMode] = useState<LoginMode>("login");
  const [employeeNo, setEmployeeNo] = useState(() => getRememberedEmployee());
  const [rememberMe, setRememberMe] = useState(() => getRememberedEmployee().length === 4);
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
          notify("此帳號目前無法進入志遠企業管理系統。");
          setState({ status: "anonymous", message: "此帳號目前無法進入志遠企業管理系統。" });
          return;
        }
      }
      notify(errorMessage(error));
      setState({ status: "unavailable", message: errorMessage(error) });
    }
  }, [notify]);

  useEffect(() => { void checkSession(); }, [checkSession]);

  const authenticated = state.status === "authenticated";
  const sessionKey = authenticated ? `${state.session.user.workspaceId}:${state.session.user.employeeId}` : "";
  useEffect(() => {
    if (!authenticated) return;
    let unavailable = false;
    const monitor = createAuthorityMonitor({
      load: loadCurrentSession,
      visible: () => document.visibilityState !== "hidden",
      onValue: (session) => {
        unavailable = false;
        if (`${session.user.workspaceId}:${session.user.employeeId}` !== sessionKey) {
          expire("登入帳號已變更，請重新登入。");
          monitor.stop();
          return;
        }
        setState(current => current.status === "authenticated" ? { status: "authenticated", session } : current);
      },
      onError: (error) => {
        if (error instanceof ApiClientError && ["AUTH_REQUIRED", "AUTH_INVALID", "ACCESS_DENIED", "FIRST_LOGIN_REQUIRED"].includes(error.code)) {
          expire(error.code === "ACCESS_DENIED" ? "此帳號目前已無法使用系統，請聯絡管理員。" : "登入狀態已失效，請重新登入；若帳號已停用，請聯絡管理員。");
          return true;
        }
        if (!unavailable) notify("目前無法更新登入與權限狀態，請確認網路連線。系統會於恢復連線後重新確認。", "連線提醒");
        unavailable = true;
        return false;
      },
    });
    function expire(message: string) {
      setMode("login"); setPassword(""); setNewPassword(""); setConfirmPassword("");
      setFirstLogin(null); setChallengeId(null); setOtp(""); setFlowMessage(null);
      setState({ status: "anonymous", message });
      notify(message, "登入狀態變更", { replace: true });
    }
    const refresh = () => monitor.refresh();
    const unsubscribe = subscribeAuthorityRefresh(() => monitor.refresh(true));
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    monitor.start(!state.session.moduleAccess);
    return () => {
      monitor.stop(); unsubscribe();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  // The monitor owns freshness for one authenticated lifecycle; snapshot updates do not restart it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, sessionKey, notify]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const normalizedEmployeeNo = employeeNo.trim();
    const length = passwordLength(password);
    if (!/^\d{4}$/.test(normalizedEmployeeNo) || length < 8 || length > 16) {
      notify("請輸入 4 碼員工編號與 8～16 字元密碼。");
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
        saveRememberedEmployee(rememberMe ? normalizedEmployeeNo : null);
        setFirstLogin(null);
        setMode("login");
        setState({ status: "authenticated", session: result.session });
      }
    } catch (error) {
      setMode("login");
      notify(errorMessage(error));
      setState({ status: "anonymous", message: errorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  }

  async function startRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmployeeNo = employeeNo.trim();
    if (!/^\d{4}$/.test(normalizedEmployeeNo)) {
      notify("請輸入 4 碼員工編號。");
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
      notify(errorMessage(error));
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
      notify("新密碼必須為 8～16 字元。");
      setFlowMessage("新密碼必須為 8～16 字元。");
      return;
    }
    if (newPassword !== confirmPassword) {
      notify("兩次新密碼不一致。");
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
      notify(errorMessage(error));
      setFlowMessage(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitFirstLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const length = passwordLength(newPassword);
    if (length < 8 || length > 16) {
      notify("正式密碼必須為 8～16 字元。");
      setFlowMessage("正式密碼必須為 8～16 字元。");
      return;
    }
    if (newPassword !== confirmPassword) {
      notify("兩次新密碼不一致。");
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
      notify(errorMessage(error));
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
      notify(errorMessage(error));
    } finally {
      setSigningOut(false);
    }
  }

  if (state.status === "authenticated") return <>{children(state.session, handleLogout, signingOut)}</>;
  if (state.status === "checking") return <main className="cy-auth-screen" aria-busy="true"><section className="cy-auth-card cy-auth-status-card"><div className="cy-auth-brand-mark" aria-hidden="true">CY</div><h1>志遠企業管理系統</h1><p>正在確認登入狀態…</p></section></main>;
  if (state.status === "unavailable") return <main className="cy-auth-screen"><section className="cy-auth-card cy-auth-status-card"><div className="cy-auth-brand-mark" aria-hidden="true">CY</div><h1>志遠企業管理系統</h1><p className="cy-auth-error" role="alert">{state.message}</p><button className="cy-auth-primary-button" type="button" onClick={() => void checkSession()}>重新連線</button></section></main>;

  return <main className="cy-auth-screen cy-auth-login-screen">
    <div className="cy-auth-login-brand"><span className="cy-auth-brand-mark" aria-hidden="true">CY</span><span><strong>CY Web</strong><small>志遠企業管理系統</small></span></div>
    <div className="cy-auth-theme-position"><ThemeToggle /></div>
    <aside className="cy-auth-login-hero" aria-hidden="true">
      <h2>清楚、有序，<strong>專注每個工作流程。</strong></h2>
      <p>一致的工作介面，讓資料查詢、紀錄與作業管理更簡單。</p>
      <div className="cy-auth-hero-bars"><span /><span /><span /></div>
    </aside>
    <section className="cy-auth-card" aria-labelledby="cy-auth-title">
      <div className="cy-auth-heading"><div className="cy-auth-brand-mark" aria-hidden="true">CY</div><div><h1 id="cy-auth-title">登入 CY Web</h1><p>請使用員工編號及密碼登入</p></div></div>

    {mode === "login" ? <form className="cy-auth-form" onSubmit={handleLogin} onKeyDown={advanceFocusOnEnter} noValidate>
      <label><span>員工編號</span><input data-enter-advance="true" autoComplete="username" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={employeeNo} onChange={(e) => setEmployeeNo(e.target.value.replace(/\D/g, "").slice(0, 4))} disabled={submitting} autoFocus required /></label>
      <label><span>密碼</span><input data-enter-advance="true" type="password" autoComplete="current-password" maxLength={16} value={password} onChange={(e) => setPassword(e.target.value)} disabled={submitting} required /></label>
      <div className="cy-auth-login-options">
        <label className="cy-auth-remember"><input type="checkbox" checked={rememberMe} disabled={submitting}
          onChange={event => { setRememberMe(event.target.checked); if (!event.target.checked) saveRememberedEmployee(null); }} />
          <span>記住我</span></label>
        <button type="button" className="cy-auth-link-button" onClick={() => resetFlow("recover")}>忘記密碼？</button>
      </div>
      {state.message ? <p className="cy-auth-error" role="alert">{state.message}</p> : null}
      <button className="cy-auth-primary-button" type="submit" disabled={submitting}>{submitting ? "登入中…" : "登入"}</button>
      <p className="cy-auth-login-footnote">記住我僅保留員工編號，不儲存密碼。</p>
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

    </section>
    <div className="cy-auth-login-footer">CY Web · 精簡商務介面</div>
  </main>;
}

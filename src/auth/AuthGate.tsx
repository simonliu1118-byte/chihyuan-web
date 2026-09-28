import { FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { ApiClientError } from "../api/client";
import {
  loadCurrentSession,
  loginWithPassword,
  logoutCurrentSession,
  type AuthSession,
} from "./auth-client";

interface AuthGateProps {
  children: (
    session: AuthSession,
    logout: () => Promise<void>,
    signingOut: boolean,
  ) => ReactNode;
}

type AuthState =
  | { status: "checking" }
  | { status: "anonymous"; message?: string }
  | { status: "authenticated"; session: AuthSession }
  | { status: "unavailable"; message: string };

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "LOGIN_FAILED") return "員工編號或密碼不正確。";
    if (error.code === "ACCESS_DENIED") return "此帳號目前沒有 CY Web 使用權限。";
    if (error.code === "LOGIN_RATE_LIMITED") return "登入嘗試過於頻繁，請稍後再試。";
    if (error.code === "IDENTITY_UNAVAILABLE") return "帳號服務目前無法連線，請稍後再試。";
    if (error.code === "INVALID_LOGIN_REQUEST") return "請確認員工編號與密碼格式。";
    return error.message || "登入失敗，請稍後再試。";
  }
  return "登入失敗，請稍後再試。";
}

function passwordLength(value: string): number {
  return Array.from(value).length;
}

export function AuthGate({ children }: AuthGateProps) {
  const [state, setState] = useState<AuthState>({ status: "checking" });
  const [employeeNo, setEmployeeNo] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const checkSession = useCallback(async () => {
    setState({ status: "checking" });
    try {
      const session = await loadCurrentSession();
      setState({ status: "authenticated", session });
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.code === "AUTH_REQUIRED" || error.code === "AUTH_INVALID") {
          setState({ status: "anonymous" });
          return;
        }
        if (error.code === "ACCESS_DENIED") {
          setState({ status: "anonymous", message: "此帳號目前沒有 CY Web 使用權限。" });
          return;
        }
      }
      setState({ status: "unavailable", message: errorMessage(error) });
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

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
      const session = await loginWithPassword(normalizedEmployeeNo, password);
      setPassword("");
      setState({ status: "authenticated", session });
    } catch (error) {
      setState({ status: "anonymous", message: errorMessage(error) });
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

  if (state.status === "authenticated") {
    return <>{children(state.session, handleLogout, signingOut)}</>;
  }

  if (state.status === "checking") {
    return (
      <main className="cy-auth-screen" aria-busy="true">
        <section className="cy-auth-card cy-auth-status-card">
          <div className="cy-auth-brand-mark" aria-hidden="true">CY</div>
          <h1>CY Web</h1>
          <p>正在確認登入狀態…</p>
        </section>
      </main>
    );
  }

  if (state.status === "unavailable") {
    return (
      <main className="cy-auth-screen">
        <section className="cy-auth-card cy-auth-status-card">
          <div className="cy-auth-brand-mark" aria-hidden="true">CY</div>
          <h1>CY Web</h1>
          <p className="cy-auth-error" role="alert">{state.message}</p>
          <button className="cy-auth-primary-button" type="button" onClick={() => void checkSession()}>
            重新連線
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="cy-auth-screen">
      <section className="cy-auth-card" aria-labelledby="cy-auth-title">
        <div className="cy-auth-heading">
          <div className="cy-auth-brand-mark" aria-hidden="true">CY</div>
          <div>
            <h1 id="cy-auth-title">CY Web</h1>
            <p>志遠企業管理系統</p>
          </div>
        </div>

        <form className="cy-auth-form" onSubmit={handleLogin}>
          <label>
            <span>員工編號</span>
            <input
              autoComplete="username"
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]{4}"
              value={employeeNo}
              onChange={(event) => setEmployeeNo(event.target.value.replace(/\D/g, "").slice(0, 4))}
              disabled={submitting}
              autoFocus
              required
            />
          </label>
          <label>
            <span>密碼</span>
            <input
              type="password"
              autoComplete="current-password"
              minLength={8}
              maxLength={16}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              required
            />
          </label>

          {state.message ? <p className="cy-auth-error" role="alert">{state.message}</p> : null}

          <button className="cy-auth-primary-button" type="submit" disabled={submitting}>
            {submitting ? "登入中…" : "登入"}
          </button>
        </form>

        <p className="cy-auth-note">
          帳號由 CYCloud Identity 驗證；CY Web 不保存密碼或密碼雜湊。
        </p>
      </section>
    </main>
  );
}

import { useEffect, useRef, useState } from "react";
import { FeedbackProvider } from "../ui/feedback/FeedbackProvider";
import { FormSection } from "../ui/forms/Field";
import { enterAdvancesFields } from "../ui/foundation/enter-advance";
import { AuthGate } from "./AuthGate";
import { ApiClientError } from "../api/client";
import { logoutCurrentSession, type AuthSession } from "./auth-client";
import { loadSsoContext, parseSsoLocation, type SsoContext } from "./sso-client";
import { verifiedProgramCatalog } from "../../shared/program-catalog";
import { programIcons } from "../runtime/modules/program-icons";

type Params = NonNullable<ReturnType<typeof parseSsoLocation>>;

/** Same layout as the CY Web login card: mark and title on one line, then the content. */
function Card({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return <main className="cy-auth-screen"><section className="cy-auth-card">
    <div className="cy-auth-heading">{icon ? <img className="cy-auth-app-mark" src={icon} alt="" aria-hidden="true" /> : <div className="cy-auth-brand-mark" aria-hidden="true">CY</div>}
      <div><h1>{title}</h1></div></div>
    <div className="cy-auth-body">{children}</div>
  </section></main>;
}

/** The target App's icon from the CY Web program catalog, matched by the site origin the provider reports. */
function appIcon(origin: string | null | undefined): string | undefined {
  if (!origin) return undefined;
  const program = verifiedProgramCatalog.programs.find(p => {
    try { return !!p.websiteUrl && new URL(p.websiteUrl).origin === origin; } catch { return false; }
  });
  return program?.icon ? programIcons[program.icon] : undefined;
}

function SsoFlow({ session, params, freshLogin }: { session: AuthSession; params: Params; freshLogin: boolean }) {
  const [context, setContext] = useState<SsoContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const started = useRef(false);
  const submitted = useRef(false);

  // One context read per page view: a second one would replace the CSRF cookie the first token belongs to.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    loadSsoContext(params.app, params.state).then(setContext, (cause: unknown) => {
      setError(cause instanceof ApiClientError && cause.code === "IDENTITY_UNAVAILABLE" ? "帳號服務目前無法連線，請稍後再試。"
        : cause instanceof ApiClientError && cause.code === "SSO_APPLICATION_UNAVAILABLE" ? "此系統尚未開放從 CY Web 登入，請改用原登入方式。"
        : "目前無法前往，請回到原系統重新操作。");
    });
  }, [params.app, params.state]);

  // The password was just typed in this page view: continue without a second confirmation.
  const automatic = freshLogin && !params.result && context?.access === "allowed";
  useEffect(() => {
    if (!context || !automatic || submitted.current) return;
    submitted.current = true;
    setSubmitting(true);
    formRef.current?.submit();
  }, [context, automatic]);

  if (error) return <Card title="無法前往"><p className="cy-auth-error" role="alert">{error}</p>
    <button className="cy-auth-primary-button" type="button" onClick={() => window.location.assign("/")}>回到首頁</button></Card>;
  if (!context) return <Card title="CY Web"><p aria-busy="true">正在確認…</p></Card>;

  const name = context.application.name ?? context.application.id;
  const icon = appIcon(context.application.origin);
  const clean = `/sso?app=${encodeURIComponent(params.app)}&state=${encodeURIComponent(params.state)}`;

  if (params.result === "denied" || context.access === "denied") return <Card title="無法前往" icon={icon}><p role="alert">此帳號沒有 {name} 的使用權限。</p>
    <button className="cy-auth-primary-button" type="button" onClick={() => window.location.assign("/")}>回到首頁</button></Card>;
  if (params.result === "first_login" || context.access === "first_login_required") return <Card title="請先完成驗證"><p role="alert">此帳號尚未完成 Email 驗證與正式密碼設定，請先完成後再前往 {name}。</p>
    <button className="cy-auth-primary-button" type="button" onClick={() => { void logoutCurrentSession().catch(() => undefined).then(() => window.location.assign(clean)); }}>前往登入並完成驗證</button></Card>;
  if (params.result) return <Card title="無法前往"><p className="cy-auth-error" role="alert">目前無法前往 {name}，請稍後再試。</p>
    <button className="cy-auth-primary-button" type="button" onClick={() => window.location.assign(clean)}>重試</button></Card>;

  const form = <form ref={formRef} className="cy-auth-form" method="post" action="/sso/continue" onKeyDown={enterAdvancesFields} onSubmit={() => setSubmitting(true)}><FormSection>
    <input type="hidden" name="app" value={params.app} />
    <input type="hidden" name="state" value={params.state} />
    <input type="hidden" name="csrf" value={context.csrf ?? ""} />
    {automatic ? null : <div className="cy-auth-form">
      <button className="cy-auth-primary-button" type="submit" disabled={submitting} aria-busy={submitting || undefined}>前往</button>
      <button className="cy-auth-link-button" type="button" disabled={submitting} onClick={() => window.location.assign("/")}>取消</button>
    </div>}
  </FormSection></form>;

  if (automatic) return <Card title={"前往 "+name} icon={icon}><p aria-busy="true">正在前往…</p>{form}</Card>;
  return <Card title={"前往 "+name} icon={icon}><p>以 {context.user.displayName}（{context.user.employeeNo || session.user.employeeNo}）登入</p>{form}</Card>;
}

export default function SsoPortal() {
  const params = parseSsoLocation(window.location.search);
  return <FeedbackProvider>{params ? <AuthGate>
    {(session, _logout, _signingOut, freshLogin) => <SsoFlow session={session} params={params} freshLogin={freshLogin} />}
  </AuthGate> : <Card title="無法前往"><p className="cy-auth-error" role="alert">網址不正確，請回到原系統重新操作。</p>
    <a className="cy-auth-link-button" href="/">回到 CY Web 首頁</a></Card>}</FeedbackProvider>;
}

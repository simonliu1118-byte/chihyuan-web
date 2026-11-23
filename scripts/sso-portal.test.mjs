import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

async function compile(path) {
  const result = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "esm", target: "node24" });
  return import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
}
const { handleSsoRoute, SSO_CSRF_COOKIE } = await compile("worker/http/sso-routes.ts");
const { parseSsoLocation } = await compile("src/auth/sso-client.ts");

const token = `cyid_${"a".repeat(64)}`;
const CODE = "C".repeat(43);
const STATE = "S".repeat(40);
const RETURN_URL = "https://target.example.test/sso/callback";
const principal = { workspaceId: "workspace-test", employeeId: "employee-test", employeeNo: "0007", displayName: "測試員工", workspaceRole: "USER", isIdentityAdmin: false, emailVerified: true, isWorkspaceSuperAdmin: false, credentialVersion: 1, employeeRevision: 1 };

function makeEnv({ issue = { status: 200, body: { code: CODE, returnUrl: RETURN_URL, expiresAt: "2999-01-01T00:00:00.000Z" } }, snapshot = null } = {}) {
  const calls = [];
  const logs = [];
  const env = {
    calls, logs,
    IDENTITY_APPLICATION_ID: "CYWEB_TEST", IDENTITY_WORKSPACE_ID: "workspace-test",
    ASSETS: { async fetch() { return new Response("<html></html>", { headers: { "content-type": "text/html" } }); } },
    IDENTITY: { async fetch(req) {
      const path = new URL(req.url).pathname;
      const body = req.method === "POST" ? await req.text() : "";
      calls.push({ path, body, authorization: req.headers.get("authorization"), app: req.headers.get("x-identity-application") });
      if (path === "/v1/identity/session/resolve") return Response.json({ principal, session: { expiresAt: "2999-01-01T00:00:00.000Z" } });
      if (path === "/v1/identity/sso/handoff/issue") return Response.json(issue.body, { status: issue.status });
      if (path === "/v1/admin/identity/snapshot") return snapshot ? Response.json(snapshot) : Response.json({ error: { code: "WORKSPACE_ADMIN_REQUIRED" } }, { status: 403 });
      throw new Error("unexpected provider path " + path);
    } },
  };
  return env;
}
const origin = "https://web.test";
function cookieHeader(extra = "") { return `cyweb_identity_session=${token}${extra}`; }
async function contextOf(env, app = "TARGET_APP", state = STATE) {
  const response = await handleSsoRoute(new Request(`${origin}/api/sso/context?app=${app}&state=${state}`, { headers: { cookie: cookieHeader(), "sec-fetch-site": "same-origin" } }), env, "req-1");
  const setCookie = response.headers.get("set-cookie") ?? "";
  const nonce = new RegExp(`${SSO_CSRF_COOKIE}=([^;]+)`).exec(setCookie)?.[1];
  const body = await response.json();
  return { response, nonce, body };
}
function post(env, { fields, cookie, headers = {} }) {
  return handleSsoRoute(new Request(`${origin}/sso/continue`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin, "sec-fetch-site": "same-origin", cookie, ...headers },
    body: new URLSearchParams(fields),
  }), env, "req-2");
}
async function validPost(env, overrides = {}) {
  const { nonce, body } = await contextOf(env);
  const fields = { app: "TARGET_APP", state: STATE, csrf: body.data.csrf, ...overrides.fields };
  return post(env, { fields, cookie: overrides.cookie ?? cookieHeader(`; ${SSO_CSRF_COOKIE}=${nonce}`), headers: overrides.headers });
}
const issued = env => env.calls.filter(c => c.path === "/v1/identity/sso/handoff/issue");

test("parameter validation rejects bad app and state before any provider call", async () => {
  assert.equal(parseSsoLocation("?app=target&state=" + STATE), null);
  assert.equal(parseSsoLocation("?app=TARGET_APP&state=short"), null);
  assert.equal(parseSsoLocation("?app=TARGET_APP&state=" + "S".repeat(129)), null);
  assert.equal(parseSsoLocation("?app=TARGET_APP&state=" + "S".repeat(39) + "+"), null);
  assert.deepEqual(parseSsoLocation("?app=TARGET_APP&state=" + STATE), { app: "TARGET_APP", state: STATE, result: null });
  const env = makeEnv();
  for (const query of ["app=lower&state=" + STATE, "app=TARGET_APP&state=short", "app=A&state=" + STATE, "state=" + STATE]) {
    const response = await handleSsoRoute(new Request(`${origin}/api/sso/context?${query}`, { headers: { cookie: cookieHeader() } }), env, "r");
    assert.equal(response.status, 400);
  }
  const bad = await post(env, { fields: { app: "bad app", state: STATE, csrf: "x" }, cookie: cookieHeader() });
  assert.equal(bad.status, 400);
  assert.equal(env.calls.length, 0);
});

test("GET never issues a code and every /sso response is no-store with no referrer", async () => {
  const env = makeEnv();
  const page = await handleSsoRoute(new Request(`${origin}/sso?app=TARGET_APP&state=${STATE}`, { headers: { cookie: cookieHeader() } }), env, "r");
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.equal(page.headers.get("referrer-policy"), "no-referrer");
  const get = await handleSsoRoute(new Request(`${origin}/sso/continue?app=TARGET_APP&state=${STATE}`, { headers: { cookie: cookieHeader() } }), env, "r");
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("cache-control"), "no-store");
  const context = await contextOf(env);
  assert.equal(context.response.status, 200);
  assert.equal(context.response.headers.get("cache-control"), "no-store");
  assert.equal(context.response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(issued(env).length, 0);
});

test("context shows who signs in to which App and sets a Host-prefixed HttpOnly CSRF cookie", async () => {
  const env = makeEnv({ snapshot: { applications: [{ application_id: "TARGET_APP", display_name: "目標系統" }] } });
  const { response, body } = await contextOf(env);
  assert.deepEqual(body.data.user, { displayName: "測試員工", employeeNo: "0007" });
  assert.deepEqual(body.data.application, { id: "TARGET_APP", name: "目標系統" });
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /^__Host-cyweb_sso_csrf=/);
  for (const part of ["Path=/", "HttpOnly", "Secure", "SameSite=Strict"]) assert.ok(cookie.includes(part));
  assert.ok(!cookie.includes("Domain"));
  assert.ok(!JSON.stringify(body).includes(token));
  const anonymous = await handleSsoRoute(new Request(`${origin}/api/sso/context?app=TARGET_APP&state=${STATE}`), makeEnv(), "r");
  assert.equal(anonymous.status, 401);
  // Non-administrators cannot read names: the identifier is shown instead.
  assert.equal((await contextOf(makeEnv())).body.data.application.name, null);
});

test("confirmed POST redirects to the provider return URL plus code and state exactly", async () => {
  const env = makeEnv();
  const response = await validPost(env);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${RETURN_URL}?code=${CODE}&state=${STATE}`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  const calls = issued(env);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].authorization, `Bearer ${token}`);
  assert.equal(calls[0].app, "CYWEB_TEST");
  assert.deepEqual(JSON.parse(calls[0].body), { applicationId: "TARGET_APP" });
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(await response.text(), "");
});

test("state with URL-significant characters is encoded exactly once", async () => {
  const state = "a-b_c".repeat(8);
  const env = makeEnv({ issue: { status: 200, body: { code: CODE, returnUrl: RETURN_URL } } });
  const { nonce, body } = await contextOf(env, "TARGET_APP", state);
  const response = await post(env, { fields: { app: "TARGET_APP", state, csrf: body.data.csrf }, cookie: cookieHeader(`; ${SSO_CSRF_COOKIE}=${nonce}`) });
  assert.equal(new URL(response.headers.get("location")).searchParams.get("state"), state);
});

test("cross-site, missing-origin and token-less POSTs are rejected without calling the provider", async () => {
  const env = makeEnv();
  const { nonce, body } = await contextOf(env);
  const fields = { app: "TARGET_APP", state: STATE, csrf: body.data.csrf };
  const cookie = cookieHeader(`; ${SSO_CSRF_COOKIE}=${nonce}`);
  const before = env.calls.length;
  assert.equal((await post(env, { fields, cookie, headers: { "sec-fetch-site": "cross-site" } })).status, 403);
  assert.equal((await post(env, { fields, cookie, headers: { origin: "https://evil.test" } })).status, 403);
  assert.equal((await post(env, { fields, cookie, headers: { origin: "null" } })).status, 403);
  assert.equal((await post(env, { fields: { ...fields, csrf: "x".repeat(43) }, cookie })).status, 403);
  assert.equal((await post(env, { fields: { app: "TARGET_APP", state: STATE }, cookie })).status, 403);
  assert.equal((await post(env, { fields, cookie: cookieHeader() })).status, 403);
  // A token minted for another Session is useless.
  const other = `cyid_${"b".repeat(64)}`;
  assert.equal((await post(env, { fields, cookie: `cyweb_identity_session=${other}; ${SSO_CSRF_COOKIE}=${nonce}` })).status, 403);
  assert.equal(env.calls.length, before);
  assert.equal(issued(env).length, 0);
});

test("access denied shows no redirect and no code", async () => {
  const env = makeEnv({ issue: { status: 403, body: { error: { code: "APPLICATION_ACCESS_DENIED" } } } });
  const response = await validPost(env);
  assert.equal(response.status, 303);
  const location = new URL(response.headers.get("location"));
  assert.equal(location.origin, origin);
  assert.equal(location.pathname, "/sso");
  assert.equal(location.searchParams.get("result"), "denied");
  assert.ok(!location.searchParams.has("code"));
});

test("first-login required issues no code and routes back to the page", async () => {
  const env = makeEnv({ issue: { status: 403, body: { error: { code: "FIRST_LOGIN_REQUIRED" } } } });
  const location = new URL((await validPost(env)).headers.get("location"));
  assert.equal(location.origin, origin);
  assert.equal(location.searchParams.get("result"), "first_login");
  assert.ok(!location.searchParams.has("code"));
});

test("unavailable, malformed and unsafe provider answers never redirect off-site", async () => {
  for (const issue of [
    { status: 404, body: { error: { code: "SSO_APPLICATION_UNAVAILABLE" } } },
    { status: 503, body: { error: { code: "X" } } },
    { status: 200, body: { code: "short", returnUrl: RETURN_URL } },
    { status: 200, body: { code: CODE, returnUrl: "http://target.example.test/cb" } },
    { status: 200, body: { code: CODE, returnUrl: "https://target.example.test/cb?x=1" } },
    { status: 200, body: { code: CODE, returnUrl: "javascript:alert(1)" } },
  ]) {
    const response = await validPost(makeEnv({ issue }));
    const location = new URL(response.headers.get("location"));
    assert.equal(location.origin, origin);
    assert.ok(["unavailable"].includes(location.searchParams.get("result")));
    assert.ok(!location.search.includes(CODE));
  }
});

test("code and Session token never reach logs or response bodies", async () => {
  const captured = [];
  const originals = {};
  for (const level of ["log", "info", "warn", "error", "debug"]) { originals[level] = console[level]; console[level] = (...args) => captured.push(args.map(String).join(" ")); }
  try {
    const env = makeEnv();
    const ok = await validPost(env);
    const denied = await validPost(makeEnv({ issue: { status: 403, body: { error: { code: "APPLICATION_ACCESS_DENIED" } } } }));
    const rejected = await post(env, { fields: { app: "TARGET_APP", state: STATE, csrf: "bad" }, cookie: cookieHeader() });
    for (const response of [ok, denied, rejected]) {
      const text = await response.text();
      assert.ok(!text.includes(CODE) && !text.includes(token));
      for (const [name, value] of response.headers) if (name !== "location") assert.ok(!value.includes(CODE) && !value.includes(token), name);
      assert.ok(!(response.headers.get("location") ?? "").includes(token));
    }
    assert.ok(!(denied.headers.get("location") ?? "").includes(CODE));
  } finally { Object.assign(console, originals); }
  assert.ok(captured.every(line => !line.includes(CODE) && !line.includes(token)));
});

test("portal page rules: no confirmation skipped for an existing session, automatic only after fresh login", () => {
  const portal = readFileSync(new URL("../src/auth/SsoPortal.tsx", import.meta.url), "utf8");
  const gate = readFileSync(new URL("../src/auth/AuthGate.tsx", import.meta.url), "utf8");
  // Automatic continuation depends solely on the flag set by a password login in this page view.
  assert.match(portal, /const automatic = freshLogin && !params\.result/);
  assert.match(gate, /setFreshLogin\(true\)/);
  assert.equal((gate.match(/setFreshLogin\(true\)/g) ?? []).length, 1);
  assert.match(gate, /const \[freshLogin, setFreshLogin\] = useState\(false\)/);
  // Confirmation shows 前往 and 取消; cancel is a plain navigation home and never submits.
  assert.match(portal, /前往<\/button>/);
  assert.match(portal, /type="button" disabled=\{submitting\} onClick=\{\(\) => window\.location\.assign\("\/"\)\}>取消/);
  // The browser never supplies a return URL.
  assert.ok(!/returnUrl|redirect_uri/i.test(portal));
  assert.match(portal, /method="post" action="\/sso\/continue"/);
});

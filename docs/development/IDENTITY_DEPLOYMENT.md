# CY Web CYCloud Identity Deployment

> Scope: non-production CY Web deployment against the shared CYCloud Identity service.

## Runtime shape

```text
CY Web browser
  ↓ employeeNo + password (login only)
CY Web Worker
  ↓ private Service Binding `IDENTITY`
CYCloud Identity
  ↓ opaque provider session token
CY Web Worker
  ↓ HttpOnly / Secure / SameSite=Strict cookie
browser
  ↓ later requests
CY Web Worker
  ↓ CYCloud Identity session resolve / logout
CYCloud Identity
```

CY Web does not read Identity D1, copy credential verifiers, persist OTP/recovery material or keep a competing local Identity session table.

## Deployment inputs

Secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Development Environment variables:

- `CF_WORKER_NAME`
- `CF_D1_DATABASE_NAME`
- `CF_D1_DATABASE_ID`
- `CF_IDENTITY_SERVICE`
- `CF_IDENTITY_APPLICATION_ID`
- `CF_IDENTITY_WORKSPACE_ID`

Resolution:

- `CF_IDENTITY_SERVICE` → private `IDENTITY` Service Binding target;
- `CF_IDENTITY_APPLICATION_ID` → Worker runtime `IDENTITY_APPLICATION_ID`;
- `CF_IDENTITY_WORKSPACE_ID` → Worker runtime `IDENTITY_WORKSPACE_ID`.

Real Workspace IDs, service targets and Cloudflare resource IDs remain deployment-environment data and are not committed to Public source.

## Deployment source path

- `wrangler.deploy.template.jsonc`
- `scripts/render-deploy-config.mjs`
- `scripts/validate-deploy-config.mjs`
- `.github/workflows/development-deploy.yml`

Generated `wrangler.*.generated.jsonc` files are ephemeral and ignored by Git.

## PR validation gate

Relevant pull requests:

1. validate the template renderer with synthetic values;
2. render a CI-only Wrangler config;
3. apply all forward migrations to local D1;
4. run the Cloudflare Vite production build;
5. locate Vite's generated deployment `wrangler.json`;
6. run `wrangler deploy --dry-run` against that output.

CI never receives the real development Workspace ID or real Identity service target.

## Development deployment gate

Real development deployment uses the protected GitHub `development` Environment and may be started in either of two controlled ways:

1. advance the dedicated `deploy/cyweb-development` branch to an already-reviewed commit; or
2. use `workflow_dispatch` manually as an operational fallback.

Normal pushes to `main` never deploy development automatically. The deploy branch is an explicit release signal only; it must not be used as a development branch or receive unrelated commits.

The workflow:

1. validates required Cloudflare/Identity inputs;
2. renders an ephemeral development config;
3. applies remote development D1 migrations;
4. builds the Worker/assets;
5. deploys the development Worker;
6. accepts invalid-provider-session behavior through the deployed CY Web Worker;
7. removes generated input config.

There is no automatic production rollout.

## Browser acceptance

After deployment verify:

```text
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
```

Acceptance requires:

- valid CYCloud Identity credentials create a provider session;
- CY Web stores only the opaque session token in an HttpOnly/Secure/SameSite=Strict cookie;
- `/api/auth/me` asks CYCloud Identity to re-resolve current authority;
- Identity disabled/revoked/expired state invalidates later requests;
- logout revokes the provider session before clearing the browser cookie;
- Workspace authority resolves to `SUPER_ADMIN / ADMIN / USER` plus the separate `isIdentityAdmin` capability;
- CY Web core entry remains mandatory for every valid Employee/User while App Access is enforced by CYID;
- invalid credentials, Application Access denial, rate limit and provider outage map to stable CY Web errors.

Real credentials, session tokens and runtime identifiers must not be committed to source or CI fixtures.

## Migration note

`0003_identity_web_sessions.sql` records the historical temporary bridge schema. `0004_remove_local_identity_sessions.sql` removes that table after the CYCloud Identity cutover. Forward migration history is retained rather than rewriting an already-applied migration.


## Account portal authority read-only audit

CYACCweb first-login handoff 2026-10-15 requires the configured CYID production
`ACCOUNT_PORTAL_URL` to reach the same verified authority and Workspace as CYACC.
A working CYWEB development login is not evidence of production readiness.

The existing `development-deploy.yml` supports `workflow_dispatch` operation
`audit-identity` on main, or push to `audit/cyweb-identity`. Both use the existing
protected environment and credentials; PR validation never gets those credentials.
The audit operation cannot enter `deploy-development`; existing normal deploy push
behavior and manual deploy operation stay unchanged. No remote Worker is created.

`audit-account-portal.mjs` imports the current CYapps production resolver and strict
portal verifier from a separate temporary checkout (not a second contract mirror).
The configured development Identity target is first verified as development; the
canonical resolver then checks its production counterpart's actual runtime metadata.
A name suffix alone never establishes the authority. The script also reads the
production D1 metadata, checks provider DB separation, resolves the managed portal
domain's single Worker, verifies its business D1 metadata without reading rows,
and repeats canonical strict readiness. Resource drift fails closed.

All network operations are bounded GETs with redirects rejected. Authorization
headers are allowed only at the fixed Cloudflare account API; portal health receives
no credential. No D1 query/SQL, login/Session creation, Email, deployment, settings
write, migration, IAM or Secret operation exists. The allowlisted report and step
summary contain only check time, booleans, normalized consumer version/environment
and stable failure codes; raw settings and real identifiers are never artifacts.

The report explicitly distinguishes (1) the current portal Worker equals the
configured development deployment target, (2) its business D1 equals the configured
development business D1, and (3) its Identity target equals the canonical production
provider. This is a read-only observation, not permission to combine those scopes.
The formal account address previously served development. The later explicit
full-module approval and existing-resource rollout are documented below.
Keep the normal CYACC production authority untouched.

Local regression (set the path to a current read-only CYapps checkout):

```sh
CYAPPS_SOURCE_ROOT=/path/to/CYapps node --test scripts/audit-account-portal.test.mjs
```

After the live audit, record its run/time and non-sensitive conclusions in root
TODO, together with any remaining concrete rollout gate. CYACC must rerun its
canonical protected `resolve-cyid-production-runtime.mjs --require-account-portal`
after a verified correction. CI and a green read-only audit job do not mean that
`productionPortalReady` is true: inspect the allowlisted result. Actual first-login
Email/browser acceptance remains separate.


### Observed account portal topology — 2026-10-15

PR #152 (accepted source f13f4772, merge 9b3fbb51) added the GET-only audit.
Protected push run `38693835413`, checked at `2026-10-15T06:41:22.615Z`
(14:41:22 Asia/Taipei), completed validation and audit; deploy-development was
skipped. `mutationPerformed=false`.

The configured production provider and isolated Identity D1 metadata verified.
The managed portal domain resolves to the same Worker and business D1 used by
CYWEB's existing development deployment. Its IDENTITY binding still points to the
configured development provider. Workspace, core application, consumer 1.0.4 and
health match; canonical strict readiness is **false**, with
`CYWEB_PRODUCTION_AUTHORITY_MISMATCH`.

### Approved single-portal rollout — 2026-10-15 17:09 Asia/Taipei

The user explicitly approved opening all existing modules and will restrict other
employees with the existing Module Access. The earlier account-only proposal is
not adopted: no mode flag, hidden module renderer, second login site or new Worker.
The existing business D1, module grants and synthetic fixtures remain; no grants,
Identity authority rows, credentials, business data or financial data are migrated
or cleaned by this Identity binding correction.

The same deployment workflow now runs `resolve-production-identity.mjs` before
rendering every real deployment. It uses the current canonical production resolver
and existing GET-only topology audit. The original protected `CF_IDENTITY_SERVICE`
value remains the canonical lookup seed (`CYID_LOOKUP_SERVICE`), not the final
binding authority. The resolver verifies the current domain is the configured
Worker/business D1; Workspace/core App/health must match. Only the explicitly
approved sole authority mismatch, or an already-correct production portal, can
proceed. It injects only the verified production Identity service/core App/Workspace
into this run's GITHUB_ENV. It never changes the Worker, D1, grants or provider.
This happens on every later deployment, preventing a silent development rebind.

The established GitHub environment/operation/ref names containing `development`
are historical execution labels, not proof of the deployed Identity authority.
They continue to use the same existing credentials and resource targets. No new
production/test Worker or IAM is provisioned. The post-deployment
`audit-account-portal.mjs --require-production` must pass the actual canonical
strict portal guard. A log label alone is not readiness evidence.

First-login completion still requires explicit verified/password-changed/relogin
acknowledgments and no normal provider Session. Negative response tests cover
partial/false success, unexpected Session, expired/missing ticket and outage.
They do not replace the colleague's actual Email/new-password/browser readback.
No real credential or Email is reissued during deployment.

CYACC #435 must keep strict `--require-account-portal` blocked until a correction
passes the original production guard. No actual Email/initial password/browser
acceptance occurred in the audit, and existing CYACC production was not changed.

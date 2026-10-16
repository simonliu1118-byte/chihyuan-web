# CY Web CYCloud Identity Deployment

> Scope: the existing CY Web portal uses canonical production CYCloud Identity. The original business D1 and Module Access remain in place; this is not a clean business-data launch.

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

Variables in the existing protected `development` Environment (historical name):

- `CF_WORKER_NAME`
- `CF_D1_DATABASE_NAME`
- `CF_D1_DATABASE_ID`
- `CF_IDENTITY_SERVICE`
- `CF_IDENTITY_APPLICATION_ID`
- `CF_IDENTITY_WORKSPACE_ID`

Resolution:

- `CF_IDENTITY_SERVICE` → canonical development lookup seed; the verified production resolver output becomes the private `IDENTITY` Service Binding target on every real deployment;
- `CF_IDENTITY_APPLICATION_ID` → Worker runtime `IDENTITY_APPLICATION_ID`;
- `CF_IDENTITY_WORKSPACE_ID` → Worker runtime `IDENTITY_WORKSPACE_ID`.

Real Workspace IDs, service targets and Cloudflare resource IDs remain deployment-environment data and are not committed to Public source.

## Deployment source path

- `wrangler.deploy.template.jsonc`
- `scripts/resolve-production-identity.mjs`
- `scripts/audit-account-portal.mjs`
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

Pull-request validation never receives real Workspace IDs, Identity service targets or protected deployment credentials. It also tests the production resolver/audit against the current canonical CYapps guard with synthetic provider responses.

## Existing portal deployment gate

The existing portal deployment uses the protected GitHub `development` Environment and may be started in either of two controlled ways:

1. advance the dedicated `deploy/cyweb-development` branch to the current reviewed main source; or
2. use `workflow_dispatch` from **main**, operation **deploy-development**, as an operational fallback.

Normal pushes to `main` never deploy automatically. The deploy branch is an explicit release signal only; it must not be used as a development branch or receive unrelated commits.

From the repository root, after the relevant PR checks and merge, Work can publish when instructed:

```bash
git fetch --no-tags origin refs/heads/main:refs/remotes/origin/main
git push origin refs/remotes/origin/main:refs/heads/deploy/cyweb-development
```

Use a normal fast-forward push. The existing publish branch contains historical merge commits, so pushing main directly may be rejected even when its source is correct. Do not force-push. Either preserve the publish history with a merge that includes current main and has exactly the same tracked tree, or use the main dispatch fallback below. A merge conflict or tree mismatch requires review; do not publish a hand-edited deployment-only change. An unchanged branch tip produces no new push event, so use dispatch to republish the same source.

```bash
gh workflow run development-deploy.yml --ref main -f operation=deploy-development
```

GitHub UI: Actions → **CY Web Deploy** → Run workflow → Branch **main** → operation **deploy-development**. If dispatch is unavailable to the current integration, use the controlled publish branch with the same source checks. The `audit-identity` operation is read-only and does not publish.

All real deployments share the fixed `cyweb-production` lock with `cancel-in-progress: false`. PR validation may cancel older validation, while identity audits have a separate lock. Immediately before remote migration the source guard fetches current main, verifies the event SHA equals checkout, requires current main ancestry and the identical tracked tree, and additionally requires the exact main SHA for dispatch. If main advances while a run waits, stop and publish the newly reviewed main source. GitHub concurrency does not lock a manual Dashboard deployment or a separate Cloudflare Builds writer.

Confirm the run's source SHA, successful `validate-deployment-contract` **and** `deploy-development` jobs, plus the existing health, schedule, invalid-session and production portal checks. A green PR or skipped deploy is not deployment evidence:

```bash
gh run list --workflow development-deploy.yml --branch deploy/cyweb-development --event push --limit 5
gh run view <RUN_ID> --json status,conclusion,jobs,url
```

For dispatch runs use `--branch main --event workflow_dispatch` instead. The historical GitHub `development` Environment still supplies the existing settings; this change does not require creating another environment, Worker, database or Secret. Web publication does not create a tag or GitHub Release.

The workflow:

1. validates required Cloudflare/Identity inputs;
2. resolves canonical production Identity while verifying the original Worker/business D1, Workspace and core App;
3. renders an ephemeral config for the existing Worker;
4. verifies the current reviewed main source and applies only forward migrations to the original business D1;
5. builds and deploys the original Worker/assets;
6. verifies exact source/consumer/D1 health and invalid-session rejection with cookie clearing at both entry points;
7. requires the original canonical strict production portal guard to pass;
8. removes generated input config.

The explicit deploy signal updates the existing portal. It does not provision a second Worker, switch the business D1, change Module Access or authorize cleanup of existing business/test data.

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
CYWEB's existing development deployment. At that audit time its IDENTITY binding pointed to the
configured development provider. Workspace, core application, consumer 1.0.4 and
health matched; canonical strict readiness was **false**, with
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

### CYACCweb handback — verified 2026-10-15 17:24:39 Asia/Taipei

The CYWEB correction is deployed and the original canonical strict portal guard
passes. [PR #154](https://github.com/simonliu1118-byte/chihyuan-web/pull/154)
accepted head `70e6e9862b60e290ce0e9fb4125a6827a1840fb5` passed Governance
`38712073846`, Runtime `38712073567` (all four jobs), and deployment contract
`38712073611`; PR deployment was skipped. Main merge:
`9a76a1ac1337c82aa1db3c046edf48448feea64c`.

[Actual deployment run 38712562070](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/38712562070)
advanced the original deployment ref without force, using commit
`0be73dd96d81421f54f11f1e177f7365128f1bfb` with the previous deployment and reviewed
main as parents. Its tree `4ca0d9ba876f0acb9acc10d255469e7d7ca34f74` exactly matches
reviewed main. No new migration was applied. Both entry points returned source
0.7.26 / consumer 1.0.4 / this exact deployment commit / D1 ok within 1527ms.
The fallback initially returned the prior source and became current on the next
bounded observation; no redeployment was performed. Both invalid-session checks
returned the expected rejection and cleared the Web cookie.

The post-deployment audit at `2026-10-15T09:24:39.512Z` confirmed:

| Check | Observed result |
| --- | --- |
| Original configured Worker / business D1 | Both retained and verified |
| Development Identity binding | false |
| Canonical production Identity binding | true |
| Provider environment | production |
| Production provider / separate Identity D1 metadata | Verified |
| Workspace / core application / consumer / health | Match; consumer 1.0.4 |
| Original canonical strict production portal guard | productionPortalReady=true; failureCode=null |

The audit report's `mutationPerformed=false` describes the GET-only inspection,
not the enclosing run: the existing Worker was deployed before that inspection.
No provider authority, credentials, Module Access, IAM, business rows, accounting
D1 or CYInvoice source were changed by this work. Existing business/test data were
retained; a clean business-data release remains a separate pending step.

CYACCweb can now rerun its unchanged canonical
`resolve-cyid-production-runtime.mjs --require-account-portal` in its own protected
runner. Reconcile Draft #435 with current CYapps main before proceeding; this
CYWEB work does not merge that draft or deploy the accounting application. Do not
relax the strict guard or switch CYACC to development Identity.

Actual Email/initial-password/permanent-password/relogin/CYACC acceptance remains
pending. The colleague's report is compatible with the previous authority
mismatch, but no account-specific request/readback proves its entire root cause.
Confirm the formal account state before deciding whether reissue is needed; the
Web binding correction does not copy a password set in the old development
provider into production. No real Email or password was reissued in this work.
CYInvoice's separate provider/workline and other consumers' real logins were not
changed or accepted by this deployment. Root TODO remains the only progress list.

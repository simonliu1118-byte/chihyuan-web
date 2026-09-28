# CY Web Temporary Identity Bridge Deployment

> Scope: temporary compatibility bridge only. CYInvoice Cloud remains unchanged and remains an external account/credential authority until Shared Identity is extracted.

## Runtime shape

```text
CY Web browser
  ↓ employeeNo + password (login only)
CY Web Worker
  ↓ private Service Binding `IDENTITY`
existing CYInvoice Cloud Web Auth contract
  ↓ employee identity response
CY Web Worker
  ↓
CY Web D1 `web_sessions`
  ↓ HttpOnly / Secure / SameSite=Strict cookie
normal CY Web requests
```

CY Web does **not** read CYInvoice D1 and does not copy password verifiers, OTP material, recovery secrets or CYInvoice credential implementation.

## Deployment inputs

The deployment boundary injects:

Secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Development Environment variables:

- `CF_WORKER_NAME`
- `CF_D1_DATABASE_NAME`
- `CF_D1_DATABASE_ID`
- `CF_IDENTITY_SERVICE`
- `CF_IDENTITY_LOGIN_APPLICATION`

`CF_IDENTITY_SERVICE` becomes the private `IDENTITY` Service Binding target. `CF_IDENTITY_LOGIN_APPLICATION` becomes the provider-recognized temporary application/audience value.

Do not commit the real provider service name, real D1 identifier or other deployment-specific Cloudflare identifiers to this Public repository. The deployment-template pattern follows the same separation already used successfully by CYAccountingWeb: Public source owns the binding contract while the deployment environment supplies the actual target.

## Deployment source path

Current deployment files are:

- `wrangler.deploy.template.jsonc` — placeholder-only Cloudflare input config;
- `scripts/render-deploy-config.mjs` — validates deployment inputs and renders an ephemeral Wrangler config;
- `scripts/validate-deploy-config.mjs` — zero-secret render/shape contract test;
- `.github/workflows/development-deploy.yml` — CI validation plus manual development deployment.

The generated config name matches `wrangler.*.generated.jsonc` and is ignored by Git.

## PR validation gate

Every relevant pull request runs the deployment contract without touching remote Cloudflare resources:

1. validate the template renderer with fictional CI values;
2. render a CI-only Wrangler config;
3. apply the committed migration chain to Wrangler local D1 using that rendered config;
4. run a Cloudflare Vite production build with `CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH` pointing at the rendered config;
5. locate Vite's generated deployment `wrangler.json` under `dist/`;
6. run `wrangler deploy --dry-run` against that generated output config.

This proves the deployment shape, D1 binding, Identity Service Binding and Vite output are compatible without requiring secrets or a real provider target.

## Development deployment gate

Real non-production deployment is intentionally **manual only**.

Use the GitHub Actions workflow `CY Web Development Deploy` on the default branch and explicitly run it with `deploy=true`. The deploy job uses the protected `development` GitHub Environment.

The job then:

1. rejects missing Cloudflare secrets/variables;
2. renders an ephemeral development Wrangler config;
3. applies forward migrations to the configured **development** D1 with `--remote`;
4. builds the Worker and assets through the Cloudflare Vite plugin;
5. deploys the Vite-generated Worker bundle/config;
6. removes the generated input config.

There is no push-to-main automatic deployment and this workflow is not a production rollout path.

## Identity acceptance after development deployment

Once the development Worker has a working `IDENTITY` Service Binding, verify the existing CY Web routes against the real temporary account provider:

```text
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
```

Acceptance requires:

- valid temporary-provider credentials can create a CY Web session;
- the browser receives only the `cyweb_session` HttpOnly/Secure/SameSite=Strict cookie, not credential verifier material;
- `/api/auth/me` resolves the CY Web-owned D1 session without resending the password;
- logout invalidates the CY Web session;
- invalid credentials, application denial, rate limit and provider unavailability map to stable CY Web errors.

Real credentials must not be committed to source or CI fixtures.

## Current compatibility limitation

The current external Web Auth provider only recognizes its existing application policy. CY Web therefore does not claim full Shared Identity acceptance from this bridge alone.

In particular, if the temporarily configured provider audience only allows `ADMIN` / `SUPER_ADMIN`, ordinary `EMPLOYEE` login remains unavailable until the account authority is extracted or exposes a CY Web-compatible audience. CY Web must not bypass this by reading the provider D1 or copying credential verification code.

## Replacement boundary

Provider-specific transport is isolated in:

- `worker/identity/cyinvoice-web-auth-provider.ts`

CY Web business modules consume only:

- `IdentityLoginProvider` for one-shot login;
- `IdentityAdapter` for request identity resolution.

A later Shared Identity extraction replaces the provider/session integration at this boundary rather than rewriting Customer, Item, Defect, Sales Work Order, Outsourcing, WorkLog, Settings or Audit modules.

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

The approved deployment boundary must inject:

- private Service Binding: `IDENTITY` → current temporary employee-account provider;
- variable: `IDENTITY_LOGIN_APPLICATION` → provider-recognized temporary application/audience value.

Do not commit the production provider service name or other production Cloudflare identifiers to this Public repository. Follow the same deployment-template pattern already used successfully by CYAccountingWeb: public source names the binding contract while deployment injects the actual service target.

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

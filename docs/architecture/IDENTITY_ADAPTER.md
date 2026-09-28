# CY Web Identity Adapter — CYCloud Identity Contract

> Status: current CY Web boundary around the shared CYCloud Identity authority. Implementation progress belongs in root `TODO.md`.

## 1. Purpose

CY Web consumes the shared Workspace / Employee / Credential / Identity Group / Application Access / Session / OTP / Recovery authority from **CYCloud Identity** through a private Cloudflare Service Binding.

Business modules consume one CY Web-local normalized principal. They must not depend on Identity D1 tables, credential algorithms, OTP/recovery internals or provider transport details.

## 2. Authority split

### CYCloud Identity owns

- Workspace identity and lifecycle.
- Employee identity and stable employee ID.
- Employee number, display name and enabled/revision state.
- Credential verification and credential version.
- Protected Workspace highest authority (`super_admin_employee_id`).
- Extensible Identity Groups and group membership.
- Workspace/Application enablement and group/direct Application Access.
- Identity session creation, validation, expiry and revocation.
- Email OTP, recovery and shared account lifecycle.

The Workspace highest authority is a protected authority pointer, not an ordinary editable Identity Group. CY Web receives `isWorkspaceSuperAdmin` as the explicit authority signal.

Normal Identity authorization is data-driven through Identity Groups. CY Web must not recreate a hard-coded normal role enum such as `EMPLOYEE / ADMIN / SUPER_ADMIN` as a competing shared authority model.

### CY Web owns

- Local `app_members` projection keyed by the stable shared Identity employee ID.
- CY Web-only app tags and app-tag → module-entry mapping.
- Domain-specific authorization inside each CY Web workflow.
- CY Web Audit events for protected CY Web operations.

CY Web app tags are app-local authorization metadata. They are not shared Identity Groups.

## 3. Normalized principal contract

Protected CY Web APIs consume:

```ts
interface IdentityPrincipal {
  workspaceId: string;
  employeeId: string;
  employeeNo: string;
  displayName: string;
  isWorkspaceSuperAdmin: boolean;
  groupKeys: string[];
  credentialVersion: number;
  employeeRevision: number;
}
```

`groupKeys` are descriptive shared-Identity membership data. CY Web does not turn specific group keys into permanently hard-coded global roles.

The adapter distinguishes at least:

- authenticated principal;
- unauthenticated/missing session;
- invalid/revoked session;
- shared-provider Application Access denied;
- Identity dependency unavailable.

## 4. Browser session transport

CYCloud Identity owns the session record and revocation authority.

CY Web browser flow:

```text
Browser
  ↓ POST /api/auth/login (employeeNo + password)
CY Web Worker
  ↓ private IDENTITY Service Binding
CYCloud Identity /v1/identity/login
  ↓ opaque Identity session token
CY Web Worker
  ↓ HttpOnly / Secure / SameSite=Strict cookie
Browser
```

Normal later requests do not resend passwords. CY Web extracts the opaque Identity token from its HttpOnly cookie and asks CYCloud Identity to resolve it through `/v1/identity/session/resolve`.

CY Web does **not** persist a duplicate browser session row in its own D1. The former temporary `web_sessions` projection is removed by forward migration once the CYCloud Identity cutover is deployed.

Logout calls CYCloud Identity `/v1/identity/logout` before clearing the browser cookie. If Identity is unavailable, CY Web does not report a successful revocation.

## 5. Application and Workspace scope

CYCloud Identity login requires explicit Workspace and Application scope.

CY Web obtains both from deployment-injected runtime configuration:

- `IDENTITY_WORKSPACE_ID`
- `IDENTITY_APPLICATION_ID`

The private Service Binding is `IDENTITY`.

Real Workspace IDs, Cloudflare service targets and other deployment-resolved identifiers are not committed to this Public repository. CI uses synthetic placeholders only.

## 6. App-member projection

When an authenticated principal is accepted, CY Web resolves its local `app_members` row by `identity_employee_id`.

- `identity_employee_id` is the stable linkage.
- `employee_no` may be refreshed as display/search metadata.
- credentials are never copied into CY Web.
- Identity Groups are never copied as a competing shared authority database.
- Workspace highest-authority transfer is never performed by CY Web local tables.

An authenticated employee may exist before any CY Web app tag is assigned. In that case only the app-local permissions explicitly granted by CY Web are available.

## 7. Authorization layering

Authorization has three layers:

1. CYCloud Identity establishes employee identity, Workspace scope, current Application Access, Identity Groups and highest-authority status.
2. CY Web app authorization decides module entry.
3. The target domain service enforces operation-specific workflow rules.

Initial CY Web module-entry semantics:

- the protected Workspace highest authority (`isWorkspaceSuperAdmin=true`) can enter every CY Web module;
- every other employee uses active CY Web app tags/module mappings;
- Identity Group membership does not automatically become a hard-coded CY Web role;
- hiding a menu/control is never authoritative permission enforcement; protected APIs check authorization server-side.

## 8. Login and password boundary

CY Web does not implement password hashing or credential verification.

The browser login form and CY Web Worker enforce the current shared input boundary before forwarding credentials:

- employee number: exactly 4 digits;
- password: 8–16 Unicode characters.

CYCloud Identity remains the credential authority and performs the actual password verification.

## 9. Error normalization

| CY Web condition | HTTP | Stable error code |
| --- | ---: | --- |
| no authenticated session | 401 | `AUTH_REQUIRED` |
| Identity session invalid/revoked | 401 | `AUTH_INVALID` |
| bad employee number/password | 401 | `LOGIN_FAILED` |
| malformed login input | 400 | `INVALID_LOGIN_REQUEST` |
| authenticated but CY Web-local access disabled | 403 | `ACCESS_DENIED` |
| CYCloud Identity Application Access denied | 403 | `ACCESS_DENIED` |
| login rate limited | 429 | `LOGIN_RATE_LIMITED` |
| Identity provider unavailable/invalid response | 503 | `IDENTITY_UNAVAILABLE` |

Provider-specific internal messages are not forwarded directly to the browser.

## 10. Provider acceptance gate

The concrete CYCloud Identity adapter is accepted only when non-production testing proves:

1. CY Web Application scope is recognized.
2. Workspace highest authority can authenticate.
3. ordinary eligible identities can authenticate according to Identity Application Access.
4. a browser session is established without exposing the provider token to frontend JavaScript.
5. later requests resolve server-side without resending credentials.
6. disabled/revoked/expired session behavior is enforced by CYCloud Identity.
7. logout revokes the provider session.
8. principal fields are normalized without exposing password verifier, OTP/recovery material or provider secrets.
9. provider-unavailable and access-denied outcomes are normalized.

## 11. Cross-project ownership boundary

CYCloud Identity is the shared authority for CY Web, CYAccountingWeb, CYInvoice and future Cloud applications as they migrate to the shared service.

- CY Web does not read CYInvoice D1.
- CY Web does not modify CYInvoice Cloud merely to satisfy CY Web login requirements.
- CYAccountingWeb remains a separate application with its own Application Access policy and migration workstream.
- CYInvoice-specific device pairing, device tokens and local Windows/offline credential behavior remain CYInvoice-specific unless separately promoted into a shared contract.

## 12. Public repository boundary

Public source may contain generic contracts, binding names, placeholders and synthetic fixtures only. Do not commit:

- real Workspace IDs/codes;
- real Employee data;
- real Application catalog/access matrix;
- production Cloudflare resource/service identifiers;
- provider tokens or session tokens;
- password/OTP/recovery secrets;
- credential verifiers or hashing internals copied from Identity.

Production/development resolution is injected through the approved deployment boundary.

## 13. Non-goals

- No CY Web password table.
- No CY Web-owned Identity session table.
- No hard-coded ordinary shared role enum.
- No duplicate Identity Group lifecycle.
- No credential material in CY Web D1.
- No direct Identity D1 access.
- No CYAccountingWeb runtime/source change from this application workstream.
- No CYInvoice Cloud source/runtime change from this CY Web cutover.

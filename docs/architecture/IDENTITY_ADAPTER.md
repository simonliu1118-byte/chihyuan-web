# CY Web Identity Adapter — CYCloud Identity Contract

> **Status: approved CY Web target boundary; provider/runtime migration pending.**
>
> Current CY Web `0.1.51` and deployed CYCloud Identity `0.1.14` still contain legacy Identity Group / compatibility-role fields. New implementation must converge on this document and CYCloud Identity `docs/ROLE_AND_ACCESS_MODEL.md` rather than extend the legacy Group model.

## 1. Purpose

CY Web consumes shared Workspace / Employee / Credential / Workspace Role / Identity Admin capability / Application Access / Session / OTP / Recovery authority from **CYCloud Identity** through a private Cloudflare Service Binding.

Business modules consume one CY Web-local normalized principal. They must not depend on Identity D1 tables, credential algorithms, OTP/recovery internals or provider transport details.

## 2. Authority split

### CYCloud Identity owns

- Workspace identity and lifecycle;
- Employee identity and stable employee ID;
- Employee number, display name, Email state and enabled/revision state;
- credential verification and credential version;
- Workspace role: `SUPER_ADMIN / ADMIN / USER`;
- protected Super Admin authority pointer;
- `Identity Admin` capability on ADMIN;
- Workspace/Application enablement and App-level entry Access;
- Identity session creation, validation, expiry and revocation;
- Email OTP, recovery and shared account lifecycle.

Super Admin is a protected authority pointer. CY Web receives provider authority and must not reconstruct Super Admin from editable local data.

Identity Admin is a provider-owned ADMIN capability. CY Web may use that capability to authorize Module Access administration, but cannot grant/revoke it locally.

### CY Web owns

- local member projection keyed by stable Identity employee ID;
- CY Web Module Access for Customer / Order / Item / Outsourcing / WorkLog / future modules;
- USER-level finer business permissions when needed;
- domain-specific authorization inside each workflow;
- CY Web audit events for protected CY Web operations.

CY Web Module Access is not duplicated back into CYID as a universal permission catalog.

## 3. Core CY Web entry rule

CY Web is the core account-management application.

Every valid Employee must be able to enter CY Web even with zero business Module Access so they can manage their own account.

Conceptually:

```text
CYWEB entry access = TRUE (locked / non-revocable)
```

A consumer-side missing business Module grant must never prevent self-service account access.

## 4. Role contract

CY Web directly consumes the Workspace role from CYID:

```text
CYID SUPER_ADMIN -> CY Web SUPER_ADMIN
CYID ADMIN       -> CY Web ADMIN
CYID USER        -> CY Web USER
```

No Identity Group-to-role translation is part of the forward contract.

`Identity Admin` is an extra capability on `ADMIN`, not a fourth CY Web role.

## 5. Target normalized principal

The target adapter should normalize at least:

```ts
interface IdentityPrincipal {
  workspaceId: string;
  employeeId: string;
  employeeNo: string;
  displayName: string;
  role: "SUPER_ADMIN" | "ADMIN" | "USER";
  isIdentityAdmin: boolean;
  credentialVersion: number;
  employeeRevision: number;
}
```

During migration, legacy provider fields such as `isWorkspaceSuperAdmin`, `groupKeys` and `applicationRoleKey` may still exist. The adapter may translate them temporarily, but CY Web must not add new product behavior that depends on Group-derived roles.

## 6. Browser session transport

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

Later requests resolve the opaque token through CYCloud Identity. CY Web does not persist a duplicate Identity browser session authority in its own D1.

Logout calls CYCloud Identity before clearing the browser cookie. If Identity is unavailable, CY Web does not report a successful provider revocation.

## 7. Module Access

CY Web is a multi-module exception among CY Apps.

Initial rules:

- `SUPER_ADMIN`: all modules automatically allowed / locked;
- `Identity Admin`: may configure eligible USER / ADMIN / other Identity Admin Module Access, except its own;
- `ADMIN`: no Module Access configuration capability;
- `USER`: receives only module/business permissions granted under CY Web-local policy;
- an `ADMIN` with a module Access has full administration authority inside that module;
- Role change does not silently change Module Access.

Identity Admin's own Module Access must be changed by another Identity Admin or Super Admin.

Super Admin Module Access is not represented as cancellable ordinary rows.

## 8. Account-management UI authorization

CY Web hosts the Shared Identity management UI but provider authorization remains authoritative.

### USER

- self-service password / Email / account state only.

### ADMIN

- USER lifecycle operations permitted by CYID: create USER, pending edit/resend/delete, activated USER disable/re-enable;
- no App Access / Module Access management;
- no USER↔ADMIN;
- no forced activated-account Email recovery;
- no Identity Admin management;
- no Super Admin/security-core controls.

### Identity Admin

- ADMIN capabilities plus USER↔ADMIN;
- App Access management through CYID;
- CY Web Module Access management through CY Web;
- forced activated-account Email recovery;
- cannot edit its own Access or protected Super Admin state.

### SUPER_ADMIN

- full management surface;
- grants/revokes Identity Admin capability;
- Super Admin transfer;
- Workspace Recovery/security-core/OTP policy;
- automatic all-App/all-CY-Web-module access.

## 9. Employee activation UX

Target Employee creation/activation behavior:

1. manager creates Employee and chooses allowed initial role;
2. CYID creates pending Employee;
3. CYID automatically sends first activation email;
4. email contains a link opening CY Web activation UI;
5. link itself is not an authentication credential;
6. Employee completes Email verification/OTP and first-password setup;
7. account becomes enabled.

Pending management actions include:

```text
編輯 | 重寄啟用信 | 刪除
```

Email delivery failure must not delete the created Employee; show failure and allow resend.

## 10. Forced Email recovery

Identity Admin / Super Admin may replace an activated Employee's unusable Email.

CY Web should render the resulting state distinctly, for example:

```text
啟用 · Email 待驗證
```

The account remains activated, password remains, sessions are revoked, and the new Email requires verification. It does not revert to first-time pending activation.

## 11. Authorization layering

Authorization has four practical layers:

1. CYCloud Identity authenticates Employee and resolves current Workspace Role / Identity Admin capability.
2. CYCloud Identity enforces App-level entry authority; CY Web entry is the mandatory core exception.
3. CY Web enforces Module Access server-side.
4. The target domain service enforces operation-specific business rules / USER-level finer permissions.

UI hiding is never sufficient authorization.

## 12. Immediate effect

At minimum:

- Employee disabled -> provider session invalid;
- role change -> provider session invalid/re-resolved under new role;
- forced Email recovery -> provider sessions revoked;
- CY Web Module Access change -> subsequent protected API requests use the new authorization;
- browser stale navigation never preserves removed authority.

## 13. Login and password boundary

CY Web does not implement password hashing or credential verification.

Input boundary remains:

- employee number: exactly 4 digits;
- password: 8–16 Unicode characters.

CYCloud Identity performs actual credential verification.

## 14. Error normalization

| CY Web condition | HTTP | Stable error code |
| --- | ---: | --- |
| no authenticated session | 401 | `AUTH_REQUIRED` |
| Identity session invalid/revoked | 401 | `AUTH_INVALID` |
| bad employee number/password | 401 | `LOGIN_FAILED` |
| malformed login input | 400 | `INVALID_LOGIN_REQUEST` |
| authenticated but CY Web module operation denied | 403 | `ACCESS_DENIED` |
| login rate limited | 429 | `LOGIN_RATE_LIMITED` |
| Identity provider unavailable/invalid response | 503 | `IDENTITY_UNAVAILABLE` |

Provider-specific internal messages are not forwarded directly to the browser.

## 15. Current legacy implementation note

The currently deployed provider still uses:

- Identity Groups and memberships;
- Group/direct Application grants;
- optional `USER_ADMIN` compatibility-role projection;
- `groupKeys` / Group-derived `applicationRoleKey` in the principal.

Those fields remain implementation compatibility during migration only. New CY Web code should target direct Workspace Role + Identity Admin capability.

## 16. Cross-project boundary

CYCloud Identity is the shared authority for CY Web, CY Accounting Web, CYInvoice and future CY Apps as they migrate.

- CY Web does not read CYInvoice D1;
- CY Web does not modify CYInvoice runtime to satisfy this migration;
- CY Accounting Web remains a separate application/integration workstream;
- CYInvoice-specific Device/local/offline behavior stays CYInvoice-specific unless separately promoted into a shared contract.

## 17. Public repository boundary

Public source may contain generic contracts, placeholders and synthetic fixtures only. Do not commit real Workspace IDs, real Employee data, real access matrices, production Cloudflare resource IDs, session tokens, credentials, OTP/recovery secrets or provider secrets.

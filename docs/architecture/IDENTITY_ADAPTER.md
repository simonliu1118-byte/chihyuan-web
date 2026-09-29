# CY Web Identity Adapter — CYCloud Identity Contract

> **Status: CYCloud Identity 0.3 / CY Web 0.3 first-login contract.**
>
> CY Web consumes shared identity authority from CYCloud Identity (CYID). Identity Group compatibility data may remain during migration, but forward authorization uses direct Workspace role, Identity Admin capability and direct Application Access.

## 1. Purpose

CY Web consumes shared Workspace / Employee / Credential / Workspace Role / Identity Admin capability / Application Access / Session / Email verification / Recovery authority from **CYCloud Identity** through a private Cloudflare Service Binding.

Business modules consume one CY Web-local normalized principal. They must not depend on Identity D1 tables, credential algorithms, temporary first-login credentials, OTP/recovery internals or provider transport details.

## 2. Authority split

### CYCloud Identity owns

- Workspace and Employee identity/lifecycle;
- employee number, display name, Email state and enabled/revision state;
- permanent and temporary credential verification;
- Workspace role `SUPER_ADMIN / ADMIN / USER`;
- protected Super Admin authority pointer;
- `Identity Admin` capability on ADMIN;
- Workspace/Application enablement and App-level entry Access;
- Identity session creation, validation, expiry and revocation;
- first-login Email verification, password recovery and Email recovery.

Super Admin is a protected authority pointer. CY Web receives provider authority and must not reconstruct it from editable local data.

Identity Admin is a provider-owned ADMIN capability. CY Web may use it to authorize Module Access administration, but cannot grant/revoke it locally.

### CY Web owns

- local member projection keyed by stable Identity employee ID;
- CY Web Module Access for Customer / Order / Item / Outsourcing / WorkLog / future modules;
- USER-level finer business permissions when needed;
- domain-specific authorization inside each workflow;
- CY Web audit events for protected CY Web operations.

CY Web Module Access is not duplicated into CYID as a universal permission catalog.

## 3. Core CY Web entry rule

CY Web is the core account-management application. Every valid activated Employee must be able to enter CY Web even with zero business Module Access so they can manage their own account.

```text
CYWEB entry access = TRUE (locked / non-revocable)
```

A first-time unverified Employee is a special pre-session case: they may submit the Email-delivered one-time password only to enter the mandatory password-replacement flow. That temporary authority is **not** CY Web business/application access and does not create a normal session.

## 4. Role contract

CY Web directly consumes the Workspace role from CYID:

```text
CYID SUPER_ADMIN -> CY Web SUPER_ADMIN
CYID ADMIN       -> CY Web ADMIN
CYID USER        -> CY Web USER
```

No Identity Group-to-role translation is part of the forward contract. `Identity Admin` is an extra capability on `ADMIN`, not a fourth role.

## 5. Normalized principal

Normal authenticated sessions normalize at least:

```ts
interface IdentityPrincipal {
  workspaceId: string;
  employeeId: string;
  employeeNo: string;
  displayName: string;
  workspaceRole: "SUPER_ADMIN" | "ADMIN" | "USER";
  isIdentityAdmin: boolean;
  emailVerified: boolean;
  isWorkspaceSuperAdmin: boolean;
  credentialVersion: number;
  employeeRevision: number;
}
```

`isWorkspaceSuperAdmin` must agree with `workspaceRole === "SUPER_ADMIN"`. Legacy `groupKeys` may remain temporarily as descriptive compatibility data, but CY Web authorization must not depend on it.

## 6. Normal browser session transport

```text
Browser
  ↓ POST /api/auth/login (employeeNo + permanent password)
CY Web Worker
  ↓ private IDENTITY Service Binding
CYID /v1/identity/login
  ↓ opaque Identity session token
CY Web Worker
  ↓ HttpOnly / Secure / SameSite=Strict cookie
Browser
```

Later requests resolve the opaque token through CYID. CY Web does not persist a duplicate Identity browser-session authority in its own D1.

Logout calls CYID before clearing the browser cookie. If Identity is unavailable, CY Web does not report a successful provider revocation.

## 7. First-time Email verification / forced password replacement

The old activation-link + activation-OTP flow is retired.

A newly created Employee is shown as:

```text
Email: 尚未驗證
狀態: 尚未驗證
```

Creation flow:

1. manager creates the User and selects an allowed initial role;
2. CYID creates the never-activated account with no permanent credential;
3. CYID generates an 8-character random **一次性預設密碼** and sends an Email containing the 4-digit account number and that password; the Email does not need an activation link;
4. the User opens the normal CY Web login at `https://admin.chihyuancm.com` and submits account number + one-time password;
5. successful verification returns only a short-lived `first-login` ticket; it does **not** create an Identity session and cannot authorize modules or other Apps;
6. CY Web forces the User to set a new 8–16-character permanent password before any normal session exists;
7. successful completion atomically creates the permanent credential, marks Email verified, writes first activation, enables the account, invalidates/removes the temporary credential and then creates the normal Identity session;
8. the User enters CY Web directly after password replacement.

The one-time password plaintext exists only for Email delivery. CY Web never receives it back from CYID except as the user's login input, never stores it, and never implements its verifier.

Pending-row actions are:

```text
編輯 | 重寄 Email 驗證 | 刪除
```

`重寄 Email 驗證` generates a new one-time default password and invalidates the previous one. Email delivery failure must not delete the User; preserve the `尚未驗證` account and allow resend.

The login page therefore has no separate `啟用帳號` entry and no `?activate=1` deep-link flow.

## 8. Module Access

CY Web is a multi-module exception among CY Apps.

- `SUPER_ADMIN`: all modules automatically allowed / locked;
- `Identity Admin`: may configure eligible USER / ADMIN / other Identity Admin Module Access, except its own;
- `ADMIN`: no Module Access configuration capability;
- `USER`: receives only module/business permissions granted under CY Web-local policy;
- an `ADMIN` with a module Access has full administration authority inside that module;
- role change does not silently change Module Access.

Identity Admin's own Module Access must be changed by another Identity Admin or Super Admin. Super Admin Module Access is not represented as cancellable ordinary rows.

## 9. Account-management UI authorization

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

## 10. Forced Email recovery for an activated account

Identity Admin / Super Admin may replace an activated User's unusable Email. This is distinct from first-time verification.

CY Web renders the state distinctly, for example:

```text
啟用 · Email 待驗證
```

The account remains activated, the permanent password remains, sessions are revoked, and the replacement Email uses the activated-account verification flow. It does not revert to first-time `尚未驗證`.

## 11. Authorization layering

1. CYID authenticates Employee and resolves current Workspace Role / Identity Admin capability.
2. CYID enforces App-level entry authority; CY Web is the mandatory core exception.
3. CY Web enforces Module Access server-side.
4. The target domain service enforces operation-specific business rules / USER-level finer permissions.

UI hiding is never sufficient authorization.

## 12. Immediate effect

- Employee disabled -> provider session invalid;
- role change -> provider session revoked/re-established under new role;
- App Access removal -> affected App session can no longer authorize;
- forced Email recovery -> provider sessions revoked;
- CY Web Module Access change -> subsequent protected API requests use new authorization;
- stale browser navigation never preserves removed authority.

## 13. Password boundary

CY Web does not implement password hashing or credential verification.

- employee number: exactly 4 digits;
- one-time default password supplied by CYID: 8 random characters;
- permanent password: 8–16 Unicode characters.

CYID performs all credential verification. A successful one-time-password check yields only the short-lived first-login ticket. Only permanent-password completion may lead to a normal session.

## 14. Error normalization

| CY Web condition | HTTP | Stable error code |
| --- | ---: | --- |
| no authenticated session | 401 | `AUTH_REQUIRED` |
| Identity session invalid/revoked | 401 | `AUTH_INVALID` |
| bad employee number/password | 401 | `LOGIN_FAILED` |
| malformed login input | 400 | `INVALID_LOGIN_REQUEST` |
| first-login ticket invalid/expired | 400 | `FIRST_LOGIN_EXPIRED` / `INVALID_FIRST_LOGIN` |
| authenticated but CY Web module operation denied | 403 | `ACCESS_DENIED` |
| login rate limited | 429 | `LOGIN_RATE_LIMITED` |
| Identity provider unavailable/invalid response | 503 | `IDENTITY_UNAVAILABLE` |

Provider-specific internal messages are not forwarded directly when doing so would expose runtime detail.

## 15. Legacy compatibility boundary

Legacy Group tables/endpoints and descriptive fields may remain temporarily so older consumers can migrate safely. They are not effective forward authorization sources.

CY Web must not:

- derive Role from Identity Group membership;
- present Group-to-App compatibility role as the forward management model;
- use `groupKeys` to grant module or Workspace authority;
- let local `app_members.is_active` revoke the mandatory CY Web account shell;
- restore the retired public activation-link / activation-OTP flow.

The internal admin path currently named `activation/resend` may remain temporarily as a compatibility transport name; its user-visible and provider semantics are `重寄 Email 驗證` by replacing the one-time initial password.

## 16. Cross-project boundary

CYID is the shared authority for **CY Web**, **CYAccountingWeb (CYACC-web)**, **CYInvoice**, and future CY Apps as they migrate.

- CY Web does not read or mutate CYInvoice D1/runtime/device lifecycle;
- CYInvoice integration remains a separate CYInvoice workstream and is reference-only from this workstream;
- CYAccountingWeb remains a separate consumer integration workstream;
- CYInvoice-specific Device/local/offline behavior remains CYInvoice-specific unless separately promoted into a shared contract.

## 17. Public repository boundary

Public source may contain generic contracts, placeholders and synthetic fixtures only. Do not commit real Workspace IDs, real Employee data, real access matrices, production Cloudflare resource IDs, session tokens, credentials, OTP/recovery secrets or provider secrets.

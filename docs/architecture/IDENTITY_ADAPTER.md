# CY Web Identity Adapter — CYCloud Identity Contract

> **Status:** CY Web-specific CYID adapter contract. Shared consumer semantics come from CYID canonical source and are synchronized locally under `docs/contracts/cyid/`; this document only describes CY Web-specific adapter/module behavior. The local mirror is read-only and validated byte-for-byte against CYID `main`. Current deployed versions and rollout state are tracked in root `TODO.md`.

## 1. Purpose

CY Web consumes Shared Identity from CYCloud Identity through a private Cloudflare Service Binding.

CYID owns Workspace, Employee, Credential, Workspace Role, Identity Admin capability, Application Access, Session, Email verification, OTP, Recovery and protected Super Admin authority. CY Web owns its business Module Access and domain authorization.

CY Web business modules consume one normalized principal and must not depend on Identity D1 tables, password algorithms, OTP internals, initial credential storage or provider transport details.

CY Web declares the shared contract revision it implements in root `CYID_CONSUMER_VERSION`; governed validation/deployment must keep that version inside the provider support window. Cross-repository contract files are read from `docs/contracts/cyid/`; refresh them only with `scripts/sync-cyid-consumer-contract.sh`.

## 2. Authority split

### CYCloud Identity owns

- Workspace lifecycle and protected Super Admin authority pointer;
- Employee identity, Employee No, name, Email state, enabled/revision state;
- permanent credentials and temporary first-login credentials;
- effective Workspace Role `SUPER_ADMIN / ADMIN / USER`;
- ADMIN-only `Identity Admin` capability;
- Workspace/Application enablement and App-level entry Access;
- normal Identity Session creation, validation, expiry and revocation;
- Email verification, OTP, password recovery, activated-account Email recovery and Super Admin transfer.

### CY Web owns

- CY Web-local member projection keyed by stable Identity employee ID;
- Customer / Order / Item / Outsourcing / WorkLog / future Module Access;
- USER-level finer business permissions if later needed;
- domain-specific authorization and CY Web audit events.

CY Web must not duplicate credential/session authority or move its Module Access into CYID as a universal permission catalog.

## 3. Core CY Web entry

CY Web is the core account-management application.

```text
CYWEB entry access = TRUE (locked / non-revocable)
```

Every valid Employee can reach CY Web account self-service even with zero business Module Access. Local member/module projection must never become a second shell-entry switch.

## 4. Role contract

CY Web directly consumes:

```text
CYID SUPER_ADMIN -> CY Web SUPER_ADMIN
CYID ADMIN       -> CY Web ADMIN
CYID USER        -> CY Web USER
```

Identity Admin is an extra capability on ADMIN, not a fourth role. Legacy Group fields are descriptive compatibility only and never an authorization source.

## 5. Normalized principal

Normal authenticated sessions expose at least:

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

`isWorkspaceSuperAdmin` must agree with `workspaceRole === "SUPER_ADMIN"`.

## 6. Normal login/session transport

```text
Browser
  -> POST /api/auth/login (employeeNo + password)
CY Web Worker
  -> private IDENTITY Service Binding
CYID /v1/identity/login
  -> opaque normal Identity session token
CY Web Worker
  -> HttpOnly / Secure / SameSite=Strict cookie
Browser
```

CY Web does not persist a duplicate Identity session table. Later requests resolve the provider token through CYID. Logout revokes at CYID before CY Web clears the cookie.

A normal Session may only be created from a successful **permanent-password login**.

## 7. First Email verification / first login

New Employee flow is named **Email 驗證**. CY Web must not expose a separate「啟用帳號」entry.

Flow:

1. authorized manager creates Employee with an allowed initial Role;
2. CYID stores the Employee as Email-unverified / first-login incomplete;
3. CYID automatically sends an Email verification message containing a one-time first-login password;
4. user opens the ordinary CY Web login page and submits Employee No + that first-login password;
5. CYID recognizes the initial credential only for the configured CY Web core account App and returns `passwordChangeRequired` plus a short-lived first-login ticket;
6. CY Web does **not** create/set a normal Identity session cookie and instead opens the mandatory permanent-password screen;
7. user submits an 8–16 character permanent password through the first-login completion endpoint;
8. CYID atomically creates the permanent credential, marks Email verified / durable first lifecycle complete, and invalidates the initial credential + first-login ticket;
9. completion returns `reloginRequired` and **no normal Identity session**;
10. CY Web returns to the ordinary login page and asks the user to log in again with the new permanent password.

The first-login ticket is not a Session and must never authorize business APIs.

## 8. Expiry, resend and pending Employee

Initial first-login credentials must have explicit expiry.

- expired initial credential cannot enter first-login flow;
- `重寄驗證 Email` generates a new initial password + new expiry and immediately invalidates prior initial credential/tickets;
- editing a pending Employee Email does the same against the new Email;
- delivery failure keeps the Employee Email-unverified and allows resend;
- only an Employee who never completed first Email verification / permanent credential creation may be physically deleted.

Consumer-facing wording stays **Email 驗證** even if a temporary compatibility API path still contains `activation`.

## 9. Account-management authorization

### USER

- own password / Email / account self-service only.

### ADMIN

- create USER;
- edit/resend/delete never-verified USER;
- disable/re-enable activated USER;
- no App Access or CY Web Module Access management;
- no USER<->ADMIN;
- no forced activated-account Email recovery;
- no Identity Admin or Super Admin/security-core controls.

### Identity Admin

- normal ADMIN actions;
- create USER or ADMIN;
- eligible USER<->ADMIN;
- eligible direct App Access through CYID;
- eligible CY Web Module Access through CY Web;
- forced activated-account Email recovery;
- cannot modify its own Access or protected Super Admin state.

### SUPER_ADMIN

- full management surface;
- grants/revokes Identity Admin;
- protected Super Admin transfer;
- Workspace Recovery/security-core/OTP policy;
- automatic all Workspace-enabled App entry and all CY Web Module Access.

## 10. CY Web Module Access

CY Web is a multi-module exception:

- Super Admin: all modules automatically allowed / locked;
- Identity Admin / Super Admin: configure eligible Employee Module Access;
- normal ADMIN: no Module Access administration;
- ADMIN with a module: full administration authority inside that module;
- Identity Admin cannot change its own Module Access;
- Role changes do not silently add/remove Module Access;
- forward storage authority is direct `app_member_module_access` (Employee × fixed Module code);
- legacy `app_tags / app_tag_modules / app_member_tags` may remain as metadata/history but do not authorize runtime requests.

Protected Worker/API routes must enforce current Module Access server-side on each relevant request. Navigation visibility is not an authorization boundary.

## 11. Activated-account Email recovery

Forced Email recovery is distinct from first Email verification.

For an already activated Employee, Identity Admin/Super Admin may replace an unusable Email. The permanent password and activated history remain; replacement Email becomes unverified; current sessions are revoked; UI may show `啟用 · Email 待驗證`.

This does not return the Employee to the first-login lifecycle.

## 12. Immediate effect

At minimum:

- Employee disabled -> provider session invalid;
- role change -> affected provider sessions invalidated;
- App Access removal -> affected App session no longer authorizes;
- permanent credential change/reset -> older sessions invalid;
- forced Email recovery -> Employee sessions revoked;
- Super Admin transfer -> old/new authority sessions re-authenticate;
- CY Web Module Access change -> subsequent protected CY Web requests use new authorization.

Stale browser UI never preserves removed authority.

## 13. Error normalization

CY Web exposes stable consumer errors instead of provider internals. Existing classes include:

| CY Web condition | HTTP | Stable code |
| --- | ---: | --- |
| no authenticated session | 401 | `AUTH_REQUIRED` |
| invalid/revoked provider session | 401 | `AUTH_INVALID` |
| invalid permanent/initial credential | 401 | `LOGIN_FAILED` |
| malformed login | 400 | `INVALID_LOGIN_REQUEST` |
| module operation denied | 403 | `ACCESS_DENIED` |
| login rate limited | 429 | `LOGIN_RATE_LIMITED` |
| Identity unavailable/invalid response | 503 | `IDENTITY_UNAVAILABLE` |

First-login expired/invalid/relogin-required provider results must be normalized without exposing raw provider implementation details.

## 14. Cross-project boundary

CYID is also the shared Identity authority for CYAccountingWeb (CYACCweb), CYInvoice and future CY Apps.

This CY Web workstream defines/accepts the shared contract but does not directly modify those consumer runtimes. Once the shared contract is accepted, consumer-specific handoff is generated from CYID canonical contracts and delivered to each target workstream.

CYInvoice-specific Device/local/offline behavior remains CYInvoice-owned unless separately promoted.

## 15. Public-source boundary

Public source may contain generic contracts, placeholders and synthetic fixtures only. Do not commit real Workspace IDs, Employee data, access matrices, Cloudflare resource IDs, passwords, first-login passwords, first-login tickets, session tokens, OTP/recovery material or provider secrets.

## Core-portal application registration

The existing account-management page exposes a Super Admin-only registration dialog through the canonical 1.0.4 endpoint (§17.1). The existing same-origin identity-management proxy forwards the HttpOnly Session and deployment-configured core Application; CYID derives the actor Workspace and performs all catalog/enablement/authority/audit mutations. CY Web stores no registry or grants locally. Shared Dialog, fields, dirty guard, confirmation and Toast provide presentation; the existing access snapshot refresh remains the single list owner. Consumer business Workspace IDs are not inputs to this operation.

## Active-browser authority freshness

`AuthGate` is the single browser owner of the current authenticated principal and module snapshot. It reads `/api/auth/me?include=module-access` every 30 seconds while visible, and on focus, visibility return or network reconnection. The existing `me` route resolves CYID once, then reads app-local grants through the same `currentModuleAccess` service as `/api/module-access`. The optional expansion preserves the original `me` response for other callers. Normal member projection maintenance is unchanged; no heartbeat row, audit event, new Session authority or provider contract is introduced.

The monitor allows one request at a time, coalesces events with a one-second minimum spacing, bounds reads to ten seconds, pauses scheduled reads while hidden, and aborts/ignores stale reads when its authenticated lifecycle ends. A protected API authority denial requests a fresh snapshot, fences an older in-flight result, and never retries the failed business mutation. Missing or malformed snapshots and network/503 failures keep existing UI state and show one Chinese outage reminder until a successful check; they do not become an empty grant list or a logout.

`OperationalApp` derives navigation and render gates directly from that session snapshot. Confirmed loss of the active module unmounts it immediately, cancels pending dirty navigation, replaces the route with the always-available account page, and uses the shared feedback Dialog to identify the module and discarded unsaved content. Losing an unrelated module only removes its navigation entry. Losing a required administrative role exits Settings/Audit/Backup in the same way. Confirmed invalid/disabled Session returns to login with a Chinese explanation; no client logout write is needed to invalidate an already rejected Session. Each protected server operation continues to enforce current authority independently of the browser's short detection interval.

# CY Web Identity Adapter — Foundation Contract

> Status: current CY Web boundary around the shared Identity authority. This document defines stable semantics and acceptance conditions; implementation progress belongs in root `TODO.md`.

## 1. Purpose

CY Web reuses the shared Workspace / Employee / Credential / Session / OTP / Recovery authority through a provider-neutral adapter.

Business modules consume one CY Web-local identity contract. They must not depend on CYInvoice-specific endpoint names, credential code, cookies/tokens or transport details. This allows the shared provider to evolve without rewriting Customer, Item, Sales Work Order, Outsourcing, WorkLog, Settings or other business modules.

This implements the applicable `PROJECT_RULES.md` identity requirements and confirmed Business Decisions.

## 2. Authority split

### Shared Identity owns

- Workspace identity and membership authority.
- Employee identity and stable employee ID.
- Employee number and display name.
- Credential verification.
- Browser/session authority.
- Shared role semantics: `EMPLOYEE`, `ADMIN`, `SUPER_ADMIN`.
- OTP / recovery / shared account lifecycle.

CY Web must not persist password verifiers, recovery secrets, OTPs or a competing shared role hierarchy in its D1.

### CY Web owns

- Local `app_members` projection keyed by the stable shared Identity employee ID.
- CY Web-only app tags and app-tag → module-entry mapping.
- Domain-specific authorization inside each business workflow.
- CY Web Audit events for protected CY Web operations.

CY Web app tags are not shared global roles.

## 3. Normalized principal contract

Protected CY Web APIs resolve the current request through one adapter contract and receive a normalized principal:

```ts
interface IdentityPrincipal {
  employeeId: string;
  employeeNo: string | null;
  displayName: string;
  role: "EMPLOYEE" | "ADMIN" | "SUPER_ADMIN";
  workspaceId: string | null;
}
```

Provider-specific response fields and transport details must not escape the adapter implementation.

The adapter must distinguish at least:

- authenticated principal;
- unauthenticated/missing session;
- invalid or revoked authentication;
- shared-provider application access denied;
- identity dependency temporarily unavailable.

## 4. App-member projection

When an authenticated principal is accepted, CY Web resolves its local `app_members` projection by `identity_employee_id`.

- `identity_employee_id` is the stable linkage.
- `employee_no` may be refreshed as display/search metadata.
- credentials are never copied into CY Web.
- shared Admin/Super Admin promotion or demotion is never performed by CY Web.
- an authenticated ordinary employee may exist before any CY Web app tag is assigned; in that case no tagged module entry is granted.

## 5. Authorization layering

Authorization has three layers:

1. Shared Identity establishes who the employee is and the current shared role/workspace context.
2. CY Web app authorization decides module entry.
3. The target domain service enforces operation-specific workflow rules.

Initial module-entry semantics:

- `ADMIN` and `SUPER_ADMIN` retain inherited shared administrative authority; CY Web does not convert them into local roles.
- ordinary `EMPLOYEE` users enter modules granted by their active CY Web app tags.
- app tags may be combined; access is the union of active tag/module mappings.
- hiding a menu/control is never authoritative permission enforcement; protected APIs check authorization server-side.

## 6. Browser-session provider requirements

A successful one-shot password check is not enough for CY Web. The shared provider must support a browser-safe session lifecycle so normal later requests can resolve identity without repeatedly handling credentials.

Required provider semantics:

- recognize CY Web as an application audience/scope;
- authenticate eligible `EMPLOYEE`, `ADMIN` and `SUPER_ADMIN` identities according to shared authority;
- establish an authenticated CY Web browser session after login;
- resolve later protected requests to the current employee/workspace/shared role;
- reject disabled/invalid/revoked identity or session state;
- support logout/session termination and revocation;
- keep credential verifiers, signing secrets and provider-internal secrets out of the browser;
- retain server-side rate/abuse protection for sensitive authentication actions.

The concrete transport may use HttpOnly cookies, signed short-lived tokens, service-to-service session lookup or another reviewed mechanism. CY Web depends on the semantics, not a provider-specific transport shape.

## 7. Provider acceptance gate

The concrete provider adapter is accepted only when a non-production test environment can prove all of the following:

1. CY Web application audience/scope is recognized.
2. `EMPLOYEE`, `ADMIN` and `SUPER_ADMIN` identities can authenticate according to shared authority.
3. A browser session can be established and later resolved server-side without resending credential material on normal requests.
4. Disabled/revoked identity and session behavior is testable.
5. CY Web receives the normalized principal fields without receiving password verifiers, OTP/recovery material or provider secrets.
6. Logout/revocation is testable.
7. Provider-unavailable and access-denied outcomes can be normalized without leaking provider-specific internal messages.

Only after this gate may protected multi-user business API wiring be treated as accepted.

## 8. Error normalization

| CY Web condition | HTTP | Stable error code |
| --- | ---: | --- |
| no authenticated session | 401 | `AUTH_REQUIRED` |
| identity/session invalid or revoked | 401 | `AUTH_INVALID` |
| authenticated but no module permission | 403 | `ACCESS_DENIED` |
| shared-provider application access denied | 403 | `ACCESS_DENIED` |
| identity provider unavailable | 503 | `IDENTITY_UNAVAILABLE` |

Provider-specific internal messages are not forwarded directly to the browser.

## 9. Cross-project ownership boundary

CY Web may reuse shared authority exposed today or later by CYInvoice/CYCloud Identity infrastructure, but it must not copy CYInvoice credential/session internals into this repository.

CYAccountingWeb is a separate application workstream and may have different application-access policy. CY Web requirements must not be inferred by copying CYAccountingWeb role restrictions or endpoint behavior.

Provider-side changes belong to the shared Identity/CYInvoice workstream; CY Web owns only its adapter, app-local authorization and protected business routes.

## 10. Public repository boundary

Public source may contain generic contracts, binding names and placeholders only. Do not commit:

- production Identity endpoint/resource identifiers;
- production Workspace ID;
- real employee data;
- session signing secrets;
- provider tokens;
- password/OTP/recovery secrets.

Production resolution is injected through the approved runtime/deployment boundary.

## 11. Non-goals

- No CY Web password table.
- No duplicate shared role lifecycle.
- No provider-specific auth calls from business modules.
- No CY Web app tags in Shared Identity.
- No credential material in CY Web D1.
- No CYAccountingWeb runtime/source change from this application workstream.

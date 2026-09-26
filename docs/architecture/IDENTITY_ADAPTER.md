# CY Web Identity Adapter — Foundation Contract

> Status: implementation foundation. This document defines the CY Web boundary around the existing shared Identity authority. It does not create a second account system and does not modify CYInvoice Cloud runtime from this repository.

## 1. Purpose

CY Web reuses the existing shared Workspace / Employee / Credential / Session / OTP / Recovery authority through an adapter boundary.

CY Web business modules must not call CYInvoice-specific identity endpoints directly. They consume one CY Web-local identity contract so the provider can later move from the current CYInvoice Cloud implementation to CYCloud Identity without rewriting Customer, Order, Item, Outsourcing, WorkLog, Settings or other modules.

This implements `PROJECT_RULES.md` section 7 and BD-037.

## 2. Authority split

### Shared Identity owns

- Workspace identity and membership authority.
- Employee identity and stable employee ID.
- Employee number / display name.
- Credential verification.
- Session authority.
- Shared account role semantics: ordinary employee, admin, super admin.
- OTP / recovery / shared account lifecycle.

CY Web must not persist password verifiers, recovery secrets, OTPs or a competing shared role hierarchy in its D1.

### CY Web owns

- Local `app_members` projection keyed by the stable shared Identity employee ID.
- CY Web-only app tags such as sales / staff / warehouse / designer.
- App-tag to module-entry mapping.
- Domain-specific authorization rules inside each business workflow.
- CY Web audit events for protected CY Web operations.

## 3. Request identity contract

Protected CY Web APIs resolve a request through one adapter contract and receive a normalized principal:

```ts
interface IdentityPrincipal {
  employeeId: string;
  employeeNo: string | null;
  displayName: string;
  role: "EMPLOYEE" | "ADMIN" | "SUPER_ADMIN";
  workspaceId: string | null;
}
```

Provider-specific response fields, cookies, tokens and endpoint names must not escape the adapter implementation.

The adapter result is one of:

- authenticated principal;
- unauthenticated request;
- identity dependency temporarily unavailable.

Business modules should translate these states through the common API error contract rather than inspecting provider-specific error strings.

## 4. App-member projection

When an authenticated principal is accepted, CY Web resolves the local `app_members` row by `identity_employee_id`.

The local row is a projection/reference only, not an account authority.

- `identity_employee_id` is immutable identity linkage.
- `employee_no` may be refreshed as display/search metadata.
- credentials are never copied into CY Web.
- shared admin/super-admin promotion or demotion is never performed by CY Web.

An authenticated shared employee can exist before any CY Web app tag is assigned. For an ordinary employee this means the account is known but no tagged module entry is granted yet.

## 5. Authorization layering

Authorization has three layers:

1. Shared Identity confirms who the employee is and the current shared role.
2. CY Web app authorization decides module entry.
3. The target domain service enforces operation-specific workflow rules.

Initial module-entry rule from BD-037:

- `ADMIN` and `SUPER_ADMIN` use the inherited shared administrative authority and are not converted into CY Web-local roles.
- ordinary `EMPLOYEE` users enter only modules granted by their active CY Web app tags.
- app tags can be combined; access is the union of active tag/module mappings.
- hiding a menu is never the authoritative permission check; protected APIs enforce access server-side.

## 6. Session and browser boundary

CY Web is a browser application, so the provider integration must expose a browser-safe authenticated-session contract.

The CY Web repository must not implement a parallel password database merely to bridge a temporary provider limitation.

The current CYInvoice Cloud implementation is useful identity authority evidence, but the currently inspected `web-auth` path is not yet a complete CY Web provider contract: it currently declares an application policy for CYAccountingWeb and returns a one-shot authenticated employee result rather than a CY Web session contract.

Therefore:

- CY Web may implement the adapter interface and app-local authorization now;
- production login/session wiring remains blocked until the shared Identity provider exposes the required CY Web-compatible application/session contract;
- that provider change belongs to the Identity/CYInvoice workstream, not to CY Web business-module code;
- CY Web must not modify CYInvoice source/runtime from this branch.

## 7. Error normalization

The adapter normalizes provider outcomes into stable CY Web errors:

| CY Web condition | HTTP | Stable error code |
| --- | ---: | --- |
| no authenticated session | 401 | `AUTH_REQUIRED` |
| authenticated identity disabled/rejected by provider | 401 | `AUTH_INVALID` |
| authenticated but no module permission | 403 | `ACCESS_DENIED` |
| identity provider unavailable | 503 | `IDENTITY_UNAVAILABLE` |

Provider-specific internal messages must not be forwarded directly to the browser.

## 8. No production identifiers in Public source

Public source may contain only generic binding / adapter / endpoint contract names and placeholders.

Do not commit:

- production Identity endpoint;
- production Workspace ID;
- employee identifiers or real employee data;
- session signing secrets;
- provider tokens;
- OTP/recovery secrets.

Production resolution is injected through the approved runtime/deployment boundary.

## 9. Implementation sequence

1. Add provider-neutral Identity types and adapter result types.
2. Add local `app_members` projection and module-access service using the existing D1 schema.
3. Add `requireIdentity` / `requireModuleAccess` guards for future protected API routes.
4. Keep `/api/health` unauthenticated and non-sensitive.
5. When the shared Identity provider exposes the CY Web browser-session contract, add the concrete provider adapter without changing business modules.
6. Implement the first authenticated business API slice only after the adapter is wired and tested.

## 10. Non-goals for this phase

- No new CY Web password table.
- No copy of CYInvoice credential-verification code.
- No duplicated SUPER_ADMIN / ADMIN lifecycle.
- No CYAccountingWeb identity changes.
- No production login UI yet.
- No production Identity deployment from this branch.

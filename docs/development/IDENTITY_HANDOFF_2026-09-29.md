# CY Web Shared Identity handoff — 2026-09-29

> **Non-canonical AI continuity note.** Read `TODO.md`, `PROJECT_RULES.md`, `docs/architecture/IDENTITY_ADAPTER.md` and applicable contracts first. This file must not override governance, architecture or later Business Decisions.
>
> This public file intentionally omits real Workspace IDs, Employee data, Email addresses, Cloudflare resource IDs, service-binding targets and secrets.

## Baseline

- Repository: `simonliu1118-byte/chihyuan-web`
- Current version: `0.1.51`
- Shared Identity management PR: `#55`
- Super Admin disable-action UI correction: PR `#56`, no extra version bump
- Invalid-provider-session live gate: merged in PR `#58`
- Manual Development Deploy run `#20`: successful, including deployed invalid-provider-session acceptance
- Employee lifecycle + Super Admin UI redesign: PR `#61`, merged; CY Web `0.1.51` awaits the next manual Development Deploy
- Identity provider: CYCloud Identity through the private Worker Service Binding
- CYCloud Identity `0.1.14` pending-Employee delete contract is already deployed in development
- CY Web no longer owns a shared Identity session table or credential authority

## Already accepted in the browser/runtime

Using the first development Workspace Super Admin account:

- login succeeds
- authenticated navigation succeeds
- F5 preserves login via Identity session resolve
- logout revokes the session
- F5 after logout remains logged out
- `帳號與權限` page loads Shared Identity data
- Super-Admin-only sections render for the Super Admin account

Using the deployed CY Web runtime acceptance gate:

- a syntactically supplied but provider-invalid Identity session is rejected through the real CY Web → CYCloud Identity binding
- CY Web returns HTTP `401` with `AUTH_INVALID`
- CY Web clears the `cyweb_identity_session` browser cookie
- no real password, OTP or live Employee session token is used by this acceptance gate

Literal expired-session evidence remains separate and is not yet accepted.

## Current Employee-management decision

User-facing terminology is **超級管理員 (Super Admin)**. Stable provider protocol/storage identifiers such as `isWorkspaceSuperAdmin`, `superAdminEmployeeId` and `super_admin_employee_id` remain unchanged.

CY Web `0.1.51` implements these lifecycle semantics:

- `尚未驗證／待啟用` — newly created Employee, first-time Email verification/password setup incomplete; no enable action is shown
- `啟用` — activation is complete and the Employee is enabled
- `停用` — an already activated Employee is disabled; an enable action may be shown
- pending first-time activation rows expose **刪除**; activated/disabled accounts do not use this delete path
- the provider allows deletion only while first-time activation is still pending and rejects deletion after activation or for the current Super Admin

Super Admin transfer is no longer a standalone management block. The current Super Admin Employee row owns the **移交** action. The action is disabled when no eligible activated/Email-verified target exists; otherwise it opens a modal that performs target selection, current-password re-authentication and Email OTP confirmation. Transfer completion still changes Recovery Email and revokes the previous Super Admin sessions.

## Current UI surface

Self-service:

- change password
- change Email via OTP
- forgot password from login page
- activate account from login page

Super-Admin-only Workspace management:

- Employee creation/status management and pending-account deletion
- Super Admin transfer from the Employee table
- Identity Groups and memberships
- Group Application Access
- direct Employee Application Access
- per-Application `USER_ADMIN` compatibility mode
- OTP security policy

## Important authorization boundaries

- `isWorkspaceSuperAdmin` remains the protected authority signal even though the visible label is Super Admin.
- Ordinary Groups remain extensible and are not replaced by a fixed global ADMIN/USER enum.
- CY Web owns only app-local module authorization/tags.
- Shared Employee/Group/Application/session/OTP authority belongs to CYCloud Identity.
- OTP security settings and Workspace management must not render at all for ordinary Employees.
- Pending Employee delete is provider-authorized; front-end button visibility is not the security boundary.

CYInvoice compatibility-role decision consumed from Identity:

- Super Admin => `SUPER_ADMIN`
- active Admin Group => `ADMIN`
- otherwise active User Group => `USER`
- otherwise direct grant => `USER`
- ordinary Groups can never grant `SUPER_ADMIN`

## Next browser acceptance

1. Manually deploy CY Web `0.1.51` through `CY Web Development Deploy` on `main`.
2. Verify the revised Employee table: pending status, no pending enable button, pending delete action, active/disabled distinction and Super Admin transfer button/modal.
3. Obtain literal expired-session handling evidence through CY Web. Invalid-session handling is already accepted by Development Deploy run `#20` and must not be conflated with expiry.
4. Activate one ordinary development test Employee from the login page using Email OTP and set the first password.
5. Log in as the ordinary Employee and verify only self-service is visible; Workspace management/OTP/Super Admin controls must be absent.
6. Create a controlled test Group and test Group membership + Application access.
7. Verify effective `USER` and `ADMIN` behavior without any Group producing `SUPER_ADMIN`.
8. Test forgot-password end-to-end.
9. Test own Email change end-to-end.
10. Only after a safe second verified Employee exists, test Super Admin transfer; preserve a valid authority path and transfer back if appropriate.

Do not include OTP codes, passwords, secrets or real operational identifiers in chat/screenshots.

## After Identity acceptance

CY Web then resumes the broader application sequence:

- protected Worker business routes with server-side module authorization
- replace temporary `localStorage` business persistence with Worker API → D1
- Desktop/Tablet/Mobile acceptance
- backup/restore acceptance
- production only after explicit approval

## Cross-repository source

The Identity provider implementation and fuller continuation handoff live in the public `CYapps` repository under:

- `apps/CYCloudIdentity/TODO.md`
- `apps/CYCloudIdentity/docs/HANDOFF_2026-09-29.md`
- `apps/CYCloudIdentity/docs/AUTH_CONTRACT.md`
- `apps/CYCloudIdentity/docs/APPLICATION_ROLE_MAPPING.md`
- `apps/CYCloudIdentity/docs/OTP_SECURITY.md`
- `apps/CYCloudIdentity/docs/UI_ACCESS.md`

CYACC-web and CYInvoice are separate Shared Identity consumer integration workstreams. This CY Web conversation coordinates the shared contract/handoff; CYInvoice remains reference-only here and must not be modified from this conversation.

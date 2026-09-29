# CY Web Shared Identity handoff — 2026-09-29

> **Non-canonical AI continuity note.** Read `TODO.md`, `PROJECT_RULES.md`, `docs/architecture/IDENTITY_ADAPTER.md` and applicable contracts first. This file must not override governance, architecture or later Business Decisions.
>
> This public file intentionally omits real Workspace IDs, Employee data, Email addresses, Cloudflare resource IDs, service-binding targets and secrets.

## Baseline

- Repository: `simonliu1118-byte/chihyuan-web`
- Current version: `0.1.50`
- Shared Identity management PR: `#55`
- Highest-authority disable-action UI correction: PR `#56`, no extra version bump
- Invalid-provider-session live gate: merged in PR `#58`
- Manual Development Deploy run `#20`: successful, including deployed invalid-provider-session acceptance
- Identity provider: CYCloud Identity through the private Worker Service Binding
- CY Web no longer owns a shared Identity session table or credential authority

## Already accepted in the browser/runtime

Using the first development Workspace highest-authority account:

- login succeeds
- authenticated navigation succeeds
- F5 preserves login via Identity session resolve
- logout revokes the session
- F5 after logout remains logged out
- `帳號與權限` page loads Shared Identity data
- highest-authority-only sections render for the highest-authority account

Using the deployed CY Web runtime acceptance gate:

- a syntactically supplied but provider-invalid Identity session is rejected through the real CY Web → CYCloud Identity binding
- CY Web returns HTTP `401` with `AUTH_INVALID`
- CY Web clears the `cyweb_identity_session` browser cookie
- no real password, OTP or live Employee session token is used by this acceptance gate

Literal expired-session evidence remains separate and is not yet accepted.

## Current UI surface

Self-service:

- change password
- change Email via OTP
- forgot password from login page
- activate account from login page

Highest-authority-only Workspace management:

- Employee creation/status management
- Identity Groups and memberships
- Group Application Access
- direct Employee Application Access
- per-Application `USER_ADMIN` compatibility mode
- OTP security policy
- current highest-authority summary
- Recovery Email state
- highest-authority transfer

Current highest-authority Employee does not show a normal enable/disable action. CYCloud Identity backend also rejects attempts to disable the current authority before transfer.

## Important authorization boundaries

- `isWorkspaceSuperAdmin` is the protected highest-authority signal.
- Ordinary Groups remain extensible and are not replaced by a fixed global ADMIN/USER enum.
- CY Web owns only app-local module authorization/tags.
- Shared Employee/Group/Application/session/OTP authority belongs to CYCloud Identity.
- OTP security settings and Workspace management must not render at all for ordinary Employees.

CYInvoice compatibility-role decision consumed from Identity:

- highest authority => `SUPER_ADMIN`
- active Admin Group => `ADMIN`
- otherwise active User Group => `USER`
- otherwise direct grant => `USER`
- ordinary Groups can never grant `SUPER_ADMIN`

## Next browser acceptance

1. Obtain literal expired-session handling evidence through CY Web. Invalid-session handling is already accepted by Development Deploy run `#20` and must not be conflated with expiry.
2. Create one ordinary development test Employee from `帳號與權限`.
3. Activate that Employee from the login page using Email OTP and set the first password.
4. Log in as the ordinary Employee and verify only self-service is visible; Workspace management/OTP/highest-authority sections must be absent.
5. Create a controlled test Group and test Group membership + Application access.
6. Verify effective `USER` and `ADMIN` behavior without any Group producing `SUPER_ADMIN`.
7. Test forgot-password end-to-end.
8. Test own Email change end-to-end.
9. Only after a safe second verified Employee exists, test highest-authority transfer; preserve a valid authority path and transfer back if appropriate.

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

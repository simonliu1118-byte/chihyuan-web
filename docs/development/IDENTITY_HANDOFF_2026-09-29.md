# CY Web Shared Identity handoff — 2026-09-29

> **Non-canonical AI continuity note.** Read `TODO.md`, `PROJECT_RULES.md`, `docs/architecture/IDENTITY_ADAPTER.md` and applicable CYCloud Identity contracts first. This file must not override governance, architecture or later Business Decisions.
>
> This public file intentionally omits real Workspace IDs, Employee data, Email addresses, Cloudflare resource IDs, service-binding targets and secrets.

## Baseline

- Repository: `simonliu1118-byte/chihyuan-web`
- Current source version: `0.1.51`.
- Initial Shared Identity management work is merged, but the role/access product model was changed before the `0.1.51` management UI was fully browser-accepted.
- CYCloud Identity `0.1.14` remains the deployed provider baseline and still uses the legacy Identity Group / compatibility-role implementation.
- The approved replacement provider contract is `CYapps/apps/CYCloudIdentity/docs/ROLE_AND_ACCESS_MODEL.md`.
- CY Web uses CYCloud Identity through the private Worker Service Binding and does not own duplicate credentials/sessions.
- Invalid provider-session rejection through CY Web is already accepted; literal expired-session evidence remains outstanding.

## Finalized shared role model

CYID Workspace roles are exactly:

```text
SUPER_ADMIN
ADMIN
USER
```

CY Web consumes those roles directly. Do not create another CY Web-specific Super Admin/Admin/User mapping.

`Identity Admin` is a special capability attached to ADMIN, not a fourth role.

### Super Admin

- unique protected Workspace final authority;
- automatic access to all enabled CY Apps;
- automatic access to all CY Web modules;
- grants/revokes Identity Admin capability;
- owns protected Super Admin transfer and Workspace Recovery/security-core operations.

### Admin

- normal business administrator;
- can manage ordinary USER lifecycle through Shared Identity;
- cannot configure any App Access or CY Web Module Access.

### Identity Admin

- ADMIN + Identity-management capability;
- can create USER or ADMIN;
- can perform USER <-> ADMIN;
- can manage App Access for USER / ADMIN / other Identity Admin accounts except itself;
- can manage CY Web Module Access for USER / ADMIN / other Identity Admin accounts except itself;
- can force Email recovery for activated Employees;
- cannot grant/revoke Identity Admin, demote another Identity Admin, self-expand Access or touch Super Admin protected state.

### User

- normal Employee role;
- detailed business permissions remain App-local.

Future HR note is intentionally deferred: if a non-ADMIN HR role later needs limited Identity lifecycle authority, introduce narrower capabilities then rather than adding a fourth Workspace role now.

## CY Web core entry + module exception

CY Web is the core account-management App.

Every valid Employee must retain CY Web entry access even when no business module is granted:

```text
CYWEB entry = TRUE (locked)
```

This guarantees password / Email / account self-service.

CY Web itself owns business Module Access, for example Customer / Order / Item / Outsourcing / WorkLog.

Rules:

- Super Admin -> all modules automatically allowed;
- Identity Admin / Super Admin -> may configure eligible Employee Module Access;
- normal Admin -> no Access configuration controls;
- Admin with a module -> full administration authority inside that module;
- Identity Admin cannot change its own Module Access;
- role changes preserve existing Module Access;
- protected APIs enforce Module Access server-side on subsequent requests.

## Employee creation / activation

Role is selected at creation:

- normal Admin -> USER only;
- Identity Admin / Super Admin -> USER or ADMIN;
- Identity Admin capability itself is never assigned during create.

Target activation flow:

1. create pending Employee;
2. automatically send first activation email;
3. email contains a direct link opening CY Web activation UI;
4. link is navigation only, not an authentication credential;
5. Employee completes Email verification/OTP + first-password setup;
6. account becomes enabled.

Pending UI must expose:

```text
編輯 | 重寄啟用信 | 刪除
```

If delivery fails, keep the pending Employee and expose resend; do not roll back the account.

Current provider fact: `0.1.14` create-Employee does **not** send an email. Activation mail/OTP is currently sent only when the Employee explicitly starts activation, so a newly created Employee showing no Brevo event is expected under current code.

## Employee lifecycle

States remain distinct:

- 尚未驗證／待啟用;
- 啟用;
- 停用;
- 啟用 · Email 待驗證 after authorized forced Email recovery.

Only never-activated Employees may be physically deleted. Activated Employees are retained for history/Audit and may only be disabled/re-enabled.

## Forced Email recovery

Identity Admin / Super Admin may replace an activated Employee's unusable Email.

After recovery change:

- account remains activated;
- password remains unchanged;
- new Email is unverified;
- existing sessions are revoked;
- verification can be resent;
- the account does not revert to first-time pending activation.

Normal Admin cannot perform this action.

## Current implementation mismatch

Current CY Web `0.1.51` management source still contains the earlier UI assumptions:

- Super-Admin-only Workspace management;
- Identity Group/membership UI;
- Group/direct Application Access UI;
- `USER_ADMIN` compatibility mode.

Those are now legacy implementation details. Do not extend them. The next implementation must follow the provider role migration and then replace this UI with USER / ADMIN / Identity Admin / Super Admin-aware management surfaces.

## Next sequence

1. Coordinate CYCloud Identity schema/runtime migration to direct Workspace Role + Identity Admin capability.
2. Update CY Web principal adapter to consume target role + `isIdentityAdmin`.
3. Replace legacy Group-based management UI.
4. Implement CY Web-local Module Access persistence and server-side enforcement.
5. Implement role-aware Employee-management visibility/actions.
6. Surface create-time Role selection according to actor authority.
7. Surface provider activation-email send state, pending edit/resend/delete and direct-link activation flow.
8. Surface forced activated-account Email recovery for Identity Admin / Super Admin.
9. Browser-accept USER / ADMIN / Identity Admin / Super Admin boundaries and anti-self-escalation.
10. Browser-accept Module Access changes and Admin full-module authority.
11. Accept activation email/resend through the configured provider.
12. Accept provider role/App Access session invalidation and literal expired-session behavior.
13. After Shared Identity is stable, continue Worker business routes -> D1 business persistence -> device/RWD acceptance -> backup/restore -> production approval.

## Cross-project boundary

- CYInvoice remains reference-only here and must not be modified from this conversation/workstream.
- CY Accounting Web is a separate integration workstream.
- Both should eventually consume the same direct CYID three-role contract after the provider contract is stable.

## Do not do

- Do not add a fourth role for Identity Admin.
- Do not implement future HR capabilities yet.
- Do not continue expanding Identity Group role semantics.
- Do not allow normal Admin to manage App or Module Access.
- Do not allow Identity Admin to change its own Access or Super Admin protected state.
- Do not make activation links into bearer login tokens.
- Do not physically delete activated Employees.
- Do not commit real operational IDs, Emails, access matrices, secrets or session material.
- Do not deploy production without explicit user approval.

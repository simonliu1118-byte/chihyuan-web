# CY Web Shared Identity handoff — 2026-09-29

> **Non-canonical AI continuity note.** Read `TODO.md`, `PROJECT_RULES.md`, `docs/architecture/IDENTITY_ADAPTER.md` and applicable CYCloud Identity contracts first. This file must not override governance, architecture or later Business Decisions.
>
> This public file intentionally omits real Workspace IDs, Employee data, Email addresses, Cloudflare resource IDs, service-binding targets and secrets.

## Baseline

### CYCloud Identity

- Approved role/access contract: `CYapps/apps/CYCloudIdentity/docs/ROLE_AND_ACCESS_MODEL.md`.
- CYID `0.2.0` runtime source was merged to CYapps `main` in PR `#204`.
- Development deployment of `0.2.0` is still pending; do not describe the live development provider as 0.2.0 until the governed deployment succeeds.
- The 0.2.0 migration adds direct Workspace roles, Identity Admin capability, durable `activated_at`, direct Employee App Access authority, create-time activation Email/resend, pending edit/delete protection and activated-account forced Email recovery.
- Deployment requires private development Environment values for the core CY Web application identifier and CY Web account-portal URL. Never paste those values into public source or chat.

### CY Web

- CY Web `0.2.0` consumer migration is in PR `#64`, branch `identity/cyid-0.2-consumer`, until CI/merge is complete.
- The consumer now expects `workspaceRole / isIdentityAdmin / emailVerified` from CYID 0.2.
- CY Web uses CYCloud Identity through the private Worker Service Binding and does not own duplicate credentials/sessions.
- CY Web shell entry is no longer controlled by local `app_members.is_active`; every valid CYID Employee must reach account self-service.
- Invalid-provider-session rejection through CY Web was already accepted on the previous generation; literal expired-session evidence remains outstanding.

## Finalized shared role model

CYID Workspace roles are exactly:

```text
SUPER_ADMIN
ADMIN
USER
```

CY Web consumes those roles directly. `Identity Admin` is an ADMIN capability, not a fourth role.

### Super Admin

- unique protected Workspace final authority;
- automatic access to all enabled CY Apps;
- automatic access to all CY Web modules;
- grants/revokes Identity Admin capability;
- owns protected Super Admin transfer and Workspace Recovery/security-core operations.

### Admin

- normal business administrator;
- can manage ordinary USER lifecycle through Shared Identity;
- cannot configure App Access or CY Web Module Access.

### Identity Admin

- ADMIN + Identity-management capability;
- can create USER or ADMIN;
- can perform USER <-> ADMIN for eligible Employees;
- can manage App Access for USER / ADMIN / other Identity Admin accounts except itself;
- can manage CY Web Module Access for USER / ADMIN / other Identity Admin accounts except itself;
- can force Email recovery for activated Employees;
- cannot grant/revoke Identity Admin, demote another Identity Admin, self-expand Access or touch Super Admin protected state.

### User

- normal Employee role;
- detailed business permissions remain App-local.

Future HR note remains deferred: if a non-ADMIN HR role later needs limited Identity lifecycle authority, introduce narrower capabilities then rather than adding a fourth Workspace role now.

## CY Web core entry + module exception

CY Web is the core account-management App:

```text
CYWEB entry = TRUE (locked)
```

Every valid Employee retains CY Web shell access even with zero business modules so password / Email / account self-service remains available.

CY Web owns business Module Access (Customer / Order / Item / Outsourcing / WorkLog / future modules):

- Super Admin -> all modules automatically allowed;
- Identity Admin / Super Admin -> may configure eligible Employee Module Access;
- normal Admin -> no Access configuration controls;
- Admin with a module -> full administration authority inside that module;
- Identity Admin cannot change its own Module Access;
- role changes preserve existing Module Access;
- protected APIs enforce Module Access server-side.

The current 0.2 consumer migration preserves existing CY Web-local tag/module projection for non-Super-Admin module checks. Detailed Module Access management UI/server APIs are a subsequent CY Web-local step and must not be moved into CYID.

## Employee creation / activation

Role is selected at creation:

- normal Admin -> USER only;
- Identity Admin / Super Admin -> USER or ADMIN;
- Identity Admin capability itself is never assigned during create.

CYID 0.2 source activation flow:

1. create pending Employee;
2. automatically attempt first activation Email;
3. Email contains a direct CY Web link plus OTP;
4. link is navigation only, not an authentication credential;
5. CY Web opens `?activate=1&employeeNo=####` in activation mode;
6. CY Web asks CYID for the existing active challenge so clicking the first Email does not force a second send/cooldown collision;
7. Employee enters the Email OTP and sets the first password;
8. account becomes enabled.

Pending UI exposes:

```text
編輯 | 重寄啟用信 | 刪除
```

If delivery fails, the pending Employee remains and the administrator can resend.

## Employee lifecycle / Email recovery

Distinct states:

- 尚未驗證／待啟用 -> `activated_at` absent;
- 啟用;
- 停用;
- 啟用 · Email 待驗證 -> activated account after forced Email replacement.

Only never-activated Employees may be physically deleted.

Identity Admin / Super Admin may replace an activated non-Super-Admin Employee's unusable Email. The password and activated state remain; the new Email becomes unverified and existing sessions are revoked. Re-verification can be resent. Normal Admin cannot perform this action.

## CY Web 0.2 source changes in PR #64

- principal adapter validates `workspaceRole`, `isIdentityAdmin`, `emailVerified`, and Super Admin consistency;
- browser session exposes the new authority fields;
- CY Web shell entry is Identity-authoritative rather than local-member-authoritative;
- Super Admin module access is protected from stale local inactive state;
- Identity management proxy includes 0.2 lifecycle/Identity Admin/direct App Access/Email recovery endpoints;
- Group/compatibility-role controls are removed from the forward management UI;
- management UI is role-aware for USER / ADMIN / Identity Admin / Super Admin;
- create-time Role selection and activation-delivery status are surfaced;
- pending edit/resend/delete and forced Email recovery/re-verification are surfaced;
- CY Web core App Access is rendered locked;
- activation Email deep link opens the OTP + first-password flow;
- version advances to `0.2.0`.

## Deployment ordering

Do not reverse this order:

1. finish/merge CY Web PR `#64` source validation;
2. privately configure required CYID development Environment variables in GitHub;
3. deploy CYID `0.2.0` development and verify migration/Worker health;
4. verify existing Super Admin can authenticate through the provider;
5. manually deploy CY Web `0.2.0` from `main`;
6. perform multi-role/lifecycle browser acceptance.

CY Web 0.2 must not be deployed against the old provider generation because its principal validator intentionally requires the new role fields.

## Acceptance sequence after deployment

1. existing Super Admin login/F5/logout under CYID 0.2;
2. new Account & Permissions UI with no forward Group-role management;
3. create controlled USER -> verify first Email is actually emitted by provider and appears in Email-provider event history;
4. click activation Email link -> activation form opens directly;
5. OTP + first password -> account activates;
6. USER login -> self-service only;
7. normal ADMIN -> USER lifecycle but no Access management;
8. Identity Admin -> eligible role/App Access/Email recovery actions, no self-escalation;
9. CY Web core access remains locked;
10. forced Email recovery -> `啟用 · Email 待驗證` -> re-verification;
11. role/App Access session invalidation;
12. literal expired-session evidence;
13. controlled Super Admin transfer only after a safe second verified Employee exists.

Do not send passwords, OTP codes, real Email addresses, Workspace/Application IDs or operational URLs in chat/screenshots.

## Cross-project boundary

- **CYInvoice** remains reference-only here and must not be modified from this conversation/workstream.
- **CYAccountingWeb (CYACC-web)** is a separate integration workstream.
- Both should consume the same direct CYID three-role contract in their own implementation workstreams after the provider contract is accepted.

## Do not do

- Do not add a fourth role for Identity Admin.
- Do not implement future HR capabilities yet.
- Do not expand Identity Group role semantics.
- Do not allow normal Admin to manage App or Module Access.
- Do not allow Identity Admin to change its own Access or Super Admin protected state.
- Do not make activation links bearer login tokens.
- Do not physically delete activated Employees.
- Do not commit real operational IDs, Emails, access matrices, secrets or session material.
- Do not deploy production without explicit user approval.

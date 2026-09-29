# CY Web TODO

> 本文件只記錄 **current implementation status 與下一步**；不是永久規則來源，也不重複保存 Business Decision、module contract 或 architecture semantics。

## Current checkpoint — 2026-09-29

- Formal baseline remains `main`; CY Web `0.2.0` consumer migration is in PR `#64` on `identity/cyid-0.2-consumer` until CI/merge completes.
- CYCloud Identity `0.2.0` source is merged to CYapps `main` (PR `#204`) but is **not yet development-deployed**. The currently live development Identity runtime must be treated as the previous generation until the governed 0.2.0 deploy succeeds.
- CYID 0.2.0 replaces Group-derived authorization with direct Workspace roles `SUPER_ADMIN / ADMIN / USER`, ADMIN-only `Identity Admin` capability, direct Employee App Access, durable activation state, create-time activation Email, pending resend/edit/delete, and activated-account forced Email recovery.
- CY Web `0.2.0` consumer source now normalizes `workspaceRole / isIdentityAdmin / emailVerified` and keeps legacy `groupKeys` descriptive only.
- CY Web shell entry is Identity-authoritative and mandatory for every valid Employee. Local `app_members.is_active` is no longer allowed to block the account-management shell; it remains a CY Web-local module projection only.
- Super Admin module access is protected and automatic. CY Web Module Access remains CY Web-owned; Identity Admin / Super Admin will manage eligible accounts, normal ADMIN has no Access-management authority, and ADMIN with a granted module has full administration authority in that module.
- Shared Identity management UI has been migrated away from the forward Group/`USER_ADMIN` surface: role-aware Employee lifecycle, direct App Access, Identity Admin controls, forced Email recovery, and Super-Admin-only security controls are now represented.
- Pending lifecycle uses durable first activation (`activated_at`) rather than `email_verified_at`; an activated Employee whose Email is replaced remains `啟用 · Email 待驗證`, not first-time pending.
- Employee creation now expects create-time Role selection and reports whether the first activation Email was sent. Pending actions are edit / resend / delete.
- Activation Email deep links use `?activate=1&employeeNo=####` to open CY Web directly in the activation flow. CY Web asks CYID for the existing active challenge; the URL itself is not an authentication credential and OTP + first password remain mandatory.
- Existing browser acceptance from the previous generation remains valid for basic Super Admin login/F5/logout and invalid-session rejection. Literal expired-session evidence remains outstanding and 0.2 role/lifecycle behavior still requires fresh browser acceptance after coordinated deployment.
- CYID 0.2.0 development deployment now requires two deployment-only Environment variables for the locked CY Web core application ID and CY Web account-portal URL. Values must remain private operational configuration and must not be committed or pasted into chat.
- CYInvoice remains unchanged/reference-only in this workstream. CYAccountingWeb (CYACC-web) and CYInvoice integrations occur in their own workstreams after the shared contract is accepted.
- Production D1/Worker/DNS/custom domain, backup rollout and SMART ERP remain untouched.

## Active next sequence

1. [x] Cut initial CY Web login/session/logout to CYCloud Identity and accept the first Super Admin session path.
2. [x] Finalize the replacement three-role / Identity Admin / App Access / CY Web core+module model.
3. [x] Implement CYCloud Identity `0.2.0` direct-role runtime in source and merge it to CYapps `main`.
4. [x] Implement CY Web `0.2.0` principal adapter, role-aware management UI, lifecycle controls, direct App Access and activation deep link in PR `#64`.
5. [ ] Finish PR `#64` CI, merge CY Web `0.2.0` consumer source to `main`.
6. [ ] Configure the two required CYID development Environment variables privately in GitHub, then deploy CYID `0.2.0` development through the governed deploy branch.
7. [ ] Verify migration `0005`, Worker deployment and existing Super Admin login/session survival after CYID `0.2.0` development deployment.
8. [ ] Manually deploy CY Web `0.2.0` from `main` only after CYID `0.2.0` development is live.
9. [ ] Browser-accept the new Account & Permissions surface: no forward Group UI; correct Super Admin / Admin / User / Identity Admin visibility.
10. [ ] Create a controlled test Employee and accept first activation Email delivery, Brevo event, direct CY Web activation link, OTP and first-password completion.
11. [ ] Accept pending edit / resend / delete behavior and delivery-failure recovery without deleting the Employee automatically.
12. [ ] Accept ordinary USER login/self-service and prove no Workspace management/Access controls are exposed.
13. [ ] Accept normal ADMIN USER-lifecycle limits and prove no App/Module Access administration.
14. [ ] Accept Identity Admin USER↔ADMIN, App Access, Email recovery and anti-self-escalation boundaries.
15. [ ] Implement/accept CY Web-local Module Access management UI + server-side enforcement for Identity Admin/Super Admin. Do not move module permissions into CYID.
16. [ ] Accept activated-account forced Email recovery and `啟用 · Email 待驗證` re-verification flow.
17. [ ] Accept role/App Access session invalidation and immediate authorization changes.
18. [ ] Obtain literal expired-session evidence through CY Web; invalid-session handling is already accepted separately.
19. [ ] Manually accept self-service forgot-password/own Email change and controlled Super Admin transfer without risking lockout.
20. [ ] Add protected Worker business HTTP routes with server-side module authorization.
21. [ ] Replace temporary `localStorage` business-data persistence with Worker API -> D1 while preserving the React workflow.
22. [ ] Perform Desktop/Tablet/Mobile real-browser acceptance.
23. [ ] Implement and accept backup/restore before production rollout.
24. [ ] Bind/deploy production Worker/D1/custom domain only after explicit production acceptance.

## Current Identity acceptance boundary

Already accepted from the previous generation:

- dedicated CYCloud Identity Worker/D1 in development;
- Email-OTP bootstrap of the first Workspace;
- 8-16 Unicode-character password boundary;
- application-aware login and provider-owned session;
- CY Web HttpOnly Identity cookie boundary;
- same-origin login/me/logout browser contract;
- F5 resolve, logout revocation and post-logout rejection;
- deployed rejection of provider-invalid session with `401 AUTH_INVALID` + cookie clearing;
- provider protection against directly disabling/deleting current Super Admin;
- Public-source secret/operational-ID boundaries.

Implemented in source but still requiring coordinated development deployment/browser acceptance:

- direct Workspace-role principal (`SUPER_ADMIN / ADMIN / USER`);
- Identity Admin capability and its management boundaries;
- locked CY Web core shell entry for all valid Employees;
- direct App Access without Group-derived role authority;
- role-aware Employee create/update lifecycle;
- automatic first activation Email + direct CY Web link + resend/failure state;
- durable first-activation state and pending-only physical delete;
- activated-account forced Email recovery and re-verification;
- role/App Access session invalidation;
- CY Web 0.2 consumer UI/adapters;
- literal expired-session evidence remains separate.

## Topic source map

- Architecture index: `docs/architecture/README.md`
- Business Decisions: `docs/architecture/decisions/README.md`
- Data model: `docs/architecture/CANONICAL_DATA_MODEL.md`
- Physical dictionary: `docs/architecture/FINAL_DATA_DICTIONARY.md`
- D1 schema gate/freeze: `docs/architecture/D1_SCHEMA_REVIEW.md`
- Operational local runtime: `docs/architecture/OPERATIONAL_LOCAL_RUNTIME.md`
- API contract: `docs/architecture/API_CONTRACT.md`
- Shared Identity boundary: `docs/architecture/IDENTITY_ADAPTER.md`
- CYCloud Identity deployment: `docs/development/IDENTITY_DEPLOYMENT.md`
- Backup/recovery: `docs/architecture/BACKUP_ARCHITECTURE.md`
- Domain namespace/rollout: `docs/DOMAIN_STRATEGY.md`
- AI continuity handoff only: `docs/development/IDENTITY_HANDOFF_2026-09-29.md`

Historical preview/audit/readiness/review documents under `docs/architecture/archive/` are evidence only. Handoff notes are also non-canonical and must not override current rules/contracts or later Business Decisions.

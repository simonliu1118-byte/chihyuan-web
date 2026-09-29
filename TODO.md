# CY Web TODO

> 本文件只記錄 **current implementation status 與下一步**；不是永久規則來源，也不重複保存 Business Decision、module contract 或 architecture semantics。

## Current checkpoint — 2026-09-29

- Formal baseline remains `main`; CY Web `0.2.0` consumer migration is merged and development-deployed.
- CYCloud Identity `0.2.0` is merged and development-deployed. Remote D1 migration, Worker deploy and Identity configuration completed successfully.
- CYID 0.2.0 replaces Group-derived authorization with direct Workspace roles `SUPER_ADMIN / ADMIN / USER`, ADMIN-only `Identity Admin` capability, direct Employee App Access, durable activation state, create-time activation Email, pending resend/edit/delete, and activated-account forced Email recovery.
- CY Web `0.2.0` normalizes `workspaceRole / isIdentityAdmin / emailVerified` and keeps legacy `groupKeys` descriptive only.
- CY Web shell entry is Identity-authoritative and mandatory for every valid Employee. Local `app_members.is_active` is no longer allowed to block the account-management shell; it remains a CY Web-local module projection only.
- Super Admin module access is protected and automatic. CY Web Module Access remains CY Web-owned; Identity Admin / Super Admin will manage eligible accounts, normal ADMIN has no Access-management authority, and ADMIN with a granted module has full administration authority in that module.
- Shared Identity management UI has been migrated away from the forward Group/`USER_ADMIN` surface: permission-aware Employee lifecycle, direct App Access, Identity Admin controls, forced Email recovery, and Super-Admin-only security controls are represented.
- Pending lifecycle uses durable first activation (`activated_at`) rather than `email_verified_at`; an activated Employee whose Email is replaced remains `啟用 · Email 待驗證`, not first-time pending.
- Employee creation expects create-time permission selection and reports whether the first activation Email was sent. Pending actions are edit / resend / delete.
- Activation Email deep links use `?activate=1&employeeNo=####` to open CY Web directly in the activation flow. CY Web asks CYID for the existing active challenge; the URL itself is not an authentication credential and OTP + first password remain mandatory.
- CY Web `0.2.0` manual development deployment passed D1 migration, Worker/assets deployment and invalid-provider-session acceptance.
- CYInvoice remains unchanged/reference-only in this workstream. CYAccountingWeb (CYACC-web) and CYInvoice integrations occur in their own workstreams after the shared contract is accepted.
- Production D1/Worker/DNS/custom domain, backup rollout and SMART ERP remain untouched.

## Deferred UI/UX direction — optimistic interaction

- Product direction: CY Web should use **optimistic UI wherever appropriate**. User actions should normally reflect immediately in the interface while persistence/synchronization runs in the background; backend failure should roll back the local state and surface an actionable error.
- This is a deferred UI/UX refinement, **not part of the current Identity acceptance patch**.
- Do not apply optimistic behavior mechanically to every mutation. Before implementing the following classes, surface the trade-off for explicit product confirmation: destructive/irreversible deletion, Employee disable/role/Identity-Admin mutations, Super Admin transfer, forced Email/password/security operations, financial/inventory/invoice/formal-document mutations, and edits with material revision/concurrency conflicts.
- For operations that are not suitable for full optimistic success, prefer responsive local feedback (immediate pressed/selected state, inline pending indicator, background request) without falsely representing server acceptance.

## Active next sequence

1. [x] Cut initial CY Web login/session/logout to CYCloud Identity and accept the first Super Admin session path.
2. [x] Finalize the replacement three-role / Identity Admin / App Access / CY Web core+module model.
3. [x] Implement CYCloud Identity `0.2.0` direct-role runtime in source and merge it to CYapps `main`.
4. [x] Implement CY Web `0.2.0` principal adapter, permission-aware management UI, lifecycle controls, direct App Access and activation deep link.
5. [x] Merge CY Web `0.2.0` consumer source to `main`.
6. [x] Configure required CYID development Environment variables privately and deploy CYID `0.2.0` development through the governed deploy branch.
7. [x] Verify CYID migration, Worker deployment and existing validation after `0.2.0` development deployment.
8. [x] Manually deploy CY Web `0.2.0` after CYID `0.2.0` became live in development.
9. [ ] Browser-accept the revised Account & Permissions surface and current acceptance UI fixes.
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
22. [ ] Perform dedicated UI/UX refinement, including explicit per-mutation optimistic-UI review under the direction recorded above.
23. [ ] Perform Desktop/Tablet/Mobile real-browser acceptance.
24. [ ] Implement and accept backup/restore before production rollout.
25. [ ] Bind/deploy production Worker/D1/custom domain only after explicit production acceptance.

## Current Identity acceptance boundary

Already accepted:

- dedicated CYCloud Identity Worker/D1 in development;
- Email-OTP bootstrap of the first Workspace;
- 8-16 Unicode-character password boundary;
- application-aware login and provider-owned session;
- CY Web HttpOnly Identity cookie boundary;
- same-origin login/me/logout browser contract;
- F5 resolve, logout revocation and post-logout rejection;
- deployed rejection of provider-invalid session with `401 AUTH_INVALID` + cookie clearing;
- provider protection against directly disabling/deleting current Super Admin;
- Public-source secret/operational-ID boundaries;
- CYID `0.2.0` development migration and Worker deployment;
- CY Web `0.2.0` development deployment and invalid-provider-session acceptance.

Implemented/deployed but still requiring browser acceptance:

- direct Workspace-role principal (`SUPER_ADMIN / ADMIN / USER`);
- Identity Admin capability and its management boundaries;
- locked CY Web core shell entry for all valid Employees;
- direct App Access without Group-derived role authority;
- permission-aware Employee create/update lifecycle;
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

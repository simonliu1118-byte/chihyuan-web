# CY Web TODO

> 本文件只記錄 **current implementation status 與下一步**；不是永久規則來源，也不重複保存 Business Decision、module contract 或 architecture semantics。

## Current checkpoint — 2026-09-29

- Formal baseline remains `main`; current CY Web line is `0.2.4` once the canonical-hostname rollout merges and deploys.
- CYCloud Identity `0.2.1` is merged and development-deployed. `0006` repaired the first-activation Email-verification race introduced by the former credential trigger; verified activation state is again durable and consistent.
- CYID 0.2 replaces Group-derived authorization with direct Workspace roles `SUPER_ADMIN / ADMIN / USER`, ADMIN-only `Identity Admin` capability, direct Employee App Access, durable activation state, create-time activation Email, pending resend/edit/delete, and activated-account forced Email recovery.
- CY Web normalizes `workspaceRole / isIdentityAdmin / emailVerified` and keeps legacy `groupKeys` descriptive only.
- CY Web shell entry is Identity-authoritative and mandatory for every valid Employee. Local `app_members.is_active` is no longer allowed to block the account-management shell; it remains a CY Web-local module projection only.
- Super Admin module access is protected and automatic. CY Web Module Access remains CY Web-owned; Identity Admin / Super Admin will manage eligible accounts, normal ADMIN has no Access-management authority, and ADMIN with a granted module has full administration authority in that module.
- Shared Identity management UI has been migrated away from the forward Group/`USER_ADMIN` surface: permission-aware Employee lifecycle, direct App Access, Identity Admin controls, forced Email recovery, and Super-Admin-only security controls are represented.
- Pending lifecycle uses durable first activation (`activated_at`) rather than `email_verified_at`; an activated Employee whose Email is replaced remains `啟用 · Email 待驗證`, not first-time pending.
- User-account UI uses 使用者 terminology, Chinese permission labels, compact account controls and Email verification pills. Email verified/unverified state is now shown inline beside the Email address.
- Employee creation expects create-time permission selection and reports whether the first activation Email was sent. Pending actions are edit / resend / delete.
- Activation Email deep links use `?activate=1&employeeNo=####` to open CY Web directly in the activation flow. CY Web asks CYID for the existing active challenge; the URL itself is not an authentication credential and OTP + first password remain mandatory.
- `https://admin.chihyuancm.com` is fixed as the permanent CY Web canonical user-facing URL. No separate `dev-admin.*` hostname is used. Development acceptance may temporarily run against development Worker/D1 behind that hostname; future production cutover changes backing resources without changing the public URL.
- CY Web deployment uses governed `deploy/cyweb-development` branch push. The custom hostname is part of the Wrangler deployment contract; `workers.dev` remains a technical fallback.
- CYInvoice remains unchanged/reference-only in this workstream. CYAccountingWeb (CYACC-web) and CYInvoice integrations occur in their own workstreams after the shared contract is accepted.
- Production D1/Worker cutover, backup rollout and SMART ERP remain untouched.

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
8. [x] Deploy CY Web development through governed `deploy/cyweb-development` branch push.
9. [x] Repair the CYID first-activation Email-verification race in `0.2.1` and verify the affected activated account reports Email verified correctly.
10. [ ] Bind and accept permanent `admin.chihyuancm.com` through the CY Web deployment contract, then update CYID account-portal delivery to the canonical URL.
11. [ ] Browser-accept the revised Account & Permissions surface and current acceptance UI fixes on the canonical hostname.
12. [ ] Create a controlled new test User and accept first activation Email delivery, Brevo event, canonical CY Web activation link, OTP and first-password completion.
13. [ ] Accept pending edit / resend / delete behavior and delivery-failure recovery without deleting the User automatically.
14. [ ] Accept ordinary USER login/self-service and prove no Workspace management/Access controls are exposed.
15. [ ] Accept normal ADMIN USER-lifecycle limits and prove no App/Module Access administration.
16. [ ] Accept Identity Admin USER↔ADMIN, App Access, Email recovery and anti-self-escalation boundaries.
17. [ ] Implement/accept CY Web-local Module Access management UI + server-side enforcement for Identity Admin/Super Admin. Do not move module permissions into CYID.
18. [ ] Accept activated-account forced Email recovery and `啟用 · Email 待驗證` re-verification flow.
19. [ ] Accept role/App Access session invalidation and immediate authorization changes.
20. [ ] Obtain literal expired-session evidence through CY Web; invalid-session handling is already accepted separately.
21. [ ] Manually accept self-service forgot-password/own Email change and controlled Super Admin transfer without risking lockout.
22. [ ] Add protected Worker business HTTP routes with server-side module authorization.
23. [ ] Replace temporary `localStorage` business-data persistence with Worker API -> D1 while preserving the React workflow.
24. [ ] Perform dedicated UI/UX refinement, including explicit per-mutation optimistic-UI review under the direction recorded above.
25. [ ] Perform Desktop/Tablet/Mobile real-browser acceptance.
26. [ ] Implement and accept backup/restore before production rollout.
27. [ ] Prepare production Worker/D1 and rebind the same `admin.chihyuancm.com` hostname only after explicit production acceptance.

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
- CYID 0.2 development migration and Worker deployment;
- CYID 0.2.1 activation-verification repair and development deployment;
- CY Web 0.2 development deployment and invalid-provider-session acceptance.

Implemented/deployed but still requiring browser acceptance:

- direct Workspace-role principal (`SUPER_ADMIN / ADMIN / USER`);
- Identity Admin capability and its management boundaries;
- locked CY Web core shell entry for all valid Employees;
- direct App Access without Group-derived role authority;
- permission-aware User create/update lifecycle;
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

# CY Web TODO

> 本文件只記錄 **current implementation status 與下一步**；不是永久規則來源，也不重複保存 Business Decision、module contract 或 architecture semantics。

## Current checkpoint — 2026-09-29

- Formal deployed CY Web baseline remains `0.2.4`; `https://admin.chihyuancm.com` is live as the permanent canonical user-facing URL through the governed `deploy/cyweb-development` contract.
- Deployed CYCloud Identity baseline remains `0.2.1`; its first-activation Email-verification race was repaired by migration `0006`.
- Source work for **CYID 0.3 / CY Web 0.3** replaces the former activation-link + activation-OTP first-time flow with an Email-delivered one-time initial password and mandatory password replacement.
- Workspace roles remain exactly `SUPER_ADMIN / ADMIN / USER`; `Identity Admin` remains an ADMIN capability, not a fourth role. Direct App Access and the CY Web core-entry exception remain unchanged.
- CY Web shell entry is Identity-authoritative and mandatory for every valid activated User. Local `app_members.is_active` is a module projection only and cannot revoke the account-management shell.
- Pending first-time User state is user-visible as **`尚未驗證`**. Email pill is `尚未驗證`; pending actions are `編輯 / 重寄 Email 驗證 / 刪除`.
- New first-time flow target/source contract:
  1. manager creates User and chooses an allowed role;
  2. CYID sends Email containing 4-digit account + random 8-character one-time default password, with no activation link required;
  3. User opens normal CY Web login and enters account + one-time password;
  4. CYID returns only a short-lived first-login ticket, not an Identity session;
  5. CY Web forces a new 8–16-character permanent password before any App/module access;
  6. completion verifies Email, records first activation, enables the account, destroys the temporary credential and creates the normal session;
  7. User enters CY Web directly.
- `重寄 Email 驗證` replaces the previous one-time password with a newly generated one. The old temporary password and any prior first-login ticket cease to authorize completion.
- The CY Web login page no longer exposes `啟用帳號`, no longer carries the bottom Identity technical explanation, and uses the existing red rounded `CY` mark as browser favicon.
- Forgot-password and activated-account Email re-verification remain OTP-based flows; they are separate from first-time verification.
- User-account UI otherwise retains 使用者 terminology, Chinese permission labels, compact account controls and inline Email verification pills.
- Super Admin module access is protected and automatic. CY Web Module Access remains CY Web-owned; Identity Admin / Super Admin manage eligible accounts, normal ADMIN has no Access-management authority, and ADMIN with a granted module has full administration authority in that module.
- CYInvoice remains unchanged/reference-only in this workstream. CYAccountingWeb and CYInvoice integrations occur in their own workstreams.
- Production Worker/D1 cutover, backup rollout and SMART ERP remain untouched.

## Deferred UI/UX direction — optimistic interaction

- CY Web should use **optimistic UI wherever appropriate**: reflect safe user actions immediately, persist in the background, rollback and surface an actionable error on failure.
- Do not apply optimistic behavior mechanically to destructive/irreversible deletion, User disable/role/Identity-Admin mutations, Super Admin transfer, forced Email/password/security operations, financial/inventory/invoice/formal-document mutations, or edits with material revision/concurrency conflicts. Surface the trade-off for product confirmation before implementing those classes.
- Where full optimistic success is unsuitable, prefer immediate local pressed/selected state plus an inline pending indicator instead of freezing the whole surface.

## Active next sequence

1. [x] Cut initial CY Web login/session/logout to CYCloud Identity and accept the first Super Admin session path.
2. [x] Finalize `SUPER_ADMIN / ADMIN / USER` + Identity Admin + App Access + CY Web core/module model.
3. [x] Deploy CYID 0.2 direct-role runtime and CY Web 0.2 consumer runtime.
4. [x] Repair CYID first-activation Email-verification race in 0.2.1 and accept affected account state.
5. [x] Bind and accept permanent `admin.chihyuancm.com` through the CY Web deployment contract.
6. [ ] Merge and deploy CYID 0.3 first-login temporary-password runtime, including migration `0007` and first-login roundtrip acceptance.
7. [ ] Merge and deploy CY Web 0.3 first-login consumer/UI after CYID 0.3 is live.
8. [ ] Browser-accept normal login page on the canonical hostname: no `啟用帳號`, no technical footer, CY favicon present.
9. [ ] Create a controlled new test User and accept Email delivery/Brevo event: Email contains account + 8-character one-time password and no activation link dependency.
10. [ ] Accept one-time-password login -> mandatory new-password screen -> permanent password -> direct authenticated CY Web entry.
11. [ ] Confirm admin view transitions `尚未驗證` -> `已驗證 / 啟用` and the old one-time password cannot log in after completion.
12. [ ] Accept `重寄 Email 驗證`: new one-time password works; old one-time password and previous first-login ticket do not.
13. [ ] Accept pending edit / resend / delete and delivery-failure recovery without deleting the User automatically.
14. [ ] Accept ordinary USER self-service and prove no Workspace management/Access controls.
15. [ ] Accept normal ADMIN USER-lifecycle limits and prove no App/Module Access administration.
16. [ ] Accept Identity Admin USER↔ADMIN, App Access, forced Email recovery and anti-self-escalation boundaries.
17. [ ] Implement/accept CY Web-local Module Access management UI + server-side enforcement for Identity Admin/Super Admin.
18. [ ] Accept activated-account forced Email recovery and `啟用 · Email 待驗證` re-verification flow.
19. [ ] Accept role/App Access session invalidation and immediate authorization changes.
20. [ ] Obtain literal expired-session evidence through CY Web; invalid-session handling is already accepted separately.
21. [ ] Accept self-service forgot-password / own Email change and controlled Super Admin transfer without risking lockout.
22. [ ] Add protected Worker business HTTP routes with server-side module authorization.
23. [ ] Replace temporary `localStorage` business-data persistence with Worker API -> D1 while preserving the React workflow.
24. [ ] Perform dedicated UI/UX refinement, including explicit per-mutation optimistic-UI review.
25. [ ] Perform Desktop/Tablet/Mobile real-browser acceptance.
26. [ ] Implement and accept backup/restore before production rollout.
27. [ ] Prepare production Worker/D1 and rebind the same `admin.chihyuancm.com` hostname only after explicit production acceptance.

## Current Identity acceptance boundary

Already accepted in deployed development:

- dedicated CYCloud Identity Worker/D1;
- Email-OTP bootstrap of first Workspace;
- 8–16 Unicode-character permanent password boundary;
- application-aware login and provider-owned session;
- CY Web HttpOnly Identity cookie boundary;
- same-origin login/me/logout browser contract;
- F5 resolve, logout revocation and post-logout rejection;
- provider-invalid session rejection with `401 AUTH_INVALID` + cookie clearing;
- protected Super Admin lifecycle/transfer boundary;
- direct Workspace roles and Identity Admin capability;
- direct App Access and locked CY Web core entry;
- activated-account forced Email recovery contract;
- CYID 0.2.1 activation-verification repair;
- CY Web canonical `admin.chihyuancm.com` TLS/routing/auth-cookie acceptance.

Implemented in 0.3 source and requiring coordinated deployment/browser acceptance:

- separate hashed one-time initial credential;
- Email delivery of account + 8-character one-time default password;
- no public activation-link / activation-OTP first-time UI;
- one-time-password login returning only a short-lived non-session first-login ticket;
- mandatory permanent-password replacement before Session/App access;
- atomic Email verification + activation + enablement + initial-credential removal;
- first-login ticket replay/old-temp-password rejection;
- CY Web forced-password-change UI and retired `啟用帳號` surface;
- CY favicon based on the existing CY brand mark.

Literal expired-session evidence remains separate.

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

Historical documents under `docs/architecture/archive/` and handoff notes are evidence/continuity only; they do not override current rules/contracts or later Business Decisions.

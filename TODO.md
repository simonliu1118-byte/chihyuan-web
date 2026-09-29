# CY Web TODO

> 本文件只記錄 **current implementation status 與下一步**；不是永久規則來源，也不重複保存 Business Decision、module contract 或 architecture semantics。

## Current checkpoint — 2026-09-30

- Current source line on this documentation-consolidation branch is **CY Web 0.2.5 Build 0**. The currently deployed development runtime remains **0.2.4**; this docs-only change does not itself require a runtime deployment.
- CYCloud Identity formal `main` and development runtime remain **0.2.1 Build 0**. Direct Workspace Role `SUPER_ADMIN / ADMIN / USER`, ADMIN-only Identity Admin capability, direct Employee App Access and current session model are already deployed.
- CYID PR #214 is the approved **0.3.0 first-login Email verification** workstream. Its CI validates source/migrations, but PR validation does not deploy development.
- Finalized first-login product flow: create Employee -> CYID sends **Email 驗證** message with expiring one-time first-login password -> user enters through the ordinary CY Web login screen -> CYID returns first-login ticket only -> CY Web forces permanent-password creation -> CYID completes Email verification and invalidates temporary credential -> **no normal Session is issued** -> CY Web returns to login -> user logs in again with the new permanent password.
- CY Web will remove the separate「啟用帳號」entry. External terminology remains **Email 驗證**; resend action is **重寄驗證 Email**.
- First-login credential expiry, resend invalidation and pending-Email-change invalidation are part of the forward shared contract.
- CY Web already normalizes `workspaceRole / isIdentityAdmin / emailVerified`; legacy `groupKeys` is descriptive only.
- CY Web shell entry is Identity-authoritative and mandatory for every valid Employee. CY Web Module Access remains CY Web-owned and requires server-side enforcement.
- `https://admin.chihyuancm.com` is the permanent canonical CY Web user-facing URL. Development currently runs behind that same hostname.
- CYAccountingWeb and CYInvoice are separate consumer workstreams. This control workstream will publish their integration handoff only after the shared CYID contract is accepted.
- Production D1/Worker cutover, backup rollout and SMART ERP remain untouched.

## Documentation consolidation

- `PROJECT_RULES.md` contains permanent CY Web product rules.
- `docs/architecture/IDENTITY_ADAPTER.md` is the single current CY Web <-> CYID contract.
- Root `TODO.md` is the only current status / next-work tracker.
- The dated Identity handoff has been removed from the active tree; historical checkpoints remain available through Git history.
- Architecture/module docs keep their specialized responsibilities and must not maintain parallel Identity status narratives.

## Deferred UI/UX direction — optimistic interaction

CY Web should use optimistic UI where appropriate, but destructive/irreversible actions, Employee authority changes, Super Admin transfer, credential/Email/security operations, financial/inventory/invoice mutations and material concurrency conflicts require explicit per-mutation review before representing success optimistically.

## Active next sequence

1. [x] Complete/deploy CYID 0.2 direct Role / Identity Admin / direct App Access migration.
2. [x] Complete/deploy CY Web 0.2 consumer principal/session/account-management foundation.
3. [x] Bind and accept permanent `admin.chihyuancm.com`.
4. [x] Consolidate CY Web Identity documentation and remove dated handoff as current source.
5. [ ] Finish CYID PR #214 against the final 0.3 contract: initial-password expiry + resend invalidation.
6. [ ] Finish CYID PR #214: first-login completion must return relogin-required **without** issuing a normal Session.
7. [ ] Merge/deploy CYID 0.3.0 development and verify migration/Worker health plus existing permanent-password Super Admin login.
8. [ ] Update CY Web consumer to a single login entry that handles normal login or `passwordChangeRequired`; remove old activation/deep-link UI path.
9. [ ] Add forced permanent-password screen using the first-login ticket; after success return to ordinary login without setting a Session cookie.
10. [ ] Browser-accept a controlled new USER: create -> Email delivery -> one-time first-login password -> forced permanent password -> return to login -> fresh permanent-password login.
11. [ ] Accept expired initial credential, 重寄驗證 Email, pending Email edit, old credential invalidation and delivery-failure recovery.
12. [ ] Accept USER self-service and prove no management surface is exposed.
13. [ ] Accept normal ADMIN USER-lifecycle boundary and prove no App/Module Access administration.
14. [ ] Accept Identity Admin USER<->ADMIN, direct App Access, forced Email recovery and anti-self-escalation boundaries.
15. [ ] Implement/accept CY Web-local Module Access management UI + protected Worker/API server-side enforcement.
16. [ ] Accept activated-account forced Email recovery / `啟用 · Email 待驗證` re-verification.
17. [ ] Accept role/App Access session invalidation and literal expired-session behavior.
18. [ ] Accept forgot-password, own Email change and controlled Super Admin transfer.
19. [ ] Add protected Worker business HTTP routes with server-side module authorization.
20. [ ] Replace temporary business-data `localStorage` persistence with Worker API -> D1 while preserving the React workflow.
21. [ ] Perform dedicated UI/UX refinement and Desktop/Tablet/Mobile real-browser acceptance.
22. [ ] Implement/accept backup+restore before production rollout.
23. [ ] After shared CYID acceptance, publish consumer integration handoffs for CYAccountingWeb and CYInvoice.
24. [ ] Prepare production Worker/D1 cutover only after explicit user approval.

## Current Identity acceptance boundary

Already accepted:

- dedicated CYID Worker/D1 development authority;
- Workspace bootstrap and password/session baseline;
- CYID 0.2 role/access migration and 0.2.1 verification-state repair;
- CY Web provider-owned session transport and invalid-session cookie clearing;
- direct Workspace role / Identity Admin / direct App Access consumer model;
- protected Super Admin baseline;
- canonical CY Web domain routing/TLS.

Still pending or superseded by 0.3 acceptance:

- one-time first-login password + expiry;
- no-session first-login completion + explicit re-login;
- single CY Web login entry with no separate activation entry;
- resend verification Email / pending Email edit invalidation;
- full USER/ADMIN/Identity Admin/Super Admin browser matrix;
- CY Web-local Module Access management + server enforcement;
- literal expired normal Session evidence;
- final self-service/recovery/transfer acceptance.

## Topic source map

- Governance/product permanence: `PROJECT_RULES.md`
- Architecture index: `docs/architecture/README.md`
- Business Decisions: `docs/architecture/decisions/README.md`
- Shared Identity consumer contract: `docs/architecture/IDENTITY_ADAPTER.md`
- Identity deployment: `docs/development/IDENTITY_DEPLOYMENT.md`
- Data model / physical dictionary: `docs/architecture/CANONICAL_DATA_MODEL.md` / `FINAL_DATA_DICTIONARY.md`
- Worker API: `docs/architecture/API_CONTRACT.md`
- Backup/recovery: `docs/architecture/BACKUP_ARCHITECTURE.md`
- Current progress: this file only

Historical preview/audit/readiness/review material under `docs/architecture/archive/` and Git history is evidence only, not current contract.

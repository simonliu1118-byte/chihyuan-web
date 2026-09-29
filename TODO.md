# CY Web TODO

> 本文件只記錄 **current implementation status 與下一步**；不是永久規則來源，也不重複保存 Business Decision、module contract 或 architecture semantics。

## Current checkpoint — 2026-09-30

- Current formal source baseline is **CY Web 0.4.0 Build 0**，development runtime 也已部署 **0.4.0 Build 0**。
- CYCloud Identity formal source/development baseline is **0.3.0 Build 0**。
- `https://admin.chihyuancm.com` 仍是固定 CY Web canonical user-facing URL；0.3 development deploy 已重新驗證 Custom Domain 與 invalid-provider-session fallback。
- CY Web 登入頁現在只有**單一一般登入入口**。舊「啟用帳號」按鈕、`?activate=1` deep-link UI 與 CY Web public activation start/confirm proxy 已移除。
- 一般登入會由 CYID 判斷是正式密碼還是一次性首次登入密碼：
  - 正式密碼成功 -> 建立一般 CYID Session，CY Web 只保存 provider opaque token 的 HttpOnly cookie；
  - 首次登入密碼成功 -> **不建立一般 Session**，CYID 回 first-login ticket。
- CY Web 將 raw first-login ticket 保存於獨立的短效 `HttpOnly; Secure; SameSite=Strict` cookie；React、localStorage 與一般 business API 都拿不到 ticket。
- 有有效 first-login cookie 時，重新整理仍會回到強制設定正式密碼畫面；first-login ticket 不被 normal session resolve 接受。
- 使用者完成正式密碼設定後，CY Web 清除 first-login cookie，顯示「Email 驗證完成，請使用新密碼登入」，並回到一般登入頁；必須再用正式密碼登入才建立 normal Session。
- 首次登入密碼／ticket 逾期時，UI 統一引導聯絡有權限管理員 **重寄驗證 Email**。
- 帳號管理頁的新 Employee 狀態/操作已改用 `Email 未驗證`、`重寄驗證 Email` 等 terminology；不再以「啟用帳號」作新使用者流程名稱。
- 忘記密碼仍維持獨立 Email OTP recovery flow；activated-account Email re-verification 也維持既有 OTP flow。
- CY Web 0.3 CI 已通過 browser/worker TypeScript、source contracts、Local D1 runtime acceptance、Vite build、deployment dry-run；development deploy 已成功完成 D1、Worker/assets、canonical domain 與 invalid-session smoke。
- CY Web Module Access 已切到 direct `Employee × Module` 本地 authority：`CUSTOMERS / ITEMS / DEFECTS / ORDERS / OUTSOURCING / WORKLOGS`。Identity Admin／Super Admin 可管理 eligible Employee；Identity Admin 不可改自己的 Module Access；Super Admin 固定全模組。舊 App tag 關聯只保留 metadata/history，不再作 runtime authorization。
- Production D1/Worker cutover、backup rollout與 SMART ERP remain untouched。

## Documentation consolidation

- `PROJECT_RULES.md` contains permanent CY Web product rules.
- `docs/architecture/IDENTITY_ADAPTER.md` is the single current CY Web <-> CYID contract.
- Root `TODO.md` is the only current status / next-work tracker.
- Dated Identity handoff is not part of active docs; historical checkpoints remain in Git history.

## Deferred UI/UX direction — optimistic interaction

CY Web should use optimistic UI where appropriate, but destructive/irreversible actions, Employee authority changes, Super Admin transfer, credential/Email/security operations, financial/inventory/invoice mutations and material concurrency conflicts require explicit per-mutation review before representing success optimistically.

## Active next sequence

1. [x] Complete/deploy CYID 0.2 direct Role / Identity Admin / direct App Access migration.
2. [x] Complete/deploy CY Web 0.2 consumer principal/session/account-management foundation.
3. [x] Bind and accept permanent `admin.chihyuancm.com`.
4. [x] Consolidate CY Web/CYID Identity documentation and remove dated handoff as current source.
5. [x] Complete/deploy CYID 0.3.0 first-login Email verification runtime with expiry, single-use and resend/edit invalidation.
6. [x] Complete CYID no-session first-login completion + explicit re-login contract.
7. [x] Update CY Web to a single login entry; remove old activation/deep-link UI and public activation proxy.
8. [x] Add separate HttpOnly first-login ticket transport and forced permanent-password screen; completion returns to ordinary login without normal Session.
9. [x] Merge/deploy CY Web 0.3.0 development and accept deployment contract, canonical domain and invalid-provider-session behavior.
10. [ ] Browser-accept a controlled new USER: create -> Email delivery -> first-login password -> permanent password -> return to login -> fresh permanent-password login.
11. [ ] Browser-accept expired initial credential, 重寄驗證 Email, pending Email edit, old credential invalidation and delivery-failure recovery.
12. [ ] Accept ordinary USER self-service and prove no Workspace management controls are exposed.
13. [ ] Accept normal ADMIN USER-lifecycle limits and prove no App/Module Access administration.
14. [ ] Accept Identity Admin USER<->ADMIN, direct App Access, forced Email recovery and anti-self-escalation boundaries.
15. [x] Implement/deploy CY Web-local direct Module Access management UI、navigation filtering、server-side module check 與 reusable Worker authorization guard。實際 business HTTP routes 接入同一 guard 仍在第 19 步。
16. [ ] Accept activated-account forced Email recovery / `啟用 · Email 待驗證` re-verification.
17. [ ] Accept role/App Access session invalidation and literal expired normal Session behavior.
18. [ ] Accept forgot-password, own Email change and controlled Super Admin transfer.
19. [ ] Add protected Worker business HTTP routes with server-side module authorization.
20. [ ] Replace temporary business-data `localStorage` persistence with Worker API -> D1 while preserving the React workflow.
21. [ ] Perform dedicated UI/UX refinement and Desktop/Tablet/Mobile real-browser acceptance.
22. [ ] Implement/accept backup+restore before production rollout.
23. [ ] After shared CYID browser acceptance, publish consumer integration handoffs for CYAccountingWeb and CYInvoice.
24. [ ] Prepare production Worker/D1 cutover only after explicit user approval.

## Current Identity acceptance boundary

Already accepted by automated/source/deployment evidence:

- CYID 0.3 initial password expiry / single-use / core-app-only behavior;
- first-login ticket not a Session;
- first-login completion returns `reloginRequired` with no normal Session;
- resend/pending Email edit invalidate prior initial credentials;
- CY Web separate HttpOnly first-login cookie boundary;
- CY Web direct Employee × Module Access schema/migration、anti-self-escalation management API、atomic audit、navigation filtering、server module-check endpoint and reusable authorization guard;
- single login entry with no separate activation UI/public activation route;
- browser/worker typecheck and source-contract gates;
- CY Web Local D1 runtime/build;
- CYID + CY Web 0.3 development deployment;
- canonical Custom Domain routing and invalid-provider-session handling.

Still requiring real browser / Email-provider acceptance:

- controlled new USER complete Email verification journey;
- actual Email provider delivery and one-time password receipt;
- expired-password/resend/pending-edit UX;
- USER / ADMIN / Identity Admin / Super Admin visible-action matrix;
- activated Email recovery/re-verification;
- role/App Access immediate invalidation and literal expired normal Session;
- self-service forgot-password / own Email / protected Super Admin transfer.

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

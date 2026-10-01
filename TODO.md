# CY Web TODO

> 本文件只記錄 **current implementation status 與下一步**；不是永久規則來源，也不重複保存 Business Decision、module contract 或 architecture semantics。

## Current checkpoint — 2026-10-01

- Current source release **CY Web 0.7.1 Build 0** adds portable backup and fresh-D1 recovery foundations; all six business pages and Settings/Audit remain on protected Worker API → D1. **Development 0.7.0 Build 0 已部署並驗證**，run `36821410198`；source 與部署證據分開記錄。
- CYCloud Identity source/development **0.3.5 Build 0**；development run `36821423383` 通過實際 Worker/D1 binding、version 與 invalid Session readback。Shared Consumer Contract = **1.0.2**，Minimum Compatible = **1.0.0**。
- `https://admin.chihyuancm.com` 仍是固定 CY Web canonical user-facing URL；0.3 development deploy 已重新驗證 Custom Domain 與 invalid-provider-session fallback。
- CY Web 根 `CYID_CONSUMER_VERSION=1.0.2` 宣告所採用的 shared Identity contract；`docs/contracts/cyid/` mirror 依 CYID `CONSUMER_SYNC_MANIFEST.json` 保存 7 個 canonical artifacts + manifest snapshot。Governance Check 與 development deploy 同時驗證 supported version window 與逐檔 byte-level sync；任一漂移都阻止後續部署。
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
- CY Web 0.5.4 development 已完成六個業務模組的 protected Worker/D1 API foundation（Customer／Item／Defect／Order／Outsourcing／WorkLog），並補齊 Customer related operations、Customer/Item canonical lookup/read model 與 regions。CI/deploy gates 全綠。
- CY Web Module Access 已切到 direct `Employee × Module` 本地 authority：`CUSTOMERS / ITEMS / DEFECTS / ORDERS / OUTSOURCING / WORKLOGS`。Identity Admin／Super Admin 可管理 eligible Employee；Identity Admin 不可改自己的 Module Access；Super Admin 固定全模組。舊 App tag 關聯只保留 metadata/history，不再作 runtime authorization。
- **Item / Customer / Defect / Order / Outsourcing / WorkLog** all use Worker API → D1. WorkLog preserves create/edit/delete, submit/withdraw, review/cancel-review and statistics; authority and stock/financial changes remain server-side.
- CYID production provisioning 已獲明確批准，獨立 provider 的 Production Provisioning run #12 已成功；這不等於 CY Web business-data production cutover。CY Web production D1/Worker cutover、backup rollout與 SMART ERP remain untouched。
- Existing WorkLog branch implementation was integrated; there is one runtime API client and page, with no duplicate adapter.
- Settings/Audit use protected `/api/admin/settings` and read-only `/api/admin/audit`; server-side Session + active App member + direct ADMIN/SUPER_ADMIN authority. `OperationalWorkspace.tsx`, browser-local database/types and local static deployment workflow are removed.
- 相容層檢查及 source remediation 完成，讀 `docs/architecture/COMPATIBILITY_REVIEW.md`。Group proxies/fields and duplicate local pages are retired; all Identity callers share a single bounded provider transport with no retry. CYID 0.3.5 and Consumer 1.0.2 coordinate canonical initial Email re-send route/fields.
- CYID PR #254 已在 production deployment branch 將一次性 provisioning 換成 inert retirement gate，不能再重播 development Employee；CYID 日常 production release 已另建 main-only manual workflow，consumer readiness 通過後只作 forward schema/source deploy；本輪沒有 CY Web production rollout。

## Documentation consolidation

- `PROJECT_RULES.md` contains permanent CY Web product rules.
- `docs/contracts/cyid/` is the synchronized read-only mirror of the shared CYID consumer package.
- `docs/architecture/IDENTITY_ADAPTER.md` is the CY Web-specific adapter/module contract only.
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
19. [x] Add/deploy protected Customer／Item／Defect Worker HTTP routes with server-side Module Access before domain-service access.
20. [x] Extend protected Worker HTTP boundary to Order／Outsourcing（including contractor/BOM/stock）／WorkLog；六個業務模組 API foundation complete。
21. [x] Replace temporary business-data `localStorage` persistence with Worker API -> D1 while preserving the React workflow：**Item [x]；Customer [x]；Defect [x]；Order [x]；Outsourcing [x]；WorkLog [x]**。
22. [ ] Perform dedicated UI/UX refinement and Desktop/Tablet/Mobile real-browser acceptance.
23. [ ] Implement/accept R2 + GCS backup+restore before production rollout; portable package/fresh-D1 rehearsal is the first implementation stage, not external-provider or live-restore acceptance.
24. [x] Publish governed CYID shared Consumer Integration Standard + compatibility window + cross-repository manifest mirror；CY Web adopts `CYID_CONSUMER_VERSION=1.0.2` and exact-sync deployment gate。CYACC handoff remains app-specific at `CYapps/apps/CYCloudIdentity/docs/consumers/CYACC_INTEGRATION_HANDOFF.md`。
25. [ ] 在 CYInvoice 工作線的適合接入點產出其 consumer-specific CYID handoff；Device/local/offline 邊界保持 CYInvoice-owned。
26. [ ] Prepare CY Web production Worker/D1 cutover only after explicit user approval; CYID provider provisioning 的既有批准與成功證據不表示 CY Web production rollout 已批准。
27. [x] Review compatibility/runtime/deployment layers; record source evidence and cleanup order in `docs/architecture/COMPATIBILITY_REVIEW.md`.
28. [x] Coordinate Group-field/proxy retirement with CYID; finish existing WorkLog branch, remove superseded local business pages and complete Settings/Audit data boundary without another compatibility wrapper.

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
- Shared CYID consumer package mirror: `docs/contracts/cyid/`
- CY Web-specific Identity adapter: `docs/architecture/IDENTITY_ADAPTER.md`
- Identity deployment: `docs/development/IDENTITY_DEPLOYMENT.md`
- Data model / physical dictionary: `docs/architecture/CANONICAL_DATA_MODEL.md` / `FINAL_DATA_DICTIONARY.md`
- Worker API: `docs/architecture/API_CONTRACT.md`
- Backup/recovery: `docs/architecture/BACKUP_ARCHITECTURE.md`
- Current progress: this file only

Historical preview/audit/readiness/review material under `docs/architecture/archive/` and Git history is evidence only, not current contract.

## 0.6.1 source cleanup validation

- 三個 Identity adapter regression tests 通過：無 Group projection 的 direct-role principal 可登入、required authority checks 保持 fail closed、retired routes 不呼叫 provider。Runtime Check 執行相同 tests。
- Full source checks、browser/Worker TypeScript 與 operational bundle 通過。Local D1/Worker acceptance 被執行環境 `uv_interface_addresses` 錯誤阻擋；GitHub Actions existing Local D1 runtime acceptance 是 merge gate。
- 本批只更新 source；development runtime 仍為 0.6.0，未宣稱完成 provider legacy-field retirement 或整體 localStorage cutover。

## 0.7.0 cleanup verification

- Browser/Worker TypeScript, full source/schema/transport checks, operational bundle and deployment renderer pass locally. Eight Identity tests cover current principal validation, retired routes, one-attempt header/body timeout and exception behavior.
- Worker/D1 acceptance now requires Settings/Audit Session/role denial, body-role spoof rejection, real persisted settings writes, stale-write conflict, server-derived Audit actor, atomic rollback on Audit failure, schema-correct region references, read-only Audit and inactive App member rejection, alongside existing business transaction/WorkLog lifecycle checks.
- Shared contract mirror must exactly match CYID main at 1.0.2 before merge/deploy. `/api/health` reports the build's declared consumer version so production provider retirement can verify actual core-consumer readiness.
- Source completion does not claim real Email/browser/device acceptance, backup/restore or production business-data cutover. Development release evidence is recorded after the deployment runs complete.

## Development release acceptance — 2026-10-01

- [PR #90](https://github.com/simonliu1118-byte/chihyuan-web/pull/90) merged at `1935d44d3d720737b514dc5c975b5f3725909e72`: CY Web 0.7.0 Build 0, GOV 1.1.7, common rules 2.7.0 and exact CYID consumer 1.0.2 mirror.
- [Development Deploy run 36821410198](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/36821410198) passed remote migrations, Worker/assets deploy, actual canonical and workers.dev D1 health, source version 0.7.0, consumer declaration 1.0.2, cookie clearing and rejection of syntactically valid unregistered provider Sessions.
- Required PR Runtime Check `36821248740` passed actual Worker/D1 business transactions, WorkLog lifecycle and Settings/Audit role/spoofing/conflict/atomic-rollback/reference-schema checks. Full source gates, TypeScript and eight Identity tests passed.
- CYID development 0.3.5 release passed [run 36821423383](https://github.com/simonliu1118-byte/CYapps/actions/runs/36821423383), including actual development Worker/D1 isolation and fail-closed Session resolution.
- Browser-local runtime authority is retired. No browser-local business data was imported into remote D1 by this release; any needed legacy browser-data recovery/import must be a separately reviewed operation.
- Production business-data cutover, backup/restore and actual Email/browser/device lifecycle acceptance remain pending; development deployment is not their acceptance evidence.

## Real browser acceptance — 2026-10-01

- Dedicated cloud browser accepted normal permanent-password login through the deployed canonical CY Web domain. Fresh reload completed Session resolution and returned to the business UI; no stuck login state was observed in this session. Tested principal: SUPER_ADMIN; no real Employee identifiers or credentials are recorded here.
- Customer create persisted the synthetic `CYWEB 驗收 20261001` fixture with full name `Development 瀏覽器持久化驗收資料`; a full reload returned the saved revision and fields. The fixture remains in development D1 and was not deleted. No production data was changed.
- Customer, Item, Defect, Sales Work Order, Outsourcing and WorkLog all finished authority/data loading. Settings, read-only Audit and Identity management also finished loading. Empty development lookups mean this is page-load coverage, not full business workflow acceptance for all six modules.
- SUPER_ADMIN self-service, Employee management, App/Module Access and security-policy controls rendered. No Role/Access/security-policy mutation, credential change or Super Admin transfer was performed. Other roles remain unaccepted in the real browser.
- Forgot-password -> return-to-login navigation passed without sending an Email. Real Email delivery, controlled new USER first-login, resend/expiry/pending-email-edit and recovery are still pending. Next prerequisite: a user-designated controlled inbox not already used by an Employee in this development Workspace; creation sends a real verification Email and requires explicit recipient/access authorization. New credential entry must be completed by the user through the browser handoff.
- Visual refinement remains pending: the one-row Customer list stretches the selected row to fill the tall list panel. No Desktop/Tablet/Mobile acceptance is inferred from this desktop viewport.
- Architecture index was corrected to remove stale localStorage-adapter descriptions. Runtime/product versions and contract mirror are unchanged.

## Durable pending-test checklist — Email deferred by user, 2026-10-01

Email acceptance is explicitly deferred while engineering work continues. These unchecked items remain in Git across conversations; no inbox needs to be supplied to continue the non-Email work.

- [ ] Controlled new USER: real verification Email receipt -> initial password -> first-login ticket -> user-entered permanent password -> return to login -> fresh permanent-password login. Prerequisite: designated inbox not already assigned in the development Workspace and authorized account creation/Email send.
- [ ] Initial expiry, re-send, pending Email edit, prior credential/ticket invalidation and delivery failure/retry UX.
- [ ] Activated-account forced Email recovery/re-verification, forgot-password and own Email change.
- [ ] Protected Super Admin transfer, including credential/OTP confirmation; no real authority transfer was performed.
- [ ] USER/normal ADMIN/Identity Admin real-browser action matrix and Role/App/Module Access revocation; current real-browser result covers SUPER_ADMIN only.
- [ ] Full six-module business lifecycle, concurrency and audit acceptance beyond the completed page-load and Customer create/reload check.
- [ ] Desktop/Tablet/Mobile real-device acceptance; Customer selected-row stretch needs visual refinement.
- [ ] Real R2/GCS object upload/read-back, retry, catalog/retention, scheduling and independent disaster recovery.
- [ ] Super Admin-only backup/restore HTTP/UI, double confirmation, pre-restore safety copy, controlled live restore and structured audit.
- [ ] Explicit production readiness/release approval; this work provisions no storage resource and mutates no production database.

## Backup implementation checkpoint — 0.7.1 source

- CY Web target remains **R2 daily 03:30 Taiwan / 30 days + GCS Wednesday/Sunday Taiwan / 182 days**. Export once and replicate identical portable bytes; manual/pre-restore requests both. Separate app-scoped resources/credentials remain required.
- CYACCweb currently runs Phase C paired R2/GCS; its GCS daily/14-day policy remains until 14 consecutive paired scheduled acceptance events. Its existing `CYAccountingWebBackupSet / formatVersion 2` stays CYACC-owned; CY Web starts the approved `CYBackupSet / formatVersion 1` without introducing an old-format wrapper. No CYACC source or migration is changed here.
- New internal portable backup module reads 45 app data tables in one D1 data batch, preserves fixed-point integer/text/IDs and rejects unexpected table coverage. Provider-copy catalog and migration/internal tables are excluded from the portable data, not from the schema/empty-target guards. Identity credentials/Sessions remain outside CY Web.
- Manifest includes app/scope/schema fingerprint, counts, exact UTF-8 byte length and SHA-256. Provider copies must read back both files with identical bytes; retry consumes the existing package without another source export.
- Fresh-database restore rejects corruption, wrong app/scope/format/schema/counts/columns and nonempty targets before inserts; rechecks emptiness inside the atomic write batch and preserves D1 foreign-key enforcement. No deletion, live overwrite or production HTTP route is exposed.
- Initial bounded rehearsal capacity: 500 rows total / 5 MiB. Larger datasets fail closed; capacity, Worker memory/CPU and per-invocation D1 query limits (including metadata/restore/reconciliation reads) must be measured/reworked before production acceptance. No chunked partial restore is claimed.
- Existing Runtime Check now requires real separate local D1 recovery/reconciliation and FK/duplicate-failure rollback. Synthetic in-memory providers only validate the byte-copy protocol; they do not constitute actual R2/GCS acceptance. Development deployed runtime remains 0.7.0 until a separate release.

### Backup foundation verification

- [Runtime Check 36842783185](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/36842783185) passed actual separate local D1 migrations and required `portableBackupRecovery`, alongside all existing business/Settings/Audit acceptance.
- Recovery verified full canonical-data byte reconciliation and foreign keys; valid-digest FK/duplicate-key failures rolled back to an empty target. Cross-app/scope, corruption, unsupported format/schema, mismatched counts/columns and nonempty target were rejected.
- Synthetic provider outage/retry/corrupt-readback tests passed, retaining byte-identical copies. These establish protocol behavior only; actual R2/GCS provider acceptance remains unchecked above.
- Governance 36842783192 and development deployment validation 36842783092 passed. The PR did not execute a development or production deployment. Root source is 0.7.1; deployed development remains 0.7.0.

## Tiered backup implementation checkpoint — 0.7.2 source

- R2/GCS adapters create immutable objects; an existing identical object permits idempotent retry, different bytes reject collision. Read-back verifies both files. Fixed Google OAuth/Storage endpoints, RS256 service-account JWT, bounded bodies/deadlines, pagination guards and generation-safe GCS deletion are implemented.
- Forward `0006_backup_catalog` adds server-owned Workspace scope, app version, trigger kind/key and copy leases. Unknown-scope legacy rows are not reassigned. One logical history entry has separate R2/GCS state; GCS failure preserves verified R2 and retry uses the existing verified R2 bytes/catalog digest without D1 export.
- Taiwan daily policy: UTC `30 19 * * *` -> next local date 03:30; scheduled GCS Wednesday/Sunday, manual both. Duplicate daily event claims share one backup ID. Bounded cleanup follows R2 30 days / GCS 182 days only after a newly verified copy, protects pending/failed replication sources and records failures for retry. Cleanup affects only catalog-selected backup objects; no application data clear endpoint exists.
- Worker API `/api/admin/backups` GET/POST and `/{backupId}/retry` POST require provider-resolved SUPER_ADMIN and active app membership; Workspace/actor come from server authority. No restore, portable download/upload or live database deletion route is added. Backup management UI remains pending.
- Deployment remains opt-in (`CF_BACKUP_ENABLED=true`, app-owned `CF_BACKUP_R2_BUCKET`); runtime requires `GCS_BUCKET` and `GCS_SERVICE_ACCOUNT_JSON` from protected deployment configuration/secrets. Missing configuration fails closed. No resource provisioning or remote deployment was performed.
- Export now uses four bounded D1 queries rather than table-by-table metadata/data queries: actual schema, actual-column query, transaction schema guard and one VALUES-based JSON table query. Generated columns are checked against canonical migrations. Current 500-row / 5-MiB rehearsal cap remains; full invocation CPU/memory/query budget and larger datasets remain production prerequisites.
- Local source/schema/TypeScript and provider regression checks pass. Actual Worker/D1/R2 CI evidence is recorded after the required Runtime Check completes; simulated GCS tests do not claim real GCS service-account/bucket acceptance.
- Durable pending tests above remain unchecked: real Email is still explicitly deferred; real provider provisioning/upload/read-back, scheduled runs and independent disaster recovery, UI/restore confirmations, full business/role/device acceptance and production release remain pending.

- Runtime Check caught the D1 compound SELECT term limit; UNION reads were replaced by a table-valued column join and a VALUES-based snapshot, retaining one data transaction and exact table coverage. Cleanup is capped at one old copy per provider/event to bound the full invocation query budget; fresh head is revalidated before merge.

### Tiered backup verification

- [PR #96](https://github.com/simonliu1118-byte/chihyuan-web/pull/96), source head `fdba2f281ba3575f539c5cc4645be0820f4c5d66`: [Runtime Check 36850070200](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/36850070200) passed actual separate D1 recovery and ephemeral R2 upload/read-back, immutable collision rejection, provider-copy failure/retry, 30/182-day policy, pending-replica protection, duplicate daily event and Workspace/role/inactive-member checks.
- Governance 36850070797 and development deployment validation 36850070460 passed. Deployment job was skipped; development remains 0.7.0. GCS tests use generated in-memory RSA keys and simulated HTTP, not a real bucket/service account.
- Next engineering step: backup history/manual/retry UI and protected recovery rehearsal workflow; retain the current empty-target primitive. Before any live restore, implement and accept Super Admin double confirmation, pre-restore both-provider safety copy, target isolation/rollback and structured audit. No one-click clear or arbitrary portable import/export is planned.
- Controlled development R2/GCS resource/secret configuration, true scheduled event/read-back and independent GCS recovery require their own acceptance evidence; production rollout remains pending explicit readiness approval.

## Backup management / recovery rehearsal checkpoint — 0.7.3 source

- `#backups` adds SUPER_ADMIN-only history/manual/GCS retry using the existing protected Worker API. One backup event contains nested copy outcomes and server-derived retry capability. Shared DataView provides table/cards; mutations never fall back to browser-local data, and ambiguous network outcomes require history refresh rather than automatic re-submission.
- Shared typed history excludes resource identifiers/object prefixes. Missing storage configuration permits scoped history reads (`configured=false`) and disables mutation controls; server POST remains fail-closed. UI completion messages do not misrepresent a failed/partial copy as both-provider success.
- Internal isolated recovery loads immutable catalog-matched bytes, prefers verified R2 and falls back to verified GCS. It checks actor/authority/selection/isolated-target acknowledgements and empty schema-compatible target before exporting a distinct pre-restore safety set. Both safety copies must verify before any target insertion; selected data is reconciled and source audit links selected/safety IDs, actor, request and result. Source business data is not cleared or overwritten.
- The rehearsal binding exists only in ephemeral CI configuration. Live restore HTTP/UI, destructive replacement confirmation, operator isolation/rollback and actual provider disaster recovery remain pending; no new production resource, credential, schedule or deployment was activated. Development remains 0.7.0.
- Local source/schema/TypeScript, provider/UI tests, deployment renderer and operational build are checked before GitHub-final acceptance. Required Runtime Check adds real third-D1 rehearsal, failure-before-safety, GCS-fallback byte reconciliation and audit checks. Synthetic GCS is not real cloud acceptance.
- [ ] Real browser backup history/manual/retry, loading/error/partial-state behavior and Desktop/Tablet/Mobile layout acceptance after controlled development deployment.
- [ ] True GCS service-account/bucket read-back, cross-cloud recovery, real scheduled events and measured production CPU/memory/query/capacity budgets.
- [ ] Identity-backed live restore authorization, two destructive UI confirmations, both-provider safety copy, target isolation/rollback, recovery audit and explicit release approval.
- Email pending tests above remain deferred by user and unchecked in Git.

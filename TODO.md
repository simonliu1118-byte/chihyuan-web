# CY Web TODO

> 本文件只記錄 **current implementation status 與下一步**；不是永久規則來源，也不重複保存 Business Decision、module contract 或 architecture semantics。

## Current checkpoint — 2026-10-02

- Current source release **CY Web 0.7.8 Build 0** includes immutable tiered backup providers/catalog, protected backup management and isolated recovery rehearsal; all six business pages and Settings/Audit remain on protected Worker API → D1. **Development 0.7.8 Build 0 已部署並驗證**，run `36963388836` attempt 2; historical checkpoints retain their original deployment version.
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
23. [ ] Implement/accept R2 + GCS backup+restore before production rollout. User-owned development resource/secret setup is deferred until the week beginning 2026-10-05; resume live cloud acceptance only after user handback. Continue independent UI/business acceptance meanwhile.
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
- [ ] Desktop/Tablet/Mobile real-device acceptance.
- [x] Customer single-row stretch: shared Grid track alignment fixed and verified in the real desktop browser on development 0.7.5 Build 0.
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
- [x] Real SUPER_ADMIN browser backup navigation/history load/refresh, unconfigured empty state and disabled create control on deployed development 0.7.3 Build 1.
- [ ] Configured/populated backup manual/retry, failure/partial-copy browser interactions and Desktop/Tablet/Mobile real-device layout acceptance.
- [ ] True GCS service-account/bucket read-back, cross-cloud recovery, real scheduled events and measured production CPU/memory/query/capacity budgets.
- [ ] Identity-backed live restore authorization, two destructive UI confirmations, both-provider safety copy, target isolation/rollback, recovery audit and explicit release approval.
- Email pending tests above remain deferred by user and unchecked in Git.

### Backup management / rehearsal source verification

- [PR #97](https://github.com/simonliu1118-byte/chihyuan-web/pull/97) merged at `1a04258a985b532bb484ede4899f406c5015f2bf`, CY Web 0.7.3 Build 0 / GOV 1.1.10. [Runtime Check 36856421670](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/36856421670) passed separate D1/R2 backup/recovery, new third-D1 controlled rehearsal, GCS fallback/catalog mismatch rejection, failed safety-copy write prevention, nonempty-target/authority/confirmation denial and source business preservation/reconciliation/Audit.
- Governance 36856421596 and development deployment validation 36856421690 passed. Browser/Worker TypeScript, full source/schema checks and 16 Identity/provider/UI projection tests passed. Provider/UI tests do not replace real cloud/device acceptance.

### Development release / browser acceptance — backup management

- [Development Deploy 36856683096](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/36856683096) deployed 0.7.3 Build 0 from `1a04258a985b532bb484ede4899f406c5015f2bf`, applying forward migrations and passing exact CYID sync, version/D1 health, canonical Custom Domain and invalid-provider-session acceptance. Backup remains unconfigured; no provider resource or cron was activated.
- Real cloud browser restored the existing SUPER_ADMIN Session after reload, retained the earlier synthetic Customer fixture, displayed the new backup navigation/page, completed history load and showed the unconfigured/empty state. Create was disabled; refresh was available. No real backup, restore, Email, Role/Access change or production mutation was performed.
- Source 0.7.3 Build 1 makes disabled backup actions visually clear following the first development UI check; version remains 0.7.3 for this same work item. The follow-up deployment/visual result is recorded below when complete.
- Populated/partial-copy browser interaction and Desktop/Tablet/Mobile real-device acceptance remain unchecked. The completed browser check covers the unconfigured state in this desktop viewport only.

### Final development checkpoint — 0.7.3 Build 1

- [PR #98](https://github.com/simonliu1118-byte/chihyuan-web/pull/98) merged at `361e410059cc374f57ec7443c4123c8590426b46`; Runtime Check 36857274415 and Governance 36857274384 passed. [Development Deploy 36857492008](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/36857492008) passed remote migrations, Worker/assets deploy, exact consumer sync, actual D1/version read-back, canonical Custom Domain and invalid Session checks.
- A fresh real-browser reload restored the existing SUPER_ADMIN Session and rendered the unconfigured backup page without a stuck loading/error state. History refresh returned to ready. Create remained disabled and its appearance was verified inactive. The earlier synthetic Customer fixture remained present before this final reload. No backup object, live restore, Email or permission change was executed in the development browser.
- Source and deployed development are **0.7.3 Build 1**, GOV 1.1.10, consumer 1.0.2. CI recovery uses three independent ephemeral D1 bindings and local R2; GCS remains simulated. There is no production deployment or new storage resource/cron activation.
- Next: controlled app-owned R2/GCS runtime configuration and genuine provider upload/read-back/scheduled/independent recovery acceptance; then configured UI/manual/retry, full business/role/device acceptance and guarded live-restore/release readiness. Email remains explicitly deferred in the durable checklist. Keep the 500-row / 5-MiB rehearsal capacity and full CPU/memory/query budget prerequisites visible before cloud activation.


## Cloud activation checkpoint — 0.7.4 Build 0

- Deployment now forwards protected backup settings and validates/uploads the GCS runtime secret with Worker source. Manual activation and schedule activation have separate opt-ins; disabled/manual deployments explicitly remove cron and the Worker independently ignores disabled schedule events.
- Local deployment-contract tests cover manual/scheduled/disabled states, missing storage inputs, safe credential errors, secret projection and private-file permissions. Runtime schedule regression verifies disabled scheduled events do not access D1 or providers. Required PR CI retains real ephemeral D1/R2 recovery and simulated GCS coverage.
- Cloud administration/secret-management capability is unavailable in this session; existing protected resource names/secret values were not read or copied. This change provisions no R2/GCS resource and establishes no live cloud acceptance.
- Development **0.7.4 Build 0** deployed from `ebe169ab8da47aeffb9c9aa3d22e40ced9819a13`, run `36860791237` attempt 2. Exact CYID sync, canonical/fallback source+consumer+D1 health and invalid Session acceptance passed. Attempt 1 deployed successfully but failed the immediate source/consumer/D1 health gate; the same source passed on one governed rerun, with no code change. This does not establish the underlying transient cause. Email tests remain deferred in the existing persistent checklist.

### Remaining live cloud acceptance

- [ ] Confirm development has dedicated app-owned R2/GCS buckets, suitable bucket-only service-account permissions, no external R2 overwrite writer, and protected deployment inputs. No CYACC storage/credentials sharing.
- [ ] Deploy with `CF_BACKUP_ENABLED=true` and `CF_BACKUP_SCHEDULE_ENABLED=false`; verify Super Admin manual controls become available and other roles remain denied.
- [ ] Run manual backup; verify actual R2/GCS readback, identical data/manifest SHA and backup event, and non-secret catalog/audit results.
- [ ] Controlled GCS failure/retry: verified R2 remains intact; retry copies the same immutable event bytes and creates no new snapshot.
- [ ] Real isolated recovery: selected cloud backup plus both verified pre-restore safety copies; empty migrated target, record/byte reconciliation, source unchanged and structured audit. Never target the live business D1.
- [ ] After manual/recovery acceptance, explicitly enable schedule; verify Taiwan dates, daily R2, Wednesday/Sunday GCS, 30/182-day retention and pending-GCS R2 protection.
- [ ] Record actual deployment run and acceptance outcome here using non-sensitive status only. Production CY Web activation remains a separate rollout.


### Cloud activation validation results

- [PR #100](https://github.com/simonliu1118-byte/chihyuan-web/pull/100) merged controlled cloud configuration, source **0.7.4 Build 0**, GOV **1.1.11**. Governance `36860550180`, deployment contract `36860550211` and Runtime Check `36860550312` all passed on final source head `55b883f8d9c2bf63a575719b7e5747a1ddca444f`; remote file bytes were reconciled before merge.
- [Development deploy 36860791237](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/36860791237) attempt 2 succeeded. Protected runner explicitly reported **Backup disabled; no credential uploaded**. Real R2/GCS backup and cron remain inactive; successful source deployment is not cloud-backup acceptance.
- Provider-specific plugin discovery found no matching Cloudflare/GCS administration capability in the returned results. Other plugins may exist in the plugin directory; unrelated file-storage/BigQuery plugins cannot manage these buckets or runtime secrets. The browser's direct health-page navigation was blocked by its client; deployment verification relies on the successful governed runner checks rather than a claimed browser check.
- Next dependency: protected cloud resource/settings access, then the remaining manual dual-provider, failure/retry and isolated-recovery checklist above. No credentials should be pasted into chat or Public Git. Production CY Web remains untouched.


### Development resource setup handoff

- [x] Rechecked CYACC's latest `origin/main` backup documentation: isolated application dataset/service account, bucket-scoped IAM, accepted real R2/GCS copies; its Phase C/legacy payload and production resources are separate from CY Web.
- [x] Added the exact manual resource, IAM, environment-variable/secret and handback steps to [the existing deployment principles](docs/architecture/CLOUDFLARE_PUBLIC_DEPLOYMENT_PRINCIPLES.md#development-backup-manual-setup-and-handback), verified against provider documentation. No new rule layer or code/configuration wrapper.
- [ ] User completes/confirms private development R2/GCS buckets, bucket-only service-account permission, and the existing GitHub `development` environment's four backup variables plus one GCS secret. Return only a completion message, never credential contents.
- [ ] On handback, deploy the already-governed source in manual-only mode, then execute and record the remaining live cloud acceptance above. Current development stays **0.7.4 Build 0**, backup disabled, until that deployment succeeds.
- Email acceptance remains deferred. No production resources, credentials or cloud IAM changes were made in this documentation task.


## Deferred cloud setup and independent UI work — 2026-10-02

- User explicitly deferred the manual development R2/GCS resource/IAM/GitHub-secret setup until next week (week beginning **2026-10-05**, Asia/Tokyo). Keep it unchecked in this file; no cloud activation, resource provisioning or reminder was requested. Await the user's setup-completion handback before the dependent live-cloud acceptance.
- Email/provider acceptance remains deferred in the durable checklist. Continue independent UI/business work rather than treating either deferred dependency as a general engineering blocker.
- **0.7.5 Build 0:** fix the previously observed Customer one-row selection stretching across its tall result pane. The existing shared operational list grid now aligns its tracks to the start; content-height rows remain grouped at the top while the Customer pane keeps its layout/scrolling rules. No duplicate component, runtime viewport switch or data/permission change.
- Browser/Worker TypeScript, source contracts and existing regression checks are required before merge; deployed verification is recorded separately. Development remains **0.7.4 Build 0** until the new deployment passes.
- Next independent work: Desktop/Tablet/Mobile presentation and full business lifecycle/concurrency/audit acceptance; real multi-role browser checks still require suitable controlled test accounts.


### Independent UI/business verification — 0.7.5 Build 0

- [PR #103](https://github.com/simonliu1118-byte/chihyuan-web/pull/103), head `a4867fa76ea2da587473fcc515c8f01f6cf299e2`, merged `cec1ec3fe383f1f7cc98d4d75330a138a6b3788e`. Governance `36890196100`, deployment contract `36890196057` and Runtime Check `36890196058` passed; remote source bytes reconciled. Source/schema/TypeScript and 18 existing regression tests also passed locally.
- [Development Deploy 36890514762](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/36890514762) attempt 1 succeeded: exact CYID sync, forward migrations/source deployment, canonical and fallback source/consumer/D1 health, Custom Domain and invalid-provider-session checks.
- Real desktop browser: the same one-row Customer list and 673.9px pane changed from a **673.9px row** (`align-content:normal`) to a **70px row** (`align-content:start`). Reload retained the saved Customer and selection. No Mobile/Tablet acceptance is inferred from this desktop viewport.
- Two real browser tabs used the existing synthetic development Customer at revision 1. First tab changed its synthetic full name and saved revision 2. Second tab's stale revision-1 write displayed “資料已被其他人修改，請重新載入後再操作。”; cancelling its draft loaded revision 2. Full reload, including after the new deployment, preserved the first tab's value. No stale overwrite or automatic mutation retry occurred.
- The synthetic Customer remains in development at revision 2; its full name now includes the concurrency-acceptance marker. No Customer deletion, real customer edit, authority change, Email send or production mutation was performed. Browser screenshots contain session display identity and remain private, outside Public Git.
- User-owned R2/GCS setup stays deferred to the week of 2026-10-05. Email stays deferred. Next independent acceptance: Customer related operations and the other business-module workflows/concurrency/audit, plus device presentation and controlled multi-role browser coverage.


### Customer related acceptance checkpoint — 2026-10-02 (Asia/Tokyo)

- Development stays **0.7.5 Build 0**; this checkpoint changes documentation only.
- [x] Existing synthetic Customer profile: add a synthetic phone/extension, contact/title, postal/address and important note through the real desktop browser. The save succeeded and the detail readback displayed **revision 3** with the submitted fields. No real customer/contact information was entered.
- [x] Full-page reload persistence of revision-3 contact fields: verified after the user renewed development sign-in; the same Customer retained phone/extension, contact/title, postal/address and note. See resumed acceptance below.
- [x] Visit creation/contact snapshot/edit/reload/concurrency: initial expired-session draft was cancelled without a successful save. After user sign-in renewal, these checks passed on one synthetic Visit; see resumed acceptance below.
- [x] Visit native date input: earlier automation `fill` observation was not established as an application defect. Ordinary keyboard input changed the date to `2026-11-01`, survived another field edit, saved and full-page reloaded correctly. See later checkpoint; no timezone policy was introduced.
- [x] Frequent Item blank-input validation, synthetic free-text add and reload persistence: passed after user sign-in renewal; see resumed acceptance below.
- [ ] Formal Item reference acceptance; Quote workflows; destructive Visit/Audit acceptance remain pending.
- [x] Existing `validate_customer_related_mutations.py` passed source-contract and SQLite schema-semantics checks; `validate_customer_runtime_transport.py` passed Worker/D1 transport checks. These do not substitute for live-browser acceptance.
- [x] Historical validator reconciliation completed in GOV **1.1.12**: persistence check uses the actual combined `BD-021/022` Quote-history reference and is required by local source validation and Runtime Check. Historical preview-asset checks no longer require the retired route; documentation explicitly separates prototype proposals from current operational behavior. The earlier diagnosis linking this literal failure to BD-053 was imprecise: Quote-history BD-022 remains applicable, while BD-053 addresses ordinary-change Audit semantics.
- Screenshots include session display identity and remain private outside Public Git. No Visit deletion, authority change, Email send, cloud backup activation or production mutation was performed.
- [x] User renewed the expired development sign-in on 2026-10-02; the browser acceptance resumed successfully. User-owned R2/GCS setup remains deferred to the week beginning **2026-10-05**, and Email remains on the durable deferred checklist.


### Resumed Customer related browser acceptance — 2026-10-02 (Asia/Tokyo)

- Development remains **0.7.5 Build 0**. Only the existing synthetic Customer and synthetic related data were edited; no source/deployment/authority change or production write.
- The user completed development sign-in renewal. Existing profile revision 3 was loaded with all saved contact fields; a later full-page reload again preserved them.
- Created exactly one synthetic Visit using the existing synthetic contact and the unchanged default date `2026-10-01`. Readback showed the expected contact-name snapshot and revision 1. Content modification saved revision 2; full-page reload preserved the updated content and snapshot. This verifies default-date persistence, not manual date entry or a business timezone policy.
- Two real browser tabs then held Visit revision 2. The first saved different synthetic content at revision 3. The second attempted a stale revision-2 save and received “資料已被其他人修改，請重新載入後再操作。” Its displayed persisted row refreshed to revision 3. Cancelling the stale draft and full-page reloading retained the first tab's content at revision 3; the stale payload did not overwrite it. The temporary second tab was closed.
- Frequent Item: submitting blank input displayed “請選擇正式商品，或輸入未建檔品項；兩者擇一。” without adding a row. Adding one synthetic free-text item succeeded, cleared the input and displayed it as “未建檔自由文字”. Full-page reload followed by selecting Common Items retained that same row. No formal Item had to be fabricated for this check.
- Remaining independent work: manual Visit date entry, contact-rename snapshot behavior, formal Item/Quote references and workflows, destructive Visit/Audit acceptance, the other business-module workflows, historical-validator reconciliation, controlled multi-role coverage and Tablet/Mobile presentation. Do not check these off based on the desktop results above.
- No Visit/Common Item deletion, Email send, real customer/contact data, new credential or permission grant, cloud setup/activation or production mutation. Browser proof remains private outside Public Git. R2/GCS setup and Email keep their previously documented deferred status.


### Visit date/contact snapshot and Work Log checkpoint — 2026-10-02 (Asia/Tokyo)

- Development stays **0.7.5 Build 0**; documentation only, no code/deployment change.
- [x] Existing synthetic Visit: ordinary native date keyboard input changed its month/date to `2026-11-01`. Editing content did not reset the date. Save/readback produced revision 4 with the edited date; a later full-page reload retained it. Earlier direct automation-fill behavior is not evidence of an application defect. Business timezone policy and other date forms are not inferred from this single check.
- [x] Renamed the existing synthetic contact with a visible “改名後” marker; Customer saved revision 4. Existing Visit continued to display the original contact-name snapshot. Editing only that Visit's content while the contact selector displayed the renamed contact saved Visit revision 5 and retained the original snapshot; full-page reload preserved renamed Customer contact plus original Visit snapshot/date. New-Visit snapshot capture after rename remains untested.
- [ ] Formal Item/Quote acceptance prerequisite: the Item list is empty, the creation UI requires an existing SMART ERP item number, and Customer Quote creation is disabled without Item options. No Item, ERP item number or Quote was fabricated. Resume with a user-designated legitimate ERP acceptance item; do not bypass the existing formal-Item boundary. Free-text Frequent Item coverage remains separately accepted.
- [x] Created one synthetic Work Log using explicit `DEVELOPMENT_ACCEPTANCE` log/item type codes and synthetic content, leaving platform/categories unassigned. Default log/period date `2026-10-01`, work days 1. Create readback showed revision 1, ordinary draft content update showed revision 2, and full-page reload retained its content/date/type and draft state. Reviewed totals remained zero.
- [ ] Work Log submit/withdraw/review/unreview, stale-write rejection, configured platform/categories and multi-role boundaries remain pending. No review, score, other employee write or deletion was performed.
- Next independent work can continue with Work Log lifecycle/concurrency and historical-validator/documentation reconciliation. Other modules needing formal Items await an appropriate ERP acceptance fixture. Desktop results do not represent Tablet/Mobile real-device acceptance.

### Development acceptance fixture cleanup — pending after acceptance

- [ ] Once the remaining relevant acceptance is complete, inventory and review only the synthetic records created by this workline, including their current IDs, references and normal product deletion/recovery behavior. Record the reviewed cleanup result in Git without private identity or credential data.
- Current fixture scope: one Customer `CYWEB 驗收 20261001` at revision 4 with synthetic phone/contact/address/note; one linked synthetic Visit at revision 5; one free-text Frequent Item marked `Development 常用商品驗收（未建檔合成品項）`; one draft Work Log with type `DEVELOPMENT_ACCEPTANCE` and synthetic acceptance content at revision 2. No formal Item or Quote was created.
- [ ] Clean up the identified synthetic records in dependency order using supported product behavior; preserve required audit/history evidence and unrelated records. Any irreversible cleanup must obtain action-time confirmation before execution. This entry does not authorize broad database clearing.
- This workline used the existing sign-in account and created no acceptance account. If dedicated acceptance accounts are added later, add them explicitly to this inventory and review their cleanup separately; preserve existing users and authority records.
- This is development fixture cleanup, separate from clean-schema production provisioning. No production database change or blanket reset is authorized here. No cleanup has yet been executed. Email and user-owned R2/GCS setup remain deferred as previously recorded.


### Validation/documentation reconciliation — GOV 1.1.12, 2026-10-02

- Runtime source/development remains **0.7.5 Build 0**; this governance maintenance changes validation wiring/docs only. No deployment is required for these test/documentation changes.
- Customer persistence/related validation now reaches its existing isolated SQLite assertions: referenced Contact retention/deactivation, unchanged Visit person snapshot after Contact rename, formal/free-text Frequent Items and separate Quote-history records. The combined decision reference is `BD-021/022`, not a reinstatement of old Audit policy.
- Existing Runtime Check and `npm run validate:source` now execute that persistence validator. Retained related-preview asset validation is explicitly historical and no longer asserts a mounted preview route. No obsolete route or compatibility layer was restored.
- Customer foundation documentation now identifies the protected operational API as implemented. Historical related-UI documentation identifies Drawer/EntityPicker/repeated-price-break/on-demand proposals as preview evidence, not completed operational behavior. Current UI refinement remains pending.
- Local `validate_customer_persistence_related.py`, historical-preview asset check, full `npm run validate:source` and `git diff --check` passed. Local `validate:d1:local` could not start the Wrangler acceptance Worker: system error `uv_interface_addresses returned Unknown system error 1`. This environment failure is not an application acceptance result; required remote Runtime Check must validate the same isolated D1 suite before merge.
- Work Log acceptance coverage review: the existing isolated Worker/D1 suite exercises create/submit/review/cancel-review, stored finalized score/work-days/weighted statistics, clearing finalized fields and an exact three-event Audit sequence. This does not replace pending live browser lifecycle, stale-write, configuration or multi-role acceptance; those remain unchecked.
- Fixture cleanup, real ERP Item/Quote acceptance, Email, deferred R2/GCS setup and production readiness retain their previously documented status. No development fixture, account, credential, authority or production data was changed in this maintenance task.


### Work Log stale-write Audit correction — 0.7.6 Build 0, 2026-10-02

- SQLite reproduction confirmed the prior post-state-only Audit predicate could match another request's successful transition: a stale UPDATE changes zero rows, but the already-updated record can still match the expected next revision/status. This can append a success Audit for a write that did not succeed.
- Work Log transition/review/cancel-review Audit inserts now additionally require `changes() = 1` from their immediately preceding master UPDATE in the same D1 batch. Existing revision/status predicates remain in place. No retry, compatibility layer, schema change or new authority is added.
- Required isolated D1 acceptance now replays stale persistence writes after successful submit/review/cancel/withdraw and checks unchanged detail plus exact Audit counts. Service cases also cover stale versions, non-owner submit/withdraw/read, missing review capability, invalid-state withdraw and restricted cross-employee statistics.
- Positive lifecycle retains create/submit/review/cancel-review and adds owner withdrawal back to created with exactly one revision increase. Tests use only ephemeral isolated fixtures, not the existing development acceptance Customer/Work Log or real accounts.
- Local TypeScript and full source checks passed; SQLite demonstrated the old predicate accepting a stale write and the guarded predicate rejecting it. Remote Runtime Check must pass actual Worker/D1 acceptance before merge/deployment. Prior local Wrangler system-interface startup failure remains an environment limitation; no acceptance success is inferred from it.
- Current development remains **0.7.5 Build 0** until the separately tracked 0.7.6 development deployment passes source/consumer/D1 health. Live browser lifecycle/multi-role/device acceptance remains pending. Email, real ERP Item/Quote prerequisites, R2/GCS setup and fixture cleanup retain their earlier status.


### Priority follow-up — stale post-state gates in other domains

- [ ] Before broader inventory/business rollout, reproduce and correct stale-write side effects in other domains using isolated D1 fixtures. Source review found post-transition `nextRevision/status` gates in `worker/outsourcing/outsourcing-persistence.ts` and `worker/defect/defect-persistence.ts`, analogous to the Work Log predicate just corrected.
- Highest priority: Outsourcing outbound/receive/reversal side effects may include stock movements, not only duplicate Audit. Test a captured old state after a winning batch; verify zero extra movements/Audit and unchanged balances when the stale master update changes zero rows. Do not simply add `changes()` to every child insert: preceding statements differ, so each batch needs its own atomic success gate review.
- Review remaining Customer Quote and Sales Order Audit batch order as part of this focused follow-up. This checkpoint establishes the Work Log fix only; no blanket cross-module concurrency acceptance is claimed.
- Use existing isolated acceptance infrastructure and synthetic fixtures. No live inventory, payment, real business records or production resources were mutated while identifying these source patterns.


### Work Log correction release evidence — 0.7.6 Build 0

- [PR #109](https://github.com/simonliu1118-byte/chihyuan-web/pull/109), head `fac2bf81f5a3b6f5689cf7e8825cfe8132f60c27`, merged/deployed source `c9caacd2bab736e650884cf6030ccb32544ec2a2`. Remote source files were byte-reconciled. Governance `36957682253`, Runtime Check `36957682309` and deployment contract `36957682287` passed, including actual isolated Worker/D1 stale-replay/ownership/statistics assertions, TypeScript and build.
- [Development Deploy 36957832420](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/36957832420) **attempt 2 passed** exact CYID sync, migrations, deployment, source/consumer/D1 health, canonical Custom Domain and invalid Session fallback checks. Development now uses **0.7.6 Build 0**; backup activation/schedule remain disabled and deferred user cloud setup is unchanged.
- Attempt 1 deployed successfully but failed `DEPLOYED_SOURCE_CONSUMER_OR_D1_HEALTH_MISMATCH`; subsequent canonical/invalid-session checks were skipped. One same-source job rerun succeeded. There was no source change or version/Build increment for retry; the underlying health-gate failure cause is **not established**.
- [ ] Investigate the recurrent first-attempt deployment health-gate failure with bounded, non-secret diagnostics before the next deployment-maintenance change. Prior same-source success is not proof of propagation/network/D1 cause; do not add blind retries or compatibility wrappers as a substitute for diagnosis.
- The earlier “development stays 0.7.5 until deployment passes” entry records the pre-deployment checkpoint and is now superseded by this successful 0.7.6 release evidence. No live browser lifecycle or multi-role acceptance was completed during this backend regression task. Existing synthetic fixtures remain available and on their durable cleanup list.


### Outsourcing stale-write side effects — 0.7.7 Build 1, 2026-10-02

- Isolated SQLite executed the actual old/current confirmation SQL: winner plus stale replay previously produced two stock movements (40000 scaled4 total) instead of one; revised pre-state gates produce one movement (20000). No real inventory was used.
- Outsourcing confirm/correct/cancel outbound, receive/cancel receipt, price/cancel pricing, paid/cancel payment now gate all child/Audit statements on the original revision/status in a single atomic D1 batch, advancing the master last through one persistence transaction helper. Cancellation receipt/pricing child deletions also have the exact pre-state gate.
- Required isolated Worker/D1 suite now tests every transition's winning revision/status and one Audit, then replays its captured stale state and compares full master/parts/movements/receipts/pricing/Audit snapshots. Re-price/re-receive cases replay old cancellation after new data exists, and final inventory returns to zero.
- Local TypeScript, full source checks and diff whitespace passed. Actual-source SQLite proves the duplicate-stock regression and corrected behavior. Required remote Runtime Check must pass actual isolated D1 tests before merge/deployment; no live inventory/payment, acceptance fixture, account or production mutation was made.
- Development remains **0.7.6 Build 0** until controlled 0.7.7 deployment health and consumer checks succeed. Remaining priority: Defect and other-domain post-state Audit review, recurring first-attempt deployment health diagnosis, and pending live browser/multi-role/device acceptance. ERP, Email, deferred cloud setup and fixture cleanup retain their existing prerequisites/status.

- Initial PR #111 Runtime Check `36959676673` exposed the pre-existing receipt-cancellation foreign-key failure: retained consumption movements prevented deleting the active receipt projection. Build 1 retains original quantities/order/reversal links, records full receipt and movement IDs in Audit, and gates nullable receipt-link removal before active projection deletion. New isolated D1 assertions verify ledger preservation and stale cancellation leaves a recreated receipt fully unchanged. Remote validation remains required.


### Outsourcing correction release evidence — 0.7.7 Build 1

- [PR #111](https://github.com/simonliu1118-byte/chihyuan-web/pull/111), accepted head `093cc45cfe3d22c9d19c8b68f88586a6ad166d8e`, merged/deployed source `17a1ecb9a69a958cbdce40fda9aa974f3f798d42`. All nine published files were byte-reconciled against local and merged source. Governance `36959955112`, Runtime Check `36959955125`, and development deployment contract `36959955076` passed. Actual isolated Worker/D1 tests include all nine winner/stale transitions, unchanged snapshots on stale requests, recreated receipt/pricing preservation, one Audit per winner, cancelled receipt ledger preservation and zero final stock balance; TypeScript and build passed.
- [Development Deploy 36960087693](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/36960087693) **attempt 2 passed** exact canonical CYID consumer sync/support window, migrations, deployment, canonical and workers.dev source/consumer/D1 health, canonical Custom Domain and invalid Session fallback checks. Development is **0.7.7 Build 1**. Backup activation and schedule remain disabled; deferred R2/GCS setup is unchanged.
- Attempt 1 uploaded the Worker but failed `DEPLOYED_SOURCE_CONSUMER_OR_D1_HEALTH_MISMATCH`; canonical/invalid-session acceptance was skipped. One same-source job rerun succeeded; this retry did not increment version/Build. The first-attempt failure remains unexplained, consistent with the earlier recurrence. The pending bounded non-secret deployment-health diagnosis is still open; no propagation/network/D1 cause or blanket stability claim is inferred.
- [x] Outsourcing stale-effect correction and isolated D1 acceptance completed. Earlier pending cross-domain review is now partially fulfilled for Outsourcing; **Defect, Sales Order and Customer Quote remain to be reviewed**. No live inventory/payment or production mutation occurred; browser/multi-role/device acceptance and existing live fixture cleanup remain pending.
- The earlier statements that remote validation is required and development stays at 0.7.6 describe pre-validation checkpoints; this release evidence supersedes them. Email acceptance, legitimate ERP Item/Quote prerequisites, user cloud setup and cleanup retain the durable lists above. No new account was created and no existing acceptance fixture was deleted.


### Defect stale-write Audit correction — 0.7.8 Build 0, 2026-10-02

- Actual-source isolated SQLite reproduction confirmed both transition and invalidation accepted an earlier winner's resulting revision/state as Audit permission. Winner + stale master updates changed `[1, 0]` rows but produced two Audit events. The corrected immediately-preceding-update `changes() = 1` predicate produces one event in both cases; identical invalidation timestamps deliberately exercise the regression.
- Transition/invalidation Audit now requires its own successful master UPDATE and expected resulting revision/state in the same atomic D1 batch. Ordinary update and pre-state-gated delete remain unchanged. No schema, authority, retry or compatibility layer was added.
- Required isolated Worker/D1 acceptance adds created → processing → resolved → reopened lifecycle, captured-state persistence replays/full record+Audit snapshot equality, stale service conflicts, processing/resolved invalidation and invalid visibility/edit restrictions, resolved edit rejection, unauthorized delete, stale delete after ordinary edit, creator delete and deleted-state replay. Positive operations check exact revision/state and ordered Audit actions. Uses ephemeral synthetic fixtures only; no live acceptance/account or business record mutation.
- Local TypeScript, full source checks and diff whitespace passed. Actual isolated D1 Runtime Check must pass before merge/deployment. Development remains **0.7.7 Build 1** until controlled 0.7.8 deployment health/consumer acceptance completes.
- Sales Order source review confirms ERP fill/correction and status Audit use the same post-state-only predicate; dedicated reproduction/correction/isolated D1 acceptance remains the next focused task. Customer Quote review/acceptance remains pending. Recurrent deployment health-gate diagnosis, live browser/multi-role/device acceptance, Email, ERP prerequisites, deferred R2/GCS and fixture cleanup retain their durable status.

- Initial Defect Runtime Check `36962682812` failed in the acceptance runner, not a reported assertion: its first fixture-writing request returned HTTP 200 after 2651ms, but the runner's two-second read timeout initiated another request, yielding duplicate `app_members.id`. Independent governance PR #114 fixes readiness/execution separation and terminal execution failures; Defect source remains 0.7.8 Build 0 while complete remote CI must be rerun on the corrected harness before merge.
- Customer Quote source review: correction Audit uses a pre-state revision gate, but price-break DELETE/INSERT uses a post-state next revision + updater/timestamp gate. Captured stale requests with the same actor/time may therefore rewrite price breaks despite a zero-row master UPDATE; explicit reproduction and correction remain pending (no blanket Quote acceptance is claimed).


### Defect acceptance and development release evidence — 0.7.8 Build 0

- [PR #113](https://github.com/simonliu1118-byte/chihyuan-web/pull/113), accepted head `60757206e8e9c9742be9bdb9ea49674df0ef09d8`, merged/deployed source `6a17efcfed8ec2c005e7bd7bfde42c1752c4eca1`. Source/merged bytes were reconciled. Governance `36963239597`, Runtime Check `36963239567`, and deployment contract `36963239596` passed. Actual isolated Worker/D1 lifecycle, stale persistence replays, identical-time invalidations in both underlying statuses, full master/Audit preservation, exact Audit actions, stale service conflicts and edit/delete/visibility boundaries passed, along with TypeScript and build. This supersedes the earlier pre-validation statements; no live browser acceptance is claimed.
- [Governance PR #114](https://github.com/simonliu1118-byte/chihyuan-web/pull/114), head `d12da937bde265877195f00c8beddd3237d39ee7`, merged `c7c08cbeb8fcbf7eb549323c17b4668d6d5f1e66`, advances Governance to **1.1.13**. Governance `36963079188` and Runtime `36963079164` passed; readiness probes are non-mutating and acceptance executes once with a 60-second bound. Success, timeout, malformed JSON and HTTP-failure regression cases are now required before real D1 execution. Initial run `36962682812` reported duplicate fixtures only after replaying an already-successful request exceeding its former two-second timeout; this harness failure is corrected, independently of the application fix.
- [Development Deploy 36963388836](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/36963388836) **attempt 2 passed** exact CYID canonical sync/support window, migrations, source build/deploy, canonical/workers.dev source/consumer/D1 health, canonical Custom Domain and invalid-provider-session fallback. Development now uses **0.7.8 Build 0**. Backup activation/schedule remain disabled; no cloud setup, grant, account or production rollout was performed.
- Attempt 1 uploaded the Worker and then failed `DEPLOYED_SOURCE_CONSUMER_OR_D1_HEALTH_MISMATCH`; subsequent canonical/invalid-session acceptance was skipped. One same-source job rerun passed, with no application/Governance version change for the retry. The recurrent deployment-health failure is **still unexplained** and separate from the now-fixed isolated-test timeout. Bounded non-secret diagnostics remain pending; do not claim a propagation/cache/network/D1 cause without evidence or add blind automatic retries.
- [x] Defect stale Audit correction and isolated D1 acceptance completed. Work Log and Outsourcing corrections retain their prior accepted evidence. Next focused work: Sales Order ERP/status stale Audit, then Customer Quote post-state price-break mutation; both still require reproduction/fix/isolated D1 acceptance. Recurrent deployment-health diagnosis remains open before deployment-maintenance changes.
- All live fixtures remain on the existing cleanup list and were not modified/deleted this task. Live browser lifecycle/multi-role/device acceptance, Email, legitimate ERP Item/Quote prerequisites and deferred R2/GCS manual setup retain the durable lists above. No new account was created.

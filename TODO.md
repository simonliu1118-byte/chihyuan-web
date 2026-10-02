# CY Web TODO

> 本文件只保存目前狀態、驗收證據與待辦，不是永久規則來源。舊版本逐輪紀錄以 Git history 追溯；業務規則與架構參照既有 canonical 文件，不另建交接或規則層。

## 目前基準 — 2026-10-03（Asia/Tokyo）

- 已接受並部署：**Development 0.7.13 Build 0**，source `332bb2694a239cc22f3379a25adac4ab916f25cb`，Development run `37008551551` attempt 1。兩個入口首次觀察都符合版本／commit／consumer／D1，427ms。
- 本輪工作分支：**0.7.14 Build 0**，補委外完整 protected HTTP 流程驗收並收斂本文件；尚未取得遠端驗收／合併／部署證據，不代表 Development 已升版。
- CYID source/development **0.3.5 Build 0**；shared Consumer **1.0.2**，minimum **1.0.0**。`docs/contracts/cyid/` 依 canonical manifest exact-sync，支援窗及同步 gate 保留。
- 固定入口 `https://admin.chihyuancm.com` 目前仍為 CY Web Development；CYID production provider 已完成不代表 CY Web production 已上線。
- 六個業務模組及 Settings/Audit 使用單一 React → protected Worker API → D1。舊 local business authority、Group proxy、activation 入口與重複 local pages 已退休；無另加版本殼。
- 備份／isolated recovery 工程已實作；實際雲端備份及排程仍未啟用。Production 業務資料 cutover 尚未執行。

## 後續順序

1. [ ] 補齊可獨立完成的完整業務 HTTP／service／D1 驗收：實際欄位解析、重要計算、正反狀態、舊版本衝突、權限與精確 Audit。每批保存成功證據，不以重點案例冒充全部完成。
2. [ ] 自動驗收準備完成後，進入使用者統一人工驗收、UI／UX 調整及小幅功能新增階段。新增功能待使用者具體指定，採既有共用元件與單一 runtime。
3. [ ] 完成下方人工／Email／ERP／雲端項目後，核對第一版 readiness、測試資料清理及乾淨 production schema；使用者確認後才上線。這項順序確認不代表立即 production 部署批准。
4. [ ] CYInvoice 到適合接入點時，依 CYID canonical standard 產出 consumer-specific handoff；不順手修改另一工作線的 CYACC／CYInvoice。

## 已接受的工程與驗收範圍

| 範圍 | 已通過 | 尚不能視為完成 |
| --- | --- | --- |
| Identity | 單一登入、first-login ticket 與 normal Session 分離、設定正式密碼後要求重新登入；consumer exact-sync；invalid provider Session fallback | 實際 Email 收信／完整首次登入、跨角色／撤權／Session 的真人瀏覽器驗收 |
| 六模組 HTTP 權限 | 未登入、無 Module Access、grant revoke/restore、Role 不改 grants、inactive member、provider invalid/unavailable、body 權限偽造拒絕；實際 routes/services/D1 | provider 為 isolated stub，不等於真實 CYID／瀏覽器全流程 |
| Customer / Quote | persistence／related schema、Contact retention、Visit snapshot、Frequent Item、Quote 新歷史；Quote stale correction、精確 price breaks、Audit、原子 rollback | 正式 Item／Quote 真人流程需合法 ERP 品項；完整畫面流程仍待人工確認 |
| Item / Defect | Item 精確單位換算；Defect processing/resolved/reopen/invalidate、stale／delete／Audit service 驗收，HTTP creator 與 ADMIN 刪除界線 | 真實正式 Item、完整 lifecycle 畫面及裝置驗收 |
| Sales Order | ERP fill/correction、waiting/pick/ship/reversal/void、draft edit/delete、stale snapshot 及精確 Audit；HTTP 主要生命週期 | 合法 ERP 參考及真實多角色／畫面驗收 |
| Outsourcing | 全九種 persistence 轉換／stale replay、庫存與 receipt/pricing ledger preservation；取消後重建資料不被舊請求改動 | 完整 protected HTTP 計算／BOM／計價／反轉本輪 local D1 通過，遠端待驗；真人流程未完成 |
| WorkLog | service lifecycle、併發／Audit；HTTP owner、非 owner、ADMIN review、revoked-access 邊界 | 完整畫面、統計與設定組合及真人多角色 |
| Backup / recovery | separate migrated D1 還原、FK／duplicate rollback、immutable copies、catalog/retry/retention、ephemeral R2；GCS 使用模擬 HTTP | 真實 GCS/R2 及排程、獨立 DR、實際 SUPER_ADMIN 畫面驗收 |
| ID / Audit | 九種 standalone entity 刪除後不重用 ID；migration backfill／rollback／備份還原後分配及 exact entity-key history | 無法推斷未留證據的舊 ID，也未重寫既有可能混淆的 Audit |

### 已觀察的 Desktop browser 結果

- 既有 SUPER_ADMIN 登入後模組／Settings／Audit 頁面載入；forgot-password 返回登入導覽通過，未寄信。
- Customer 建立／欄位儲存／reload、兩頁籤 stale save 拒絕通過。Customer 單列過高問題已修，673.9px pane 中 row 回到 70px。
- Visit 建立／編輯／reload／兩頁籤 stale 拒絕；原生鍵盤日期 `2026-11-01` 保留；Contact 改名及 Visit 再編輯後仍保留原 snapshot。改名後新 Visit capture 尚待測。
- Frequent Item 空白拒絕／自由文字新增／reload；WorkLog draft 建立／編輯／reload 通過。未建立正式 Item／Quote。
- 以上只涵蓋已觀察的 Desktop 與既有帳號，不外推其他角色或 Tablet/Mobile。

## 部署觀察保留事項

- [ ] 持續保留 recurrent first-attempt health mismatch 診斷。0.7.10 與 0.7.12 曾觀察入口先回舊 source，於同一次部署後 13598ms／14586ms 轉為新 source，無再次 deploy；Cloudflare 內部原因仍未建立。
- 現有 gate 在 90 秒內只讀觀察兩入口的 allowlisted version／commit／consumer／D1，無自動 redeploy。0.7.13 首次觀察成功不表示歷史問題已根治。
- acceptance runner 原二秒 timeout 會重送已成功 fixture 寫入的原因已修正：readiness 不寫入、正式 acceptance 單次執行與 60 秒 bound；不保留舊 replay 做法。

## 需要使用者完成及暫緩事項

- [ ] **Email（使用者明確延後）**：指定未被 Employee 使用的受控信箱及授權建立／寄信，再測首次密碼 → 正式密碼 → 返回登入 → 重新登入、逾期／重寄／pending Email edit／舊 ticket 失效、寄送失敗、activated recovery／forgot-password／own Email。密碼由使用者透過登入 handoff 輸入。
- [ ] **ERP**：使用者指定合法 SMART ERP 驗收品項及參考；不捏造 live 正式 Item／ERP 交易。
- [ ] **雲端**：使用者將 development R2/GCS resource／bucket IAM／GitHub environment variables 與 secret 設定延至 **2026-10-05 起的一週**。完成後只回報完成，不提供憑證內容。
- 雲端操作步驟沿用 [既有 deployment 文件](docs/architecture/CLOUDFLARE_PUBLIC_DEPLOYMENT_PRINCIPLES.md#development-backup-manual-setup-and-handback)。App-owned buckets／credentials 與 CYACC 分離；策略 R2 每日臺灣 03:30／30 天、GCS 臺灣週三／週日／182 天，同一份 portable bytes 複製兩邊。
- 使用者完成設定後，先 manual-only 接續驗收，再啟用排程；不因等待這些項目停止獨立工程工作。

### Remaining live cloud acceptance

- [ ] Confirm development has dedicated app-owned R2/GCS buckets, suitable bucket-only service-account permissions, no external R2 overwrite writer, and protected deployment inputs. No CYACC storage/credentials sharing.
- [ ] Deploy with `CF_BACKUP_ENABLED=true` and `CF_BACKUP_SCHEDULE_ENABLED=false`; verify Super Admin manual controls become available and other roles remain denied.
- [ ] Run manual backup; verify actual R2/GCS readback, identical data/manifest SHA and backup event, and non-secret catalog/audit results.
- [ ] Controlled GCS failure/retry: verified R2 remains intact; retry copies the same immutable event bytes and creates no new snapshot.
- [ ] Real isolated recovery: selected cloud backup plus both verified pre-restore safety copies; empty migrated target, record/byte reconciliation, source unchanged and structured audit. Never target the live business D1.
- [ ] After manual/recovery acceptance, explicitly enable schedule; verify Taiwan dates, daily R2, Wednesday/Sunday GCS, 30/182-day retention and pending-GCS R2 protection.
- [ ] Record actual deployment run and acceptance outcome here using non-sensitive status only. Production CY Web activation remains a separate rollout.

### Consolidated manual acceptance — user will review after automated acceptance

The user requested automated acceptance first, followed by one combined manual review/adjustment round. Keep the following items pending until observed; automated checks do not mark them complete.

| Area | Manual confirmation still required | Prerequisite / retained scope |
| --- | --- | --- |
| Core account / CYID | Login/logout, expired/revoked Session, self-service and return-to-login behavior | Existing authorized acceptance accounts; no new live account or authority grant by this task |
| Role / Module Access | USER, ADMIN, Identity Admin and SUPER_ADMIN presentation; grant revoke/restore and role change in real browser | Controlled existing-account coverage; avoid unapproved live authority changes |
| Customer | Create/edit/search, contact/Visit snapshots and dates, Frequent Items, Quote new-history/correction/Audit | Existing synthetic fixtures retained; formal Item/Quote needs a user-designated legitimate SMART ERP item |
| Item / Defect | Formal Item fields, exact units/prices, Defect lifecycle and administrative controls | Legitimate ERP acceptance references; no fabricated live formal Item |
| Sales Order | Draft, ERP fill/correction, waiting/picking/shipping/reversal/void and permission feedback | Legitimate ERP references and controlled synthetic workflow |
| Outsourcing | Contractor/BOM, outbound/receipt/pricing/payment and reversals with stock/Audit readback | Controlled synthetic workflow; no real inventory/payment mutation |
| WorkLog | Owner CRUD/submit/withdraw, ADMIN review/cancel-review, statistics and readback | Controlled synthetic workflow and existing-account role coverage |
| Settings / Audit | Editable settings, read-only Audit search and actor/reason details | Existing permissions; no production settings change |
| Desktop / Tablet / Mobile | Density, navigation, forms, scrolling, selection, error/loading and touch/keyboard behavior | User's real devices; record requested adjustments in this same durable TODO |
| Email | Verification, resend/expiry, password reset/recovery and real mail delivery | Explicitly deferred by user; do not send Email during this automated round |
| Backup / recovery | R2/GCS credentials/setup, protected history/create, restore/rehearsal and scheduler acceptance | User manual setup deferred to week of 2026-10-05; no backup activation/schedule or production restore |
| Acceptance cleanup / production | Review fixture/account inventory, then approved cleanup and final launch gates | Existing durable cleanup list; no deletion before acceptance or automatic production cutover |

## 上線前暫時保留 — 用途與結束條件

- 測試資料及清理清單只為開發驗收與後續核對保留；不是 production seed 或另一份正式資料來源。完成相關驗收後核對清單，再經不可逆清理的當次確認移除。
- isolated acceptance source 為可重建 CI 驗證，fixture 僅存在臨時 D1，不隨 production 部署建立；不因清理 live fixture 移除有用的 regression tests。
- 未完成的人工／雲端／Email gate 保留到取得實測結果；完成後更新此文件，不另外新增狀態文件或永久例外規則。
- 舊 GAS／Sheet 只保留作參考，直到使用者確認新系統穩定後再決定停用／刪除；不把舊測試資料搬入 production。

### Development acceptance fixture cleanup — pending after acceptance

- [ ] Once the remaining relevant acceptance is complete, inventory and review only the synthetic records created by this workline, including their current IDs, references and normal product deletion/recovery behavior. Record the reviewed cleanup result in Git without private identity or credential data.
- Current fixture scope: one Customer `CYWEB 驗收 20261001` at revision 4 with synthetic phone/contact/address/note; one linked synthetic Visit at revision 5; one free-text Frequent Item marked `Development 常用商品驗收（未建檔合成品項）`; one draft Work Log with type `DEVELOPMENT_ACCEPTANCE` and synthetic acceptance content at revision 2. No formal Item or Quote was created.
- [ ] Clean up the identified synthetic records in dependency order using supported product behavior; preserve required audit/history evidence and unrelated records. Any irreversible cleanup must obtain action-time confirmation before execution. This entry does not authorize broad database clearing.
- This workline used the existing sign-in account and created no acceptance account. If dedicated acceptance accounts are added later, add them explicitly to this inventory and review their cleanup separately; preserve existing users and authority records.
- This is development fixture cleanup, separate from clean-schema production provisioning. No production database change or blanket reset is authorized here. No cleanup has yet been executed. Email and user-owned R2/GCS setup remain deferred as previously recorded.

## 本輪 local 驗收 — 0.7.14 Build 0

- 委外 HTTP 建立 Contractor／BOM／Current Price → 建單 → 確認出庫 → ADMIN 修正 → 入庫 → 計價 → 付款 → 撤銷付款／計價／入庫／出庫通過。CASE 轉 24 EA，2 CASE 出庫 48 EA，3 成品依 BOM 耗料 6 EA，3 × 1.25 = 3.75，最終庫存歸零。
- 九種轉換舊 revision 重送均回 409，完整 business/config/Audit snapshot 不變；USER body 偽造不能修正／取消出庫或刪除，ADMIN 不能硬刪已出庫單，未逆付款不能撤銷計價／入庫，精確九筆 Audit 及 server actor 通過。
- Local actual Worker/D1 全套、七 migration／48 tables、TypeScript、source validation 及 whitespace 通過。只在 scratch 使用既有 host loopback shim；未提交或供 CI／部署使用。遠端必要檢查尚未完成。
- 本輪未操作 live fixture／帳號、真實 ERP／庫存／付款、Email、權限或雲端設定。

## 目前已接受版本的證據

### Retired identity release acceptance — 0.7.13 Build 0

- [PR #124](https://github.com/simonliu1118-byte/chihyuan-web/pull/124) accepted head `e36727cb7d26e0c61cd9ab11c906b65494af89ac`; merged source `332bb2694a239cc22f3379a25adac4ab916f25cb`. All 25 changed source/schema/document blobs reconciled exactly before merge; local merged tree matches accepted remote source. No governance/Identity/other-App rules changed.
- Required unmodified remote checks passed without source/job retry: Governance `37008313399`, Runtime `37008313258` (actual isolated Worker/D1 nine-entity retirement/rollback/restored-allocation/Audit-isolation plus domain/HTTP/portable/tiered/isolated-recovery acceptance and Vite build), deployment contract `37008313232`. Schema validation also verifies nonempty old-schema migration preserves business rows/events, backfills an audited deleted ID, ignores nonnumeric keys, never lowers retirement and rolls back with deletion; fresh targets remain empty.
- [Development Deploy 37008551551](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/37008551551) **attempt 1 passed** exact CYID canonical sync/support window, all seven migrations including `0007_retired_entity_ids`, build/deploy, source/consumer/D1 health, canonical Custom Domain and invalid-provider-Session fallback. Both origins returned `0.7.13`, exact source commit `332bb2694a239cc22f3379a25adac4ab916f25cb`, consumer `1.0.2`, database `ok` on first observations; total health **427ms**, `exceededFormerWindow:false`. Development is **0.7.13 Build 0**.
- [x] The focused newly-created-entity ID reuse / mixed Audit association blocker is resolved for the nine canonical standalone create paths. The earlier open-blocker/development-0.7.12 checkpoints are superseded. The exact full Sales entity-key history assertion now passes without an event-ID filter, and restored identities cannot inherit the deleted predecessor's Audit.
- Existing IDs, business fixtures, accounts and historical Audit were not rewritten/deleted. Development applied the forward schema/watermark migration; it does not infer unrecorded historical identities or repair already ambiguous events. Production was not deployed. Backup credentials/activation/schedule, Email, cloud provisioning and authority remain unchanged.
- Full live six-module workflows, real Identity/multi-role/browser/device acceptance, legitimate ERP Item/Quote references, deferred Email and week-of-2026-10-05 R2/GCS setup, production readiness and existing fixture cleanup retain the consolidated manual/pending lists above. The user will review and request UI adjustments in one later manual round; no manual acceptance is inferred from this automated correction.

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

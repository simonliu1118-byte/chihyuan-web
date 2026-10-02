# CY Web TODO

> 本文件只保存目前狀態、驗收證據與待辦，不是永久規則來源。舊版本逐輪紀錄以 Git history 追溯；業務規則與架構參照既有 canonical 文件，不另建交接或規則層。

## 目前基準 — 2026-10-03（Asia/Tokyo）

- 已接受並部署：**Development 0.7.15 Build 0**，source `d0f380c4492795fb1c939559b657c586cf163d2b`，Development run `37027810625` attempt 1。兩入口在同一次部署的 32620ms 內符合版本／commit／consumer／D1，無 redeploy。
- Source **0.7.15 Build 0** 已合併並部署，補 WorkLog 完整流程／統計與 Customer／Item／Quote／Defect HTTP lifecycle；本輪獨立自動驗收準備完成，進入 UI／UX 與小功能整理階段。
- CYID source/development **0.3.5 Build 0**；shared Consumer **1.0.2**，minimum **1.0.0**。`docs/contracts/cyid/` 依 canonical manifest exact-sync，支援窗及同步 gate 保留。
- 固定入口 `https://admin.chihyuancm.com` 目前仍為 CY Web Development；CYID production provider 已完成不代表 CY Web production 已上線。
- 六個業務模組及 Settings/Audit 使用單一 React → protected Worker API → D1。舊 local business authority、Group proxy、activation 入口與重複 local pages 已退休；無另加版本殼。
- 備份／isolated recovery 工程已實作；實際雲端備份及排程仍未啟用。Production 業務資料 cutover 尚未執行。

## 後續順序

1. [x] 本輪獨立自動驗收準備完成：六模組 protected HTTP／service／D1 的規劃案例、實際欄位解析、重要計算、正反狀態、舊版本衝突、權限與精確 Audit 已通過 local 與 required GitHub checks。這不代表所有可能組合、真實服務／多角色／裝置已完成。
2. [ ] **目前階段：使用者統一人工驗收、UI／UX 調整及小幅功能新增。** 新增功能待使用者具體指定，採既有共用元件與單一 runtime；新增／調整後執行適用回歸驗收。
3. [ ] 完成下方人工／Email／ERP／雲端項目後，核對第一版 readiness、測試資料清理及乾淨 production schema；使用者確認後才上線。這項順序確認不代表立即 production 部署批准。
4. [ ] CYInvoice 到適合接入點時，依 CYID canonical standard 產出 consumer-specific handoff；不順手修改另一工作線的 CYACC／CYInvoice。

## UI／UX 與小功能階段的工作範圍

- [ ] 依統一人工清單收集實際操作與畫面問題，回寫本文件，不另建平行進度表。
- [ ] 優先調整共用 navigation、清單密度、表單／明細、dialog/drawer、loading/error/empty feedback 及鍵盤／觸控；Desktop/Tablet/Mobile 維持同一資料與權限契約。
- [ ] 低風險 optimistic interaction 依既有方向逐項檢視；刪除、權限／credential、financial/inventory 等高風險操作不先呈現成功。
- [ ] 使用者提出小功能後記錄需求與驗收條件，再開獨立工作項目；不自行假設第一版要增加什麼。
- [ ] 每批 UI／功能變更跑適用 automated regression，真人/裝置 checklist 仍須實際確認。

## 已接受的工程與驗收範圍

| 範圍 | 已通過 | 尚不能視為完成 |
| --- | --- | --- |
| Identity | 單一登入、first-login ticket 與 normal Session 分離、設定正式密碼後要求重新登入；consumer exact-sync；invalid provider Session fallback | 實際 Email 收信／完整首次登入、跨角色／撤權／Session 的真人瀏覽器驗收 |
| 六模組 HTTP 權限 | 未登入、無 Module Access、grant revoke/restore、Role 不改 grants、inactive member、provider invalid/unavailable、body 權限偽造拒絕；實際 routes/services/D1 | provider 為 isolated stub，不等於真實 CYID／瀏覽器全流程 |
| Customer / Quote | persistence／related schema、Contact retention、Visit snapshot；HTTP Visit/Frequent Item create/edit/delete、stale；Quote HTTP 新歷史／correct/stale／精確 price breaks／Audit、原子 rollback | 正式 Item／Quote 真人流程需合法 ERP 品項；完整畫面流程仍待人工確認 |
| Item / Defect | Item HTTP create/edit/renumber/stale／number Audit、精確成本／單位換算；Defect HTTP processing/resolved/reopen/invalidate/stale／Audit，creator 與 ADMIN 刪除界線 | 真實正式 Item、完整 lifecycle 畫面及裝置驗收 |
| Sales Order | ERP fill/correction、waiting/pick/ship/reversal/void、draft edit/delete、stale snapshot 及精確 Audit；HTTP 主要生命週期 | 合法 ERP 參考及真實多角色／畫面驗收 |
| Outsourcing | 全九種 persistence 轉換／stale replay、庫存與 receipt/pricing ledger preservation；取消後重建資料不被舊請求改動 | 完整 protected HTTP 計算／BOM／計價／反轉遠端已通過；真人流程未完成 |
| WorkLog | service lifecycle、併發／Audit；HTTP CRUD/submit/withdraw/review/cancel-review／statistics、cascade、精確 actor 與 stale；owner、非 owner、ADMIN／revoked-access 邊界 | 完整畫面、統計與設定組合及真人多角色 |
| Backup / recovery | separate migrated D1 還原、FK／duplicate rollback、immutable copies、catalog/retry/retention、ephemeral R2；GCS 使用模擬 HTTP | 真實 GCS/R2 及排程、獨立 DR、實際 SUPER_ADMIN 畫面驗收 |
| ID / Audit | 九種 standalone entity 刪除後不重用 ID；migration backfill／rollback／備份還原後分配及 exact entity-key history | 無法推斷未留證據的舊 ID，也未重寫既有可能混淆的 Audit |

### 已觀察的 Desktop browser 結果

- 既有 SUPER_ADMIN 登入後模組／Settings／Audit 頁面載入；forgot-password 返回登入導覽通過，未寄信。
- Customer 建立／欄位儲存／reload、兩頁籤 stale save 拒絕通過。Customer 單列過高問題已修，673.9px pane 中 row 回到 70px。
- Visit 建立／編輯／reload／兩頁籤 stale 拒絕；原生鍵盤日期 `2026-11-01` 保留；Contact 改名及 Visit 再編輯後仍保留原 snapshot。改名後新 Visit capture 尚待測。
- Frequent Item 空白拒絕／自由文字新增／reload；WorkLog draft 建立／編輯／reload 通過。未建立正式 Item／Quote。
- 以上只涵蓋已觀察的 Desktop 與既有帳號，不外推其他角色或 Tablet/Mobile。

## 部署觀察保留事項

- [ ] 持續保留 recurrent first-attempt health mismatch 診斷。0.7.10、0.7.12、0.7.14 與 0.7.15 曾觀察入口先回舊 source，於同一次部署後 13598ms／14586ms／20910ms／32620ms 轉為新 source，無再次 deploy；Cloudflare 內部原因仍未建立。
- 現有 gate 在 90 秒內只讀觀察兩入口的 allowlisted version／commit／consumer／D1，無自動 redeploy。0.7.13 首次觀察成功不表示歷史問題已根治。
- acceptance runner 原二秒 timeout 會重送已成功 fixture 寫入的原因已修正：readiness 不寫入、正式 acceptance 單次執行與 60 秒 bound；不保留舊 replay 做法。

## 需要使用者完成及暫緩事項

- [ ] **Email（使用者明確延後）**：指定未被 Employee 使用的受控信箱及授權建立／寄信，再測首次密碼 → 正式密碼 → 返回登入 → 重新登入、逾期／重寄／pending Email edit／舊 ticket 失效、寄送失敗、activated recovery／forgot-password／own Email。密碼由使用者透過登入 handoff 輸入。
- [ ] **ERP**：使用者指定合法 SMART ERP 驗收品項及參考；不捏造 live 正式 Item／ERP 交易。
- [ ] **雲端**：使用者將 development R2/GCS resource／bucket IAM／GitHub environment variables 與 secret 設定延至 **2026-10-05 起的一週**。完成後只回報完成，不提供憑證內容。
- 雲端操作步驟沿用 [既有 deployment 文件](docs/architecture/CLOUDFLARE_PUBLIC_DEPLOYMENT_PRINCIPLES.md#development-backup-manual-setup-and-handback)。App-owned buckets／credentials 與 CYACC 分離；策略 R2 每日臺灣 03:30／30 天、GCS 臺灣週三／週日／182 天，同一份 portable bytes 複製兩邊。
- 使用者完成設定後，先 manual-only 接續驗收，再啟用排程；不因等待這些項目停止獨立工程工作。

### 真實雲端驗收清單

- [ ] 專屬 development R2/GCS buckets、bucket-only service account、R2 無外部覆寫來源、protected deployment inputs；不得共用 CYACC storage/credentials。
- [ ] 先 `CF_BACKUP_ENABLED=true`／`CF_BACKUP_SCHEDULE_ENABLED=false` 部署，確認 SUPER_ADMIN manual controls 與其他角色拒絕。
- [ ] 真實 manual backup：兩邊 readback、相同 bytes/manifest SHA／backup event、非敏感 catalog/Audit。
- [ ] 受控 GCS failure/retry：verified R2 保留，重試只複製同一 immutable event bytes，不建立新 snapshot。
- [ ] 真實 isolated recovery：選定 cloud backup、兩邊 verified safety copies、空的 migrated target、record/byte reconciliation、source 不變與 structured Audit；不得以 live business D1 為 target。
- [ ] manual/recovery 通過後再明確啟用排程，驗證臺灣日期、每日 R2／週三週日 GCS、30/182-day retention 與 pending replica 保護。
- [ ] 就地記錄實際 run／結果，production activation 另行處理。

### 統一人工驗收清單

使用者安排在自動驗收後集中操作及調整；以下須實際觀察，不以自動檢查代替。

| 範圍 | 人工確認 | 前提與保留界線 |
| --- | --- | --- |
| 核心帳號 / CYID | 登入/登出、Session 逾期/撤銷、self-service、返回登入 | 既有受控帳號；不自行新增帳號或授權 |
| Role / Module Access | USER/ADMIN/Identity Admin/SUPER_ADMIN 畫面、撤權/恢復/角色變更 | 受控帳號，不執行未指定的 live 權限變更 |
| Customer | 建立/編輯/搜尋、Contact/Visit snapshot/日期、Frequent Item、Quote 新歷史/更正/Audit | 保留既有 synthetic fixtures；正式 Item/Quote 需合法 ERP 品項 |
| Item / Defect | 正式欄位、單位/價格精度、Defect 狀態與管理操作 | 合法 ERP 參考，不捏造 live 正式 Item |
| Sales Order | Draft、ERP fill/correction、waiting/picking/shipping/reversal/void、權限提示 | 合法 ERP 參考與受控 synthetic workflow |
| Outsourcing | Contractor/BOM、outbound/receipt/pricing/payment 及反轉、stock/Audit readback | 受控 synthetic workflow，不異動真實庫存/付款 |
| WorkLog | owner CRUD/submit/withdraw、ADMIN review/cancel-review、statistics/readback | 受控 synthetic workflow 與既有帳號 |
| Settings / Audit | 編輯 settings、唯讀 Audit search、actor/reason | 既有權限，不改 production settings |
| 電腦 / 平板 / 手機 | 密度、導覽、表單、捲動、選取、錯誤/載入、觸控/鍵盤 | 真實裝置，調整需求回寫同一 TODO |
| Email | 驗證、重寄/逾期、密碼 recovery 與實際收信 | 使用者明確延後，此輪不寄信 |
| Backup / recovery | R2/GCS 設定、history/create、隔離還原/演練、排程 | 2026-10-05 起一週設定後再驗收，不啟動 production restore |
| 清理 / 上線 | 核對 fixture/account 清單、受控清理與 first-release gates | 驗收後確認，不自動刪除或 production cutover |

## 上線前暫時保留 — 用途與結束條件

- 測試資料及清理清單只為開發驗收與後續核對保留；不是 production seed 或另一份正式資料來源。完成相關驗收後核對清單，再經不可逆清理的當次確認移除。
- isolated acceptance source 為可重建 CI 驗證，fixture 僅存在臨時 D1，不隨 production 部署建立；不因清理 live fixture 移除有用的 regression tests。
- 未完成的人工／雲端／Email gate 保留到取得實測結果；完成後更新此文件，不另外新增狀態文件或永久例外規則。
- 舊 GAS／Sheet 只保留作參考，直到使用者確認新系統穩定後再決定停用／刪除；不把舊測試資料搬入 production。

### Development 測試資料清理 — 驗收後

- [ ] 核對此工作線建立的合成資料、ID/reference 及支援的正常清理行為；Git 只記錄非敏感結果。
- 保留範圍：Customer `CYWEB 驗收 20261001` revision 4（合成 phone/contact/address/note）；linked Visit revision 5；自由文字 Frequent Item `Development 常用商品驗收（未建檔合成品項）`；draft WorkLog type `DEVELOPMENT_ACCEPTANCE` revision 2。未建立 live 正式 Item/Quote。
- [ ] 驗收完成後依相依順序使用正常產品行為清理；不可逆清理取得當次確認，保留必要 Audit/history 與其他資料。此項不授權清空資料庫。
- 使用既有登入帳號，未建立驗收帳號；日後若新增受控帳號須補清單，不刪既有使用者／authority。此清單與 production 乾淨 schema provisioning 分離，目前未執行清理。

## 已接受業務 HTTP lifecycle — 0.7.15 Build 0

- Local actual Worker/D1 通過：Item create/edit/renumber、舊版本 409、精確成本／conversion／number Audit；Quote create/correct、新歷史保留、精確 price breaks／Audit before/after/reason；Visit create/edit/delete；正式／自由文字 Frequent Item create/edit/delete 及舊 timestamp edit/delete 409；Defect processing/resolve/reopen/invalidate 及逐步 stale replay／精確 Audit。
- WorkLog HTTP review/statistics、ADMIN cancel-review、owner withdraw/edit/submit/withdraw/delete 與 cascade、stale／delete replay、精確七筆 Audit actor 通過；撤銷後統計不包含未審紀錄，已審不可直接 withdraw。初次 local expectation 用非 owner 測 withdraw 得 403；改為 owner 測 state 422，未改業務權限。
- 相同套件包括先前六模組 HTTP authority、Sales／Outsourcing lifecycle、settings/Audit、全部 domain/stale／ID／backup/recovery，七 migration/48 tables 及 source/TypeScript/Vite 都通過。Local scratch shim 不進 repo/CI。[PR #127](https://github.com/simonliu1118-byte/chihyuan-web/pull/127) accepted head `24a15de0774d055435e13014f8556a14ec512a71`，四 blobs exact-match；merged source `d0f380c4492795fb1c939559b657c586cf163d2b`。Governance `37027576034`、Runtime `37027575424`、deploy contract `37027575046` 全通過；actual isolated D1 acceptance／Vite build 及 types 均成功。[Development run 37027810625](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/37027810625) attempt 1 通過 exact CYID sync/support window、七 migration、source build/deploy、兩入口正確 source/consumer/D1、canonical 與 invalid Session fallback；32620ms ready，未重部署。
- 全部新增資料只存在 ephemeral D1；live fixture、權限、Email、ERP／庫存／付款及雲端設定未操作。

## 已接受委外 HTTP 驗收 — 0.7.14 Build 0

- 委外 HTTP 建立 Contractor／BOM／Current Price → 建單 → 確認出庫 → ADMIN 修正 → 入庫 → 計價 → 付款 → 撤銷付款／計價／入庫／出庫通過。CASE 轉 24 EA，2 CASE 出庫 48 EA，3 成品依 BOM 耗料 6 EA，3 × 1.25 = 3.75，最終庫存歸零。
- 九種轉換舊 revision 重送均回 409，完整 business/config/Audit snapshot 不變；USER body 偽造不能修正／取消出庫或刪除，ADMIN 不能硬刪已出庫單，未逆付款不能撤銷計價／入庫，精確九筆 Audit 及 server actor 通過。
- Local actual Worker/D1 全套、七 migration／48 tables、TypeScript、source validation 及 whitespace 通過。只在 scratch 使用既有 host loopback shim；未提交或供 CI／部署使用。[PR #126](https://github.com/simonliu1118-byte/chihyuan-web/pull/126) head `8a5d3db15a7eb78a44cb26764007304e2f7e985b`，五個 blobs exact-match；Governance `37026324707`、Runtime `37026324511`、deploy contract `37026324698` 全通過。Development `37026541319` attempt 1 通過部署、兩入口 source/consumer/D1、canonical 與 invalid Session fallback。
- 本輪未操作 live fixture／帳號、真實 ERP／庫存／付款、Email、權限或雲端設定。

## 保留的 ID 修正證據

### Retired identity release acceptance — 0.7.13 Build 0

- [PR #124](https://github.com/simonliu1118-byte/chihyuan-web/pull/124) accepted head `e36727cb7d26e0c61cd9ab11c906b65494af89ac`; merged source `332bb2694a239cc22f3379a25adac4ab916f25cb`. All 25 changed source/schema/document blobs reconciled exactly before merge; local merged tree matches accepted remote source. No governance/Identity/other-App rules changed.
- Required unmodified remote checks passed without source/job retry: Governance `37008313399`, Runtime `37008313258` (actual isolated Worker/D1 nine-entity retirement/rollback/restored-allocation/Audit-isolation plus domain/HTTP/portable/tiered/isolated-recovery acceptance and Vite build), deployment contract `37008313232`. Schema validation also verifies nonempty old-schema migration preserves business rows/events, backfills an audited deleted ID, ignores nonnumeric keys, never lowers retirement and rolls back with deletion; fresh targets remain empty.
- [Development Deploy 37008551551](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/37008551551) **attempt 1 passed** exact CYID canonical sync/support window, all seven migrations including `0007_retired_entity_ids`, build/deploy, source/consumer/D1 health, canonical Custom Domain and invalid-provider-Session fallback. Both origins returned `0.7.13`, exact source commit `332bb2694a239cc22f3379a25adac4ab916f25cb`, consumer `1.0.2`, database `ok` on first observations; total health **427ms**, `exceededFormerWindow:false`. 此項證據屬 0.7.13；目前 Development 以頂端基準為準。
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

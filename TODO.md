# CY Web TODO

本文件只記錄待辦與工程方向，不作永久規則來源。

## Phase 0 — Governance / Public foundation

- [x] 建立 Public `chihyuan-web` 與 `main` 正式基準。
- [x] 舊完整 GAS source／歷史留在 Private `chihyuan-legacy-private`。
- [x] 建立 AITeam Governance 2.0 三層規則骨架。
- [x] 同步 AITeam Common Rules 2.6.0。
- [x] 定義 CY shared visual canonical 邊界與 Web Design System 原則。
- [x] AITeam PR #62 改為納管 `chihyuan-web`。
- [x] CY Web Governance bootstrap PR 驗證與合併。
- [x] AITeam PR #62 驗證與合併。

## Phase 1 — Legacy inventory / architecture decision

- [x] 盤點 Legacy 五大系統：Customer、Order、Outsourcing、WorkLog、Item，以及實際 Sheet／子資料結構。
- [x] 從 Private Legacy 抽出資料模型、ID、狀態、驗證、權限與操作流程，分類為 master／FK／child／snapshot／lookup／audit／migration-only／drop／open。
- [x] 建立 `docs/architecture/LEGACY_DATA_AUDIT.md` 與第一版 `CANONICAL_DATA_MODEL.md`。
- [x] 以 Desktop Legacy 為主重新核對各模組 workflow、狀態回退、權限、跨模組副作用與 Audit／history，記錄於 `docs/architecture/LEGACY_DESKTOP_WORKFLOW_AUDIT.md`。
- [ ] 對目前 GAS Sheet 做 value-level 唯讀 profiling：筆數、空值、重複 business number、orphan FK、實際遇到的舊 alias/JSON shape。
- [ ] 與使用者確認 Canonical Data Model 內 `OPEN` 的業務語意與 snapshot policy。
- [ ] 完成最終 Canonical Data Dictionary。
- [ ] 最終確認 frontend 技術棧；目前推薦 TypeScript + React + Vite。
- [ ] 建立 Cloudflare Worker project、環境切分與 health endpoint。
- [ ] 設計 D1 relational schema、indexes、constraints、audit 與 forward migrations。
- [ ] 定義 API contract、error contract、validation schema、pagination/search pattern。

## Phase 2 — Reusable CY Web foundation

- [ ] App Shell／navigation／route guard。
- [ ] CYInvoice Cloud identity adapter／session handling／permission guard。
- [ ] API client／error／loading／retry pattern。
- [ ] Form controls／validation presentation。
- [ ] Data table／mobile cards／filter／search／pagination。
- [ ] Dialog／Drawer／Bottom Sheet／full-screen mobile form patterns。
- [ ] Audit/history UI。
- [ ] RWD + Adaptive 真實 Desktop/Tablet/Mobile 驗收矩陣。

## Phase 3 — Data migration

- [ ] 建立 Google Sheets → D1 可重跑 migration tool。
- [ ] 建立資料筆數、ID、關聯、日期、compound fields、numeric-string 欄位核對報告。
- [ ] 定義 dry-run、正式 cutover、rollback／重新執行策略。

## Phase 4 — Module migration

- [ ] Customer。
- [ ] Item。
- [ ] Order。
- [ ] Outsourcing。
- [ ] WorkLog／Scoring／History Statistics。
- [ ] Settings／Admin。

## Backup / recovery — GCS coordination

- [x] 保留程式內備份／還原能力；只允許 Super Admin 操作，還原需雙重確認並留下 Audit（BD-044）。
- [x] 志遠 production 初期採 Google Cloud Storage 作為 Cloudflare D1 的 off-site backup；Public source 維持 provider-neutral backup boundary（BD-045）。
- [x] CY Web 與 CYAccountingWeb 可使用同一 GCP Project，但目前各自使用獨立 backup dataset（bucket 或明確隔離 namespace）與獨立 least-privilege service identity／credential；不共用一把廣權限 GCS key。
- [x] 定義兩層 backup contract：application-level `BackupService` 負責 create/list/verify/restore/retention；storage-level `BackupStorageProvider` 只負責 put/get/list/delete object（BD-046）。
- [x] 定義可攜 backup set：`manifest.json` + `data.json`；manifest 含 App/schema/format version、UTC 建立時間、record counts、byte length、SHA-256 與 restore metadata；成功需 upload 後 read-back 再驗證（BD-046）。
- [ ] 建立 CY Web 專用 GCS bucket／namespace 與專用最小權限 identity；實際 project／bucket／credential 僅由 deployment/runtime secret 注入，不進 Public Git。
- [ ] 實作 `BackupStorageProvider` 的 GCS adapter，禁止 application service 直接依賴 GCS-specific API。
- [ ] 實作 `BackupService`：D1 export、package/manifest、SHA-256、read-back verify、list、retention、restore orchestration。
- [ ] 實作 SA-only 備份、備份清單、完整性驗證與雙重確認還原 API／UI／Audit。
- [ ] 定義 retention、失敗重試與災難復原演練；不完整／驗證失敗的 backup set 不可顯示為可還原版本。
- [ ] 與 `CYapps/apps/CYAccountingWeb` 對齊 BackupService／BackupStorageProvider、manifest/checksum 與 restore safety；Accounting 現有 Google Drive V0.16 實作視為過渡／可重用邏輯來源，production target 改為 GCS。
- [ ] 未來 CYAccountingWeb 併入 CY Web 後，抽出共用 CY Backup Service／Worker；各 App 改走 service boundary，撤除個別直接 GCS credential，但各 backup set 仍獨立可還原。

## 中期規劃 — SMART ERP 品號換碼收斂

此項不是 CY Web 初期上線阻塞項目；待 SMART ERP 新品號制度完成並穩定後再執行。

- [ ] 定義完整舊品號 → 新品號 mapping，檢查重複、遺漏與衝突。
- [ ] 過渡期保留舊品號 alias/history 搜尋，新交易只使用現行 SMART ERP 正式品號。
- [ ] 建立 Full Renumbering Migration dry-run 與 affected-row reconciliation。
- [ ] 批次更新適用的歷史 item-number snapshots（Order／Quote／Defect／Outsourcing／BOM 等），但不改寫無關的價格、數量、日期等歷史事實。
- [ ] 依使用者明確授權，停止舊品號搜尋並可進一步物理刪除舊品號 mapping/history。
- [ ] 執行前建立可復原備份／rollback point，執行後做完整資料一致性核對。
- [ ] 保留 migration-level audit event；若目標是完全退場舊碼，audit 不必保存逐筆舊品號內容。

## Phase 5 — CYCloud Identity

- [ ] 盤點 CYInvoice Cloud 可共用 Workspace／Employee／Credential／Session／OTP／Recovery contract。
- [ ] 定義 CYCloud Identity 與 App-specific permission 邊界。
- [ ] 抽離 CYInvoice-specific naming／routing／schema coupling。
- [ ] CY Web 與 CYInvoice 改為 CYCloud Identity consumers。

## Phase 6 — Cutover

- [ ] Legacy vs Cloud 核心資料與行為對照驗收。
- [ ] Desktop／Tablet／Mobile 真實工作流驗收。
- [ ] 權限／Session／高風險操作驗收。
- [ ] 備份／復原與 migration rollback 演練。
- [ ] 使用者確認正式上線穩定後，再停止／刪除舊 GAS deployment 與 Sheet。

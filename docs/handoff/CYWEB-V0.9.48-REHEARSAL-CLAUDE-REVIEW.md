# CYWEB V0.9.48｜隔離還原可觀測性：GPT → Claude 最終審查 handoff

- **狀態：待 Claude 審查；不合併、不部署。**
- 日期：2026-10-28（臺灣時間）
- Repo：`simonliu1118-byte/chihyuan-web`；分支：`cyweb/next-work-20261028`
- PR：[ #300 ](https://github.com/simonliu1118-byte/chihyuan-web/pull/300)，base `main`
- 版本：V0.9.48 Build 0（正式站仍 V0.9.47 Build 0）
- **執行：ChatGPT；審查：Claude（尚未開始）**。每次返修同步更新本檔，審查結論由 Claude 親自填寫。

## 1. 指示、範圍、已確認原因

使用者先要求將 ERP／叫貨／Email／Backup 實機驗收結果更新 TODO／CHANGELOG，另新增 ERP 完成通知由畫面右上移右下的待辦。對備份管理「驗證隔離還原」通用失敗及「更新紀錄」無結果，使用者委派本地 Work 以 Cloudflare MCP **唯讀診斷**，隨後指示優先修正階段 A（可觀測性）。

唯讀診斷：正式主 D1 schema migration 已到 **0029**，固定隔離 D1 仍停留 **0014**，缺 45 張表且具有既有非種子資料與歷史成功演練 Audit；它是**已使用歷史復原副本**，必須保留。當天兩次 `/rehearse` 為 HTTP 409，沒有新的演練 Audit 或還原前安全備份。**若來源 loadVerified 成功**，必在目標 schema 表覆蓋檢查 `BACKUP_TABLE_COVERAGE_MISMATCH` 被阻擋；原始代碼並未從當次 Logs 取得，仍屬強推論。已排除本次僅由 HR Migration 種子假陽性引起的猜測。

本版**未授權、未執行**：重試演練／清空或套 Migration 至舊隔離庫／建立新 D1／改 Worker 綁定／正式 D1、R2、GCS 寫入／開備份排程／合併或部署。階段 B 的新空白目標及封存流程須另案核准。**勿將正式資源名稱、識別碼、原始請求識別、個資或 credentials 放入 Public Git**。

## 2. 本 PR 逐檔修改清單（含審查交接文件）

| 檔案 | 改動與目的 |
| --- | --- |
| `shared/backups.ts` | 增加演練結果型別、`BackupHistory.rehearsals` 及固定安全錯誤代碼／中文訊息。 |
| `worker/backup/backup-service.ts` | `isolatedRecovery` 覆蓋來源讀取、目標檢查、安全備份、寫入／核對、結果紀錄等階段；安全失敗碼、phase、requestId 寫既有 Audit，並以最小 console 訊息輔助查核。新增 `loadBackupRehearsals`，Workspace scoped，近 90 天、至多 100 原始 Audit、彙整最多 30 筆演練。 |
| `worker/http/backup-routes.ts` | `GET /api/admin/backups` 回傳演練歷史；`POST /rehearse` 409 使用已知安全錯誤碼與對應中文訊息。保留 `SUPER_ADMIN`、Origin、雙重確認與固定目標檢查。 |
| `src/runtime/modules/BackupOperationalPage.tsx` | 增加「隔離還原驗證紀錄」，區分成功、失敗、未確認，顯示時間、phase、代碼與診斷識別；「更新紀錄」讀取演練歷史。 |
| `scripts/backup-rehearsal-http.test.mjs` | 測試安全錯誤訊息、GET 的 Workspace 範圍、Audit 敏感 metadata 不傳出。 |
| `scripts/backup-ui.test.mjs` | 驗證失敗階段、錯誤碼、結果待確認畫面。 |
| `VERSION`、`package.json` | 0.9.48；`BUILD` 仍為 0。 |
| `TODO.md`、`CHANGELOG.md` | 保存使用者驗收回報、診斷已證實／未證實差異、V0.9.48 變更與待辦；ERP 完成通知位置尚未實作。 |
| `PROJECT_RULES.md` §9.1 | 依使用者新指示：CYWEB 由 GPT 實作的**每個修正（程式、文件、版本、測試）都寫入 handoff，最終由 Claude 審查**；不擴大共通規則 §11.4 的 Claude-first 工作單適用條件。 |
| `docs/handoff/README.md` | 增加本版待審 handoff 索引。 |
| 本檔 | GPT 完成報告、變更清單、驗證證據、Claude 審查待填區。 |

之前的 PR #299 是已結案的文件整理，非此 PR 的審查差異；PR #300 原本只有驗收文件，後續擴充為 V0.9.48 階段 A 修正。

## 3. 完成報告：驗證證據與成本

- [x] [Governance Check #40656646294](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40656646294)：success。
- [x] [Runtime Check #40656646326](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40656646326)：success（前後端 typecheck、source contracts、Worker regression tests、local D1 acceptance、Vite build）。
- [x] [CY Web Deploy PR 驗證 #40656646318](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40656646318)：success；`deploy-development` **skipped**，**不代表已發布**。
- [x] `backup-rehearsal-http.test.mjs` 與 `backup-ui.test.mjs` 已納入 Runtime Check 的 Worker 測試組。
- [ ] Claude 獨立審查與必要返修；[ ] 正式環境只讀效能與操作驗收；[ ] 桌面／手機截圖（未提供）。
- 本次程式修正沒有呼叫 Cloudflare、沒有正式 D1/R2/GCS 讀寫或資源異動（皆為 0）；遠端查核由先前本地 Work 的獨立唯讀任務完成。本次沒有取得新版 Audit 的實際 rows read，**不得虛構成本或配額**。

## 4. Claude 審查優先檢查

- [ ] **權限／資訊安全**：`SUPER_ADMIN`、workspace join、白名單錯誤碼與原始 metadata 的洩漏風險；不得輸出真實 Cloudflare 識別或業務內容。
- [ ] **故障可信度**：`started`／`verified`／`failed` 去重及排序、Audit 寫入失敗後的「結果未確認」、可能已寫入的還原目標不能再試；歷史前置失敗不可補成假 Audit。
- [ ] **測試涵蓋**：HTTP fixture 用 mock `isolatedRecovery`；是否需要增補 BackupService 的實際前置失敗 Audit 整合測試？審查中發現缺口請列為阻擋或返修。
- [ ] **資料量**：90 日 Audit、SQL LIMIT 100、結果最多 30 筆、既有 `idx_audit_events_time` 及 `backup_sets.workspace_scope` 的查詢計畫；避免 D1 高耗讀。
- [ ] **UX 與隔離安全**：更新紀錄、loading、錯誤、長代碼手機換行；舊隔離 D1 必須保留，不得新增清空、改綁、重試、回復正式主庫等路徑。
- [ ] **治理**：逐檔檢查 PR 差異、版本、TODO／CHANGELOG、`PROJECT_RULES.md` 和本 handoff 一致；Public Git 不含正式環境機密。
- [ ] **審查後**：Claude 寫回以下紀錄並提供具體結論；若需修正，GPT 更新本 handoff 及測試後再交審。Claude 審查通過仍需使用者另外授權合併／正式部署。

## 5. Claude 最終審查紀錄（請 Claude 親自填，GPT 不代填）

- 審查日期：
- 審查者：Claude
- 審查 PR head SHA：
- 結論：**待審查**（通過／需修正／阻擋合併）
- 問題清單（依嚴重度）：
- 執行的驗證／截圖／證據：
- 審查者直接修正內容：
- GPT 返修與複審紀錄（如有）：
- 是否可提交使用者決定合併／部署：

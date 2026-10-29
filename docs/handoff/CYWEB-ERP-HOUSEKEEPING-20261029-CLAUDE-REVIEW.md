# CYWEB ERP 清理 SQL 高頻執行改善 — Claude 審查交接

日期：2026-10-29｜分支：`perf/cyweb-erp-housekeeping-cron-20261029`｜來源：`main`
狀態：**Claude 審查完成——需修正 R1（見文末）；未合併、未部署**

## 問題與來源
使用者 D1 監控截圖顯示：ERP 清理 SQL 執行 **6,248 次**、掃描 **624,800 列**，實際寫入 **0**。
原本 `worker/http/erp-item-query-routes.ts` 的 `housekeeping()` 同時位於 `userRoutes` 與 `agentRoutes` 共通入口。Agent 每 2–3 秒領取工作等高頻請求，重複執行：
1. 過期 QUEUED → EXPIRED；
2. 逾時 RUNNING → FAILED；
3. 完成超過五分鐘結果 JSON 清空；
4. 完成超過三十天紀錄刪除。
即使沒有更新任何資料，也可能持續消耗 D1 rows read。

## 修改摘要
- **移除兩處 HTTP 的清理呼叫**，保留查詢、Agent claim/complete/heartbeat、權限檢查及既有資料格式。
- 新增 `worker/http/erp-housekeeping.ts`，從 `worker/index.ts scheduled()` 呼叫。保留原過期／逾時 SQL 條件（特別是盤點 SYNC 1800 秒、WRITE 3600 秒）、Agent timeout 錯誤訊息、Audit 事件及盤點寫回失敗時 `WRITING` → `WRITE_FAILED` 的原回復邏輯。
- **只加一個 `* * * * *` Cron**。依 Cloudflare `scheduledTime` 判定：每分鐘過期／逾時、每五分鐘清結果、每日台灣 03:15（UTC 19:15）刪除超過三十天紀錄。原台灣 03:00 程式目錄與可選 03:30 備份排程不變。
- 先以使用現有 `idx_erp_query_queue` 的雙 `EXISTS` 查看 QUEUED/RUNNING；完全閒置時不執行兩個無效 UPDATE。已完成結果繼續使用 `idx_erp_query_retention(completed_at)`，本 PR **未新增 Migration**。
- 同步更新 Wrangler 本地／部署設定、排程驗證合約及其測試；新增 `scripts/erp-housekeeping.test.mjs` 的合成 SQLite 回歸測試。原 `erp-business-query`、`store-stocktake` 測試也改為明確觸發 Cron，不再假設 GET/Agent claim 自動執行維護。

## 預估效益與行為差異
以相同 **24 小時**期間對照，結果清理 SQL 最多 288 次／日，與截圖 6,248 次相比，執行次數理論上約減少 95.4%；**截圖本身未提供期間，因此不得視為已實測的同期間降幅**。實際 D1 rows-read 降幅需要上線後按相同期間與 SQL 觀察。
相較於每次 HTTP 執行的原本行為，已過期工作最晚可能約延後 1 分鐘處理、結果 JSON 清空最多延後約 5 分鐘、30 天紀錄刪除最多延後 1 天。Agent claim 仍自行檢查 `expires_at`。
不改動查詢結果保存規則及 ERP 所有資料表的業務內容。

## Claude 審查／測試重點
1. 核對 Cron 狀態轉換、原 Timeout 分類（180s／300s／600s／1800s／3600s）、盤點 `WRITE_FAILED` 回復和既有 Audit。
2. 核對 1min／5min／daily 間隔，`scheduledTime` 的 UTC/Taiwan 換算與原目錄／備份排程並存。
3. 確認部署的 Cloudflare Cron 觸發器真的新增，並追蹤排程執行紀錄；Cloudflare 維護排程執行不依賴有使用者在線。
4. 以 `EXPLAIN QUERY PLAN` 檢查 `idx_erp_query_queue`／`idx_erp_query_retention` 是否仍適用，量化 rows read。
5. 補確認 GitHub CI：browser/worker typecheck、source contracts、build、部署設定驗證、ERP housekeeping synthetic SQLite 測試。
6. 此 PR 不修改盤點 PR #307／CYERPAutoQuery，**不得直接合併或部署**，交由 Claude 複審。

## 驗證紀錄（2026-10-29）
- **程式提交：** `0d3ae5dcd2f8f66992a8b9b3a8c4b0594d6561c1`。
- **Runtime Check：4/4 成功**：[GitHub Actions #40833314041](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40833314041)，包含 worker-typecheck、browser-typecheck、source-contracts、build（其中有合成 SQLite 回歸測試）。
- **CY Web Deploy（PR 僅驗證部署設定）：** `validate-deployment-contract` 成功：[GitHub Actions #40833314044](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40833314044)；`deploy-development` 為 **skipped**，沒有部署。
- **Governance Check：成功**：[GitHub Actions #40833314085](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40833314085)。
- 本次包含盤點 `STOCKTAKE_SYNC` 1800 秒、`STOCKTAKE_WRITE` 3600 秒逾時與 `WRITE_FAILED` 回復的合成測試；原有 ERP 查詢及盤點 API 測試改成明確觸發 Cron。
- **尚未驗證：** Cloudflare 正式 Cron 安裝、線上 D1 query plan 與 rows-read 實測（需部署後才能收集）。此為 Claude 複審事項，不宣稱正式環境改善已實測。


## Claude 審查紀錄（2026-10-29，僅 Claude 填寫）

- 審查 head：`bb85a70e57cccf3cf2784ebfb49acac0f464fcca`
- 結論：**需修正（R1）**。方向正確：根因判斷正確（每次 HTTP／Agent 請求都跑四段清理 SQL），改成 Cron 能把執行次數降到每天約 1,440 次探測、288 次清理。修正 R1 後即可交使用者決定合併。
- **R1（應修）結果清理每 5 分鐘仍掃描「所有已完成紀錄」，讀取量會隨 30 天保留量成長。**
  - `UPDATE ... WHERE completed_at<?1 AND (... IS NOT NULL ...)` 在 SQLite 的查詢計畫是 `SEARCH erp_item_queries USING INDEX idx_erp_query_retention (completed_at<?)`，會讀完 30 天內所有已完成紀錄，再逐列檢查 JSON 欄位，這就是截圖每次約 100 列的來源。
  - 估算：保留量 100 列時約 2.9 萬 rows read／天；累積到 3,000 列時約 86 萬 rows read／天。
  - 修法：每 5 分鐘只清 `completed_at >= ago(3600) AND completed_at < ago(300)` 的視窗。每日 03:15 的 retention 階段再做一次全範圍清理，補救錯過的批次（例如 Cron 漏跑）。
  - 補測試：視窗外的舊紀錄在 5 分鐘清理時不被讀取或修改，每日清理會補清。
- **R2（部署前確認）Cron 觸發器數量。** 新增 `* * * * *` 後，此 Worker 有 2 個（備份排程開啟時 3 個）。Cloudflare Workers Free 方案整個帳號上限 5 個 Cron 觸發器，帳號內還有其他 Worker。部署前請確認帳號方案或現有觸發器總數，超過時 `wrangler deploy` 會失敗；此時 D1 migration 那一步已執行，但本 PR 沒有 migration，影響有限。
- **R3（小）版本號。** 本 PR 沒有升 `VERSION`／`package.json`。正式部署前請依慣例升版，並在 CHANGELOG 記錄。
- 確認無問題：
  - 逾時分類（180／300／600／1800／3600 秒）、Audit 事件、盤點 `WRITING → WRITE_FAILED` 回復，都與原 `housekeeping()` 逐字一致。
  - Agent claim 本身檢查 `expires_at>?`，延後最多 1 分鐘的過期處理不會讓過期工作被領走。
  - 狀態探測走 `idx_erp_query_queue` covering index，閒置時只讀極少列。
  - `scheduled()` 依 `controller.cron` 分流，與 03:00 目錄、03:30 備份排程互不影響；03:15 的 retention 時間換算正確。
  - 其他路由沒有再引用已移除的 `housekeeping()`。
- 驗證：
  - 本機 `npm run typecheck` 通過、`node --test scripts/*.test.mjs` **414 pass／0 fail**、`validate-deploy-config` 通過。
  - 以 0001–最新 migration 建立 SQLite，對探測與清理 SQL 做 `EXPLAIN QUERY PLAN`（結果如 R1）。
  - PR 的 GitHub CI 全綠。
- 使用者指示：本輪只審查，**不合併、不部署**。

# CYWEB ERP 清理 SQL 高頻執行改善 — Claude 審查交接

日期：2026-10-29｜分支：`perf/cyweb-erp-housekeeping-cron-20261029`｜來源：`main`
狀態：**待 Claude 審查，未合併、未部署、未操作正式 D1**

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

## 驗證紀錄
待本 PR 最新 GitHub Actions 取得 CI 結果後更新；此前不宣稱通過。

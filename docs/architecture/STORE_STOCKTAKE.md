# 門市庫存盤點（WO-0.9.52）— 第一階段架構與權威

工單：`docs/development/work-orders/WO-0.9.52.md`。ERP 對接契約：`docs/architecture/ERP_ITEM_QUERY_BRIDGE_CONTRACT.md`。另一端 WO：`CYapps/apps/CYERPAutoQuery/docs/work-orders/WO-1.3.0.md`。

## 目的與模組

沿用現有門市頁 `store` 的權限驅動頁籤，授權碼 `STORE_STOCKTAKE`。具有該 Module Access 者可看見盤點單、盲盤、複盤、同步底稿；`ADMIN`／`SUPER_ADMIN` 才可忽略、取消忽略、重新整理、第一次／第二次確認、重新寫回。所有授權必須由 Worker 伺服器判斷，前端隱藏僅為互動提示。

第一階段止於 `ERP_CONFIRMED`，第二階段另案執行 ERP 盈虧處理、庫存更新／異動核對及清除。正式操作依 Cloudflare 受控發布程序，無任何自動 ERP 真交易測試或清除。

## 狀態與 Worker 讀取語意

- `IGNORED`：可先建立無明細的底稿編號；一般清單隱藏，更新時 skip。管理員取消後進入 `COUNTING`。
- `COUNTING`：盲盤。**所有角色**的 GET／PATCH 回應皆不包含 `bookQty`，Worker `toLine` 序列化在伺服器端移除；任何人不能利用 API 繞開。每列以 `version` 樂觀鎖在同一 D1 batch 寫入；不同列可並行，衝突回 409。
- `RECOUNTING`：管理員第一次確認，所有列有初盤數量才允許；按**品號總和**比較帳面與初盤（十進位 ×10000 `bigint`），總和相等的品號全列鎖定；其餘需填複盤。解除盲盤，可看到帳面、各列與品號差異。
- `WRITING`：管理員第二次確認，所有開放列必須有複盤值。逐批號寫回集合＝既有列的 `實際數量≠帳面`＋全部新增批號，即使結果為空也要求 ERP INVR11 核對與 INVI06 確認。所有書面數量是 JSON 十進位數字字串。
- `WRITE_FAILED`：已回覆失敗或 Agent 逾時，主管核對並可**顯式**重新寫回相同值，保留結果及不自動重送。
- `ERP_CONFIRMED`：Agent 已在 ERP 完成核對、INVI06 確認後才標示，第一階段終點；不可擅自宣稱第二階段盤點手續完成。

## Migration 0030

- `app_member_module_access` 新 `STORE_STOCKTAKE`；`erp_item_queries` 新 `STOCKTAKE_SYNC`／`STOCKTAKE_WRITE`。保留現有 `not_before`、進度、`idx_erp_query_owner`、其他 grant 與 queue index。
- `stocktake_sheets`：一張底稿一筆，日期、狀態、版本、兩次主管確認者／時間、寫回工作 ID／結果與 ERP 確認時間。
- `stocktake_lines`：每一 ERP seq 或新增批號一列；原底稿 seq 五位字串唯一；數量用 TEXT（最多 4 位小數且絕對值小於十億），一列 `version`。新增批號只允許**原本已有非空批號**的品號，批號不可重複。
- `stocktake_line_history`：逐列 before／after、actor／time，不寫共用 Audit，第二階段清除時和 `stocktake_lines` 一起刪。
- `stocktake_participants`：填過初盤／複盤人員及首次／最後填寫時間，和 sheet 紀錄長期保留。第二階段清除盤點單明細後，需保留確認資訊與盈虧差異快照（第二階段才建立及填寫差異快照，**此版沒有執行清除**）。
- 四張表都在 `worker/backup/schema-columns.ts` 可攜備份列清單與 `scripts/validate_schema.py`，不能把填寫中的資料排除。

## 同步與成本、安全

`STOCKTAKE_SYNC` 只從門市專用受權路由產生。更新請求送全量已讀／忽略的 `skipSheets`（最多 500），重新整理只允許初盤、從未填寫的底稿，送 `onlySheet`。Agent result 按工單驗證最多 200 底稿、每張 3000 行、seq 不重複、數量十進位字串，完成時同批次保存 `stocktake` 表，不能留在一般 ERP `result_json`。

`STOCKTAKE_WRITE` 由第二次確認／失敗後管理員明確重試產生，payload 存在原 ERP job queue。依現有 Worker 單一 Agent claim 與每人三筆上限；Agent 有進度報告 `stage=STOCK`。RUNNING 分別 1800／3600 秒逾時，逾時後寫回底稿狀態需變成 `WRITE_FAILED` 供人工介入。前端不要自動重試可能已進入 ERP 的寫回操作。

大量盤點單（最壞 200 × 3000 行）的完整單次 atomic D1 batch 可能觸及 Worker／D1 limits；需以 synthetic fixture 壓測，確認每張分批的完整性與 D1 費用，**未實測前不能宣稱負載門檻通過**。

## 寫回安全補強及負載策略（2026-10-29）

- 任一 STOCKTAKE_WRITE 由 ERP 回覆 `confirmed=false` 時，job 不得標示一般 DONE，sheet 進入 `WRITE_FAILED`，只有管理員可核對後再明確重試；即使 Agent 回 `outcome=FOUND` 亦然。
- INVR11 全表核對的 mismatch 可指向本次未寫入的舊批號列；Worker 以張內完整列鍵／seq／品號／批號驗證，新增批號可接受本次結果配發的 seq，但不能接受其他張的列或陌生值。寫入成功回報 `erpSeq` 必須與舊序號一致或提供新增序號。
- ERP job 的 `keyword` 對 STOCKTAKE_WRITE 含逐列數量，**不得複製進共用 Audit**；保留專用 `stocktake` 表及每張工作狀態。
- SYNC 單張最多 3000 列，Worker 改為經 `validateSyncResult` 檢查的 `json_each` bulk insert，與 job status 在一個 D1 batch 交易中。合成 Node sqlite 3,000 列測試覆蓋，超過 3,000 被拒絕；未測真 Cloudflare D1 30 秒限制，不據此聲稱大量匯入已在正式環境通過。

## 未完成與第二階段邊界

- ERP Windows Agent 的 INVR11／INVI14／INVI06 真操作只在另一張 WO-1.3.0 完成；CY Web 不代替 Agent 操作 ERP。
- 第二階段：盈虧明細、資料更新、庫存異動核對、視需要的庫存核對、ERP 清除及 CY Web 差異摘要保留／明細清除。
- 沒有新增不在原底稿的品號、儲位更新、Excel 匯出／列印。

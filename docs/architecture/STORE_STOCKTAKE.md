# 門市庫存盤點（WO-0.9.52）— 第一階段架構與權威

工單：[`docs/development/work-orders/WO-0.9.52.md`](https://github.com/simonliu1118-byte/chihyuan-web/blob/4cbc554a08c7fdf47a4140c7b9d912f61ce42c10/docs/development/work-orders/WO-0.9.52.md)。ERP 對接契約：`docs/architecture/ERP_ITEM_QUERY_BRIDGE_CONTRACT.md`。另一端 WO：`CYapps/apps/CYERPAutoQuery/docs/work-orders/WO-1.3.0.md`。

## 目的與模組

沿用現有門市頁 `store` 的權限驅動頁籤，授權碼 `STORE_STOCKTAKE`。具有該 Module Access 者可看見盤點單、盲盤、複盤、同步底稿；`ADMIN`／`SUPER_ADMIN` 才可忽略、取消忽略、重新整理、第一次／第二次確認、重新寫回。所有授權必須由 Worker 伺服器判斷，前端隱藏僅為互動提示。

第一階段止於 `ERP_CONFIRMED`。V0.12.1 增加「ERP 已清除後的 WEB 同步歸檔／過去盤點紀錄」；ERP 盈虧處理、庫存更新／異動核對及 ERP 清除仍屬第二階段另案。本版不執行 ERP 清除或任何自動 ERP 真交易驗證。

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
- `stocktake_line_history`：逐列 before／after、actor／time，不寫共用 Audit，ERP 已清除後的同步歸檔時，和 `stocktake_lines` 一起刪，原共用 Audit 保留。
- `stocktake_participants`：填過初盤／複盤人員及首次／最後填寫時間，和 sheet 紀錄長期保留。V0.12.1 歸檔清除作業明細後，確認資訊、參與者名稱與盈虧差異保存在 `stocktake_record_*`；ERP 端清除仍由第二階段另案辦理。
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
- 第二階段：盈虧明細、資料更新、庫存異動核對、視需要的庫存核對、ERP 清除。CY Web 的差異摘要保留／明細清除已由 V0.12.1 的同步歸檔處理，見下節。
- 沒有新增不在原底稿的品號、儲位更新、Excel 匯出／列印。

## ERP 已清除的盤點單與過去盤點紀錄（V0.12.1）

- 同步請求在 server-only `knownSheets` 保存當時已知的底稿編號及 created_at 代次，不傳給 Agent。只有 **full sync**、成功回報且 `listComplete:true` 才比較 ERP 完整 `sheets`，將快照內已不在 ERP 的同代底稿轉入紀錄；之後新建的底稿不受舊同步影響。單張 `onlySheet` refresh、FAILED、缺完整標記均不歸檔。
- 新 Agent V1.3.1 會先確認 F2 footer 總數與實讀張數相符；未知、缺頁、筆數變動或超過 200 張會失敗。明確 0/0 是完整空清單，可歸檔最後一張。舊 Agent 未帶標記仍可同步，暫不歸檔；兩端都更新後才啟用。提升正式最低支援版本並停用舊 Agent 後，才可移除此 rollout 相容窗口。
- 尚有 QUEUED／RUNNING `STOCKTAKE_WRITE` 的單，留到該工作結束後的下一次完整同步再比對，不讓尚在處理的 ERP 寫回失去來源。WEB 不清除或更改 ERP 資料。
- 歸檔在同步 complete 的同一 D1 batch：先保存單號／盤點日期、參與者與初盤／複盤人員、兩次確認者及時間、ERP 確認完成時間、品號＋品名去重摘要、差異及未完成列；成功後才刪 `stocktake_sheets`。FK cascade 清除作業明細、儲位盤點格、逐列修改紀錄及舊參與表；原共用 Audit 不刪除。任何快照寫入失敗整批回滾。
- `0055_stocktake_records.sql` 新四表：`stocktake_records`、`stocktake_record_items`、`stocktake_record_participants`、`stocktake_record_differences`；全部納入 portable backup。單號相同但 created_at 不同可留多次紀錄，ERP 重用單號仍可正常匯入成新作業單。
- 每個 ERP seq 的帳面只比較一次；實際數量為其 WEB 儲位數量完整合計，已要求複盤但未填齊者不以初盤冒充最終實際。只保存有差異或尚未完整的列；小數使用整數萬分位，持久化合計為 TEXT，避免 D1 JSON／JS 超過 2^53 遺失精度。
- 工具列「盤點紀錄」對有 `STORE_STOCKTAKE` 使用權者開放，不另設管理權。共用 `Dialog`／`cy-op-table`／`ExpandToggle`，一列一張；盤點日期、單號、初盤人員、複盤人員共 30%，**盤點內容 70%**，以 `品號品名、品號品名` 顯示並自然折行。展開區與門市訂購共用 `StoreHistoryChain`，依時間串接初盤確認、複盤確認、寫回 ERP、ERP 清除歸檔；無紀錄的事件不補造，無人員的事件只顯示時間及動作。不顯示品項差異表或重複參與人員；只有關閉按鈕，點背景不關閉。
- GET `/api/business/store/stocktake/records` 以盤點日期 DESC／ID DESC 游標每頁 10 張；展開紀錄直接使用已載入的時間與確認人員，不另發請求。差異摘要仍依保存契約保留，GET `/records/:id` 的 100 列游標介面不在本視窗呼叫。紀錄視窗不背景輪詢，也不在現有 10／30 秒盤點輪詢載入歷史內容。同步歸檔使用固定六個 bulk SQL statements，不逐行發 D1 query；仍需正式環境大資料量驗收，不據合成測試聲稱無限負載。


## 批號刪除按鈕位置（V0.11.6，2026-11-06）

- 桌機的新增批號刪除動作放在「批號」儲存格內，以共用 `IconButton` 搭配 `Icons.remove` 的垃圾桶圖示顯示，不再在右側操作欄放容易折行的「刪除批號」文字按鈕。
- 批號與圖示同列、文字過長時省略顯示，但圖示保持可點擊；`aria-label` 與 `title` 仍包含「刪除批號」及該批號。手機盤點卡亦在批號旁顯示相同圖示；展開操作區只保留修改紀錄。
- 僅 `line.isAdded && editable && !line.locked` 顯示刪除控制，仍呼叫既有 `onDeleteBatch(line)`，保留刪除前核對、相依儲位檢查、權限及歷程。無 Worker、D1、schema／備份或 ERP 行為變更。


## 初盤確認後顯示 ERP 帳面數量（V0.11.6 返修）

- `COUNTING` 與 `IGNORED` 的初盤維持盲盤：Worker `toLine` 不回傳 `bookQty`，前端也不顯示帳面欄；不能僅靠前端隱藏保密。
- 首次主管「初盤確認」後，`RECOUNTING` 的 Worker 原本即回傳各來源批號的 `bookQty`；桌機應在「複盤數量」前顯示「ERP 帳面數量」，手機在批號下方呈現帳面值。已解盲的 `WRITING`／`WRITE_FAILED`／`ERP_CONFIRMED` 亦保留以供追溯。
- `bookQty` 代表 ERP 原始批號的帳面**合計**，不是單一 WEB 儲位數量。同一批號分配至多個 WEB 儲位時可重複顯示作參照，但**不可將顯示的合計再逐儲位加總**。缺值顯示「—」，原始為零則顯示零。
- 只修正表格與手機卡的呈現、欄寬，不修改 Worker、D1、後端解盲、盤點數量計算、確認或 ERP 寫回。

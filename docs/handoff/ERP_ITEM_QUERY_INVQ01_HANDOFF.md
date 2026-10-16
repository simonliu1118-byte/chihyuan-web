# ERP 品號查詢 — 批號庫存、歷史異動與結果保留（補充交接）

狀態：給 CY Web 實作者的交接，2026-10-16。來源：CYapps `apps/CYERPAutoQuery` V0.3.0 Build 1（CYapps#472）。
本文件是 `docs/architecture/ERP_ITEM_QUERY_BRIDGE_CONTRACT.md` 的增修；做完請更新該 contract，並回一份報告 `docs/handoff/ERP_ITEM_QUERY_INVQ01_REPORT.md`，由 CYERPAutoQuery 端核對。

## 1. 使用者需求（2026-10-16）

1. 品號是批號管理（「批號管理」不是 `N:不需要`）時，Agent 會自動到 SMART ERP「庫存狀況查詢作業 (INVQ01)」查各批庫存量，回傳每批的 **批號、庫存數量、入庫日、有效日期**。CY Web 不需要另外勾選，有就顯示。
2. 「查歷史異動」是查詢模組裡的選項，**有勾才查**。日期範圍用**日期選擇器**；**沒填就是最近一年；起訖範圍最多三年**。
3. 查詢結果保留時間由 10 分鐘改為 **5 分鐘**。
4. **使用者每次查詢都要重跑 ERP 流程**，不論前一次保留的結果還在不在，不可重用舊結果，以免與 ERP 有出入。

## 2. 使用者 API 變更

`POST /api/erp/item-queries` body 增加選填欄位（舊 body 仍有效）：

```json
{ "itemNo": "T0001", "includeHistory": true, "historyFrom": "2026-01-01", "historyTo": null }
```

- `includeHistory`：boolean，預設 false。false 時 `historyFrom`／`historyTo` 必須省略或 null。
- `historyFrom`／`historyTo`：`yyyy-MM-dd` 或 null。
- 服務端在建立工作時就**補齊並驗證**（以台北日期為「今天」）：
  - 迄未填 = 今天；起未填 = 迄往前一年再加一天（例：迄 2026-10-16 → 起 2025-10-17）。
  - 起 ≤ 迄；迄 ≤ 今天；起 ≥ 迄往前三年（同日可，例：迄 2026-10-16 → 起最早 2023-10-16）。
  - 不符回 HTTP 400 `INVALID_HISTORY_RANGE`（新錯誤碼，訊息如「歷史異動日期範圍最多 3 年」）。
- 存入工作的是補齊後的起迄（兩個都有值），GET 工作時一併回傳 `includeHistory`、`historyFrom`、`historyTo`。
- 每次 POST 都建立新工作、由 Agent 重新查 ERP；不得因同品號近期有結果而直接回傳舊結果（需求 4）。

## 3. Agent API 變更

### claim

`{job:{id,itemNo,expiresAt}}` 增加三個欄位（沒要求歷史異動時 `includeHistory:false`、日期 null）：

```json
{ "job": { "id": "…", "itemNo": "T0001", "expiresAt": "…", "includeHistory": true, "historyFrom": "2026-01-01", "historyTo": "2026-10-16" } }
```

Agent 也會再驗證一次同樣規則；不合法時回 FAILED `INTERNAL`（不會讓工作卡住）。

### complete（FOUND 增加三個鍵）

```json
{
  "outcome": "FOUND",
  "fields": [ … 不變 … ],
  "warehouses": [ … 不變 … ],
  "batchManaged": true,
  "batches": [
    [{"name":"批號","value":"B001"},{"name":"庫存數量","value":"42"},{"name":"入庫日","value":"2025/10/15"},{"name":"有效日期","value":"2028/06/18"}]
  ],
  "history": {
    "from": "2026-01-01",
    "to": "2026-10-16",
    "columns": ["日期","單別-單號-序號","庫別","庫別名稱","入出別","異動數量","備註"],
    "rows": [["2026/01/05","231A-20260105001-0001","W01","測試倉","出庫","1","假備註"]],
    "total": 1,
    "truncated": false
  },
  "errorCode": null, "errorMessage": null, "elapsedMs": 23000, "agentVersion": "V0.3.0 Build 1"
}
```

驗證規則（建議）：

- `batchManaged`：boolean。缺少時視為舊版 Agent（V0.2.x），不顯示批號區塊。
- `batches`：二維陣列，最多 100 列；每列欄名白名單且不重複：`批號、庫存數量、入庫日、有效日期`（新增 `ERP_BATCH_FIELDS`，來源 CYapps `ItemFieldCatalog.Batch`）；value 最長 4,096 字。`batchManaged:false` 時必須是空陣列。批號管理但目前沒有批號庫存時可為空陣列。
- `history`：
  - 工作 `includeHistory:false` → 必須是 null 或省略。
  - 工作 `includeHistory:true` 且 FOUND → 必須是物件；`from`／`to` 必須等於工作的起迄；`columns` 必須**完全等於**上列 7 欄且順序相同（新增 `ERP_HISTORY_COLUMNS`，來源 `ItemFieldCatalog.History`）；`rows` 每列剛好 7 個字串、每格最長 1,024 字、最多 **2,000** 列；`total` ≥ rows 數；`truncated` = total > rows 數。
  - 舊版 Agent 不會送 `history`：此時顯示「此版本 CYERPAutoQuery 不支援歷史異動，請更新」，工作仍算 DONE。
- 單位成本、異動金額等成本欄位 Agent 不會送；服務端拒收白名單以外的欄名。
- NOT_FOUND／FAILED：`batches` 為空陣列或省略、`history` 為 null 或省略。
- 欄位順序：歷史異動依 ERP 順序（舊→新）。超過 2,000 列時 Agent 保留**最新**的 2,000 列，`total` 是 ERP 實際筆數。

### 大小與時間上限

- 實測：真實資料一個品號 5 年 1,621 筆歷史異動約 144 KB JSON；2,000 列約 180 KB。complete body 上限請由 96 KiB 放寬為 **256 KiB**（建議只在 `includeHistory:true` 的工作放寬，其他維持 96 KiB）。
- 多了開啟 INVQ01、查詢與轉出，執行時間會變長（批號約多 15～30 秒，歷史異動視範圍而定）。RUNNING 逾時由 120 秒放寬：建議一般工作 **180 秒**、含歷史異動 **300 秒**；QUEUED 120 秒過期不變。

## 4. 結果保留（需求 3、4）

- fields／warehouses／batches／history 於完成後 **5 分鐘** 清除（原 10 分鐘），metadata 保留 30 天不變；清除後仍回 `resultCleared:true`，畫面提示「結果已清除，請重新查詢」。
- 前端重新查詢一律 POST 新工作，不讀快取、不顯示舊工作的結果當作新結果。
- 新欄位的 D1 儲存請用 forward migration（例如 `0010_erp_item_query_invq01.sql`：`include_history`、`history_from`、`history_to`、`batch_managed`、`batches_json`、`history_json`），不改寫既有 migration；清除時一併清 `batches_json`、`history_json`。
- Audit 仍只記員工、品號、結果、耗時，可加 `includeHistory` 與起迄日期，不記欄位值。

## 5. 畫面（查詢模組）

- 品號輸入旁加「查歷史異動」勾選；勾選後顯示「起」「迄」兩個**日期選擇器**（可留空），下方說明「未填：最近一年；範圍最多 3 年」。前端先依同規則檢查，服務端為準。
- 結果區：
  - 既有單頭、庫別不變。
  - 「批號」表：批號、庫存數量、入庫日、有效日期；`batchManaged:false` 顯示「非批號管理」；批號管理但空陣列顯示「目前沒有批號庫存」。
  - 「歷史異動」表（有勾才出現）：標題顯示起迄與筆數；`truncated:true` 時提示「共 N 筆，只顯示最新 2,000 筆，請縮小日期範圍」。手機版表格可橫向捲動。
- 權限仍由 `ERP_ITEM_QUERY` 模組控制，不另設歷史異動權限（如需要再與使用者確認）。

## 6. 測試（只用假資料）

- 建立工作：includeHistory 預設、只填起、只填迄、都不填（最近一年）、剛好 3 年、超過 3 年、起 > 迄、迄 > 今天、日期格式錯、includeHistory:false 卻帶日期。
- claim 回傳三個新欄位；舊工作（migration 前）讀出 includeHistory:false。
- complete：批號白名單／重複欄名／超過 100 列；history 欄位順序不符、列長度不符、超過 2,000 列、from/to 與工作不符、未要求卻送 history；舊版 Agent body（無新鍵）仍可完成；256 KiB 上限。
- 保留 5 分鐘清除（含 batches／history）；同品號連續查詢建立兩筆工作且各自由 Agent 回報。
- `scripts/erp-item-query-acceptance.mjs` 加上含歷史異動的假工作。

## 7. Agent 端（已完成，供核對）

- CYapps `apps/CYERPAutoQuery/ErpAgentProtocol.cs`：`ParseClaim` 讀 `includeHistory`／`historyFrom`／`historyTo`（型別不符時忽略，不遺失工作）；`FoundBody` 送 `batchManaged`、`batches`、`history`（`MaxHistoryRows = 2000`、`MaxBatchRows = 100`）。
- `Invq01Layout.cs` `HistoryRange.Resolve`：與第 2 節相同的補齊與檢查規則。
- 單元測試：`tests/CYERPAutoQuery.Tests/Invq01Tests.cs`。

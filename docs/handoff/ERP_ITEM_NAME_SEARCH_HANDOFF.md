# ERP 品號查詢 — 品名查詢（補充交接）

狀態：給 CY Web 實作者的交接，2026-10-16。來源：CYapps `apps/CYERPAutoQuery` V0.4.0 Build 1（CYapps#472）。
本文件增修 `docs/architecture/ERP_ITEM_QUERY_BRIDGE_CONTRACT.md`；做完請更新 contract，並回報 `docs/handoff/ERP_ITEM_NAME_SEARCH_REPORT.md`，由 CYERPAutoQuery 端核對。

## 1. 使用者需求（2026-10-16）

1. 查詢模組可以用**品名**查：輸入品名中的文字（例如「穴位貼」），列出所有品名含該文字的品號清單。
2. 使用者從清單**點選一筆**，再以**品號**查完整資料（既有品號查詢：單頭、庫別、批號、可選歷史異動）。點選一律建立新的品號查詢工作，不重用清單資料（沿用「每次都重查」）。
3. CY Web 只管「品名」與關鍵字；對應 ERP 欄位（`INVMB.MB002`）與條件寫法由 CYERPAutoQuery 決定，Web 不送 SQL、不送欄位代號。

## 2. 使用者 API

`POST /api/erp/item-queries` 增加查詢類型（舊 body 仍是品號查詢）：

```json
{ "queryType": "ITEM_NAME", "keyword": "穴位貼" }
```

- `queryType`：`ITEM_NO`（預設，沿用 `itemNo`）或 `ITEM_NAME`。
- `ITEM_NAME` 時：
  - `keyword` 必填，去頭尾空白後 1～40 字。
  - 不可含控制字元，也不可含 `'`、`%`、`_`、`[`、`]`（引號會中斷 ERP 條件、其餘是 LIKE 萬用字元）。
  - 中間可有空白。
  - 不符回 400 `INVALID_KEYWORD`。
  - 不可同時帶 `itemNo` 或 `includeHistory:true`（400）。
- 同使用者同時最多一筆未完成查詢的限制，兩種類型共用。
- GET 工作回傳 `queryType`、`keyword`（或 `itemNo`）。

## 3. Agent API

### claim

```json
{ "job": { "id": "…", "queryType": "ITEM_NAME", "keyword": "穴位貼", "expiresAt": "…" } }
```

品號工作可加 `"queryType":"ITEM_NO"` 或維持原樣。

**版本相容（重要）：** V0.4.0 以前的 Agent 收到沒有 `itemNo` 的工作會判定 claim 回應格式錯誤；工作已變成 RUNNING，只能等逾時。

- claim 時依 body 的 `agentVersion`（例如 `V0.4.0 Build 1`）判斷版本：低於 0.4.0 就不要派 `ITEM_NAME` 工作，讓它留在佇列直到過期。
- 前端可依 agent-status 的版本提示「公司端程式需更新」。

### complete（ITEM_NAME 工作）

```json
{
  "outcome": "FOUND",
  "fields": [],
  "warehouses": [],
  "keyword": "穴位貼",
  "items": [
    [{"name":"品號","value":"T0001"},{"name":"品名","value":"假穴位貼A"},{"name":"規格","value":"假規格"},
     {"name":"單位","value":"包"},{"name":"庫存數量","value":"12"},{"name":"標準售價","value":"100"}]
  ],
  "total": 1,
  "truncated": false,
  "errorCode": null, "errorMessage": null, "elapsedMs": 9000, "agentVersion": "V0.4.0 Build 1"
}
```

- 查無：`outcome:"NOT_FOUND"`，`items:[]`、`total:0`。失敗沿用 FAILED 與既有錯誤碼。
- 驗證建議：
  - `keyword` 必須等於工作的 keyword。
  - `items` 最多 **500** 列；每列欄名白名單且不重複：`品號、品名、規格、單位、庫存數量、標準售價`（新增 `ERP_SEARCH_FIELDS`，來源 CYapps `ItemFieldCatalog.SearchList`）。
  - 每列必須有非空「品號」；value 最長 4,096 字。
  - `fields`／`warehouses`／`batches`／`history` 必須是空或省略。
  - `truncated:true` 表示達到 ERP「總資料筆數限制」（預設 500），可能還有更多。
- 品號查詢的 FOUND 規則（「品號」完全相同）不適用於 ITEM_NAME；Agent 端已檢查每筆品名都含關鍵字，服務端可再檢查（比對時不分大小寫與全半形，與 SQL Server LIKE 一致）。
- 大小：500 列約 120 KB，ITEM_NAME 工作的 complete 上限比照含歷史異動工作 **256 KiB**。逾時比照一般工作 180 秒。

## 4. 畫面與保存

- 查詢模組加「品號／品名」切換（或兩個輸入框），品名模式不顯示「查歷史異動」。
- 品名結果以表格列出六欄。手機版可橫向捲動，或卡片顯示品號＋品名＋庫存數量。
  - `truncated` 時提示「結果超過 N 筆，請輸入更完整的品名」。
  - 點一列 → 以該品號建立新的 ITEM_NO 查詢（可帶當時的歷史異動選項）→ 顯示既有品號結果。
- `items` 與其他結果 JSON 相同：完成後 **5 分鐘**清除；metadata 30 天；D1 用 forward migration 加 `query_type`、`keyword`、`items_json`。
- Audit 記員工、查詢類型、品名關鍵字、筆數、耗時，不記清單內容。
- 權限沿用 `ERP_ITEM_QUERY`。

## 5. 測試（只用假資料）

- 建立：關鍵字長度、空白、`'` `%` `_` `[` `]`、控制字元、同時帶 itemNo／includeHistory。
- claim：ITEM_NAME 工作含 queryType／keyword；舊版 agentVersion 不派 ITEM_NAME。
- complete：欄名白名單、缺品號、超過 500 列、keyword 不符、NOT_FOUND 附帶 items、256 KiB 上限。
- 點選清單建立的品號查詢是新工作，各自由 Agent 回報；5 分鐘清除含 items_json。

## 6. Agent 端（已完成，供核對）

- `ErpAgentProtocol.ParseClaim`：`queryType == "ITEM_NAME"` 時讀 `keyword`。
- `SearchBody`：產生 FOUND／NOT_FOUND 與 `items`、`total`、`truncated`，`MaxSearchItems = 500`。
- `ItemNameSearch.cs`：關鍵字規則、條件 `(INVMB.MB002 like N'%關鍵字%')`、結果驗證。
- 測試：`tests/CYERPAutoQuery.Tests/ItemNameSearchTests.cs`。

# ERP 品名搜尋 — CY Web 交接回報

日期：2026-10-16
需求文件：`docs/handoff/ERP_ITEM_NAME_SEARCH_HANDOFF.md`
Current contract：`docs/architecture/ERP_ITEM_QUERY_BRIDGE_CONTRACT.md`

## 本輪實作（V0.7.36）

- 品號及品名查詢共用 `ERP_ITEM_QUERY` Module Access 和既有 D1 工作佇列；品名搜尋不會讀取或修改 CY Web Item 主檔。
- 使用者送出 `POST /api/erp/item-queries`：`{queryType:"ITEM_NAME",keyword:"穴位貼"}`，202；Agent claim `{job:{id,queryType:"ITEM_NAME",keyword,expiresAt,includeHistory:false,historyFrom:null,historyTo:null}}`。品號 mode `ITEM_NO` 繼續接受 itemNo 與 history 欄位。
- `GET /api/erp/item-queries/:id` 回傳 queryType／keyword／items／total／truncated；清單六欄固定 `品號、品名、規格、單位、庫存數量、標準售價`。每筆品號與品名必填；品名含關鍵字（忽略全半形與英文字母大小寫）。
- 禁止空白或非法關鍵字（`'`、`%`、`_`、`[`、`]` 及控制字元）；長度 1～40，錯誤 `INVALID_KEYWORD`。結果不得超 500 筆；品名工作 complete 限 256 KiB。驗證非預期欄位、缺品號、品名不含關鍵字、keyword 與工作不符，均拒收。
- D1 forward migration：`0011_erp_item_name_search.sql` 新增 query_type／keyword／items_json；後端將 `items,total,truncated` 一起儲存至 items_json，5 分鐘後清除，metadata 30 天。Audit 僅記查詢類型、關鍵字、筆數、耗時，不記清單明細。
- 同一查詢頁有「品號／品名」切換。品名模式不顯示歷史異動日期；六欄可水平捲動。點選品號建立新的 `ITEM_NO` 工作，沿用現有品號詳細結果與已設定的歷史異動選項，不重用清單欄位當作主檔。
- **測試階段依使用者指示，不做舊 Agent 版本保護或多套相容 API。** 使用此 Web 版本需搭配可處理 `ITEM_NAME` 的 CYERPAutoQuery V0.4.0 以上。原本的批號／歷史異動及憑證處理未改。

## 驗證

- `scripts/erp-name-search.test.mjs`：關鍵字限制、trim、全半形與英文大小寫。
- `scripts/validate_erp_item_query.py`：完整 forward migration、欄位、舊工作及新清單 JSON 檢查。
- CI：Runtime TypeScript、browser build、source validation、D1 local acceptance、deployment dry-run 與 Governance 以 PR 檢查結果為準。
- 真正 Windows SMART ERP 實機品名搜尋需 CYERPAutoQuery 回傳後測試；CI 不冒充已完成 ERP 實機驗收。

部署與 PR 狀態請以本次 GitHub Actions／PR 紀錄為準，文件不儲存真實 Token 或正式 ERP 資料。

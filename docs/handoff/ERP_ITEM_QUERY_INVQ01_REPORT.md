# CY Web ERP INVQ01／查詢介面交回報告

日期：2026-10-16
來源交接：`docs/handoff/ERP_ITEM_QUERY_INVQ01_HANDOFF.md`（CYERPAutoQuery V0.3.0 Build 1）
目的：完成 CY Web 端相容的 Bridge／UI；現有原 ERP Item Master、CYID 與 Module Access 均不修改。

## 本次完成項目
- Worker `POST /api/erp/item-queries` 接受 `includeHistory,historyFrom,historyTo`；臺北時間為當天，預設一年、最多三年、格式／倒序／未勾日期錯誤為 `INVALID_HISTORY_RANGE`。
- 工作建立、GET、Agent claim 都帶補齊後日期；每次 POST 建立全新工作、無結果重用。
- Agent FOUND 回傳批號庫存（4 欄，最多 100 列）、歷史異動（固定 7 欄／每格 1,024 字／最多 2,000 列／來源順序保留），服務端驗證白名單、筆數、日期／columns／truncated。
- 舊版 Agent 沒有 `batchManaged/history` 也可回 DONE；畫面不顯示批號區塊並提示歷史版本不支援。
- DONE 結果 JSON 5 分鐘清除，metadata 維持 30 天；RUNNING 一般 180 秒／歷史 300 秒，QUEUED 120 秒。
- 新增 forward migration `0010_erp_item_query_invq01.sql`；短期結果仍不進 durable backup。
- UI 上方取消獨立憑證卡片與 Agent 狀態行，改標題旁 Super Admin「連線憑證 · 已連線／未連線」按鈕與既有 Dialog Modal；原有憑證安全規則不變。
- 單頭商品欄左側固定品號／品名／規格／庫存數量（單位）／商品分類（代碼＋名稱），右半全數給多行商品描述；「條碼編號／批號管理」起的下面欄位維持原本雙欄列表。
- 勾選「查歷史異動」才顯示起迄日期選擇器；批號與歷史表格依資料自動顯示。

## 相容及安全
- 舊 `POST {itemNo}` 保持可用；新欄位未勾選歷史時為 false、null、null。
- Batch absent 記為 `batchManaged:null`，不冒充非批號管理。
- `includeHistory:true` 有 history=null 表示 Agent 未支援，仍算成功但明確提醒。
- 現有 token、CYID、ERP 商品主檔、Module Access 不改；Agent 只可 claim/complete，不可藉此讀取任意人的查詢結果。
- 未新增第二個 Worker 或環境；既有測試資料不帶入 Public repo。

## 驗收
- `scripts/erp-query-history.test.mjs`：臺北日期、預設區間、三年邊界與無效格式。
- `scripts/validate_erp_item_query.py`：migration 0010、舊工作預設值、新結果欄位及清理。
- `scripts/erp-item-query-acceptance.mjs`：隔離 D1 假資料 Agent，新增歷史 claim／欄位拒收／FOUND 接收路徑。
- PR CI 預期執行 browser／worker TypeScript、D1 local acceptance、deployment dry-run；**部署是否完成以正式 Actions run 為準**。
- Windows Agent 對實際 SMART ERP INVQ01 的測試由 CYERPAutoQuery 工作線繼續，CY Web CI 不代替實機驗收。

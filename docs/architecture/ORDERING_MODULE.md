# CY Web 叫貨模組（WO-0.9.26）

## 唯一資料與權限責任

- 前端呈現：`src/runtime/modules/OrderingPage.tsx`，重用 `src/ui/layout/MasterDetail.tsx`，逐格輸入元件為 `src/ui/OrderingGrid.tsx`。
- 主資料、驗證、狀態變更與稽核：`worker/http/ordering-routes.ts`，以 `ORDERING` Module Access 在每個 API 進入點驗證。不同裝置共用同一 API。
- 狀態、草稿選擇、數量與 ERP 進貨單號：`shared/ordering.ts`。Excel 輸出：`shared/ordering-export.ts` 與 `shared/xlsx-writer.ts`。
- Schema：`migrations/0022_ordering.sql`；既有表和欄位不直接改 Dashboard。工單半成品經檢查，維持原表名但修正應用層的邊界與驗證。

## 資料表

| 表 | 用途 |
|---|---|
| `ordering_sources` | 台北、台中、洲美、定期中國貨、自訂中國貨、各廠商與自訂來源；停用不刪歷史 |
| `ordering_orders` | 一來源、一週期、一單據；`status` 僅存 `DRAFT/SENT/VOID`；`version` 用於樂觀鎖，`revision` 是送出後顯示版本 |
| `ordering_lines` | 各品項與廠商欄位；非數字數量之 `quantity` 為 NULL；剩餘量可個別結掉 |
| `ordering_receipts`、`ordering_receipt_lines` | 可一張叫貨單多次到貨、每次多列，一張 ERP 單對應到貨明細 |
| `ordering_vendor_items` | 相同來源＋我方品號（或品名）之廠商欄位手動值記憶 |
| `ordering_item_last_source` | 進貨輔助下次帶入同品號上次加入的來源 |
| `ordering_revisions` | 送出後每次內容更新記載版本、時間、操作者與變更摘要 |

`ORDERING` 為單一 Module Access；Super Admin 按共通權限規則可用，其餘須明確授予。

## HTTP 合約

所有 URL 以 `/api/business/ordering` 開頭，回應共用 `{ok,data,requestId}`、失敗 `{ok:false,error,requestId}`。每次進入 Worker 均需 Module Access，無權回 403。

| 方法與路徑 | 功能 |
|---|---|
| GET/POST `/sources`、PATCH `/sources/:id` | 第一次讀取來源時冪等建立預設來源、查詢、新增、更名與停用 |
| GET/POST `/orders`、GET/PATCH `/orders/:id` | 清單搜尋篩選、新草稿、單據詳情、計畫送出日期與備註 |
| POST `/orders/:id/lines` | 增減、編輯、排序一列；附 `expectedVersion`，衝突回 409 `ORDERING_VERSION_CONFLICT` |
| POST `/orders/:id/send`、`/orders/:id/void` | 送出（實際時間與版本 1）、作廢 |
| POST `/orders/:id/receipts` | 只接受合法 `341A-`+11 碼日期單號；單次多品項與剩餘量檢核 |
| POST `/orders/:id/close` | 未到餘額設為缺貨／取消／其他（其他必填原因） |
| GET `/pending` | 所有已送出、未結掉且仍有剩餘量的明細 |
| GET `/vendor-memory`、GET/POST `/last-source`、GET `/item` | 廠商品號記憶、進貨輔助預設來源、最新 ERP 品號資料 |

所有變更寫共用 AuditService。已送出單增修將 `ordering_revisions` 同交易提交；草稿增修只提高樂觀鎖版本，不建立修改紀錄。

## 資源與容量界限（REPOSITORY_RULES §11.3）

- 單張單據明細上限 500 列、到貨紀錄 100 筆、修改紀錄每次最多回 500 筆；超出會拒絕，不靜默截斷。
- 左側歷史列表上限 200 筆、未到貨明細初始掃描至多 1,500 列，超過拒絕並要求縮小範圍。
- 每次逐格只更新一張單／一列與稽核；到貨最多一次 100 列，正常產生一筆到貨主檔＋至多 100 筆到貨明細＋版本與 Audit，避免整張重寫。
- `ordering_*` 是使用者人工輸入的業務資料，本應納入備份。但目前可攜備份 `MAX_ROWS=500`，所以依工單先列入 `EPHEMERAL_TABLES` 暫不納入可攜備份；此為正式資料風險，需在叫貨正式使用前完成 TODO 的分批備份擴容。
- 本次僅於 GitHub 開發分支修改程式碼／測試；未對正式 D1/R2 執行批次資料操作，正式環境讀寫 0 列。上述為程式路徑上界，不等同 D1 計費讀取掃描量。

## 驗收注意

- 工單 §7 的 1440px／390px 實機、送出、廠商合併、定期中國貨、到貨、未到貨、修改紀錄與進貨輔助視窗，由審查者依工作單擷取。
- 叫貨 ERP 單號只儲存手動輸入，不呼叫 ERP 查單或核對、不作單位換算。
- `scripts/ordering.test.mjs` 包含純函式、Excel ZIP/XML、Migration 驗證；需由有完整 checkout 的 GitHub CI 執行確認，不將未跑過的測試視為通過。

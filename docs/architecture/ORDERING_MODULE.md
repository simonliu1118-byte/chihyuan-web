# CY Web 叫貨模組（WO-0.9.26 起，目前 V0.9.41）

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
| POST `/orders/:id/lines` | 僅草稿可新增、刪除及編輯一列；附 `expectedVersion`，衝突回 409 `ORDERING_VERSION_CONFLICT`；送出／作廢後拒絕內容修改 |
| POST `/orders/:id/send`、`/orders/:id/void` | 送出（實際時間與版本 1）、作廢 |
| POST `/orders/:id/receipts` | 只接受合法 `341A-`+11 碼日期單號；單次多品項與剩餘量檢核 |
| POST `/orders/:id/close` | 未到餘額設為缺貨／取消／其他（其他必填原因） |
| GET `/pending` | 所有已送出、未結掉且仍有剩餘量的明細 |
| GET `/vendor-memory`、GET/POST `/last-source`、GET `/item` | 廠商品號記憶、進貨輔助預設來源、最新 ERP 品號資料 |

所有變更寫共用 AuditService。草稿增修只提高樂觀鎖版本，不建立修改紀錄。依使用者 2026-10-23 新指示，送出後內容固定，`PATCH /orders/:id` 與 `POST /orders/:id/lines` 均拒絕；到貨、結掉剩餘量及作廢仍保留原專用流程並同交易提交修訂。這項決策取代早期送出後可直接編輯內容的行為。

## 逐列輸入與儲存（使用者 2026-10-21 更新）

- 一般來源（`GENERAL`）與廠商（`VENDOR`）：我方品名、廠商品名擇一，加上數量，即可儲存及送出。使用者明確允許只填廠商品名與數量；廠商品號為選填。我方品號／品名不因這項規則自動填入廠商識別。
- 定期／自訂中國貨仍需我方品名與數量；原 ERP 品號補入缺少品名、單位及廠商記憶規則保留。
- `POST /orders/:id/lines` 成功回傳完整單據，另外附 `data.savedLineId`，標示本次真正儲存的明細；新列使用安全整數 ID，沿用既有 INTEGER 主鍵，不變更 schema。前端取得確認後才移除暫存列；等待期間的新輸入補寫至同一個已確認 ID，失敗保留輸入，不自動重送失敗請求。
- 切換來源／草稿／未到貨、送出或匯出前先等待明細儲存；仍有未填完整或失敗內容時以中文對話框詢問，取消則保留原輸入。跨模組切換沿用共用未儲存保護，儲存中阻擋離開。
- 開啟既有草稿只查來源的草稿列表與選定單據；新增草稿直接使用 POST 回應，不再重讀列表、來源、歷史及未到貨。草稿逐格儲存也不重讀這些無關列表。歷史仍由原搜尋 effect 取得，已送出單變更後仍更新歷史／未到貨。
- 草稿詳情不查到貨／修改紀錄或逐列累加到貨量；已送出單仍使用完整查詢。保留原查詢容量限制與樂觀鎖。

本輪問題、驗證、交付狀態及可編輯 ListView 評估見 [Claude handoff](../handoff/CYWEB_ORDERING_AUTOSAVE_HANDOFF.md)。

## 緊湊表格與進入頁（V0.9.30，使用者確認）

- 明細維持同一套 `OrderingGrid`，以緊湊格線呈現；每格的 input 持續掛載且可直接輸入，不切換文字／編輯模式。平時透明、無獨立圓角輸入框，焦點格顯示細框；窄欄給數量／單位，品名分配剩餘寬度。只作用於叫貨，不更動全系統控制項。
- 一般／廠商 Enter 順序固定為 **品號 → 品名 → 廠商品號 → 廠商品名 → 數量 → 單位 → 備註 → 下一列品號**。V0.9.29 以前的「數量跳下一列品名」快捷行為依使用者新指示取消。中國貨依實際可見欄位逐格前進，最後備註同樣到下一列品號；IME 組字不中斷。
- 列操作依 2026-10-23 新指示只保留共用 IconButton 的垃圾桶圖示及刪除確認，取消上移／下移／`⋮`；刪除仍納入儲存中與 flush 等待。只有草稿顯示操作欄。
- 模組初始進入未到貨，來源頁籤不預選、不載入或建立草稿；明確點來源後才開草稿。保留原初始來源／未到貨及歷史查詢，未新增遠端查詢。
- 儲存狀態位於右側標題下原「預計日期・N 項・自動儲存」的同一行：轉圈＋儲存中、收到確認後已儲存、失敗紅字儲存失敗；不完整輸入顯示尚未儲存。明細與日期／單據備註均納入狀態；等待期間又修改表頭不會被舊回應誤判已儲存。
- 表格下方移除常駐的儲存狀態及操作說明；原非數字數量警告保留。錯誤仍沿用共用中文回饋，輸入、版本鎖與離開保護不變。
- 本輪僅核准桌面預覽做法；手機完整三欄表格＋單筆表單仍待後續定稿。現行窄版沿用表格區水平捲動及較大觸控格，不新增平行 editor。

## 到貨表格與送出後唯讀（V0.9.32，使用者 2026-10-23）

- 登記到貨沿用共用 Dialog、Field／CheckField／RequiredRows 與表格樣式：每個待到貨品項獨立一列，顯示雙方品號／品名、叫貨、已到、剩餘及本次到貨。勾選才可輸入數量，多列可同次提交；空白、不大於 0 或超過剩餘量仍拒絕。表頭日期維持原生元件、Enter 沿共用表單規則。
- 已有到貨紀錄時，顯示在單據標題後、明細之前；沒有則完全隱藏。取消獨立「到貨狀態」區塊，唯讀明細增加「已到數量」，數量旁以綠色勾／黃色三角驚嘆號分別表示全到／部分到，附中文可存取標示。缺貨／取消等結掉原因仍保留於已到欄；結掉剩餘的入口保留在未到貨清單。
- 送出／作廢後的 OrderingGrid 渲染純文字儲存格，無輸入框、操作欄或空白尾列；表頭日期／備註也改成文字。前後端皆以 `storedStatus === DRAFT` 為內容可編輯條件，仍保留 optimistic lock，防止舊頁籤寫入已送出單。
- 草稿保留七欄 Enter 與自動新增下一列。全部欄位為空／空白的暫存列（包括輸入後清空）不送 API、不阻擋 flush 或送出、不列入品項數；尚有實際內容卻未填完整者仍受離開保護。
- 沒有新增 DB 欄位、migration、遠端查詢或 API roundtrip；新欄完全採現有 received quantity 與 receipt 資料。窄版沿用可橫向捲動的同一張表，不另建卡片編輯器。

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

## D1 50-byte GLOB 修正（V0.9.31 Build 1）

- 正式 D1 的 LIKE/GLOB pattern 上限為 50 bytes；原 0022 對 ERP 單號使用 60-byte GLOB CHECK，會在到貨主檔 INSERT 失敗。前端與 Worker 已驗證日期和 11 碼數字，但 DB 仍需保留防呆。
- 使用前置長度、固定前綴及短模式 `*[^0-9]*` 的 SQL CHECK；以 `0023_ordering_receipt_d1_glob.sql` forward migration 原封保留既有主明細的 PK／FK／索引和數量。原 0022 不修改（正式已套用）。
- migration rebuild 順序重要：新主／新明細並複製 → DROP 舊明細 → DROP 舊主檔 → RENAME 新主／明細，避免 `ON DELETE CASCADE` 誤刪歷史。schema validator 強制 50-byte SQLite 限制並驗證資料完整性。
- `2026-10-23` 正式 Cloudflare log 已證明 `phase=persist`、`LIKE or GLOB pattern too complex`；修正後是否可於正式端到貨成功，仍待部署與實際驗收。

## 到貨失敗診斷（V0.9.31）

- POST receipts 以原 Worker 為唯一寫入者，追蹤 preflight／persist／readback 階段；非預期錯誤的 Worker console 記錄 `[ordering_receipt_failure]`、requestId、phase、受限例外資料，不將表單與個資寫入診斷紀錄。
- D1 batch 已完成但讀回失敗回 `ORDERING_RECEIPT_CONFIRMATION_REQUIRED`（HTTP 503），請先重新載入核對已存在的到貨紀錄，不自動重送；其他非預期結果同樣要求核對。
- 未取得正式 Worker 原始錯誤前不得斷言 D1 schema 或配額是根因。

## V0.9.33–0.9.41 後續變更（摘要）

各版細節見根 `CHANGELOG.md`。

- **來源與廠商頁**（V0.9.33、0.9.36、0.9.39）：廠商草稿為可搜尋的頁籤，個人排序存在 D1（`migrations/0024_ordering_source_preferences.sql`），可拖曳或 Alt＋←／→ 調整；點頁籤直接在下方編輯該廠商草稿。廠商標籤在淺灰框內換行，搜尋、圖例、「＋ 新增廠商」同一列，「其他」最後。草稿與廠商條件放在同一框。頁籤小圓點：灰＝有內容的草稿、藍＝已送出待到貨、橘＝部分到貨（`GET /vendors/status`）。管理來源可分公司內部／外部、自由填寫付款條件、隱藏與恢復。
- **草稿輸入**（V0.9.34–0.9.36）：不完整明細可先儲存，正式送出才檢查必填；廠商品名跟著品名時顯示為空白、以灰字提示；明確清空的單位不會被 ERP 帶回；廠商品號記憶只在確定輸入時套用。
- **已送出單修改與草稿刪除**（V0.9.38）：已送出單「修改」進入編輯模式，按「儲存」一次送出成為新版本並記入修改紀錄（`POST /orders/:id/revise`）；已到貨品項不能刪、數量不能少於已到。未送出草稿可「刪除」（`DELETE /orders/:id`），已送出的仍只能作廢。明細可點欄名排序（只改顯示），不排序時可拖曳項次調整順序。
- **到貨**（V0.9.32–0.9.35）：登記到貨為表格，只列剩餘可到貨品項；送出中停用按鈕避免重複登記。
- **左方清單與未到貨明細**（V0.9.41）：左方清單起訖日同一列；未到貨明細每張叫貨單一張可收合的卡片（來源、叫貨日、未到項數、整張登記到貨）。
- **備份**（V0.9.36）：`ordering_*` 九張表納入可攜備份（不再列於 `EPHEMERAL_TABLES`）。
- **進貨輔助加入叫貨單**（V0.9.35）：從 ERP 查詢的進貨輔助表把品項加入草稿；定期中國貨需選區段，不同單位不合併。V0.9.42 起來源改為點選標籤（`src/ui/OrderingSourceChips.tsx`）：建議列為該品號上次的來源與目前有草稿的來源，其次公司來源，廠商依個人頁籤順序（`GET /preferences/vendors`）並可搜尋；選好自動帶入草稿。


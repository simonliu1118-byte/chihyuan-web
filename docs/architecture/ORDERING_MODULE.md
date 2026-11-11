# CY Web 叫貨模組（WO-0.9.26 起；網站 V0.9.47，叫貨功能持續依主線更新）

> **現行規格優先順序**：以最新 `main` 程式、本文較新的版本段落及 Business Decisions 為準。本文 V0.9.26～0.9.32 的版本段落描述**當時行為**，若與 V0.9.33 之後的行為不同，不能當成現行限制。逐版 PR、正式部署與測試證據參閱根 `CHANGELOG.md`；2026-10-28 前的 GPT／Claude 交接原文與截圖保留在 Git 歷史，不在 active tree 維護重複 handoff。

## 唯一資料與權限責任

- 前端呈現：`src/runtime/modules/OrderingPage.tsx`，重用 `src/ui/layout/MasterDetail.tsx`，逐格輸入元件為 `src/ui/OrderingGrid.tsx`。
- 主資料、驗證、狀態變更與稽核：`worker/http/ordering-routes.ts`，以 `ORDERING` Module Access 在每個 API 進入點驗證。不同裝置共用同一 API。
- 狀態、草稿選擇、數量與 ERP 進貨單號：`shared/ordering.ts`。Excel 輸出：`shared/ordering-export.ts` 與 `shared/xlsx-writer.ts`。
- Schema 以 `migrations/0022_ordering.sql` 為基礎，後續受控 forward migrations 包括 `0023` 到貨 CHECK、`0024` 來源付款／個人排序、`0028` 來源註記；不可直接在 Dashboard 改正式表。

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
| `ordering_user_preferences` | 依登入會員保存個人廠商頁籤順序，與共用來源排序分開 |

`ORDERING` 為單一 Module Access；Super Admin 按共通權限規則可用，其餘須明確授予。

## HTTP 合約

所有 URL 以 `/api/business/ordering` 開頭，回應共用 `{ok,data,requestId}`、失敗 `{ok:false,error,requestId}`。每次進入 Worker 均需 Module Access，無權回 403。

| 方法與路徑 | 功能 |
|---|---|
| GET/POST `/sources`、PATCH `/sources/:id`、POST `/sources/reorder` | 預設來源冪等建立、查詢、新增、更名、付款條件／來源註記、軟隱藏／恢復與共用預設排序；不硬刪歷史 |
| GET/PUT `/preferences/vendors`、GET `/vendors/status` | 會員個人廠商頁籤順序，以及各廠商草稿／待到貨狀態標記 |
| GET/POST `/orders`、GET/PATCH `/orders/:id` | 清單搜尋篩選、新草稿、單據詳情、計畫送出日期與備註 |
| POST `/orders/:id/lines` | 草稿可新增、刪除、編輯及排序單列；可先保存有內容但不完整的明細，完全空白列不建立；附 `expectedVersion`，衝突回 409 `ORDERING_VERSION_CONFLICT`；送出後改走專用 revise 流程 |
| POST `/orders/:id/send`、`/orders/:id/void`、POST `/orders/:id/revise`、DELETE `/orders/:id` | 送出（必填檢核）、作廢、已送出單明確進入修改模式後一次提交新版（V0.9.73 起只限尚未到貨、沒有結掉品項的單，否則 409）、僅草稿可刪除並保留 Audit |
| POST `/orders/:id/receipts` | 只接受合法 `341A-`+11 碼日期單號；單次多品項與剩餘量檢核 |
| POST `/orders/:id/close` | 未到餘額設為缺貨／取消／其他（其他必填原因） |
| GET `/pending` | 所有已送出、未結掉且仍有剩餘量的明細 |
| GET `/vendor-memory`、GET/POST `/last-source`、GET `/item` | 廠商品號記憶、進貨輔助預設來源、最新 ERP 品號資料 |

所有變更寫共用 AuditService。草稿增修只提高樂觀鎖版本；已送出單不允許再走草稿增修路徑，但自 V0.9.38 起可由明確的「修改」模式，經 `POST /orders/:id/revise` 一次提交新版、版本鎖及修訂紀錄。到貨、結掉剩餘量、作廢仍為獨立專用操作，不得以舊草稿 API 繞過檢核。

## 逐列輸入與儲存（使用者 2026-10-21 更新）

- **草稿保存**與**正式送出**分開：任一非空白輸入（如只有品號）即可保存為草稿，完整空白列不寫入；送出時一般來源（`GENERAL`）與廠商（`VENDOR`）仍須我方品名或廠商品名擇一，加上有效數量。只填廠商品名及數量可送出，廠商品號選填。
- 定期／自訂中國貨**送出前**仍需我方品名與數量；草稿未填齊可先保存。ERP 品號補值只在符合當次欄位語意時套用，不能把使用者明確清空的單位／品名自動填回；定期中國貨仍須有來源區段。
- `POST /orders/:id/lines` 成功回傳完整單據，另外附 `data.savedLineId`，標示本次真正儲存的明細；新列使用安全整數 ID，沿用既有 INTEGER 主鍵，不變更 schema。前端取得確認後才移除暫存列；等待期間的新輸入補寫至同一個已確認 ID，失敗保留輸入，不自動重送失敗請求。
- 切換來源／草稿／未到貨、送出或匯出前先等待明細儲存；仍有未填完整或失敗內容時以中文對話框詢問，取消則保留原輸入。跨模組切換沿用共用未儲存保護，儲存中阻擋離開。
- 開啟既有草稿只查來源的草稿列表與選定單據；新增草稿直接使用 POST 回應，不再重讀列表、來源、歷史及未到貨。草稿逐格儲存也不重讀這些無關列表。歷史仍由原搜尋 effect 取得，已送出單變更後仍更新歷史／未到貨。
- 草稿詳情不查到貨／修改紀錄或逐列累加到貨量；已送出單仍使用完整查詢。保留原查詢容量限制與樂觀鎖。

歷次儲存失敗、Enter 鍵、讀回競態及正式驗證結果已歸入本模組的版本段落與根 `CHANGELOG.md`；原一次性交接全文可由 Git 固定提交 `b2d53cdd71c5bf9126f2976607257e892b911df5` 查閱。

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
- **歷史風險已解除（V0.9.36）**：叫貨 `ordering_*` 九張使用者手填業務表已納入可攜備份，不再列於 `EPHEMERAL_TABLES`；目前備份上限為 100,000 列／24 MB。正式是否啟動**排程**仍依 `TODO.md` 的使用者決定，不能把手動備份通過當成排程已開啟。
- 本次僅於 GitHub 開發分支修改程式碼／測試；未對正式 D1/R2 執行批次資料操作，正式環境讀寫 0 列。上述為程式路徑上界，不等同 D1 計費讀取掃描量。

## 驗收注意

- 工單 §7 的 1440px／390px 實機、送出、廠商合併、定期中國貨、到貨、未到貨、修改紀錄與進貨輔助視窗，由審查者依工作單擷取。
- 叫貨 ERP 單號只儲存手動輸入，不呼叫 ERP 查單或核對、不作單位換算。
- `scripts/ordering.test.mjs` 包含純函式、Excel ZIP/XML、Migration 驗證；需由有完整 checkout 的 GitHub CI 執行確認，不將未跑過的測試視為通過。

## D1 50-byte GLOB 修正（V0.9.31 Build 1）

- 正式 D1 的 LIKE/GLOB pattern 上限為 50 bytes；原 0022 對 ERP 單號使用 60-byte GLOB CHECK，會在到貨主檔 INSERT 失敗。前端與 Worker 已驗證日期和 11 碼數字，但 DB 仍需保留防呆。
- 使用前置長度、固定前綴及短模式 `*[^0-9]*` 的 SQL CHECK；以 `0023_ordering_receipt_d1_glob.sql` forward migration 原封保留既有主明細的 PK／FK／索引和數量。原 0022 不修改（正式已套用）。
- migration rebuild 順序重要：新主／新明細並複製 → DROP 舊明細 → DROP 舊主檔 → RENAME 新主／明細，避免 `ON DELETE CASCADE` 誤刪歷史。schema validator 強制 50-byte SQLite 限制並驗證資料完整性。
- `2026-10-23` 正式 Cloudflare log 證明 `phase=persist`、`LIKE or GLOB pattern too complex`；後續 `0023` 已經受控套用、正式到貨驗收成功。發生相似情形仍須用 requestId 與 Worker Logs 核查，不能直接重送以免重複計入。

## 到貨失敗診斷（V0.9.31）

- POST receipts 以原 Worker 為唯一寫入者，追蹤 preflight／persist／readback 階段；非預期錯誤的 Worker console 記錄 `[ordering_receipt_failure]`、requestId、phase、受限例外資料，不將表單與個資寫入診斷紀錄。
- D1 batch 已完成但讀回失敗回 `ORDERING_RECEIPT_CONFIRMATION_REQUIRED`（HTTP 503），請先重新載入核對已存在的到貨紀錄，不自動重送；其他非預期結果同樣要求核對。
- 未取得正式 Worker 原始錯誤前不得斷言 D1 schema 或配額是根因。

## V0.9.33–0.9.43 後續變更（摘要）

各版細節見根 `CHANGELOG.md`。

- **來源與廠商頁**（V0.9.33、0.9.36、0.9.39）：廠商草稿為可搜尋的頁籤，個人排序存在 D1（`migrations/0024_ordering_source_preferences.sql`），可拖曳或 Alt＋←／→ 調整；點頁籤直接在下方編輯該廠商草稿。廠商標籤在淺灰框內換行，搜尋、圖例、「＋ 新增廠商」同一列，「其他」最後。草稿與廠商條件放在同一框。頁籤小圓點：灰＝有內容的草稿、藍＝已送出待到貨、橘＝部分到貨（`GET /vendors/status`）。管理來源可分公司內部／外部、自由填寫付款條件、隱藏與恢復。
- **草稿輸入**（V0.9.34–0.9.36）：不完整明細可先儲存，正式送出才檢查必填；廠商品名跟著品名時顯示為空白、以灰字提示；明確清空的單位不會被 ERP 帶回；廠商品號記憶只在確定輸入時套用。
- **已送出單修改與草稿刪除**（V0.9.38）：已送出單「修改」進入編輯模式，按「儲存」一次送出成為新版本並記入修改紀錄（`POST /orders/:id/revise`）。V0.15.2 起（使用者 2026-11-09）：尚未到貨前可全部修改；部分到貨（含有指定結案的品項）後只能修改廠商品號、廠商品名；結案後不能修改。未送出草稿可「刪除」（`DELETE /orders/:id`），已送出的仍只能作廢。明細可點欄名排序（只改顯示），不排序時可拖曳項次調整順序。
- **到貨**（V0.9.32–0.9.35）：登記到貨為表格，只列剩餘可到貨品項；送出中停用按鈕避免重複登記。
- **左方清單與未到貨明細**（V0.9.41–0.9.42，V0.9.59 Build2修訂）：叫貨紀錄每筆一列（來源、送出日期、狀態），直角橫線分隔；history=1按實際sent_at新到舊，同時間再created_at／id；未送出即作廢置後，草稿不在history且仍按建立時間排序。左方清單起訖日同一列；未到貨明細每張叫貨單一張可收合的卡片（來源、叫貨日、未到項數、整張登記到貨）。
- **備份**（V0.9.36）：`ordering_*` 九張表納入可攜備份（不再列於 `EPHEMERAL_TABLES`）。
- **進貨輔助加入叫貨單**（V0.9.35）：從 ERP 查詢的進貨輔助表把品項加入草稿；定期中國貨需選區段，不同單位不合併。V0.9.42 起來源改為點選標籤（`src/ui/OrderingSourceChips.tsx`）：V0.9.79 起只分公司／廠商兩組，廠商依個人頁籤順序（`GET /preferences/vendors`）並可搜尋，列表最多約五行；有草稿的來源顯示小圓點。上次來源仍由 last-source 預選，選好自動帶入草稿，不另列「建議」。
- **廠商註記**（V0.9.43）：叫貨來源加 `note`（最多 300 字、可換行，`migrations/0028_ordering_source_note.sql`），在「修改叫貨來源」視窗填寫，廠商條件列顯示；`GET /sources` 回 `note`，POST／PATCH 接受 `note`。

### 進貨輔助結果版面（WO-0.9.76／V0.9.79）

- RestockAssist 持有每日明細偏好（localStorage 讀寫 try/catch）、加入成功提示及查詢日期；ERP Job 仍由 OrderingRestockDrawer 的既有 useErpJob 持有。RestockTable 保留篩選、排序、單品號開啟／加入的唯一 owner。
- 桌面預設總計六欄，抽屜有結果時以 780px 為內容寬度上限；開每日明細才放寬到 min(1100px, 100vw - 24px)。排序與庫存不足判斷維持原契約。
- 唯一 scroll owner 是 cy-restock-content；同一區域在每日明細時同時支援橫向移動，表格本身不另建 scroll container，讓單一 thead 的 sticky top:0 相對抽屜內容成立，品號 sticky left 同步固定。沒有複製表頭或第二 renderer。成功 FeedbackBanner 位於內容區外的 flex footer，不受捲動位置影響。
- 820px 以下沿用共用 useCompactLayout，隱藏每日明細選擇且不產生每日欄；680px 以下同一 tbody/tr 以 data-label 卡片呈現，沿用 SidePanel 手機滿版行為，沒有獨立手機業務 state／action。
- 來源與草稿／未到貨 API 均不變，仍僅在打開加入對話框時讀該品號的 draft-items；切換每日明細和本機篩選不發出查詢。

## V0.9.72–V0.9.90 後續變更（2026-11-03）

各版細節見根 `CHANGELOG.md`；工作單原文見 [2026-11-03 固定快照](https://github.com/simonliu1118-byte/chihyuan-web/tree/4cbc554a08c7fdf47a4140c7b9d912f61ce42c10/docs/development/work-orders)。

- **進貨輔助移入叫貨**（V0.9.72，WO-0.9.71）：
  - 進貨輔助從 ERP 查詢移到叫貨頁右側抽屜（共用 `SidePanel`），按鈕為藍色。
  - 抽屜只在打開時，或最近一次進貨輔助查詢仍在執行時才載入結果（V0.9.82）。進叫貨頁時不讀上一次的大筆結果。
  - 加入叫貨單時才查該品號是否已在草稿（V0.9.74）：`GET /draft-items?itemCodes=`，最多 500 個品號，用 migration 0045 的 `ordering_lines(item_code,order_id)` 索引。
  - V0.9.75 起，同一查詢也回傳已送出、仍有未到數量的叫貨單與剩餘數量，避免重複叫貨。
- **送出後的修改限制**（V0.15.2，取代 V0.9.73）：
  - 已送出、尚未到貨：全部可改（品項、數量、備註、新增、刪除、排序）。
  - 部分到貨（含有指定結案的品項）：只能改廠商品號、廠商品名，方便下次叫貨帶入；數量、品號、品名、單位、規格、備註、單據備註、新增、刪除、排序全部鎖住（`revise` 回 422）。編輯時其他格子顯示灰字。
  - 結案（每項都到齊或指定結案）：不能修改，`revise` 回 409，畫面不顯示「修改」。
- **未到貨表格**（V0.15.3）：欄位為品號、品名、廠商品號、廠商品名、叫貨、已到、剩餘、指定結案。每張單上方一顆「登記到貨」（視窗內勾選本次到貨品項）與「開啟叫貨單」，不在每列重複登記到貨。手機用共用 `cy-rt cy-rt-list` 兩行清單。
- **指定結案**（V0.15.2 起改名，原稱「結掉」，與鼎新 ERP 採購單身用語一致）：
  - 入口：未到貨清單與已送出叫貨單明細（狀態欄下方；手機在品項面板），同一個視窗與 `POST /orders/:id/close`。
  - 呈現：顯示在備註欄原有文字下方，備註空白時直接放第一行；選「其他」只顯示原因（例如「自行向廠商訂購」），缺貨／取消顯示選項，有原因時接在後面（V0.15.5）；按鈕在明細最右側獨立窄欄，每列維持一行；不寫入、不覆蓋備註；已到數量欄只顯示數字；狀態為「已指定結案」。
  - 修改紀錄寫成「品名 指定結案：其他（原因）」；舊紀錄的英文代碼與「結掉」字樣在畫面上轉成新說法。
- **到貨紀錄修改與刪除**（V0.9.76，WO-0.9.74）：
  - 已送出單的每筆到貨紀錄可修改（ERP 單號、日期、各品項數量）或刪除：`PUT`／`DELETE /orders/:id/receipts/:receiptId`。
  - 數量不得超過「剩餘量＋這筆原本的數量」；已結掉的品項只能減少。
  - 全站日期欄位改用共用 `DateInput`。
- **未到貨頁籤**（V0.9.77）：
  - 「未到貨」是來源頁籤列最左邊的頁籤，與其他來源之間有分隔線。
  - 左側清單有「顯示未結案」切換，與門市訂購、售後維修共用 `OpenOnlyToggle`。
- **重複叫貨提醒**（V0.9.78）：草稿列的品號、品名、廠商品號或廠商品名與未到貨品項相同時，該列加紅框並提示（`OrderingGrid` 的 `warnRow`）。先填廠商欄位、後填品號時，已填的廠商值不會被清掉。
- **切換來源頁籤**（V0.9.90）：點頁籤立即切換並顯示載入中；一個請求 `GET /drafts/open?sourceId=` 同時回傳草稿清單與要顯示的草稿（原本是兩個請求）。
- **時間量測**（V0.9.89）：每個叫貨 API 回應帶 `Server-Timing: auth;dur=…, total;dur=…`，只有時間，沒有資料。

## V0.12.7 Build 1 手機草稿入口與卡片顯示

- 問題原因：手機初始顯示 MasterDetail 左側紀錄清單，後端 `history=1` 排除 DRAFT；草稿及來源頁籤都位於當時隱藏的 detail 面板。
- 手機上方改「草稿／未到貨／叫貨紀錄」三入口，預設草稿清單使用既有 `GET /orders?status=DRAFT`，只在手機草稿清單可見時取得，無背景輪詢。可搜尋、直接開原草稿、選來源新增；同來源多草稿沿用原 `GET /drafts/open?sourceId=` 與 `OrderingGrid`。
- 切換與返回先走 `prepareSwitch`，保留既有 autosave、未存確認、version conflict、送出／刪除確認及 ERP 加入草稿流程。
- 同一 `OrderingGrid` HTML 只增加 data-label / data-col，在 `.cy-ordering-page` 的手機 CSS 用卡片版面；桌機表格及其他共用 Grid 的顯示與行為不變。未到貨明細同理有標籤卡片。
- 來源 tabs、廠商 tabs 可橫滑；管理來源、進貨輔助在手機版分列顯示。既有 API 最多 200 張，超量目前仍回 409，不自行增加高耗 D1 讀取。

## V0.12.7 Build 1 — 手機導覽更正（取代 Build 0 手機頁籤順序及草稿清單）

- **電腦版所有清單與來源操作都不變**。其 `history=1` 查詢只列已送出及作廢單，不含 `DRAFT`；`GET /pending` 是所有未到貨品項單一資料清單，右側仍依叫貨單收合呈現；草稿透過來源／廠商切換並使用 `GET /drafts/open?sourceId=`。
- 手機三個主要頁籤改為「**叫貨清單／未到貨／草稿**」，預設叫貨清單。清單沿用 `history=1` 的全部查詢／篩選欄位，只在手機收合進階條件。未到貨直接開右側原 `pendingOrders` 明細，不顯示第二層來源 tabs 或返回草稿標籤。
- 手機草稿頁先顯示既有啟用公司來源與廠商列表（含搜尋、廠商個人順序、原狀態點）。點選後使用同一 `openDraft`、`OrderingGrid` 與草稿 chips，無草稿依原本建立。手機**不再預先查所有草稿**，取消原 `GET /orders?status=DRAFT` 全量請求與獨立 mobileDrafts 狀態。
- 手機來源管理與進貨輔助放在草稿來源列表；桌機的 `cy-ordering-tabbar`、原左右雙欄及所有控制、文字與流程維持不變。CSS 修改集中於叫貨手機版斷點，篩選容器桌機 `display:contents` 維持原排版，不增設平行資料 owner。

## V0.12.8 — 手機叫貨密集列表
- 僅 compact（820px 以下）：搜尋、篩選及未結案切換同列，沿用 OpenOnlyToggle、StatusFilter 與既有 list 查詢。
- 未到貨保留原 GET /pending 和按叫貨單收合的明細；手機每項使用品號與品名一行，數量及兩個原操作一行，長品名以省略號處理；桌機仍為原表格。
- 草稿來源仍分公司內部與廠商，改薄分隔清單；公司來源 active 順序、廠商 orderedVendors 個人順序及狀態點皆不變。無額外草稿查詢或儲存流程。
- 不改後端、Excel 分享、未儲存切換保護，PC 雙欄與原各項操作保持不變。

## V0.12.7 Build 1 — 手機 Excel 原生分享

- 手機叫貨單按鈕為「分享 Excel」，以原本 `orderSheet`＋`buildXlsx` 產生完整 XLSX `File`，用 `navigator.canShare({files:[file]})`（若可用）與 `navigator.share({files:[file],title:file.name})` 開啟瀏覽器原生分享面板。只傳實際生成的檔案，不傳 URL 或資料庫連結；不呼叫後端新 API。
- **成功儲存且沒有待處理編輯時**直接在同一次點擊中呼叫 `navigator.share`，不先 `await`，以保留 iOS Safari 的 user activation。草稿尚在自動儲存或正在修改已送出單時，在同一次按鈕操作裡先由專用 `saveForExcelShare` 儲存（不可執行 `prepareSwitch` 的「放棄修改並切換」分支），確定寫入成功才嘗試分享；失敗則停在原畫面保留未存輸入，不匯出舊資料。若 Safari 在網路儲存後失去分享授權，下載**剛儲存的最新 XLSX** 作備援，不要求再按第二次；按鈕永遠顯示「分享 Excel」，儲存狀態不取代文字。
- 使用者取消原生分享（`AbortError`）不顯示錯誤，也不意外下載；無 Web Share files、`canShare` 不接受或分享發生其他錯誤時，下載同名 XLSX 為備援。Safari 的 Object URL 延遲釋放。
- **桌機保留原本的 Blob 與 `a.download`、`URL.revokeObjectURL` 下載分支**，原 Excel 的工作表格式、品項內容、檔名與權限皆不改。共用業務程式仍由 `OrderingPage` 為單一 owner。

## V0.12.9 — 進貨輔助重複品項取消
同一草稿、相同品號／單位／區段有未結掉的既有列時，進貨輔助加入對話框提供「取消」、「新增一列」、「加到既有列」三種獨立選項。取消只關閉選擇，不改草稿品項或上次來源；其餘兩種仍用同一 save line API 與既有數量合併規則。桌機與手機共用，同一 Ordering business/Mutation owner 不變。

## V0.18.5 — 自訂中國貨採購

- 入口：已送出（SENT）的 `CN_CUSTOM` 叫貨單上「叫貨明細｜採購」切換；權限代碼 `ORDERING_CN_PURCHASE`（需 `ORDERING`，`MODULE_REQUIREMENTS`）。
- API：`GET /api/business/ordering/orders/:id/cn-purchase`；`PUT …/cn-purchase/{order|reconcile|shipping|tax|returns}`；`POST …/cn-purchase/{complete|discontinue|restore}`。全部帶 `expectedVersion`，經同一個 `mutate()`（版本鎖＋修改紀錄＋稽核），回傳 `{order, purchase}`。實作在 `worker/http/ordering-cn-routes.ts`。
- 資料（migration 0064）：`ordering_cn_purchases`（完成訂購時間／人）、`ordering_cn_charges`（CARD／SHIPPING／TAX，台幣整數）、`ordering_cn_pieces`（品項拆段：數量、人民幣單價（分）、所屬刷卡）、`ordering_cn_returns`（每品項一筆）。`ordering_lines` 加 `original_quantity`、`purchase_added`、`cn_discontinued`。
- 採購數量＝各段數量合計，寫回 `ordering_lines.quantity`（到貨、未到貨照舊以它為準）；第一次改動時把原數量留在 `original_quantity`。已有採購段的品項，「修改」叫貨單不能再改數量或刪除。
- 絕版／停產＝`closed_as='OTHER'`＋`cn_discontinued=1`，恢復時清除；已刷卡或有退貨的品項不能標記。
- 計算與表格列順序在 `shared/cn-purchase.ts`（`computeCnPurchase`、`cnTableRows`、`cnStage`），前端 `CnPurchasePanel.tsx`。

## V0.18.6 — 自訂中國貨每列照片

- `ordering_line_photos`（`line_id` 主鍵，一列一張）；JPEG 存在 `HR_FILES` R2，key `ordering/{orderId}/{lineId}/{uuid}.jpg`。
- API：`GET|PUT|DELETE /api/business/ordering/orders/:id/lines/:lineId/photo`（`PUT` 本體為 `image/jpeg`，≤1 MB、長邊 ≤2000px；前端先縮到 1280px）。只限 `CN_CUSTOM`；結案或作廢後拒絕上傳。照片不改叫貨單版本、不進修改紀錄，只記稽核。
- 清除：每次 `mutate()` 寫入成功後 `sweepPhotos()`：品項已不存在的照片、以及叫貨單變成結案／作廢時的全部照片，先刪 R2 檔再刪列；刪除草稿後也會清。

## V0.18.6 — 自訂中國貨分「商品／書籍」

- 區段代碼依來源種類解讀（`shared/ordering.ts` `orderingSections()`）：定期中國貨 `SINGLE/BAG/OTHER`；自訂中國貨 `''`＝商品、`'OTHER'`＝書籍；其他來源只有 `''`。沿用 `ordering_lines.section` 既有 CHECK，不重建表。
- `ordering_lines` 加 `publisher`、`author`（≤200 字）。書籍區欄位：品號、品名、出版社、作者、數量、單位、備註；商品區沿用規格。出版社排序依序比較出版社、作者、品名。migration 0066 把既有自訂中國貨有規格的列移到書籍並以第一個「/」拆成出版社與作者；可攜式備份有對應升級步驟。匯出 Excel 書籍規格欄寫「出版社/作者」。

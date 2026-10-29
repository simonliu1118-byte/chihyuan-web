# ERP 查詢 Bridge — CY Web current contract

狀態：CY Web ERP 查詢實作契約（本契約最新功能更新 V0.9.43；全站目前 V0.9.47）。涵蓋 ERP 查詢頁（商品、客戶、供應商、進貨輔助、未收款、排程佇列）與 CYERPAutoQuery Agent 佇列；不改變既有 Item／Customer 主檔權威。

## ERP 查詢目前狀態總覽（最近功能規格 V0.9.43）

下面各節依版本累積寫成；較早的段落若與本節不同，以本節與較新的段落為準。

- **頁面**：導覽只有「ERP 查詢」（route `erp-item-query`）。類別依權限顯示：商品 `ERP_ITEM_QUERY`、客戶 `ERP_CUSTOMER_QUERY`、供應商 `ERP_SUPPLIER_QUERY`、進貨輔助 `ERP_RESTOCK_ASSIST`（需同時有商品與客戶查詢權限）、未收款 `ERP_RECEIVABLE_QUERY`；類別列右側「排程佇列」按鈕打開右側欄（V0.9.43 起不遮住頁面）。標準進價另需 `ERP_ITEM_COST`。舊連結 `#restock-assist` 轉到 ERP 查詢。
- **查詢類型**：`ITEM_NO`、`ITEM_NAME`、`CUSTOMER_NO`、`CUSTOMER_NAME`、`SALES`、`SUPPLIER_NO`、`SUPPLIER_NAME`、`PURCHASES`、`RECEIVABLE`、`ORDER`、`RESTOCK`（權限對照見 `MODULES_FOR_TYPE`）。
- **佇列**：每位成員最多 3 筆 QUEUED／RUNNING；Agent 一次執行一筆，依送入時間領取；ERP 暫停時可加入佇列，暫停結束後才領取（V0.9.43）。排隊工作在 Agent 連線或執行中時等待，Agent 離線（無 RUNNING、60 秒內無 claim）且建立超過 120 秒才 `EXPIRED`，最長 60 分鐘。
- **RUNNING 逾時**：一般 180 秒、含歷史異動 300 秒、報表類（SALES、PURCHASES、RECEIVABLE、ORDER）600 秒、RESTOCK 1800 秒，逾時為 `FAILED/AGENT_TIMEOUT`。
- **保存**：結果 JSON 完成後 5 分鐘清除（`resultCleared:true`），metadata 30 天；進貨輔助另把每日銷貨彙總寫入 `erp_sales_*`（不隨查詢清除）。
- **使用者 API**：`POST /api/erp/item-queries`、`GET /api/erp/item-queries/:id`、`GET /api/erp/item-queries/recent`、`GET /api/erp/queue`、`GET /api/erp/agent-status`、`POST /api/erp/agent-control`、`GET|POST|DELETE /api/erp/agent-credentials`（Super Admin）。
- **Agent API**：`POST /api/erp-agent/item-queries/claim`（回 `{job,control}`）、`POST /api/erp-agent/item-queries/:id/complete`、`POST /api/erp-agent/item-queries/:id/progress`（RESTOCK）、`POST /api/erp-agent/control`。
- **前端**：ERP 查詢頁開過後切到其他模組仍保留；每個類別各自保留查詢與結果，每 1.5 秒輪詢；開啟時接回近 24 小時內各類別最新的查詢；類別不在畫面上時完成會出通知。查詢失敗（ERP 未開、畫面不符、匯出失敗、程式錯誤、逾時）時詢問是否強制關閉 ERP。
- **Migration**：0009–0014、0019、0021、0025、0026、0027。

## 範圍與資料權威

- 已登入並擁有 `ERP_ITEM_QUERY` Module Access 的使用者可送出 **單筆** ERP 品號查詢。
- 公司 Windows 電腦上的 CYERPAutoQuery 以 outbound HTTPS 主動 claim；ERP 只讀、畫面查詢／轉出 Excel／本機過濾／回報。
- CY Web 只存短期結果，不會寫入 ERP、改寫 Item 主檔或同步 ERP 資料庫。
- BD-002、BD-004 的 ERP 主檔權威不變；BD-003 長期最小權限 DB 讀取是獨立演進方向，畫面匯出方案只是過渡 Bridge。
- 暫不實作批次查詢、主檔同步、Item 欄位自動帶入，也不需要公司端開放入站連接埠。

## 固定欄位

單頭依 Agent 回報順序展示，共 **21** 欄，唯一欄位清單為
`shared/erp-item-query.ts` 的 `ERP_ITEM_FIELDS`，來源為
CYapps `apps/CYERPAutoQuery/ItemFieldCatalog.cs`：

`品號、品名、規格、單位、庫存數量、商品分類、商品分類名稱、商品描述、條碼編號、批號管理、有效天數、主供應商、主供應商名稱、標準進價、標準售價、售價定價一、售價定價二、售價定價三、售價定價四、售價定價五、售價定價六`。

每庫別 **8** 欄：

`庫別、庫別名稱、儲位、安全存量、經濟批量、上次盤點日、最近入庫日、最近出庫日`。

兩者皆為 `{name:string,value:string}` 陣列；庫別型態為二維陣列。服務端拒收未知或重複欄名，單個 value 最大 4,096 字，最多 100 庫別；一般 complete JSON 不超過 96 KiB，含歷史異動工作不超過 256 KiB。成本、庫存金額等其他 ERP 欄位禁止傳送。所有日期、數字、代碼由 Agent 按 ERP 顯示語意轉成字串，服務端不做價格或庫存計算；商品描述可包含換行。

## 使用者 API

全部 same-origin `/api/*`、既有 `{ok,data|error,requestId}`、`Cache-Control: no-store`。

| Method | Path | 語意 |
| --- | --- | --- |
| POST | `/api/erp/item-queries` | `{"itemNo":"T0001"}`，成功 HTTP 202 `{id,itemNo,status:"QUEUED",createdAt}` |
| GET | `/api/erp/item-queries/:id` | 僅建立者／Super Admin；回工作狀態、結果及過期欄位 |
| GET | `/api/erp/agent-status` | `{online,lastSeenAt,agentVersion,erpState}`；15 秒內心跳才 online |
| GET | `/api/erp/agent-credentials` | Super Admin 專用，僅回 `{configured,createdAt,revokedAt}` |
| POST | `/api/erp/agent-credentials` | Super Admin 專用，立即產生／輪換一組憑證，`{token,createdAt}` 僅本次顯示明文 |
| DELETE | `/api/erp/agent-credentials` | Super Admin 專用，撤銷憑證並使舊 Token 即時失效 |

`itemNo` 去前後空白後長 1～40 字，不可含空白／控制字元。同使用者同時最多一筆 QUEUED／RUNNING（V0.9.41 起改為三筆）；衝突 HTTP 409。讀取工作時使用 CYID session 與**每次即時** Module Access 驗證；Agent token 無權使用使用者 API。

工作狀態：`QUEUED → RUNNING → DONE | NOT_FOUND | FAILED`，`QUEUED → EXPIRED`；建立後排隊 120 秒過期（V0.9.41 起改為 Agent 離線才過期，見總覽）、RUNNING 一般工作逾 180 秒、含歷史異動逾 300 秒未回報視為 `FAILED/AGENT_TIMEOUT`。前端每 1.5 秒輪詢直到結束，離線顯示提示。狀態清理於讀取／claim 順便執行，不依賴新 cron。完成後 5 分鐘清除 fields／warehouses／batches／history，metadata 保留 30 天；清除後 DONE 仍有 `resultCleared:true`。ERP 短期佇列、heartbeat、Agent 憑證 hash 不納入長期備份，復原後須由超級管理員重新產生憑證。Audit 僅記員工、查詢品號、結果與耗時，不記欄位值。

## Agent API

使用唯一目前有效的 Bearer token；只有兩個 endpoint 可用。Token 是 Super Admin 在網頁建立的 32 bytes 隨機值（base64url），資料庫只保存 SHA-256 hex。Super Admin 換發／撤銷即刻停用舊 token（包括原先 claim 的工作回報）。原文明文只在建立時回傳一次；公司端應以 Windows DPAPI 安全保存，不寫進 repo、URL 或 LOG。

| Method | Path | 回傳 |
| --- | --- | --- |
| POST | `/api/erp-agent/item-queries/claim` | `{"agentVersion":"0.1.0","erpState":"BROWSE"}` → `{job:{id,itemNo,expiresAt}}` 或 `{job:null}`；同時更新心跳（距上次寫入未滿 10 秒且版本／ERP 狀態不變時不重寫，避免閒置輪詢每次都寫 D1） |
| POST | `/api/erp-agent/item-queries/:id/complete` | body 見下，回 `{id,status,completedAt}` |

完整 FOUND 示例（只用假值）：

```json
{
  "outcome": "FOUND",
  "fields": [{"name":"品號","value":"T0001"},{"name":"品名","value":"假品名"}],
  "warehouses": [[{"name":"庫別","value":"W01"},{"name":"庫別名稱","value":"測試倉"}]],
  "errorCode": null,
  "errorMessage": null,
  "elapsedMs": 14230,
  "agentVersion": "0.1.0"
}
```

查無資料：`{"outcome":"NOT_FOUND","fields":[],"warehouses":[],"elapsedMs":14000,"agentVersion":"0.1.0"}`。

查詢失敗：`{"outcome":"FAILED","fields":[],"warehouses":[],"errorCode":"ERP_BUSY","errorMessage":"ERP忙碌","elapsedMs":500,"agentVersion":"0.1.0"}`。錯誤訊息會被服務端固定中文映射取代，避免原始路徑／帳密洩露。

允許的 FAILED `errorCode`：`ERP_NOT_OPEN`、`ERP_BUSY`、`ERP_STATE`、`EXPORT_FAILED`、`CANCELLED`、`INTERNAL`、`ERP_SEATS_FULL`（V0.9.37 起，ERP 登入時顯示「人數已滿」；CY Web 顯示「ERP 人數已滿，請稍後再查詢」）；`AGENT_TIMEOUT` 為 CY Web 系統狀態，Agent 不可自行回報。FOUND 的「品號」必須與工作請求的品號**完全相同（區分大小寫）**：SMART ERP 品號區分大小寫（使用者 2026-10-16 確認），例如輸入小寫 `c00154` 在 ERP 查不到 `C00154`，應回 NOT_FOUND，不得轉換大小寫。claim 以單一 D1 原子 UPDATE 領取，已有 RUNNING 時返回 `job:null`，同時至多一筆執行中。Agent 閒置 2～3 秒輪詢，錯誤退避至 30 秒。

## 主要錯誤碼

| HTTP | Code | 情境 |
| --- | --- | --- |
| 400 | `INVALID_ITEM_NO` / `INVALID_CODE` / `INVALID_KEYWORD` / `INVALID_QUERY` | 品號、代號、關鍵字或欄位組合不符 |
| 400 | `INVALID_AGENT_RESULT` / `INVALID_OUTCOME` | Agent payload 不符白名單／欄位重複／狀態不符 |
| 401 | `AUTH_REQUIRED` / `AUTH_INVALID` | 使用者未登入或 session 無效 |
| 401 | `AGENT_UNAUTHORIZED` | Agent 憑證缺少、錯誤或已撤銷 |
| 403 | `ACCESS_DENIED` | 無模組權限或非 Super Admin 的憑證管理 |
| 404 | `QUERY_NOT_FOUND` | 工作不存在或使用者不可讀 |
| 409 | `QUERY_ALREADY_ACTIVE` / `QUERY_NOT_RUNNING` | 已有 3 筆未完成查詢、重複完成或 claim 權限失效 |
| 409 | `ERP_HELD` | ERP 暫停中，暫停結束前不能建立查詢 |
| 503 | `IDENTITY_UNAVAILABLE` | CYID 暫時無法確認授權 |

## 驗收邊界

資料表 forward migration 為 `migrations/0009_erp_item_query_bridge.sql`，不重寫既有 migration。使用者經既有帳號頁 Module Access 發放 `ERP_ITEM_QUERY`，Super Admin 自動擁有。測試使用假品號／假 ERP 值，不使用真實 ERP export。公司端 Agent 可依 `scripts/erp-item-query-acceptance.mjs` 對同一 API 契約測試。CY Web V0.7.33 已於 2026-10-16 經既有受控部署流程套用 migration 並上線（[部署 Run #38851754742](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/38851754742)）。這僅代表 CY Web Worker／D1 與正式網域的部署驗證通過，不代表 Agent 已連線實際 SMART ERP；後者需 CYERPAutoQuery 實機驗收。

## INVQ01 批號庫存與歷史異動（V0.7.34）

這一節已整合舊版 INVQ01 跨 repo 交接及回報（CYERPAutoQuery V0.3.0 Build 1）；現行契約以本節及開頭的最新狀態總覽為準，舊原文只保留在 Git 歷史。原 `ITEMS` 主檔與權限邊界不變。

- `POST /api/erp/item-queries` 保留原 `{itemNo}` 語意，可加 `includeHistory:boolean`（預設 false）、`historyFrom`、`historyTo`（`YYYY-MM-DD` 或 null）。未勾選不能帶非 null 日期。
- 全介面與後端共用 `resolveHistoryRange`，使用**臺北當日**。迄未填取今天、起未填取迄往前一年同月同日（不再加一天）；起訖都未填即最近一年。閏日遇平年收斂至二月底。迄不可晚於今天、起不可晚於迄；迄日不得超過起日往後三個曆年，三年周年當天可用、下一天拒絕。例如 `2023-01-01..2026-01-01` 允許、`..2026-01-02` 拒絕；`2021-02-28..2024-02-29` 亦拒絕。錯誤 400 `INVALID_HISTORY_RANGE`，不建立工作。此規則適用桌機、平板、手機及直接 API 請求。
- 建立工作將補齊後 `includeHistory/historyFrom/historyTo` 存在 D1，傳給 Agent claim 並由 GET 回傳；未查歷史則兩日期為 null，前 migration 工作使用預設 false。
- Agent FOUND 可傳 `batchManaged:boolean` 與 `batches`（最多 100 列）；每列是白名單 `批號、庫存數量、入庫日、有效日期` 的 `{name,value}` 陣列，欄位不可重複。false 時必須空陣列。缺少 batchManaged 視為舊版 Agent，不顯示批號區。
- 若要求歷史異動，FOUND `history` 可為物件 `{from,to,columns,rows,total,truncated}`：日期須等於工作起迄；`columns` 須按 `日期、單別-單號-序號、庫別、庫別名稱、入出別、異動數量、備註` 精確排序。每列 7 個字串、每格最多 1,024 字、最多 2,000 列、`total>=rows.length`、`truncated=(total>rows.length)`；Agent 依 ERP 順序返回最新 2,000 列。若舊 Agent 無 history，工作 DONE 但顯示版本不支援提醒。
- 未要求歷史時不允許附 history；NOT_FOUND／FAILED 不允許帶非空 batches 或 history。批號管理非空但 `batchManaged:false` 也拒收。
- **每次 POST 都建立新工作並重新執行 ERP**（仍受單人一筆未完成工作限制）；不從舊工作結果作快取。
- 保存規則：完成後 5 分鐘清除所有結果 JSON，30 天後刪除 metadata；`resultCleared` 保持可追蹤。一般 RUNNING 180 秒／歷史 RUNNING 300 秒逾時，QUEUE 120 秒不變。
- 前端「查歷史異動」勾選後可用原生日期選擇器輸入起迄、保留空值取得預設範圍。結果自動展示批號庫存及（有要求時）歷史異動；小螢幕表格可水平捲動。
- 正式 schema 新增 `migrations/0010_erp_item_query_invq01.sql`，不覆寫 0009；寫入 `include_history,history_from,history_to,batch_managed,batches_json,history_json`，與現有身分及 Agent 認證同源。

## 品名包含查詢（V0.7.36）

這一節已整合舊版品名搜尋交接與回報（CYERPAutoQuery V0.4.0 Build 1）；現行契約以本節及開頭狀態總覽為準，舊原文只保留在 Git 歷史。

- 使用者 `POST /api/erp/item-queries` 新增 `{"queryType":"ITEM_NAME","keyword":"穴位貼"}`。品號模式固定 `{"queryType":"ITEM_NO","itemNo":"T0001",...history}`。品名查詢不接受 itemNo、歷史異動或起訖日期；兩種類型共用 `ERP_ITEM_QUERY` 權限、單人一筆未完成工作與全域單 Agent 佇列。
- keyword 去頭尾空白後 1～40 字，可含內部空白，不可有控制字元、單引號、`%`、`_`、`[`、`]`；無效回 `400 INVALID_KEYWORD`。CYWEB 不得傳 ERP 欄名、SQL 或 LIKE 條件；條件固定由 CYERPAutoQuery 建立。
- Agent `POST /api/erp-agent/item-queries/claim`：ITEM_NAME 回 `{job:{id,queryType:"ITEM_NAME",keyword,expiresAt,includeHistory:false,historyFrom:null,historyTo:null}}`。ITEM_NO 仍回 itemNo／history。測試階段不做舊 Agent 版本偵測或額外兼容分流；須使用可理解 ITEM_NAME 的 AUTOQUERY。
- Agent ITEM_NAME complete body：`{outcome:"FOUND"|"NOT_FOUND"|"FAILED",keyword,fields:[],warehouses:[],items,total,truncated,elapsedMs,agentVersion}`。每列 items 是六欄 `品號、品名、規格、單位、庫存數量、標準售價` 的 `{name,value}` 陣列，最多 500 列、每個 value 最多 4,096 字；欄名唯一。必須有非空品號與品名，品名須包含關鍵字（Unicode NFKC 正規化、不分英文字母大小寫）。品名工作不得回傳單頭／庫別／批號／歷史詳細資料。
- FOUND 的 items 不可為空；NOT_FOUND 的 items 必須空且 total 為 0；FAILED 不可夾帶清單，錯誤碼沿用現有白名單。total 為非負整數且不小於 items 列數；truncated 為布林值，即使 total=500 也可能 true（ERP 的總筆數上限）。品名 complete 最多 256 KiB。
- GET 工作增加 `queryType`、`keyword`、`items`、`total`、`truncated`。清單經 D1 `items_json` 暫存，5 分鐘後清除，metadata 30 天；不寫入商品主檔、不快取成正式資料。Audit 記 queryType、keyword、筆數、elapsedMs，不記清單內容。
- 前端在同一模組切換「品號／品名」，品名模式隱藏歷史異動。結果顯示六欄與超過上限提示；點選一筆品號會建立**新的 ITEM_NO** 工作並重新向 Agent 查完整單頭、庫別、批號與（若勾選）歷史異動。
- 使用 forward migration `migrations/0011_erp_item_name_search.sql` 擴充 query_type、keyword、items_json，不重寫既有 migration。因底層既有 schema `item_no` 不可為空，ITEM_NAME 工作內部存固定占位代碼 `ITEM_NAME`；API 不對外回傳此占位。

## 客戶、銷貨銷退單、未收款與商品成本權限（V0.8.0）

來源：使用者 2026-10-17 決定；CYERPAutoQuery V0.7.1（COPI01、COPR15＋COPR16、ACRR18）。本節不改 CY Web Customer 主檔權威，ERP 結果只短期暫存。

- **單一入口**：導覽只有「ERP 查詢」一個頁面（route `erp-item-query`），桌機以頁籤、手機以下拉切換「商品／客戶／未收款」（同一 category state，只是 presentation 不同）。只顯示使用者有權限的類別。
- **Module Access**（`migrations/0012_erp_customer_sales_receivable.sql`）：`ERP_ITEM_QUERY`「ERP 商品查詢」（原權限）、`ERP_CUSTOMER_QUERY`「ERP 客戶查詢」（客戶資料＋銷貨銷退單）、`ERP_RECEIVABLE_QUERY`「ERP 未收款查詢」，任一即可進入頁面；`ERP_ITEM_COST`「ERP 商品成本」不是頁面，只決定是否可見「標準進價」。Super Admin 自動全有。`shared/modules.ts` 以 `moduleCodesForRoute` 表達「一頁可由多個權限其一開啟」。
- **標準進價**：建立 ITEM_NO 工作時依當下 `ERP_ITEM_COST` 記 `include_cost` 並在 claim 傳 `includeCost`；Agent 只在 true 時送出。Worker 在 include_cost=0 時一律不儲存，GET 再依讀取者當下權限過濾。測試階段不做向下相容（使用者 2026-10-17）。
- **使用者 API**（同 `POST /api/erp/item-queries`，每種類型只接受自己的欄位，其他欄位 400 `INVALID_QUERY`）：
  - `{"queryType":"CUSTOMER_NO","customerCode":"CU0001"}`、`{"queryType":"CUSTOMER_NAME","keyword":"假"}`（關鍵字規則同品名）。
  - `{"queryType":"SALES","customerCode":"CU0001","dateFrom":null,"dateTo":null}`：單據日期與歷史異動共用 `resolveDateRange`（未填＝去年同月同日至臺北今天、最多三個曆年），錯誤 400 `INVALID_DATE_RANGE`。
  - `{"queryType":"RECEIVABLE","scope":"CUSTOMER"|"SALESPERSON"|"ALL","code":"…"}`；ALL 不可帶 code。
  - 品號、客戶代號、業務員代號一律 1～40 個英文字母、數字或「-」，第一個字須為英文字母或數字（使用者 2026-10-21；與 Agent V0.10.2 Build 4 相同），否則 400 `INVALID_ITEM_NO`／`INVALID_CODE`。
  - GET 增加 `code`、`scope`、`dateFrom`、`dateTo`、`orders`、`bills`；讀取時再次即時檢查該類型的 Module Access。
- **Agent claim**：body 必須帶 `queryTypes`（Agent 支援的類型），缺少或含未知類型回 400 `INVALID_AGENT_REQUEST`；只派這些類型的工作。回傳依類型只含所需欄位：CUSTOMER_NO `customerCode`、CUSTOMER_NAME `keyword`、SALES `customerCode,dateFrom,dateTo`、RECEIVABLE `scope,code`、ITEM_NO 另加 `includeCost`。
- **Agent complete**（非 FAILED 時都要回聲工作識別，Worker 逐一比對）：
  - CUSTOMER_NO：`customerCode`＋`fields`（19 欄白名單 `ERP_CUSTOMER_FIELDS`）；FOUND 的「客戶代號」須與工作完全相同。
  - CUSTOMER_NAME：同品名清單格式，欄位為 `客戶代號、客戶簡稱、客戶全名、TEL、統一編號、業務人員`，每列簡稱或全名須含關鍵字。
  - SALES：`customerCode,dateFrom,dateTo,orders,total,truncated`；最多 1,000 張單、每張 500 行。單據 `kind` 為「銷貨」或「銷退」，客戶須為工作客戶、日期須在範圍內；金額數量為 ERP 顯示字串。銷退行 `sourceOrder` 為 ERP 原樣「單號-序號」或空字串。
  - RECEIVABLE：`scope,code,bills,total,truncated`；最多 3,000 張結帳單、每張 500 憑證；CUSTOMER／SALESPERSON 範圍的每張結帳單客戶／業務員代號須相符。
  - 報表類（SALES、RECEIVABLE）complete 上限 900 KiB；RUNNING 逾 600 秒視為 `AGENT_TIMEOUT`（品號 180 秒、含歷史 300 秒不變）。結果存 `result_json`，與其他結果同樣 5 分鐘清除。
- **呈現與分析屬 CY Web**（使用者 2026-10-17：Agent 只當中介層）：銷退單有原銷貨單時排在該銷貨單下並互相連結，原銷貨單不在查詢範圍時標示；沒有原銷貨單者依日期獨立排列（`shared/erp-sales-links.ts`）。未收款依客戶分組並由 CY Web 加總小計。客戶名稱查詢只有一筆時自動接續查該客戶（客戶資料、銷貨銷退單或未收款）。

## 單筆銷貨／銷退單與金額顯示（V0.8.1）

來源：使用者 2026-10-17（查看未收款憑證「賣了什麼」，但不離開已查好的未收款頁）。CYERPAutoQuery V0.7.2。

- 新類型 `ORDER`：`{"queryType":"ORDER","orderNo":"232A-20260804003"}`。單號格式為單別、`-`、數字；只接受 23 開頭（銷貨單，COPR15）與 24 開頭（銷退單，COPR16），其他（如 631A）回 400 `INVALID_CODE`。`ERP_CUSTOMER_QUERY` 或 `ERP_RECEIVABLE_QUERY` 任一即可（`MODULES_FOR_TYPE`，讀取時同樣即時檢查）。單號存於 `target_code`（`migrations/0013_erp_order_query.sql` 擴充 query_type CHECK）。
- claim：`{id,queryType:"ORDER",orderNo,expiresAt}`。complete：`{outcome,orderNo,orders,total,truncated,…}`，orders 結構同 SALES，每張的 `orderNo` 須等於工作單號（客戶與日期不限）。屬報表類：600 秒逾時、900 KiB 上限、`result_json` 5 分鐘清除。
- 畫面：未收款的憑證號碼（23x／24x）可點，開 `ErpOrderDialog` 以自己的短工作查詢該單並展開明細；頁面原本的未收款結果不變。
- CY Web 顯示的 ERP 金額一律加 `$`（`erpMoney`：`1420`→`$1,420`、`-3250`→`-$3,250`），包括未收款、銷貨銷退單與商品價格欄位；API 值仍為 ERP 字串。

## 供應廠商查詢（V0.8.4）

來源：使用者 2026-10-17（供應廠商 PURI01，頁面／流程／作法同客戶資料）。CYERPAutoQuery V0.9.0。

- 新 Module Access `ERP_SUPPLIER_QUERY`「ERP 供應商查詢」（同一個 ERP 查詢入口的「廠商」頁籤；之後的進貨單也歸此權限，因含進貨價格）。`migrations/0014_erp_supplier_query.sql` 擴充 module_code 與 query_type CHECK。
- 新類型 `SUPPLIER_NO`：`{"queryType":"SUPPLIER_NO","supplierCode":"B0009"}`（英數，存於 `target_code`）；`SUPPLIER_NAME`：`{"queryType":"SUPPLIER_NAME","keyword":"假"}`（規則同品名）。
- claim：`{id,queryType:"SUPPLIER_NO",supplierCode,expiresAt}`／`{id,queryType:"SUPPLIER_NAME",keyword,expiresAt}`。
- complete：SUPPLIER_NO 回聲 `supplierCode`＋`fields`（24 欄白名單 `ERP_SUPPLIER_FIELDS`，FOUND 的「廠商代號」須與工作相同）；SUPPLIER_NAME 同名稱清單格式，欄位 `廠商代號、廠商簡稱、廠商全名、TEL、FAX、統一編號`，每筆簡稱或全名須含關鍵字。客戶與廠商在 Worker 共用 `PARTIES` 驗證。
- 新類型 `PURCHASES`（使用者 2026-10-18，進貨退貨單，同客戶的銷貨銷退單）：`{"queryType":"PURCHASES","supplierCode":"B0055","dateFrom":null,"dateTo":null}`，日期規則同 SALES（都未填為去年同日至今天、最多三年），存於 `target_code`／`history_from`／`history_to`。屬報表類（600 秒、900 KiB）。
  - claim：`{id,queryType:"PURCHASES",supplierCode,dateFrom,dateTo,expiresAt}`。
  - complete：回聲 `supplierCode`、`dateFrom`、`dateTo`＋`orders`（最多 1,000 張、每張 500 行）。每張 `kind` 進貨／退貨、`orderNo`、`date`（須在範圍內）、`supplierCode`（須等於工作）、`supplierName`、`supplierOrderNo`、`invoiceNo`、`invoiceType`、`taxType`、`currency`、`totalQuantity`、`amount`、`deduction`、`tax`、`total`、`settled`、`lines`；每行 `seq`、`itemCode`、`itemName`、`specification`、`acceptDate`（yyyy-MM-dd 或空）、`warehouse`、`quantity`、`acceptedQuantity`、`returnedQuantity`、`unit`、`unitPrice`、`amount`、`tax`、`batch`、`purchaseOrderNo`、`note`、`sourceOrder`（退貨的原進貨單「單號-序號」）。金額為原幣 ERP 字串。存於 `result_json.purchases`，讀取回 `purchases`。
  - AUTO：PURR18 依廠商與日期；PURR22 沒有廠商條件，同日期整份轉出後在 AUTO 只留該廠商（小計以全部退貨單核對）。退貨↔原進貨單的連結在 CY Web（`arrangePurchases`，與銷貨銷退共用）。
- Agent claim 的 `queryTypes` 含未知類型會回 400：AUTO V0.9.0 會送出 SUPPLIER／PURCHASES 類型，必須在 CY Web 0.8.4 部署後才能連線。

## 進貨輔助（V0.9.24 Build 3）

- 新 Module Access `ERP_RESTOCK_ASSIST`「進貨輔助」，獨立頁面 `#restock-assist`（左邊導覽在「ERP 查詢」下方；V0.9.41 起併入 ERP 查詢頁）。`migrations/0019_erp_restock_assist.sql` 擴充 module_code 與 query_type CHECK。
- 前提權限（使用者 2026-10-21）：`ERP_RESTOCK_ASSIST` 只在同時具備 `ERP_ITEM_QUERY`、`ERP_CUSTOMER_QUERY` 時有效（`shared/modules.ts` 的 `MODULE_REQUIREMENTS`，`checkModuleAccess`／`allowedModuleCodes` 依此計算）；缺前提時建立或讀取 RESTOCK 回 403，訊息列出需要的權限。Module Access 個人設定開啟它而缺前提回 409 `MODULE_REQUIREMENT_MISSING`；關閉它需要的前提時，它在同一批一併關閉（回應 `alsoDisabled`，各記一筆稽核；使用者 2026-10-21）。權限群組送出的模組組合缺前提回 409（畫面在取消前提時會一併移除進貨輔助再送出）。
- 查詢類型 `RESTOCK`：`POST /api/erp/item-queries` `{ queryType:"RESTOCK", dateFrom, dateTo }`，兩者必填（YYYY-MM-DD），起 ≤ 迄 ≤ 台北今天，最多 31 天（含頭尾）；存在 `history_from／history_to`。
- Claim：`{ id, queryType:"RESTOCK", dateFrom, dateTo, expiresAt }`。Agent 查這段期間**所有客戶**的 COPR15 銷貨單與 COPR16 銷退單，依品號與單據日期加總數量，再逐一以 INVI02 查各品號的庫存數量。
- Complete（outcome FOUND／NOT_FOUND，共通欄位同其他類型）：`dateFrom`、`dateTo` 必須與工作相同；`items` 最多 500 個品號，每個 `{ itemCode, itemName, unit, days:[{date,sold,returned}], sold, returned, stock, stockNote }`。`days` 只列有異動的日期且必須在範圍內、不重複；數量為數字字串；`stock` 為數字字串或 null（`stockNote` 說明原因，例如查無品號）。品號不可空白或重複；其他欄位一律不保存。結果存在 `result_json`（`{ restock, total, truncated }`），讀取時以 `restock` 回傳。NOT_FOUND 表示期間沒有銷貨／銷退單，不得附帶品號。
- RUNNING 逾時：RESTOCK 1800 秒（兩份報表再加逐一查庫存）。PURCHASES 與 SALES、RECEIVABLE、ORDER 同為 600 秒（原本漏列，曾以一般查詢的 180 秒計算）。
- Agent 狀態 `GET /api/erp/agent-status` 也開放給只有 `ERP_RESTOCK_ASSIST` 的成員。
- 進度（使用者 2026-10-20：查詢中至少顯示已查／總數）：Agent 在 RUNNING 期間 `POST /api/erp-agent/item-queries/{id}/progress` `{ stage:"REPORT"|"STOCK", done, total }`（整數，done ≤ total；REPORT 為兩張明細表完成數，STOCK 為已查庫存品號數），只接受此 Agent 領取、RUNNING 中的 RESTOCK；同一階段較舊（done 較小）的回報忽略。存在 `progress_stage／progress_done／progress_total`，讀取 API 於 RUNNING 時回 `progress`，其餘為 null。Agent 至多每 2 秒回報一次，失敗不影響查詢。
- 贈品（使用者 2026-10-21）：days 每筆與 item 小計的 `sold`／`returned` 含贈／備品量；選填 `soldGift`／`returnedGift`（數字字串）是其中贈品部分，缺少時 Worker 補 "0"。
- 銷貨資料保存（使用者 2026-10-21，`migrations/0021_erp_sales_history.sql`）：RESTOCK 完成（DONE／NOT_FOUND）時，與 complete 同一個 D1 batch、且只在該 complete 確實寫入時（EXISTS 查詢工作狀態與 completed_at）：
  - `erp_sales_daily(item_code, sale_date, sold, returned, sold_gift, returned_gift, updated_at, query_id)`：json_each 一次 upsert，只有數量有變才更新（updated_at／query_id 為最後改動的查詢）；未 truncated 時刪除範圍內這次沒列出的（品號, 日期）。
  - `erp_sales_items(item_code, item_name, unit, stock, stock_at, updated_at)`：品名、單位或庫存不同才更新；這次沒查到庫存（null）保留舊值；stock_at 為讀到不同庫存的時間。
  - `erp_sales_days(sale_date, synced_at, query_id)`：未 truncated 時標記範圍內每一天；已同步過的日子只有上次同步時（台北日期）還沒過完才改寫。
  - 這些表不跟著查詢結果的保存期限清除，供之後的銷貨分析使用；每批 1,500 列一個 statement。

## V0.9.38：ERP 關閉／暫停與強制關閉（使用者 2026-10-27）

- 有任一 ERP 查詢權限的成員可呼叫 `POST /api/erp/agent-control`：`{action:"CLOSE",minutes:0|15|30|60}`（佇列跑完後關閉 ERP；minutes>0 同時暫停）、`{action:"FORCE_CLOSE"}`（強制結束 ERP）、`{action:"RESUME"}`（取消暫停）。單一共用列 `erp_item_agent_control`，不納入可攜備份。
- 暫停期間 `POST /api/erp/item-queries` 回 409 `ERP_HELD`「ERP 已暫停，HH:MM 後可再查詢」；已排隊的工作照常執行。
- `GET /api/erp/agent-status` 增加 `control:{request,requestedAt,holdUntil,result,resultAt}`。
- Agent claim 回應增加 `control:{request,holdUntil}`；Agent 只在沒有領到工作時處理 request，完成後 `POST /api/erp-agent/control {request,result}`，result 為 `CLOSED`／`KEPT_OPEN`（ERP 有編輯中的詢問而保留）／`NOT_OPEN`／`FAILED`。回報的 request 與目前不同時不覆蓋（新的要求仍待處理）。舊版 Agent 不認得 control，要求會一直顯示「等待查詢程式關閉 ERP」。
- 查詢失敗（ERP_NOT_OPEN、ERP_STATE、EXPORT_FAILED、INTERNAL、逾時）時，網頁詢問是否強制關閉 ERP。

## V0.9.41：每人三筆、排程佇列、ERP 查詢頁保留（使用者 2026-10-27）

- 每位成員最多 3 筆 QUEUED／RUNNING（建立時檢查，超過回 409 `QUERY_ALREADY_ACTIVE`「你已有 3 筆查詢在排隊或執行中…」）。`migrations/0026_erp_query_owner_index.sql` 移除「每人一筆」唯一索引，加 `(owner_member_id, created_at)` 索引。
- Agent 仍一次執行一筆，依送入時間（created_at, id）領取，不做成員間輪流（使用者 2026-10-27）。
- 排隊過期：`expires_at` 改為建立後 60 分鐘上限；另外建立超過 120 秒、沒有 RUNNING 工作且 Agent 最近 60 秒沒有 claim（已離線）時過期。Agent 連線中或正在執行時，排隊工作會等待（可能排在別人的進貨輔助後面）。
- `GET /api/erp/queue`（任一 ERP 查詢權限）：`{jobs:[{id,mine,member,queryType,target,status,createdAt,startedAt,progress,estimatedDoneAt}],maxPerMember}`，執行中在前、其後依送入時間。`member` 為顯示名稱（無則員工編號）；`target`（品號、關鍵字、代號、日期範圍）只在讀者有該查詢類型權限時提供，否則為 null。預估完成時間：近 30 天同類型（含歷史異動分開）DONE／NOT_FOUND 的平均耗時，沒有資料時用預設值；依序累加，執行中的以開始時間加平均耗時（已超過則至少 30 秒後）。
- `GET /api/erp/item-queries/recent`：成員近 24 小時的查詢（新到舊，最多 20 筆，只列仍有權限的類型），ERP 查詢頁開啟時各類別接回自己最新的一筆（換裝置也可）。
- 前端：進貨輔助併入 ERP 查詢頁，類別順序 商品、客戶、供應商、進貨輔助、未收款，最右邊「排程佇列」（每 5 秒更新；V0.9.42 改為類別列右側按鈕打開的抽屜）。`ERP_RESTOCK_ASSIST` 的 route 改為 `erp-item-query`，舊連結 `#restock-assist` 轉到 ERP 查詢。每個類別各自保留查詢、表單與結果，查詢中的類別在頁籤上標示；ERP 查詢頁開過後切到其他模組仍保留在背景，查詢完成時若該類別不在畫面上，右上角通知「XX查詢完成／失敗」並可按「查看」回到該類別。

## V0.9.42：排程佇列抽屜與進貨輔助表格（使用者 2026-10-27）

- 排程佇列改為類別列右側「排程佇列」按鈕打開的右側抽屜（共用 `Drawer`），開著時每 5 秒讀 `GET /api/erp/queue`；每筆顯示「預計 HH:MM 完成（約 N 分鐘後）」。API 不變。
- 進貨輔助表格：品號與品名（單位）同一行；每天的銷與退之間淡虛線；日期欄固定斑馬紋（週末不另加底色）；小計（銷貨）、淨銷、庫存前粗框線。
- 進貨輔助「加入叫貨單」的來源改為點選標籤，見 `ORDERING_MODULE.md`。

## V0.9.43：暫停時加入佇列、關閉到…（使用者 2026-10-28）

- `POST /api/erp/agent-control` 的 CLOSE 可改帶 `until`（ISO 時間，1 分鐘後至 24 小時內）取代 `minutes`；超出範圍 400 `INVALID_CONTROL`。
- 暫停中 `POST /api/erp/item-queries` 帶 `afterHold:true` 時不回 `ERP_HELD`，改建立 QUEUED 工作並記 `not_before`＝暫停結束時間（`migrations/0027_erp_query_not_before.sql`），`expires_at`＝暫停結束後 60 分鐘。回應與讀取工作含 `notBefore`（QUEUED 時）。
- Claim 只領 `not_before` 為空或已到的工作。CLOSE 改變暫停時間時，等待中的工作 `not_before` 跟著改；RESUME 或無暫停的 CLOSE 清空 `not_before`（立即可領）。Agent 離線過期規則改以 `COALESCE(not_before, created_at)` 起算。
- `GET /api/erp/queue` 每筆含 `notBefore`；預估完成時間從暫停結束起算。
- 前端：`ERP_HELD` 時跳「ERP 暫停中」視窗（`ErpHeldPrompt`，App 層掛一次），可選「知道了」或「加入佇列，暫停結束自動查」。ERP 查詢程式視窗暫停中只顯示「取消暫停」；排程佇列為不遮住頁面的右側欄。


## 庫存盤點（V0.9.52，CYWEB／CYERPAutoQuery）

> 本節協定逐字摘錄自 `docs/development/work-orders/WO-0.9.52.md`，另一端依 `apps/CYERPAutoQuery/docs/work-orders/WO-1.3.0.md` 實作；此處定義的是 CYWEB Agent claim／complete API 契約，不是 Windows 工具的實際 ERP UI 操作步驟。

### 協定（兩張工單共用，兩邊必須完全一致）

新增兩種 ERP 查詢類型，走既有 `/api/erp-agent/item-queries/claim`／`/complete` 與 CY Web 排程佇列（每人 3 筆、依送入時間、暫停時可加入佇列等既有規則一律適用）。所有數量在 JSON 中一律為**數字字串**（ERP 顯示值，可為負數、可有小數），日期 `YYYY-MM-DD`。

**`STOCKTAKE_SYNC`：讀盤點單（INVR11）**

- claim：`{ id, queryType:"STOCKTAKE_SYNC", expiresAt, skipSheets: string[], onlySheet: string|null }`
  - `skipSheets`：CY Web 已讀過或設為忽略的底稿編號（最多 500 個）。
  - `onlySheet`：不為 null 時是「重新整理」，只讀這一張（即使它在 skip 內）。
- complete（`outcome` 為 `FOUND`／`NOT_FOUND`／`FAILED`，共通欄位同其他類型）：
  - `sheets: [{ sheetNo, date }]`：F2 開窗清單看到的**所有**底稿（最多 200 筆）。`onlySheet` 模式可只回該張。
  - `details: [{ sheetNo, rows: [...] }]`：這次實際讀了明細的底稿（`onlySheet` 模式恰好一張；更新模式＝清單中不在 skip 的每一張）。
  - `rows` 每列（最多 3,000 列／張）：`{ seq, itemCode, itemName, spec, warehouseName, location, unit, batch, bookQty }`。`seq` 為 INVR11 的「底稿序號」（5 位數字字串，張內唯一）；`bookQty` 為 INVR11 的「盤點數量」（ERP 預設帶入帳面數量）；`location`、`batch` 可為空字串。
  - `NOT_FOUND`：沒有任何需要讀的底稿（清單全在 skip 內）；此時仍回 `sheets`、`details:[]`。
- RUNNING 逾時 1,800 秒；complete 上限 900 KiB。

**`STOCKTAKE_WRITE`：寫回 ERP（INVI14 逐筆、INVI06 新增批號與確認）**

- claim：`{ id, queryType:"STOCKTAKE_WRITE", expiresAt, sheetNo, rows: [...] }`
  - `rows` 每列（最多 3,000）：`{ key, seq, itemCode, batch, quantity }`。
    - 既有列：`seq` 為底稿序號、`key` 同 `seq`。
    - 新增批號：`seq` 為 null、`key` 為 CY Web 的列鍵（例如 `N0001`）。
  - 只送「實際數量 ≠ 帳面數量」的既有列，以及全部新增批號列（規則見 CY Web 工單 §2）。
- complete：`{ outcome:"FOUND"|"FAILED", sheetNo, results:[{ key, ok, erpSeq, message }], confirmed, mismatches:[{ key, seq, itemCode, batch, expected, actual }] }`
  - `results` 每列一筆：`ok` 表示已寫入並讀回一致；新增批號列的 `erpSeq` 為 ERP 新產生的序號（既有列同 `seq`）；失敗時 `message` 為給人看的短句（不含路徑或帳密）。
  - `confirmed`：INVR11 核對全部一致，且已在 INVI06 按「確認」。
  - `mismatches`：INVR11 核對時不一致的列（有任何一列就不得按確認）。
- RUNNING 逾時 3,600 秒；complete 上限 900 KiB。
- Agent 每寫完一列以既有 `POST /api/erp-agent/item-queries/{id}/progress` 回報 `{ stage:"STOCK", done, total }`，CY Web 顯示「已寫入 x / y 列」。


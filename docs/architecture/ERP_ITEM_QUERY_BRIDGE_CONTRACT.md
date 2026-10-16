# ERP 品號查詢 Bridge — CY Web current contract

狀態：CY Web 實作契約；本頁只適用於 ERP 品號即時查詢，不改變既有 Item 主檔權威。

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

`itemNo` 去前後空白後長 1～40 字，不可含空白／控制字元。同使用者同時最多一筆 QUEUED／RUNNING；衝突 HTTP 409。讀取工作時使用 CYID session 與**每次即時** Module Access 驗證；Agent token 無權使用使用者 API。

工作狀態：`QUEUED → RUNNING → DONE | NOT_FOUND | FAILED`，`QUEUED → EXPIRED`；建立後排隊 120 秒過期、RUNNING 一般工作逾 180 秒、含歷史異動逾 300 秒未回報視為 `FAILED/AGENT_TIMEOUT`。前端每 1.5 秒輪詢直到結束，離線顯示提示。狀態清理於讀取／claim 順便執行，不依賴新 cron。完成後 5 分鐘清除 fields／warehouses／batches／history，metadata 保留 30 天；清除後 DONE 仍有 `resultCleared:true`。ERP 短期佇列、heartbeat、Agent 憑證 hash 不納入長期備份，復原後須由超級管理員重新產生憑證。Audit 僅記員工、查詢品號、結果與耗時，不記欄位值。

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

允許的 FAILED `errorCode`：`ERP_NOT_OPEN`、`ERP_BUSY`、`ERP_STATE`、`EXPORT_FAILED`、`CANCELLED`、`INTERNAL`；`AGENT_TIMEOUT` 為 CY Web 系統狀態，Agent 不可自行回報。FOUND 的「品號」必須與工作請求的品號**完全相同（區分大小寫）**：SMART ERP 品號區分大小寫（使用者 2026-10-16 確認），例如輸入小寫 `c00154` 在 ERP 查不到 `C00154`，應回 NOT_FOUND，不得轉換大小寫。claim 以單一 D1 原子 UPDATE 領取，已有 RUNNING 時返回 `job:null`，同時至多一筆執行中。Agent 閒置 2～3 秒輪詢，錯誤退避至 30 秒。

## 主要錯誤碼

| HTTP | Code | 情境 |
| --- | --- | --- |
| 400 | `INVALID_ITEM_NO` | 品號不符 |
| 400 | `INVALID_AGENT_RESULT` / `INVALID_OUTCOME` | Agent payload 不符白名單／欄位重複／狀態不符 |
| 401 | `AUTH_REQUIRED` / `AUTH_INVALID` | 使用者未登入或 session 無效 |
| 401 | `AGENT_UNAUTHORIZED` | Agent 憑證缺少、錯誤或已撤銷 |
| 403 | `ACCESS_DENIED` | 無模組權限或非 Super Admin 的憑證管理 |
| 404 | `QUERY_NOT_FOUND` | 工作不存在或使用者不可讀 |
| 409 | `QUERY_ALREADY_ACTIVE` / `QUERY_NOT_RUNNING` | 已有未完成查詢、重複完成或 claim 權限失效 |
| 503 | `IDENTITY_UNAVAILABLE` | CYID 暫時無法確認授權 |

## 驗收邊界

資料表 forward migration 為 `migrations/0009_erp_item_query_bridge.sql`，不重寫既有 migration。使用者經既有帳號頁 Module Access 發放 `ERP_ITEM_QUERY`，Super Admin 自動擁有。測試使用假品號／假 ERP 值，不使用真實 ERP export。公司端 Agent 可依 `scripts/erp-item-query-acceptance.mjs` 對同一 API 契約測試。CY Web V0.7.33 已於 2026-10-16 經既有受控部署流程套用 migration 並上線（[部署 Run #38851754742](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/38851754742)）。這僅代表 CY Web Worker／D1 與正式網域的部署驗證通過，不代表 Agent 已連線實際 SMART ERP；後者需 CYERPAutoQuery 實機驗收。

## INVQ01 批號庫存與歷史異動（V0.7.34）

補充來源：`docs/handoff/ERP_ITEM_QUERY_INVQ01_HANDOFF.md`；CYERPAutoQuery Agent V0.3.0 Build 1。現有 `ITEMS` 主檔與權限邊界不變。

- `POST /api/erp/item-queries` 保留原 `{itemNo}` 語意，可加 `includeHistory:boolean`（預設 false）、`historyFrom`、`historyTo`（`YYYY-MM-DD` 或 null）。未勾選不能帶非 null 日期。
- 後端使用**臺北當日**，迄未填取今天、起未填取迄往前一年再加一天；迄不可晚於今天，起不可晚於迄、不能早於迄往前三年。同日三年前可用。錯誤 400 `INVALID_HISTORY_RANGE`。
- 建立工作將補齊後 `includeHistory/historyFrom/historyTo` 存在 D1，傳給 Agent claim 並由 GET 回傳；未查歷史則兩日期為 null，前 migration 工作使用預設 false。
- Agent FOUND 可傳 `batchManaged:boolean` 與 `batches`（最多 100 列）；每列是白名單 `批號、庫存數量、入庫日、有效日期` 的 `{name,value}` 陣列，欄位不可重複。false 時必須空陣列。缺少 batchManaged 視為舊版 Agent，不顯示批號區。
- 若要求歷史異動，FOUND `history` 可為物件 `{from,to,columns,rows,total,truncated}`：日期須等於工作起迄；`columns` 須按 `日期、單別-單號-序號、庫別、庫別名稱、入出別、異動數量、備註` 精確排序。每列 7 個字串、每格最多 1,024 字、最多 2,000 列、`total>=rows.length`、`truncated=(total>rows.length)`；Agent 依 ERP 順序返回最新 2,000 列。若舊 Agent 無 history，工作 DONE 但顯示版本不支援提醒。
- 未要求歷史時不允許附 history；NOT_FOUND／FAILED 不允許帶非空 batches 或 history。批號管理非空但 `batchManaged:false` 也拒收。
- **每次 POST 都建立新工作並重新執行 ERP**（仍受單人一筆未完成工作限制）；不從舊工作結果作快取。
- 保存規則：完成後 5 分鐘清除所有結果 JSON，30 天後刪除 metadata；`resultCleared` 保持可追蹤。一般 RUNNING 180 秒／歷史 RUNNING 300 秒逾時，QUEUE 120 秒不變。
- 前端「查歷史異動」勾選後可用原生日期選擇器輸入起迄、保留空值取得預設範圍。結果自動展示批號庫存及（有要求時）歷史異動；小螢幕表格可水平捲動。
- 正式 schema 新增 `migrations/0010_erp_item_query_invq01.sql`，不覆寫 0009；寫入 `include_history,history_from,history_to,batch_managed,batches_json,history_json`，與現有身分及 Agent 認證同源。

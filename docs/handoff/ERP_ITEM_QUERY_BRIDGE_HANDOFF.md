# 交接：ERP 品號查詢（CY Web ↔ CYERPAutoQuery）

> 來源：CYapps `apps/CYERPAutoQuery`（Claude 工作線），2026-10-16。
> 本檔是**跨 repo 的工作輸入**，不是永久規則，也不是 CY Web 的 canonical contract。
> CY Web 端依本 repo 治理鏈（`REPOSITORY_RULES.md` → `REPO_POLICY.md` → `PROJECT_RULES.md` → `docs/architecture/`）實作；
> 完成後請把定案內容整併為 CY Web 自己的 current contract（例如 `docs/architecture/ERP_ITEM_QUERY_BRIDGE_CONTRACT.md`），並依 §9 回一份完成報告。本檔在整併後可刪除。

## 1. 目的與範圍

讓 CY Web 上有權限的使用者輸入一個 SMART ERP 品號，由公司內網電腦上的 **CYERPAutoQuery**（Windows 桌面程式）到 SMART ERP「品號資料建立作業 (INVI02)」查詢並回傳結果，在 CY Web 頁面顯示。

- 使用者規劃（2026-10-16）：短期本機查詢 → **中期 CY Web 品號查詢接口（本交接）** → 長期與 CYERPAutoInput 合併為自動化程式。
- 只讀：CYERPAutoQuery 對 ERP 只做查詢與「轉出至 Excel」，不新增／修改任何 ERP 資料。
- 本交接只涵蓋「單筆品號即時查詢」。ERP 主檔同步、Item 模組自動帶入、批次查詢都不在範圍內。

## 2. 與既有 Business Decision 的關係（請 CY Web 端確認並記錄）

- **BD-003**（read-only ERP、local ERP Bridge、bridge 主動 outbound HTTPS 到 CY Web、不對外開放本機 SQL）：本設計符合「bridge 主動連出、只讀」方向。
- 差異：BD-003 的長期方向是以最小權限帳號唯讀查 ERP 資料庫；CYERPAutoQuery 目前是**操作 ERP 畫面＋ERP 匯出**取得資料（不碰資料庫帳密）。這是現階段可行的 bridge 實作，不取代 BD-003 的長期 DB 方向。是否需要新增／補充一筆 Business Decision 記錄此差異，由 CY Web 端依治理流程處理並向使用者確認。
- **BD-002／BD-004**：ERP 為品號權威；本功能只「查詢顯示」，不建立或改寫 CY Web Item master。
- 權限：使用者決定「誰可以查由 CY Web 的模組控制」（2026-10-16）。依 `PROJECT_RULES.md` §7 與 `API_CONTRACT.md` §11，建議新增一個 CY Web-local Module code（建議名稱 `ERP_ITEM_QUERY`，最終名稱由 CY Web 端定）；Super Admin 依既有規則自動具有。

## 3. 架構

```
CY Web 頁面（已登入 + ERP_ITEM_QUERY Module Access）
  │ POST 建立查詢工作 ─────────────▶ CY Web Worker ── D1：erp_item_queries（佇列＋短期結果）
  │ GET  輪詢工作狀態 ◀────────────┘        ▲
  │                                          │ HTTPS（僅 outbound，由公司電腦發起）
  │                            claim 工作／回報結果（Agent token）
  │                                          │
  │                         CYERPAutoQuery（公司內網 Windows 電腦）
  │                           └─ 操作 SMART ERP INVI02 → 轉出 Excel → 解析
```

- 公司電腦不開對外連接埠；只有它主動呼叫 CY Web。
- 同一時間只會有一台 Agent、一筆執行中工作（ERP 畫面只能一次操作一件事）。工作排隊依序處理，一筆通常 10～20 秒。

## 4. 資料：CYERPAutoQuery 能提供什麼

資料來自 ERP INVI02「轉出至 Excel」：

- **單頭資料**：一列，約 156 個欄位。欄位名稱就是 ERP 的欄位標題（已去除前後空白），例如：
  `品號、品名、規格、版次、單位、庫存數量、庫存金額、單位成本、標準售價、售價定價一～六、會計、料件分類一名稱、商品、料件分類三名稱、商品描述、條碼編號、品號屬性、標準進價、最近進價-原幣單價、零售價、應稅否、主供應商、主供應商名稱、補貨政策、…`
- **單身資料（庫別）**：每個庫別一列：`庫別、庫別名稱、庫性、儲位、安全存量、補貨點、經濟批量、庫存數量、庫存金額、上次盤點日、最近入庫日、最近出庫日、包裝數量`。
- 值一律是字串：數字為 ERP 原值（例如 `12.3456`）；日期欄已轉為 `yyyy/MM/dd`；代碼欄保留 ERP 原樣（例如 `P:採購件`、`1.應稅`）；`商品描述` 可能含換行。

**欄位白名單（待使用者決定）**：單頭含成本類欄位（`單位成本`、`庫存金額`、`標準進價`、`最近進價-原幣單價`、`單位標準*成本` 等）。建議：
- 由 **CY Web 決定**要哪些欄位（server-side 白名單），在 claim 回應中告訴 Agent；Agent 只回傳這些欄位，成本資料不必離開公司電腦。
- 預設白名單建議不含成本類欄位；最終清單請向使用者確認。

## 5. API 提案（CY Web 端可依既有 API_CONTRACT 調整命名，但請在報告中寫明最終版）

一律使用既有 `{ ok, data | error, requestId }` envelope、same-origin `/api/*`、server-side validation。

### 5.1 使用者端（CYID session + Module Access）

| Method | Path | 說明 |
| --- | --- | --- |
| POST | `/api/erp/item-queries` | body `{ "itemNo": "T0001" }` → 202，回 `{ id, status: "QUEUED", itemNo, createdAt }`。同一使用者已有 QUEUED／RUNNING 工作時回 409（建議每人同時最多 1 筆）。 |
| GET | `/api/erp/item-queries/:id` | 回狀態與結果。只有建立者（與 Super Admin）可讀。 |
| GET | `/api/erp/agent-status` | `{ online, lastSeenAt, agentVersion, erpState }`，頁面用來顯示「查詢程式離線」。online 建議 = 最近 15 秒內有 claim。 |

`itemNo` 驗證（與 Agent 相同）：去頭尾空白後 1～40 字，不可含空白或控制字元。

結果（status 為 `DONE`）：

```json
{
  "id": "…",
  "status": "DONE",
  "itemNo": "T0001",
  "fields": [ { "name": "品號", "value": "T0001" }, { "name": "品名", "value": "…" } ],
  "warehouses": [ [ { "name": "庫別", "value": "W01" }, { "name": "庫存數量", "value": "12" } ] ],
  "completedAt": "…",
  "elapsedMs": 14230
}
```

`fields` 保持 Agent 回傳的順序（ERP 欄位順序）。

### 5.2 Agent 端（Bearer token，只限這兩個 endpoint）

| Method | Path | 說明 |
| --- | --- | --- |
| POST | `/api/erp-agent/item-queries/claim` | body `{ "agentVersion": "0.1.0", "erpState": "BROWSE" }`。有工作：200 `{ id, itemNo, fields: ["品號","品名",…白名單], expiresAt }`，並把該工作原子地改為 RUNNING（D1 單一 UPDATE … WHERE status='QUEUED' … RETURNING）。沒有工作：200 `{ job: null }`（或 204，請定一種）。每次呼叫都更新 agent lastSeen（兼心跳）。 |
| POST | `/api/erp-agent/item-queries/:id/complete` | body 見下。只接受「由此 Agent claim、仍 RUNNING」的工作；白名單以外的欄位丟棄或拒收（請定一種）。 |

complete body（`//` 為說明，實際 JSON 不含註解）：

```jsonc
{
  "outcome": "FOUND",            // FOUND | NOT_FOUND | FAILED
  "fields": [ { "name": "品號", "value": "T0001" } ],
  "warehouses": [ [ { "name": "庫別", "value": "W01" } ] ],
  "errorCode": null,             // FAILED 時：ERP_NOT_OPEN | ERP_BUSY | ERP_STATE | EXPORT_FAILED | CANCELLED | INTERNAL
  "errorMessage": null,          // 給使用者看的中文訊息，不含路徑、帳密或檔案內容
  "elapsedMs": 14230,
  "agentVersion": "0.1.0"
}
```

Agent 輪詢節奏：閒置時每 2～3 秒 claim 一次；執行中不 claim。網路錯誤時退避（最長 30 秒）。

### 5.3 狀態與時效

- `QUEUED → RUNNING → DONE | NOT_FOUND | FAILED`；`QUEUED` 超過 2 分鐘 → `EXPIRED`；`RUNNING` 超過 120 秒未 complete → `FAILED`（`AGENT_TIMEOUT`）。逾時判定可在讀取／claim 時順便處理，不一定需要排程。
- 結果 payload（fields／warehouses）完成後 **10 分鐘**清除，只留 metadata（誰、品號、outcome、時間）；metadata 保留期限由 CY Web 定。
- 重要動作走既有 Audit Core：誰查了哪個品號、結果 outcome；**不記錄欄位值**。

## 6. Agent 認證

- 每台 Agent 一組隨機 token（≥ 32 bytes），只能呼叫 §5.2 兩個 endpoint，不能代表任何使用者、不能讀其他資料。
- CY Web 只保存 token 的 hash（例如 SHA-256）；token 原文只交給使用者，在公司電腦上以 Windows DPAPI 加密保存，不進 Git、不進 LOG。
- 初版可只支援一台 Agent；token 的發放／撤銷方式（Worker secret、或 Super Admin 設定頁）由 CY Web 端依 Public／production 分離原則決定，並在報告中說明使用者要怎麼取得 token。
- Development 與 production 使用不同 token。

## 7. CY Web 頁面

- 一個「ERP 品號查詢」頁（受 Module Access 保護）：輸入品號 → 送出 → 顯示排隊中／查詢中／完成／查無此品號／失敗；完成後顯示欄位表與庫別表。
- Agent 離線時顯示提示，不讓使用者以為查詢壞掉。
- Desktop／Tablet／Mobile 依 `PROJECT_RULES.md` §4 Adaptive UI；Mobile 欄位表可改卡片。
- 頁面輪詢工作狀態（例如每 1.5 秒，最多到逾時）。

## 8. 測試建議（不需要真的 ERP）

- 請提供 development 環境，以及一個可重複的假 Agent 測試（例如 acceptance script／curl 範例）：claim → complete(FOUND／NOT_FOUND／FAILED)，驗證狀態轉換、白名單過濾、逾時、權限（無 Module Access → 403；Agent token 錯 → 401；Agent token 不能呼叫使用者 API）、結果 10 分鐘清除。
- 測試資料只用假品號、假值（例如 `T0001`、`假品名`），不得使用真實 ERP 匯出內容（Public repo）。

## 9. 完成後請回報（交回 CYERPAutoQuery 工作線）

請在 CY Web 的 PR 描述，以及 `docs/handoff/ERP_ITEM_QUERY_BRIDGE_REPORT.md`（同一 PR 內）寫明：

1. PR 編號、merge／deploy 狀態（development／production）。
2. 最終 endpoint 路徑、request／response 範例（含「沒有工作」的回應形式）、錯誤碼。
3. 最終 Module code 名稱與授權方式。
4. 最終欄位白名單（以及使用者確認的結果）。
5. Agent token 如何發放、撤銷，development／production 的 base URL（只寫 placeholder 或使用者已同意公開的網址；token 不得寫進文件）。
6. 與本交接不同的設計決定與理由。
7. 是否新增／修改 Business Decision。
8. 已知限制與待辦。

CYERPAutoQuery 端收到報告後會依最終 contract 實作 Agent 連線、對 development 環境實測，再回頭檢查兩邊是否一致。

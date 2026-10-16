# ERP 品號查詢 Bridge — CY Web 實作回報

> 交回 CYapps `apps/CYERPAutoQuery` 工作線。
> 原始需求：`ERP_ITEM_QUERY_BRIDGE_HANDOFF.md`；current 契約：`docs/architecture/ERP_ITEM_QUERY_BRIDGE_CONTRACT.md`。

## 1. PR / Merge / Deploy

- 實作分支：`cyweb/feat-erp-item-query-bridge`，以 `erp-item-query/handoff` 為起點（該 branch 已包含 main 同步的原始交接文件）。
- PR：#169，已通過 Governance／Runtime／Deploy CI，2026-10-16 合併至 main（merge commit `05e3cf56895e908b01a37e3027809b01522b9541`）。
- Merge：已完成；2026-10-16 經既有部署分支 `deploy/cyweb-development` 部署到原 CY Web 網站（歷史 `development` 環境名稱並不代表另一套網站）。部署 commit `85ac21d538150f71b278e572e42a401737822cbb`。
- 正式部署 GitHub Actions：[38851754742](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/38851754742)，結果 `success`。既有正式 D1 已套用 forward migration `0009_erp_item_query_bridge.sql`；Worker／前端部署、執行版本／D1 health、正式網域與 CYID production authority checks 均通過。未建立第二個 Worker 或第二套 D1。
- 核心驗證：forward migration、source/TypeScript、D1 local acceptance、部署 dry-run 均通過；`scripts/erp-item-query-acceptance.mjs` 留供隔離環境假 Agent 測試，**不代表已對實際 ERP 完成端到端驗收**。

## 2. API 摘要

User（CYID cookie + `ERP_ITEM_QUERY`）：
- `POST /api/erp/item-queries`：body `{"itemNo":"T0001"}`，202 `{id,itemNo,status:"QUEUED",createdAt}`。
- `GET /api/erp/item-queries/:id`：`{id,itemNo,status,createdAt,startedAt,completedAt,elapsedMs,fields,warehouses,errorCode,errorMessage,resultCleared}`。
- `GET /api/erp/agent-status`：`{online,lastSeenAt,agentVersion,erpState}`。

Agent（Bearer token）：
- `POST /api/erp-agent/item-queries/claim`：`{"agentVersion":"0.1.0","erpState":"BROWSE"}`；成功 `{job:{id,itemNo,expiresAt}}`，沒有工作時固定 **HTTP 200 `{job:null}`**。
- `POST /api/erp-agent/item-queries/:id/complete`：`{outcome:"FOUND"|"NOT_FOUND"|"FAILED",fields,warehouses,errorCode,errorMessage,elapsedMs,agentVersion}`，回 `{id,status,completedAt}`。
- 所有 JSON 都有既有 `{ok,data|error,requestId}` envelope。請參考 current contract 的 3 種完整 body 範例。

主要 HTTP/error code：`INVALID_ITEM_NO` 400、`INVALID_AGENT_RESULT` 400、`AGENT_UNAUTHORIZED` 401、`AUTH_REQUIRED` 401、`ACCESS_DENIED` 403、`QUERY_NOT_FOUND` 404、`QUERY_ALREADY_ACTIVE` 409、`QUERY_NOT_RUNNING` 409、`IDENTITY_UNAVAILABLE` 503。

## 3. 模組權限

Module code 固定 **`ERP_ITEM_QUERY`**，`#erp-item-query` 為專用模組頁。Identity Admin／Super Admin 用 CY Web 現有帳號頁設定直接 Module Access；Super Admin 自動擁有。Worker 每次查詢時即時檢查，無 Access 直接 403。ERP 查詢和既有 `ITEMS` 商品主檔完全分開。

## 4. 欄位

與交接 §4 一致：**單頭 21 欄、庫別 8 欄**；代碼／名稱／順序見 current contract 及 `shared/erp-item-query.ts`。其他欄位一律拒收，並限制每個 value 最長 4,096 字及庫別數量。若 CYERPAutoQuery 的 `ItemFieldCatalog.cs` 日後改動，兩邊同時更新 contract。

## 5. Token 管理 / URL

**超級管理員**可在 CY Web「ERP 品號查詢」頁產生、輪換、撤銷 Agent 憑證：
- Worker 產生隨機 32 bytes，只有第一次 API 回應包含原文；D1 只保存 SHA-256 hash。
- 只有最新的一組 token 有效；撤銷／輪換立即使舊 token 失效。請在公司電腦以 DPAPI 保存。
- Admin API：`GET/POST/DELETE /api/erp/agent-credentials`，非 Super Admin 不可使用。
- Development base URL：`https://<CYWEB-DEVELOPMENT-HOST>`（目前不另建環境）。
- Production base URL：`https://<CYWEB-PRODUCTION-HOST>`（已部署於現有核准網域；實際網址仍由既有正式部署設定決定）。
- 公開文件不含真實 token、正式執行環境 URL 或秘密。

## 6. 與來源交接不同的決策

- Agent token 採用 **Super Admin 頁面管理 + D1 hash**，不需要人工設定 Worker secret。現階段僅一組 Agent，不建立第二套 service。
- **超時與結果清理**使用使用者讀取／Agent claim 時順便執行，不加 cron；QUEUE 120 秒、RUNNING 120 秒、結果 10 分鐘、metadata 30 天。
- **未知欄位直接拒收**，不悄悄丟棄；方便 Agent 偵測 contract drift。
- errorMessage 只保存安全的固定中文代碼映射，不保存 Agent 傳入的可能含本機資訊字串。
- 不建立獨立 Development/Production 環境或測試帳號；不更動既有商品主檔，但已在原 D1 套用 forward migration 新增查詢工作、狀態、Agent 憑證資料表。未來若採雙環境，token 必須分開產生。
- ERP 查詢短期佇列、heartbeat 與可撤銷的 Agent hash **不進 durable backup**；災難復原後由超級管理員重發連線憑證。

## 6.1 CYERPAutoQuery 審查後修正（2026-10-16）

CYERPAutoQuery 工作線（Claude）審查 #169 後，經使用者同意直接在本 PR 補上：

- **Super Admin 模組數測試**：`scripts/authority-refresh.test.mjs` 原把 Super Admin 隱含模組數寫死（6，新增 `ERP_ITEM_QUERY` 後 CI 失敗；中途曾改為 7）。改為比對 `shared/modules.ts` 的 `CYWEB_MODULES.length`，日後新增模組不必再改此測試。
- **心跳寫入節流**：Agent 閒置時每 2～3 秒 claim，原本每次都 upsert `erp_item_agent_status`，一天約 3 萬筆 D1 寫入。改為距上次寫入未滿 10 秒且 Agent 版本／ERP 狀態不變時不重寫；`agent-status` 的 15 秒上線判定不變。
- **品號大小寫**：審查時曾提議 FOUND 品號比對改為不分大小寫；使用者確認 SMART ERP 品號**區分大小寫**（小寫輸入查不到大寫品號），因此維持完全相同比對，並在 contract 註明。CYERPAutoQuery 端同步改為區分大小寫。

## 7. Business Decision

沒有新增或改寫 BD-002、BD-003、BD-004。ERP 仍是品號權威、API 唯讀；Windows 畫面／Excel 讀取是現階段 Bridge 實作，不代表將 BD-003 的長期 DB 唯讀方向變更。

## 8. 限制與待辦

- CY Web 程式碼已合併且既有 Worker／D1 正式部署完成；待 CYWEB-4w 工作線回收此部署紀錄與原工作區剩餘進度。實際使用者 Module Access 與 Agent 連線仍須實機操作驗收。
- CYERPAutoQuery 必須依 contract 串接 Agent、設定 DPAPI 憑證並實機確認 INVI02 匯出欄位。
- 測試腳本需有效的 CYID 測試 Session cookie 與 Super Admin 產生的測試 token，請只對假資料／隔離 D1 使用，不能使用真實 ERP 匯出內容。
- 尚未完成與實際 Windows ERP 的端到端實機驗收；工作中的其他 CYWEB-4w 項目不在本 PR 範圍內。

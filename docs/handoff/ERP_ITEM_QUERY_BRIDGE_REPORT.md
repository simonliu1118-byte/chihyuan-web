# ERP 品號查詢 Bridge — CY Web 實作回報

> 交回 CYapps `apps/CYERPAutoQuery` 工作線。
> 原始需求：`ERP_ITEM_QUERY_BRIDGE_HANDOFF.md`；current 契約：`docs/architecture/ERP_ITEM_QUERY_BRIDGE_CONTRACT.md`。

## 1. PR / Merge / Deploy

- 實作分支：`cyweb/feat-erp-item-query-bridge`，以 `erp-item-query/handoff` 為起點（該 branch 已包含 main 同步的原始交接文件）。
- PR：建立後以 GitHub PR 為準。
- Merge：未合併；production：未部署；development：未部署、不新建測試環境。
- 核心驗證：forward migration、source/TypeScript、fake Agent acceptance；以 PR CI 結果為準。

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
- Production base URL：`https://<CYWEB-PRODUCTION-HOST>`（未部署）。
- 公開文件不含真實 token、正式執行環境 URL 或秘密。

## 6. 與來源交接不同的決策

- Agent token 採用 **Super Admin 頁面管理 + D1 hash**，不需要人工設定 Worker secret。現階段僅一組 Agent，不建立第二套 service。
- **超時與結果清理**使用使用者讀取／Agent claim 時順便執行，不加 cron；QUEUE 120 秒、RUNNING 120 秒、結果 10 分鐘、metadata 30 天。
- **未知欄位直接拒收**，不悄悄丟棄；方便 Agent 偵測 contract drift。
- errorMessage 只保存安全的固定中文代碼映射，不保存 Agent 傳入的可能含本機資訊字串。
- 不建立獨立 Development/Production 環境或測試帳號，也不改主檔／正式 D1；如未來有雙環境，token 需分開產生。

## 7. Business Decision

沒有新增或改寫 BD-002、BD-003、BD-004。ERP 仍是品號權威、API 唯讀；Windows 畫面／Excel 讀取是現階段 Bridge 實作，不代表將 BD-003 的長期 DB 唯讀方向變更。

## 8. 限制與待辦

- 需原 CYWEB-4w Work 協助審核／合併／受控部署與實際 CYID/Cloudflare 授權驗收；本 PR 不直接部署。
- CYERPAutoQuery 必須依 contract 串接 Agent、設定 DPAPI 憑證並實機確認 INVI02 匯出欄位。
- 測試腳本需有效的 CYID 測試 Session cookie 與 Super Admin 產生的測試 token，請只對假資料／隔離 D1 使用，不能使用真實 ERP 匯出內容。
- 尚未完成與實際 Windows ERP 的端到端實機驗收；工作中的其他 CYWEB-4w 項目不在本 PR 範圍內。

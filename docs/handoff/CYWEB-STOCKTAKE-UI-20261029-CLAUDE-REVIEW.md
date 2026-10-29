## 2026-10-29 架構修正（依使用者最新最終定義）

**最終需求：忽略清單僅告訴 QUERY 哪些 ERP 底稿不要掃；只有 QUERY 真正同步成功才有 WEB 盤點單。QUERY Windows 程式碼不修改。**

變更：
- `migrations/0031_stocktake_ignore_exclusions.sql`：新增獨立 `stocktake_sync_ignored(sheet_no,created_at,updated_at)`；將舊 `IGNORED` 記錄移至此清單。尚未 ERP 同步的 legacy stub 刪除；已同步的舊底稿保留資料，轉回 COUNTING（歷史資料保護待 Claude 審查）。
- `worker/http/store-stocktake-routes.ts`：管理員 `GET ?ignored=true` 查獨立清單、`POST /ignore` 加入編號、`DELETE /ignore` 移除編號；不再寫入 `stocktake_sheets`，也移除 `/:sheetNo/ignore` 和 `/unignore` 的盤點狀態操作。 `POST /sync` 讀此排除清單形成既有 `skipSheets`，不改 QUERY 協定。
- `worker/http/stocktake-erp.ts`：同步結果存入 D1 前再次檢查忽略清單，以防 ERP job 排隊期間新增忽略卻仍匯入。這是 WEB 同步接收端防護，**沒有修改桌面 QUERY**。
- `src/runtime/modules/StoreStocktake.tsx`：管理表只存底稿編號與加入時間；「移除」呼叫 `DELETE /ignore`；從盤點卡移除「設為忽略／取消忽略」狀態動作；前一輪已更名「同步ERP盤點單」及移除「更新畫面」。
- `scripts/store-stocktake.test.mjs`：調整新增/移除忽略 API 測試、確認未成功同步的底稿不會出現在 WEB。

主要提交：`adafdf12`、`6c7c7c88`、`f5df389c`、`b7ec0a29`、`8c25610f`、`df8a270a`。

**注意：先前 Handoff 對 `unignore`、以盤點狀態表示忽略、`?ignored=true` 回傳 StocktakeSheet 的敘述已過時，以本節為準。** Claude 必須檢查 migration 對已有歷史的 IGNORED 盤點單處理、同步佇列競態與最新版 CI。未合併、未部署。

---
## 2026-10-29 使用者釐清需求：忽略清單純粹是 ERP SYNC 排除表

- 更新盤點單改名為 **同步ERP盤點單**；移除「更新畫面」，因已有 30 秒清單自動輪詢及其他即時刷新。
- 忽略底稿**不是另一種需要在 WEB 操作的盤點單**，目的僅是排除 ERP 尚存但不需匯入的底稿編號。
- 新增忽略編號後 `STOCKTAKE_SYNC` 的 `skipSheets` 必須包含它；從排除表移除後，下次同步若 ERP 確實存在，才能產生 WEB 盤點單。
- 既有 schema 把同步前的排除編號記為 `stocktake_sheets.status=IGNORED` stub。為維持相容而不另加 migration；移除 **尚未讀明細** 的忽略 stub 時，API 刪除該 stub，不再轉成 `COUNTING` 造成 WEB 平白出現底稿；曾有明細的已忽略底稿則保留既有恢復行為，以免破壞歷史資料。
- UI 表格動作改稱「移除」，確認對話框清楚解釋是排除清單調整，不會建立 WEB 底稿。

本輪提交：
- `a940ba32`：同步ERP盤點單按鈕文案與刪除更新畫面。
- `15b6cfa4`：排除清單的 UI 文案和操作提示。
- `3e64bd70`：修正 `worker/http/store-stocktake-routes.ts` 的未同步忽略 stub 移除行為。
- `ce5ff95b`：`scripts/store-stocktake.test.mjs` 增加移除排除項後 WEB 不產生底稿的回歸斷言。

驗證要求：同一張 stub 加入忽略→SYNC skip→移除忽略→WEB 清單仍無該單→再次 SYNC 包含該底稿→ERP 回傳後才出現在 WEB。最新 Runtime CI 需對 **最終 SHA** 驗證，不得沿用先前成功紀錄。

---
# CYWEB 庫存盤點 UI 修改 — Claude 審查交接
日期：2026-10-29
Repository: `simonliu1118-byte/chihyuan-web`
Branch: `ui/store-stocktake-layout-20261029`
Scope: 僅 CYWEB 前端盤點頁面；不更動 Worker、DB、ERP Driver，不部署。

## 使用者需求
1. 上方查詢完成訊息不再佔據一整張卡，改用既有通知元件。
2. 更新盤點單／更新畫面／忽略底稿管理移入左側「盤點單」卡頂部，使左右欄從同一高度開始。
3. 新增忽略底稿的對話框中直接顯示已忽略底稿表格及逐筆取消忽略；移除「顯示忽略」。
4. 所有修改寫入 Handoff，最後交 Claude 審查。

## 按鈕語義確認（已閱讀 Worker）
- **更新盤點單**：POST `/api/business/store/stocktake/sync`，建立 `STOCKTAKE_SYNC` ERP job；skip 已忽略及已讀明細底稿；非強制重讀所有底稿。
- **更新畫面**：GET 同一路徑及畫面資料刷新，**不呼叫 ERP**；原本清單即有每 30 秒輪詢，選中底稿每 10 秒輪詢。
- **取消忽略**：呼叫現有 POST `/:sheetNo/unignore`，用 `expectedVersion` 做樂觀鎖；狀態從 IGNORED 恢復 COUNTING，並**不刪除**資料。按鈕文案使用「取消忽略」避免誤解。
- **已忽略底稿**：管理員專用 GET `?ignored=true`。

## 已實作修改
### Commit `7852ba46` — `src/runtime/modules/StoreStocktake.tsx`
- 將整排 `cy-store-toolbar` 按鈕移入 `cy-stocktake-sheets`，新增 `cy-stocktake-list-actions`，讓雙欄上移。
- 移除 `showIgnored` checkbox 和「顯示忽略」在清單、手機 select 的合併邏輯；忽略底稿在管理視窗處理。
- 管理員一律讀取忽略清單（不須啟用 checkbox）。
- 將已完成的查詢狀態改為共用 `useFeedback` 通知；排隊和執行中仍保留 `ErpJobStatus`，讓使用者看到查詢進度。
- 忽略底稿 Dialog 增加共用 `DataView` 表格＋手機卡片，欄位：底稿編號、底稿日期、單項「取消忽略」；刪除前用共用 `useConfirmation` 二次確認。
- 使用既有 `unignore` API；成功後重新讀取清單；失敗交由既有 `reportError` 顯示。
- 按鈕 `更新畫面` 保留，因為手動即時刷新有實質用途。

### Commit `ba45564f` — `src/runtime/modules/store.css`
- 新增盤點專用的集中式 selector，控制導覽卡頂部按鈕列與忽略清單間距，不散落於其他樣式檔。

### Commit `f284fef4` — 補齊成功提示與查無新單通知
- 原有 `setMessage` 的成功提示因移除全寬 FeedbackBanner 不可消失；改由共用 `useFeedback` 顯示，保留所有成功訊息。
- ERP `NOT_FOUND` 狀態顯示「沒有新盤點單」，避免向使用者只顯示狀態代碼。

### Commit `98803483` — 保留原按鈕文案
- 左側仍稱「新增忽略底稿」以符合使用者原操作習慣，開啟後是兼具新增、清單、單項取消忽略的「忽略底稿管理」Dialog。

## 風險／審查重點
- `useFeedback` 目前是共用 Dialog 提醒（非自動消失 Toast）。需求文字「通知」可能指共享通知體系，請 Claude 評估是否要採用 `ToastRegion`，不要私造通知元件。
- 目前沒有瀏覽器視覺驗證；檢查窄版手機下 `DataView` 卡片切換及對話框高度/捲動。
- `ignoreForm` 新增後會維持原本成功即關閉 Dialog 的行為；再次開啟可看到清單。
- 管理員開啟盤點頁時多一個 `?ignored=true` GET，應注意失敗時的反應（目前與正常清單同時取得）。
- 原已存在的「設為忽略」和選中已忽略底稿上的「取消忽略」操作仍保留 API 路徑，但清單不再顯示已忽略底稿。
- 提交 `42019a23` 對應 Governance Check 已通過，Runtime Check 曾處於執行中；新增修正提交 `f284fef4` 必須另取最新版 CI 證據。請在審查前要求最新 CI 證據；不得聲稱已驗證或直接合併部署。

## 後續驗收
1. Desktop：頁面沒有全寬操作列、同步進度只在執行時出現、左右卡對齊。
2. 按更新盤點單：ERP job 仍建立且完成時有共用通知；更新畫面不送 ERP job。
3. 管理員新建忽略底稿：成功；重新打開 Dialog 可見表格。
4. 逐筆取消忽略：有確認、回復初盤中、清單同步更新；測試 409 version conflict。
5. 非管理員不可看見忽略管理按鈕或取得清單。
6. 手機版：按鈕換行合理，忽略項目卡片可操作。
7. TypeScript build、單元測試及 CI 全綠。

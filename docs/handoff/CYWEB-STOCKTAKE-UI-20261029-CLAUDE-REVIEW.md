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

## 風險／審查重點
- `useFeedback` 目前是共用 Dialog 提醒（非自動消失 Toast）。需求文字「通知」可能指共享通知體系，請 Claude 評估是否要採用 `ToastRegion`，不要私造通知元件。
- 目前沒有瀏覽器視覺驗證；檢查窄版手機下 `DataView` 卡片切換及對話框高度/捲動。
- `ignoreForm` 新增後會維持原本成功即關閉 Dialog 的行為；再次開啟可看到清單。
- 管理員開啟盤點頁時多一個 `?ignored=true` GET，應注意失敗時的反應（目前與正常清單同時取得）。
- 原已存在的「設為忽略」和選中已忽略底稿上的「取消忽略」操作仍保留 API 路徑，但清單不再顯示已忽略底稿。
- 尚未執行 npm build / 測試，請在審查前要求 CI 證據；不得聲稱已驗證或直接合併部署。

## 後續驗收
1. Desktop：頁面沒有全寬操作列、同步進度只在執行時出現、左右卡對齊。
2. 按更新盤點單：ERP job 仍建立且完成時有共用通知；更新畫面不送 ERP job。
3. 管理員新建忽略底稿：成功；重新打開 Dialog 可見表格。
4. 逐筆取消忽略：有確認、回復初盤中、清單同步更新；測試 409 version conflict。
5. 非管理員不可看見忽略管理按鈕或取得清單。
6. 手機版：按鈕換行合理，忽略項目卡片可操作。
7. TypeScript build、單元測試及 CI 全綠。

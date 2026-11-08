# CYWEB V0.12.7 Build 1 — 手機 ERP／叫貨草稿，交 Claude 複審

2026-11-08 · 執行 GPT · 分支 `cyweb/mobile-shell-erp-polish-0127b1`。

**分支依賴**：以 [Draft PR #457](https://github.com/simonliu1118-byte/chihyuan-web/pull/457) 的工作分支 `cyweb/home-hub-notices-todos-0127`、Commit `c0591c124572137fba6176d926700f8b79f5cc55` 作基準。請先複審 #457，再審本後續 PR；本 PR 的 base 必須指向 #457 工作分支，否則會重複未合併首頁的變更。**本輪使用者只要求修改，沒有授權合併／部署。**

## 任務

使用者提供 iPhone Safari ERP 查詢及側邊選單截圖：手機頂部深淺方塊按鈕不好看、側欄太寬、ERP 已連線按鈕太大、ERP 查詢類別下拉難用；追加「叫貨頁面沒有地方能打開草稿；叫貨頁面也要調整更符合手機版本」。

## 改動與檔案

- `src/ui/foundation/ThemeToggle.tsx` + `src/App.tsx` + `src/app.css`：手機無框日月 icon，一按於目前有效深／淺之間切換，尊重系統主題；桌機三選一與登入頁設定不變。頂欄適度收斂並保留 CY、通知鈴鐺、帳號。
- `src/ui/overlays/overlay.css`：只有 CY 模組導覽 Drawer 從 320px 改為 264px／保留右側 72px。其他 Dialog/Drawer 不變。
- `src/runtime/modules/ErpAgentCredentialControl.tsx`：手機小連線 pill（已連線、未連線、確認中、暫停中、處理中、未知），按下仍進原 ERP 管理 Dialog；桌機詳細狀態不變。
- `src/runtime/modules/ErpItemQueryPage.tsx` + `src/runtime/modules/erp-item-query.css`：手機類別 select 刪除，統一一組授權 tabs，可橫滑，背景查詢與查詢中圓點、各類別 kept-mounted、佇列功能不變。
- `src/runtime/modules/OrderingPage.tsx`：手機初始僅顯示左側紀錄清單而 `history=1` 排除草稿，導致不能打開。現改手機上方三入口「草稿／未到貨／叫貨紀錄」，預設草稿清單，透過既有 `GET /orders?status=DRAFT` 在可見草稿頁查詢；有搜尋、來源／預計日／建立日、直接點草稿編輯、新增叫貨。原 `prepareSwitch` guard、`reloadOrder`、單來源草稿 chips、`drafts/open`、資料操作、送出、到貨不變。新增／刪除／送出刷新草稿清單；不輪詢、不修改 API。
- `src/ui/OrderingGrid.tsx`：只新增 data-label / data-col，在 `.cy-ordering-page` 手機 CSS 轉成兩欄卡片，長文字欄跨欄，輸入 44px／16px；原編輯、blur、Enter、autosave、刪除、驗證全部沿用，其他模組未改 CSS。
- `src/runtime/modules/erp-item-query.css`：手機來源／廠商 tabs 可橫滑、管理來源與進貨輔助分列、未到貨清單以帶標籤卡片顯示。
- `scripts/mobile-shell-ordering.test.mjs`、版本 BUILD 1、CHANGELOG/TODO、永久規格與此 handoff 更新。

## 請 Claude 嚴格檢查

1. iPhone Safari 375/390/414 CSS px：頂部小 pill、日月、CY 首頁、鈴鐺、帳號是否擠壓；導覽能關閉、捲動。
2. ERP 可授權 tabs 滑到末端，背景查詢沒有因切類別丟失；控制 Dialog 的 ERP 關閉與憑證權限不變。
3. 手機一開叫貨看得到草稿。草稿直接點開、同來源多張、預計送出日期、新增／送出／刪除後刷新；未到貨／歷史與返回草稿的路徑能用。
4. 當表格欄位尚未存、已送出修改模式未送出，切換「草稿／未到貨／叫貨紀錄」、返回來源時，原 `prepareSwitch` 正確 flush／confirm，不能靜默丟失。
5. `OrderingGrid` 在手機卡片中的鍵盤 Enter、blur、自動儲存與 warning 邏輯不受 display CSS 影響，桌機與門市表格維持原樣。
6. 現有 `GET /orders?status=DRAFT` 有最多 200 筆限制，超出返回 409；本輪不新增全表掃描或新分頁。Claude 若發現高用量或效能問題，記錄後再提議最小修補。
7. PR CI 與 Node 測試、Governance、部署契約需通過；手機視覺實機及不同使用者的正式作業仍待人工驗收。**Claude 尚未複審，不宣稱通過。**
8. **不得自行合併、部署或套用 D1 0059**；需使用者另行授權。此 PR 是 #457 的後續，不應單獨 merge main。

## 驗證結果

待 PR Actions 回填。

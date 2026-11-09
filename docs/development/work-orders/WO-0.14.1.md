# WO-0.14.1 全系統手機版：各模組改用共用手機元件（第二階段）

- 狀態：**待執行**（2026-11-09 Claude 開立，執行者：GPT）
- 分支：每個批次一個分支，例如 `cyweb/wo-0.14.1-ordering`；版號自 V0.14.1 起每批 +1，CHANGELOG 同步。
- 開工前必讀：
  - `docs/architecture/UI_COMPONENT_CATALOG.md` **§6 手機版**（共用元件與規則）
  - `src/ui/mobile/`（`ModuleSections`、`ListRow`、`ActionBar`、`OverflowMenu`、`mobile.css`）
  - 範例：`src/runtime/modules/StorePage.tsx`（`ModuleSections`）

## 1. 背景（使用者原話，2026-11-09）

- 「不要重做一套邏輯，只是改 UI/UX」
- 「要整體檢視各模組手機版介面，比較早期的模組手機版並沒有特別做，都很難用」
- 「最好是抽成共用元件去使用，不要每個模組做一套」
- 手機叫貨：主要用來建立／修改草稿、登記到貨、查看與分享叫貨單、送出；預設先看「未到貨」；品項清單精簡、點開從下方滑出編輯。

## 2. 已定案規則

1. **只改呈現。** 不改業務邏輯、API、Worker、D1、權限、存檔規則（未存確認、版本鎖、數量格式、Enter 跳格）。若某個畫面不改邏輯就做不到，停下來問 Claude。
2. **桌機畫面不能變。** 每個批次都附桌機（1440px）前後對照截圖。
3. **不寫模組自己的手機 CSS。** 用 §6 的共用元件與 `cy-rt`；共用元件缺了，加到 `src/ui/mobile/` 並更新目錄 §6，不在模組內各寫一套。
4. **刪除舊的模組手機 CSS**：模組改用共用元件後，刪掉該模組 CSS 裡對應的 `@media`（680／640／560／420 等）規則，以及各自的 `data-label` 卡片寫法。
5. 手機寬度只有 820px 一個斷點（`useCompactLayout()`）。

## 3. 每個模組要做的事（清單）

- [ ] 模組子頁 → `ModuleSections`（2–5 個在手機變底部分頁，可帶數量）。
- [ ] 清單列 → `ListRow`（標題／副標／右側值或 StatusChip）。
- [ ] 搜尋＋篩選 → `DataViewToolbar` 的 `filters`（手機自動收進「篩選」面板），並傳 `activeFilterCount`。
- [ ] 明細頁的主要動作（新增、儲存、送出、登記）→ `ActionBar`；次要動作（分享、修改紀錄、作廢、刪除）→ `OverflowMenu`。
- [ ] 寬表格 → `cy-rt` ＋ `data-label` ＋ 必要時 `data-priority`。
- [ ] 表單一律用 `EntryTable`／`RecordSheet`／`Dialog`（手機排法已內建，不另寫）。
- [ ] 刪掉該模組舊的手機 CSS。
- [ ] 截圖：手機 390×844（`deviceScaleFactor:2`）與桌機 1440，改前／改後各一組。

## 4. 批次與順序（一批一個 PR）

| 批次 | 模組 | 特別注意 |
| --- | --- | --- |
| 1 | **叫貨** | • 子頁「未到貨／草稿／叫貨單」改 `ModuleSections`，進入模組預設「未到貨」，取代現在的 `cy-ordering-mobile-nav`。<br>• 未到貨、叫貨單清單改 `ListRow`／`cy-rt`。<br>• **草稿編輯（手機）**：品項改精簡清單（項次／品名＋品號／數量＋單位），點一列開 `BottomSheet` 編輯該列欄位，存檔沿用 `OrderingGrid` 現有的 commit 路徑與驗證，**不新增 API**。新增品項先用現有的品號帶入規則，品名搜尋留待之後另議。<br>• 「＋新增品項」「送出叫貨」放 `ActionBar`；分享 Excel、備註、刪除草稿放 `OverflowMenu`。<br>• 登記到貨沿用現有視窗（手機自動變下方面板）。 |
| 2 | 門市（訂購、黑名單、售後維修、月度、盤點） | 流程表改 `cy-rt`，`data-priority="title"` 給客戶／狀態；刪掉 `store.css` 的 `cy-store-workflow-table`、`cy-store-cards` 手機規則。三年矩陣與盤點計數只換外框與按鈕。 |
| 3 | 客戶、商品 | 清單 `ListRow`；客戶的分類／狀態下拉移到 `DataViewToolbar filters`；明細的「修改」→`ActionBar`。 |
| 4 | 瑕疵、銷售工單、委外、工作日誌 | 早期模組，清單與明細一起套。 |
| 5 | 人事、ERP 查詢（含未收款、進貨輔助）、BOT 管理中心 | ERP 類別頁籤若超過 5 個，維持上方可滑頁籤（`ModuleSections` 會自動處理）。 |
| 6 | 帳號與權限、異動紀錄、備份、CY 程式、我的帳號、首頁 | 以 `cy-rt` 與 `ListRow` 為主。 |

## 5. 驗收

- `npx tsc --noEmit -p .`、`npm run validate:source`、`node --test scripts/*.test.mjs` 全部通過；既有測試不得因改 UI 而刪除或放寬，只可依新的 DOM 結構更新選擇器。
- 每批附手機／桌機前後截圖。
- 開 PR 給 Claude 審查。**不要自行合併或部署。**

## 8. 完成報告（GPT 填）

（每批一段：分支、PR、改了哪些模組、刪了哪些手機 CSS、截圖、測試結果。）

## 9. 審查紀錄（Claude 填）

（待審）

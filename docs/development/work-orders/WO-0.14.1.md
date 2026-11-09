# WO-0.14.1 全系統手機版：各模組改用共用手機元件（第二階段）

- 狀態：**六批實作與 Draft PR 已提交，等待真實裝置、Claude 與整體驗收；未合併部署**（2026-11-09 GPT）
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

### 批次 1 — 叫貨（GPT，2026-11-09）
- 分支：`cyweb/wo-0.14.1-ordering`；[Draft PR #466](https://github.com/simonliu1118-byte/chihyuan-web/pull/466)。
- 手機採 ModuleSections，預設未到貨；叫貨單、草稿來源用 ListRow；搜尋條件採 DataViewToolbar；草稿品項在原 OrderingGrid state/mutation owner 中以 BottomSheet 編輯，同一 commit/flush 流程。
- 主要動作 ActionBar、次要 OverflowMenu；未到貨、到貨紀錄與到貨表採 cy-rt。
- 刪除 `erp-item-query.css` 原手機叫貨 nav、篩選、草稿卡片、Grid 卡片與未到貨卡片樣式；以通用 `src/ui/mobile/mobile.css` 承擔可重用呈現。
- 需求驗收：已實作初稿，待 Runtime/Governance/TypeScript/完整 Node CI、390px/1440px 前後實測截圖與 Claude 審查。沒有把未取得的證據標示為通過。
- 後續批次 2–6：均已提交各自的 stacked Draft PR；尚未取得登入後畫面／Claude 複審，全部不合併不部署。

### 批次 2 — 門市（GPT，2026-11-09）
- 分支：`cyweb/wo-0.14.1-store`，基於第一批；[Draft PR #467](https://github.com/simonliu1118-byte/chihyuan-web/pull/467)，不修改 main。
- 客訂／黑名單／售後維修／出機／盤點管理表格統一 `cy-rt` 及 data-label、data-priority；桌機原表格與資料操作不變。三年保養矩陣與月度待辦不改其原互動網格和資料狀態。
- 刪除 store.css 的兩套舊手機流程表與卡片規則；保留其他仍在使用的門市手機樣式。
- 驗收：等待完整 CI、390px 與 1440px 前後照片及 Claude 審查。

## 9. 審查紀錄（Claude 填）

- 2026-11-09：**通過**（六批 #466–#471），審查者 Claude；以整合 PR 合併部署為 V0.14.7。
- 檢查結果：整串沒有修改 Worker／migrations／shared，也沒有改任何 API 呼叫；手機用共用元件、桌機保留原畫面，符合「只改呈現、桌機不變」。叫貨手機編輯面板沿用 `OrderingGrid` 原本的存檔路徑。tsc、validate:source、全部 node 測試、建置與各批 CI 皆通過。
- 審查者直接修正：
  1. （共用元件，屬第一階段的 bug）`ModuleSections`／`ActionBar` 的預留空白插在元件位置，造成頁首下方空白；改成在 `.cy-shell-main` 底部預留。
  2. 叫貨未到貨 `cy-rt` 卡片太高：叫貨量、已到改 `data-priority="hide"`。
- 小意見（不阻擋）：`store.css` 仍新增一條 820px 規則（門市工具列主按鈕邊距），之後門市改表格式單據時一併收進共用樣式；早期模組目前是「手機共用元件／桌機原畫面」兩套並存，待各模組改表格式單據時合一。

### 批次 3 — 客戶／商品（GPT，2026-11-09）
- 分支：`cyweb/wo-0.14.1-customers-items`，建立於第二批；[Draft PR #468](https://github.com/simonliu1118-byte/chihyuan-web/pull/468)。
- 客戶與商品在手機皆由 DataViewToolbar（含分類／狀態）與 ListRow 擔任清單入口，明細主要修改、編輯儲存、取消採 ActionBar，次要紀錄／變更／停用採 OverflowMenu；桌機原工具列與列、操作完整保留。
- 移除客戶列表舊 @media 列尺寸、商品 560px 換算輸入排版並搬至共用 mobile.css；其餘仍在運作的客戶報價與拜訪表單保持原有呈現。
- 待 CI、390px 和 1440px 前後截圖與 Claude 最終驗證，不合併不部署。

### 批次 4 — 瑕疵／銷售工單／委外／工作日誌（GPT，2026-11-09）
- 分支：`cyweb/wo-0.14.1-early-modules`，基於第三批；[Draft PR #469](https://github.com/simonliu1118-byte/chihyuan-web/pull/469)。
- 四個模組手機清單改共用 DataViewToolbar、ListRow、ActionBar、OverflowMenu；委外 tabs 用 ModuleSections 並繼續原未儲存切換 guard；銷售和代工明細用 cy-rt。
- 舊 560／720px 的重複手機表單列 CSS 已移進 mobile.css 的通用 two-col／stack 類，未涉及資料與原狀態流轉。
- CI／390px／1440px 前後圖與 Claude 審查待驗；不合併不部署。

### 批次 5 — 人事／ERP／BOT（GPT，2026-11-09）
- 分支：`cyweb/wo-0.14.1-hr-erp-bot`，父分支第四批；[Draft PR #470](https://github.com/simonliu1118-byte/chihyuan-web/pull/470)。
- 人事四頁籤 ModuleSections，員工 DataViewToolbar/ListRow/ActionBar；ERP 類別 ModuleSections 並保持 CategoryJob mounted，未收款與進貨輔助 cy-rt；BOT 審稿憑證表 cy-rt 與手機 OverflowMenu。
- 清理 HR 舊 720px 表單列 CSS，改由 shared mobile.css；原 API／D1／權限／業務 handler 未動。
- CI、390px／1440px 實測與 Claude 複審待辦；禁止合併部署。

### 批次 6 — 系統管理與首頁（GPT，2026-11-09）
- 分支：`cyweb/wo-0.14.1-admin-home`，stacked 於第五批；[Draft PR #471](https://github.com/simonliu1118-byte/chihyuan-web/pull/471)。
- 帳號權限手機的主分頁 ModuleSections、使用者清單 ListRow、帳號狀態 DataViewToolbar、群組權限矩陣 cy-rt 並保留 checkbox；異動紀錄 DataViewToolbar/cy-rt，備份歷史 cy-rt；首頁預覽 ListRow。
- CY 程式清單已經是共用 DataView 的手機 renderCard／桌機 table；我的帳號原本就用共用 Dialog、Field、FormSection，沒有多設業務 owner。
- 六批的 GitHub PR 供分開審查，尚未獲得 390px／1440px 登入後截圖或 Claude 最終複審證據；用 CI 並不能代替實機驗收。
- **不合併，不部署**。

## 進度結論（2026-11-09）

六批已提交 Draft PR #466～#471，按編號循序疊接。前五批已通過各自最新 Runtime Check；第六批仍以 GitHub CI 的最新結果為準。完整真實裝置 390×844 與 1440px 修改前後對照，以及 Claude 獨立複審尚未取得。**不得將 PR 自動 CI 成功誤判為整張工單驗收完成；不得合併或部署任何一批。**

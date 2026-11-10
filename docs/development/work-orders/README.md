# CY Web 工作單

工作單是 `REPOSITORY_RULES.md` §11.4（本 repo `PROJECT_RULES.md` §9 指向它）的交接文件，**只有在使用者指示 Claude 開立工作單轉交 GPT 製作時才使用**：Claude 討論定案後撰寫 → 使用者轉交 GPT 執行並填「完成報告」→ Claude 審查。一個版本一張，檔名 `WO-<版本>.md`（例如 `WO-0.9.13.md`）。工作單描述需求與狀態，不是規則來源；規則仍以 `REPOSITORY_RULES.md`、`REPO_POLICY.md`、`PROJECT_RULES.md`、Business Decisions 為準。

**結案工作單的保存方式（使用者 2026-10-28 核准）**：共通規則 §11.4 要求**執行及審查期間**在同一工作單記錄需求、§8 GPT 完成報告、§9 Claude 審查紀錄；通過審查及合併、正式規格與剩餘待辦同步後，已結案版本可移出 active tree。原文、原始 §8／§9 與 PR 證據**必須由 Git 固定 SHA 保留**，不可改寫歷史；本次移除的 12 份已結案 `WO-0.9.12～0.9.27` 文件可於 [清理前固定工作單快照](https://github.com/simonliu1118-byte/chihyuan-web/tree/b2d53cdd71c5bf9126f2976607257e892b911df5/docs/development/work-orders) 找回。原單 §0「不合併／部署」只描述執行當時的權限，不得反推現行狀態。

**2026-11-03 整理**：已審查通過並合併部署的 `WO-0.9.52`、`WO-0.9.68～0.9.71`、`WO-0.9.74`、`WO-0.9.76` 移出主線，有效規格已併入 `STORE_STOCKTAKE.md`、`STORE_MONTHLY_TODOS.md`、`STORE_REPAIRS.md`、`ORDERING_MODULE.md`；原文見 [2026-11-03 固定工作單快照](https://github.com/simonliu1118-byte/chihyuan-web/tree/4cbc554a08c7fdf47a4140c7b9d912f61ce42c10/docs/development/work-orders)。`WO-0.9.94`（全系統灰色說明小字，V0.10.12）於 2026-11-09 移出主線，原文含 §8／§9 見 [固定快照 ff3562c](https://github.com/simonliu1118-byte/chihyuan-web/blob/ff3562c6bfcddb67ff19ded15fa485fd527c7c4a/docs/development/work-orders/WO-0.9.94.md)。

**後續新工作**：進行中／待審查／需修正的工作單繼續保留在本目錄（含 §8／§9）；完成後先核對現行 [架構規格](../../architecture/README.md)、[TODO](../../../TODO.md)、[CHANGELOG](../../../CHANGELOG.md) 及 PR／部署證據，再於文件整理 PR 移出主線。不得直接刪除未審查或仍含獨有未完成需求的工作單。[新 handoff 入口](../../handoff/README.md) 與工作單依用途分開。

## 格式

```markdown
# WO-<版本> <標題>

- 狀態：待執行 ／ 執行中 ／ 待審查 ／ 需修正 ／ 已完成
- 分支：cyweb/<名稱>　PR：#<編號>（執行者填）

## 1. 背景（使用者原話）
引用使用者的需求原文，說明要解決什麼問題。

## 2. 已定案事項
討論中已決定的做法與理由；相關 Business Decision（BD-xxx）。執行者不得更改。

## 3. 範圍
- 要做的項目（逐條）。

## 4. 不做
- 明確排除的項目，避免擴大範圍。
- 固定一條：不加多餘的測試與防護（共通規則 §11.4，使用者 2026-10-29）。只做本單要求的功能與實際會發生的錯誤處理；不加重複驗證、不會發生的情境檢查、層層 fail-closed、自設上限、安全開關，也不為這些寫測試。

## 5. 實作指引
- 要用的共用元件／樣式／API、要改的檔案、步驟與注意事項。

## 6. 驗收清單
- [ ] 每一項都可具體檢查（畫面位置、行為、權限、資料）。
- [ ] 固定項目：新表單按 Enter 跳下一欄、日期欄位四碼年份（`PROJECT_RULES.md` §5，`form-keyboard.test.mjs` 會檢查）。
- [ ] `npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local` 通過。
- [ ] `node --test scripts/*.test.mjs` 通過（`audit-account-portal` 需 `.tmp/canonical-cyapps` 的 CYapps checkout）。
- [ ] VERSION／package.json 版本、TODO 段落已更新。
- [ ] 固定項目：畫面逐項符合下方「介面一致性審查清單」（大型畫面改版必附 1440／390 截圖，並與叫貨、門市、商品、客戶同類畫面對照）。

## 7. 截圖要求
- 列出要附的畫面（桌面 1440 寬、手機 390 寬；淺色／深色視需要）。

## 8. 完成報告（執行者填）
- 驗收清單逐項結果。
- 與工作單不同之處與原因。
- 驗證指令輸出摘要、截圖位置。

## 9. 審查紀錄（審查者填）
- 日期、結論（通過／需修正）、意見（依嚴重度排序）、審查者直接修正的小項目。
```

- [WO-0.10.24](WO-0.10.24.md)：門市流程下一步登記後上一步鎖定、送廠物流顯示（已結案，Claude 2026-11-09 通過；下次整理移出主線）。
- [WO-0.14.1](WO-0.14.1.md)：全系統手機版，各模組改用共用手機元件（第二階段；已結案，Claude 2026-11-09 通過，V0.14.7；下次整理移出主線）。
- [WO-0.16.0](WO-0.16.0.md)：商品主檔改成表格式單據，瑕疵併入商品分頁（已結案，Claude 2026-11-09 通過，V0.16.0；下次整理移出主線）。
- [WO-0.17.0](WO-0.17.0.md)：人事四個頁籤改成表格式，新增薪資頁籤（薪資總覽）（待執行，GPT）。


## 介面一致性審查清單（Claude 審查大型畫面工單必查）

使用者 2026-11-10 要求：大型調整交 GPT 做的工單，回來審查時一律逐項確認以下項目。來源是 WO-0.18.0 委外／代工改版交件後的整體檢查（V0.18.3 由 Claude 修正）：功能正確，但清單、表格、按鈕、確認、手機都沒有照共用元件，和其他已修過的模組不一致。對照範本：叫貨 `OrderingPage.tsx`、門市、商品 `item/ItemSheet.tsx`、客戶、委外 `OutsourcingOperationalPage.tsx`（V0.18.3 起）。任一項不符就退回或由 Claude 直接修正，並寫進工單 §9。

1. **左側清單**：上方主按鈕（「＋ 新增○○」用 `cy-op-button primary`，不是小按鈕）＋搜尋框，`StatusFilter` 含筆數，「共 N 筆」；桌機用 `cy-md-toolbar`，手機用 `DataViewToolbar`。列用 `cy-op-list-row cy-status-row`（手機 `ListRow`），右側 `StatusChip`。清單空的時候有提示文字；右邊未選取時用 `MasterDetailEmpty`。不准拿手機的 `ListRow` 當桌機清單。
2. **單據標題**：名稱旁 `StatusChip`，下一行單號與日期；動作按鈕 `cy-op-button compact`（主要動作 `primary`），次要或危險動作收進 `OverflowMenu`。不要自己寫按鈕函式改成 `mini`。
3. **單據與修改**：`RecordSheet`／`RecordRows`；各列共用同一格線、用 `span` 跨欄讓線條對齊；格子就是輸入區；修改時「取消／儲存」在上方（`cy-record-header cy-edit-header`），手機放 `ActionBar`。新增或修改時不顯示還沒有意義的欄位（例如新增時的「已交」「進度」）。
4. **唯讀明細表**：用 `cy-op-table cy-rt`，一個項目一列，不要把多個料件串成一格文字；數字靠右（`is-number`）、操作置中（`is-center`）；已取消的整列 `cy-row-struck`；手機卡片不用 `rowSpan`。不要用 `RecordRows editing={false}` 加空的 `onInsert`／`onRemove` 假裝唯讀表。
5. **按鈕尺寸**：標題列 `compact`；表格列內 `mini soft`；卡片／面板標題列的小動作 `mini soft cy-header-action`。不准出現沒有底色也沒有框的純文字按鈕。
6. **確認**：取消、刪除、沖銷、重新開啟、取消確認等反向或破壞性動作，一律先 `useConfirmation` 跳確認，說明會發生什麼。
7. **狀態顯示**：狀態一律用 `StatusChip`（含清單、標題、表格內），不用純文字。
8. **格式**：日期 `formatDate`（YYYY/MM/DD）；電話 `PhoneInput`／`PhoneText`；金額千分位靠右；數量帶單位。
9. **訊息**：成功與錯誤用 `useFeedbackMessage`＋`FeedbackBanner`，不要自己寫 `<p className="cy-op-error">`。
10. **視窗**：`Dialog` 一定指定 `size`；表單用 `EntryTable`；專屬寬度寫成 `.class > .cy-dialog-surface`；送出按鈕依動作命名（「確認發料」「建立對帳單」），不是一律「確認」。
11. **手機**：頁籤用頂部 `ModuleSections`；主要動作在底部 `ActionBar`；工具列、區塊照共用 `mobile.css`，不另寫模組手機樣式。
12. **工具列與區塊**：搜尋、篩選、勾選放同一行；可收起區塊用 `ExpandToggle`，不要用原生 `<details>`。
13. **後端寫入**：每個會寫入的批次，第一步更新 revision 並緊接 `changes()` 檢查（重複送出或兩人同時操作要整批不寫入、回 409）。
14. **不留一次性工具**：工單專用的 CI workflow、截圖腳本、測試頁不得進 repo；截圖放 PR 證據即可。
15. **CSS**：模組 CSS 只放模組特有排版；舊流程留下沒人用的 class 要清掉。

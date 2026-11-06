# CY Web V0.11.6：門市庫存盤點批號刪除圖示

- 日期：2026-11-06；執行：GPT。基準 `main@5982b09ee0de2d9c06e47e3c7a47e4f72b4c1a06`（V0.11.5）。
- 工作分支：`cyweb/stocktake-batch-delete-icon-0116`；獨立於 BOT 管理中心 PR #438（V0.12.0）。
- 依 `PROJECT_RULES.md` §9.1：本檔記錄所有修改與驗證，Claude 最終審查**尚待進行**，不可由執行者代填通過；本次無合併／部署授權。

## 使用者畫面需求與處理

使用者附上門市庫存盤點批號明細截圖，顯示操作欄內「刪除批號」文字按鈕因狹窄而折行。採用使用者建議的精簡做法：**移動到「批號」格內，改成共用垃圾桶圖示按鈕**。

- 桌機「批號」欄顯示批號文字與單一紅色危險動作垃圾桶圖示，強制同一行，批號過長會截斷但刪除圖示始終可見；右側「操作」欄不再放刪除文字按鈕。
- 手機盤點卡同樣將刪除圖示移至批號旁；下方展開區標題改「修改紀錄」，不再重複放批號刪除。
- 直接使用既有共用 `IconButton`、`Icons.remove`、`tone="danger"`、`variant="table"`；無障礙標籤及 hover title 帶完整批號。
- 顯示條件仍是 `r.line.isAdded && editable && !r.line.locked`；點擊仍呼叫既有 `onDeleteBatch(r.line)`，保留原先多儲位／已有數量時的確認、版本驗證與歷程。沒有修改庫存盤點資料 API 或權限。

## 修改檔案與測試

- `src/runtime/modules/StocktakeGroupedDetail.tsx`：共用新增批號刪除 IconButton，移出 actions，桌機與手機改放批號旁。
- `src/runtime/modules/store.css`：批號及刪除圖示不折行，過長批號截斷，圖示不縮小。
- `scripts/store-stocktake-ui.test.mjs`：驗證 IconButton、權限條件、桌機／手機位置、操作欄不再保留舊文字按鈕，以及 CSS 的同列規則。
- `docs/architecture/STORE_STOCKTAKE.md`、`VERSION`、`package.json`、`TODO.md`、`CHANGELOG.md`、`docs/handoff/README.md`：同步行為、版本與交接。

## 風險、驗證及下一步

- UI-only：無 DB schema、migration、backup、ERP Agent、Worker API 或新的授權邏輯。
- 實際桌面／手機視覺位置、極長批號省略及觸控區域仍需實機目視驗收。
- PR Runtime、Governance、部署契約檢查：**待最新 CI**，不得先宣稱成功。
- Claude 最終審查：**待審查**（審查者補日期／通過或需修正／意見）。
- **未合併、未部署**；正式站仍以最後一次成功的受控部署紀錄為準。

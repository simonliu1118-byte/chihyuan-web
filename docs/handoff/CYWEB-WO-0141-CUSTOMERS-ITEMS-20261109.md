# CYWEB WO-0.14.1 — 批次 3 客戶／商品
2026-11-09，分支 `cyweb/wo-0.14.1-customers-items`。基於批次 2 `cyweb/wo-0.14.1-store`，作為未合併的 stacked PR，父分支及 main 均不更新或部署。

## 改動
- CustomerOperationalPage、ItemOperationalPage：只在 `useCompactLayout()` 解析的手機介面新增 `ListRow` 清單、`DataViewToolbar` 含分類及狀態 filters（activeFilterCount）。選擇清單、讀取、分頁、業務 API 及原 select state 一律沿用既有 owner。
- 手機明細「修改」及編輯的儲存／取消：`ActionBar` 仍呼叫原 handler。商品更改品號、停用／啟用、客戶修改紀錄移入 `OverflowMenu`；原權限檢查保留。桌機 JSX 分支保留原表格／按鈕與位置。
- 商品換算列窄版 @media 560 移至共用 mobile.css 的通用轉換列編排；刪除客戶舊列表手機行內距規則。未重建相關紀錄資料與保存路徑。

## Owner
- State：原 query／category／status／selectedId／editing／draft。
- Render：元件原檔（mobile ListRow vs desktop old list）。共用 DataViewToolbar、ActionBar、OverflowMenu，沒有第二套資料擁有者。
- Mutation：原 startEdit／saveCustomer／save／cancelEdit／changeItemNumber／toggleActive／history。
- Lifecycle：單一 React hook useCompactLayout，不引入 observer 或 fetch。
- 無 Worker／D1／API／CYID／權限變動。

## 驗證
- CI Runtime／Governance／型別／Node：PR 執行後回填。
- 390×844 及 1440 桌機修改前後截圖：尚無登入後瀏覽器，待驗。
- Claude 複審：待。
- 使用者禁止合併與部署。

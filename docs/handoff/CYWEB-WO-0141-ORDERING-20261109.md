# CYWEB WO-0.14.1 — 批次 1 叫貨

工作日 2026-11-09。分支 `cyweb/wo-0.14.1-ordering`，起點 main V0.14.0 `48e5331e77b48a7b2dbb3eea20136ce4e6c835ba`，工單 `docs/development/work-orders/WO-0.14.1.md`。

## 已實作
- `src/runtime/modules/OrderingPage.tsx`：手機預設未到貨；ModuleSections 底部分頁；草稿來源和叫貨紀錄 ListRow；手機 DataViewToolbar 傳遞原狀態來源日期篩選與 activeFilterCount；主要動作 ActionBar 與次要 OverflowMenu；未到貨／到貨 cy-rt。
- `src/ui/OrderingGrid.tsx`：同一 Grid owner 的手機 compact ListRow 與 BottomSheet 行編輯；openNew 由原 editor contract 暴露，表單欄位仍使用原 commitCell、commitNew、input blur、flush、版本鎖及最終儲存結果。桌機保留原表格 renderer。
- `src/ui/mobile/ActionBar.tsx`：通用 aboveTabs 變體；`mobile.css`：通用編輯列、選擇來源列、底部分頁上方按鈕位置。
- `src/runtime/modules/erp-item-query.css`：移除已由共用元件接手的舊手機叫貨區塊（nav、mobile draft cards、舊兩行待到貨卡、grid cards、toolbar）；沒有修改不相關 ERP CSS。
- `scripts/ordering-grid.test.mjs`、`scripts/ordering-page.test.mjs`、`scripts/mobile-shell-ordering.test.mjs`：更新真實 JSX handler 與新的元件契約檢查，不刻意放寬 API/未存保護測試。

## 單一 owner／風險
- State：OrderingPage current / pending / drafts / filters；OrderingGrid mobileRowId 為純視覺選列狀態。
- Render：OrderingPage／OrderingGrid，desktop 原表格 vs mobile ListRow/BottomSheet，依 compact 單路渲染。
- Mutation：OrderingPage 原 write/lineCommit/send/receive；OrderingGrid 原 commitCell/commitNew/flush。
- Lifecycle：原 React hooks；沒有新增 DOM observer、retry／業務 API 或並行資料儲存系統。
- 需要核實：手機新建暫存列在非同步儲存後仍能保持 sheet selection、中文輸入法/Enter 跳欄、一般/廠商/中國區段切換；桌機不因共用 CSS 改變位置。已知風險：中國定期採購類別的「＋新增品項」預設指向首個區段，可從各區段擴充專用入口。

## 待驗證，不是通過紀錄
- GitHub Runtime / Governance / deployment contract / tsc / D1 / Node：PR CI 待回讀。
- 390×844（deviceScaleFactor 2）手機與 1440px 桌機修改前後各一組截圖：此執行環境無登入後瀏覽器，尚無可驗證截圖。
- Claude 最終審查：待審；其審核結論只能由 Claude 填工單 §9。
- 使用者明確要求：**不合併、不部署**，工作分支／PR 保持開啟。

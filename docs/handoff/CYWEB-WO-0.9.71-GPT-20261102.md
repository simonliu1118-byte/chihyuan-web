# WO-0.9.71｜GPT → Claude Handoff（2026-11-02）
## 來源與邊界
- 基準 main `2fc8dc8`；工作分支 `cyweb/wo-0.9.71-restock-drawer`。主功能在叫貨頁，ERP 查詢只保留四種原有類別。0.9.68、0.9.69、0.9.70 PR 尚待依各自審查。
- 版本 0.9.71／BUILD=0；沒有合併、沒有部署、沒有 Release。
## 檔案、原因與行為
- `src/ui/overlays/SidePanel.tsx`、`overlay.css`：共用右側無遮罩側板、關閉按鈕、Esc、寬度；`ErpQueuePanel.tsx` 改用，ERP 特例 CSS 移除。
- `ErpItemQueryPage.tsx`：移除 RESTOCK 類別及元件；`shared/modules.ts` 將權限代碼 ERP_RESTOCK_ASSIST 入口路由轉為 ordering，保留原權限代碼及需求。
- `OrderingPage.tsx`：頁籤列管理來源左移／新增進貨輔助按鈕；SidePanel 1100px，`useErpJob` 仍是唯一狀態 owner。後端查詢完成通知路由由 `App.tsx` 導回 ordering 並開抽屜；叫貨頁保持掛載以繼續輪詢與通知。
- `RestockAssist.tsx`：查詢起迄日使用共用 `Field`／`DateInput`；現有進貨表保留，新增每品號所有草稿提示、加入對話框顯示既有數量與來源、加入成功重新查詢草稿提示。
- `worker/http/ordering-routes.ts`：權限 ORDERING 批次 500 個品號，json_each 單次 SQL；只讀 DRAFT 且未 closed 的明細；`migrations/0045_ordering_draft_item_index.sql` 建立索引。
- `worker/backup/*`、`scripts/store-backup-upgrade.test.mjs`：新增 index-only schema 的備份指紋兼容；舊 0044 實體資料不變。
- `VERSION`、`package.json`、`TODO.md`、`CHANGELOG.md`、`WO-0.9.71.md`：版本、工單與交接。
## 實際 CI 與備份證據
- PR [#358](https://github.com/simonliu1118-byte/chihyuan-web/pull/358)。
- [Runtime Check #41437785135](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41437785135)：`f880945857...` 程式版本 **Node 577／577、0 失敗**；前端／Worker 型別、來源契約、本機 D1 驗證與 Vite Build 成功。
- [Governance #41437785070](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41437785070)：成功；[Deploy preflight #41437785139](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41437785139)：部署契約成功、真正 deploy skipped。
- 0045 schema exact：LF `e3f14b04ee560ddb43c98a2c31f2dcfb1c9710f81dd9161d018c1bd5506a1bab`、CRLF `ffd84deca22c432706918692fef76bfe050cda0598f2c6b0f2851f0c55d4e8ad`。移入 index 不改資料欄／行，舊 0044 可攜備份還原測試已通過。
- 最新提交增加查詢表單共用 Enter 導航，CI 正重新驗證；是否可合併須以最新 head Checks 全綠為準。
## Claude 複審／未完成的人工驗收
- 尚未取得桌面 1440 與手機 390 的實際瀏覽器截圖：叫貨來源頁籤＋管理來源定位、抽屜查詢結果／草稿提示、加入既有草稿的確認視窗、手機全寬；不得用自動測試冒充視覺 QA。
- 請檢查 RESTOCK toast「查看」導航回 `ordering` 的事件與背景輪詢、獨立權限、同一草稿多行及不同草稿的提示、草稿 API 必須僅返回 DRAFT 且未結案。
- 請檢查 `ERP_RESTOCK_ASSIST` 權限用戶若無 ORDERING 權限時的入口／使用體驗，避免把兩種不同權限誤視為同一種；API 已由 ORDERING 守門。
- 不修改 ERP Agent／結果欄位。此 PR 尚未合併、未部署、未建立 Release。Claude 最終結論請填工單第 9 節及本文件，不由 GPT 代簽。

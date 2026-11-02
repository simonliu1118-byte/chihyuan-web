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
## 仍待
- CI 完整測試和 0045 LF／CRLF schema 指紋核對，desktop 1440 的抽屜結果／草稿／加單視窗，mobile 390 的抽屜；目前不可宣稱通過。
- 請 Claude 審核 ERP 完成通知導向（特別是 query hidden 時）、本來已有草稿與多列同品號、Mobile Tabbar、輸入日期，並在工單 §9 留審查結果。

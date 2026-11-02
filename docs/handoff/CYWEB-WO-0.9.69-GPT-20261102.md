# Claude Handoff｜WO-0.9.69 售後維修（2026-11-02）
- 狀態：**待 CI 審查與返修**，不合併／部署。分支：cyweb/wo-0.9.69-store-repairs；起點 main 9a52fb5e55ed。
- 工單：[WO-0.9.69](../development/work-orders/WO-0.9.69.md)；新工單的 §8 GPT 回填、§9 Claude 複審仍具正式效力。
## 變更內容
- `migrations/0043_store_repairs.sql`：新增 repair/event 表與 STORE_REPAIRS 授權；須由既有 migrations 正向升級，不得手動改 D1。
- `shared/modules.ts`：獨立模組入口；`shared/store-repairs.ts`：狀態流、物流、產品、逾期、取消流程；`shared/store-workflow.ts`：與訂購共用 5 分鐘結案時間。
- `worker/store/workflow-service.ts`：共用事件寫入及版本守門，訂購 API 已轉用；`worker/http/store-repair-routes.ts`：新維修清單／編輯／日期／進度／取消及撤回／歷程路由；`worker/index.ts`：獨立路由分派。
- `src/runtime/modules/store-workflow/`：抽 ContactCells、HonorificCell、Reason 給訂購與維修共用，新增 StoreShippingFields、StoreMilestoneDateFields／StoreMilestoneStamp；`StoreRepairs.tsx`：維修表格與各流程視窗，`StorePage.tsx`：頁籤，`store.css`：最小範圍增補。
- `worker/backup/schema-columns.ts`、`portable-backup.ts`、`store-progress-upgrade.ts`：備份新表及 0042 舊版本相容；`scripts/store-repairs.test.mjs` 與 `scripts/store-backup-upgrade.test.mjs`：新流程、恢復測試。
## 檢查風險與尚待
- 0043 schema 指紋目前是待 CI 產出的 placeholder，需補齊 LF／CRLF 值後再視為備份可用；未完成前不能合併或部署。
- 訂購頁共用元件抽取後需跑整套 UI、Store Routes 測試。
- 動態表格寬度、手機操作、物流欄位與各對話框須真實瀏覽器 1440／390 驗收，暫無截圖。
- 其他異動與缺漏請 Claude 直接寫入本 Handoff 與工單 §9；GPT 會返修後再交付。

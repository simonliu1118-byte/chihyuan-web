# Claude Handoff｜WO-0.9.69 售後維修（2026-11-02）
- 狀態：**CI 全數通過、待 Claude 複審與真實瀏覽器畫面驗收**；不合併／部署。分支：cyweb/wo-0.9.69-store-repairs；起點 main 9a52fb5e55ed。
- 工單：[WO-0.9.69](../development/work-orders/WO-0.9.69.md)；新工單的 §8 GPT 回填、§9 Claude 複審仍具正式效力。
## 變更內容
- `migrations/0043_store_repairs.sql`：新增 repair/event 表與 STORE_REPAIRS 授權；須由既有 migrations 正向升級，不得手動改 D1。
- `shared/modules.ts`：獨立模組入口；`shared/store-repairs.ts`：狀態流、物流、產品、逾期、取消流程；`shared/store-workflow.ts`：與訂購共用 5 分鐘結案時間。
- `worker/store/workflow-service.ts`：共用事件寫入、版本守門、requestKey 格式判斷，訂購與維修 API 均已轉用；`worker/http/store-repair-routes.ts`：新維修清單／編輯／日期／進度／取消及撤回／歷程路由；`worker/index.ts`：獨立路由分派。
- `src/runtime/modules/store-workflow/`：抽 `ContactCells`、`HonorificCell`、`Reason` 給訂購與維修共用；物流為 `StoreShippingFields`；日期欄與彈窗共用 `StoreMilestoneButton`、`StoreMilestoneDateFields`、`StoreMilestoneStamp`；操作欄四圖示共用 `storeWorkflowActions`，**既有訂購與新增維修都已切換到共用版本**；`StoreRepairs.tsx`：維修表格與各流程視窗，`StorePage.tsx`：頁籤，`store.css`：專屬最小樣式。
- `worker/backup/schema-columns.ts`、`portable-backup.ts`、`store-progress-upgrade.ts`：備份新表及 0042 舊版本相容；`scripts/store-repairs.test.mjs` 與 `scripts/store-backup-upgrade.test.mjs`：新流程、恢復測試。
## 實際 CI 驗證
- [PR #354](https://github.com/simonliu1118-byte/chihyuan-web/pull/354)；功能與共用元件最新提交請以 PR Head 為準（含訂購日期格／四圖示抽出）。
- [Runtime Check #41420795673](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41420795673)：Node **567／567 通過、0 失敗**，前端與 Worker typecheck、來源契約、本機 D1 接受度及 Vite Build 成功。
- [Governance #41420795649](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41420795649)：成功；[CY Web Deploy PR preflight #41420795771](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41420795771)：僅 deploy-contract 驗證，正式部署 job skipped。
- 0043 LF／CRLF 結構指紋已登錄於 `worker/backup/store-progress-upgrade.ts`。新測試驗證 0042 備份可還原到 0043，補上空白維修表且原始客戶資料不變。
- 初版曾有 Worker Audit 型別、共用 UI 測試替身與 portable backup 指紋問題；於共同欄位、日期格與四圖示抽出後，已依既有訂購測試修正合成元件文字展開。**請以最新 PR Head 的 Runtime Check 全通過為合併前提**，舊 SHA `f024243` 的 567／567 僅是整理共用日期前的合格基準。
## Claude 複審／尚待驗收
- **尚未執行**桌面 1440／手機 390 真正瀏覽器截圖；須檢查各狀態含逾期／無異常、維修表單、日期／無日期、物流、自取／寄送與取消視窗，及手機操作。
- 重點核對取消後 **不結案**，通知及歸還仍可完成；已送廠須先收回；5 分鐘撤回、日期修正／退回與 Audit、獨立權限授權。
- 目前沒有正式 D1 migration 執行紀錄，**未合併、未部署**，不可將自動測試等同人工正式環境驗收。
- Claude 請在工單 §9 與此 Handoff 回填「通過／需返修」，不得由 GPT 代填 Claude 結論。

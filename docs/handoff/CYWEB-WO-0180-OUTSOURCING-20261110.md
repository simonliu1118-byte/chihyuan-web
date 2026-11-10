# CYWEB WO-0.18.0 — 開發完成交接（待 Claude 審查）

- 日期：2026-11-10。
- 工單：`docs/development/work-orders/WO-0.18.0.md`（含 §8 完成報告）。
- Repo：`simonliu1118-byte/chihyuan-web`。
- 起點：main `7527b8898aefce3673cb80de67b07224e6d1b8e6`，正式 V0.17.3。
- 開發分支：`cyweb/wo-0.18.0-outsourcing`，V0.18.0。
- PR：[**#494 — 委外代工分批流程改版**](https://github.com/simonliu1118-byte/chihyuan-web/pull/494)。
- **禁止合併、部署、對正式 D1 執行 0062；Claude 先依 §9 複審。**

## 實作清單

1. `migrations/0062_outsourcing_flow.sql` — 增加廠商結帳方式，移除未有正式資料的舊單次代工單相關表，建立多成品、多批發料、交貨、退料／盤點、ledger、對帳單、其他費用與付款。保留 contractors／contacts／pricing／BOM 主檔，重新建立 `retire_outsourcing_orders_identity` trigger。
2. `worker/outsourcing/flow-service.ts`、`shared/outsourcing-flow.ts` — service 擁有四狀態、產品進度（含單位換算）、多批操作、取消反向 ledger、實際餘額與最新發料後電池基準、建議發料、交貨扣料預告、按 BOM 分組及估算可做數量、可編輯空白工單、對帳付款。對過期 revision 回 409；所有寫入留共用 Audit。
3. `worker/http/business-api-phase2-routes.ts` — `OUTSOURCING` module gate 不變，新 orders/stock/history/groups/statements/preview/issue-suggestion API，刪除舊單次出庫／計價／付款路由。
4. `src/runtime/api/outsourcing-flow-client.ts`、`OutsourcingOperationalPage.tsx` — 五頁籤依序為代工單／對帳付款／代工庫存／協力廠商單價／BOM。工單主檔（含未發料原位編輯）、出入庫紀錄、發料建議、交貨預告、負庫存、按成品分組、異動歷史、月結或勾選交貨、草稿費用與付款；切換頁籤時保護未存檔草稿。
5. `src/runtime/modules/OutsourcingMasterData.tsx` — 協力廠商結帳方式與完整表格式資料單；BOM 主檔與料件明細檢視／編輯共用 `RecordSheet`／`RecordRows`。手機共用 `ModuleSections`、`ListRow`、`MasterDetailBack`、`ActionBar`。
6. `src/ui/data/StockGauge.tsx`／`stock-gauge.css` — 綠、黃、紅電池及完成度共用條。負數百分比顯示「—」且數量紅字粗體。BOM 只呈現 `recipe_ref`，不用 ID。
7. `worker/backup/schema-columns.ts`、`portable-backup.ts` — 新資料表可攜匯出與還原；`CURRENT_MIGRATION="0062_outsourcing_flow"`；舊版備份只允許升級空白舊代工表，若有紀錄就拒絕以避免漏帳；其他業務資料維持原值。
8. `docs/architecture/CONTRACTOR_OUTSOURCING_MODULE_CONTRACT.md`、`UI_COMPONENT_CATALOG.md`、`VERSION`、`package.json`、`CHANGELOG.md`、`TODO.md` 已同步。

## 測試與證據（工程 CI 全綠）

- [Runtime Check](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42794557399)：`source-contracts`、`browser-typecheck`、`worker-typecheck`、`build` 四個 job 全數 success。Build job 包含本地 D1 acceptance、schema 與備份、完整 `node --test scripts/*.test.mjs`；舊驗收是重寫成新流程，**不是刪除**。
- [Governance Check](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42794557003)：success。
- [Visual Acceptance](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42794557180)：success；[十二張 PNG 截圖的 GitHub Artifact](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42794557180/artifacts/13752249266)。
- Visual 以真實 `OutsourcingOperationalPage` + 隔離 API fixture，桌機 1440×900、手機 390×844（deviceScaleFactor 2）各六張：代工單、發料、交貨入庫、代工庫存含黃／紅／負數、對帳含付款、協力廠商主檔。
- D1 acceptance 對使用者的電池條案例逐步驗證 100 → 10 → 再發 100 → 5 → 再發 100 的 100／10／100／5／100%，且多批入庫、BOM 扣料、取消沖銷；HTTP acceptance 驗證 confirmed 對帳不可撤銷交貨、部分付款與 stale 409 無副作用。
- 可攜備份回歸、歷史 V1／V2 備份 fixture 與 `CURRENT_MIGRATION` 驗證均隨 full Node suite 通過。
- **限制：** 截圖來自隔離資料 fixture，**不是**登入後正式站或 Cloudflare D1 實機驗收；上線前須另有備份確認、真人流程與裝置覆核。這不妨礙在未合併狀態進行 Claude 的程式審查。

## 審查順序與注意事項

- 優先比對 [WO §2／§6](../development/work-orders/WO-0.18.0.md) 與此程式分支，尤其 `0062` 的資料保留、退役 ID trigger、D1 批次 rollback、revision/Audit、stock baseline、單位換算、金額四捨五入與 confirmed statement 的交貨鎖定。
- UI 截圖用的一次性 `scripts/visual/wo0180*` 與 `wo-0180-visual.yml` 已在 Claude 審查時移除（不留常駐 CI）；截圖證據見 PR #494 的 run 42795788312 artifact。未登入真實站的測試不可冒充正式端驗收。
- ERP 連動使用者明確指示不做；只留手動 ERP 單號與 `TODO.md` 的獨立待辦。
- 請 Claude 在工單 §9 寫下 reviewer、結論、必修項與測試證據；若有問題先在本 PR 修正，**不得自動合併或部署**。

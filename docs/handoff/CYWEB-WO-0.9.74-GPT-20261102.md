# WO-0.9.74｜GPT → Claude Handoff

## Source / 版本 / 合併邊界
- PR [#362](https://github.com/simonliu1118-byte/chihyuan-web/pull/362)，分支 `cyweb/wo-0.9.74-receipts-dates`，程式 V0.9.75／BUILD 0，工單仍為 WO-0.9.74。
- 基準 main `1690020eb246fa896e7a197105afbe19c1a23359`（V0.9.73）；工作期間主線先後合併 V0.9.74 及 docs，已於合併提交 `87dd69ccdc0dda4d5406a3857f2c24648126ad75` 將 `b75f29165006cb61fc05e04510592e393f1ca33d` 以第二父系納入分支。此 merge 是原生 Git 雙父系提交，不覆寫主線的進貨輔助按需草稿查詢、抽屜尺寸、藍色按鈕或 SidePanel。
- 此 PR 由 Claude 開工單、GPT 實作、Claude 複審，**未合併、未部署、不發 Release**。

## 修改檔案與變動原因
1. `worker/http/ordering-routes.ts`：read `ordering_receipts` 加 `app_members` display name；新增 `PUT/DELETE /api/business/ordering/orders/:id/receipts/:receiptId`。ORDERING 權限與 `expectedVersion` 檢查維持原架構，D1 batch 更新／刪除主檔和明細，同時保留 1 筆 audit、ordering_revisions；不新增 migration。
2. `shared/ordering.ts`：單一 `receiptItemSummary` 用於前端每筆到貨摘要與後端修訂摘要，不另建格式規則。
3. `OrderingPage.tsx`：到貨 5 欄／手機卡片；`IconButton` 使用 `Icons.edit`／`Icons.remove`；刪除須危險確認。原登記到貨 `Dialog` 依 `receiptId?:number` 切換新增／編輯，原進貨單號、日期、品項回填，可補其他品項、已有品項改為 0，整筆不能全為 0。數量上限已排除該筆既有到貨，closed 只能減；同單號提示排除自己。資料更新後 `write` 原路徑自動刷新 detail、pending。
4. 日期換成 `DateInput.tsx`：`AuditOperationalPage`、`CustomerOperationalPage`、`ErpCustomerQuery`、`ErpItemQueryPage`、`ErpPartyOrdersDialog`、`ErpSupplierQuery`、`HrLeaveDialog`、`HrLeavePanel`、`HrOperationalPage`（含原 dynamic type date）、`HrPhase2aSettings`、`HrSettingsButton`、`OrderingPage`、`OutsourcingOperationalPage`、`SalesOrderOperationalPage`、`WorkLogOperationalPage`、`customer/QuoteCreateForm`、`defect/DefectForm`；ERP `RestockAssist` 用 custom validity selector。保留 min/max/required/disabled，input 改 ISO onChange string。
5. `src/ui/forms/date-input.css`：放寬 regular 與 compact，避免 YYYY/MM/DD 截斷；`src/runtime/modules/erp-item-query.css`：日期篩選套在 `.cy-date-input`，新增手機 680px 卡片／摘要換行。無新增獨立日期 UI。
6. `scripts/ordering-route.test.mjs`：PUT/DELETE、版本衝突、數量上限、全部 0、closed、voided、登記人、刪除回 SENT；`scripts/ordering-page.test.mjs`：到貨明細、帶值編輯、刪除確認；`scripts/form-keyboard.test.mjs`：禁止 src 原生日期控制。
7. `VERSION`、`package.json`、`TODO.md`、`CHANGELOG.md`、`WO-0.9.74.md` 與本 Handoff 更新；其他產品模組、ERP Agent、CYID、D1 schema 不修改。

## 測試與證據
- [Runtime Check #41443489077](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41443489077)，SHA `80c6c1607`：**Node 588/588 全過、0 失敗**，browser/worker 型別、source-contracts、Local D1 runtime acceptance、Build 均成功。
- 最新 `main` 整合後的新提交 CI 仍需確認，**不能把前一筆綠燈當作最新 head 的驗證**。
- 原生日期來源字串掃描納入 Node source 測試；月份輸入維持 `type="month"`。
- 視覺桌面 1440、手機 390 截圖／實際互動**尚未執行**；請 Claude 或使用者完成後回填，不要冒稱完成。

## Claude 審查重點及待補
- 覆核同筆不計入數量上限，作廢不能 PUT/DELETE，已結掉只能減，刪除最後到貨後才能重新顯示「修改叫貨單」（V0.9.73 lock）。
- 覆核 main #360 的進貨輔助抽屜寬度、藍色按鈕、草稿查詢延後行為沒有被本次改版覆蓋。
- 桌面：2–3 筆到貨、多品項不截斷、修改與刪除確認、3 個 date views；手機：到貨卡片、日期及修改 Dialog。
- 如需修正請回原 PR 補 commit 與本文件；**Claude 最終審核結果由 Claude 填 WO §9，不得由 GPT 代簽。**

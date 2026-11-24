# CYWEB V0.28.0 Build 1 — 薪資流程重整交接

## 狀態與使用者決策（2026-11-24）

- 分支 `cyweb/v0.28.0-payroll-flow`，基於 origin/main（V0.27.0）。沒有 migration，CURRENT_MIGRATION 不變。未開 PR、未合併、未部署、未碰任何遠端／正式 D1。
- 已核准的原型：薪資設定（s4）、每月薪資桌機（s5）與手機（s6）、流程（s7）、月份標頭（t1）、原因視窗（t4）。
- 使用者決策：薪資子頁為「薪資設定｜每月薪資｜獎金發放｜公司補充保費」；每月薪資一個月份一張工作清單；首次計算、計算全部、重算草稿、確認、確認全部都不問原因，後端存預設「YYYY/MM 月薪」；撤回確認、撤回後重算、手動異動才必填原因。
- 不變：薪資計算公式、法定表、稅額與保費規則、快照不可變、樂觀鎖與來源比對、授權（僅 SUPER_ADMIN）。

## 修改檔案與理由

| 檔案 | 行為與原因 |
| --- | --- |
| `worker/hr/hr-payroll-service.ts` | `defaultReason`；`calculate` 未填原因存預設、已有撤回快照時必填、`paidDays` 仍必填；`transition` 的 `reopen` 必填、`confirm`／`pay` 預設；新增 `monthOverview`；`list` 支援 `employeeId` 並回傳 `reason`。計算與守門邏輯未動。 |
| `worker/http/hr-payroll-routes.ts` | `GET /payroll/month`、`GET /payroll/runs` 的 `employeeId` 參數。 |
| `src/runtime/modules/hr-payroll-flow.ts`（新） | 純邏輯：狀態分類與計數、篩選、合計、待補事項動作對應、計算全部／確認全部批次（同時數、錯誤收集）、摘要與計薪／投保說明。 |
| `HrPayrollMonthly.tsx`、`HrPayrollDetail.tsx`、`hr-payroll-flow.css`（新） | 每月薪資清單、狀態卡、批次、右側／手機整頁詳情、原因與確認小視窗（共用 `useFormPrompt`／`useConfirmation`，small 400px）。 |
| `HrPayrollPanel.tsx`、`HrPayrollProfileEditor.tsx`（新） | 四個子頁；計薪／投保設定視窗搬到獨立檔（欄位、API、驗證原樣）。 |
| `HrSalaryOverview.tsx`、`HrEmployerSupplement.tsx` | 薪資設定一覽重做；公司補充保費獨立子頁加 `MonthPicker`（邏輯不變）。 |
| `HrOperationalPage.tsx`、`HrAttendancePanel.tsx` | 到出勤補正／請假補單的跨頁定位，離開薪資頁後還原子頁、月份、員工。 |
| `hr-operational.css` | 薪資設定表格最小寬度。 |
| 測試 | 新 `scripts/hr-payroll-flow.test.mjs`、`scripts/hr-payroll-flow-ui.test.mjs`；調整 `hr-payroll.test.mjs`（撤回後重算帶原因）、`hr-payroll-ui.test.mjs`（舊整頁測試改由新測試涵蓋）、`hr-table-ui.test.mjs`、`ui-shell-v0270.test.mjs`、`test-support/hr-ui-fixture.mjs`（補 `useId`）。 |
| 文件 | `HR_MODULE_CONTRACT.md`、`HR_PAYROLL_CONTRACT.md`、CHANGELOG、TODO、handoff README。 |

## 實作時的取捨（請確認）

1. 標記已發薪也不問原因（預設「YYYY/MM 月薪」），但按下前有一個確認視窗說明「標記後唯讀」；使用者決策只列出確認類不問原因，此為依同一精神的延伸。
2. 有待補事項的列，實領欄顯示「待確認」而非原型的數字，合計列的實領不含有待補者（沿用原本「有待補不顯示實領」的安全做法）。
3. 缺卡（非「未打卡」）只提供「到出勤補正」：後端沒有能消除缺卡待補的確認類別，放「確認曠班」會誤導。
4. 計算全部略過「已撤回確認、尚未重算」的人（重算須個別填原因），並在結果列出；撤回過但已有草稿者，沿用草稿原本的原因重算。沒有薪資主檔者不納入計算全部（先設定薪資）。
5. 薪資設定視窗或計薪／投保設定視窗存檔後，會自動重算該員工；若該月撤回過確認則只提示請手動重新計算並填原因。
6. 出勤頁只定位到員工與月份（不定位日期）；員工超過 100 人且不在第一頁時，出勤員工下拉不會顯示該員工名稱（資料仍正確載入）。
7. 月份清單的「應發薪」定義：到職日不晚於月底且（無離職日或離職日不早於月初），或該月已有非撤回薪資紀錄。

## 驗證

- 全 Node 測試、`npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local`、`git diff --check`；結果見交付回報。
- 真實瀏覽器（Vite＋合成 API）：1440×900、390×844 淺深色的薪資設定（含展開）、每月薪資清單與詳情、原因視窗、確認全部視窗、批次結果、補充保費子頁；截圖不含真實資料。

## Claude 審查

審查結論（Claude，2026-11-24）：通過。已核對後端原因規則、`GET /payroll/month` 唯讀與上限、計算／快照／樂觀鎖未變、批次動作只碰未計算與草稿、桌機與手機截圖。審查時修正一處：月份清單的門市改讀 `hr_employee_current`（今日有效門市），與人員清單一致。七項實作取捨皆接受。使用者授權審查通過即合併部署。

- [x] 確認後端原因規則：首次計算、重算草稿、確認、標記已發薪不需原因；撤回確認、撤回後重算、指定計薪天數必填；每個動作仍有稽核列。
- [x] 確認 `GET /payroll/month` 唯讀、參數化、有界（500 人上限）、僅 SUPER_ADMIN，且不把月份清單當成計算來源。
- [x] 確認計算公式、法定表、快照不可變、樂觀鎖與來源比對、授權沒有被改動（`calculate` 與 `transition` 的守門碼只增加原因判斷）。
- [x] 核對計算全部／確認全部：同時數、已確認與已發薪不動、單筆失敗不中斷、409 標「需重新計算」。
- [x] 核對待補事項動作對應（`classifyIssue`）與確認類動作的核對原因視窗（small 400px）。
- [x] 核對桌機與手機（390px）淺深色截圖；手機詳情的返回與底部固定操作列。
- [x] 確認上列「實作時的取捨」。

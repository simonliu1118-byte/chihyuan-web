# CY Web V0.11.2 出機表單改版交接

- 日期：2026-11-05（台灣）；執行：GPT。
- 來源：`main` @ `dcfeaae13893da190b8914593f6f5f343873a1e6`；工作分支：`cyweb/equipment-form-warranty`。
- 使用者確認：銷售日期、數量放客戶資料同一列；保固起訖同欄、月數雙向換算（2024/05/15 + 3 月 = 2024/08/14，日期差換算無條件進位）；定期維護需／無須二選一；移除「機身資料 N 台」；機身列接續外表表頭表身；製造年月使用共用日期選擇器，YYYY/MM。
- 新增草稿定期維護預設未選，修改既有紀錄顯示保存值；無客戶編號時不可選需維護，與既有後端規則一致。

## 修改範圍與原因

| 路徑 | 修改 |
|---|---|
| `src/runtime/modules/StoreEquipment.tsx` | 六欄首列、保固單欄、月數雙向草稿計算、維護 radio 二選一、機身表格不巢狀、製造年月用共用日期元件。 |
| `src/runtime/modules/store-equipment.css` | 欄寬、保固日期左右排列、單選群組排版；僅限出機表單。 |
| `shared/store-equipment.ts` | 維持原本起日含當天、到期日前一天的保固期計算；起訖日期回算日曆月數採無條件進位。 |
| `src/ui/forms/DateInput.tsx`、`shared/date-input.ts` | 原共用控件加入 `precision="month"`，年月輸入／選擇器顯示 YYYY/MM 並回傳 YYYY-MM，不另建第二套。 |
| `src/ui/forms/Field.tsx` | 共用 `CheckField` 支援 radio，原 checkbox 行為不變。 |
| `scripts/store-equipment.test.mjs`、`scripts/date-input.test.mjs` | 更新／補充日曆月及年月輸入測試。 |
| `VERSION`、`package.json`、`CHANGELOG.md`、`TODO.md`、`docs/architecture/*`、`docs/handoff/README.md` | 版本、現行契約與審查入口同步。 |

## 行為與資料風險

- 既有 API 欄位 `maintenance:boolean`、`warrantyStart`、`warrantyEnd`、`manufacturedMonth:YYYY-MM` 不變；不改 Worker、權限、migrations 或既有備份格式。
- 既存保固起訖日原值保持不變；開啟修改時僅以新公式顯示月數。只有使用者編輯月數才重算訖日，避免舊紀錄在沒有操作時被改寫。
- 月數限既有 1–600 個月換算範圍。要保養維護時，保固日期與至少一個預計月份仍由既有 Worker 驗證。
- 不修改矩陣、出機 API 或門市送修流程。

## 驗證與 Claude 複審

- 應驗證：年月輸入有效／無效、五月十五日加三個月到八月十四日、月底計算、非整月回算進位、舊日期讀取／修改、互斥選項與未勾選時的必填、鍵盤 Enter、第一列六欄、機身直接接續外表。
- 自動驗證：以 PR 的 Runtime Check／Governance Check／部署契約檢查為準；PR 驗證不等於部署。
- 真實桌面／手機外觀及日期選擇器的互動仍待人工驗收，未以 CI 冒充已驗收。
- Claude 最終審查：**待審查**；GPT 不代填通過。使用者尚未授權合併／正式部署。

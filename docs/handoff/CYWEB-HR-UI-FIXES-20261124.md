# CYWEB V0.29.1 — 人事介面修正與全面巡檢交接

## 狀態與使用者決策（2026-11-24）

- 分支 `cyweb/hr-ui-fixes-20261124`，基於 origin/main（V0.29.0）。版本選擇：V0.29.1、Build 0（新的獨立修改項目，Z + 1、Build 歸零；學歷備註只是一個可為空的欄位，不達 Minor 標準，依 REPOSITORY_RULES §6 不升 Y）。
- 有 migration `0084_hr_education_note.sql`；`CURRENT_MIGRATION` 為 `0084_hr_education_note`。未合併、未部署、未碰正式 D1。
- 使用者要求（原始五項＋擴充三項＋全面巡檢）：員工資料單備註上移、學歷／經歷欄對齊與學歷備註、狀態異動欄位拆分且不列建檔、排班工具列與聚焦外框、排班表字級／格線／雙週線、請假年份選擇、薪資設定間距與橫線、全模組巡檢。

## 修改檔案與理由

| 檔案 | 行為與原因 |
| --- | --- |
| `migrations/0084_hr_education_note.sql`（新） | `hr_education.note TEXT` 可為空；本 repo 子表欄位不加 CHECK，長度由 API 驗證。 |
| `worker/hr/hr-service.ts` | 學歷子表加 `note`（選填、200 字，錯誤欄位 `educationNote`）；`get()` 的 `statusChanges`／`assignmentChanges` 每列加 `is_creation`。 |
| `worker/hr/hr-self-service.ts`、`MyProfilePage.tsx` | 自助頁學歷含備註；異動紀錄不含建檔（後端排除）。 |
| `worker/backup/portable-backup.ts`、`schema-columns.ts` | `CURRENT_MIGRATION` 0084；`hr_education` 欄位加 `note`。舊備份缺該欄採資料庫預設 NULL，不需新的 UPGRADES。 |
| `src/runtime/modules/HrEmployeeSheet.tsx`、`ui/forms/RecordSheet.tsx` | 備註移到第四列（佔 2 欄、單行）；`RecordRows` 新增 `grid`（共用欄寬）與 `span`；學歷／經歷共用 `HISTORY_GRID`。 |
| `HrOperationalPage.tsx`、`hr-operational.css` | 狀態表四欄（生效日期｜異動日期｜異動內容｜原因）、日期不換行、手機卡片；過濾 `is_creation`；資料單最小寬 780px；年月輸入欄內距。 |
| `ui/forms.css`、`ui/data/data-view.css` | 聚焦外框改為單一 inset 2px outline；搜尋框 260–280px。 |
| `ui/forms/MonthPicker.tsx`、`month-picker.css` | `precision="year"`（3×4 年份格）；請假、獎金、我的資料、國定假日改用；售後維修矩陣箭頭改無框樣式；移除 `.cy-hrs-year`。 |
| `HrRosterPanel.tsx`、`hr-phase2a.css` | 字級 14px、列高 40px、1px 格線、移除分組粗白帶、`dayClass` 讓雙週線與假日底色貫穿整欄；列印 13px；格內選項內距；手機出勤卡片內距。 |
| `app.css` | 多 `tbody` 分組表格只去除最後一組的最後一列底線（薪資設定表橫線恢復）；`h3` 後工具列間距。 |
| `HrPayrollPanel.tsx`、`hr-payroll-flow.css` | 薪資子頁籤與下方內容的 12px 間距；獎金視窗垂直節奏。 |
| `HrLeavePanel.tsx`、`hr-phase2b.css`、`HrEmployerSupplement.tsx` | 請假頁區塊節奏、補休帳戶空狀態；補充保費空狀態說明。 |
| `docs/architecture/UI_COMPONENT_CATALOG.md` | 新增 §7「介面檢查清單」。 |
| 測試 | 新 `scripts/hr-ui-fixes.test.mjs`；`hr-current-values.test.mjs`（`CURRENT_MIGRATION`）；`hr-phase1-acceptance.ts` 帶學歷備註。 |
| 文件 | `HR_MODULE_CONTRACT.md`、CHANGELOG、TODO、handoff README、VERSION、BUILD、package.json。 |

## 審查後第二輪（Claude 審查 2026-11-24）

排班表固定版面（colgroup＋等寬日期欄）、−0 金額、調薪視窗提示行與津貼空狀態、法定級距／獎金／出勤／補充保費空狀態、手機薪資紀錄列、計薪／投保設定欄名置頂、狀態異動卡片日期整行、請假分隔符一致、四個原因視窗（撤回確認、調整計薪天數、確認曠班、確認全部）截圖。未動身分證「顯示」按鈕版面。

## 實作時的取捨（請確認）

1. 建檔紀錄不從資料庫或 API 回應移除，只加 `is_creation` 旗標由畫面過濾（V0.29.0 的舊值推算依賴它）。判斷＝原因「建檔」且（任用紀錄沒有舊值／狀態紀錄前後相同）；使用者自己輸入原因「建檔」的真實異動一定有舊值，不會被誤判（有測試）。
2. 搜尋框寬度改在共用 `.cy-data-search`（280px 上限），所有使用工具列的頁面一起變窄，符合「共用層修正」；手機維持滿版。
3. 聚焦外框改用 `outline`（內縮 2px）而不是 `box-shadow`：不會被任何 `overflow:hidden` 容器裁切；原本的 3px 淡色陰影移除。
4. 資料單最小寬度由 1060px 降為 780px，避免 1440 視窗內橫向捲動；備註、地址以刪節號顯示。
5. 學歷／經歷共用欄寬比例 15／11／29／29／16%：就讀年月與起迄年月都要放得下兩個年月輸入框。
6. 售後維修矩陣的「〈 〉」範圍箭頭改為無框箭頭（範圍切換不是月份／年份選擇，不適用 `MonthPicker`）。

## 驗證證據

- 見 CHANGELOG 與下方結果表（最終數字於推送前填入）。
- 截圖與逐項檢查表：`/tmp/claude-0/-home-user/04d2ad10-f9b3-5958-aff8-f556061b5368/scratchpad/hr-ui-fixes/INDEX.md`（桌機 1440×900、手機 390×844、淺色／深色、含空狀態）。資料為合成資料，以真實 Worker＋記憶體 D1 提供。

## Claude 審查

審查結論（Claude，2026-11-24）：第一輪退回 10 項（排班欄寬與整月顯示、原因視窗未驗證、−0、調薪視窗提示與空津貼、法定級距空表、手機薪資卡片／計薪投保視窗／狀態異動卡片、出勤空狀態、請假分隔符），第二輪 `a2f2750` 逐項核對截圖後通過。使用者授權審查通過即合併部署；部署前確認正式 D1 在 0083、當日備份已驗證。

- [x] migration 0084 與備份欄位／`CURRENT_MIGRATION` 一致，舊備份還原為 NULL。
- [x] `is_creation` 判斷與自助頁排除建檔；第一筆真正異動的舊值仍為建檔值。
- [x] 員工資料單第四列配置、學歷／經歷欄對齊（含編輯模式年月輸入完整顯示）。
- [x] 狀態異動卡與完整清單欄位、字級、手機卡片。
- [x] 聚焦外框在人員、排班、出勤、薪資、客戶清單皆完整可見（淺色／深色）。
- [x] 排班表字級、1px 格線、雙週線貫穿表身、假日底色整欄一致、列印預覽。
- [x] 請假／獎金／我的資料／國定假日年份選擇改用共用選擇器。
- [x] 全站分組表格橫線、薪資子頁籤間距。
- [x] 介面檢查清單（UI_COMPONENT_CATALOG §7）與巡檢截圖。

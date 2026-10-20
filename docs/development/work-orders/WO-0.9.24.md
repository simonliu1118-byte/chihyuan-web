# WO-0.9.24 人事第二期 2a：門市、班別、國定假日、月排班表、出勤輸入與列印

- 狀態：待執行
- 分支：`cyweb/hr-phase2a`（建議）　PR：（執行者填）
- 依據：
  - `PROJECT_RULES.md` §9；
  - **BD-059**、**BD-060**；
  - 設計 `docs/architecture/HR_MODULE_DESIGN.md` **§5.1～5.5、5.9**（本單以該文件為準）；
  - 共通規則 `REPOSITORY_RULES.md` §11.3（大量資料作業）。
- 視覺規範：`docs/architecture/CY_WEB_VISUAL_GUIDE.md`
- 參考檔：使用者現行 Excel 班表的版面，見 §5.5 的描述。檔案不進 repo。

## 0. 執行限制（必讀）

- **不得新增或修改 `.github/workflows/*`**，不得新增工作單未列出的檔案類型（示意圖、mock HTML、SVG、另外的測試 runner 等）。截圖由審查者以實際畫面擷取。
- 不合併、不部署。
- 測試與驗收資料一律使用明顯虛構的人名，例如「測試員工甲」。
- 權限同第一期：後端全部限 `SUPER_ADMIN`，不加入模組授權。

## 1. 背景

使用者目前用 Excel 月班表（每月一張工作表，A4 橫式）。人事第二期要把排班、出勤搬進 CY Web，並符合雙週變形工時規定。第二期拆兩張工作單：

- **本單 2a**：門市與職稱、班別、國定假日、月排班表（自動例休與合法性檢查、列印）、出勤輸入與異常清單。
- **下一張 2b**：請假與附檔、特休扣抵與遞延、加班確認與補休帳戶、國定假日換休帳戶、特休書面通知。

## 2. 已定案事項（不得更改）

以 BD-060 與設計文件 §5 為準。重點：

1. 每週為週一到週日；雙週由門市設定的**起算週一**往後每 14 天一組，**會跨月**。
2. 排班只排「休」。例假、休息日由系統依 §5.4 自動標示，不能手動指定。
3. 全時人員的合法性檢查：
   - 每週至少 1 天例假；
   - 每雙週休假日至少 4 天；
   - 每日正常工時不超過 10 小時、每週不超過 48 小時、每雙週不超過 80 小時。
4. 班別、國定假日、門市、職稱都是設定資料，不寫死在程式裡；只有預設資料由 migration 建立（§5.1）。
5. 出勤記到分鐘，最多兩組上下班；出勤紀錄不能刪除，修改要寫稽核。
6. 註記：居家工作（視同依排定班別出勤、不需打卡）、擺攤（上班日，不檢查遲到與早退）、颱風假。「X」表示兼職當天不要來。
7. 日期顯示 `YYYY/MM/DD`，時間顯示 `HH:mm`，工時顯示到 0.5 小時，例如 7.5。

## 3. 範圍

1. **Migration `0018_hr_phase2a.sql`：**
   - 新增資料表 `hr_stores`、`hr_job_titles`、`hr_shift_types`、`hr_holidays`、`hr_schedule_days`、`hr_schedule_months`、`hr_attendance_days`；
   - `hr_employees` 新增欄位：`store_id`、`job_title_id`、`roster_sort`、`employment_type`（full／part）、`schedule_mode`（shift／hours／none）；
   - 預設資料：門市「志遠高雄門市」（起算週一 `2026-09-28`）、職稱（店長、門市、業務、美編、兼職，依此排序）、班別（早、晚、日、A、B、C，見設計 §5.2）。
2. **共用純函式** `shared/hr-roster.ts`：雙週切分、例假與休息日標示、合法性檢查、國定假日換休天數，算法見設計 §5.4；以及出勤計算 `shared/hr-attendance.ts`，見設計 §5.5。兩者都要附單元測試。
3. **Worker：** `worker/hr/` 擴充，API 見 §5.2。
4. **前端：** 人事頁加頁籤「人員｜排班｜出勤」。模組設定加入門市、職稱、班別、國定假日。人員表單加入新欄位。
5. **列印：** 月班表的列印版面。
6. 稽核、備份欄位、驗收測試、文件、版本、TODO。

## 4. 不做

- 請假、補休、換休帳戶、加班確認、特休扣抵（2b）。這張單的格子還不會疊加請假；需要時先寫在格子備註。
- TimecardOCR 匯入（之後另案）。
- 線上打卡、線上請假、員工自助查詢。
- 任何薪資或金額計算。

## 5. 實作指引

### 5.1 資料表重點

- `hr_stores`：`name` 唯一、`sort_order`、`is_active`、`cycle_anchor_date`（必須是週一，存檔檢查）、`rules_template`（注意事項範本，純文字）。
- `hr_job_titles`：`name` 唯一、`sort_order`、`is_active`。
- `hr_shift_types`：
  - 欄位：`code` 唯一（1～2 字）、`name`、`start_time`、`end_time`、`break_start`、`break_end`（可空）、`normal_minutes`、`sort_order`、`is_active`。
  - 檢查：上下班時間正確；休息時段落在上下班之間；`normal_minutes` ＝ 上下班間隔 － 休息。
- `hr_holidays`：`date` 主鍵、`name`。
- `hr_schedule_days`：
  - `(employee_id, work_date)` 唯一；
  - `store_id`；
  - `kind`：shift／hours／off／absent_x；
  - `shift_type_id`（kind＝shift 時必填）；
  - `hours`（以 0.25 小時為單位，kind＝hours 時必填）；
  - `start_time`、`end_time`（kind＝hours 時選填）；
  - `marker`：home／booth／typhoon，可空；
  - `note`；
  - `updated_at`、`updated_by`。
- `hr_schedule_months`：`(store_id, month)` 唯一，`month` 存成 `YYYY-MM`；另有 `notes`、`rules`。
- `hr_attendance_days`：
  - `(employee_id, work_date)` 唯一；
  - `in1`、`out1`、`in2`、`out2`，格式 `HH:mm`，可空；
  - `source`：manual／import；
  - `note`；
  - `revision`；
  - `updated_at`、`updated_by`。
  - 下班時間可以跨午夜嗎？不行，目前班別都不跨午夜；存檔時檢查下班晚於上班。
- 寫入一律用 `db.batch`，同一 batch 寫稽核。每月排班一次存檔是一個 batch，**只寫有變動的日子**。
- **大量資料（§11.3）：**
  - 每月排班存檔最多約 人數 × 31 列；
  - 讀取一個月排班時，連同前後月份補齊雙週，只讀該門市、該日期區間，用 `(store_id, work_date)` 與 `(employee_id, work_date)` 索引；
  - 完成報告寫出單月讀取與寫入的列數估計。

### 5.2 API（全部先檢查 `SUPER_ADMIN`）

- `GET/POST/PATCH /api/business/hr/settings/stores`、`…/job-titles`、`…/shift-types`：停用而不刪除。
- `GET/POST/DELETE /api/business/hr/settings/holidays?year=`：國定假日可以刪，例如輸入錯誤；刪除寫稽核。
- `GET /api/business/hr/rosters/:storeId/:month`：
  - 回傳該月加前後補齊雙週的日期範圍、門市人員（依職稱順序、班表排序）、每日排班、國定假日、每月備註與注意事項；
  - 以及 `shared/hr-roster.ts` 算出的每人每日標示（例、休息日、休）、違規清單、每日人力。
- `PUT /api/business/hr/rosters/:storeId/:month`：
  - 傳入變動的日子與每月備註；
  - 回傳重新計算後的結果。
  - 未來日期違規時回 `409 HR_ROSTER_VIOLATION`，附上違規清單；前端確認後帶 `acknowledgeViolations: true` 再送。
  - 過去日期違規不擋，但仍回傳違規清單。
- `GET /api/business/hr/employees/:id/attendance?month=`：
  - 回傳該月每天的排班、打卡、計算結果（工時、遲到、早退）與異常。
- `PUT /api/business/hr/employees/:id/attendance?month=`：
  - 整月存檔，只寫有變動的日子；
  - 用 `revision` 樂觀鎖。
- `GET /api/business/hr/attendance/anomalies?storeId=&month=`：門市整月的異常清單。
- **稽核事件：**
  - `hr_setting.updated`（門市、職稱、班別、國定假日）；
  - `hr_roster.updated`：每次存檔一筆，`after` 列出變動的日子與班別代號；
  - `hr_attendance.updated`：每次存檔一筆，列出變動的日子與前後時間。
  - 都要補中文標籤，`scripts/change-log-labels.test.mjs` 會檢查。

### 5.3 純函式與測試

**`shared/hr-roster.ts`**
- `cyclesFor(anchorMonday, from, to)`：回傳 `[{ start, end, weeks: [[週一..週日],[...]] }]`。
- `classifyDays(days, holidays, employmentType)`：
  - 輸入一個雙週內每天的排班；
  - 回傳每天的標示：`regular_off`（例）、`rest_day`（休息日）、`off`（休）或 `work`；
  - 同時回傳違規清單與國定假日換休天數。
- `rosterViolations(...)`：檢查工時上限。
- 規則見設計 §5.4，不得自行改變。

**`shared/hr-attendance.ts`**
- `evaluateAttendance(schedule, shift, punches)`：回傳 `{ workedMinutes, lateMinutes, earlyMinutes, anomalies }`，規則見設計 §5.5。

**`scripts/hr-roster.test.mjs`** 至少涵蓋：
- 雙週跨月（起算週一 2026-09-28，10 月的 10/1 屬於 9/28 開始的那一組）；
- 每週取最後一個休假日當例假；
- 某週沒有休假日 → 違規；
- 雙週只休 3 天 → 違規；
- 休 5 天時，例假以外前 2 天是休息日，第 3 天是一般休；
- 國定假日當天上班、雙週休 4 天 → 換休 1 天；
- 國定假日在 4 天休假中 → 換休 1 天；
- 國定假日當天休、雙週共休 5 天 → 換休 0 天；
- 雙週內兩個國定假日的情況；
- 兼職不自動計算換休、不檢查工時上限，但仍檢查例假；
- 請假日、颱風假日不算休假日。

**`scripts/hr-attendance.test.mjs`** 至少涵蓋：
- 正常出勤扣休息時間；
- 遲到、早退；
- 缺卡；
- 兩組打卡；
- 居家工作不需打卡；
- 擺攤不算遲到；
- 曠職；
- 例假出勤；
- 「X」當天有打卡；
- 不排班的兼職只算工時。

### 5.4 前端

**人事頁頁籤：人員｜排班｜出勤**（沿用 `cy-op-tabs`）
- **人員：** 第一期的清單＋明細。明細的基本資料加上門市、職稱、僱用型態、排班方式、班表排序；修改表單加上這些欄位。
- **排班：**
  - 上方：門市選單、月份切換（上個月／下個月）、「列印」按鈕。
  - **月排班表：**
    - 欄：左側固定欄位為職稱、姓名；右邊是日期（含星期），最後是備註；
    - 列：依職稱分組；
    - 雙週分界用雙線；
    - 週末與國定假日整欄淡灰底；國定假日在表頭顯示名稱（hover 或小字）。
  - **格子：**
    - 顯示班別代號；
    - 系統算出的例假顯示「例」（淡色）；
    - 休息日與一般休空白；
    - 註記顯示小字，例如「居」「擺攤」「颱」；
    - 「X」顯示 X；
    - 兼職填時數就顯示數字。
  - **點格子：** 跳出小選單，內容是：
    - 依此人的排班方式列出班別按鈕；
    - 休、X、清除；
    - 時數輸入（排時段的人才有）；
    - 註記；
    - 備註。
  - **鍵盤：** 選取格子後輸入班別代號直接套用，方向鍵移動，Delete 清除。
  - 有變動時，上方出現「儲存／取消」（沿用共用編輯頭與 `useUnsavedChangesGuard`）。
  - **違規顯示：** 格子紅框；表格下方列出違規說明，例如「測試員工甲 10/12–10/25 雙週只排 3 天休」。
  - **最下方「每日人力」列：** 依班別計數，例如「早2 晚2 日3」。兼職時數另外加總，顯示在該人的備註欄。
  - **表格下方：** 「備註」「注意事項」兩個文字區塊，注意事項第一次自動帶入門市範本。
  - **手機版：** 表格可以左右捲動，姓名欄固定；點格子改用底部面板。
- **出勤：**
  - 上方：員工選單、月份切換、「異常清單」按鈕。
  - 每天一列：日期、星期、排定班別、上班 1、下班 1、上班 2、下班 2、工時、遲到、早退、異常。
  - 時間輸入接受 `0905`、`9:05`、`09:05`，自動轉成 `09:05`；Enter 移到下一格。
  - 下方顯示當月合計：工時、遲到次數與分鐘、缺卡、曠職。
  - 「異常清單」以視窗列出門市整月的異常，可依員工篩選。
- **模組設定（人事 ⚙️ 設定）：**
  - 新增「門市」「職稱」「班別」「國定假日」區塊；
  - 國定假日依年份列出，可新增或刪除；
  - 班別編輯時即時顯示算出的正常工時。

### 5.5 列印（月班表）

- 「列印」開啟列印版面，以 `@media print` 處理，不新增檔案類型：A4 橫式，邊界窄，一頁一個月。
- **版面依現行 Excel：**
  - 第一列：置中標題「志遠高雄門市　2026年10月班表」；
  - 表頭兩列：第一列是日期，第二列是星期，左上角斜線格寫「日期／姓名」；
  - 左邊兩欄是職稱、姓名，最右欄是備註；
  - 職稱分組之間空一列，比照現行 Excel；
  - 外框粗線，雙週分界雙線；
  - 表格下方：「備註」一列、「注意事項」一列，都橫跨整個表寬，可以換行。
- 另外三項：例假印「例」；週末與國定假日整欄淡灰底（印表機也看得出來）；最下方「每日人力」列。
- 兼職填時數的人，在備註欄印出當月合計時數。
- 不印出任何按鈕、選單或違規提示。

### 5.6 文件、版本、TODO

- `VERSION`／`package.json` → `0.9.24`。
- `docs/architecture/HR_MODULE_CONTRACT.md` 補第二期 2a 的 API 與資料表；`API_CONTRACT.md`、`CANONICAL_DATA_MODEL.md` 同步。
- `worker/backup/schema-columns.ts` 依 migration 更新。
- `TODO.md` 最上方新增 0.9.24 段落。

## 6. 驗收清單

- [ ] 非超管呼叫任何新 API 得 403；異動紀錄中，人事事件只有超管看得到。
- [ ] 預設門市、職稱、班別都已建立；班別的正常工時檢查正確；起算日不是週一時擋下。
- [ ] 10 月排班表正確顯示 9/28 起算的雙週雙線（10/11 與 10/25 之後），並帶入 9/28～9/30 與 11/1～11/8 補齊雙週檢查。
- [ ] 例假、休息日自動標示與違規檢查符合設計 §5.4；§5.3 列出的單元測試全部通過。
- [ ] 未來日期違規時要確認才能存；過去日期違規不擋，但會列出。
- [ ] 國定假日換休天數在排班頁每人的備註欄顯示，例如「換休 2（國慶、光復）」，2a 只顯示，不入帳。
- [ ] 出勤輸入、工時、遲到、早退、異常計算正確；§5.3 的出勤單元測試全部通過。
- [ ] 居家工作、擺攤、颱風假、X 的行為符合 §2.6。
- [ ] 列印版面符合 §5.5（審查者實際列印 PDF 比對）。
- [ ] 手機寬度可以操作排班與出勤。
- [ ] 所有稽核事件在異動紀錄中為中文句子。
- [ ] 完成報告寫出單月排班與出勤的讀寫列數估計（§11.3）。
- [ ] `npm run typecheck`、`timeout 300 npm run validate:source`、`npm run build`、`npm run validate:d1:local`、`node --test scripts/*.test.mjs` 全部通過；無法執行的項目要在完成報告寫明，不得宣稱通過。
- [ ] 沒有新增或修改 `.github/workflows/*`，沒有範圍外的檔案。
- [ ] VERSION／package.json 為 0.9.24；TODO、合約文件已更新。

## 7. 截圖要求

由審查者以實際畫面擷取：排班表（桌面、手機）、格子選單、違規顯示、出勤輸入、異常清單、設定、列印 PDF。

## 8. 完成報告（執行者填）

- PR：
- 變更檔案：
- 驗證結果（§6 逐項）：
- 讀寫列數估計：
- 已知限制：

## 9. 審查紀錄（審查者填）

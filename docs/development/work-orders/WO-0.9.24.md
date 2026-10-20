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
- **下一張 2b**：請假與附檔、特休扣抵與遞延、加班確認與補休帳戶（含手動給予的國定假日換休）、特休書面通知。

## 2. 已定案事項（不得更改）

以 BD-060 與設計文件 §5 為準。重點：

1. 每週**固定**為週一到週日，不能調換；雙週由門市設定的**起算週一**往後每 14 天一組，**會跨月**。
2. **排班填法：** 格子只填班別、時數、「/」（例休日）、X（兼職不用來）、或整天請假的假別代號。系統只從「/」中標出哪天是例假，不能手動指定。**國定假日由使用者手動處理**：要算例休就畫「/」，不算例休就填假別「國」；系統不自動判斷國定假日，也不產生換休。
3. **三種僱用型態**（設計 §5.1 的表格）：
   - 正職：排班別，全部規則；
   - 半職：規則同正職，可以排班別、時段或時數；
   - 兼職：可以排班別、時段或時數，或不排班。兼職不管例休，只檢查連六、連七與每日 8 小時（超過要核准）；空白格與 X 都是不上班。
4. **合法性檢查**（以下例休與工時規則只適用正職、半職；未來日期擋下；正職、半職的空白格視為「未排」，包含未排日子的週次與雙週不檢查，連續天數遇到未排就結束；「不排班」的兼職存檔時不檢查，見設計 §5.4 第 1 點）：
   - 連續上班 7 天以上（三種都適用）；
   - 每週（週一到週日）至少一天例休日，作為該週期的例假；
   - 每雙週例休日至少 4 天；
   - 每日正常工時不超過 10 小時、每週不超過 48 小時、每雙週不超過 80 小時。
5. **連續上班**（公司規定；三種都適用）：
   - 兩個例休日之間最多連續上班 5 天；請假（含國、補、換）與颱風假都不中斷。
   - 連六：提醒，按「核准」才能存，第 6 天起標「連六」。
   - 連七以上：違法，擋下，**不能核准**。
   - **系統不得自動調整班表**；只能附上文字建議。
6. 班別、國定假日、門市、職稱都是設定資料，不寫死在程式裡；只有預設資料由 migration 建立（§5.1）。
7. 出勤記到分鐘，最多兩組上下班；出勤紀錄不能刪除，修改要寫稽核。
8. 註記：居家工作（視同依排定班別出勤、不需打卡）、擺攤（上班日，不檢查遲到與早退）。颱風假用假別「颱」，算上班日、不算曠職。「X」表示兼職當天不要來。
9. 日期顯示 `YYYY/MM/DD`，時間顯示 `HH:mm`，工時顯示到 0.5 小時，例如 7.5。

## 3. 範圍

1. **Migration `0018_hr_phase2a.sql`：**
   - 新增資料表 `hr_stores`、`hr_job_titles`、`hr_shift_types`、`hr_leave_types`、`hr_holidays`、`hr_schedule_days`、`hr_schedule_months`、`hr_roster_approvals`、`hr_attendance_days`；
   - `hr_employees` 新增欄位：`store_id`、`job_title_id`、`roster_sort`、`employment_type`（full 正職／half 半職／casual 兼職）、`skip_roster_checks`（0／1，不須檢核）、`schedule_mode`（shift／hours／none；正職只能 shift，半職可 shift／hours，none 只限兼職，存檔檢查）；
   - 預設資料：門市「志遠高雄門市」（起算週一 `2026-09-28`）、職稱（店長、門市、業務、美編、兼職，依此排序）、班別（早、晚、日、A、B、C，見設計 §5.2）、假別清單（2a 只有代號、名稱、排序、是否啟用、是否為法定假別；法定假別不可刪除；預設：特 特休、事 事假、病 普通傷病假、生 生理假、婚 婚假、喪 喪假、產 產假、檢 產檢假、陪 陪產檢及陪產假、家 家庭照顧假、公 公假、傷 公傷病假、颱 颱風假、國 國定假日休、補 補休、換 國定假日換休、獎 獎勵假）。
2. **共用純函式** `shared/hr-roster.ts`：雙週切分、例假與休息日標示、合法性檢查，算法見設計 §5.4；以及出勤計算 `shared/hr-attendance.ts`，見設計 §5.5。兩者都要附單元測試。
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
  - `kind`：shift／hours／off／leave；
  - `off_mark`：slash／x（kind＝off 時，決定顯示「/」或「X」）；
  - `leave_type_id`（kind＝leave 時必填）；
  - `shift_type_id`（kind＝shift 時必填）；
  - `hours`（以 0.25 小時為單位，kind＝hours 時必填）；
  - `start_time`、`end_time`（kind＝hours 時選填）；
  - `marker`：home／booth，可空；颱風假改用假別「颱」；
  - `rest_label`：regular（例）／rest（休息日），只有 kind＝off 時才有值。這個欄位由系統依設計 §5.4 計算後保存，不接受前端輸入；
  - `note`；
  - `updated_at`、`updated_by`。
- `hr_schedule_months`：`(store_id, month)` 唯一，`month` 存成 `YYYY-MM`；另有 `notes`、`rules`。
- `hr_roster_approvals`：核准紀錄（連六、兼職超過 8 小時），欄位為 `employee_id`、`kind`（consecutive／over_eight）、`start_date`、`end_date`、`approved_by`、`approved_at`。之後存檔時同一區段不再詢問；區段起訖改變才重新核准。
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
  - 以及 `shared/hr-roster.ts` 算出的每人每日標示（例假、休息日、上班、未排）、連六區段與核准狀態、違規清單、每日人力。
- `PUT /api/business/hr/rosters/:storeId/:month`：
  - 傳入變動的日子與每月備註；
  - 回傳重新計算後的結果。
  - 未來日期的違規**一律擋下**，回 `409 HR_ROSTER_VIOLATION` 並附違規清單。範圍包括：連續上班 7 天以上、某週沒有例休日、雙週例休日不足 4 天、工時上限。
  - 連六（剛好 6 天）要核准：先回 `409 HR_ROSTER_CONSECUTIVE`，列出每個區段（員工、起訖日、天數、文字建議）；兼職超過 8 小時也一樣列入（`kind: over_eight`）。前端按「核准」後，帶 `approve: [{employeeId, kind, startDate, endDate}]` 再送。核准會寫進稽核，第 6 天起標成「連六」。
  - **伺服器不得修改送來的排班內容。**
  - 過去日期的違規不擋，例如補登，但仍回傳違規清單。
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
- `classifyRoster(days, previousRegularOff, options)`：
  - 輸入一個人連續日期的排班（可跨多個雙週與月份），以及前一週已保存的例假日期；`options` 包含起算週一、僱用型態、是否不須檢核、排班方式；
  - 回傳每天的標示：`regular_off`（例）、`rest_day`（休息日）、`off`（兼職不上班）、`work`（上班，含請假）或 `unscheduled`（未排）；
  - 同時回傳連續上班區段（含天數與文字建議）與違規清單。
- `rosterViolations(...)`：檢查工時上限。
- 規則見設計 §5.4，不得自行改變。

**`shared/hr-attendance.ts`**
- `evaluateAttendance(schedule, shift, punches)`：回傳 `{ workedMinutes, lateMinutes, earlyMinutes, anomalies }`，規則見設計 §5.5。

**`scripts/hr-roster.test.mjs`** 至少涵蓋：
- 雙週跨月（起算週一 2026-09-28，10 月的 10/1 屬於 9/28 開始的那一組）；
- 所有「/」與「X」都是例休日；「國」「補」「換」與其他假別都是上班日，不中斷連續天數；
- 例假選法依設計 §5.4 第 2 點：
  - 優先選與上一個例假相隔不超過 7 天的最晚例休日，找不到時放寬為該週最晚的例休日；
  - 連續三週以上的排班，每週都要有例假，而且盡量相隔 7 天內；
  - 修改前面的週次後，往後重算到結果穩定為止；過去週次不變；
- 「例上上上休上上｜上上休上上上例」→ 合法（例假相隔 13 天，但最長連續上班 4 天）；
- 連續上班 7 天 → 擋下，不能核准；
- 「例休上上特上上｜上上休上上例上」：第一週週三到第二週週二連續 7 天（特不中斷）→ 擋下，附文字建議「第一週週二的 / 與週五的 特 對調」；排班內容不得被自動修改；
- 連續 5 天不提醒；連續第 6 天 → 需核准；
- 跨雙週、跨月的連續天數要接續計算；
- 某週沒有例休日 → 擋下；
- 雙週只有 3 天例休日 → 擋下；
- 整天請假的格子（特、事、病…）算上班日；
- 兼職：不標例假、不檢查例休；空白格與 X 中斷連續天數；連六核准、連七擋下；某天超過 8 小時 → 需核准；
- 半職排時數：例休與工時規則同正職；
- 正職選「時段或時數」、非兼職選「不排班」→ 存檔擋下；
- 勾選「不須檢核」的人照常出現在排班表，但不做任何例休、連續、工時檢查；
- 颱風假（假別「颱」）算上班日，不算例休日；
- 正職、半職的月份只排前半、後半空白 → 可以存，空白部分不檢查；
- 「不排班」的兼職存檔不檢查；
- 已核准的連六區段，再次存檔不重複詢問；區段變長或移動 → 重新詢問。

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
  - 上方：門市選單、月份切換（上個月／下個月）、「列印」按鈕，以及「人員設定」：列出本門市人員，可直接勾選「不須檢核」，也可以調整班表排序。
  - **月排班表：**
    - 欄：左側固定欄位為職稱、姓名；右邊是日期（含星期），最後是備註；
    - 列：依職稱分組；
    - 雙週分界用雙線；
    - 週末與國定假日整欄淡灰底；國定假日在表頭顯示名稱（hover 或小字）。
  - **格子：**
    - 顯示班別代號；
    - 「/」顯示 /；系統判定的例假改顯示「例」（淡色）；國定假日整欄淡灰底；空白格（未排）維持空白；
    - 整天請假顯示假別代號，例如「特」「事」；
    - 註記顯示小字，例如「居」「擺攤」；
    - 兼職的 X 顯示 X；
    - 排時數的人顯示數字；
    - 「不排班」的人（例如許莉欣）每天顯示出勤紀錄算出的實際工時（唯讀），格子只能填 X。
  - **點格子：** 跳出小選單，內容是：
    - 依此人的排班方式列出班別按鈕；
    - /、假別（常用的特、事、病、補、換放前面，其他收在「更多」）、X（只有兼職）、清除；
    - 時數輸入（排時段的人才有）；
    - 註記；
    - 備註。
  - **鍵盤：** 選取格子後輸入班別或假別代號、或「/」直接套用，方向鍵移動，Delete 清除。
  - 有變動時，上方出現「儲存／取消」（沿用共用編輯頭與 `useUnsavedChangesGuard`）。
  - **違規顯示：** 格子紅框；表格下方列出違規說明，例如「測試員工甲 10/12–10/25 雙週只排 3 天休」。
  - **兼職超過 8 小時：** 列出日期與時數，只有「核准」按鈕，核准一併存在 `hr_roster_approvals`。
  - **連六提醒：** 列出連續 6 天的區段與文字建議，例如「可將 10/2 的 / 與 10/5 的 特 對調」，只有「核准」按鈕。
  - **連七以上：** 當成違規處理，紅框加說明與文字建議，不能存。系統不會自動改班表。
  - **最下方「每日人力」列：** 依班別計數，例如「早2 晚2 日3」。排時數的人另外加總，顯示在該人的備註欄。
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
- 排時數的人，在備註欄印出當月合計時數。
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
- [ ] 未來日期的擋下項目（§2.4、§2.5）不能存；連六按「核准」後才能存，第 6 天標「連六」並寫入稽核；連七以上擋下、無法核准；系統從未自動修改排班；過去日期的違規不擋，但會列出。
- [ ] 出勤輸入、工時、遲到、早退、異常計算正確；§5.3 的出勤單元測試全部通過。
- [ ] 「/」、X、整天假別、居家工作、擺攤的行為符合設計 §5.3～5.5。
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

- **PR：** [#245](https://github.com/simonliu1118-byte/chihyuan-web/pull/245)，分支 `cyweb/hr-phase2a`（基於當時最新 `main` `e8b7061`）。實作未合併、未手動部署，未新增或修改 `.github/workflows/*`；PR 原先為 Draft，待審查者驗證實際畫面。
- **變更檔案：** 31 個，詳見 PR Files changed：
  - Migration `migrations/0018_hr_phase2a.sql`；員工欄位與出勤、排班、設定等九張表。
  - `shared/hr-roster.ts`、`shared/hr-attendance.ts`；`scripts/hr-roster.test.mjs`、`scripts/hr-attendance.test.mjs`。
  - `worker/hr/hr-service.ts`、`hr-settings-service.ts`、`hr-roster-service.ts`、`hr-attendance-service.ts`；`worker/http/hr-routes.ts`、`hr-phase2a-routes.ts`。
  - `src/runtime/modules/HrOperationalPage.tsx`、`HrRosterPanel.tsx`、`HrAttendancePanel.tsx`、`HrPhase2aSettings.tsx`、`HrSettingsButton.tsx`、`hr-phase2a.css`、`change-log-labels.ts`。
  - `worker/backup/schema-columns.ts`、`worker/backup/portable-backup.ts`、`worker/acceptance/d1-local-acceptance.ts`、`hr-phase2a-acceptance.ts`、`portable-recovery-acceptance.ts`、`isolated-recovery-acceptance.ts`、`scripts/validate_schema.py`。
  - `docs/architecture/HR_MODULE_CONTRACT.md`、`API_CONTRACT.md`、`CANONICAL_DATA_MODEL.md`；`TODO.md`、`VERSION`、`package.json`、本工作單。
- **驗證結果（§6 逐項）：**
  1. **權限／稽核：部分驗證。** 新路由沿用 `handleHrRoute` 原有 CYID `SUPER_ADMIN` 與啟用成員閘門，D1 acceptance 含非超管 403 及相關稽核檢查；未獨立跑實際 CYID 帳號 E2E。
  2. **預設資料／班別／週一：通過自動驗收。** D1 acceptance 驗證預設門市、職稱、班別與假別；純函式驗證班別正常工時及起算週一。
  3. **10 月跨月雙週：程式與驗收已涵蓋。** 起算 `2026-09-28`，10 月查詢向外補齊至 `2026-11-08`；實際畫面雙線位置仍需審查者確認。
  4. **例休／雙週／工時／連六連七：部分通過。** 新純函式與 D1 acceptance 包含跨月、連六、連七、工時及空白格，具備獨立單元測試檔；`node --test scripts/*.test.mjs` 並未在所查 CI 流程完整執行，故不能宣稱 §5.3 全套通過。
  5. **409 阻擋／核准／不自動改排班：通過核心 D1 驗收。** `HR_ROSTER_VIOLATION`、`HR_ROSTER_CONSECUTIVE`、核准留存及重複存檔驗收成功；過去日期回報及跨多週標記仍請審查者確認。
  6. **出勤工時／遲到／早退／異常：通過核心 D1 驗收。** 已驗證打卡建立、遲到及 revision 衝突；完整 `scripts/hr-attendance.test.mjs` 未在本次 CI 以指定指令單獨執行。
  7. **／、X、請假、居家、擺攤：純函式與畫面已實作，未做完整瀏覽器 E2E。** 國定假日只顯示；不會自動排假或建立換休。
  8. **列印：有 `@media print` A4 橫式版型，尚無實際列印 PDF 對照。** 截圖依 §7 交審查者。
  9. **手機：設計為左右可捲動表格，尚未取得 390px 實機畫面驗證。**
  10. **稽核中文：新增 `hr_roster.updated`、`hr_attendance.updated` 的中文標籤；仍請審查者檢查事件在實際異動紀錄畫面呈現。**
  11. **讀寫列數估計：** 見下段。
  12. **自動化：最新 commit `229e1450d082` 的 GitHub Actions `Runtime Check` #39402606998 成功：browser TypeScript、Worker TypeScript、source contracts、Local D1 runtime acceptance、Vite build。** `Governance Check` #39402606983 成功。`CY Web Deploy` #39402607007 的 `validate-deployment-contract` 成功，**`deploy-development` skipped**，非實際部署。CI 並非逐字執行工單全部五個指定命令；`npm run typecheck`、`timeout 300 npm run validate:source`、`node --test scripts/*.test.mjs` 的完整指令未獨立執行，不能宣稱全數通過。
  13. **變更範圍：已比對 PR 差異，無 `.github/workflows/*`。** 只改本單人事功能、既有 D1 備份／還原驗收的必要相容路徑與合約、版本、TODO。
  14. **版本／文件：已更新。** `VERSION` 及 `package.json` 均為 `0.9.24`；`TODO.md` 已連至本單；三份合約文件及 `worker/backup/schema-columns.ts` 已同步。
- **讀寫列數估計（§11.3）：**
  - 單門市至多 100 名員工，單月最多 31 日，**最多 3,100 個當月排班格**。讀取依雙週補齊前後區間；2026 年 10 月為 9/28～11/8，42 日，排班最多約 100 × 42 = **4,200 列**（另讀員工 ≤100、班別 ≤100、假別 ≤100、國定假日 ≤100、核准 ≤1,000 及備註 1 列）；資料查詢有索引與 10,000 列排班安全上限。
  - 排班 PUT 一次最多提交 **3,100 個異動格**，只對實際變動格 INSERT／UPSERT／DELETE；若例休標籤被前週改動，額外更新受影響的既存非異動 `rest_label`；核准、備註、整批一筆 Audit 都在 `db.batch`。
  - 單人單月出勤 GET 約 **31 打卡＋31 排班**，另有班別／假別設定讀取；PUT 逐日查當前 revision（最多 31 次），只更新變動的 ≤31 日並同批寫一筆 Audit。門市整月異常按門市與月一次批次讀 3,100 打卡 + 3,100 排班上限、≤100 員工、班別與假別各 ≤100，避免每位員工 N+1。
- **已知限制與審查注意：**
  - 尚未完成實際瀏覽器桌面／手機／列印 PDF 視覺驗收；§7 截圖由審查者擷取。
  - 兩個新 `.test.mjs` 已納入 PR，但完整 `node --test scripts/*.test.mjs` 仍須執行，請審查者驗證具體測試覆蓋（含多週例假重算、核准區段變更）。
  - migration 增加初始設定資料，故一併調整 portable backup 的全新 D1 還原安全檢查及失敗前後驗收：**僅允許未修改的 migration 預設種子作為新目標**；有使用者資料不可覆寫。GitHub D1 驗收已通過。
  - 未作 2b 的請假附檔、假額扣抵、加班與換休帳戶、薪資與計薪功能。
  - 此 PR 尚未合併或部署；審查與後續部署交由 §9 審查者決定。

## 9. 審查紀錄（審查者填）

審查者：Claude（2026-10-20）。結論：**修正後通過**，併入使用者同日要求的人事表單修正與測試用刪除。

**修正（審查者直接處理）**

1. **例假標示跨月與已過去週**：服務原本只讀當月範圍，月初第一週看不到上月例假，且儲存時會改寫過去日期的 `rest_label`。改為往前讀 14 天、往後讀 7 天，並帶入範圍前最後一個已存例假；過去日期保留已存的例假（`fixedRegularOff`），儲存時不改寫過去日期標籤。
2. **純函式測試**：原有 3 個測試資料沒對齊起算週一、且預期「最早」一天（設計是「最晚」）。已修正，並新增「放寬為每週一天」與「過去週保留已存例假」兩個測試；11/11 通過。
3. **工時上限**：請假日原本固定算 480 分鐘計入日／週／雙週工時，正職連請假會誤報超時。請假不是工作時間，改為不計入（例休與連續天數判斷不受影響）。
4. **排班畫面**：載入時就顯示已存班表的違規清單（原本只有儲存失敗才看得到），並標出員工姓名；`window.confirm` 改用共用確認視窗；人員設定視窗改用受控欄位，不再用 `getElementById`；工具列「門市」標籤不換行；列印時不印違規紅框與「連六」標記。
5. **出勤畫面**：「排定」欄顯示實際班別代碼與假別代碼（原本一律「班」／「假」）；切換員工或月份改用共用確認視窗。
6. **Enter 跳欄**：2a 設定視窗與人事所有表單補上 Enter 跳下一欄、日期欄四碼年份；移除 `form-keyboard.test.mjs` 的暫時豁免清單，全系統檢查通過。

**併入的人事表單修正（使用者 2026-10-20 要求）**

- 綁定使用者改為唯讀欄位＋「選擇」視窗，可搜尋，員工編號相同者排最前，可選「不綁定」；清單只列 CYID 現存且啟用的帳號。
- 身分證修改時顯示 `A******789` 隱碼，按「變更」才重新輸入；隱碼規則改為首字＋6 個＊＋末 3 碼。
- 地址順序改為戶籍在前、通訊在後，加「通訊地址同戶籍地址」。
- 除備註與學經歷外全部必填（門市、職稱、生日、性別、地址、手機或市話至少一個、至少一位緊急聯絡人）；舊資料須補齊才能儲存。
- 欄位分類 `HR_VOLATILE_FIELDS`／`HR_FIXED_FIELDS`（`shared/hr.ts`，BD-059 第 8 項）；目前只有超管使用，全部可改。
- **暫時刪除功能**（BD-059 第 7 項例外）：超管輸入員工編號後刪除員工與所有人事子資料（含 2a 班表、核准、出勤），寫 Audit 但不含身分證；**正式上線前移除**（TODO）。驗收新增 `ACCEPT_HR_DELETE_CONFIRMS_NUMBER`、`ACCEPT_HR_DELETE`、`ACCEPT_HR_DELETE_CASCADE`。

**驗證**：`npm run typecheck`、`npm run validate:source`、`node --test scripts/*.test.mjs`（182 通過）、`npm run build`、`npm run validate:d1:local`（含人事 1、2a 驗收）全部通過。截圖：桌面與手機月班表、排班格選單、人員設定、列印、出勤（桌面／手機）、人事編輯（桌面／手機）、綁定使用者選擇、刪除確認。

**留給 2b**：請假時數依實際班別計算（半職／兼職）、請假附檔、特休扣抵與遞延、加班與補休帳戶。

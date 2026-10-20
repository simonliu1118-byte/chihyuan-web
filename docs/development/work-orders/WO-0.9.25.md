# WO-0.9.25 人事第二期 2b：請假頁籤與假單、特休扣抵與遞延、加班標記與補休帳戶、特休書面通知

- 狀態：待執行（2026-10-20 依使用者回饋改寫）
- 分支：`cyweb/hr-phase2b`（建議）　PR：（執行者填）
- 依據：
  - `PROJECT_RULES.md` §9；
  - **BD-059**、**BD-060**（第 17～25 點為 2b 定案）；
  - 設計 `docs/architecture/HR_MODULE_DESIGN.md` **§5.6～5.8、§5.10**（本單以該文件為準）；
  - 2a 的實作與審查紀錄 `WO-0.9.24.md` §9；
  - 共通規則 `REPOSITORY_RULES.md` §11.3（大量資料作業）。
- 視覺規範：`docs/architecture/CY_WEB_VISUAL_GUIDE.md`

## 0. 執行限制（必讀）

- **不得新增或修改 `.github/workflows/*`**，不得新增工作單未列出的檔案類型（示意圖、mock HTML、SVG、另外的測試 runner 等）。截圖由審查者以實際畫面擷取。
- 不合併、不部署。
- 測試與驗收資料一律使用明顯虛構的人名，例如「測試員工甲」。
- 權限同前兩期：後端全部限 `SUPER_ADMIN`，不加入模組授權。
- **所有新表單都要 Enter 跳下一欄、日期欄有 `max`**（`PROJECT_RULES.md` §5；`scripts/form-keyboard.test.mjs` 會檢查，不得加豁免）。
- 確認視窗一律用共用的 `useConfirmation`，不得用 `window.confirm`；不得用 `document.getElementById` 讀表單值。

## 1. 背景

2a 已上線（V0.9.24）：月排班表、出勤輸入、例休與連六／連七檢查。2b 接上請假、特休、加班、補休：

- 新增「請假」頁籤：依年度看每個人的請假總表、假單，從這裡新增假單並直接改班表。
- 排班表維持「預填」：格子填假別不產生假單；從格子補假單；待補與已完成用不同記號。
- 特休依特休年度扣抵、自動遞延、到期結算，並可列印書面通知。
- 在出勤的當月上班日清單逐日標記加班，選加班費或補休。
- 補休帳戶：加班補休、國定假日換休（可預支）、管理員給予；到期與延期。

## 2. 已定案事項（不得更改）

以 BD-060 第 17～25 點與設計 §5.6～5.8、§5.10 為準。重點：

1. **排班表與假單分開。**
   - 排班格填假別代號（2a 已有）只是預填，**不產生假單、不檢查額度**。
   - 假單 `hr_leave_records` 才是正式紀錄，從「請假」頁籤新增，或在排班表點已填假別的格子補填。
   - 排班格的兩種狀態：**待補假單**（填了假別、沒有假單）、**已完成**（有假單）。兩者記號不同；列印時都不印記號。
2. **從「請假」頁籤新增假單會直接改班表：**
   - 整天假：那幾天的格子改成假別代號（包括未來的日子；未排的日子也直接填上）。
   - 日期區間內原本是「/」或「國」的日子跳過，不算請假（產假以日曆天計，例外）。
   - 部分時數的假：格子維持班別，格子顯示小字，例如「特2」。
   - 改班表與新增假單在**同一個 batch**；照常跑 2a 的排班檢查（連七擋下、連六核准）。
3. **時數：**
   - 正職：整天＝480 分鐘；也可以請部分時數。
   - 半職、兼職：一律以時數請假（輸入起訖時間，或當天不是班別時直接輸入時數），**沒有「整天」選項**。
   - 部分時數＝請假起訖與當天班別時間的重疊，扣除休息時間，以 30 分鐘為單位；起訖必須在當天班別內。
   - **不新增「每日正常工時」欄位。**
4. **假單欄位：** 員工編號、姓名（帶入）、日期（整天假可以選區間）、假別、時間。
   - **事假**：事由必填；其他假不用填事由。
   - **病假（病、院）、婚假、喪假、公假**：證明上傳欄位，0～3 張圖，**目前非必填**。
   - 事件類假別（婚、喪、產、檢、陪）：填事件日期；喪假選本次天數（3／6／8）。
5. **額度**在假單存檔時檢查，超過一律擋下，回 409 `HR_LEAVE_QUOTA`，說明是哪一個上限（假別、期間、已用、上限）。1 天＝480 分鐘換算。
6. **改班與銷假：**
   - 待補假單的格子改成班別：一般的排班修改，**不留銷假紀錄**（`hr_roster.updated` 照常記錄）。
   - 已完成假單的假：只能在假單按「銷假」，必填原因，保留原紀錄（`cancelled_at`、`cancelled_by`、`cancel_reason`）；整天假的格子同 batch 清成空白（未排），由使用者重新排班。
   - 排班存檔若改到已完成假單的格子，回 409 `HR_LEAVE_FORM_EXISTS`，提示先到假單銷假。
   - 假單不能刪除；更正＝銷假＋新增。
7. **特休**依特休年度扣抵：先扣遞延進來的，再扣當年度。年度結束未休完的自動遞延到下一年度（最多一年）；遞延的到下一年度結束還沒休完，列為「未休工資」，金額第三期才算。由純函式即時計算，不用排程。
8. **加班不另做頁籤**：在出勤頁的當月上班日清單逐日標記加班時數與結算方式（加班費／補休）。系統顯示建議時數，但只有使用者標記的才生效。第 32 條上限（每月延長工時 46 小時、每日正常加延長 12 小時）**只警示，不擋**。
9. **補休帳戶**以 30 分鐘為單位，依到期日最早的先扣：
   - 「補」餘額不足時擋下；
   - **「換」可以預支**，餘額可以是負的，之後給予換休時自動抵掉；
   - 每筆額度預設在產生月份的**次月底**到期，可以「再延一個月」（留紀錄、寫稽核）；
   - 加班補休到期沒休完，由管理員按「轉加班費」結清；國定假日換休到期只警告。
10. **附檔查看不寫稽核**；上傳寫稽核。
11. 日期顯示 `YYYY/MM/DD`，時間 `HH:mm`，時數顯示到 0.5 小時。

## 3. 範圍

1. **Migration `0019_hr_phase2b.sql`**（§5.1）。
2. **共用純函式**：
   - `shared/hr-leave.ts`：請假時數、額度檢查；
   - `shared/hr-annual-leave.ts` 擴充：特休年度扣抵、遞延、未休結算；
   - `shared/hr-overtime.ts`：加班建議、第 32 條警示、補休帳戶餘額、預支與到期。
   - 都要附單元測試（§5.3）。
3. **Worker**：`worker/hr/` 擴充，API 見 §5.2。
4. **前端**：「請假」頁籤與請假視窗；排班表的兩種假別記號與補假單；出勤頁的加班標記；人員詳細頁的特休年度表、書面通知、補休帳戶；設定加入假別。
5. **附檔**：R2 獨立儲存（§5.5）。
6. 稽核、備份欄位、驗收測試、文件、版本、TODO。
7. **2a 遺留**：測試用刪除（`HrService.remove`）要一併刪除 2b 的新資料表與 R2 附檔。

## 4. 不做

- 任何金額計算（加班費、未休工資、請假扣薪）—第三期。
- 線上請假、簽核、員工自助查詢。
- TimecardOCR 匯入（出勤仍沿用 2a 的手動輸入）。
- 附檔的備份（之後另案；完成報告註明）。
- 自動排程（遞延、到期都在查詢時即時計算或由管理員手動結清）。
- 「每日正常工時」欄位（不做）。

## 5. 實作指引

### 5.1 資料表

- `hr_leave_types` 新增欄位，migration 同時更新預設值（設計 §5.10 第 4 點的表）：
  - `quota_days REAL`（可空＝不限）；
  - `quota_period`：`calendar_year`／`month`／`event`／`two_years`／NULL；
  - `merge_into_type_id`（可空）、`merge_after_days REAL`（併入前可單獨使用的天數）；
  - `counts_calendar_days`（0／1；產假＝1）；
  - `event_quota_options TEXT`（只有 `event` 用，例如喪假 `3,6,8`）；
  - `requires_reason`（0／1；事假＝1）、`accepts_proof`（0／1；病、院、婚、喪、公＝1）；
  - `needs_form`（0／1；「國」＝0，其他＝1。「國」的格子不顯示待補記號）；
  - `comp_kind`：`overtime`／`holiday`／NULL（補＝overtime，換＝holiday）；
  - `pay_ratio REAL`（第三期用，只存不算）、`legal_basis TEXT`。
  - 新增預設假別「院 住院病假」。
- `hr_leave_records`（假單）：
  - `employee_id`、`leave_type_id`、`work_date`、`start_time`、`end_time`（整天為 NULL）、`minutes`、`whole_day`（0／1）、`reason`；
  - `event_date`、`event_quota_days`（事件類必填）；
  - `created_at`、`created_by`、`cancelled_at`、`cancelled_by`、`cancel_reason`；
  - 一張多天的整天假存成每天一列，共用 `batch_id`（同一次申請），畫面上合併顯示；
  - 索引 `(employee_id, work_date)`、`(employee_id, leave_type_id, work_date)`；同一員工同一天「未銷假的整天假」只能一筆（部分唯一索引 `WHERE cancelled_at IS NULL AND whole_day=1`）。
- `hr_leave_attachments`：`batch_id`（掛在整次申請上）、`object_key`、`content_type`（只收 `image/jpeg`）、`bytes`、`width`、`height`、`grayscale`、`created_at`、`created_by`。每次申請最多 3 張。
- `hr_annual_leave_years`：`employee_id`、`period_start`、`period_end`、`entitled_days`、`notified_on`、`notified_by`；`(employee_id, period_start)` 唯一。查詢時若該年度還沒有列就建立（`INSERT OR IGNORE`）。
- `hr_overtime_days`：`(employee_id, work_date)` 唯一；`minutes`（30 的倍數）、`settlement`（`pay`／`comp`）、`comp_expires_on`、`comp_extended_count`、`note`、`revision`、`updated_at`、`updated_by`。不可刪除；改成 0 分鐘代表取消。補休已被使用的部分不能減掉（存檔時檢查）。
- `hr_comp_time_grants`：`employee_id`、`kind`（`holiday`／`grant`）、`minutes`、`holiday_date`、`holiday_name`（換休必填）、`expires_on`、`extended_count`、`note`、`created_at`、`created_by`。不可刪除。
- `hr_comp_time_settlements`：`employee_id`、`overtime_day_id`、`minutes`、`created_at`、`created_by`（加班補休到期轉加班費）。
- 補休使用不另外存：就是「補」「換」的假單。餘額由純函式從 `hr_overtime_days`（comp）、`hr_comp_time_grants`、`hr_comp_time_settlements` 與未銷假的補／換假單計算。
- 排班格的兩種狀態不存欄位：GET 排班時以該員當天是否有未銷假的整天假單判斷。
- 寫入一律 `db.batch`，同一 batch 寫稽核。

### 5.2 API（全部先檢查 `SUPER_ADMIN`）

- `GET/POST/PATCH /api/business/hr/settings/leave-types`：
  - 法定假別（`is_statutory=1`）的額度、併入規則、計算方式不可改，只能改排序與啟用；
  - 公司假別可新增，所有欄位都能改；不提供刪除，只能停用。
- `GET /api/business/hr/leave/summary?year=&storeId=`：請假頁籤的總表。每人一列：各假別已用時數／上限、待補假單數、特休剩餘、補休餘額（含預支）。
- `GET /api/business/hr/employees/:id/leave?year=`：該員該年度的假單（含銷假）、待補假單的日期清單、各假別已用與上限、特休年度表、補休帳戶明細。
- `POST /api/business/hr/leave-requests`：新增假單（請假視窗送出）。
  - 欄位：`employeeId`、`leaveTypeId`、`dates`（整天假的起訖）或 `date`＋`startTime`／`endTime`（或 `minutes`，只限當天不是班別的半職、兼職）、`reason`、`eventDate`、`eventQuotaDays`。
  - 依 §2.2 計算要改的排班格，連同假單、排班檢查、額度檢查、補休餘額一起處理，任何一項不過整批不寫：
    - 額度 409 `HR_LEAVE_QUOTA`；
    - 「補」餘額不足 409 `HR_COMP_INSUFFICIENT`（「換」不檢查）；
    - 排班違規沿用 2a 的 409 `HR_ROSTER_VIOLATION`／`HR_ROSTER_CONSECUTIVE`（核准方式同 2a）。
  - 回傳 `batchId`，前端再上傳附檔。
  - 從排班表補假單也用這個 API；那天已經是同假別時不改格子。
- `POST /api/business/hr/leave-requests/:batchId/cancel`：銷假（必填原因；可以只銷其中幾天：`dates[]`）。整天假的格子同 batch 清成空白。
- `POST /api/business/hr/leave-requests/:batchId/attachments`：上傳一張 JPEG（前端已縮圖；伺服器再檢查 ≤ 1.5 MB、長邊 ≤ 2000px、檔頭是 JPEG；只限 `accepts_proof=1` 的假別）。寫稽核。
- `GET /api/business/hr/leave-attachments/:id`：串流圖片，`cache-control: private, no-store`。**不寫稽核**。
- `PUT /api/business/hr/rosters/:storeId/:month`（2a 既有）擴充：改到已完成假單的格子回 409 `HR_LEAVE_FORM_EXISTS`；其他照 2a。
- `GET /api/business/hr/rosters/:storeId/:month`（2a 既有）擴充：每格加 `leaveForm`：`none`（待補）／`done`（已完成），並回傳部分時數假單（顯示「特2」用）。
- `GET/PUT /api/business/hr/employees/:id/attendance?month=`（2a 既有）擴充：
  - 每天加上 `overtimeSuggestion`（建議分鐘數與原因）與已標記的 `overtime`；
  - PUT 可同時送 `overtime[]`（日期、分鐘、結算方式、revision），與打卡同一個 batch；
  - 回傳當月延長工時合計與第 32 條警示。
- `PATCH /api/business/hr/annual-leave-years/:id/notice`：記錄書面通知日期。列印頁由前端產生。
- `POST /api/business/hr/employees/:id/comp-time`：給予補休或國定假日換休（換休必填國定假日日期與名稱；時數由管理員輸入，正職預設 8 小時）。
- `POST /api/business/hr/comp-time/:kind/:id/extend`：再延一個月（`kind` 為 `overtime` 或 `grant`）。
- `POST /api/business/hr/comp-time/overtime/:id/settle`：到期的加班補休轉加班費（已到期、仍有餘額才可以）。
- **稽核事件**（都要補中文標籤，`scripts/change-log-labels.test.mjs` 會檢查）：`hr_leave.created`、`hr_leave.cancelled`、`hr_leave_attachment.uploaded`、`hr_annual_leave.notified`、`hr_overtime.updated`、`hr_comp_time.granted`、`hr_comp_time.extended`、`hr_comp_time.settled`、`hr_setting.updated`（假別）。假單帶出的排班變動寫在 `hr_leave.created`／`hr_leave.cancelled` 的 `after.roster`，不另寫 `hr_roster.updated`。

### 5.3 純函式與測試

**`shared/hr-leave.ts`**
- `leaveMinutes(employmentType, cell, shift, request)`：正職整天 480；部分時數＝重疊減休息、30 分鐘為單位；起訖不在班別內丟錯；半職、兼職送整天丟錯。
- `leaveDates(range, cells, type)`：回傳要請假的日期，跳過「/」「國」；`counts_calendar_days` 不跳過。
- `checkLeaveQuota(type, types, records, candidate)`：回傳違反的上限清單。處理 `calendar_year`、`month`、`event`、`two_years`（以候選日期往前兩年）、`merge_into`（超過 `merge_after_days` 的部分同時算進目標假別）。已銷假的不算。
- 測試：
  - 事假 14 天，第 15 天擋下；家庭照顧假同時算進事假，事假已 10 天時家庭照顧假第 5 天擋下；
  - 生理假每月 1 天，同月第 2 天擋下；全年前 3 天不算病假，第 4 天起算進病假；
  - 病假 30 天後擋下；住院病假兩年 365 天含病假；
  - 喪假同一事件 8 天上限，不同事件分開算；
  - 早班 09:00–17:30 請 12:00–15:00 ＝ 2.5 小時（扣 13:00–13:30）；請 08:00–10:00 擋下；
  - 兼職 A 班請 2 小時；兼職送整天擋下；
  - 10/5～10/11 請事假，中間的「/」與「國」跳過；產假不跳過。

**`shared/hr-annual-leave.ts`**
- `annualLeaveLedger(periods, records, asOf)`：每個特休年度的應給、遞延進來、已休（先扣遞延）、剩餘、遞延出去、到期未休（未休工資）。以 480 分鐘＝1 天換算。
- 測試：當年度 7 天休 3 天 → 遞延 4 天；下一年度先扣遞延；遞延的到期未休列為未休工資；年資不計期間順延後的年度正確；銷假的不計入。

**`shared/hr-overtime.ts`**
- `overtimeSuggestion(day, shift, holidays, rosterLabel)`：
  - 正職：下班超過班別下班時間的分鐘數，無條件捨去到 30 分鐘；
  - 半職、兼職：當天實際工時超過 8 小時的部分；
  - 例休日（「/」或兼職 X）、國定假日有打卡：整段打卡工時；
  - 居家工作、擺攤不建議。
- `overtimeWarnings(days)`：每月延長工時超過 46 小時、每日實際工時（正常＋延長）超過 12 小時。
- `compBalances(credits, uses, settlements, asOf)`：依到期日最早先扣；「換」可以為負（預支），之後的換休額度先抵預支；每筆額度的餘額、是否快到期（7 天內）、是否已到期。
- 測試：上述每條；預支後給予換休會抵掉；延期後不再算到期；結清後餘額歸零；加班標記改小但補休已用掉時擋下。

### 5.4 前端

- **人事頁頁籤**：「人員｜排班｜出勤｜請假」。
- **請假頁籤：**
  - 上方：年度切換（預設今年）、門市篩選、「＋請假」按鈕；
  - 總表：每人一列，欄位為各常用假別（特、事、病、補、換，其他假別合併成「其他」，可展開）的已用時數／上限、待補假單數（有的話醒目顯示）、特休剩餘、補休餘額（負數標「預支」）；
  - 點一列 → 用 `cy-md` 主從版面，右側顯示該年度的假單清單（日期或區間、假別、時數、事由、附檔數、銷假狀態）、待補假單的日期（點日期直接開請假視窗補填）、特休年度表、補休帳戶。
- **請假視窗**（專屬元件，請假頁籤、排班表、人員頁共用）：
  - 員工（從排班表開啟時帶入且不可改）、假別、日期或區間、整天／時間（半職、兼職沒有整天）、事由（只有事假顯示且必填）、事件日期與本次天數（事件類才顯示）、證明上傳（只有病、院、婚、喪、公顯示，0～3 張）；
  - 送出前顯示將會改動的排班格與扣抵後的額度；
  - 已完成的假單打開時顯示內容與「銷假」按鈕。
- **排班表：**
  - 待補假單：假別代號＋橘色右上角小三角（或虛線框），`title` 寫「尚未補假單」；
  - 已完成：假別代號正常顯示；
  - 部分時數假：格子右下角小字（例如「特2」）；
  - 點已填假別的格子，選單多一個「補假單」或「查看假單」；
  - 改到已完成假單的格子時提示先銷假；
  - 列印時不印記號（小字「特2」要印）。
- **出勤頁：**
  - 每天一列加「加班」欄（時數下拉，0.5 小時為單位；建議值以淡色顯示，點一下套用）與「結算」欄（加班費／補休）；
  - 下方合計加上當月延長工時與第 32 條警示（黃色）。
- **人員詳細頁**：特休卡改為特休年度表（應給、遞延進來、已休、剩餘、到期未休），每年度「列印通知」與「已通知」日期；新增補休帳戶卡（餘額、每筆來源與到期、快到期黃色、已到期紅色、「再延一個月」「轉加班費」「＋給予補休／換休」）。
- **附檔**：選圖後在瀏覽器用 canvas 縮到長邊 1600px、JPEG 品質 0.8，可勾「黑白」；預覽後上傳。查看用 `Dialog`。
- **設定**：加入「假別」，法定假別的額度欄位唯讀，只能停用與排序。
- **列印書面通知**：A4 直式一頁：員工姓名、特休年度起訖、應給天數、遞延天數、合計、公司名稱、通知日期、簽收欄。用 `@media print`，同 2a 列印方式。

### 5.5 附檔儲存（R2）

- 使用者已建立 R2 bucket。Worker 綁定名稱 `HR_FILES`，**選用**：沒有綁定時，上傳與查看 API 回 503 `HR_FILES_UNAVAILABLE`（「附檔儲存尚未設定」），其他功能正常。
- 物件鍵 `hr-leave/{batchId}/{uuid}.jpg`。
- `scripts/render-deploy-config.mjs`：環境變數 `CF_HR_FILES_R2_BUCKET` 有值時加入 `{ binding: "HR_FILES", bucket_name }`；`scripts/validate-deploy-config.mjs` 補對應檢查。**不要改 workflow**；workflow 的變數傳遞由審查者處理。
- 驗收：`wrangler.d1-acceptance.jsonc` 加一個 ephemeral 的 `HR_FILES` bucket，驗收實際上傳、讀取一張小 JPEG。
- 測試用刪除（`HrService.remove`）：先列出該員所有附檔鍵，資料庫刪除成功後再刪 R2 物件。

### 5.6 大量資料（§11.3）

- 請假總表：一次讀該年度（或門市）所有假單、補休相關資料；不得逐人查詢。
- 額度檢查：只讀該員在檢查期間內（最長兩年）的假單，用 `(employee_id, leave_type_id, work_date)` 索引。
- 完成報告寫出讀寫列數估計。

### 5.7 文件、版本、TODO

- `VERSION`／`package.json` → `0.9.25`。
- `docs/architecture/HR_MODULE_CONTRACT.md` 補 2b 的 API 與資料表；`API_CONTRACT.md`、`CANONICAL_DATA_MODEL.md` 同步。
- `worker/backup/schema-columns.ts` 依 migration 更新；`scripts/validate_schema.py` 若有檢查清單一併更新。
- `TODO.md` 的 0.9.25 段落打勾。

## 6. 驗收清單

- [ ] 非超管呼叫任何新 API 得 403；人事稽核只有超管看得到。
- [ ] 排班格填假別不產生假單、不檢查額度，顯示「待補」記號；補完假單後記號變成「已完成」。
- [ ] 待補的格子改成班別，不留銷假紀錄，只有排班稽核。
- [ ] 已完成的假不能從排班表改（409 `HR_LEAVE_FORM_EXISTS`）；銷假留紀錄並清空格子。
- [ ] 從請假頁籤請整天假會改班表（含未來日期），跳過「/」「國」；部分時數假格子維持班別並顯示小字。
- [ ] 半職、兼職沒有整天選項；部分時數計算正確（含扣休息）。
- [ ] 事假沒有事由擋下；其他假不需要事由；證明只在病、院、婚、喪、公出現且非必填。
- [ ] §5.3 列出的額度情境都正確擋下，訊息說得出是哪個上限；整批不寫入。
- [ ] 特休先扣遞延、年度結束自動遞延、遞延到期列為未休；書面通知可列印並記錄日期。
- [ ] 出勤頁可以逐日標記加班與結算方式；建議值正確；第 32 條警示顯示但不擋。
- [ ] 「補」餘額不足擋下；「換」可以預支，給予換休後抵掉；再延一個月、轉加班費正常並寫稽核。
- [ ] 附檔：縮圖、黑白、上傳（寫稽核）、查看（不寫稽核）；沒有 `HR_FILES` 時回 503 而其他功能正常。
- [ ] 請假總表正確，可依年度切換。
- [ ] 測試用刪除會一併刪掉 2b 資料與附檔。
- [ ] 所有表單 Enter 跳下一欄；沒有 `window.confirm`。
- [ ] 手機寬度可以操作請假頁籤、請假視窗、加班標記與補休。
- [ ] 所有稽核事件在異動紀錄中為中文句子。
- [ ] 完成報告寫出讀寫列數估計（§11.3）。
- [ ] `npm run typecheck`、`timeout 300 npm run validate:source`、`npm run build`、`npm run validate:d1:local`、`node --test scripts/*.test.mjs` **逐一實際執行**並貼結果；無法執行的寫明原因，不得宣稱通過。
- [ ] 沒有新增或修改 `.github/workflows/*`，沒有範圍外的檔案。
- [ ] VERSION／package.json 為 0.9.25；TODO、合約文件已更新。

## 7. 截圖要求

由審查者以實際畫面擷取：請假頁籤總表與明細（桌面、手機）、請假視窗（正職整天、兼職時數、事假事由、證明上傳）、排班表的待補／已完成記號與「特2」、銷假、出勤頁加班標記與警示、特休年度表與書面通知列印、補休帳戶（含預支）、假別設定。

## 8. 完成報告（執行者填）

### 8.1 提交與結論（2026-10-21）

- **PR：** [#249](https://github.com/simonliu1118-byte/chihyuan-web/pull/249)，Draft；分支 `cyweb/hr-phase2b`，不合併、不部署。
- **執行狀態：原工單功能已在分支提交，但「正式完成／通過驗收」**尚不能宣告。原因是五組指定命令無法在具備完整 repo 的環境執行，最新提交尚無 CI；D1／R2 整合及手機／列印畫面均未取得可核對結果。
- **範圍：** Migration `0019_hr_phase2b.sql`；`shared/hr-leave.ts`、`shared/hr-annual-leave.ts`、`shared/hr-overtime.ts`；Worker 正式假單／銷假／配額／排班同批驗證與寫入、出勤加班、補休、R2 證明；人事請假、排班、出勤、設定、特休通知 UI；備份 schema、D1 acceptance、中文異動標籤、合約、VERSION、TODO。
- **本次接續修正：** 半職／兼職無班別日期可明確切換手動分鐘，避免前端仍送起訖時間；排班預填假別補假單時帶入原假別；停用假別不可再申請；跨特休週年期間逐期驗證額度；未掛載可用檔案清理超過 1,000 筆時拒絕測試用刪除而非靜默漏刪；年度總表未來年度用所選年度截止日計算；總表呈現法定上限及期間；D1 acceptance 增補兼職 120 分鐘請假與刪除後 R2／metadata 清理驗證。
- **與最新 main 的規格差異：** BD-060 第 26～29 點明訂「工單交付後由審查者套用」。#26 排班已完成假單直接查看／銷假已在本分支；#27 取消「換」為單一補休、#28 半職／兼職特休比例、#29 綁定特定國定假日的預支互不抵銷，仍採原工單實作，**不得依此舊規格核准正式上線**。#28 換算公式尚在 `HR_LEGAL_WATCH.md` 列為待確認。依 PROJECT_RULES §9，不由執行者擅自改寫已交付工單；須於審查階段處理。
- 本 PR 沒有修改 `.github/workflows/*`；仍保留正式上線前要由審查者確認的 R2 variable 傳遞，不在此改 workflow。

### 8.2 §6 驗收清單逐項結果

1. **SUPER_ADMIN／稽核：程式碼已對照，未執行 E2E。** 新 API 經 `handleHrRoute` 身分與 SUPER_ADMIN 閘門；D1 acceptance 有非超管 403 情境。人事異動紀錄實際畫面待驗。
2. **預填假別／兩種記號：已實作，待 UI 驗證。** 未建假單時為待補，正式假單存在時為已完成，列印版排除記號。
3. **待補格改班：已實作，未跑 D1 驗證。** 走原排班寫入與稽核，不寫銷假。
4. **已完成假單保護與銷假：已實作，未跑 D1 驗證。** 排班擋 `HR_LEAVE_FORM_EXISTS`；銷假保留原記錄並清格。
5. **整天／部分時數與排班：已實作，未跑 E2E。** 整天與預設日、區間、跳過「/」「國」、同批排班及稽核；部分時數不覆蓋班表。
6. **半職／兼職分鐘及扣休息：已實作，局部煙霧測試通過。** 沒有整天選項；手動時數限定無班別情境，工時計算與 30 分鐘單位以來源純函式隔離測試通過。
7. **事假事由／證明：已實作，未跑 E2E。** 事假必填；病、院、婚、喪、公才有可選 0～3 張圖的上傳。
8. **假額全部情境／409 原子性：已有純函式及驗收測試原始碼，未跑完整套件。** 局部 14 天檢核通過；其它 §5.3 情境與 DB rollback 必須以完整 suite 覆核。
9. **特休年度與書面通知：已實作，未列印驗證。** 加上跨週年期間分別檢核；紙本通知需實際列印截圖驗收。
10. **加班標記／第 32 條警示：已實作，局部煙霧測試通過。** 實際出勤整合與異動稽核未跑 D1 驗收。
11. **補／換與到期：依原工作單已實作，局部煙霧測試通過。** 但已被 BD-060 #27～29 修訂，審查者須套用新決議後才可驗收。
12. **R2 附檔：已實作，D1＋R2 未執行。** 選用 HR_FILES，沒設定回 503；JPEG 長邊與大小限制，上傳寫稽核、查看不寫；驗收程式新增刪除後 bucket/metadata 檢查。
13. **年度請假總表：已實作，未跑資料情境驗收。** 有年度及門市篩選；跨年歷史資料使用批次查詢，修正未來年份截止日。
14. **測試用員工刪除：已實作，未跑 D1＋R2。** 同批移除資料、資料成功後清 R2；超過附件上限拒絕以避免遺漏。
15. **表單 Enter、日期 max、共用確認視窗：檢查新增元件原始碼符合，完整鍵盤檢查未執行。**
16. **手機、A4 列印：尚未進行實際畫面與 PDF 驗收，依 §7 留給審查者截圖。**
17. **稽核中文標籤：已提交，未跑完整標籤測試。**
18. **讀寫列數與費用：見 §8.4。**
19. **五組指定命令：未通過；真實執行結果見 §8.3。**
20. **範圍／版本文件：** 變更檔案已比對，無 workflow；`VERSION` 及 `package.json` 均 `0.9.25`，三份合約與 TODO 已提交。仍請審查者對照最新 main 差異。

### 8.3 測試指令與證據（禁止誤報）

執行環境只具備 GitHub connector 操作原始碼；`/mnt/data/cyweb-wo-0925-validation` 沒有完整 repo，且無法 DNS 連到 `github.com` 進行 git clone。**以下是該容器的實際輸出，不是針對完整 CYWEB checkout 成功的測試：**

| 指令 | exit | 實際結果 |
|---|---:|---|
| `npm run typecheck` | 254 | ENOENT：找不到此目錄 `package.json` |
| `timeout 300 npm run validate:source` | 254 | ENOENT：找不到 `package.json` |
| `npm run build` | 254 | ENOENT：找不到 `package.json` |
| `npm run validate:d1:local` | 254 | ENOENT：找不到 `package.json` |
| `node --test scripts/*.test.mjs` | 0 | `tests 0 / pass 0 / fail 0`，並非通過測試 |

另由 GitHub connector 擷取最新 `shared/hr-leave.ts`、`shared/hr-overtime.ts`，剔除純型別宣告後在 JS 隔離環境進行 **12 項純函式煙霧檢查，12/12 成功**（480 分鐘整天假、兼職手動 120 分鐘、休息時間扣除、「/」與「國」跳過、事假額度、補休期限／延期、加班建議／警示、預支、未來來源不可提前入帳）。這不是原始 `node --test`，也不代表 Worker TypeScript／D1 驗收成功。

GitHub Actions：最後能查到的 `Runtime Check` 是舊 SHA `51fa258` 的失敗執行 [#39448800104](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39448800104)；同 SHA 的 Governance 與部署合約驗證有成功執行，**不能拿來證明最新 head 合格**。最新提交目前沒有新的 Actions runs。

### 8.4 §11.3 讀寫列數估算與實際用量

- **年度請假總表**：一次最多 100 名非離職員工；至多約 10 條查詢。單次回傳上限約 55,201 列（員工 101、年度假單 10,000、待補 5,000、補休給予 2,000、加班 2,000、結清 2,000、特休歷史 20,000、年資不計 4,000、歷史補休使用 10,000、假別 100；有些查詢可提前少於上限）。這是**應用回傳筆數上限**，非 Cloudflare 計費的實際掃描列數；不逐人 N+1。總表無寫入。
- **單次假單**：申請期間不超過 120 有效天，日別最多 120 列假單、120 格排班異動，另有審批、例休重標與稽核；同 `db.batch`。讀取限制為員工兩年前起的假單（目前每次最多 1,500）、申請日期排班最多 370、既存正式假最多 400，及跨月份的排班檢核，每個月各有限額。實際掃描可能高於回傳列數。
- **個人詳情**：相關假單 1,500、待補格 400、附檔 metadata 600、補休來源及使用各最多約 500～1,500，另有年資、特休年度讀取；特休年度尚未初始化時可能寫入週年列。
- **附件與清理**：單假單 0～3 個 JPEG，每個不超過 1.5 MiB；單員工刪除讀取最多 1,001 個檔案鍵，超過 1,000 即不刪；未超過則先 D1 刪除後依鍵刪 R2。
- **實際 Cloudflare D1／R2 用量**：本輪未觸碰正式 D1 或 R2，新增的**正式環境操作**為 0；本地整合測試未完成，故沒有可信的實際 D1 讀寫列數，不能把上列程式 LIMIT 視為計費實測。部署前依實際使用量、索引查詢計畫、R2 刪除與 100 人／多年度壓測再核對費用及安全界限。

### 8.5 待審查與不得放行項目

- **必做：** 使用具備完整 repo 與 Node／Wrangler 的工作機，逐條重跑 §6 五組指令，保存輸出；修正任何失敗，完整 D1／R2、本單所有配額案例、權限及資料原子性驗收均通過後，才可標示本工單完成。
- **必做：** 依 §7 審查者拍攝桌面、手機與列印實際截圖；審查 2a 測試遺留問題、R2 deploy variable 傳遞與復原路徑。
- **必做：** 審查者依 BD-060 #27～29 以新規格取代本單原「補／換」模型、釐清部分工時特休計算，#29 國定假日預支獨立顯示與沖銷的資料模型確認後才可合併。
- **發布：** 尚未合併，尚未部署，也未建立正式發行；PR 目前仍為 Draft。這是誠實的**未驗收完成報告**，不是放行聲明。

### 8.6 2026-10-21 GitHub 實作續作與阻擋排除

- **實際 CI 失敗診斷已取回：** 下載 PR #249 舊提交 `51fa258` 的 GitHub Actions artifact：`worker-tsc-diagnostics`（artifact #12276559199），`browser-tsc-diagnostics`（artifact #12276833514）。該次 Worker TypeScript 在 `hr-leave-service.ts` 日期 `unknown` 參數報三處錯誤；前端在 `HrAttendancePanel.tsx` 加班欄位重複宣告四處、`HrRosterPanel.tsx` 假單視窗 state 名稱缺失兩處。**這是舊 SHA 的診斷，不是最新提交驗證結果。** 後續程式碼已有針對型別及欄位的修正，但須重新執行 CI 驗證。
- **補休來源反轉與併發安全：** `hr-attendance-service.ts` 改為依個別加班補休額度計算已使用／結清，禁止已使用額度被改回加班費或減至不足；重複加班日期拒絕、更新以 revision 保護。延長補休期限後修改備註不再把到期日重設；新增 D1 acceptance：`COMP_USED_CANNOT_SWITCH_TO_PAY`、`COMP_REVERSAL_NO_MUTATION`、`EXTENDED_EXPIRY_PRESERVED_ON_EDIT`。
- **正式請假防重複：** `hr-leave-service.ts` 在單日部分時數與已完成整天假之間檢查衝突；已有部分假單的時段重疊即回 `HR_LEAVE_FORM_EXISTS`。新增 D1 acceptance：`OVERLAPPING_PARTIAL_BLOCKED`、`WHOLE_DAY_CONFLICT_BLOCKED`。
- **資料截斷安全：** `hr-leave-service.ts` 的個人假單歷史、補休歷史與年度總表，`hr-comp-service.ts` 的來源、結清及請假使用資料改採 `LIMIT+1` 並 fail closed，避免使用截斷資料少算額度。程式碼已提交，尚未取得完整 DB 驗收通過證據。
- **合併衝突已解除：** 將 `main` 最新 BD-060、`HR_LEGAL_WATCH` 文件同步回分支並建立 **main → feature branch** 整合提交 `fbeb21ae`；GitHub 確認 PR #249 由 `dirty` 變成 `mergeable_state: clean`，相較 main `behind_by: 0`。這不是把 PR 合併到 main。
- **治理及驗證限制：** 未變動任何 workflow、未部署、未連線 Cloudflare 正式 D1／R2；正式環境讀寫／R2 寫入量都是 0。GitHub 仍無新 HEAD 的 Actions runs，且當前獨立容器不能透過 DNS clone GitHub 原始碼，因此 §6 五條指定指令目前尚無對最新 HEAD 有效的完整執行結果。**不得據此宣告本工單驗收合格**；須由有完整 checkout 的執行環境實際跑通並回填輸出。
- BD-060 #27～29 仍按已交付工作單規則由審查者套用；新規格未整合前不得正式發布。

## 9. 審查紀錄（審查者填）

# WO-0.9.25 人事第二期 2b：請假與附檔、特休扣抵與遞延、加班確認與補休帳戶、特休書面通知

- 狀態：待執行
- 分支：`cyweb/hr-phase2b`（建議）　PR：（執行者填）
- 依據：
  - `PROJECT_RULES.md` §9；
  - **BD-059**、**BD-060**；
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
- 確認視窗一律用共用的 `useConfirmation`，不得用 `window.confirm`；不得用 `document.getElementById` 讀表單值（2a 審查時已全部改掉）。

## 1. 背景

2a 已上線（V0.9.24）：月排班表、出勤輸入、例休與連六／連七檢查。2b 把「請假、特休、加班、補休」接上：

- 排班格填整天假別時，系統自動產生請假紀錄、檢查額度並扣抵；
- 半天（以半小時為單位）的請假另外登錄；
- 特休依特休年度扣抵、自動遞延、到期結算，並可列印書面通知；
- 依出勤列出可能的加班，管理員確認後選擇加班費或補休；
- 補休帳戶（加班轉補休、國定假日換休、管理員給予），排班填「補」「換」時扣帳戶，有到期與延期。

## 2. 已定案事項（不得更改）

以 BD-060 與設計文件 §5.6～5.8、§5.10 為準。重點：

1. **請假紀錄只有一個來源** `hr_leave_records`。
   - 整天請假：在排班表的格子填假別代號（2a 已有）。排班存檔時，伺服器在**同一個 batch** 自動新增、更正或銷假對應的請假紀錄（`source='roster'`）。
   - 半天請假：在請假視窗登錄（`source='manual'`），當天格子仍是班別；排班表格子右下角顯示小字，例如「特2」。
   - 「國」不產生請假紀錄（不是請假）。其他假別都產生，包括「颱」「補」「換」。
2. **整天請假的時數**＝員工的「每日正常工時」`daily_normal_minutes`（新欄位）。
   - 正職固定 480 分鐘；
   - 半職、兼職由管理員在人員資料設定（以 30 分鐘為單位）。沒設定時，存整天假會被擋下並提示先設定。
3. **半天請假的時數**＝請假起訖與當天班別時間的重疊，扣除休息時間；以 30 分鐘為單位。起訖必須落在當天班別內；當天不是班別或時數格就不能請半天假。
4. **請假天數只算上班日**：「/」與「國」不會有請假紀錄，所以自然不計入。例外是設定「以日曆天計」的假別（產假），見設計 §5.6。
5. **超過額度一律擋下**，回 409 `HR_LEAVE_QUOTA`，說明是哪一個上限（假別、期間、已用、上限）。不可核准。
6. **只能新增或銷假，不能刪除**；銷假保留原紀錄（`cancelled_at`、`cancelled_by`、`cancel_reason`）。更正＝銷假＋新增。
7. **特休**依特休年度扣抵：先扣遞延進來的，再扣當年度。年度結束未休完的自動遞延到下一年度（最多一年）；遞延的到下一年度結束還沒休完，列為「未休工資」，金額第三期才算。這些都由純函式即時計算，不用排程。
8. **補休帳戶**以 30 分鐘為單位；每筆額度預設在產生月份的**次月底**到期，可以按「再延一個月」（留紀錄、寫稽核）。到期未休的加班補休，由管理員按「轉加班費」結清（產生扣除紀錄，第三期算金額）；國定假日換休到期只警告，不自動轉換。
9. **加班清單是建議**，管理員逐筆確認時數才生效；系統不自動產生加班紀錄。第 32 條上限（每月延長工時 46 小時、每日正常加延長 12 小時）**只警示，不擋**。
10. 日期顯示 `YYYY/MM/DD`，時間 `HH:mm`，時數顯示到 0.5 小時。

## 3. 範圍

1. **Migration `0019_hr_phase2b.sql`**（§5.1）。
2. **共用純函式**：
   - `shared/hr-leave.ts`：請假時數、額度檢查；
   - `shared/hr-annual-leave.ts` 擴充：特休年度扣抵、遞延、未休結算；
   - `shared/hr-overtime.ts`：加班候選、第 32 條上限警示、補休帳戶餘額與到期。
   - 都要附單元測試（§5.3）。
3. **Worker**：`worker/hr/` 擴充，API 見 §5.2；排班存檔接上請假紀錄。
4. **前端**：人員詳細頁新增「假勤」區塊、請假視窗、特休年度表與書面通知列印、補休帳戶；人事頁新增「加班」頁籤；設定加入假別設定；排班格顯示半天假與補休不足提示。
5. **附檔**：R2 獨立儲存（§5.5）。
6. 稽核、備份欄位、驗收測試、文件、版本、TODO。
7. **2a 遺留**：測試用刪除（`HrService.remove`）要一併刪除 2b 的新資料表與 R2 附檔。

## 4. 不做

- 任何金額計算（加班費、未休工資、請假扣薪）—第三期。
- 線上請假、簽核、員工自助查詢。
- TimecardOCR 匯入。
- 附檔的備份（之後另案；完成報告註明）。
- 自動排程（到期轉換、遞延都由查詢時即時計算或管理員手動結清）。

## 5. 實作指引

### 5.1 資料表

- `hr_employees` 新增 `daily_normal_minutes INTEGER`（可空；30 的倍數、介於 30～600）。正職存檔時一律寫 480。
- `hr_leave_types` 新增欄位（migration 同時更新預設值，見設計 §5.6 的表）：
  - `quota_minutes`（可空＝不限）、`quota_unit`：`day`／`minute`（顯示用；額度以「天」設定時乘上員工每日正常工時換算）；`quota_days REAL`（可空）；
  - `quota_period`：`calendar_year`／`month`／`event`／`two_years`／NULL；
  - `merge_into_type_id`（可空）、`merge_after_days REAL`（併入前可以單獨使用的天數）；
  - `counts_calendar_days`（0／1）；
  - `event_quota_options TEXT`（只有 `event` 用，例如喪假 `3,6,8`；空白＝固定 `quota_days`）；
  - `pay_ratio REAL`（第三期用，只存不算）、`legal_basis TEXT`；
  - `creates_record`（0／1；「國」為 0）；`comp_kind`：`overtime`／`holiday`／NULL（「補」＝overtime，「換」＝holiday）。
  - 新增預設假別「院 住院病假」（`two_years` 365 天），「病」設 `merge_into`＝院、`merge_after_days`＝0；「生」每月 1 天，`merge_into`＝病、`merge_after_days`＝3；「家」每年 7 天，`merge_into`＝事、`merge_after_days`＝0。
- `hr_leave_records`：
  - `employee_id`、`leave_type_id`、`work_date`、`start_time`、`end_time`（整天為 NULL）、`minutes`、`whole_day`（0／1）、`reason`、`source`（roster／manual）；
  - `event_date`、`event_quota_days`（只有 `event` 類假別必填，用來把同一事件的多天歸在一起，例如同一次喪假）；
  - `comp_credit_id`（「補」「換」扣哪一筆補休額度）；
  - `created_at`、`created_by`、`cancelled_at`、`cancelled_by`、`cancel_reason`；
  - 索引 `(employee_id, work_date)`、`(employee_id, leave_type_id, work_date)`；同一員工同一天「未銷假的整天假」只能一筆（部分唯一索引 `WHERE cancelled_at IS NULL AND whole_day=1`）。
- `hr_leave_attachments`：`leave_record_id`、`object_key`、`content_type`（只收 `image/jpeg`）、`bytes`、`width`、`height`、`grayscale`、`created_at`、`created_by`。每筆請假最多 3 張。
- `hr_annual_leave_years`：`employee_id`、`period_start`、`period_end`、`entitled_days`、`daily_minutes`（建立時的每日正常工時快照）、`notified_on`、`notified_by`；`(employee_id, period_start)` 唯一。查詢或請特休時，若該年度還沒有列就建立（`INSERT OR IGNORE`）。
- `hr_overtime_records`：`employee_id`、`work_date`、`minutes`、`category`（`after_shift`／`rest_day`／`regular_day`／`sixth_day`／`holiday`）、`settlement`（`pay`／`comp`）、`note`、`supersedes_id`（更正時指向被取代的那筆）、`created_at`、`created_by`。不可刪除；更正＝新增一筆 `supersedes_id`。被取代的那筆若是補休，原補休額度同時沖銷。
- `hr_comp_time_ledger`：
  - `employee_id`、`minutes`（正＝增加、負＝扣除）、`kind`：`overtime`／`holiday`／`grant`／`use`／`reverse`／`settle_pay`；
  - `credit_id`（扣除類指向哪一筆增加）、`overtime_id`、`holiday_date`、`holiday_name`、`leave_record_id`；
  - `expires_on`（只有增加類有，預設產生月份的次月底）、`extended_count`；
  - `note`、`created_at`、`created_by`。
  - 不可刪除。「再延一個月」只更新 `expires_on`、`extended_count`，並寫稽核。
- 寫入一律 `db.batch`，同一 batch 寫稽核。

### 5.2 API（全部先檢查 `SUPER_ADMIN`）

- `GET/POST/PATCH /api/business/hr/settings/leave-types`：
  - 法定假別（`is_statutory=1`）的額度、併入規則、計算方式不可改，只能改排序與啟用；
  - 公司假別（`is_statutory=0`）可新增，所有欄位都能改；
  - 不提供刪除，只能停用。
- `GET /api/business/hr/employees/:id/leave?year=`：該員當年度請假紀錄（含銷假）、每個假別的已用與上限、特休年度表（§5.3 `annualLeaveLedger`）、補休帳戶（每筆額度的餘額與到期）。
- `POST /api/business/hr/employees/:id/leave-records`：半天請假（`manual`）。整天請假走排班存檔；這個 API 收到 `wholeDay` 回 422 並提示到排班表填。
- `POST /api/business/hr/leave-records/:id/cancel`：銷假（必填原因）。`roster` 來源的紀錄不能從這裡銷假，要改排班格。
- `POST /api/business/hr/leave-records/:id/attachments`：上傳一張 JPEG（前端已縮圖，伺服器再檢查 ≤ 1.5 MB、長邊 ≤ 2000px、檔頭是 JPEG）。
- `GET /api/business/hr/leave-attachments/:id`：串流圖片，`cache-control: private, no-store`，每次寫稽核 `hr_leave_attachment.viewed`。
- `PUT /api/business/hr/rosters/:storeId/:month`（2a 既有）擴充：
  - 對每個變動格，依前後假別決定新增／銷假請假紀錄，與排班同一個 batch；
  - 先檢查額度、每日正常工時、補休餘額；不足回 409 `HR_LEAVE_QUOTA`（`items[]`：員工、日期、假別、期間、已用、上限、訊息），整批不寫；
  - 「補」「換」自動挑同類、最早到期、仍有餘額的額度；沒有就 409 `HR_COMP_INSUFFICIENT`。
  - `event` 類假別（婚、喪、產、陪…）從排班格填時，前端要跳出小視窗輸入「事件日期」與（有選項時）「本次額度」，隨變動格送出。
- `PATCH /api/business/hr/annual-leave-years/:id/notice`：記錄書面通知日期。列印頁由前端產生。
- `GET /api/business/hr/overtime/candidates?storeId=&month=`：門市整月的加班候選與已確認紀錄、每人每月延長工時合計與警示。
- `POST /api/business/hr/overtime-records`：確認一筆（或多筆）加班；`settlement=comp` 時同 batch 新增補休額度。
- `POST /api/business/hr/overtime-records/:id/correct`：更正（新時數或改結算方式）。
- `POST /api/business/hr/employees/:id/comp-time`：管理員給予補休或國定假日換休（換休必填國定假日日期與名稱；1 天＝該員每日正常工時）。
- `POST /api/business/hr/comp-time/:id/extend`：再延一個月。
- `POST /api/business/hr/comp-time/:id/settle`：到期的加班補休轉加班費（只有 `overtime` 類、已到期、仍有餘額才可以）。
- **稽核事件**（都要補中文標籤，`scripts/change-log-labels.test.mjs` 會檢查）：`hr_leave.created`、`hr_leave.cancelled`、`hr_leave_attachment.uploaded`、`hr_leave_attachment.viewed`、`hr_annual_leave.notified`、`hr_overtime.confirmed`、`hr_overtime.corrected`、`hr_comp_time.granted`、`hr_comp_time.extended`、`hr_comp_time.settled`、`hr_setting.updated`（假別）。排班存檔帶出的請假異動寫在 `hr_roster.updated` 的同一筆，`after` 加 `leave` 清單。

### 5.3 純函式與測試

**`shared/hr-leave.ts`**
- `partialLeaveMinutes(shift, start, end)`：重疊減休息，30 分鐘為單位；起訖不在班別內丟錯。
- `checkLeaveQuota(type, types, records, candidate, employee)`：回傳違反的上限清單。要處理 `calendar_year`、`month`、`event`、`two_years`（以候選日期往前兩年）、`merge_into`（超過 `merge_after_days` 的部分同時算進目標假別）、`counts_calendar_days`。
- 測試：
  - 事假 14 天第 15 天擋下；家庭照顧假 7 天內同時算進事假，事假已 10 天時家庭照顧假第 5 天擋下；
  - 生理假每月 1 天、第 2 天擋下；全年前 3 天不算病假，第 4 天起算進病假；
  - 病假 30 天後擋下；住院病假兩年 365 天含病假；
  - 喪假同一事件 8 天上限、不同事件分開算；
  - 半天假：早班 09:00–17:30 請 12:00–15:00 ＝ 2.5 小時（扣 13:00–13:30）；請 08:00–10:00 擋下；
  - 半職每日正常工時 240：整天特休算 4 小時。

**`shared/hr-annual-leave.ts`**
- `annualLeaveLedger(periods, records, asOf)`：每個特休年度的應給、遞延進來、已休（先扣遞延）、剩餘、遞延出去、到期未休（未休工資）。
- 測試：當年度 7 天休 3 天 → 遞延 4 天；下一年度先扣遞延；遞延的到期未休列為未休工資；年資不計期間順延後的年度正確；銷假的紀錄不計入。

**`shared/hr-overtime.ts`**
- `overtimeCandidates(days, shifts, holidays, rosterResult)`：
  - 下班後超過班別下班時間的分鐘數，無條件捨去到 30 分鐘；
  - 例休日（`/` 或兼職 `X`）有打卡：整段打卡工時；
  - 連六標記日、國定假日有打卡：整段打卡工時；
  - 居家工作、擺攤不列。
- `overtimeWarnings(records, normalMinutesByDate)`：每月延長工時超過 46 小時、每日正常＋延長超過 12 小時。
- `compBalances(ledger, asOf)`：每筆額度的餘額、是否快到期（7 天內）、是否已到期。
- 測試：上述每條；更正後只算最新一筆；沖銷後餘額正確；延期後不再算到期。

### 5.4 前端

- **人員詳細頁新增「假勤」區塊**（放在特休卡旁）：
  - 本年度各假別已用／上限；請假紀錄清單（日期、假別、時數、來源、附檔數、銷假狀態）；「＋請假」開半天請假視窗（日期、假別、起訖時間每 30 分鐘一格、事由、附檔）。
  - 特休年度表：應給、遞延進來、已休、剩餘、到期未休；每年度「列印通知」與「已通知」日期。
  - 補休帳戶：餘額合計；每筆額度的來源、到期日、餘額；快到期黃色、已到期紅色；「再延一個月」「轉加班費」按鈕；「＋給予補休／換休」。
- **附檔**：選圖後在瀏覽器用 canvas 縮到長邊 1600px、JPEG 品質 0.8，可勾「黑白」；預覽後上傳。查看用 `Dialog` 顯示原圖。
- **排班表**：
  - 半天假在格子右下角顯示小字（假別代號＋時數，例如「特2」）；
  - 填 `event` 類假別時跳出事件日期視窗；
  - 存檔遇到 `HR_LEAVE_QUOTA`／`HR_COMP_INSUFFICIENT`，在違規清單顯示並把那些格子標紅。
- **加班頁籤**（人事頁「人員｜排班｜出勤｜加班」）：門市＋月份；每人每天的候選（類別、建議時數）可改時數，選「加班費」或「補休」後確認；已確認的顯示在旁邊，可更正；上方顯示第 32 條警示。
- **設定**：加入「假別」，法定假別唯讀額度欄位，只能停用與排序。
- **人員表單**：半職、兼職顯示「每日正常工時（小時）」欄位，0.5 小時為單位；正職隱藏、固定 8 小時。
- **列印書面通知**：A4 直式一頁，內容：員工姓名、特休年度起訖、應給天數、遞延天數、合計、公司名稱、通知日期、簽收欄。用 `@media print`，同 2a 列印方式。

### 5.5 附檔儲存（R2）

- Worker 綁定名稱 `HR_FILES`，**選用**：沒有綁定時，上傳與查看 API 回 503 `HR_FILES_UNAVAILABLE`（「附檔儲存尚未設定」），其他功能正常。
- 物件鍵 `hr-leave/{leaveRecordId}/{uuid}.jpg`。
- `scripts/render-deploy-config.mjs`：環境變數 `CF_HR_FILES_R2_BUCKET` 有值時加入 `{ binding: "HR_FILES", bucket_name }`；`scripts/validate-deploy-config.mjs` 補對應檢查。**不要改 workflow**；把 workflow 要傳的變數寫在完成報告，由審查者處理。
- 本機與驗收：`wrangler.d1-acceptance.jsonc` 加一個 ephemeral 的 `HR_FILES` bucket，驗收實際上傳、讀取一張小 JPEG。
- 測試用刪除（`HrService.remove`）：先列出該員所有附檔鍵，資料庫刪除成功後再刪 R2 物件。

### 5.6 大量資料（§11.3）

- 排班存檔：額度檢查只讀「該月變動格涉及的員工」在檢查期間內的請假紀錄（最長兩年），用 `(employee_id, leave_type_id, work_date)` 索引；不得逐格查詢。
- 加班候選：一次讀門市整月的排班、打卡、國定假日、已確認紀錄。
- 完成報告寫出讀寫列數估計。

### 5.7 文件、版本、TODO

- `VERSION`／`package.json` → `0.9.25`。
- `docs/architecture/HR_MODULE_CONTRACT.md` 補 2b 的 API 與資料表；`API_CONTRACT.md`、`CANONICAL_DATA_MODEL.md` 同步。
- `worker/backup/schema-columns.ts` 依 migration 更新；`scripts/validate_schema.py` 若有檢查清單一併更新。
- `TODO.md` 最上方新增 0.9.25 段落。

## 6. 驗收清單

- [ ] 非超管呼叫任何新 API 得 403；人事稽核只有超管看得到。
- [ ] 排班格填整天假別 → 自動產生請假紀錄；改成其他內容 → 原紀錄銷假保留；「國」不產生紀錄。
- [ ] 半職沒設每日正常工時時，整天假存不了並有提示。
- [ ] 半天請假時數計算正確（含扣休息）；不在班別內擋下。
- [ ] §5.3 列出的額度情境都正確擋下，訊息說得出是哪個上限；整批不寫入。
- [ ] 特休先扣遞延、年度結束自動遞延、遞延到期列為未休；書面通知可列印並記錄日期。
- [ ] 加班候選正確；確認後選補休會產生額度（次月底到期）；更正會沖銷；第 32 條警示顯示。
- [ ] 排班填「補」「換」扣對應額度；餘額不足擋下；再延一個月、轉加班費正常並寫稽核。
- [ ] 附檔：縮圖、黑白、上傳、查看（寫稽核）；沒有 `HR_FILES` 時回 503 而其他功能正常。
- [ ] 測試用刪除會一併刪掉 2b 資料與附檔。
- [ ] 所有表單 Enter 跳下一欄；沒有 `window.confirm`。
- [ ] 手機寬度可以操作請假、補休與加班確認。
- [ ] 所有稽核事件在異動紀錄中為中文句子。
- [ ] 完成報告寫出讀寫列數估計（§11.3）。
- [ ] `npm run typecheck`、`timeout 300 npm run validate:source`、`npm run build`、`npm run validate:d1:local`、`node --test scripts/*.test.mjs` **逐一實際執行**並貼結果；無法執行的寫明原因，不得宣稱通過。
- [ ] 沒有新增或修改 `.github/workflows/*`，沒有範圍外的檔案。
- [ ] VERSION／package.json 為 0.9.25；TODO、合約文件已更新。

## 7. 截圖要求

由審查者以實際畫面擷取：假勤區塊（桌面、手機）、半天請假視窗、附檔上傳與查看、特休年度表與書面通知列印、補休帳戶、加班頁籤、排班表的半天假與額度錯誤、假別設定。

## 8. 完成報告（執行者填）

## 9. 審查紀錄（審查者填）

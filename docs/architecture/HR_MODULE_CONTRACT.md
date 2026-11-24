# CY Web 人事模組第一期資料與 API 合約（WO-0.9.20）

## V0.28.0 薪資流程重整

- 薪資頁籤：薪資設定｜每月薪資｜獎金發放｜公司補充保費。離開薪資頁（例如到出勤補正）再回來時還原子頁、月份與選取的員工。
- 薪資設定：員工、門市・職稱、計薪、月薪合計（本薪＋津貼；時薪為「$N /時」）、生效日；展開列為薪資紀錄與目前生效的計薪／投保設定摘要（沿用 `GET /payroll/profiles/:id`，展開時才讀）。計薪／投保設定視窗（`POST /payroll/profiles/:id`，驗證不變）改由此頁與每月薪資詳情開啟。
- 每月薪資是「一個月份一張工作清單」：
  - 新增唯讀 `GET /payroll/month?month=YYYY-MM`（僅 SUPER_ADMIN，與其他薪資路由相同）：一次回傳 `{month,rows[]}`。列為該月應發薪員工——到職日不晚於月底且（無離職日或離職日不早於月初），或該月已有非撤回薪資紀錄者；每列有 `employeeId, employeeNo, name, storeId, storeName, hasSalary, voidCount` 與 `run`（`id, status, revision, payDate, gross, deductions, net, issues[], paidDays, reason`；沒有紀錄為 `null`）。全部參數化、單一查詢（只取 `result_json`／`input_json` 的 `json_extract` 摘要，不回逐日明細）、上限 500 人，超過回 422 要求縮小範圍。`hasSalary` 為月底前是否有任何薪資主檔紀錄；沒有薪資且沒有紀錄者在畫面顯示待補「尚未設定薪資」，不必先計算。
  - `GET /payroll/runs?month=&employeeId=` 新增選填 `employeeId`，並回傳 `reason`；詳情的「歷史快照」展開時才以它讀撤回的快照。
  - 狀態分類（畫面）：無紀錄且有薪資→未計算；無紀錄且無薪資→待補；草稿有待補事項→有待補、無待補事項→待確認；已確認；已發薪。狀態卡可點選篩選。實領欄在有待補時顯示「待確認」，合計列的實領不含有待補者，避免把未定案金額當成實發。
  - 待補事項的動作由 `hr-payroll-flow.ts` 的 `classifyIssue` 依後端訊息對應：出勤補正、請假補單（切到出勤／請假頁並定位員工與月份）；確認曠班、例假緊急出勤、國定假日調移（既有 `POST /payroll/reviews/:employeeId`，必填核對原因，存檔後重算）；設定薪資（既有薪資異動視窗）；計薪／投保設定（既有視窗）；調整計薪天數（既有 `paidDays`，必填原因）。沒有對應的只顯示文字。缺卡沒有可確認的對應，只提供到出勤補正。
  - 計算全部：對無紀錄（有薪資、未撤回過）與草稿的員工，逐一呼叫 `POST /payroll/calculate`（同時最多 2 筆），草稿沿用原本的 `paidDays` 與原因；單筆失敗不中斷；已確認／已發薪永不處理；撤回過尚未重算者須個別填原因，批次略過並提示。確認全部無待補：只處理沒有待補事項的草稿，逐筆 `POST /payroll/runs/:id`（`confirm`），來源資料已異動的 409（訊息含「重算」）標為「需重新計算」。批次不改變任何伺服器端守門：確認仍在交易內重跑來源比對。
- **原因規則（使用者 2026-11-24）**：首次計算、計算全部、重算草稿、確認、確認全部、標記已發薪不需原因，後端存預設 `YYYY/MM 月薪`（`defaultReason`）。必填原因（422）的是：`reopen` 撤回確認；該員工該月已有撤回快照後的任何重新計算；指定 `paidDays`；既有的核對原因（`reviews`）。每次動作仍寫稽核，`reason` 欄位與 `input_json.reason` 保存實際或預設原因。
- 測試：`scripts/hr-payroll-flow.test.mjs`、`scripts/hr-payroll-flow-ui.test.mjs`。無 migration；計算公式、法定表、快照不可變、樂觀鎖與授權不變。

## V0.27.0 人員清單與人事設定介面

- `GET /employees` 新增選填 `storeId`（正整數）與 `employmentType`（`full`／`half`／`casual`），無效值回 422；與 `q`、`status`、`cursor`、`limit` 並用，皆比對 `hr_employee_current` 的今日有效值（門市與僱用型態依各自紀錄投影，未來生效的調任尚不計）。每列另回傳 `store_name`（左連 `hr_stores`，沒有門市則為 null）。排序仍為 `e.id`，不變。
- 介面：清單列單行「編號 姓名［門市標籤］…狀態」，標籤為方框外框、無底色，與實心圓角的狀態標籤區隔；三個篩選為人事狀態、門市（啟用中門市）、僱用型態。
- 人事設定視窗為左側分類＋右側單表；新增與修改各開獨立視窗。僅介面重排，設定 API 與驗證不變。

## V0.25.1 任用異動與主檔顯示

- 主檔新增可設定人事狀態、門市、職稱、僱用型態與排班方式。建檔後上述五欄持續顯示，但一般主檔 PATCH 不可變更後四個任用欄位，人事狀態本來就不在 PATCH 內；五欄只能透過 `POST /employees/:id/status-changes`（狀態異動）變更。
- **一筆異動紀錄只異動一個欄位**：欄位、生效日期、新值。生效日當天只改該欄位，不牽動其他欄位。同一視窗改兩個欄位就是兩筆同生效日期的紀錄。每筆另有**異動日期**（紀錄寫入當天，台北日期，由 `created_at` 推得，非使用者輸入）；畫面同時顯示生效日期與異動日期。
- 儲存：人事狀態仍存 `hr_status_changes`（維持純狀態，不加欄位）；門市、職稱、僱用型態、排班方式存新表 `hr_assignment_changes(employee_id, field, effective_date, previous_value, next_value, reason, handled_by, created_at)`，一欄一筆。`hr_employees` 的四個任用欄位是建檔基準值，不隨異動覆蓋。
- 每個欄位的當前值 = 該欄位自己的紀錄中、生效日 ≤ 台北今日者，以 `effective_date DESC, id DESC` 取最新；沒有則用建檔基準。未來生效日的紀錄保持待生效，到日自動生效（唯讀 view `hr_employee_current` 於讀取時投影，不靠排程、GET 不寫入）。五欄（含人事狀態）各自獨立投影；狀態判定的排序規則沿用原本的生效日與 id，不改。
- status-changes 請求：`effectiveDate`、`reason` 與任意子集的 `nextStatus`、`storeId`、`jobTitleId`、`employmentType`、`scheduleMode`、選填 `expectedRevision`。請求只含使用者勾選的欄位。送出的欄位其值若等於「該欄位在生效日當天的值」，整筆回 422 並指名該欄位（例如「門市」在 2026-12-01 已經是「高雄」），不再默默略過，也不寫入任何紀錄；一個欄位都沒送同樣回 422。舊只送狀態的呼叫仍相容。
- 較晚紀錄變成沒有變化：存某欄位 F 的新值 V 於 D 後，F 在 D 之後（生效日 > D）、且因此新值與其前一個值相同的既有紀錄稱為「沒有變化」。原本就沒有變化的紀錄不計。若有，且請求的 `deleteRedundantIds` 未恰好涵蓋這些紀錄、也未帶 `keepRedundant:true`，回 409，錯誤碼 `HR_REDUNDANT_LATER_CHANGES`，`error.details.items` 列出 `id`（`s<id>` 為狀態、`a<id>` 為任用）、`field`、`fieldLabel`、`effectiveDate`、`previous`、`next` 與顯示用 `previousLabel`、`nextLabel`，不寫入。帶 `deleteRedundantIds` 時，刪除與新增在同一個 `db.batch`、同一組 revision 條件，每筆刪除各有稽核（`hr_employee.status_change_deleted`、`hr_employee.assignment_change_deleted`，`before` 為被刪除的整列）；帶 `keepRedundant:true` 則保留。兩者同送回 422。狀態紀錄同一規則，建檔那筆（最早一筆狀態）不會被判定為沒有變化。
- 驗證：門市／職稱須啟用；狀態改離職須帶 `terminationDate`、`terminationReason`；僱用型態與排班方式須相容（正職只能班別、半職不可不排班），且生效日當天與其後每個已排定的僱用型態或排班方式紀錄日都要相容，否則整筆拒絕並說明日期。
- `hr_employees.status`、`termination_date`、`termination_reason` 是台北今日狀態的快取，寫入時依投影結果更新：較舊生效日的補登紀錄不會覆蓋較新的狀態，也不會清除離職日與原因；只有決定今日狀態的紀錄（或未來生效的離職）會寫離職資料。未來生效的復職到日後，快取的離職日不會自動清除（已知限制，讀取以投影狀態為準）。
- 寫入以員工 revision 條件更新，兩張異動表與每筆稽核（`hr_employee.status_changed`、`hr_employee.assignment_changed`）同在一個 `db.batch` 並依同一成功條件寫入；過期視窗回 409。既有權限與資料隔離不變。薪資計算的留停期間仍只讀 `hr_status_changes`，任用異動不影響。
- 人事詳情／清單、薪資總覽、排班、出勤、請假、薪資計算的員工來源及個人任用資料共用 view；不自動重算已確認或已發薪快照，也不新增歷史月份分段計薪規則。員工若有任用異動紀錄即視為已有作業紀錄，不能刪除。
- 介面保留原狀態異動卡片與入口；視窗五個欄位各有勾選框：沒勾的欄位鎖住並顯示目前值，勾了才可選新值並只送勾選的欄位，至少勾一個才能存；頁尾顯示「會存成 N 筆異動（…）」。收到 409 `HR_REDUNDANT_LATER_CHANGES` 時視窗顯示黃色提示與「一併刪除該筆」（預設勾選），再按儲存時依勾選送 `deleteRedundantIds` 或 `keepRedundant`。**舊值於顯示時計算**：詳情回傳的 `previous_status`／`previous_value` 取同欄位前一筆紀錄的新值（沒有則建檔基準），因此補登較舊日期後，後面紀錄的舊值會跟著更正；寫入當時存的值另以 `stored_previous_status`／`stored_previous_value` 回傳（稽核用，不刪）；`no_effect` 為真的紀錄顯示「（無變化）」。卡片合併兩張表依生效日由新到舊列出最近三筆：生效日期（含待生效標記）、異動日期、「欄位：舊值 → 新值」、原因；超過三筆提供查看全部。兩種新增視窗統一 `新增…異動｜員工編號 姓名`。

## 權限與隱私

V0.26.0 員工紀錄卡新增獎金，狀態異動移到年資不計左方、寬度兩格；發放流程及資料保存依 [薪資與獎金契約](HR_PAYROLL_CONTRACT.md#v0260-獨立獎金發放)。有獎金紀錄的員工視為已有業務活動，不可刪除主檔。
- `/api/business/hr/*` API 由 CYID Session 驗證，薪資及完整人事**僅 SUPER_ADMIN**。V0.21.0僅對兩條`attendance-corrections`路徑新增「ADMIN且具名門市授權」例外，詳見[每月薪資契約](HR_PAYROLL_CONTRACT.md)；不放行原月出勤／加班或薪資API。
- 此模組不列入 `CYWEB_MODULES`、模組授權或權限群組。三期完成前不得開放一般使用者。
- `national_id` 儲存在人事主檔，**一般 GET 一律移除原文並提供 `nationalIdMasked`**。明確 `POST /employees/:id/national-id/reveal` 才提供原文，並寫稽核；稽核不含原文身分證／統一證號。
- 所有人事稽核 `hr_*` 對非 SUPER_ADMIN 在 Worker 稽核查詢層排除，不可用篩選繞過。
- 測試僅使用「測試員工甲」等虛構資料及公開範例身分證號碼。

## D1 schema
`migrations/0017_hr_phase1.sql`：`hr_employees` 主檔，`hr_emergency_contacts` 緊急聯絡人，`hr_education` 學歷，`hr_work_history` 工作經歷，`hr_status_changes` 狀態紀錄，`hr_seniority_exclusions` 年資不計期間，`hr_salary_records` 薪資紀錄，`hr_salary_allowances` 津貼明細，`hr_salary_item_types` 津貼項目設定，`hr_minimum_wages` 最低工資。主檔不提供 DELETE；狀態與薪資紀錄皆只新增。主檔 `revision` 供樂觀鎖；員工編號、使用者綁定均有唯一限制。

## API
所有路徑以 `/api/business/hr` 為根，回應使用既有 `{ok,data,requestId}` envelope，失敗使用既有 error envelope。

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET / POST | `/employees` | 搜尋（`q,status,cursor,limit`）／新增員工含子表 |
| GET / PATCH | `/employees/:id` | 明細（含子表與歷史）／主檔整批更新（`revision`） |
| GET | `/members` | 本地可綁定的啟用使用者清單 |
| POST | `/employees/:id/status-changes` | 僅新增狀態異動；離職必填日期及原因 |
| POST | `/employees/:id/seniority-exclusions` | 新增年資不計期間 |
| DELETE | `/employees/:id/seniority-exclusions/:exclusionId` | 刪除年資不計期間並稽核 |
| POST | `/employees/:id/salary-records` | 新增薪資紀錄及津貼，檢查最低工資 |
| GET | `/employees/:id/annual-leave` | 週年制特休，支援 `asOf` |
| POST | `/employees/:id/national-id/reveal` | 取得完整證號並稽核 |
| GET / POST / PATCH | `/settings/salary-item-types` | 津貼類型管理 |
| GET / POST | `/settings/minimum-wages` | 不可覆寫的最低工資生效日清單 |

### 狀態、年資與薪資
- 人事狀態：`probation` 試用、`active` 在職、`leave` 留職停薪、`terminated` 離職。以不晚於目前日期的最後一筆狀態異動為準。
- `annualLeaveSchedule(seniorityStart, exclusions, asOf)` 只計應給天數及年度起訖，不做請假扣抵；未計年資期間使週年日順延。
- 薪資金額均為整數元，本薪＋經常性津貼必須達生效日適用最低工資；最低工資由超級管理員手動新增，沒有設定時可新增但必須提示。
- 日顯示 YYYY/MM/DD，年月顯示 YYYY/MM，金額顯示千分位整數元。

## 後續
請假、假勤、薪資計算、勞健保、扣繳、員工自助查詢及資料匯入都不屬第一期。

## WO-0.9.24 第二期 2a — 月排班、出勤及門市設定

### D1 / 權限
前向 migration `0018_hr_phase2a.sql` 新增 `hr_stores`、`hr_job_titles`、`hr_shift_types`、`hr_leave_types`、`hr_holidays`、`hr_schedule_days`、`hr_schedule_months`、`hr_roster_approvals`、`hr_attendance_days`，並在 `hr_employees` 加入門市、職稱、班表排序、`full/half/casual` 僱用型態、`skip_roster_checks`、`shift/hours/none` 排班方式。所有 API 沿用 CYID SUPER_ADMIN gate；不得由模組授權繞過，稽核 `hr_*` 只對超管顯示。

### API（根路徑 `/api/business/hr`）
| 方法 | 路徑 | 用途 |
| --- | --- | --- |
| GET／POST／PATCH | `/settings/stores` | 門市設定：名稱、排序、啟用、起算週一與注意事項範本 |
| GET／POST／PATCH | `/settings/job-titles` | 職稱設定：名稱、排序、停用不刪除 |
| GET／POST／PATCH | `/settings/shift-types` | 班別設定：開始／結束／休息時間驗證及正常工時 |
| GET／POST／DELETE | `/settings/holidays?year=2026` | 人工維護國定假日，刪除稽核 |
| GET | `/rosters/:storeId/:month` | 單月及前後補齊雙週（日期由門市起算週一），員工、格子、標籤、核准、國定假日、每日人力、備註 |
| PUT | `/rosters/:storeId/:month` | 只傳變動格及備註，`db.batch` + 一筆稽核，違規 409 `HR_ROSTER_VIOLATION`；連六及兼職超 8 小時 409 `HR_ROSTER_CONSECUTIVE`，附 `items[]`，核准再帶 `approve[]` |
| PATCH | `/rosters/:storeId/:month/staff` | 本門市員工 `rosterSort` 與 `skipRosterChecks`，保留其他個資與子表 |
| GET／PUT | `/employees/:id/attendance?month=YYYY-MM` | 一次讀／寫整月打卡（上、下各兩組）、revision 樂觀鎖、不可刪除及稽核 |
| GET | `/attendance/anomalies?storeId=1&month=YYYY-MM` | 門市按月批次計算缺卡、遲到、早退、曠職及例休日打卡 |

`month` 儲存 `YYYY-MM`，日期 `YYYY-MM-DD`，時間 `HH:mm`；顯示日 `YYYY/MM/DD`。備註與規則為純文字。只有排班格可刪除，打卡紀錄無 DELETE。國定假日只供顯示，不自動排假或產生換休；請假及扣抵屬 2b。

### 計算與交易
雙週以固定週一為起點，跨月補齊週次；對正職與半職，空白週不做例休或雙週檢查。完整週每週至少一例假、完整雙週至少四例休日；正常工時單日 10h、單週 48h、雙週 80h；連七禁止、連六須核准。兼職不檢查例休，但連續上班 7 日禁止及單日超 8h 需核准；不排班兼職只可註 X，實際工時由打卡唯讀顯示。公司標記在 `hr_roster_approvals`，同區段不重複核准。系統不自動調整排班內容。

居家工作依排定班別出勤、擺攤不算遲到早退、颱風假不算曠職。異常整月依門市、員工與日期範圍批次讀取，避免 N+1。備份還原只能接受符合 migration 預設資料的全新 D1 作為目標，且於單一 transaction 刪除預設資料後還原；任何非預設資料仍禁止覆蓋。

## WO-0.9.25 人事第二期 2b（請假、特休、加班、補休）
- 新表：hr_leave_records、hr_leave_attachments、hr_annual_leave_years、hr_overtime_days、hr_comp_time_grants、hr_comp_time_settlements；hr_leave_types 擴充額度期間、併入假別與附檔需求。
- Worker 路由經原 CYID SUPER_ADMIN gate；管理員可以新增／銷假、查員工請假總表與明細、確認出勤加班、給予補休換休、延長有效期限、到期轉加班費。有效假單不得 DELETE；取消記 cancelled_at/by/reason。
- POST /api/business/hr/leave-requests 建立 batch_id，一天一列，整天與對應排班格同一 db.batch；補休不足 409 HR_COMP_INSUFFICIENT；假額上限 409 HR_LEAVE_QUOTA。
- POST /api/business/hr/leave-requests/:batchId/cancel 取消所選日期，整天假清空格子並附稽核；GET /api/business/hr/rosters/:storeId/:month 返回 leaveForms。
- GET /api/business/hr/leave/summary?year=&storeId=／GET /api/business/hr/employees/:id/leave?year= 批次查詢。
- GET/PATCH/POST /api/business/hr/settings/leave-types 法定額度不可修改，公司假別可新增修改。
- R2 選擇性綁定 HR_FILES（環境變數 CF_HR_FILES_R2_BUCKET），JPEG 1.5MB、2000px、每單 3 張，上傳寫稽核，查看不寫。
- 特休依服務年度先扣上年度遞延，未休可遞延一年度；未休工資金額留待第三期。加班費與換休金額不計算。
- 審查修正（BD-060 第 26～29 點）：補休只有一種，「換」停用、既有排班格改為「補」；補休請假可帶 `advanceHolidayDate` 預支某個國定假日（存 `advance_holiday_date`／`advance_holiday_name`），預支不扣現有餘額，只有該國定假日的補休（`hr_comp_time_grants.kind='holiday'`、`holiday_date` 相同）給予時才抵銷。國定假日補休自該日起可用，於該月的次月底到期。
- 半職、兼職特休依基準期間打卡工時占全時每週 40 小時的比例計算（`entitled_minutes`、`basis`），特休年度開始後固定；`PATCH /api/business/hr/annual-leave-years/:id/entitlement`（`minutes` 或 `null`）由超管調整，稽核 `hr_annual_leave.adjusted`。


 
## WO-0.17.0 — 薪資總覽唯讀 API
- `GET /api/business/hr/salary-overview`：只讀；使用既有 CYID／SUPER_ADMIN 權限、同一成功 envelope，並不加入獨立授權。
- 一次批次查詢所有員工當前有效狀態、門市與職稱，及薪資／津貼／登記人；伺服器分組，不因人數產生每人多次 API 讀取。
- 每人回傳 `id, employeeNo, name, storeId, storeName, jobTitle, status, salaryRecords[]`。薪資紀錄各筆有 `id, effective_date, payment_type, base_amount, reason, created_by_name, allowances[]`（各津貼包含 `item_name, amount, is_regular`）。紀錄依生效日與 ID 由新到舊。
- 前端以台北當日生效記錄顯示月薪／時薪、津貼、月合計與在職月薪摘要；不回傳身分證字號、不改薪資異動 POST 或最低工資檢查，不產生任何薪資計算結果。

## V0.20.2 第一批假勤正確性與操作保護（待Claude審查／未部署）

出勤明細及門市異常清單各增加一次有界有效假單讀取，只取未銷假紀錄，使用同一`evaluateAttendance`。正式起訖假單與休息時間取聯集後，自應出勤區間排除，防止重複扣除；剩餘未覆蓋時間才計遲到／早退。有效整天假或完整覆蓋排班工作區間的時段假不列曠職；部分假未覆蓋的應出勤仍判斷。缺卡保留、已銷假不排除；實際打卡工時不因請假而增加。居家無打卡的既有自動工時，在有時段假時排除覆蓋區間；沒有可定位班別的純分鐘假不猜應出勤起訖。沒有新增薪資或請假扣薪計算。

打卡工時畫面改精確「N小時M分鐘」；加班及請假仍沿用半小時單位。出勤員工選單支援既有cursor載入更多，不再僅讀前100人。出勤PUT直接採用同次回應的attendance並清除草稿，不額外GET或因重讀失敗重送已成功寫入。

人事、排班、出勤及請假主要查詢使用共用請求序號／查詢身分防護，舊成功／錯誤／finally及卸載回應不能覆寫新畫面。人事本地頁籤使用同一NavigationGuard，桌機／手機一致，未儲存確認、處理中禁止切換；保留原模組導航預設文案。補休與特休調整失敗保持視窗與輸入、錯誤在視窗內顯示，送出鎖防重複。假單寫入及附件期間不可關閉／改正式內容；假單已成立後只重試附件，不重新建立假單。

權限仍僅SUPER_ADMIN；Schema、Audit／版本規則、費率及毛利功能不變。本批從PR #515最新毛利／品類分支另開子分支，不合併或部署。詳見[交接](../handoff/CYWEB-HR-FIRST-BATCH-20261114.md)。

## V0.20.3 第二批共用表格式介面（待Claude審查／未合併／未部署）

維持人員、排班、出勤、請假、薪資五頁籤及既有單一資料owner。主檔沿用RecordSheet／RecordRows；排班、出勤、請假與薪資統一DataViewToolbar。出勤、假單、特休、補休、預支、異常及歷史改共用cy-op-table／cy-rt，手機只沿共用820px改排，不另設讀寫或計算流程。排班月矩陣維持同格編輯、鍵盤與列印，使用共用矩陣捲動樣式；員工搜尋只改顯示列，每日人力仍全門市，列印按目前顯示。

視窗使用EntryFields columns（EntryTable表頭在上／格內輸入），舊呼叫不傳columns仍相容。門市、職稱、班別、假別設定在原表格同一列切換檢視／編輯，新增空白列；津貼、國定假日及最低工資新增亦在表內。法定假別原不可改欄位不開放，公司假別新增能實際展開空白列；失敗保留輸入。設定仍由既有API及SUPER_ADMIN權限驗證。

調薪視窗顯示目標員工，以已生效薪資帶入計薪方式、本薪及津貼id／金額／經常性，不把未來調薪當目前設定；快照讀取失敗時禁止提交並提供重讀。薪資總覽分開經常性／非經常性津貼，標示月薪設定合計及非當月實發；現有合計口徑不改。歷次使用共用ExpandToggle，歷史異動與請假銷假仍走原API。

本批無新Schema、權限、Worker薪資公式或每月薪資計算。保留V0.20.2有效假單整合、精確分鐘、請求序號、頁籤guard、防重複寫入與儲存失敗保護。[交接](../handoff/CYWEB-HR-TABLE-UI-20261115.md)。

## V0.21.0 第三批每月薪資（待Claude審查／未合併／未部署）

新增每月薪資清冊、計算及版本快照、官方級距每日自動匯入、單次5／6分鐘及全勤規則、結清防重與具名管理員更正能力。Schema0073新增七表及假單法定保護欄；Build2的0074～0076另增法定案件、補充保費版本及差額／唯一套用四表，補月中投保分段、連續產假／公傷與給付日獎金／兼職稅務、公司補充保費及前期差額，沿用主檔與Audit，詳見[正式分支契約](HR_PAYROLL_CONTRACT.md)及[交接](../handoff/CYWEB-HR-PAYROLL-20261115.md)。特殊案例及1440／390目視仍列待補，不能當作全情境薪資驗收或部署授權。

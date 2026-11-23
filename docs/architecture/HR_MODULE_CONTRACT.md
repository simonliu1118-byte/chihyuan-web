# CY Web 人事模組第一期資料與 API 合約（WO-0.9.20）

## V0.25.1 任用異動與主檔顯示

- 主檔新增可設定人事狀態、門市、職稱、僱用型態與排班方式。建檔後上述欄位持續顯示，但一般主檔 PATCH 不可變更任用欄位；只能透過既有 `POST /employees/:id/status-changes`。
- 原狀態判定仍以台北當日已生效紀錄的 `effective_date DESC,id DESC` 為準，建檔紀錄仍參與同一排序，不因這版排除或重寫舊資料。
- status-changes 另可帶 `storeId`、`jobTitleId`、`employmentType`、`scheduleMode` 與 `expectedRevision`。四個任用欄位省略表示不變，UI 只傳有修改的欄位；伺服器驗證門市／職稱啟用、僱用型態／排班相容性，保存實際異動及生效日前的任用值。僱用型態與排班方式成對保存以免拆成不相容組合。舊只送狀態的 API 呼叫仍相容。
- 0081 增加 nullable 任用欄位、`previous_assignment` 及唯讀 view `hr_employee_current`。主檔四個任用欄位作初始基準，不隨一般修改覆蓋；view 依每個欄位最後已生效的異動取值，省略欄位的狀態紀錄不會清空任用值。新欄位未生效前保持舊值，不靠背景排程更新主檔。
- 人事詳情／清單、薪資總覽、排班、出勤、請假、薪資計算的員工來源及個人任用資料共用 view；保留既有當前員工來源與計算公式，不自動重算已確認或已發薪快照，也不新增歷史月份分段計薪規則。
- 新增異動使用員工 revision 的條件更新，歷程與稽核依同一成功寫入條件成立；過期視窗回 409。既有權限與資料隔離不變。
- 保留原狀態異動卡片，列生效日／異動內容／原因，最多最近三筆；同次多欄位異動在同一格分行。超過三筆才顯示查看全部，既有歷史視窗仍為完整表格。兩種新增視窗統一 `新增…異動｜員工編號 姓名`，不再額外佔一列重複員工姓名。

## 權限與隱私
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

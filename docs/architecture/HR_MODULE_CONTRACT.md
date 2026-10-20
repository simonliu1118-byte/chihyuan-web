# CY Web 人事模組第一期資料與 API 合約（WO-0.9.20）

## 權限與隱私
- 所有 `/api/business/hr/*` API 由 CYID Session 驗證，**僅 SUPER_ADMIN**，其他角色回 403 `SUPER_ADMIN_REQUIRED`。
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

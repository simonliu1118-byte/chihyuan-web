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

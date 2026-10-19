# WO-0.9.20 人事模組第一期：人事主檔、年資與特休、薪資異動

- 狀態：待執行（**WO-0.9.18（版本 0.9.19）合併後**才從最新 `main` 開分支；原編號 WO-0.9.19，因版本號 0.9.18 已被 PR #218 使用而順延）
- 分支：`cyweb/hr-phase1`（建議）　PR：（執行者填）
- 依據：`PROJECT_RULES.md` §9；**BD-059**；設計 `docs/architecture/HR_MODULE_DESIGN.md`（本單以該文件第 2～4 節為準）；BD-053／054（稽核）
- 視覺規範：`docs/architecture/CY_WEB_VISUAL_GUIDE.md`

## 0. 執行限制（必讀）

- **不得新增或修改 `.github/workflows/*`**，不得新增工作單未列出的檔案類型（示意圖、mock HTML、SVG、另外的測試 runner 等）。截圖由審查者以實際畫面擷取。
- 不合併、不部署。
- 本單涉及個資：測試與驗收資料一律使用明顯虛構的資料（例如「測試員工甲」、身分證 `A123456789` 這類公開範例號碼）。

## 1. 背景（使用者原話）

- 「我還想增加一個人事模組，要有人事狀態，可以綁定使用者編號（也可以不綁），基本的人事資料除了姓名電話地址出生年月日緊急連絡人畢業科系年月過去工作資歷之外，還要有到職日、特休計算、薪資紀錄等等的，後續想擴充成我們自己的人事／假勤／薪資計算功能，但這邊必須要完全符合勞基法規定」
- 定案：特休用週年制；三期完成前只有超級管理員可見；要存身分證字號；員工自助查詢放第二期；資料由使用者自行輸入（紙本），不做匯入。

## 2. 已定案事項（不得更改）

以 `HR_MODULE_DESIGN.md` 第 2～4 節為準，重點：

1. 資料表與欄位依設計文件 §2（主檔、緊急聯絡人、學歷、工作經歷、狀態異動、年資不計期間、薪資異動與津貼明細、津貼項目設定、最低工資）。
2. 人事狀態只由「狀態異動」新增紀錄改變；狀態異動、薪資異動**只能新增**，不能修改或刪除；人事主檔**不能刪除**。
3. 特休依設計文件 §3（週年制、第 38 條天數表、年資不計期間順延）；第一期只計算與顯示，不做請假扣抵。
4. 權限依設計文件 §4：後端一律限 `SUPER_ADMIN`；不加入模組授權與權限群組；身分證字號遮罩、顯示完整要寫稽核且稽核不存完整號碼。
5. 薪資低於最低工資時擋下存檔（設計文件 §2.5）；最低工資由使用者輸入，不內建數字。
6. 金額為整數元；日期顯示 `YYYY/MM/DD`，年月顯示 `YYYY/MM`。

## 3. 範圍

1. D1 migration `0017_hr_phase1.sql`（所有第一期資料表、索引、唯一限制：員工編號唯一、綁定使用者唯一）。
2. Worker：`worker/hr/`（validation、repository、persistence、service）與 `/api/business/hr/*` 路由。
3. 共用：`shared/hr.ts`（型別）、`shared/hr-annual-leave.ts`（特休純函式）、`shared/national-id.ts`（身分證／居留證檢查碼與遮罩）。
4. 前端：`#hr` 頁面（清單＋明細＋修改）、模組設定（津貼項目、最低工資）。
5. 稽核事件與中文標籤；異動紀錄中人事事件只對超級管理員顯示。
6. 備份欄位、驗收測試、單元測試、文件、版本、TODO。

## 4. 不做

- 請假、出勤、加班、薪資計算、勞健保、扣繳（第二、三期）。
- 員工自助查詢、資料匯入、匯出、列印。
- 權限拆分（BD-059：三期完成後再議）。
- 新增 CI workflow、示意圖檔、mock 頁面。

## 5. 實作指引

### 5.1 資料庫與後端
- Migration 依設計文件欄位建立；`hr_employees.member_id` 可為 NULL、參照 `app_members(id)`，加唯一索引（僅非 NULL）。
- 所有寫入用 `db.batch`，並在同一 batch 寫稽核（沿用其他模組的 `prepareRecord` 寫法）；主檔修改用 `revision` 樂觀鎖。
- API（全部先檢查 `SUPER_ADMIN`，否則 403 `SUPER_ADMIN_REQUIRED`）：
  - `GET/POST /api/business/hr/employees`（清單支援 `q`：員工編號、姓名；`status` 篩選；游標分頁）
  - `GET/PATCH /api/business/hr/employees/:id`（含子表：緊急聯絡人、學歷、工作經歷，整批覆寫子表）
  - `POST /api/business/hr/employees/:id/status-changes`
  - `POST /api/business/hr/employees/:id/seniority-exclusions`、`DELETE …/seniority-exclusions/:exclusionId`（年資不計期間可刪，刪除寫稽核）
  - `POST /api/business/hr/employees/:id/salary-records`
  - `GET /api/business/hr/employees/:id/annual-leave`（回傳各特休年度起訖與天數）
  - `POST /api/business/hr/employees/:id/national-id/reveal`（回傳完整號碼並寫稽核）
  - `GET/POST/PATCH /api/business/hr/settings/salary-item-types`、`GET/POST /api/business/hr/settings/minimum-wages`
- 一般 GET 只回傳遮罩後的身分證字號。
- 稽核 entity：`hr_employee`、`hr_salary_record`、`hr_status_change`、`hr_setting`；action 例如 `hr_employee.created`、`hr_employee.updated`、`hr_employee.status_changed`、`hr_salary_record.created`、`hr_employee.national_id.viewed`、`hr_seniority_exclusion.created`／`.deleted`、`hr_setting.updated`。稽核 before／after 中的身分證字號一律存遮罩值。
- `worker/audit`：查詢時若角色不是 `SUPER_ADMIN`，排除 `entity_type LIKE 'hr_%'`（後端判斷）。
- `worker/backup/schema-columns.ts` 依 migration 更新（`validate_schema.py` 會比對）。

### 5.2 共用純函式與測試
- `shared/hr-annual-leave.ts`：`annualLeaveSchedule(seniorityStart, exclusions, asOf)` → `[{ periodStart, periodEnd, days, serviceYearsLabel }]`，依設計文件 §3。
- `shared/national-id.ts`：`isValidTaiwanId(value)`（身分證與新式統一證號檢查碼）、`maskTaiwanId(value)` → `A12****789`。
- 新增 `scripts/hr-annual-leave.test.mjs`、`scripts/national-id.test.mjs`（沿用現有 `scripts/*.test.mjs` 寫法）。特休至少涵蓋：未滿 6 個月（0 筆）、剛滿 6 個月（3 日）、滿 1 年（7）、滿 2 年（10）、3 年與 4 年（14）、5 年（15）、10 年（16）、24 年與 30 年（30 上限）、2/29 到職、有年資不計期間時週年日順延。
- `worker/acceptance` 加人事驗收：非超管 403；建立員工＋子表；狀態異動改變目前狀態；薪資低於最低工資被擋；未設定最低工資時可存；身分證只回遮罩、reveal 寫稽核且稽核無完整號碼；異動紀錄對 ADMIN 不含 `hr_*`。

### 5.3 前端
- `src/App.tsx`：路由 `hr`，標題「人事」、說明「人事資料、年資特休與薪資紀錄」；選單放在「業務模組」最後，**只對 `SUPER_ADMIN` 顯示**（不經 `moduleCodesForRoute`）。
- `src/runtime/modules/HrOperationalPage.tsx`：比照客戶頁的清單＋明細版型與共用元件。
  - 清單列：上行小字員工編號、下行姓名；右側狀態 chip；上方搜尋與狀態篩選、「＋ 新增員工」。
  - 明細：標題「員工編號 姓名」＋狀態 chip；基本資料卡（含遮罩身分證與「顯示」按鈕、綁定使用者）；下方卡片：**特休**（目前年度天數與起訖、查看全部年度）、**薪資**（目前薪資、查看全部異動）、**狀態異動**（最近紀錄、＋異動）、**年資不計期間**、緊急聯絡人／學歷／工作經歷。
  - 修改表單沿用共用編輯頭（取消／儲存在上方）；子表用共用可編輯清單。
  - 薪資異動、狀態異動用對話框新增。
- 模組設定（`ModuleSettingsButton`）：津貼項目、最低工資兩個區塊。
- `change-log-labels.ts` 補所有人事 action 與欄位中文標籤（`scripts/change-log-labels.test.mjs` 會檢查）。

### 5.4 文件、版本、TODO
- `VERSION`／`package.json` → `0.9.20`；`BUILD` 維持 `0`。
- 新增 `docs/architecture/HR_MODULE_CONTRACT.md`（API 與資料合約）；`API_CONTRACT.md`、`CANONICAL_DATA_MODEL.md` 補人事；`TODO.md` 最上方新增 0.9.20 段落。

## 6. 驗收清單

- [ ] 非超級管理員：選單看不到「人事」，直接呼叫任何 `/api/business/hr/*` 得 403，異動紀錄看不到人事事件（驗收測試涵蓋）。
- [ ] 可新增員工（含緊急聯絡人、學歷、工作經歷），員工編號重複與同一使用者重複綁定會被擋。
- [ ] 狀態只能用「狀態異動」改變，列出完整歷史；離職需離職日與原因；沒有刪除員工的功能。
- [ ] 特休卡依週年制顯示正確天數與年度起訖；單元測試涵蓋 §5.2 所列情境並通過。
- [ ] 年資不計期間會讓之後的週年日順延。
- [ ] 薪資異動只能新增；低於最低工資擋下並顯示比對依據；未設最低工資時警告但可存。
- [ ] 身分證字號格式檢查有效；畫面與一般 API 只出現遮罩值；「顯示」後才看到完整號碼並留下稽核，稽核內容沒有完整號碼。
- [ ] 所有人事事件在異動紀錄中為中文句子，沒有英文代碼。
- [ ] 日期 `YYYY/MM/DD`、年月 `YYYY/MM`、金額千分位整數元。
- [ ] `npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local` 全部通過。
- [ ] `node --test scripts/*.test.mjs` 全部通過（需先 `git clone --depth 1 https://github.com/simonliu1118-byte/cyapps .tmp/canonical-cyapps`；無法取得時在完成報告寫明，**不得**另寫 workflow 代替）。
- [ ] 沒有新增或修改 `.github/workflows/*`，沒有範圍外檔案。
- [ ] VERSION／package.json 為 0.9.20；TODO、合約文件已更新。

## 7. 截圖要求

執行者不需提交截圖。審查者會擷取：人事清單、員工明細（各卡片）、新增／修改表單、薪資異動與狀態異動對話框、特休全部年度、模組設定、手機 390 寬。

## 8. 完成報告（執行者填）

- 實作分支：`cyweb/hr-phase1`（由 `main` commit `fce11c54` 建立）。
- PR：[＃221](https://github.com/simonliu1118-byte/chihyuan-web/pull/221)，不合併、不部署。
- 驗收清單逐項結果：
  1. **超管權限**：已實作。選單 `#hr` 只對 SUPER_ADMIN 顯示；所有 HR API 先執行 CYID 身分與超管角色檢查，非超管 403 `SUPER_ADMIN_REQUIRED`；非超管稽核查詢後端排除 `hr_%`，加入 D1 權限測試。
  2. **員工／子表／唯一限制**：已實作。可新增主檔及緊急聯絡人、學歷、工作經歷；員編、非 NULL 使用者綁定資料庫唯一。新增使用者綁定與重複衝突測試。
  3. **狀態異動**：已實作追加式狀態歷史，主檔不得刪除，不提供舊紀錄更新／刪除端點。狀態以有效日期最後一筆為準；離職須由狀態異動填寫日期與原因。
  4. **週年制特休**：已實作 `annualLeaveSchedule`；測試檔包含未滿六月、六個月、1、2、3、4、5、10、24、30 年、2/29 與不計年資順延。前端含當年度與全部年度卡片；完整測試指令待另跑。
  5. **年資不計期間**：已實作新增及刪除、刪除稽核；排除期間順延週年日。
  6. **薪資／最低工資**：已實作只能新增的薪資異動（含津貼）、最低工資有效日設定、低於當日適用額擋下；未設定最低工資可存且 UI 顯示警告。薪資一律整數元。設定亦提供津貼類型。
  7. **證號與隱私**：已實作身分證／新式統一證號檢查碼、遮罩 `A12****789`、獨立 reveal API 與 reveal 稽核；一般 GET 不含原文證號，稽核 before/after 均只有遮罩值。加入 D1 隱私測試。
  8. **稽核中文化**：已補人事 entity、action、欄位及狀態中文詞彙；API 限制非超管無法查人事事件。審查者仍需對實際畫面全文查核。
  9. **日期與金額**：日期使用現有 `formatDate`（YYYY/MM/DD），年月表單採 YYYY/MM，金額卡片採千分位整數元；手機 390px 實機驗收待審查者操作。
  10. **型別／來源／建置／D1**：GitHub 原有 Runtime Check 已在 [run 39271323832](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39271323832) 全部通過（Worker/browser TypeScript、source-contracts、local D1，含新增身分證、年資、使用者唯一性驗收，以及 Vite build）。
  11. **完整 Node 測試**：新增 `scripts/hr-annual-leave.test.mjs` 及 `scripts/national-id.test.mjs`；既有 CI 不能證明執行過 `node --test scripts/*.test.mjs` 所有測試，且未取得 canonical cyapps clone，**本項不得宣稱完全通過**。
  12. **workflow 與範圍**：未新增或修改 `.github/workflows/*`，新增檔案均在 §3/§5 指定的 SQL、shared、worker、src、scripts、文件範圍內。
  13. **版本／文件**：`VERSION`、`package.json` 均為 `0.9.20`，`BUILD` 維持 `0`；更新 `TODO.md`、`API_CONTRACT.md`、`CANONICAL_DATA_MODEL.md`，新增 `HR_MODULE_CONTRACT.md`。
- 與工作單不同之處與原因：`GET /api/business/hr/members` 為自選綁定使用者提供現有本地使用者清單，仍在指定 HR API 範圍內；沒有更改 CYID authority。為便於響應式版面，新增 `src/runtime/modules/hr-operational.css`，內容僅人事樣式。第一期不加入休假扣抵與薪資計算。
- 驗證指令輸出摘要：
  - GitHub [Runtime Check 39271323832](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39271323832)：**success**（型別、來源契約、D1 local、Vite build）。
  - [Governance Check 39271324010](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39271324010)：**success**。
  - 既有「CY Web Deploy」workflow 於 PR 僅執行驗證，部署 job 未執行；不等於已部署。
  - `npm run typecheck`：由 CI browser／worker TypeScript 個別執行且通過。
  - `npm run validate:source`：CI source-contracts 檢查通過；未以完全相同 npm 指令單獨執行。
  - `npm run build`：CI Vite build 與型別檢查個別通過；未以完全相同 npm 指令單獨執行。
  - `npm run validate:d1:local`：CI 明確執行且通過。
  - `node --test scripts/*.test.mjs`：未完整獨立執行，canonical cyapps checkout 未取得。
- 操作驗證步驟：
  1. 使用 SUPER_ADMIN／ADMIN／USER 分別進入側欄及直接 `#hr`、呼叫 GET／POST/PATCH/DELETE HR API；確認只有 SUPER_ADMIN 可用、非超管收到 403。
  2. 用明顯虛構資料新增員工及三個子表，測員編與 memberId 唯一限制；修改主檔及舊 revision 衝突，確認不能直接改狀態或刪主檔。
  3. 新增當日／未來生效狀態與離職，確認離職日期原因必填、現況按生效日、完整異動歷史。
  4. 查看週年制特休、2/29、排除年資期間、全部年度起訖；比對法規與測試。
  5. 設定最低工資與津貼，測低於最低額拒絕、無最低工資警告可存、追加式薪資歷史及千分位金額。
  6. 確認列表與稽核皆不含完整身分證，點「顯示」後才可看原文，稽核只記遮罩值；ADMIN 稽核不含 `hr_%`。
  7. 390px 手機、桌面、設定、明細各卡及對話框由審查者依 §7 實際截圖。
  8. 取得 canonical cyapps 後執行 §6 全部 npm／Node 命令，記錄成功或具體失敗原因。

## 9. 審查紀錄（審查者填）

- （待審查）

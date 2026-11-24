# CYWEB V0.25.1 Build 3 — 人事主檔與任用異動交接

## 狀態與使用者決策

- 分支 `cyweb/hr-personnel-changes`，基準 main `ca1fe3378f4c390ff33c49ab2fc18a07f463063c`（V0.25.0 Build 1）；本輪 V0.25.1 Build 2（重新設計，見下一節）。
- Claude 最終審查：**待審**。未合併、未部署，0081 未套用正式 D1。
- 使用者撤回「改狀態判定邏輯」的建議：維持現有生效日排序。並指定一筆正式人事資料更正，另見下方私密作業界線。
- 狀態異動維持原卡片，不改全寬區塊；把狀態、門市、職稱、僱用型態、排班方式的異動塞進同一入口與卡片。
- 使用者規則（Build 2 依此重做）：一筆異動紀錄只異動一個欄位，生效日當天只改該欄位，不牽動其他欄位；同視窗改兩欄位就是兩筆同生效日紀錄；另記異動日期（寫入當天，台北日期），畫面同時顯示生效日期與異動日期。
- 建檔後五欄唯讀但不消失；薪資／狀態新增視窗一致，不重複佔一列顯示員工。
- 正式規格以 `docs/architecture/HR_MODULE_CONTRACT.md` 的 V0.25.1 段為準。

## Build 3 狀態異動勾選與冗餘紀錄（使用者 2026-11-24 核准）

- 視窗：五欄各有勾選框，沒勾鎖住並顯示目前值，勾了才可改、只送勾選欄位；至少勾一個；頁尾「會存成 N 筆異動（…）」。取代 Build 2 的「不變更（目前：…）」預設。
- 相同值：送出欄位的值等於生效日當天的值即 422 並指名欄位（不再略過）。比較的是**生效日當天**的值，不是今日值。
- 較晚紀錄變成沒有變化：後端先偵測（只計因本次存檔才變成沒有變化的同欄位、生效日較晚的紀錄），沒帶 `deleteRedundantIds`（須恰好涵蓋）或 `keepRedundant:true` 就回 409 `HR_REDUNDANT_LATER_CHANGES` 與清單。畫面顯示黃色提示與「一併刪除該筆」（預設勾選）；刪除與新增在同一 `db.batch`、同一 revision 條件，每筆刪除一則稽核（`before` 為被刪除整列）。狀態紀錄同規則；建檔那筆不計。快取狀態與離職資料依「刪除後」的紀錄投影。
- 顯示：舊值於顯示時由同欄位前一筆紀錄（或建檔基準）計算；寫入當時的值留在欄位並以 `stored_previous_*` 回傳。沒有變化的紀錄（選擇保留者）顯示「（無變化）」。`ApiErrorDetail` 新增選填 `details`。
- 沒有 migration；測試在 `scripts/hr-personnel.test.mjs`。補登期限鎖定仍在 TODO，未實作。
- 已併入 origin/main（#548 人事設定修改鍵修正）。

## Build 2 重新設計與原因

Build 1 把門市、職稱、僱用型態、排班方式四欄加在 `hr_status_changes`，而該表 `next_status` 為必填，結果每筆門市／職稱異動都被迫帶一個狀態。已重現兩個缺陷：

1. 員工 11/10 起留職停薪；之後補登 11/05 的門市異動（介面預設狀態＝目前狀態）會寫入 `next_status='leave'`、生效日 11/05 的紀錄，把留停起日默默提前。薪資以 `hr_status_changes` 的 `leave` 判斷留停（`hr-payroll-service.ts`），會連帶影響薪資。
2. 員工 11/15 離職；之後補登 11/12、狀態帶「在職」的異動，舊的快取更新會把 `hr_employees.status` 設回在職並清掉離職日，不管有沒有更晚的紀錄。

新設計：

- 0081 尚未套用正式 D1，直接改寫同檔名。`hr_status_changes` 不再被修改，只保存狀態。新增 `hr_assignment_changes`，`field` 限四個任用欄位，一欄一筆，含 `previous_value`、`next_value`、`reason`、`handled_by`、`created_at`，索引 `(employee_id, field, effective_date, id)`；僱用型態與排班方式有值檢查。
- `hr_employee_current` view 把五欄各自投影（狀態來自 `hr_status_changes`，另四欄來自新表；沒有紀錄時用建檔基準：狀態為最早一筆紀錄的 `previous_status`，其餘為主檔欄位），門市與職稱轉回 INTEGER。因此未來生效的狀態異動到日也對所有讀取者生效，不只 hr-service。
- `statusChange` 接受任意子集的五欄；每個與「生效日當天該欄位值」不同的欄位各寫一筆（狀態寫 `hr_status_changes`，`previous_status` 為生效日當天的狀態；其餘寫新表）；都沒變則拒絕。每筆各一則稽核；樂觀鎖與條件式寫入維持同一 `db.batch`。
- 僱用型態／排班方式相容性在生效日及其後每個已排定紀錄日檢查，不相容整筆拒絕。
- 快取修正：`hr_employees.status`、離職日與原因依投影結果寫入；較舊生效日的補登紀錄不覆蓋較新狀態，也不清除離職資料。排序規則本身（生效日 DESC、id DESC）未改。
- 介面：同一入口、同一卡片位置。視窗五欄（Build 3 起改為勾選才異動；沒勾的欄位鎖住顯示目前值），只送勾選的欄位。卡片合併兩表，列生效日期（待生效標記）與異動日期、「欄位：舊值 → 新值」、原因；最近三筆，超過三筆有查看全部（完整視窗另列異動日期欄）。個人自助頁沿用狀態異動，不加任用異動。
- 已知限制：未來生效的復職到日後，`hr_employees` 快取的離職日不會自動清除（讀取以 view 投影狀態為準，沒有排程）。

## 修改檔案與理由（Build 2）

| 檔案 | 行為與原因 |
| --- | --- |
| `migrations/0081_hr_personnel_assignments.sql` | 新表 `hr_assignment_changes` 與五欄獨立投影的 `hr_employee_current`；不再修改 `hr_status_changes`。 |
| `worker/hr/hr-service.ts` | `statusChange` 重寫（一欄一筆、生效日當天比對、相容性前後檢查、快取依投影）；詳情回傳 `assignmentChanges` 與各筆 `recorded_date`；清單／總覽的狀態改讀 view；有任用異動紀錄即不可刪除，刪除時一併清除。 |
| `src/runtime/modules/HrOperationalPage.tsx`、`change-log-labels.ts` | 視窗五欄「不變更」預設；卡片與完整視窗合併兩表並顯示兩個日期；稽核標籤。 |
| `worker/backup/schema-columns.ts` | 新表欄位；`hr_status_changes` 欄位回復原狀。舊備份沒有新表會還原成空表。 |
| `scripts/validate_schema.py` | 預期資料表加入新表。 |
| `scripts/hr-personnel.test.mjs` | 重寫：兩個缺陷重現、一欄一筆、未來待生效與同日兩筆、相容性（含後日衝突）、主檔拒改、薪資留停不受影響、舊 revision 與並發、備份還原（含無新表的舊備份）、刪除保護。 |

以下為 Build 1 的檔案說明，凡提到「狀態表加欄位」、「成對保存」者以上方 Build 2 為準。

## 修改檔案與理由（Build 1）

| 檔案 | 行為與原因 |
| --- | --- |
| `HrEmployeeSheet.tsx` | 人事狀態四種文字完整顯示；五個欄位僅 creating 提供編輯控制，其他個資編輯不變。 |
| `HrOperationalPage.tsx`、`hr-operational.css` | 同一卡片三欄表格、最近三筆、多項異動分行、待生效標記及查看全部。共用 EntryFields／DateInput 新增四欄，僱用／排班選項相容。兩個 Dialog 標題統一，薪資多餘員工表頭移除。手機卡片不沿用一般表格 560px 最小寬，日期不折行。 |
| `worker/hr/hr-service.ts` | 一般 profile API 拒絕變更任用四欄，UPDATE 也排除基準欄位；statusChange 記錄前後值、驗證有效設定與相容性、樂觀鎖及條件式稽核。詳情／清單／總覽用當前投影。 |
| `hr-roster-service.ts`、`hr-attendance-service.ts`、`hr-attendance-correction.ts`、`hr-leave-service.ts`、`hr-payroll-service.ts`、`hr-self-service.ts` | 需要任用資料的查詢讀同一 view；調店後的排班人員排序／檢查設定仍可寫入原主檔。未改薪資公式、既有快照或授權邊界。 |
| `worker/backup/portable-backup.ts`、`schema-columns.ts` | CURRENT_MIGRATION 0081，新欄位按名稱與排序納入備份；舊備份缺欄位使用 migration 的 null 預設，不臆造舊任用歷史。 |
| `scripts/hr-personnel.test.mjs` | 真 SQLite 的任用異動、未來生效、狀態-only 不清空、主檔拒改、調店後排班設定、薪資總覽、舊 revision、無效設定、外鍵、備份還原與主檔建立／修改控制項。僅合成資料。 |
| `scripts/test-support/hr-ui-fixture.mjs` | React 模組絕對路徑改標準 file URL，讓既有 UI 測試可在 Windows 執行；不改正式程式。 |
| `scripts/bot-decisions.test.mjs` | 首輪 CI 的唯一失敗為最新備份 migration 寫死 0080；改為從 migration 目錄獨立核對最新檔名，保留所有 BOT 備份及舊快照還原驗證，不改 BOT 正式程式。 |
| VERSION／BUILD／package、CHANGELOG、TODO、本文件、handoff index、HR_MODULE_CONTRACT | 版本、行為與待審查狀態同步。 |

## 正式資料更正（已完成；不要重跑）

- 使用者明確指定的一位員工，先核對身份與兩筆狀態紀錄並保存私人備份／還原 SQL，再把建檔紀錄改成指定在職狀態與日期，刪除指定的重複異動；主檔狀態快取同步、revision 遞增。
- 每一步用原值／revision 限定目標並驗證單筆 changes；完成後重查只剩指定建檔紀錄，原有效狀態 SQL 回傳 active。正式 audit 留有修正前後內容，不冒用任何 app member 身份。
- 個資、實際 row ID、原始記錄、連線識別值與備份皆只在 repo 外限制存取的私人 outputs 目錄；不放入公開 Git、PR、Actions、migration 或測試。公開工單不保存可辨認的員工資料。正式資料更正不是 0081 schema 部署授權。

## 驗證

- Build 2：全 Node 測試 **1013 項全過**（含重寫後 12 項人事測試）；`npm run typecheck`、`npm run validate:source`、`npm run build`、`python3 scripts/test_d1_runner.py`、`npm run validate:d1:local`（0081 與完整 migration chain、20 項 Worker／D1 acceptance）通過，`git diff --check` 通過。以下為 Build 1 時的驗證紀錄。
- 相關 Node 測試（人事主檔／介面／薪資／排班／出勤／假單／備份遷移）：**87 項通過**；新增人事測試亦包含真正的可攜備份與空白 DB 還原、外鍵核對及誤建空白員工刪除。
- `npm run validate:source` 通過。`npm run build` 通過（browser／worker TypeScript 及 Vite）；既有 bundle 大小提示仍在。
- 真正 HrOperationalPage 搭配完全合成 API 在本機瀏覽器驗證：
  - 桌機：建檔後人事狀態仍在；修改時五欄沒有可選控制，其他欄位可修改；狀態視窗有六個欄位與全寬原因，共用表格式表單。
  - 卡片保留原位置，多欄位變更完整分行；薪資與狀態 Dialog 標題一致，薪資沒有第二個「員工：」表頭。
  - 390×844：卡片三欄均可見，表格 294px／容器 294px／scrollWidth 294px，字級 12px、日期 nowrap；新增異動改為共用直排格，不新增手機資料 owner。
  - 測試結束恢復 viewport；預覽 fixture 全在忽略的 `.tmp/`，不連正式 API。
- 隔離本地 D1：0081 與完整 migration chain 通過，Worker／D1 全部 **20 項 acceptance 通過**（含 hrPayroll、portableBackupRecovery、isolatedRecovery、foreignKeys、auditAtomicBatch）。本機 Windows 程序最後清除 Miniflare 暫存時遇到 SQLite 檔案鎖，**整個命令 exit 1，不能宣稱 exit 0**；Linux PR CI 是正式整體驗收。
- 第一輪隔離驗收發現既有誤建員工刪除路徑誤指向唯讀 view，已修正為原 `hr_employees`，並加入專門測試。第二輪業務與資料驗收全部通過；本機副本只嘗試補 Windows 子程序清理，沒有更改任何業務檢查，不提交副本或其暫存。
- 最終 CI 結果以 PR 最新 head Checks 及 PR 說明為準，避免為純 CI 狀態另 push 觸發重複完整驗證。`git diff --check` 通過。
- PR #546 首輪 `df6ab0e6`／Runtime run `45213271655`：Linux 本地 D1 隔離完整驗收通過；全 Node 1005 通過、1 失敗。唯一失敗是上述 BOT 備份測試的固定 0080 版本斷言。Build 1 只同步該測試，未改正式任用或 BOT 邏輯；最終 CI 在 PR 補入。

## Claude 審查重點與部署界線

- [ ] 核對狀態的生效日／ID 排序未變，未排除建檔紀錄、未新增 GET 寫入或輪詢。
- [ ] 核對任用欄位 baseline 與五欄各自獨立投影、一筆紀錄只改一個欄位、只送改過欄位、舊只改狀態呼叫相容。
- [ ] 核對主檔唯讀的 server 保護及 revision／條件式歷程與 audit，調店後排班設定可操作。
- [ ] 注意現有排班與薪資員工來源仍採當前任用資料；本輪不新增月中任用變更的分段計薪規則，也不改已確認／已付快照。
- [ ] 核對 0081 與備份欄位一致、舊備份可還原；view 不作第二份存檔資料。
- [ ] Claude 記錄最終通過／需修正，執行者不代填。
- [ ] 使用者另行授權後才可合併、套 0081、部署；先套 migration 才能部署依賴 view 的 Worker。回退程式時可保留新增欄位與 view，不刪異動歷程。

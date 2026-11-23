# CYWEB V0.25.1 Build 1 — 人事主檔與任用異動交接

## 狀態與使用者決策

- 分支 `cyweb/hr-personnel-changes`，基準 main `ca1fe3378f4c390ff33c49ab2fc18a07f463063c`（V0.25.0 Build 1）；本輪 V0.25.1 Build 1。
- Claude 最終審查：**待審**。未合併、未部署，0081 未套用正式 D1。
- 使用者撤回「改狀態判定邏輯」的建議：維持現有生效日排序。並指定一筆正式人事資料更正，另見下方私密作業界線。
- 狀態異動維持原卡片，不改全寬區塊；把狀態、門市、職稱、僱用型態、排班方式的異動塞進同一入口與卡片。
- 建檔後五欄唯讀但不消失；薪資／狀態新增視窗一致，不重複佔一列顯示員工。
- 正式規格以 `docs/architecture/HR_MODULE_CONTRACT.md` 的 V0.25.1 段為準。

## 修改檔案與理由

| 檔案 | 行為與原因 |
| --- | --- |
| `HrEmployeeSheet.tsx` | 人事狀態四種文字完整顯示；五個欄位僅 creating 提供編輯控制，其他個資編輯不變。 |
| `HrOperationalPage.tsx`、`hr-operational.css` | 同一卡片三欄表格、最近三筆、多項異動分行、待生效標記及查看全部。共用 EntryFields／DateInput 新增四欄，僱用／排班選項相容。兩個 Dialog 標題統一，薪資多餘員工表頭移除。手機卡片不沿用一般表格 560px 最小寬，日期不折行。 |
| `0081_hr_personnel_assignments.sql` | 五個 nullable 歷程欄位與 `hr_employee_current` view；只增欄／view，不重建員工或狀態表、不改原狀態排序。 |
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
- [ ] 核對任用欄位 baseline 與分欄生效投影、僱用／排班成對保存、只送改過欄位、舊只改狀態呼叫相容。
- [ ] 核對主檔唯讀的 server 保護及 revision／條件式歷程與 audit，調店後排班設定可操作。
- [ ] 注意現有排班與薪資員工來源仍採當前任用資料；本輪不新增月中任用變更的分段計薪規則，也不改已確認／已付快照。
- [ ] 核對 0081 與備份欄位一致、舊備份可還原；view 不作第二份存檔資料。
- [ ] Claude 記錄最終通過／需修正，執行者不代填。
- [ ] 使用者另行授權後才可合併、套 0081、部署；先套 migration 才能部署依賴 view 的 Worker。回退程式時可保留新增欄位與 view，不刪異動歷程。

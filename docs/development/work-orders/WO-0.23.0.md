# WO-0.23.0 定期維護改為逐台登記完成

- 狀態：**待實作**（§9 由審查者填寫）。
- 分支：`cyweb/v0.23.0-maintenance-per-machine`（由 main V0.22.1、migration 0079 開出；本工作單已在此分支）。
- 版號：V0.23.0；migration 0080。
- 授權：使用者 2026-11-19 同意由執行者實作並合併、部署；Claude 於部署後審查（§9）。
- 開工前必讀：`PROJECT_RULES.md`、`REPO_POLICY.md`（含 §6 部署維運）；現況程式 `worker/http/store-equipment-routes.ts`、`shared/store-equipment.ts`、`src/runtime/modules/StoreMaintenanceMatrix.tsx`、`StoreEquipment.tsx`、`StoreOperationHistory.tsx`、`change-log-labels.ts`；schema `migrations/0051_store_equipment_maintenance.sql`、`0052`；測試 `scripts/store-equipment.test.mjs`。

## 1. 背景（使用者回報，2026-11-19）

- 門市／維修的定期維護以「同一客戶、同一個月」為一趟（`store_maintenance_visits`，`UNIQUE(customer_code, planned_month)`），完成狀態、實際日期、備註只有一份。
- 問題一：A 機器已登記 2025/02、2025/08 維護完成後，B 機器（同客戶）要補勾這兩個月，儲存被擋並顯示「資料已更新，或該月份已登記維護」。原因是 `planWrites()` 第一條守門：已完成的趟不能加入新機器。
- 問題二：同一個月確實分兩趟、各保養不同機器時，無法分開登記日期與備註。
- 問題三：保固期間填 2023/09/27～2024/09/27，保固月數算成 13；使用者要求算 12（迄日與起日同日也算整月）。
- 定案（使用者 2026-11-19）：「完成」改記在每台機器（出機紀錄）上；月份仍依客戶排在表格。

## 2. 已定案事項（執行者不得更改）

### 2.1 資料模型

- `store_maintenance_visits` 仍是「客戶 × 預計月份」的容器，`UNIQUE(customer_code, planned_month)` 不變。
- 完成狀態改到 `store_equipment_plans`（機器 × 月份）：新增 `completed`（0/1，預設 0）、`completion_date`（`YYYY-MM-DD`，未完成時必為 NULL）、`note`（單行，≤ `EQUIPMENT_LIMITS.note`）。實作方式（ALTER 加欄或重建表）由執行者決定，但約束必須在資料庫層：`completed IN(0,1)`、`completed=1 OR completion_date IS NULL`。
- `store_maintenance_visits.completed`、`completion_date`、`note` 改為**衍生值**，每次寫入同批更新：
  - `completed=1`：至少一筆該月的機器已完成，且沒有「啟用中、未完成」的機器。
  - `completion_date`：該月已完成機器中最晚的實際日期（供既有 `idx_maintenance_actual_month` 與排序使用）。
  - `note`：不再由使用者直接寫入，保留欄位以相容舊資料與備份。
- 已完成的機器是歷史紀錄：出機紀錄之後取消該月份或關閉定期維護時，該筆設 `active=0`，但 `completed=1` 的資料保留並繼續顯示在該月（取代原本 `retained` 的用途）；未完成的直接失效。
- 移除「已完成的趟不能加入新機器」守門。新加入的機器一律是未完成，該月因此回到「部分完成」。
- Migration 0080 回填：已完成（`completed=1`）的 visit，其 `retained=1` 或 `active=1` 的 plan 全部設為完成，日期與備註沿用 visit；之後重算衍生值。回填必須冪等、只動這兩張表。
- `retained` 欄位可保留不用或併入新語意，但 `schema-columns.ts`、可攜備份、`CURRENT_MIGRATION`、`scripts/validate_schema.py` 必須同步（屬業務資料，要備份）。

### 2.2 API

- `GET` 系列（清單、`/visits`、`/visits/:id`、`/matrix`）回傳的 `MaintenanceVisit.equipment[]` 每台多帶 `{completed, completionDate, note, active}`；visit 層多帶 `completedCount`、`totalCount`（計入啟用中機器及已完成的歷史機器）。visit 層的 `completed`、`completionDate` 為 §2.1 的衍生值。
- `PUT /visits/:id`（登記／取消）改為逐台：
  - 請求：`{expectedVersion, requestKey, action:"complete", equipmentIds:[…], completionDate, note}`，或 `{expectedVersion, requestKey, action:"undo", equipmentIds:[…]}`。
  - `complete`：`equipmentIds` 非空、不重複，且都屬於這一趟（啟用中，或已完成要改日期／備註）；日期必填、`validEquipmentDate`、不晚於今天；備註單行。同一次請求的機器共用同一日期與備註（＝同一趟）。
  - `undo`：只能取消已完成的機器；取消後若該台已不再啟用（出機已取消該月），該筆從該月消失。
  - 版本檢查、`requestKey` 冪等、`guards()`、事件與稽核照現有慣例：每次請求寫一筆 visit 事件，`before/after` 列出受影響機器（序號＋品牌型號）與日期、備註；`kind` 為「登記維護」「修改維護」「取消維護登記」。
- 出機紀錄儲存（`planWrites`）不再因已完成的月份失敗。衝突訊息不得再用「或該月份已登記維護」；只在真正的版本衝突時回「資料已更新，請重新整理後再操作」。

### 2.3 畫面

- 維護表格（`StoreMaintenanceMatrix`）：
  - 格子狀態：全部完成＝現行已完成樣式；部分完成＝新增「部分」樣式，顯示「完成數/總數」（例 `1/2`），仍算未完成（「只看未完成」篩選要列出）；未完成／逾期維持現行圖示。
  - 實際日期的參照（`date`／`moved`／`missing` 項）改依「每台的實際日期」產生：同一月分兩趟、日期不同，就出現兩個日期參照；不同預計月份同一天完成的，維持合併成一個。
- 登記視窗（點格子開啟，取代現行單一日期表單）：
  - 上方：客戶、預計年月。
  - 機器清單（`general-table`）：項次、品牌／型號、數量、狀態（未完成／已完成 日期）、備註、操作。未完成的機器前有勾選框，預設全勾；已完成的機器顯示日期與備註，操作欄有「修改」「取消登記」（取消需確認）。
  - 下方：實際日期（預設今天）、備註、「登記勾選的機器」按鈕；「修改」已完成機器時，帶入該台的日期與備註，儲存只改那一台。
  - 全部完成且沒有未完成機器時，不顯示勾選與登記按鈕。
- 出機紀錄頁（`StoreEquipment`）勾選月份：已完成的月份可以勾選加入（不再被擋）；該月份的格子提示「此月已有其他機器完成維護，加入後本機為未完成」。
- 操作紀錄（`StoreOperationHistory`、`change-log-labels.ts`）能正確顯示新的逐台事件內容。
- 樣式只用系統 token 與既有元件；寬度用 CSS class（見 PROJECT_RULES 的 UI 規範）。

### 2.4 保固月數（`shared/store-equipment.ts` `equipmentWarrantyMonths`）

- 規則：設 n 為起迄月份差；迄日 ≤ `equipmentWarrantyEnd(起日, n)` 的**隔天**時算 n 個月，否則 n+1（n < 1 時仍為 1）。也就是「迄日與起日同一天」視為剛好 n 個月。
- 例：2023-09-27～2024-09-26 → 12；2023-09-27～2024-09-27 → 12；2023-09-27～2024-09-28 → 13；2024-05-15～2024-08-15 → 3（原測試斷言 4，依使用者要求改為 3）；2024-05-15～2024-08-16 → 4；2024-01-31～2024-02-29 → 1；2024-01-31～2024-03-01 → 1（2/29 的隔天）。
- 只改月數計算；由月數推迄日（`equipmentWarrantyEnd`）維持「起日前一天」不變（2023-09-27＋12 個月 → 2024-09-26）。
- 已存資料不回寫：月數是畫面依起迄日即時計算的值。

## 3. 範圍

- Migration 0080（含回填）＋備份欄位、`CURRENT_MIGRATION`、`validate_schema`。
- `worker/http/store-equipment-routes.ts`：查詢、`planWrites`、`PUT /visits/:id`、矩陣資料、事件。
- `shared/store-equipment.ts` 型別；前端三個模組與 CSS。
- 測試：`scripts/store-equipment.test.mjs` 更新＋新增 §6 情境。
- VERSION、`package.json`、CHANGELOG（V0.23.0）、TODO。

## 4. 不做

- 不改每月待辦（`StoreMonthlyTodos`）、維修單、其他模組。
- 不允許同一客戶同月建立多筆 visit（使用者已否決此方案）。
- 不新增排程或輪詢。

## 5. 實作指引

- 衍生值重算放在同一個 `db.batch`，用一條 `UPDATE store_maintenance_visits … WHERE id IN (受影響的 visit)`，以子查詢從 plans 計算，避免讀後寫的競態。
- 矩陣查詢維持「先選客戶、再取視窗內 visit」的索引路徑；逐台實際日期若需依日期篩選，為 plans 加必要的部分索引（如 `(completion_date) WHERE completed=1`），不得退化成全表掃描。
- 前端更新後就地修改該客戶列（沿用現有 `list.setRows` 模式），並清掉該客戶的操作紀錄快取。

## 6. 驗收清單（每項要有自動測試，標 ★ 者另需截圖）

1. A 已完成 2025/02 後，B 補勾 2025/02 可儲存；該月顯示 1/2，列入「只看未完成」。★
2. 同月分兩趟：先登記 A（2/5、備註甲），再登記 B（2/20、備註乙），兩台日期與備註各自保存；矩陣出現兩個日期參照；該月變全部完成。★
3. 一次勾選 A、B 登記同一天，兩台同日期同備註，只寫一筆事件。
4. 取消 A 的登記：A 回未完成，B 不受影響，該月回到部分完成。
5. 出機紀錄取消某月：未完成的機器從該月消失；已完成的機器保留在該月歷史中。
6. 舊資料回填：既有已完成的月份，其機器全部為完成、日期與備註沿用；未完成月份不變；回填可重跑。
7. 驗證：日期晚於今天、空日期、多行備註、`equipmentIds` 含不屬於該月的機器、對未完成機器 `undo`、重複 `requestKey` 不同內容 → 4xx 並不寫入。
8. 版本衝突回「資料已更新，請重新整理後再操作」，訊息不再提及「該月份已登記維護」。
9. 可攜備份匯出／還原包含新欄位；`validate_schema` 通過。
10. §2.4 的所有例子寫進 `scripts/store-equipment.test.mjs`（修改原 `2024-05-15～2024-08-15` 斷言為 `'3'`）。
11. 桌機與手機寬度的登記視窗、部分完成格子截圖。★

## 7. 部署

- 依 `REPO_POLICY.md` §6：合併後推 `deploy/cyweb-development` 部署（migration 0080 由部署流程套用）；部署後下載完整 job log，確認沒有 Worker／D1／R2 實名、ID、帳號子網域外洩。
- 確認 `/api/health` 版本 0.23.0、`sourceCommit` 為合併 commit；以正式資料抽查一位客戶的維護表格顯示正確。

## 8. 完成報告（執行者填）

- 變更檔案、migration 回填結果（筆數）、測試數（全部／新增）、typecheck、build、截圖路徑、PR 與部署 run 連結、log 檢查結果、與本工作單不同之處及原因。

## 9. 審查紀錄（審查者填）

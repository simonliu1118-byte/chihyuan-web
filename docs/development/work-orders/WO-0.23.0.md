# WO-0.23.0 定期維護改為逐台登記完成

- 狀態：**LOCAL 預查、備份及隔離資料庫演練完成，V0.23.0 Build 1／Draft PR #535 待最終審查；正式 D1 套用及部署未授權**（§9 由審查者填寫）。
- 分支：`cyweb/v0.23.0-maintenance-per-machine`（由 main V0.22.1、migration 0079 開出；本工作單已在此分支）。
- 版號：V0.23.0；migration 0080。
- 授權沿革：原工作單記載使用者 2026-11-19 同意由執行者實作並合併／部署；**本次較新的明確指示**為「做完所有遠端能做的、寫文件、再由使用者轉交 LOCAL-CYWEB Work 處理資料庫部分」，因此本輪**不合併、不部署、不操作正式 D1**，資料庫完成及部署另待使用者及 LOCAL Work。
- LOCAL 接續授權：使用者另行授權正式 D1 唯讀預查、原生備份與隔離演練；本節所稱「不操作正式 D1」的遠端階段限制不排除此明確授權的唯讀工作。正式 SQL 寫入／migration、合併與部署仍未授權。
- 開工前必讀：`PROJECT_RULES.md`、`REPO_POLICY.md`（含 §6 部署維運）；現況程式 `worker/http/store-equipment-routes.ts`、`shared/store-equipment.ts`、`src/runtime/modules/StoreMaintenanceMatrix.tsx`、`StoreEquipment.tsx`、`StoreOperationHistory.tsx`、`change-log-labels.ts`；schema `migrations/0051_store_equipment_maintenance.sql`、`0052`；測試 `scripts/store-equipment.test.mjs`。

## 1. 背景（使用者回報，2026-11-19）

- 門市／維修的定期維護以「同一客戶、同一個月」為一趟（`store_maintenance_visits`，`UNIQUE(customer_code, planned_month)`），完成狀態、實際日期、備註只有一份。
- 問題一：A 機器已登記 2025/02、2025/08 維護完成後，B 機器（同客戶）要補勾這兩個月，儲存被擋並顯示「資料已更新，或該月份已登記維護」。原因是 `planWrites()` 第一條守門：已完成的趟不能加入新機器。
- 問題二：同一個月確實分兩趟、各保養不同機器時，無法分開登記日期與備註。
- 問題四：出機的「製造年月」只能填年月；使用者要求可填年月或年月日（2026-11-19）。
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

### 2.5 製造日期（年月或年月日）

- 欄位標題改為「製造日期」（表單、明細、操作紀錄標籤）。
- 值可為 `YYYY-MM` 或 `YYYY-MM-DD`，空白仍允許。後端驗證：年月須 `validEquipmentMonth` 且不晚於本月；年月日須 `validEquipmentDate` 且不晚於今天（台北時間）；其他格式回「製造日期不正確」。長度上限由 7 改 10。
- 沿用 `machines_json` 的 `manufacturedMonth` 鍵（不改鍵名、不需 migration；既有 `YYYY-MM` 資料不變）。型別與文件註明此鍵可含日。
- 輸入：同一格可輸入 `2024/07` 或 `2024/07/15`（也接受 `-`），失焦時正規化；提供日曆選日。現有 `DateInput` 若不支援雙精度，於該元件加選項（例 `precision="month-or-day"`），不要另寫一套日期元件。
- 顯示：年月顯示 `YYYY/MM`，年月日顯示 `YYYY/MM/DD`。
- 測試：`2024-07`、`2024-07-15` 接受；`2024-13`、`2024-02-30`、未來年月、未來日期、`2024/7/1` 以外的非法字串拒絕；舊資料讀寫不變。

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
11. §2.5 製造日期的驗證與舊資料相容寫進測試。
12. 桌機與手機寬度的登記視窗、部分完成格子截圖。★

## 7. 部署

- 依 `REPO_POLICY.md` §6：合併後推 `deploy/cyweb-development` 部署（migration 0080 由部署流程套用）；部署後下載完整 job log，確認沒有 Worker／D1／R2 實名、ID、帳號子網域外洩。
- 確認 `/api/health` 版本 0.23.0、`sourceCommit` 為合併 commit；以正式資料抽查一位客戶的維護表格顯示正確。

## 8. 遠端實作與 LOCAL Work 交接報告（GPT，2026-11-19）

### 已完成的程式來源

- GitHub [Draft PR #535](https://github.com/simonliu1118-byte/chihyuan-web/pull/535)，分支 `cyweb/v0.23.0-maintenance-per-machine`，以 main `a15f9da9488ad62c60a8b907263b3f8571499cfe`（V0.22.1／0079）為基準；工作版升至 **V0.23.0**。
- `migrations/0080_store_maintenance_per_machine.sql`：逐台維護欄位、既有完成 visit 回填、索引；**僅寫入 repo，未在正式資料庫執行，因此回填筆數未知**。
- `worker/http/store-equipment-routes.ts`：採 selected `equipmentIds` 的完成／取消 API、版本／requestKey、單批 Audit／歷史、逐台查詢與矩陣合併、同客戶月份現有完成提示；`shared/store-equipment.ts` 與 `shared/maintenance-matrix.ts` 同步型別、計算與部分完成投影。
- `src/runtime/modules/StoreMaintenanceMatrix.tsx`：共用 `EntryTable` 逐台勾選、修改、取消及 1/2 部分完成；`StoreEquipment.tsx`：加入同月完成提示及製造日期兩種精度；共用 `DateInput` 增 `precision="month-or-day"`。
- `store-equipment.css`、`StoreOperationHistory.tsx`、`change-log-labels.ts`：共用表格與事件顯示；`worker/backup/schema-columns.ts`、`portable-backup.ts`：新欄位、`CURRENT_MIGRATION=0080` 及歷史備份升級邏輯。
- `scripts/store-equipment.test.mjs`、`scripts/validate_schema.py`、`worker/acceptance/equipment-acceptance.ts` 與 `scripts/visual/wo0230-capture.mjs`：逐台維護、月數、製造日期、本地 D1、1440／390 視覺情境。
- 同分支 `CHANGELOG.md`、`TODO.md`、`VERSION`、`package.json` 已更新。

### 遠端初次交付狀態（後續以本節 LOCAL 報告為準）

- **正式 D1 migration、備份、資料量預估、真實回填筆數、完整性／還原驗證、正式站截圖與部署皆未執行**；必須由 LOCAL-CYWEB Work 依本交接文件處理，不能以合成 CI 測試結果代替。
- **舊 visit CHECK 限制：** `store_maintenance_visits` 原 schema 要求 `completed=0` 時 `completion_date IS NULL`。部分完成情境無法同時在該舊欄位保存最晚完成日。遠端先將真實日期保存在 per-machine plans，並由 GET 投影最晚日期；舊欄位部分完成時保持 NULL。**這與 §2.1 要求的實體 visit cache 尚有偏差，列為 LOCAL Work 的資料庫 schema 決策／修改與驗證項目**，不得宣稱完全驗收。
- **工程 CI 已驗證：** [Runtime Check run 44533310110](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/44533310110)：Source Contracts、Browser TypeScript、Worker TypeScript、Build（本地 D1 runtime、完整 Node suite 與 Vite build）四個 job 均 success；[Governance run 44533310483](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/44533310483) success。前一版實際 React 隔離視覺 [run 44532062580](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/44532062580) success（1440／390 六張 PNG，Actions artifact ID 14535026172），最新視覺 CI 須依 PR Actions 核對。**上述是合成／本地測試，不是正式 D1 migration 的證據；PR 仍維持 Draft。**
- `CY Web Deploy` workflow 名稱不代表已部署：本 PR 的正式部署 job 依 repo 策略 skipped；沒有執行環境變更。
- **LOCAL Work 詳細操作清單與唯讀 SQL：** [`docs/handoff/CYWEB-WO-0230-MAINTENANCE-LOCAL-20261119.md`](../../handoff/CYWEB-WO-0230-MAINTENANCE-LOCAL-20261119.md)；留待執行者補實際筆數、遷移／回復驗證、截圖與 log、更新本 §8。Claude 審查欄位 §9 仍保持待審。

### LOCAL 資料庫完成報告（GPT，2026-11-20，Build 1）

本輪使用者授權為「預查、備份與隔離演練」，**正式 D1 SQL 寫入 0；未套用 0080、未合併、未部署**。

| 項目 | 正式備份／隔離實際結果 |
| --- | --- |
| 正式基準 | 網域對應 Worker 版本 0.22.1；ledger 最新 0079，plans 尚無完成欄；實際 visit 舊 CHECK 與 0051 相符 |
| 出機／月份／關聯／事件 | 7／15／17／27，遷移後四表筆數完全相同 |
| 歷史完成 | 11 個完成月份；active 或 retained 理論回填 13 筆，隔離實際回填 13 筆；未完成的 4 筆 plan 保持未完成 |
| 無日期／孤立完成月份 | 本次正式快照皆 0；合成測試另覆蓋歷史無日期，不猜填日期 |
| 完整備份 | 原生 D1 唯讀匯出 3,654,039 bytes，雜湊私存並回讀核對；174 張表（含 migration ledger）、9,671 列 |
| 私有正式副本驗證 | 原備份還原、0080 交易回復演練、正式形狀回填、重跑回填、遷移後再匯出／還原均通過 |
| 遷移前後總列數 | 9,671 → 9,672，唯一增加為隔離 migration ledger 的 0080；其他業務表全欄逐表資料指紋相同，plans 原欄逐值相同 |
| 日期／備註／機器／歷史 | 13 筆回填日期與備註逐值符合來源月份；15 筆 visit 原值、7 筆機身 JSON 與 27 筆事件均保留 |
| 外鍵／完整性 | 預查及各隔離階段 `foreign_key_check` 均空集合，`integrity_check=ok` |
| 本機 D1 引擎 | 完整 0079→0080、3 筆合成歷史回填、遷移前後 SQL 備份各還原至獨立 D1；174 張表資料指紋完全相同、外鍵 0 異常；部分完成實體日期可寫入 |

**舊 CHECK 已在來源修正：** 0080 在單一 migration transaction 延後外鍵，暫存原 visit 列、重建原表名、再插回原 ID 與欄位，移除 visit 的「未完成必須 NULL 日期」限制，保留 plan 的該限制與所有業務關聯。從原表名插回資料可正確解除 SQLite 的 deferred FK 計數；沒有使用 `foreign_keys=OFF`、`writable_schema` 或丟棄 FK 違反計數。Worker 原批次重算現在直接保存所有已完成 plan 的最晚日期，已取消「部分完成暫存 NULL」過渡行為。

**回填與備份修正：** 回填只填 `p.completed=0` 的舊完成成員，不覆蓋已有逐台日期／備註；pending visit 原註記不因遷移被清空。DDL 仍由 migration ledger 保證只套用一次，「冪等」指資料回填 body，不能將整份 ADD COLUMN／重建 DDL 重跑。0079 可攜備份升級與 0080 部分完成備份還原均有自動測試。

**用量：** 成功唯讀查詢的 D1 `meta` 合計讀取 **24,631 列、寫入 0 列**；另完整備份實際拷貝 **9,671 列**（原生 export 未提供獨立 `rows_read` 計費數字，不把拷貝數冒充計費值）。查得帳號當日 UTC 2026-11-19 已用 205,138 讀／7,758 寫；無帳單權確認目前方案，因此保守對照 Free 5,000,000 讀／100,000 寫每日額度，遠低於上限。表總數以每批最多 25 個獨立 COUNT 查詢讀取；沒有無界重試或逐筆遠端核對。正式 migration 尚未執行；依 15 visits／17 plans／13 回填保守估算讀 ≤2,000、寫 ≤500 列（含表重建與索引餘裕），正式階段須以 D1 meta 再記錄。隔離 SQLite 量得 59 次列變更，不能視為正式 D1 DDL／索引計費量。

**還原操作注意：** 保留未改動的原始匯出；匯入工作副本採「所有表 schema 先建立，再插入資料」，且整批交易明確 `defer_foreign_keys=ON`。不照搬 dump 中的停用外鍵 pragma。此為本次隔離演練操作，沒有改動正式備份排程或產品還原 authority。

**驗證證據：** [去識別化結果摘要](../../handoff/evidence/WO-0.23.0-DB-20261120.json)；本輪本機 `npm run typecheck`、37 項設備／歷史備份測試及 `validate_schema.py`（81 份 migration、173 張產品表、12 組）通過。本機 D1 完成 24 個操作。2026-11-23 收尾再確認完整 `npm run validate:source`、`npm run build` 通過；Windows 執行使用 `PYTHONUTF8=1`。最新遠端檢查以 [PR #535 Checks](https://github.com/simonliu1118-byte/chihyuan-web/pull/535/checks) 的新提交為準，不以初次遠端交付的舊 CI 代替。

### 留待另行授權的正式階段

1. Claude 對照本輪 handoff、來源與最新 CI 審查；§9 留給審查者，不由執行者代填通過。
2. 使用者明確批准正式窗口後，重新盤點並備份；本次是快照證據，不能假定正式資料永遠不再變動。
3. 協調設備／維護寫入窗口與新版 Worker 切換。避免舊版服務在新 schema 回填後繼續只改 visit，而沒有同步逐台狀態。
4. 才可透過受控流程套用 0080、部署及正式站驗收。Migration 交易失敗可回復；整庫備份還原會影響其他模組的後續異動，必須另經授權及差異核對，不自動操作。

## 9. 審查紀錄（審查者填）

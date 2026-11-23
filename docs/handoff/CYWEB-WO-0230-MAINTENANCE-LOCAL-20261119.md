# CYWEB WO-0.23.0 — LOCAL-CYWEB Work 資料庫交接

- **交接日期**：2026-11-19
- **工單**：`docs/development/work-orders/WO-0.23.0.md`
- **PR**：https://github.com/simonliu1118-byte/chihyuan-web/pull/535（Draft，待本地資料庫階段）
- **程式分支**：`cyweb/v0.23.0-maintenance-per-machine`（V0.23.0）
- **main 基準**：`a15f9da9488ad62c60a8b907263b3f8571499cfe`（V0.22.1，migration 0079）
- **目標 migration**：`migrations/0080_store_maintenance_per_machine.sql`
- **LOCAL 更新（2026-11-20）**：V0.23.0 Build 1 的正式唯讀預查、原生備份、私有副本及本機 D1 演練已完成，結果見 §E；正式 D1 仍為 0079，未合併、未部署。
- **嚴格界線**：本遠端 GitHub 對話只寫 migration 原始碼與驗收；**尚未連線、更動或套用正式 D1**。LOCAL Work 接收此文件並不等於獲准直接合併、部署或破壞資料；執行正式操作前須再次核對使用者授權及 REPO_POLICY 部署維運守則。

## A. 為何要做

原先 `store_maintenance_visits` 是一個客戶 × 預計月份的共同完成狀態。若機器 A 已完成，當月再加入 B 會被拒絕；也無法記錄 A 在 2/5、B 在 2/20 兩次到訪。

本次保留 `UNIQUE(customer_code,planned_month)` 容器；**每台（每筆出機紀錄）× 該月份**以 `store_equipment_plans` 擁有完成狀態、實際日期與單行備註。 `store_maintenance_visits.completed/completion_date/note` 僅作相容的衍生快取；每次維護寫入和重新掛接出機都在同一筆 D1 batch 重算。

## B. 遠端程式已做範圍

- `0080`：`store_equipment_plans` 新增 `completed`、`completion_date`、`note`，回填既有已完成 visit 的所有 active/retained plans，重算 visit cache；加按實際日期／完成狀態索引。
- `worker/http/store-equipment-routes.ts`：新 `PUT /visits/:id` 的 `complete/undo`（附 equipmentIds、expectedVersion、requestKey、日期與備註）；單批版本／Audit／事件；GET visits、matrix、history；新增讀取其他機器已完成月份的提示 API。
- `shared/store-equipment.ts`、`maintenance-matrix.ts`：每台狀態、總數／完成數、部分完成與多個實際日期的矩陣投影。保固整月周年計算修正。
- `StoreMaintenanceMatrix.tsx`：共用 EntryTable 與 Field 逐台勾選、修改、取消、部分 1/2。 `StoreEquipment.tsx`：既有日期共用元件接受製造日期 YYYY-MM 或 YYYY-MM-DD，提示同月已有其他完成機器。
- `schema-columns.ts`：三欄納入可攜備份；`portable-backup.ts`：CURRENT_MIGRATION=0080，歷史備份先將已完成 visit 映射到其 plan，防止還原新 schema 後已完成資料丟失。
- `scripts/store-equipment.test.mjs`、`scripts/validate_schema.py`、本地 D1 acceptance、隔離真實 React 的 Playwright 1440 與 390 驗收。
- CHANGELOG、TODO、VERSION 與 WO 同分支更新。

## 工程 CI 與視覺證據（隔離環境，不等於正式 D1）

- [Runtime Check：成功](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/44533310110)：四項 job 全綠，包含完整 Node 測試、本地 D1 acceptance、Vite build。
- [Governance Check：成功](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/44533310483)。
- [已成功之桌機 1440／手機 390 真實 React 視覺驗收](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/44532062580)，[PNG artifact](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/44532062580/artifacts/14535026172)；是隔離示範資料，不是正式登入站。
- 以上證據適用當時的程式版本；之後若 LOCAL Work 修改 schema 或 API，須依最新 PR HEAD 重新跑全套驗證。

## C. 資料庫作業清單（本輪完成情況見 §E）

1. **先重新讀**此分支最新程式、全部共通規則、工單 §2/§6/§7，以及 `REPO_POLICY.md` 的部署授權；核對 base/main 與其他 PR，避免覆寫並行改動。
2. **預估成本／核對**：先用唯讀查詢取得 `store_maintenance_visits` 筆數、`store_equipment_plans` 筆數、已完成 visit 數、其 active 或 retained plans 數、已完成但無日期數、每月的多台重複情況；評估 0080 的掃描／更新量、D1 配額與耗時，記錄查詢結果和工作單 §8。別印出真實客戶名稱、序號等資料到公開 log。
3. **正式備份**：使用 repo 維運標準流程建立完整備份，取得可還原證據與版本號；若正式 D1 schema 或資料狀態不符工單預期（例早已有 0080 部分欄位、不同本地分支改過 visits），**停止**，不硬套 migration、不清空／重建業務表。
4. **先在本地隔離 D1 使用正式備份的去識別化副本或合成資料演練**：應用 migration 0080；確認每筆已完成 visit 的 active/retained plan 繼承完成日期／備註；未完成月不變；沒有遺失機器、月份或事件歷史。重複驗證語意冪等及 `PRAGMA foreign_key_check`。
5. **確認執行窗口與明確授權後，才對目標 D1 執行 forward migration**（不要在 PR 未合併、服務未對應新版 schema 時私自改正式站；依既有先備份／部署協調程序）。Build 1 的 0080 在單一交易暫存／重建 visit，包含 `DROP` 舊表，但原 ID、全部列與子表引用均保存並已隔離驗證；不改客戶／機器來源資料。若任何步驟失敗，停止並回報，不臨時手改正式資料。
6. **實際回填驗證**：統計 migration 前的「已完成 visit × active/retained plan」理論受影響數，與後的 `p.completed=1` 數比對；核對 `completion_date`、`note` 對應、未完成 plan 不應被改為完成、`v.completed` 衍生規則、`v.completion_date` 最晚日期、`foreign_key_check` 空集合。確認 `CURRENT_MIGRATION=0080` 與正式 migration ledger 相同。
7. **真實業務驗收**：在經授權的測試資料或受控操作中，確認 A 完成後 B 仍能加入同月並顯示 1/2；A/B 同月不同日期與備註；取消 A 不影響 B；保固月數的指定例子；製造日期兩種格式；桌機 1440、手機 390 視覺。
8. **完成報告**：將實際前後筆數、資料庫識別資訊僅存安全內部紀錄（公開 PR 不貼正式 ID）、migration/備份/回填/外鍵／驗收證據、部署 job 與 log 核對寫入本分支 handoff 與工單 §8。若 user 未授權合併／部署，只回報就緒，不代為執行。

### 可用唯讀預查 SQL（僅供 LOCAL Work 依實際 schema 校對後採用）

```sql
SELECT COUNT(*) AS plan_count FROM store_equipment_plans;
SELECT COUNT(*) AS visit_count FROM store_maintenance_visits;
SELECT COUNT(*) AS completed_visit_count FROM store_maintenance_visits WHERE completed=1;
SELECT COUNT(*) AS expected_backfill_plans
FROM store_equipment_plans p JOIN store_maintenance_visits v ON v.id=p.visit_id
WHERE v.completed=1 AND (p.active=1 OR p.retained=1);
SELECT COUNT(*) AS undated_completed_visits
FROM store_maintenance_visits WHERE completed=1 AND completion_date IS NULL;
PRAGMA foreign_key_check;
```

### migration 後只讀核對 SQL

```sql
SELECT COUNT(*) AS completed_plans FROM store_equipment_plans WHERE completed=1;
SELECT COUNT(*) AS invalid_unfinished_dates
FROM store_equipment_plans WHERE completed=0 AND completion_date IS NOT NULL;
SELECT COUNT(*) AS aggregate_status_mismatch
FROM store_maintenance_visits v WHERE v.completed <>
 CASE WHEN EXISTS(SELECT 1 FROM store_equipment_plans p WHERE p.visit_id=v.id AND p.completed=1)
  AND NOT EXISTS(SELECT 1 FROM store_equipment_plans p WHERE p.visit_id=v.id AND p.active=1 AND p.completed=0)
 THEN 1 ELSE 0 END;
PRAGMA foreign_key_check;
```

## C.1 重要：舊 Visit CHECK 與部分完成實際日期

舊 `0051_store_equipment_maintenance.sql` 對 `store_maintenance_visits` 有 `CHECK(completed=1 OR completion_date IS NULL)`。新需求同月 A 已完成、B 未完成時，`completed=0`、最晚日期非空，**無法原樣寫回此舊欄位**。

初次遠端交付曾採相容性投影；**Build 1 已移除這項過渡行為**，不再將部分完成的實體日期暫存 NULL。

- `store_equipment_plans` 逐台保存完整真實日期／備註（唯一 authority）。
- 0080 先 `defer_foreign_keys=ON`，暫存 visit 列、重建原表名、插回同一批 ID 與欄位，再建立索引；不關閉外鍵、不寫 `sqlite_schema`，也不以切換 defer OFF 丟棄違反計數。
- 不採「複製新表→刪舊表→rename」：該方式已在有子列的 SQLite 演練證實會留下 deferred FK 計數。改從原表名重新 INSERT 後，子表引用可正確解除，提交及 `foreign_key_check` 均通過。
- visit 的 completed bool、唯一客戶／月份、版本及 actor FK 保留；只移除 visit 的「completed=0 不准有日期」CHECK，plan 仍保留該 CHECK。
- Worker 的既有批次重算在部分／全部完成時都保存已完成 plan 的最大日期；實際日期索引改涵蓋非 NULL 日期。沒有新增第二套寫入流程或背景工作。

此 schema 偏差的來源修正及隔離驗證已完成；**正式套用仍未授權**。最新 CI 以 PR Checks 為準，不能把隔離完成視為正式上線。

## D. 遠端尚需 Claude 審查的風險

- `store_equipment_plans` 中 machine 的語意是「每筆出機紀錄」而非每支 serial：工作單要求保留這個既有識別方式。不要擅自拆分來源資料。
- 本次正式快照的歷史無日期完成月份為 0；其他歷史備份仍可能包含無日期紀錄，合成驗收已確認不捏造日期。
- 寫入舊版服務與新 schema 的切換順序必須審查；不得因 migration 新欄位 default 而將舊操作覆蓋成錯誤完成狀態。
- 可攜備份升級與正式 migration backfill 各有獨立資料來源，需核對歷史備份與正式資料不被二次覆蓋。
- 本文件不代表 Claude 已通過 §9，也不是正式資料庫套用授權。

## E. LOCAL 完成證據（GPT，2026-11-20，Build 1）

- 使用者本輪只授權預查、備份與隔離演練；Cloudflare 登入恢復後，從正式網域解析現行 Worker 的 DB binding，核對版本 0.22.1、實際 migration 0079、原 visit CHECK 與 plan 欄位。正式 SQL 只有 SELECT／查驗 PRAGMA，**寫入 0**。
- 正式快照：7 筆出機、15 個月份、17 筆 plan、27 筆事件；11 個完成月份，符合 active／retained 的理論回填與隔離實際回填均 **13 筆**。四張表筆數未變，原日期、備註、機身 JSON、snapshot_json 及全部事件原值保留。
- 完整 D1 原生匯出 **3,654,039 bytes／174 表／9,671 列**，原始檔與 SHA-256 僅存本機私有目錄，回讀核對通過；不用會新增 backup_sets 的 In-App 操作，以維持本輪正式 D1 不寫入的授權邊界。
- 正式備份在本機私有 SQLite 副本還原並執行 0080；驗證所有非 plans 業務表全欄資料指紋相同、plans 舊欄相同、新完成欄逐值對應、FK 空集合及 integrity=ok。隔離 migration ledger 增 1 列，總列數 **9,671→9,672**；其他表無增減。
- 已做同一資料副本的完整交易 rollback，回復原 schema 及全部原值；只重跑資料回填 body 不改任何指紋；遷移後備份再還原至另一個全新副本，全表一致、FK 空集合。
- Wrangler 4.141.0 本機 D1 合成演練也通過：完整 0079→0080、3 筆歷史回填、遷移前後匯出各還原至獨立 D1，174 表資料指紋相同、外鍵 0 異常；可寫入 completed=0 但有最晚實際日期的部分完成 cache。正式資料不進這個合成 D1 的 log。
- 原生 SQL dump 的 table 出現順序不保證 parent 在 child 前，且 SQLite 外鍵延後須有完整交易。演練的還原工作副本採「schema 全建→資料插入」及明確 `defer_foreign_keys=ON`，未停用外鍵；原始匯出不改動。產品 portable restore 仍沿既有 owner，在已建立的完整目標 schema 中以原子 batch 還原。
- 用量：成功預查的 D1 meta **24,631 讀／0 寫**，另完整匯出實際拷貝 **9,671 列**；export 沒有獨立計費 meta，不宣稱拷貝數等於計費讀取數。當日帳號 UTC 用量 205,138 讀／7,758 寫；帳單方案未授權讀取，保守以 Free 每日 5M 讀／100K 寫估算。按真實 15／17／13 筆，正式遷移預估讀 ≤2,000／寫 ≤500（含重建、索引餘裕），**仍未執行**；本機 SQLite 量到 59 次列變更，不當作遠端 D1 計費數。
- 來源修改：`0080`、Worker 批次重算、設備與備份升級測試、schema 驗證、`BUILD=1`、CHANGELOG／TODO／本 handoff／WO §8；無 UI 或其他模組變更。`VERSION` 與 package version 保持 0.23.0。
- 本機 typecheck、37 項設備／備份測試、81 migration／173 產品表／12 組 schema 驗證通過；[可公開的結果摘要](evidence/WO-0.23.0-DB-20261120.json)。最新工程 CI 見 [PR #535 Checks](https://github.com/simonliu1118-byte/chihyuan-web/pull/535/checks)，沿用初次工程 CI 不能替代本輪修正驗證。
- 2026-11-23 收尾：完整來源契約驗證與建置通過（Windows 使用 `PYTHONUTF8=1`）；新增 D1 acceptance 直接核對「部分完成」及「加入新機器後」的實體 visit 日期，不只驗證 GET 投影。公開提交前已以實際環境識別值與 OAuth 憑證比對新增文字，無命中；私有備份與資料指紋未納入 Git。
- Windows 完整 `validate:d1:local` 已輸出全部 81 migration 及 20 組 Worker＋D1 業務驗收 PASS；其後暫存目錄清理遇 `WinError 32`（Miniflare cache 的 metadata.sqlite 被子程序持有），所以該程序 exit code 為 1。這是本機 runner 清理限制，沒有把非零 exit code 記成通過；本輪 Linux Runtime CI 另驗證同一份程式。
- 程式提交 **e2c1e41e** 的 [Runtime 45100302654](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/45100302654) 全綠，Linux 本機 D1、完整 Node、Browser／Worker TypeScript、Source Contracts、Vite build 通過；[Governance 45100302599](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/45100302599)、[Visual 45100302784](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/45100302784) 與 [Deployment contract 45100302687](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/45100302687) 通過。部署及正式 audit job skipped；沒有改動線上資源。最後文件提交只補證據，不更動已驗證的 migration／runtime。
- 來源 read-back 已區分 Git LF blob 與 Windows CRLF 工作副本的 SHA-256，兩者的 LF 正規化內容完全一致。公開摘要的 `migrationSourceSha256` 為可從 Git 直接重算的值，另保留工作副本值供核對；私有 SQLite 演練讀取 SQL 時同樣將換行正規化，無 SQL 語意差異。

### 下一階段界線

1. Claude 填寫 WO §9 最終審查；本次執行者不代填通過。
2. 使用者另行批准正式 D1／部署窗口後，重做當下預查及新備份，協調舊 Worker 與新逐台 schema 的切換；回填與新版 Worker 生效之間不要由舊服務登記維護。
3. 交易失敗可 rollback；已提交後若要用整庫備份回復，會影響其他模組之後的異動，須另行授權並核對差異。本輪沒有執行這些正式操作。

# CYWEB WO-0.23.0 — LOCAL-CYWEB Work 資料庫交接

- **交接日期**：2026-11-19
- **工單**：`docs/development/work-orders/WO-0.23.0.md`
- **PR**：https://github.com/simonliu1118-byte/chihyuan-web/pull/535（Draft，待本地資料庫階段）
- **程式分支**：`cyweb/v0.23.0-maintenance-per-machine`（V0.23.0）
- **main 基準**：`a15f9da9488ad62c60a8b907263b3f8571499cfe`（V0.22.1，migration 0079）
- **目標 migration**：`migrations/0080_store_maintenance_per_machine.sql`
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

## C. LOCAL Work 必須完成的實際 D1 作業（未執行）

1. **先重新讀**此分支最新程式、全部共通規則、工單 §2/§6/§7，以及 `REPO_POLICY.md` 的部署授權；核對 base/main 與其他 PR，避免覆寫並行改動。
2. **預估成本／核對**：先用唯讀查詢取得 `store_maintenance_visits` 筆數、`store_equipment_plans` 筆數、已完成 visit 數、其 active 或 retained plans 數、已完成但無日期數、每月的多台重複情況；評估 0080 的掃描／更新量、D1 配額與耗時，記錄查詢結果和工作單 §8。別印出真實客戶名稱、序號等資料到公開 log。
3. **正式備份**：使用 repo 維運標準流程建立完整備份，取得可還原證據與版本號；若正式 D1 schema 或資料狀態不符工單預期（例早已有 0080 部分欄位、不同本地分支改過 visits），**停止**，不硬套 migration、不清空／重建業務表。
4. **先在本地隔離 D1 使用正式備份的去識別化副本或合成資料演練**：應用 migration 0080；確認每筆已完成 visit 的 active/retained plan 繼承完成日期／備註；未完成月不變；沒有遺失機器、月份或事件歷史。重複驗證語意冪等及 `PRAGMA foreign_key_check`。
5. **確認執行窗口與明確授權後，才對目標 D1 執行 forward migration**（不要在 PR 未合併、服務未對應新版 schema 時私自改正式站；依既有先備份／部署協調程序）。migration 不包含 DROP table，不改原始客戶／機器來源資料；若任何步驟失敗，先停止並交代一致性及回復策略，不臨時手改正式資料。
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

為了避免在無正式 D1 副本下冒然拆表，本遠端程式先採**相容性投影**：

- `store_equipment_plans` 逐台保存完整真實日期／備註（唯一 authority）。
- `store_maintenance_visits` 在「部分完成」時將舊 `completion_date` 暫存 NULL，以通過既有 CHECK；完全完成時才寫最晚日期。
- `GET /visits`、`/matrix` 從逐台資料計算並**對外顯示真正最晚已完成日期**，不捏造日期，仍可顯示部分完成 1/2 及兩個日期參照。
- 因此與 WO §2.1「visit 資料庫實體欄位也應持有部分完成時的最晚日期」存在已知偏差；**LOCAL-CYWEB Work 必須評估在隔離 D1 重建 visit 舊 CHECK 的安全性／資料引用外鍵／回滾方法**，或提出適合現有 schema 的等效安全方案，經確認再補實作。不可用 `PRAGMA writable_schema` 直接偷改正式 sqlite_schema，更不可強關外鍵後無驗證直接 DROP。

這是資料庫階段尚未完成的**實際阻塞項**，不得把此部分的工程驗收視為符合工單全部要求。完成後仍須重跑 local D1、備份還原及 PR CI，並更新工單 §8。

## D. 遠端尚需 Claude 審查的風險

- `store_equipment_plans` 中 machine 的語意是「每筆出機紀錄」而非每支 serial：工作單要求保留這個既有識別方式。不要擅自拆分來源資料。
- 多筆已完成訪視包含空 completion_date 的歷史資料，**不要捏造日期**；須照實保留，再在業務介面由人員補正。
- 寫入舊版服務與新 schema 的切換順序必須審查；不得因 migration 新欄位 default 而將舊操作覆蓋成錯誤完成狀態。
- 可攜備份升級與正式 migration backfill 各有獨立資料來源，需核對歷史備份與正式資料不被二次覆蓋。
- 本文件不代表 Claude 已通過 §9，也不是正式資料庫套用授權。

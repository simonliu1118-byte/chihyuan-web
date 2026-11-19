# CYWEB WO-0.23.0｜逐台維護完成 — 遠端程式交接與 LOCAL-CYWEB 資料庫工作單

- 日期：2026-11-19。
- Repo：`simonliu1118-byte/chihyuan-web`。
- 分支：`cyweb/v0.23.0-maintenance-per-machine`，版本 V0.23.0。
- [Draft PR #535](https://github.com/simonliu1118-byte/chihyuan-web/pull/535)；基準 main `a15f9da9488ad62c60a8b907263b3f8571499cfe`，V0.22.1，migration 0079。
- 需求：`docs/development/work-orders/WO-0.23.0.md`，完整回報在該工單 §8。
- **程式端可提交 migration 與單元驗收，但本對話沒有直接讀取／操作正式 D1 的授權與環境。未合併、未部署、未在正式環境執行 0080。**
- **使用者現行指示：完成所有可遠端實作的工作，資料庫部分由使用者轉交 LOCAL-CYWEB Work 處理。此指示優先於工單舊的自動合併／部署文字。**

## 一、已在本分支實作

1. `migrations/0080_store_maintenance_per_machine.sql`：`store_equipment_plans` 新增 `completed`、`completion_date`、`note`，資料庫 CHECK、依舊 visit 回填（只回填 `retained=1 OR active=1` 且 visit 完成的機器）、visit 衍生重算及針對實際日期、visit 狀態的索引。僅動 `store_equipment_plans`／`store_maintenance_visits`。
2. `worker/http/store-equipment-routes.ts`：`PUT /visits/:id` 改按選取的 equipment IDs `complete`／`undo`，每次寫入一筆事件及 Audit；更新整個 `db.batch` 中的 visit 衍生狀態，維持 requestKey 冪等、revision 409 與現有 STORE_REPAIRS 權限；已完成機器歷史保留，新機器可加入既完成的月份變部分完成。
3. `GET /visits`、`/visits/:id`、`/matrix` 回傳逐台 `{completed,completionDate,note,active}` 以及 visit `completedCount/totalCount`；實際日期的候選查詢與分頁用 plan 層索引；月度矩陣維持每客戶每月一 visit。
4. `shared/store-equipment.ts`、`shared/maintenance-matrix.ts`：逐台型別、部分完成及跨月／同日群組、保固月數「周年當天仍算當月」例外（`equipmentWarrantyEnd` 原規則不變）。
5. `StoreMaintenanceMatrix.tsx`：部分完成 `1/2` 標籤、按機器勾選／修改／取消，現有共用 `EntryTable`／`Field`／`StoreMilestoneDateFields`、單筆記錄本地更新與歷史快取清理。
6. `StoreEquipment.tsx`、共用 `DateInput.tsx`、`store-equipment.css`：製造日期 YYYY-MM 或 YYYY-MM-DD，原 JSON 鍵 `manufacturedMonth` 不更名；出機月份選擇提示已完成的其他機器，手機共用樣式。
7. `StoreOperationHistory.tsx`、`change-log-labels.ts`：逐台維護事件易讀日期／備註，製造日期中文名稱。
8. `worker/backup/schema-columns.ts`、`portable-backup.ts`：新欄位加入可攜備份，`CURRENT_MIGRATION = "0080_store_maintenance_per_machine"`；舊版備份在 `UPGRADES` 最後依 visit 對 plan 補齊狀態、日期、備註。
9. `scripts/store-equipment.test.mjs`、`worker/acceptance/equipment-acceptance.ts`、`scripts/validate_schema.py`：逐台單筆／多筆、雙日期、撤銷、效期、requestKey、version、舊資料回填與歷史備份驗收。
10. `scripts/visual/wo0230.*` 與 `.github/workflows/wo-0230-visual.yml`：隔離 mock API 使用真實 React 元件的 1440×900／390×844 視覺驗收，用來檢查部分完成、逐台登記及製造日期；**截圖不是正式站登入實機**。

## 二、LOCAL-CYWEB Work 必須執行的資料庫工作

**開始前**：核對 PR #535 最新 SHA 與正式主線最新版本，避免使用舊 migration；先完成獨立審核，不在未確認資料狀態時直接套用。

### 1. 正式 D1 只讀預查，回報數量和預估 D1 讀寫量

以下 SQL 為示意，請在本機已授權的 Cloudflare／Wrangler 環境中執行，不將 D1 ID、Cloudflare Token、客戶內容或任何個資貼入公開 repo／Actions log：

```sql
SELECT COUNT(*) AS visits_total,
       SUM(CASE WHEN completed=1 THEN 1 ELSE 0 END) AS visits_completed
FROM store_maintenance_visits;
SELECT COUNT(*) AS plans_total,
       SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) AS plans_active,
       SUM(CASE WHEN retained=1 THEN 1 ELSE 0 END) AS plans_retained
FROM store_equipment_plans;
SELECT COUNT(*) AS backfill_candidates
FROM store_equipment_plans p JOIN store_maintenance_visits v ON v.id=p.visit_id
WHERE v.completed=1 AND (p.active=1 OR p.retained=1);
SELECT COUNT(*) AS completed_visits_without_plans
FROM store_maintenance_visits v WHERE v.completed=1
  AND NOT EXISTS (
    SELECT 1 FROM store_equipment_plans p WHERE p.visit_id=v.id
      AND (p.active=1 OR p.retained=1)
  );
PRAGMA foreign_key_check;
```

說明：`completed_visits_without_plans` 若非 0，不能假裝 migration 能回填成原本完成；應先分析與使用者確認歷史處理方式。把其他異常（重複機器計畫、已完成但無日期、計畫未連結等）以**統計數**呈現，別輸出客戶資料。

**成本預估**：以 `P=plans_total`、`V=visits_total`、`B=backfill_candidates` 記錄。migration 涉及一次 plans UPDATE（至多 B 筆）、一次 visits UPDATE（至多 V 筆）及兩次 plans 索引建構（掃描資料表）；關聯查詢另有讀取，精確 D1 read/write 計數須以當下 Cloudflare 計量為準；正式套用前提出合理上限和可接受的查詢成本，避免無預估大量操作。

### 2. 備份與演練

- 在正式 D1 套用前，使用 repo 既有正式備份流程製作完整可還原副本；確認備份成功、版本正確、檔案可讀及保管位置（不得貼出私密路徑／憑證）。
- 於本地／隔離 D1 複製環境重播 migration 0080 並執行 `PRAGMA foreign_key_check`；對既有完成與未完成的機器數量、日期與備註做**數量核對**，使用無個資樣本驗證前端。
- `0080` 使用 `ALTER TABLE` 追加欄位，**正式 migration 不能在已套用後手動重跑整個檔案**。工單「冪等」指歷史回填 UPDATE 的資料結果重跑一致，不是允許重複 ALTER。若已部分套用，先查 `PRAGMA table_info` 與 migration 追蹤表，不可盲目重試。
- LOCAL 工作在收到使用者授權前不合併 PR／不部署正式站；migration 與新版 Worker 是同一相容性邊界，須安排經核准且一致的切換流程，不能新欄位尚未存在就讓新版 Worker 上線。

### 3. 獲准切換後之驗證

- 記錄變更前後 `plans_total`、新完成數、逐台日期／備註回填數及 visit 衍生 `completed`／`completion_date` 與實際 plans 的差異數（應為 0），確認無失蹤 plan、負面 FK 或原備註遺失。
- 驗證同一客戶同月份 A 完成、B 加入顯示 1/2；B 可獨立日期／備註完成；撤銷 A 後 B 不受影響。僅用已獲准的合成測試資料或本人授權的樣本。
- 以桌機 1440 與手機 390 真實登入環境擷取驗收截圖（不要公開客戶資料）；檢查操作事件、版本衝突與畫面日期格式。
- 確認正式部署健康檢查的版本 V0.23.0、source commit 與 migration 0080 一致，再交給 Claude §9 審查。沒有使用者核准不得進行合併／部署。
- 寫入實際備份驗證、費用前估／實測與已完成筆數到同一分支的 handoff／工單 §8，**不要直接更改 main**。

## 三、程式端尚待項目／審查重點

- 主要 SQL、Worker、React、共用日期、歷史與本地測試均已提交；最新 CI 與視覺證據以 PR #535 Actions 為準，**在全部綠燈以前不得宣稱驗收完成**。
- LOCAL Work 須確認真正正式 D1 的列數、稅改無關的其他模組不受影響、0080 回填、資料備份及還原演練、部署順序；這些不能用合成資料 CI 取代。
- 若正式 D1 實況顯示已完成的 visit 沒有可回填計畫，應停下來補規劃，不可自行造假歷史維護日或硬寫新狀態。

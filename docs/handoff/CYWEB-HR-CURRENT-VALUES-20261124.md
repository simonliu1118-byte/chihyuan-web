# CYWEB V0.29.0 Build 1 — 人事目前值交接

## 狀態與使用者決策（2026-11-24）

- 分支 `cyweb/v0.29.0-hr-current-values`，基於 origin/main（V0.28.0）。有 migration `0083_hr_current_values.sql`；`CURRENT_MIGRATION` 為 `0083_hr_current_values`，備份欄位不變。未開 PR、未合併、未部署、未碰任何遠端／正式 D1。
- 使用者要求：一個員工的每個人事欄位只能有一個目前值；`hr_employees` 欄位永遠存今日值；建檔值也是紀錄；未來生效的紀錄由每日排程推進；不得新增 cron trigger。

## 修改檔案與理由

| 檔案 | 行為與原因 |
| --- | --- |
| `migrations/0083_hr_current_values.sql`（新） | 補建檔紀錄、校正主檔、重建 view；不動既有紀錄。 |
| `worker/hr/hr-current-values.ts`（新） | 投影 SQL（日期以參數綁定）與 `rollHrCurrentValues`：找出主檔欄位與投影不同的員工，每批 ≤ 100，revision 守門，系統身分，每人一筆稽核。 |
| `worker/hr/hr-service.ts` | 建檔多寫四筆任用建檔紀錄；`statusChange` 在同一 batch 設定受影響欄位；起始值改取該欄位最早紀錄（不再讀主檔）；離職資料清除規則；可刪除判斷排除建檔紀錄。 |
| `shared/cyweb-cron.ts`、`worker/index.ts` | 任務 `hrCurrentValues`（UTC 16:00、16:30），掛在既有 `scheduled`，與其他任務各自獨立。 |
| `worker/backup/portable-backup.ts` | `CURRENT_MIGRATION` 0083；0083 之前的備份還原時套同一規則（補建檔紀錄、主檔校正為還原當天投影）。 |
| `src/runtime/modules/HrOperationalPage.tsx` | 沒有舊值的紀錄（建檔）只顯示值，不顯示「— → 值」。 |
| 測試 | 新 `scripts/hr-current-values.test.mjs`；調整 `hr-personnel.test.mjs`（夾具帶建檔紀錄）、`erp-housekeeping.test.mjs`（cron 對應）。 |
| 文件 | `HR_MODULE_CONTRACT.md`、CHANGELOG、TODO、handoff README、VERSION、package.json。 |

## Migration 0083 對既有資料的行為

1. 四個任用欄位各自：員工在到職日（含）以前沒有該欄位任何紀錄、且主檔欄位不是 NULL → 補一筆（`effective_date` = 到職日，到職日為空用 `created_at` 的台北日期；`previous_value` NULL；`next_value` = 主檔欄位；原因「建檔」；`handled_by` = `created_by`；`created_at` = 員工 `created_at`）。
2. 完全沒有狀態紀錄的員工補一筆建檔狀態（前後狀態都是主檔狀態，原因「建檔」，生效日同上）。
3. 主檔五欄設為台北今日投影；離職日期與原因：今日狀態不是離職且沒有尚未生效的離職紀錄 → 清空。不改 `revision`、`updated_*`。
4. 重建 `hr_employee_current`：無今日以前紀錄時，改用該欄位最早紀錄的起始值，最後才退回主檔欄位。
5. 全部 INSERT 有 NOT EXISTS 條件、`DROP VIEW IF EXISTS`，重跑不重複；不刪除、不修改既有紀錄。

## 實作時的取捨（請確認）

1. 主檔欄位為 NULL 的門市／職稱無法成為紀錄（`next_value` 必須是數字），維持沒有紀錄。
2. 到職日當天（含）以前已有該欄位紀錄者，不補建檔（依指示）；其起始值由最早一筆的 `previous_value` 提供。
3. 排程時 `updated_by` 為 NULL、稽核 `actor_employee_id` 為 NULL（與備份排程同一系統身分慣例）；`revision` 與 `updated_at`（排程時間）會更新，所以編輯畫面中舊的 revision 會收到 409 並請使用者重新整理。
4. 離職日期與原因：未來離職先存在主檔等待生效（沿用既有規則）；新增統一規則「今日狀態不是離職、且沒有尚未生效的離職紀錄」就清空，用於 `statusChange`、排程與 migration。
5. `hr_employee_current` 仍以真實時鐘的台北今日計算；排程的投影日期取排程時間，因此測試以固定 `scheduledTime` 驗證主檔欄位。
6. 倒填到到職日之前的紀錄：其前一值取該欄位最早紀錄的起始值；此時建檔紀錄不會被視為「沒有變化」而刪除，除非值真的相同（沿用狀態的規則）。
7. 備份升級以還原當天（台北）為投影日期。

## 驗證

- 全 Node 測試、`npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local`（Worker 與 D1 acceptance 皆 PASS、無 `__d1_acceptance 500`）、`git diff --check`；結果見交付回報。

## Claude 審查

審查結論（Claude，2026-11-24）：通過。已核對 0083 只新增建檔紀錄並校正主檔欄位、不刪改既有紀錄、INSERT 皆有 NOT EXISTS；排程沿用單一 `*/5` cron 的台灣 00:00／00:30 時段；狀態異動在同一 batch 與 revision 守門下更新主檔；八項實作取捨皆接受。部署前正式 D1 預查：任用異動 0 筆、每位員工皆有狀態紀錄與到職日。使用者授權審查通過即合併部署。

- [x] 核對 migration 0083 對既有資料的行為（建檔條件、不碰既有紀錄、投影、離職資料、view 重建、可重跑）。
- [x] 核對建檔與 `statusChange` 在同一 batch、同一 revision 守門下設定受影響欄位，含冗餘紀錄刪除路徑。
- [x] 核對 `hrCurrentValues`：只用既有 `*/5` 排程、00:00 與 00:30、獨立失敗、批次上限、revision 守門、系統身分、每人一筆稽核、重跑無變更。
- [x] 核對舊備份（0082 以前）還原後有建檔紀錄且主檔與投影一致。
- [x] 核對狀態異動卡與完整清單的建檔列（無箭頭）、「（無變化）」與舊值推算。
- [x] 確認上列「實作時的取捨」。

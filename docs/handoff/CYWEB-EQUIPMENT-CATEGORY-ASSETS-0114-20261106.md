# CY Web V0.11.4 出機與維護操作交接

- 日期：2026-11-06；執行 GPT；基準：main @ dc47572026749f4dd4d942064d44598e64aa6c94。
- 工作分支：cyweb/equipment-category-assets-matrix-popover；PR #437 於 2026-11-06 合併 main（1e6b1436），尚待正式部署。Claude 事後複審未執行；不代填通過。
- 使用者確認：出機「品牌／類別／機型」，類別與門市維修同源，選其他有至少五中文字寬自填；預計維護年月標題及月份黑字；機身加財產編號與單獨補填操作；主清單縮窄品牌機型並顯示預計維護，展開保留項次及三個機身欄位且適當窄；矩陣上一年／下一年改左右箭頭、載入圈在搜尋旁不推動表格、維護日期編輯改門市訂購式格內浮動視窗。

## 修改檔案及行為

- `shared/store-equipment.ts`：擴充 category、categoryOther、assetNumber 的共用資料契約與限制。
- `worker/http/store-equipment-routes.ts`：讀寫 category/other；舊機身資產號缺值正規化；新增 `PATCH /:id/assets` 獨立補填（不調用排程變更流程）、原版本、requestKey、事件與 Audit；類別其他驗證。
- `migrations/0053_store_equipment_category.sql`：出機主檔兩個字串欄位，預設空值；既有資料與機身 JSON 不重寫。
- `worker/backup/portable-backup.ts`、`schema-columns.ts`：正式 forward migration 與 portable 欄位契約同步。
- `src/runtime/modules/StoreEquipment.tsx`、`store-equipment.css`：表單類別／其他自填／資產編號、主清單、精簡四欄展開、黑字與獨立補填視窗。
- `src/runtime/modules/StoreMaintenanceMatrix.tsx`：格內浮窗、年切換箭頭、載入狀態移至搜尋工具列；`src/ui/actions/icons.tsx` 在共用圖示加入財產標籤圖示。
- `scripts/store-equipment.test.mjs`：新增主要 API 行為的測試，確認自訂類別、資產號補填、既有資料保留、過期版本拒絕及非法類別拒絕。
- `VERSION`、`package.json`、`CHANGELOG.md`、`TODO.md`、架構契約與 handoff 更新為 V0.11.4。

## 主要風險及驗收

- 新增 migration 需正式發布時依原本受控流程套用；這次 PR 不部署、不碰正式 D1。
- 舊出機記錄可保留空白類別；舊 machines_json 缺財產編號讀取為空值，只有使用者修改才保存新欄位。
- 補填財產編號只更新該筆出機資料及歷程，不改 planWrites、維護日期或已完成到訪快照。
- PR #437 第一輪：Runtime #42169407163 的 654 項 Node 測試中 653 通過、1 失敗，原因是舊備份測試寫死預期 migration 0052，而本版已新增 migration 0053；修正測試期望為 0053，原資料與功能路徑無需變動。
- PR #437 第二輪（head `2066fb6c9ec871e247e119cc3a3922a10711a522`）：[Runtime Check #42169639226](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42169639226) **success**（browser-typecheck、worker-typecheck、source-contracts、Local D1 runtime acceptance、**654/654 Node 測試**、Vite build 均成功）；[Governance #42169639239](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42169639239) **success**；[部署契約 #42169639270](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42169639270) **success**。
- 這三項皆為 PR 驗證：正式 deploy-development、audit-backup、audit-identity jobs skipped，**未部署正式站**。
- 待使用者實機目視：其他類別中文字寬、主清單與四欄展開、財產號補填、手機橫向捲動、維護月份浮窗的定位與編輯、載入不跳動。
- Claude 最終審查：**待審查**，請審核 migration／backup、後端更新 scope、權限／版本與畫面；審查結論由 Claude 本人寫回。

## 2026-11-06 合併發布指示與審查狀態

- 使用者當次明確授權「可以合併部署，並確認 PR438」；本 PR #437 與獨立 ERP Session PR #439 納入本次發布範圍；PR #438 只核對、不納入。
- 尚無 Claude 最終審查紀錄；**不可把 CI 成功視為 Claude 通過**。使用者本次要求先合併發布，這項偏離既定 Claude 先審查流程必須在追蹤紀錄中保留，Claude 事後複審仍待辦。
- 正式部署必須在 #437 及整合後 #439 均合併且 main CI／部署契約核對後，以 main 的 workflow_dispatch operation=deploy-development 執行。PR 自動 workflow 的成功不是正式部署證據。
- #438 與 #437 均佔用 0053 migration 序號，**PR #438 不得直接接著合併**；後續開發者必須依實際 main schema 重新編排 BOT 管理中心 migration、CURRENT_MIGRATION、測試與備份契約。
- PR #437 最後 head `cf4d431fb442fdc97d9c3443b87dba2389c30b87`：Runtime #42174301833 成功（654/654），Governance #42174301760 成功，部署契約 #42174301778 成功；合併 SHA `1e6b1436d3cb32d5c2df67c78d2bf3756f3a4795`，尚未觸發正式部署。

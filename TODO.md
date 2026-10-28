## 目前狀態（2026-10-28）

- **正式部署 V0.9.47 Build 0**（2026-10-28）：正式入口回 0.9.47、database ok；遠端 D1 到 migration 0029。CYID consumer 1.0.5。
- 架構：單一 React → protected Worker API → D1；帳號、Session、系統使用權由 CYID 管理，CY Web 只管模組權限（Module Access）與業務授權。
- 模組：客戶、商品、瑕疵、銷售工單、叫貨、門市（顧客訂購與黑名單）、委外/代工、工作日誌、人事（目前僅超級管理員）、ERP 查詢（商品／客戶／供應商／進貨輔助／未收款，排程佇列為右側欄）、帳號與權限、異動紀錄、備份管理、CY 程式、我的帳號。
- ERP 查詢需公司電腦上的 CYERPAutoQuery：正式版 **V1.2.0**（2026-10-28 發布，tag `cyerp-auto-query-v1.2.0`）；自動開啟 ERP、報表匯出、進貨輔助、立即關閉與關閉 15 分鐘已實機確認。
- 備份：手動 R2＋GCS 雙副本與 GCS 隔離還原已通過；可攜備份上限 100,000 列／24 MB，叫貨資料已納入。**自動備份排程未啟用**（使用者決定上線前再開，見下方）。

## 待使用者實機確認

2026-10-28 使用者已回報 ERP 查詢、暫停與關閉、進貨輔助耗時與合法資料查詢、登入／分頁、叫貨、V0.9.0–0.9.18 介面、中央系統登記、CY 程式、共用 UI、Email 與一般 Backup 操作 OK；逐項驗收歷史見 `CHANGELOG.md`。以下僅保留尚未確認或已發現異常的項目。

- [ ] **門市顧客訂購**（V0.9.45）：新增訂購、狀態流轉、通知逾 7 天標示、取消轉黑名單、黑名單兩種處置；再決定要不要列印取貨單或通知範本。
- [ ] **表單**（V0.9.35）：客戶拜訪紀錄／常用商品、HR 津貼、身分頁對話框、叫貨來源選單、進貨輔助加入叫貨單。

### 統一人工驗收清單

使用者安排在自動驗收後集中操作及調整；以下須實際觀察，不以自動檢查代替。

| 範圍 | 人工確認 | 前提與保留界線 |
| --- | --- | --- |
| 核心帳號 / CYID | 登入/登出、Session 逾期/撤銷、self-service、返回登入 | 既有受控帳號；不自行新增帳號或授權 |
| Role / Module Access | USER/ADMIN/Identity Admin/SUPER_ADMIN 畫面、撤權/恢復/角色變更 | 受控帳號，不執行未指定的 live 權限變更 |
| CY 程式 | 無 Module Access 仍可看清單；版本／日期／ICON、網頁入口及 ZIP 下載；三個尚未發版項目無下載 | 既有登入帳號；外部 App 自行處理登入權限，未發版項目待正式公開 Release 才補入口 |
| Customer | 建立/編輯/搜尋、Contact/Visit snapshot/日期、Frequent Item、Quote 新歷史/更正/Audit | 保留既有 synthetic fixtures；正式 Item/Quote 需合法 ERP 品項 |
| Item / Defect | 正式欄位、單位/價格精度、Defect 狀態與管理操作 | 合法 ERP 參考，不捏造 live 正式 Item |
| Sales Order | Draft、ERP fill/correction、waiting/picking/shipping/reversal/void、權限提示 | 合法 ERP 參考與受控 synthetic workflow |
| Outsourcing | Contractor/BOM、outbound/receipt/pricing/payment 及反轉、stock/Audit readback | 受控 synthetic workflow，不異動真實庫存/付款 |
| WorkLog | owner CRUD/submit/withdraw、ADMIN review/cancel-review、statistics/readback | 受控 synthetic workflow 與既有帳號 |
| Settings / Audit | 編輯 settings、唯讀 Audit search、actor/reason | 既有權限，不改 production settings |
| 電腦 / 平板 / 手機 | 密度、導覽、表單、捲動、選取、錯誤/載入、觸控/鍵盤 | 真實裝置，調整需求回寫同一 TODO |
| Email | 驗證、重寄／逾期、密碼 recovery 與實際收信 | 使用者 2026-10-28 回報 OK；不再列為本輪待驗收 |
| Backup / recovery | R2／GCS 手動備份與紀錄、隔離還原、排程 | 使用者 2026-10-28 回報一般 Backup OK；**隔離還原仍失敗待診斷**，排程仍未啟用；不得據此視為整體復原驗收完成或操作正式還原 |
| 清理 / 上線 | 核對 fixture/account 清單、受控清理與 first-release gates | 驗收後確認，不自動刪除或 production cutover |


## 2026-10-28 隔離還原異常（待唯讀查證）

- [ ] 使用者於備份管理點「驗證隔離還原」出現「隔離還原未完成；請先更新紀錄，不要直接重送」，按「更新紀錄」仍看不到驗證結果。截圖顯示 2026/10/28 15:43 手動備份 1,126 筆／245.1 KB，但**不可由截圖推定所選來源或隔離資料庫是否已寫入**。
- [ ] 確認失敗階段與目標：唯讀核對正式 `RECOVERY_DB` 綁定、與主 D1 分離、目標的 schema／migration 到 0029 與否及是否已使用；查對應時間的 Worker requestId／Invocation Logs、`backup.rehearsal.started/verified/failed` Audit 與 `pre_restore` 安全備份紀錄。**不得自動重試、重建／清空已使用的隔離目標、切換綁定或異動正式資料**。
- [ ] 程式／部署證據：`worker/http/backup-routes.ts` 把未列入白名單的失敗都回 `BACKUP_RECOVERY_UNAVAILABLE`／通用中文訊息；`loadBackupHistory` 只列 `backup_sets`／`backup_copies`，沒有隔離還原結果，因此「更新紀錄」不會顯示演練狀態。[V0.9.45 部署 #40629706921](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40629706921) 已先回報 `RECOVERY_USED_TARGET_PRESERVED`，同一執行後續只將 `0029_store_customer_orders.sql` 套用到**主 D1**；[V0.9.47 部署 #40636481484](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40636481484) 再次回報 `RECOVERY_USED_TARGET_PRESERVED`。因此可確認這兩次部署均**跳過隔離目標的 migration**，強烈支持其 schema 落後於主 D1 的假設（仍須唯讀讀回目標確認）。`scripts/provision-backup-recovery.mjs` 用所有業務表的 `EXISTS` 判定已使用，可能把 Migration 自帶的 HR 基本資料誤認為還原完成；此判斷缺陷由程式碼可確認。**目標實際版本尚未核實**；若仍停在 0029 之前，`BACKUP_TABLE_COVERAGE_MISMATCH` 可能被通用訊息遮蔽，不能直接斷定就是本次根因。
- [ ] 後續修正須提供不洩漏正式資料的階段／錯誤代碼、可查詢的隔離驗證紀錄，並保持空白目標與雙重確認等復原安全界線；待授權、驗證後另行部署與實機驗收。

## 開發待辦

- [ ] **ERP 查詢完成通知位置**：目前共用 Toast 在桌面顯示於右上角；依使用者 2026-10-28 指示，**ERP 查詢完成通知**要改為畫面右下角。實作時先確認是否影響其他共用通知，避免未授權地把全部 Toast 位置一起改掉。
- [ ] **顧客訂購與叫貨連動**（使用者 2026-10-28 列待辦）：訂購品項一鍵加入指定叫貨來源的草稿，該叫貨單到貨時對應的顧客訂購自動改為「到貨」；先確認來源怎麼選（依品號上次來源或手動）、部分到貨怎麼算、一張叫貨單對多筆顧客訂購的對應方式。
- [ ] **銷貨分析頁**（用 `erp_sales_daily`），規格待使用者確認。
- [ ] **使用說明**：所有模組完成後，右上角加「使用說明」按鈕（排在外觀切換左邊），顯示目前頁面的教學並可切換其他模組；頁標題旁的 ⓘ 說明併入。教學內容等模組全部完成後一次撰寫。
- [ ] 手機三欄表格＋點列開完整表單：待定稿，目前維持窄版表格捲動。
- [ ] 各表單分區細節由使用者逐一調整（使用者 2026-10-21）。
- [ ] 網頁標準視覺規範（`docs/architecture/CY_WEB_VISUAL_GUIDE.md`）經使用者確認後升格到 AITeam（使用者 2026-10-18：另開對話處理）。
- [ ] 人事：
  - 部分工時特休比例公式、請假一天的時數換算，待每月法規檢查確認條文（目前：全時每週 40 小時為分母、1 天＝8 小時）；
  - 國定假日補休目前由超管手動給予，若要依排班自動產生另行確認規則；
  - 人事附檔的備份另案處理；
  - 使用者測試發現的問題記在這裡，下一輪一起修。
- [ ] 共用 UI 整理方向：navigation、清單密度、表單／明細、dialog／drawer、loading／error／empty、鍵盤與觸控；刪除、權限、金額與庫存等高風險操作不先顯示成功。使用者提出的小功能先記需求與驗收條件再開工作項目。

## CYInvoice 復原接線（2026-10-18 起）

- [ ] 新 CYWEB PR 的最新 head Governance／Runtime Check／Build 與自動測試、Desktop／Mobile 真實 UI 操作驗收。
- [ ] CYInvoice PR #476 在原 D1 完成備份＋回復演練與 schema 0014／0015、Issuer gate 維護配置、Worker feature flag 後，再唯讀核對真 Session／Email／Binding／原 D1 配置，將 CYWEB `CF_CYINVOICE_RECOVERY_SERVICE` 接到正確命名入口並依具體授權受控部署、真 Email／雙 Windows／DR-01～13；另確認撤銷裝置在途 Work Item fencing、跨 repo 同版位契約及變更密碼／移交後的查回。

## 上線前

- [ ] **啟用自動備份排程**（使用者 2026-10-18 要求其他測試完成前先維持 `CF_BACKUP_SCHEDULE_ENABLED=false`；整體功能測試完成、準備上線前提醒使用者）：
  - 將 GitHub `development` Environment 的 `CF_BACKUP_SCHEDULE_ENABLED` 改為 `true`，保留既有 Worker／主 D1／Identity／R2／GCS 與已使用的隔離驗證副本，從當前 main 受控部署（GitHub 變數寫入 API 目前 403，須由有權限的設定介面操作）；
  - 部署後核對 UTC `30 19 * * *`（台灣每日 03:30）與獨立 catalog `0 19 * * *`；R2 每日保留 30 天、GCS 台灣週三／週日保留 182 天，manual／pre_restore 雙副本；
  - 觀察第一筆真實排程事件與 provider verification／Audit；設定存在或手動成功不等於排程已執行。已使用的隔離副本不得清空重做。
- [ ] **整理測試資料**（測試客戶、工單、人事等）：先備份，列出候選清單給使用者確認，真實資料不可刪，再分批刪除。已知合成資料：客戶「CYWEB 驗收 20261001」與其拜訪紀錄、常用商品「Development 常用商品驗收（未建檔合成品項）」、工作日誌類型 `DEVELOPMENT_ACCEPTANCE` 草稿。依相依順序用正常產品行為清理，保留必要 Audit／history；不清空資料庫。
- [ ] **移除人事「刪除」功能**（測試用，BD-059 第 7 項；`HrService.remove`、DELETE 路由、人員頁刪除按鈕與驗收 `ACCEPT_HR_DELETE*`）。
- [ ] 核對第一版 readiness 與乾淨 production schema；使用者確認後才上線。
- [ ] 舊 GAS／Google Sheets 只作參考，新系統穩定後由使用者決定停用時間；舊測試資料不搬入正式環境。
- [ ] GitHub 設定名稱／scope 的 read-back（API 目前 403，不等於設定不存在），補齊後才搬移 metadata。

## 部署觀察

- [ ] 部署後第一次 health 偶爾仍回舊版本，數秒內轉為新版本（0.7.10–0.7.15 曾觀察 13–33 秒；V0.9.41 部署時正式入口第一次回 0.9.40、約 1.3 秒後轉為 0.9.41），不需重新部署。部署流程在 90 秒內只讀觀察兩個入口；Cloudflare 內部原因未確認。

## 文件地圖

- 永久規則：`REPOSITORY_RULES.md`（共通）、`REPO_POLICY.md`（本 repo）、`PROJECT_RULES.md`（CY Web）
- 架構文件索引：`docs/architecture/README.md`；Business Decisions：`docs/architecture/decisions/README.md`
- 版本紀錄：`CHANGELOG.md`；工作單：`docs/development/work-orders/`
- ERP 查詢：`docs/architecture/ERP_ITEM_QUERY_BRIDGE_CONTRACT.md`；叫貨：`docs/architecture/ORDERING_MODULE.md`；人事：`docs/architecture/HR_MODULE_DESIGN.md`、`HR_MODULE_CONTRACT.md`
- 資料模型：`docs/architecture/CANONICAL_DATA_MODEL.md`、`FINAL_DATA_DICTIONARY.md`、`migrations/`；Worker API：`docs/architecture/API_CONTRACT.md`
- CYID consumer contract 鏡像：`docs/contracts/cyid/`；Identity adapter：`docs/architecture/IDENTITY_ADAPTER.md`
- 部署：`docs/development/IDENTITY_DEPLOYMENT.md`；本機開發：`docs/development/LOCAL_DEVELOPMENT.md`；備份：`docs/architecture/BACKUP_ARCHITECTURE.md`
- 歷史資料：`docs/architecture/archive/` 與 Git history（已結案的舊 handoff 原文和舊版截圖保留於固定快照；`docs/handoff/` 供後續新工作使用，不是目前契約）。

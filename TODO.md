## 目前狀態（2026-10-28）

- **V0.9.50 Build 0**（2026-10-28）：V0.9.48 隔離演練已驗收；V0.9.49 季度提醒與 V0.9.50 演練後自動斷開隔離庫已部署。主 D1 到 migration 0029，CYID consumer 1.0.5。
- 架構：單一 React → protected Worker API → D1；帳號、Session、系統使用權由 CYID 管理，CY Web 只管模組權限（Module Access）與業務授權。
- 模組：客戶、商品、瑕疵、銷售工單、叫貨、門市（顧客訂購與黑名單）、委外/代工、工作日誌、人事（目前僅超級管理員）、ERP 查詢（商品／客戶／供應商／進貨輔助／未收款，排程佇列為右側欄）、帳號與權限、異動紀錄、備份管理、CY 程式、我的帳號。
- ERP 查詢需公司電腦上的 CYERPAutoQuery：正式版 **V1.2.0**（2026-10-28 發布，tag `cyerp-auto-query-v1.2.0`）；自動開啟 ERP、報表匯出、進貨輔助、立即關閉與關閉 15 分鐘已實機確認。
- 備份：手動 R2＋GCS 雙副本與 GCS 隔離還原已通過；可攜備份上限 100,000 列／24 MB，叫貨資料已納入。**自動備份排程未啟用**（使用者決定上線前再開，見下方）。

## 待 Claude 審查：V0.9.52 — 門市庫存盤點（第一階段，交 GPT：[WO-0.9.52](docs/development/work-orders/WO-0.9.52.md)）

- [x] **GPT PR #307 程式與離線驗收完成，待 Claude 最終審查（未合併／未部署）**：Migration 0030、盲盤／複盤／ERP bridge／手機版、17 synthetic regressions；[Runtime #40750528573](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40750528573) 五 jobs 全綠、完整 Node **399/399**，1440／390 真 Chromium 七張 screenshot artifact；CYapps WO-1.3.0 協定已比對。真 ERP、正式 D1 大負載及正式登入 E2E 仍需另行授權與驗證。
- [ ] Claude 審查、合併部署（需 CYERPAutoQuery 1.3.0）。
- [ ] 部署後由使用者把三張舊底稿設為忽略，再按「更新盤點單」。
- [ ] 第二階段（另開工單）：盤點盈虧明細表、盤點資料更新作業、核對庫存異動盤點單、（視需要）核對品號庫存、盤點資料清除作業，完成才算一次完整盤點。

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
| Backup / recovery | R2／GCS 手動備份與紀錄、隔離還原、排程 | 使用者 2026-10-28 回報一般 Backup OK；隔離還原同日演練成功（V0.9.48）；排程仍未啟用，不得據此操作正式還原 |
| 清理 / 上線 | 核對 fixture/account 清單、受控清理與 first-release gates | 驗收後確認，不自動刪除或 production cutover |


## 隔離還原（2026-10-28 完成驗收）

- [x] V0.9.48（PR #300／#301）合併部署；同日執行受控輪替，`RECOVERY_DB` 改接新版隔離 D1（generation `20261028a`），舊的 0014 隔離庫保留未動。
- [x] 使用者 2026/10/28 21:11 實機演練「驗證成功」（R2 來源，還原前安全備份 R2／GCS 皆已驗證）：**隔離還原驗收通過**。
- [x] 使用者回報：舊 0014 隔離庫已自行刪除。本次僅依使用者回報記錄，未由本對話重新查核 Cloudflare；新庫與正式 D1 不動。
- [x] **本季（台灣時間 Q1–Q4）超管主動站內提醒程式已提交**：本季沒有成功演練 Audit 時，於任何模組的頁首通知 `SUPER_ADMIN`、可直達備份管理，成功後提醒消失。未實作離線 Email／Push；若要用戶未登入也收到提醒，須另決定授權通知管道。
- [ ] 往後**每季人工演練一次**：提醒後由超管另行核准新空白目標輪替、實機驗證與歷史副本清理；不要自動建庫、還原或刪庫。
- [ ] 自動備份排程繼續停用，上線前另行核准。

### V0.9.49–V0.9.50（已合併、部署）

- [x] V0.9.49（PR #303，Claude 審查與 N1–N3 複審通過）：每季超管站內提醒、成功顯示「完成」與結果區塊、已用目標的 UI／Worker 雙重鎖定、手冊改為只留最近一個用過的隔離庫。
- [x] V0.9.50：**演練後自動斷開隔離庫**。部署時若綁定中的隔離庫已用過，就不再綁定 `RECOVERY_DB`（資料不動、不刪庫），之後可直接在 Cloudflare 刪除；一般部署也不再自動建庫，新隔離庫只由 `rotate-recovery` 建立（無綁定時也可輪替）。Worker 不持有 Cloudflare 管理權限。
- [ ] 使用者在 Cloudflare 刪除已斷開的 `cyweb-dev-recovery-v20261028a`（V0.9.50 部署後確認 Worker 已無 `RECOVERY_DB` 綁定再刪）。
- [ ] 每季演練流程：輪替（建新庫並綁定）→ 備份管理演練 → 下一次部署自動斷開 → 刪除該庫。

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

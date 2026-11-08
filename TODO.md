# CY Web 目前狀態與待辦

> 本檔是 CY Web 唯一的現況與待辦清單，不是永久規則來源。各版本完成內容與驗證見 `CHANGELOG.md`；規格見 `docs/architecture/README.md`。
> 2026-11-03 整理：已完成且已記入 CHANGELOG 的版本段落移除；已結案的交接與工作單移到 Git 固定快照（見 `docs/handoff/README.md`）。

## 目前狀態（2026-11-09）

- [ ] **V0.12.9 進貨輔助重複品項選擇新增取消**：與新增列／加到既有列並列，取消無品項寫入與上次來源更新；桌機／手機共用。等待驗證／Claude 複審／實機驗收。[handoff](docs/handoff/CYWEB-RESTOCK-DUPLICATE-CANCEL-0129-20261109.md)。

- [ ] **V0.12.8 手機 UI 密度**：側欄 CY Web 品牌置頂、叫貨搜尋／篩選／未結案同行、未到貨每項最多兩行、草稿來源密集清單，另外補 BOT 管理中心專屬線條圖示；保留桌機版與來源排序。使用者授權合併部署；Claude 複審及實機操作待驗。[handoff](docs/handoff/CYWEB-MOBILE-ORDERING-DENSITY-0128-20261109.md)。

- [ ] **V0.12.7 Build 1 手機叫貨（使用者已授權合併部署）**：預設叫貨清單、未到貨直接原明細清單、草稿選來源／廠商；手機收合進階篩選與去除第二層來源 tabs；手機「分享 Excel」按鈕自動儲存後使用原生分享，瀏覽器不支援時下載備援，**桌機雙欄、叫貨操作及 Excel 原下載方式不變**。待最新 CI、正式發布及健康驗證完成；Claude 複審與雙端實機驗收待完成。[handoff](docs/handoff/CYWEB-MOBILE-ORDERING-NAV-0127B1-20261108.md)。


- [ ] **V0.12.7 Build 0 手機 UI 獨立上線**：使用者允許此版合併部署，但不含 #457 首頁、公告通知／個人待辦／鈴鐺、D1 0059。手機側欄、外觀、ERP tabs/pill、叫貨草稿與卡片。需以正式 Run／health 及 SHA 回讀為發布完成依據；Claude 事後審查與 iPhone 實機驗收待辦。[handoff](docs/handoff/CYWEB-MOBILE-ONLY-0127-20261108.md)。
- [ ] **首頁與通知、待辦**：原 Draft #457／後續疊加 Draft #458 仍未合併、未部署，後續必須根據已上線的獨立手機變更重新整理差異與版本，不得直接合併重複內容。


- **V0.12.6 Build 0（BOT 時間軸／卡片／視窗調整，待 PR 與 CI）**：每件完成事件預設單行，超出才展開；Threads 摘要卡只顯示最新標題；推播設定視窗縮至約 414px、BOT 設定縮至約 720px。純前端，無 D1／Worker／憑證異動；待 PR CI、Claude 審查、桌機／手機驗收和使用者正式部署授權。[handoff](docs/handoff/CYWEB-BOT-CENTER-COMPACT-0126-20261108.md)。

- **受控 GitHub 發布分支恢復（治理 1.1.29，2026-11-08）**：已恢復 `deploy/cyweb-development` 的指定 push 入口，僅允許最新 main 完整 SHA；保留 main 手動 dispatch、正式部署鎖及現有健康檢查。GitHub [Run #42415082976](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42415082976) 的 source/deploy jobs 成功；網站即時健康仍需獨立讀回。Chat Connector 的 `update_ref` 觸發實測見 [handoff](docs/handoff/CYWEB-CHAT-DEPLOY-20261108.md)；不另建 Worker／D1／Secrets，不修改產品 VERSION／BUILD。

- **V0.12.5 Build 0（PR #453 已合併，Run #42415082976 發布 job 成功）**：BOT 管理中心頂部精簡為純狀態 pills 與五筆時間軸，同分鐘共用一個時間點，完整時間軸改 Modal；推播設定與新增 BOT 改共用左表頭／右輸入 EntryTable，啟停移至原 BOT 設定表格操作。保留原 Grok webhook 設定和小編 CYWEB 憑證。CI 718/718 通過、main 合併 SHA `8cbd17da`；push 發布工作已執行成功（來源 `427f8d82`）；待網站即時健康回讀、Claude 事後審查及桌機／手機驗收。[handoff](docs/handoff/CYWEB-BOT-CENTER-UI-0125-20261108.md)。

- **V0.12.4 Build 1 已正式部署（PR #449）**：[發布 #42401625125](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42401625125)成功，遠端D1已套用0058，canonical／workers.dev健康version=0.12.4、consumer=1.0.5、database=ok、source一致；正式source=`90100f726a999ce3ad24c63b752178df6899bc8d`，BUILD=1由source核對。已建立獨立推播加密主金鑰，未讀取／輪換小編原CYWEB憑證。Grok完整URL／key仍須使用者在WEB安全輸入；Claude事後複審、UI與真實Grok端到端待辦。[handoff](docs/handoff/CYWEB-BOT-REVIEW-PUSH-0124-20261108.md)。
- [ ] V0.12.4 Build 1：Claude審查、UI／窄螢幕驗收、使用者在WEB安全輸入小編POST to／key、更新Grok共用技能／既有routine、合成稿通過及退回各一次實機驗證。小編原CYWEB憑證及收據保持不變。

- **V0.12.3 Build 1 已合併部署（PR #447）**：[發布 #42391275622](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42391275622)成功，0057原樣保存小編憑證並改為逐BOT隔離；新版審核／摘要／時間軸及工具／技能上線。canonical與workers.dev健康／來源、HTTPS／session／排程／portal檢查通過，拍板結案未接後臺。現在可更新Grok工具並保留小編原secret與收據；Claude事後複審、原key回讀與UI／手機驗收仍待辦。後續推播已由V0.12.4實作部署。[設定](integrations/grok-bot/cyweb-work-reporter/references/grok-setup.md)、[handoff](docs/handoff/CYWEB-GROK-REPORTER-0123-20261107.md)。

- **V0.12.2 BOT 工作總覽已合併部署**：PR #445／[發布 #42371824288](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42371824288) 成功；總覽 → 全寬待審表格（每件一列、無展開）→ BOT 卡片 → 全寬時間軸，完整統計與 BOT 篩選、輕量進度輪詢。相關 38 項測試、最終完整 CI 及桌機／手機合成預覽通過；Claude 事後複審與正式 BOT 實機驗收仍待辦。[handoff](docs/handoff/CYWEB-BOT-OVERVIEW-0122-20261107.md)。

- **V0.12.1 盤點紀錄／ERP 清除歸檔，WEB 已合併部署**：PR #443、[發布 #42347693527](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42347693527) 成功，紀錄視窗使用精簡共用紀錄串。Agent 原程式變更已撤回，只留 [CYERPAutoQuery 專案 handoff](https://github.com/simonliu1118-byte/CYapps/blob/cyerp/stocktake-complete-list-131/apps/CYERPAutoQuery/docs/handoff/CYERPAutoQuery-STOCKTAKE-ARCHIVE-HANDOFF-20261107.md) 交 Claude，PR #604 維持草稿、不合併發行。**舊 Agent 可同步，但自動歸檔須待 Claude 完成配套並授權更新後才啟用**。Claude 事後複審與實機驗收仍待辦。[WEB handoff](docs/handoff/CYWEB-STOCKTAKE-RECORDS-0121-20261107.md)。

- **正式站 V0.12.4 Build 1**：[Deployment #42401625125](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42401625125)成功，source=`90100f726a999ce3ad24c63b752178df6899bc8d`；兩端版本／D1／CYID consumer／來源、HTTPS／無效session／排程／portal驗證通過。本次發布證據只改文件，不需再次部署。
- **PR #438／#440 已合併部署**：BOT 管理中心包含並行審稿及輪詢讀取返修；盤點刪除圖示移到批號旁，解盲後顯示 ERP 帳面批號合計。最新 Ubuntu CI 全部成功，本機 BOT 9 項及盤點 36 項測試通過。證據見 [BOT handoff](docs/handoff/CYWEB-BOT-CENTER-0120-20261106.md)／[盤點 handoff](docs/handoff/CYWEB-STOCKTAKE-BATCH-DELETE-0116-20261106.md)。
- 本次正式 source 也包含已合併的 #437／#439（V0.11.4／V0.11.5）。**合併／部署／自動驗證已完成，不等於 Claude 複審或使用者實機驗收完成**；尚未完成的項目分別列於下方清單。
- **正式 D1 migration：`0058_bot_review_push`**；受控workflow已套用推播設定／通知技術表，並保留0057逐BOT憑證及工作分類／事件編號，沒有重新產生小編key、重寫舊migration或手動改正式業務資料。
- 模組：客戶、商品、瑕疵、銷售工單、叫貨（含進貨輔助抽屜、未到貨）、門市（顧客訂購、黑名單、月度待辦、售後維修（門市送修／出機紀錄／三年定期維護矩陣）、庫存盤點）、委外/代工、工作日誌、人事、ERP 查詢、BOT 管理中心、帳號與權限、異動紀錄、備份管理、CY 程式、我的帳號。
- 帳號：CYID 正式服務；成功的登入確認在伺服器記住 30 秒（V0.9.91）。
- 排程：網站只有一個 `*/5 * * * *` 排程（V0.9.86），每次做 ERP 逾時與結果清理；台灣 00:00 門市月度、03:00 CY 程式清單、03:15 ERP 保留期清理、03:30 每日備份，失敗時 03:45 補做一次。
- 備份：R2 每日＋GCS 週三／週日；可攜備份 formatVersion 2（依 migration／欄位名稱還原）。手動備份 R2／GCS 已驗證；排程與隔離還原的剩餘驗收仍依下方上線檢核，不因部署成功自動勾選。
- 部署：合併 main 不會部署；從 main 執行 `development-deploy.yml` 的 `deploy-development`。操作見 [部署文件](docs/development/IDENTITY_DEPLOYMENT.md)。
- 接手 UI 前必讀 [UI_COMPONENT_CATALOG](docs/architecture/UI_COMPONENT_CATALOG.md)。

## 上線檢核

- [x] 手動備份（使用者 2026-11-03 確認）。
- [x] 啟用自動備份排程：使用者已把 `CF_BACKUP_SCHEDULE_ENABLED` 改為 `true`。
- [ ] **確認第一次排程備份**（2026-11-04 台灣 03:30）：
  - 備份管理出現一筆「排程備份」，R2、GCS 兩邊都驗證；
  - 門市月度與 CY 程式清單照常更新。
- [ ] **隔離還原演練**（用 formatVersion 2 的備份）：
  1. 執行 `rotate-recovery` 建立新的空白隔離 D1；
  2. 在備份管理按「驗證隔離還原」；
  3. 下一次部署會自動斷開隔離庫，之後在 Cloudflare 刪除。

  之後每季演練一次，系統會提醒超管。
- [x] 整理測試資料（2026-11-03，正式 D1，使用者逐項確認，不留紀錄）：
  - 刪除：測試客戶 2 位及其拜訪、備註、常用商品、電話、聯絡人、地址；工作日誌 1 本；未使用的帳號列 3 筆（id 1、4、5）。
  - 保留：商品 A00001、盤點單 261001。
  - 刪除前查過所有參照，刪除後外鍵檢查無錯誤。
- [ ] 空白叫貨草稿（id 4、24、32、37、41）由使用者自行刪除。
- [x] 人事刪除規則（V0.9.83）：剛新增、還沒有任何紀錄才可刪除。
- [ ] 關閉 CYID 的測試期帳號刪除（`testingAccountDeletionAllowed`）。這在 CYapps 的 CYID 專案，由使用者或 GPT 處理。
- [ ] 設定員工的模組權限。
- [ ] 決定問題回報管道。
- [ ] 最後走查，使用者確認後正式上線。
- [ ] 新系統穩定後，由使用者決定停用舊 GAS／Google Sheets 的時間；舊測試資料不搬入。

## 待 Claude 事後複審

以下產品變更均已合併並包含於目前正式版本；核對至 2026-11-07 尚未取得對應的 Claude 通過紀錄，故保留未勾選，不再列為待合併／待部署。

- [ ] V0.12.0 Build 1 BOT 管理中心（#438）：[handoff](docs/handoff/CYWEB-BOT-CENTER-0120-20261106.md)。
- [ ] V0.11.6 盤點批號圖示／複盤帳面量（#440）：[handoff](docs/handoff/CYWEB-STOCKTAKE-BATCH-DELETE-0116-20261106.md)。
- [ ] V0.11.5 ERP Session 空白卡（#439）：[handoff](docs/handoff/CYWEB-ERP-SESSION-CLEARED-0115-20261106.md)。
- [ ] V0.11.4 出機類別／財產編號／維護浮窗（#437）：[handoff](docs/handoff/CYWEB-EQUIPMENT-CATEGORY-ASSETS-0114-20261106.md)。
- [ ] V0.11.3 ERP 未收款共用表格（#435）：[handoff](docs/handoff/CYWEB-ERP-RECEIVABLE-TABLE-0113-20261105.md)。
- [ ] V0.11.2 出機表單與保固年月（#433）：[handoff](docs/handoff/CYWEB-EQUIPMENT-FORM-0112-20261105.md)。
- [ ] V0.11.1 三年維護矩陣（#431）：[handoff](docs/handoff/CYWEB-MAINTENANCE-MATRIX-0111-20261105.md)。
- [ ] V0.11.0 出機與定期維護（#429）：[handoff](docs/handoff/CYWEB-EQUIPMENT-MAINTENANCE-0110-20261105.md)。
- [ ] V0.10.25 售後維修清單（#427）：[handoff](docs/handoff/CYWEB-REPAIR-LIST-01025-20261105.md)。
- [ ] V0.10.24 門市步驟鎖定／物流（#426）：[handoff](docs/handoff/CYWEB-WO-0.10.24-STEP-LOCK-20261104.md)。
- [ ] V0.9.88 工作視窗明確關閉（#379）：[handoff](docs/handoff/CYWEB-DIALOG-EXPLICIT-CLOSE-0988-20261103.md)。
- [ ] V0.9.87 客戶介面密度（#377）：[handoff](docs/handoff/CYWEB-CUSTOMER-DENSITY-0987-20261102.md)。
- [ ] 本輪文件狀態同步：[handoff](docs/handoff/CYWEB-DOCS-CURRENT-0120-20261107.md)。

WO-0.9.94 兩段已有 Claude 審查通過紀錄並完成合併部署（第二段正式 V0.10.12），不列待審；結論見 [工單 §9](docs/development/work-orders/WO-0.9.94.md#9-審查紀錄審查者填)。

## 待使用者實機驗收

- [ ] V0.12.0 Build 1 BOT 管理中心：登入後桌機／手機四區、授權、憑證管理、審稿及分頁；不得以未登入 401 檢查代替登入後驗收。
- [ ] V0.11.6 盤點：桌機／手機批號刪除圖示、極長批號、初盤仍盲盤、複盤 ERP 帳面批號合計與多儲位顯示。
- [ ] V0.11.0–V0.11.4 出機／定期維護：保固年月、機身財產編號、三年矩陣與格內日期浮窗。
- [ ] V0.11.5 ERP 查詢：登出後重新登入，沒有對應 Session 結果時不顯示空白完成卡。
- [ ] V0.11.3 ERP 未收款：桌機／手機主表與展開明細、客戶名稱與六位金額。
- [ ] V0.10.24 門市流程：下一步登記後上一步唯讀、物流檢視、退回恢復及既有結案時間窗。
- [ ] 客戶表格式單據（V0.9.95–V0.10.0）：新增、修改、主頁面、右側抽屜三頁籤；電話分機與傳真、郵遞區號自動帶入；狀態 pill、付款條件／發票開立、備註重要星號；客戶設定的拖拉排序、停用、刪除未使用項目。
- [ ] 叫貨切換來源頁籤的速度（V0.9.90、V0.9.91）：剛進叫貨時第一次切換是否仍要等。
- [ ] V0.9.78：草稿新增一列，先填廠商品號再填品號，確認廠商品號保留。
- [ ] V0.9.76：修改一筆到貨的數量與日期、刪除一筆到貨，確認已到數量與狀態正確。
- [ ] V0.9.72：叫貨頁開進貨輔助，查詢期間切到別的模組再回來，確認完成通知的「查看」會重新打開抽屜。
- [ ] V0.9.71：設定一個單月或雙月項目，確認只在指定月份出現。
- [ ] V0.9.69–V0.9.70：在「帳號與權限」授權「門市售後維修」後實機操作，包含手機拍照上傳與照片清晰度。
- [ ] V0.9.57–V0.9.64 門市訂購／黑名單／月度待辦（Claude 事後審查已通過）：正式登入、觸控與剪貼簿操作。
- [ ] V0.9.54 備份管理 Desktop／Mobile 畫面。
- [ ] V0.9.52 盤點：使用者把三張舊底稿設為忽略，再按「更新盤點單」。
- [ ] 門市顧客訂購（V0.9.45）：新增、狀態流轉、通知逾期標示、取消轉黑名單、黑名單兩種處置；再決定要不要列印取貨單或通知範本。
- [ ] 表單（V0.9.35）：客戶拜訪紀錄／常用商品、人事津貼、身分頁對話框、叫貨來源選單、進貨輔助加入叫貨單。

### 統一人工驗收清單

自動驗收之後由使用者集中操作；以下須實際觀察，不以自動檢查代替。

| 範圍 | 人工確認 | 前提與界線 |
| --- | --- | --- |
| 核心帳號 / CYID | 登入／登出、Session 逾期／撤銷、self-service、返回登入 | 既有受控帳號；不自行新增帳號或授權 |
| Role / Module Access | USER／ADMIN／Identity Admin／SUPER_ADMIN 畫面、撤權／恢復／角色變更（V0.9.91 起最多 30 秒後生效） | 受控帳號 |
| CY 程式 | 無 Module Access 仍可看清單；版本／日期／ICON、網頁入口與 ZIP 下載 | 未發版項目待正式 Release 才補入口 |
| Customer | 建立／編輯／搜尋、聯絡人／拜訪／常用商品、報價歷史／更正 | 正式 Item／Quote 需合法 ERP 品項 |
| Item / Defect | 正式欄位、單位／價格精度、瑕疵狀態與管理操作 | 合法 ERP 參考 |
| Sales Order | 草稿、ERP 帶入／更正、各狀態與作廢、權限提示 | 合法 ERP 參考 |
| Outsourcing | 代工對象／BOM、出貨／收貨／計價／付款及反轉 | 不異動真實庫存／付款 |
| WorkLog | 本人 CRUD／送審／撤回、管理員審核／取消審核、統計 | 既有帳號 |
| Settings / Audit | 設定編輯、唯讀異動紀錄搜尋 | 不改正式設定 |
| 電腦 / 平板 / 手機 | 密度、導覽、表單、捲動、選取、錯誤／載入、觸控／鍵盤 | 真實裝置，問題回寫本檔 |
| Backup / recovery | 排程備份、隔離還原 | 見上方上線檢核 |

## 開發待辦

- [x] **全系統灰色說明小字**（[WO-0.9.94](docs/development/work-orders/WO-0.9.94.md)）：第一段盤點（PR #396）與第二段刪除（PR #413，V0.10.12）皆完成並部署。
- [x] **門市流程「下一步登記後上一步鎖定」與送廠物流顯示**（使用者 2026-11-04；V0.10.24 已合併部署，待 Claude 事後複審；工單 [WO-0.10.24](docs/development/work-orders/WO-0.10.24.md)，GPT 執行）：
  - 售後維修：檢測（可填補充說明）→ 送廠（必填物流）→ 完修 → 通知 → 歸還。登記下一步後，上一步的日期與資料（檢測日期＋補充說明、送廠日期＋物流）都不能再改；要改只能用「退回上一步」。
  - 送廠格的小視窗要顯示已填的物流（貨運、寄送編號）；目前登記後就看不到。歸還寄送的物流同理。
  - 門市顧客訂購同一規則：下一步登記後，上一步日期唯讀。
  - 後端 `PATCH /date` 要擋「已有下一步」的步驟；前端已登記且非最後一步的格子改成唯讀顯示（點開只看不改）。測試 `scripts/store-repairs.test.mjs`、`scripts/store-page.test.mjs` 要跟著改。
- [ ] **商品主檔改版（下一個，版面已與使用者定案 2026-11-04）**：
  - 第一列：品號／品名／規格（品名與規格同寬）／基準單位（最右，與單位換算合併：檢視「個 盒=10個 箱=200個」；修改時基準單位輸入＋「＋換算」，每行「1 [盒] = [10] 個 ×」）。
  - 第二列：分類／成本／成本稅別（未稅時同格顯示「(含稅$11.53)」，5%、四捨五入到小數 2 位）／門市價／診所價／批發價／網路價（寬欄）。
  - 批發價：自填單位與價格，顯示「盒$1500 / 箱$6000」。網路價：顯示「蝦$50 / MO$60 / 酷$100」，沒填的平台隱藏；修改時是格子內小表格（平台表頭列，輸入框寬度夠 5 位數）。平台在商品設定可維護，預設 蝦、MO、酷、露、好賣、iOPEN。
  - 曾用品號移到商品「修改紀錄」視窗內固定位置，不放主畫面。
  - 需要 migration（平台、網路價、批發價三張表）；先抽出共用的明細標題列與關聯卡片＋抽屜元件。
- [ ] **其他主檔改成表格式單據**：商品、瑕疵、銷售工單、代工、工作日誌、人事，依客戶（V0.9.95）定下的樣式，各模組開工單前先與使用者定欄位排列；報價新增／修正表單隨商品一起改。
- [ ] **彈窗統一成表格式樣式**（使用者 2026-11-04）：修改紀錄、報價新增／修正、商品單位換算、人事各對話框等舊彈窗，改用與設定視窗相同的表格式共用元件，一次改完；修改紀錄的「其他欄位」改成逐欄列出。
- [ ] **工作台（次模組）**（使用者 2026-11-04，等這輪表格式改版完成後才開始）：自己不存主資料，把各主檔的紀錄集中成角色的快速入口；左側選單在「業務模組」下另開「工作台」。
  - 業務工作台：拜訪清單、報價清單、客戶描述、潛在銷售品項，可依業務／地區／狀態篩選，不必先點進客戶。
  - 品質工作台：瑕疵改成對商品的工作台形式。
  - 毛利分析：商品的毛利分析。
- [ ] **盤點第二階段 ERP 作業**（另開工作單；WEB 清除後歸檔已納入 V0.12.1，此處仍追蹤 ERP 作業）：盤點盈虧明細表、盤點資料更新作業、核對庫存異動盤點單、（視需要）核對品號庫存、盤點資料清除作業；完成才算一次完整盤點。
- [ ] **附檔備份**：人事附件與維修單照片的檔案本體目前不在可攜備份內，另案處理。
- [ ] **ERP 查詢完成通知位置**：依使用者 2026-10-28 指示改到畫面右下角；先確認是否影響其他共用通知。
- [ ] **顧客訂購與叫貨連動**（使用者 2026-10-28）：訂購品項一鍵加入指定叫貨來源的草稿，叫貨單到貨時對應訂購自動改為到貨。先確認來源怎麼選、部分到貨怎麼算、一張叫貨單對多筆訂購的對應。
- [ ] **銷貨分析頁**（用 `erp_sales_daily`），規格待使用者確認。
- [ ] **使用說明**：所有模組完成後，右上角加「使用說明」按鈕（外觀切換左邊），顯示目前頁面教學並可切換模組；頁標題旁的 ⓘ 併入。
- [ ] 手機三欄表格＋點列開完整表單：待定稿，目前維持窄版表格捲動。
- [ ] 各表單分區細節由使用者逐一調整（使用者 2026-10-21）。
- [ ] 網頁標準視覺規範（`docs/architecture/CY_WEB_VISUAL_GUIDE.md`）經使用者確認後升格到 AITeam（使用者 2026-10-18：另開對話處理）。
- [ ] 人事：
  - 部分工時特休比例、請假一天的時數換算，待每月法規檢查確認（目前全時每週 40 小時為分母、1 天＝8 小時）；
  - 國定假日補休目前由超管手動給予，若要依排班自動產生另行確認規則；
  - 使用者測試發現的問題記在這裡，下一輪一起修。
- [ ] 共用 UI 整理：導覽、清單密度、表單／明細、dialog／drawer、loading／error／empty、鍵盤與觸控；刪除、權限、金額與庫存等高風險操作不先顯示成功。
- [ ] **CYID 測試帳號（CYACC 9900/9901）清除**：使用者 2026-11-04 指示等介面全部改完再處理；同時關閉 `testingAccountDeletionAllowed`。
- [ ] 資料變大時評估門市訂購模糊搜尋與黑名單比對的讀取量（V0.9.66 已改索引查詢）。

## CYInvoice 復原接線（2026-10-18 起）

- [ ] CYInvoice 端完成原 D1 的備份＋回復演練、schema 0014／0015、Issuer gate 與 Worker feature flag 後：
  - 唯讀核對真 Session／Email／Binding／原 D1 配置；
  - 把 CYWEB `CF_CYINVOICE_RECOVERY_SERVICE` 接到正確入口，依具體授權受控部署；
  - 驗收真 Email、雙 Windows、DR-01～13；
  - 確認撤銷裝置的在途 Work Item fencing、跨 repo 契約，以及變更密碼／移交後的查回。
- [ ] 舊的開發版 CYID 服務已從 Cloudflare 刪除，請使用者登入一次 CYInvoice，確認它已改接正式 CYID。

## 維運與基礎設施

- [x] 治理 1.1.25（PR #385）：正式部署只從 main dispatch，workflow 不再有分支 push 觸發；推送到舊發布分支不會再部署。
- [x] 刪除已沒用的遠端分支（治理 1.1.26，2026-11-03）：CI 刪除 381 個，遠端只剩 `main`；清單檔已移除，刪除前的 SHA 留在 Git 歷史的 `.github/branch-cleanup.txt`。之後 PR 合併時由 GitHub 設定「Automatically delete head branches」自動刪除來源分支（使用者已開啟；清理用 workflow 於治理 1.1.27 移除）。
  - `docs/hr-leave-run-approval`（PR #239）的人事規則「區段內有事假或病假時，連七改為提醒並核准」：使用者 2026-11-03 決定不採用，維持連七一律擋下。
- [ ] GitHub 設定名稱／scope 的 read-back（API 目前 403，不等於設定不存在）。
- 部署後 Cloudflare 有時要一段時間才回新版本（V0.9.88 曾超過 90 秒）；部署檢查自 V0.9.89 起等待最多 5 分鐘，不需重新部署。
- 部分 Cloudflare 資源與 GitHub Environment `development` 的名稱仍含 dev，只是歷史標籤；使用者 2026-11-03 決定暫不改名。

## 文件地圖

- 永久規則：`REPOSITORY_RULES.md`（共通）、`REPO_POLICY.md`（本 repo）、`PROJECT_RULES.md`（CY Web）
- 架構文件索引：`docs/architecture/README.md`；Business Decisions：`docs/architecture/decisions/README.md`
- 版本紀錄：`CHANGELOG.md`；工作單：`docs/development/work-orders/`；交接：`docs/handoff/`
- 叫貨：`docs/architecture/ORDERING_MODULE.md`；ERP 查詢：`ERP_ITEM_QUERY_BRIDGE_CONTRACT.md`
- 門市：`STORE_CUSTOMER_ORDERS.md`、`STORE_MONTHLY_TODOS.md`、`STORE_REPAIRS.md`、`STORE_EQUIPMENT_MAINTENANCE.md`、`STORE_STOCKTAKE.md`
- BOT 管理中心：`docs/architecture/BOT_CENTER.md`
- 人事：`HR_MODULE_DESIGN.md`、`HR_MODULE_CONTRACT.md`、`HR_LEGAL_WATCH.md`
- 資料模型：`CANONICAL_DATA_MODEL.md`、`FINAL_DATA_DICTIONARY.md`、`migrations/`；Worker API：`API_CONTRACT.md`
- CYID consumer contract 鏡像：`docs/contracts/cyid/`；Identity adapter：`IDENTITY_ADAPTER.md`
- 部署：`docs/development/IDENTITY_DEPLOYMENT.md`；本機開發：`docs/development/LOCAL_DEVELOPMENT.md`；備份：`BACKUP_ARCHITECTURE.md`；隔離還原輪替：`docs/development/CYWEB_RECOVERY_ROTATION_RUNBOOK.md`
- UI 共用元件與畫面做法：`docs/architecture/UI_COMPONENT_CATALOG.md`
- 歷史：`docs/architecture/archive/` 與 Git 固定快照，只作追溯。

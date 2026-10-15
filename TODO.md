# CY Web TODO

> 本文件只保存目前狀態、驗收證據與待辦，不是永久規則來源。舊版本逐輪紀錄以 Git history 追溯；業務規則與架構參照既有 canonical 文件，不另建交接或規則層。

## CYACCweb 首次登入入口交接 — 2026-10-15

來源：使用者提供的 CYACCweb first-login handoff／Draft CYapps #435（81cc5fcc），既有 production #38675354003 曾回 `CYWEB_PRODUCTION_AUTHORITY_MISMATCH`。本輪專用 branch 與 CYInvoice Draft #151 分開；不修改帳務 D1、CYInvoice source 或已部署 provider authority。

- [x] 核對 source：根 TODO 仍稱 admin portal 為 development；唯一 Web deploy owner 是既有 development workflow。不能只從 Worker 名字推定哪端該換綁定，當時尚未批准原系統完整切換；其後授權見下方。
- [x] 實作既有 workflow 的 `audit-identity` 唯讀操作：原受保護 environment、原憑證，GET-only 讀 domain → Worker → IDENTITY／D1 metadata／health；沿用 CYapps canonical production resolver 與 `requireProductionCoreConsumer`，不複製新 readiness authority。只輸出 boolean／正常化版本／stable code／時間，不輸出正式名稱、ID、token 或設定。
- [x] 本地八項回歸通過：中央 actual resolver／guard、authority/workspace/health mismatch、Identity DB隔離／業務 DB collision、unsafe URL／多網域、audit期間 drift、GET-only與 credential 不外送、audit operation 不進 deploy job；workflow YAML parsed。
- [x] [PR #152](https://github.com/simonliu1118-byte/chihyuan-web/pull/152) exact head `f13f4772884a10b8ee4fc9ec6ac1027066b400b7`：Governance `38693643909`、Runtime `38693643966`、部署契約 `38693643912` 通過，合併 `9b3fbb514beba5393978bc1de8b1e51b3fb393de`。未部署。
- [x] [唯讀稽核 run 38693835413](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/38693835413)，2026-10-15 **14:41:22 Asia/Taipei**：原受保護 environment 執行，audit success、deploy-development skipped、mutationPerformed=false。canonical production provider／獨立 Identity D1 metadata／portal managed domain與 business D1 metadata 都驗證；Workspace／core App／consumer1.0.4／health符合。**Portal Worker、business D1與 IDENTITY 全部仍為已設定 development；productionPortalReady=false、CYWEB_PRODUCTION_AUTHORITY_MISMATCH。** 不是 CYACC 應改用 development provider，亦不能將audit job綠燈視為修復。
- [x] **使用者 2026-10-15 17:09 明確批准：全部模組可直接開放，沿用既有 Module Access，由使用者限制其他員工。** 不新增 account-only 模式、UI／API 開關、另一 Worker 或第二登入。不自動新增／撤銷 grants、重播 Identity authority、清理測試資料或搬動帳務。
- [x] Source **0.7.26 Build 0**：原 deploy owner 每次 render 前先以 canonical production resolver＋原唯讀 audit核對同一 Worker／同一 business D1／Workspace／core App／health，僅接受已批准的 authority mismatch或已修正狀態；注入正式 Identity target，後續部署不回退 development。原 CF_IDENTITY_SERVICE 值只作 canonical production lookup seed，實際輸出 Binding 一律經正式 runtime核對。部署後原 canonical strict gate 必須通過。歷史 GitHub environment／deploy ref 名稱仍保留，不另建部署 owner。
- [x] 本地十二項 actual-canonical audit／runtime 回歸、四項首次登入 route/adapter regression、既有Identity tests、source contracts、Browser／Worker TypeScript及完整build通過。成功首次驗證必須明確回 emailVerified／passwordChanged／reloginRequired=true，無正常 Session；部分成功／expired／provider outage保持失敗。
- [x] [PR #154](https://github.com/simonliu1118-byte/chihyuan-web/pull/154) exact head `70e6e9862b60e290ce0e9fb4125a6827a1840fb5`：Governance `38712073846`、Runtime `38712073567`（四 jobs）、部署契約 `38712073611` 全通過，PR deploy skipped；合併 `9a76a1ac1337c82aa1db3c046edf48448feea64c`。
- [x] [實際部署 38712562070](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/38712562070)：原 deployment ref 以雙 parent commit `0be73dd96d81421f54f11f1e177f7365128f1bfb` 向前推進，tree `4ca0d9ba876f0acb9acc10d255469e7d7ca34f74` 與已驗 main 完全一致，無 force update。既有 Worker 部署成功、無新 migration；canonical／workers.dev 於1527ms同為0.7.26／consumer1.0.4／exact source／D1 ok，雙入口 invalid Session與cookie清除通過。
- [x] 2026-10-15 **17:24:39 Asia/Taipei** post-deploy 原canonical strict guard：同一 Worker／原business D1維持、`portalUsesConfiguredDevelopmentIdentity=false`、`portalUsesCanonicalProductionIdentity=true`、provider environment=production；Workspace／core App／consumer／health符合，**productionPortalReady=true、failureCode=null**。原唯讀 audit report 的 mutationPerformed=false只描述稽核本身；本 run確實已部署。
- [ ] 同事回報「新使用者信件→CYWEB設定後 Email 未驗證／新密碼不能登入」：現象與已確認的authority mismatch相容，但尚無該次完成請求／真人回讀證據，不能斷定全部同一根因。修正後由受控使用者驗收，必要時管理員確認正式狀態再處理重寄；本輪不自行改密碼／重發信。
- [x] 正式 Identity／core portal 切換的既有 authority、中央契約及原business D1已核對；按本次全部模組開放授權處理原Worker，沒有重播provider provisioning、擴大IAM、搬動帳務或製造第二套帳號。
- [x] CYWEB端正式 authority／Workspace／core App／consumer／D1 gate已通過，回交證據收斂至既有 Identity deployment文件下方 CYACCweb handback。
- [ ] CYACCweb接手於自己的 protected runner 重跑 `--require-account-portal`，核對其最新 main後再推進 Draft #435；CYWEB未代合併或部署帳務。真 Email、一次性密碼→正式密碼→重新登入→CYACC一般登入仍未驗收，本輪未新增帳號／寄信。

操作與回交證據依既有 [Identity deployment](docs/development/IDENTITY_DEPLOYMENT.md#account-portal-authority-read-only-audit)；此 TODO 為唯一進度表。

## 目前基準 — 2026-10-15（Asia/Taipei）

- 目前 source **0.7.26 Build 0／CYID consumer 1.0.4**：既有全部模組沿用原 Worker／business D1／Module Access，正式 Identity 切換結果見上方首次登入交接；不等於業務正式首版、乾淨 schema或所有真人驗收完成。
- 已包含 0.7.24「CY 程式 → 價格觀測室（原型）」外連，原型程式位於 CYapps `apps/CYPriceDesk/`，維持 Sites owner-private 與 ChatGPT 登入；未發版桌面程式仍不提供下載。
- 先前已部署 source **0.7.22 Build 0** 已加入單次切換模組提醒，並沿用 Customer／WorkLog 共用 Dialog／ConfirmDialog，修正關閉焦點並移除六模組／Shell 工程描述；包含 quota cooldown／最近成功版本保留及 skip-link 修正；CY 程式頁仍依使用者要求不顯示「發版說明」連結。六模組獨立自動驗收準備完成，目前為 UI／UX 與小功能整理階段。
- 本輪 source **0.7.23 Build 0／CYID consumer 1.0.4** 在既有「帳號與權限 → 系統使用權」新增 Super Admin 的「登記系統」，由 CYID core Session 決定目前 Workspace；其他員工使用權仍在既有清單管理。共享 Dialog／Field／dirty guard／Toast，無 browser registry authority。Provider #416／development #158 與 Web #146／development #138 已通過 CI／部署；七個 canonical mirrors1.0.4 已同步。使用者在原 development portal 完成 CYInvoice 真人登記／目前 Workspace 啟用，畫面已出現 CYInvoice。一般員工 App Access、取消／dirty guard／busy／行動裝置仍待驗收，不因 Super Admin 永遠允許就視為其他員工已授權。
- 固定入口 `https://admin.chihyuancm.com` 沿用原 CYWEB Worker與business D1；Identity authority 切換以本輪 post-deploy strict gate為證據，GitHub environment／deploy ref 的 development 名稱保留作既有操作標籤。
- 六個業務模組及 Settings/Audit 使用單一 React → protected Worker API → D1。舊 local business authority、Group proxy、activation 入口與重複 local pages 已退休；無另加版本殼。
- 備份／isolated recovery 工程已實作；實際雲端備份及排程仍未啟用。乾淨 production 業務資料 cutover 尚未執行，與本次正式 Identity綁定修正分開。

- 本輪已完成單次切換模組提醒與既有 SUPER_ADMIN Desktop 驗收；後續依下方未勾選項目整理共用 UI／UX。

## 後續順序

1. [x] 本輪獨立自動驗收準備完成：六模組 protected HTTP／service／D1 的規劃案例、實際欄位解析、重要計算、正反狀態、舊版本衝突、權限與精確 Audit 已通過 local 與 required GitHub checks。這不代表所有可能組合、真實服務／多角色／裝置已完成。
2. [ ] **目前階段：使用者統一人工驗收、UI／UX 調整及小幅功能新增。** 本輪指定 CY 程式頁，採既有共用元件與單一 runtime；新增／調整後執行適用回歸驗收。
3. [ ] 完成下方人工／Email／ERP／雲端項目後，核對第一版 readiness、測試資料清理及乾淨 production schema；使用者確認後才上線。這項順序確認不代表立即 production 部署批准。
4. [ ] CYInvoice 接入工作已開始：本 repo 只完成 generic 中央登記 UI／代理與鏡像，實際既有 Workspace 登記及 App Access 由授權管理員操作；Invoice binding／Windows／cutover 由 CYapps 工作線完成，不在此修改其業務資料。

## 中央系統登記（0.7.23）

- [x] Super Admin 顯示操作；一般 ADMIN／Identity Admin 不提供登記入口，server authority 仍由 CYID 決定。
- [x] Core Session proxy／unauthenticated denial／provider 403 原樣保留測試，以及 TypeScript、Vite 與 existing source contracts。
- [x] Provider 0.3.7 開發部署 #158（38197480766）通過；本 repo 依既有 sync script 完成 canonical 1.0.4 七項鏡像，exact-sync／支援窗驗證通過。
- [x] #146 exact-head Governance244／Runtime160／deploy-contract137通過，actual development#138部署與雙入口版本／D1／invalid Session驗收通過。
- [x] 使用者以既有 Super Admin 完成 CYInvoice 真人中央登記／目前 Workspace 啟用，系統使用權清單出現 CYInvoice；一般員工 App Access 尚未確認。
- [ ] 取消／dirty guard／busy、其他角色及行動裝置真人表單驗收。
- [x] CYapps Invoice 唯讀 #38／prepare-cyid #39 完成配置；使用者回報原 Windows continuity 後，#420 CI／actual activate-cyid #42（38206372325）確認 development CYID_ENABLED=true，原業務 Workspace／Device Token hashes／資料／history／FK 保留，Provider不變。原 Windows 中央當次驗證及其餘角色／transport／AA／AB／AC 仍待驗收，唯一進度入口為 CYapps Invoice 現行 TODO／RC；production仍另行核准。

## UI／UX 與小功能階段的工作範圍

- [x] CY 程式頁移除獨立 GitHub 發版說明連結，保留網站入口與 compiled ZIP 下載；同一清單的 Desktop／Mobile 皆適用。共用 render 核對／TypeScript／Vite 及 required remote checks 通過，已部署 0.7.17；既有 SUPER_ADMIN 重新載入後實際顯示七列、僅一個網站與三個下載連結，無發版說明。

- [x] CY 程式頁工程驗收與 Development 部署：所有已登入使用者均可使用，不需 Module Access。四個正式程式提供版本／日期／功能／核准 ICON 與網頁或 compiled Release 入口；SMART 銷貨單格式轉換工具、CYEnvelope、CYWatermark 先保留功能介紹並標示尚未發版，不提供虛構下載。
- [x] 既有 SUPER_ADMIN 的 Desktop `#programs` 導覽、七項介紹、圖示載入、已確認版本／日期、三個未發版無連結、更新 loading 及失敗標示已觀察。三個公開 compiled ZIP 經匿名 HTTP HEAD／redirect 回 200，網頁入口可到 CYAccountingWeb 登入頁；未下載執行桌面程式。
- [x] **CY 程式正式版本即時更新實測通過**：0.7.19 部署後既有 SUPER_ADMIN 初次讀取顯示「最新正式版本」且無 snapshot warning；手動更新 loading → 正常按鈕，七項、版本／日期、網站／三個 compiled ZIP 與三個未發版狀態保持正確。成功讀取採既有五分鐘 process cache；手動按鈕不表示每次強制繞過 cache。
- 根因／修正證據：0.7.18 診斷 actual NETWORK；相同 compatibility date 的 actual workerd 重現 Request `redirect:error` 拋 TypeError，舊純 fetch stub 未真正建立 Request，掩蓋執行環境問題。0.7.18 Build 1 改 `manual`，非 2xx／302 拒絕且不跟隨 Location，補 actual Request construction regression；local／remote Worker/D1、TypeScript／build 均通過。[PR #133](https://github.com/simonliu1118-byte/chihyuan-web/pull/133)／[PR #134](https://github.com/simonliu1118-byte/chihyuan-web/pull/134)；診斷 source f42fa3bfd2d9eb319c0b02ff343bb71de5fd3938／run 37116571600；修正 source 0a0208ec4b0a39ef19cf560e11b35f50ff196380／run 37117059457，兩入口首次 ready 270ms。
- [ ] **GitHub quota／cache 穩定性後續**：修正參數後於 10:40Z actual provider 回 RATE_LIMIT 403（x-ratelimit-remaining=0），明示 snapshot fallback 正常；其後成功不能推論限流已根治或 quota 如何恢復。現有 success 5min／fallback 30sec process cache，0.7.20 已補 provider reset／retry-after cooldown 與失敗保留最近成功版本，actual loader 隔離測試及 required CI／Development health 通過；live reload 仍顯示 fallback，不能視為實際 quota 已恢復；範圍為既有 process cache，跨 isolate 不宣稱全域抑制。保留真實限流與恢復驗收。診斷只回 allowlisted code／HTTP status，不回 provider body、headers、exception text、IP／credential；不以循環重試、重部署或新增版本殼處理。
- [ ] `#programs` Tablet/Mobile、USER/ADMIN（含無 Module Access）的真人畫面與實際下載使用尚待確認；既有 isolated 三 Role API 通過不代替這些結果。

- [ ] 依統一人工清單收集實際操作與畫面問題，回寫本文件，不另建平行進度表。
- [ ] 優先調整共用 navigation、清單密度、表單／明細、dialog/drawer、loading/error/empty feedback 及鍵盤／觸控；Desktop/Tablet/Mobile 維持同一資料與權限契約。
- [ ] 低風險 optimistic interaction 依既有方向逐項檢視；刪除、權限／credential、financial/inventory 等高風險操作不先呈現成功。
- [ ] 使用者提出小功能後記錄需求與驗收條件，再開獨立工作項目；不自行假設第一版要增加什麼。
- [ ] 每批 UI／功能變更跑適用 automated regression，真人/裝置 checklist 仍須實際確認。

- [x] 既有 SUPER_ADMIN 合成 WorkLog Desktop 共用表單：送審 rev.7 → 審核 rev.8（1 日／2.5 分）→ 取消審核 rev.9（統計歸零）→ 撤回回草稿 rev.10。無效日數被拒絕且欄位保留；兩頁籤 rev.7 表單於另一頁完成後被拒絕，未覆蓋 rev.8；未操作其他員工真實日誌。

- [x] Desktop Audit 本輪新增四筆 WorkLog 送審／審核／取消／撤回，累計八筆，entity work_log/1、actor 2；取消 reviewed → pending_review 與本輪合成原因 readback 通過。Customer ERP 表單／主檔取消、Visit 刪除 Escape 及 Frequent Item 移除取消後原資料保留；Customer rev.4、新舊 Visit／Frequent Item 未改，未 hard delete。
- [x] 最後進行 Desktop 共用 UI／UX 檢查：1363×936 程式頁無 document 橫向溢出、七個可見 ICON 56px 載入、active navigation 與網站／ZIP rel 正確。Keyboard Tab 可到 skip link，但 Enter 將 hash 改成 cy-main-content 而切到 Identity，為實測 bug；0.7.19 共用 AppShell 改成只移焦點，live Tab → Enter 確認 hash 保持 #programs、activeElement 為 cy-main-content、CY 程式內容不變。
- [x] 0.7.21 共用 UI 整理與 Build 1 焦點修正：Customer／WorkLog 採既有 Dialog／ConfirmDialog；WorkLog 一次填工作日數／整體備註／各項分數，客戶 ERP 編號與原因同一表單。dirty guard 的取消保留／放棄、busy inputs／actions／dismissal 鎖定、失敗及 stale 表單保留，Desktop 已實測。Escape／取消回 connected 原按鈕；nested confirmation 取消回原表單取消按鈕；native Tab 經 browser chrome 後回 dialog，未進入背景頁。1363×936 審核畫面無 document 橫向溢出。六模組及 Shell 工程描述改使用者語言。
- [x] 0.7.22 切換模組提醒：六模組編輯／Settings／Customer 關聯編輯採共用 guard，普通導覽及 hash／Back 單次詢問「確定切換」／「放棄切換，繼續編輯」。確認即放棄並切換，不強制儲存、不另建保存層、不追加確認。拒絕保留原頁／欄位；busy 操作及權限強制返回不受過期同意覆蓋。目的模組等待自己的權限檢查才 mount。六項 transition tests、TypeScript／build 及 required CI 通過（Governance `37121454070`、Runtime `37121454067`、部署契約 `37121454072`）。Development 已部署；既有 SUPER_ADMIN Desktop 側邊欄／Back 的確認與放棄皆實測，取消保留 Customer 欄位及兩項未儲存 WorkLog 內容，確認一次即切換。Customer 回讀仍為原內容／rev.4，WorkLog 仍為單筆草稿／rev.10；本輪無儲存、送審或刪除。其他角色／裝置及 Identity 專屬表單不外推為已驗收。
- [ ] 共用 UI 後續：Customer 重複統編確認／ERP 編號正式送出、reason 表單 dirty 取消，以及多項日誌儲存／審核與其他角色／裝置驗收仍待完成；本輪只驗收 ERP 表單取消，不寫入 ERP 編號。

## 已接受的工程與驗收範圍

| 範圍 | 已通過 | 尚不能視為完成 |
| --- | --- | --- |
| Identity | 單一登入、first-login ticket 與 normal Session 分離、設定正式密碼後要求重新登入；consumer exact-sync；invalid provider Session fallback | 實際 Email 收信／完整首次登入、跨角色／撤權／Session 的真人瀏覽器驗收 |
| CY 程式 | 七項清單與三個未發版；三 Role 無 Module Access API 自動驗收；SUPER_ADMIN Desktop 七個圖示／無橫向溢出／失敗標示已觀察，ZIP HEAD 200、網頁入口可到登入頁 | 部署端 Release refresh 已成功，另保留曾觀察的 RATE_LIMIT／cache 穩定性；其他真人角色／裝置與桌面程式實際下載使用未完成 |
| 六模組 HTTP 權限 | 未登入、無 Module Access、grant revoke/restore、Role 不改 grants、inactive member、provider invalid/unavailable、body 權限偽造拒絕；實際 routes/services/D1 | provider 為 isolated stub，不等於真實 CYID／瀏覽器全流程 |
| Customer / Quote | persistence／related schema、Contact retention、Visit snapshot；HTTP Visit/Frequent Item create/edit/delete、stale；Quote HTTP 新歷史／correct/stale／精確 price breaks／Audit、原子 rollback | 正式 Item／Quote 真人流程需合法 ERP 品項；完整畫面流程仍待人工確認 |
| Item / Defect | Item HTTP create/edit/renumber/stale／number Audit、精確成本／單位換算；Defect HTTP processing/resolved/reopen/invalidate/stale／Audit，creator 與 ADMIN 刪除界線 | 真實正式 Item、完整 lifecycle 畫面及裝置驗收 |
| Sales Order | ERP fill/correction、waiting/pick/ship/reversal/void、draft edit/delete、stale snapshot 及精確 Audit；HTTP 主要生命週期 | 合法 ERP 參考及真實多角色／畫面驗收 |
| Outsourcing | 全九種 persistence 轉換／stale replay、庫存與 receipt/pricing ledger preservation；取消後重建資料不被舊請求改動 | 完整 protected HTTP 計算／BOM／計價／反轉遠端已通過；真人流程未完成 |
| WorkLog | service lifecycle、併發／Audit；HTTP CRUD/submit/withdraw/review/cancel-review／statistics、cascade、精確 actor 與 stale；owner、非 owner、ADMIN／revoked-access 邊界 | 既有 SUPER_ADMIN 合成 Desktop workflow／錯誤／stale 通過；其他角色、設定組合、多項表單及裝置待驗收 |
| Backup / recovery | separate migrated D1 還原、FK／duplicate rollback、immutable copies、catalog/retry/retention、ephemeral R2；GCS 使用模擬 HTTP | 真實 GCS/R2 及排程、獨立 DR、實際 SUPER_ADMIN 畫面驗收 |
| ID / Audit | 九種 standalone entity 刪除後不重用 ID；migration backfill／rollback／備份還原後分配及 exact entity-key history | 無法推斷未留證據的舊 ID，也未重寫既有可能混淆的 Audit |

### 已觀察的 Desktop browser 結果

- 既有 SUPER_ADMIN 登入後模組／Settings／Audit 頁面載入；forgot-password 返回登入導覽通過，未寄信。
- Customer 建立／欄位儲存／reload、兩頁籤 stale save 拒絕通過。Customer 單列過高問題已修，673.9px pane 中 row 回到 70px。
- Visit 建立／編輯／reload／兩頁籤 stale 拒絕；原生鍵盤日期 `2026-11-01` 保留；Contact 改名及 Visit 再編輯後仍保留原 snapshot。改名後新 Visit 已由既有 SUPER_ADMIN 儲存成功，取得改名後 snapshot；reload readback 通過，新舊 snapshot 各自保留。
- Frequent Item 空白拒絕／自由文字新增／reload；WorkLog draft 建立／編輯／reload 通過。未建立正式 Item／Quote。
- 以上只涵蓋已觀察的 Desktop 與既有帳號，不外推其他角色或 Tablet/Mobile。
- CY 程式頁已由既有 SUPER_ADMIN 登入後觀察：Desktop 七列、七個 56×56 圖示完整載入，無頁面橫向溢出；三個尚未發版列各有零連結。初次及手動更新在 0.7.19 已顯示「最新正式版本」並正常完成；先前 snapshot／RATE_LIMIT 的觀察仍作穩定性證據。這取代先前「登入後清單未觀察」與「live refresh 未通過」狀態；live API 401、其他真人角色／Tablet/Mobile 仍未驗收。

## 部署觀察保留事項

- [ ] 持續保留 recurrent first-attempt health mismatch 診斷。0.7.10、0.7.12、0.7.14 與 0.7.15 曾觀察入口先回舊 source，於同一次部署後 13598ms／14586ms／20910ms／32620ms 轉為新 source，無再次 deploy；Cloudflare 內部原因仍未建立。
- 現有 gate 在 90 秒內只讀觀察兩入口的 allowlisted version／commit／consumer／D1，無自動 redeploy。0.7.13 首次觀察成功不表示歷史問題已根治。
- 0.7.16 兩入口首次觀察成功，391ms ready；0.7.18 診斷部署首次回 0.7.17，1296ms 於同一部署轉為新 source；Build 1／0.7.19 首次 ready 270ms／348ms。不據此宣稱歷史 mismatch 原因已修復。
- acceptance runner 原二秒 timeout 會重送已成功 fixture 寫入的原因已修正：readiness 不寫入、正式 acceptance 單次執行與 60 秒 bound；不保留舊 replay 做法。

## 需要使用者完成及暫緩事項

- [ ] **Email（使用者明確延後）**：指定未被 Employee 使用的受控信箱及授權建立／寄信，再測首次密碼 → 正式密碼 → 返回登入 → 重新登入、逾期／重寄／pending Email edit／舊 ticket 失效、寄送失敗、activated recovery／forgot-password／own Email。密碼由使用者透過登入 handoff 輸入。
- [ ] **ERP**：使用者指定合法 SMART ERP 驗收品項及參考；不捏造 live 正式 Item／ERP 交易。
- [ ] **雲端**：使用者將 development R2/GCS resource／bucket IAM／GitHub environment variables 與 secret 設定延至 **2026-10-05 起的一週**。完成後只回報完成，不提供憑證內容。
- 雲端操作步驟沿用 [既有 deployment 文件](docs/architecture/CLOUDFLARE_PUBLIC_DEPLOYMENT_PRINCIPLES.md#development-backup-manual-setup-and-handback)。App-owned buckets／credentials 與 CYACC 分離；策略 R2 每日臺灣 03:30／30 天、GCS 臺灣週三／週日／182 天，同一份 portable bytes 複製兩邊。
- 使用者完成設定後，先 manual-only 接續驗收，再啟用排程；不因等待這些項目停止獨立工程工作。

### 真實雲端驗收清單

- [ ] 專屬 development R2/GCS buckets、bucket-only service account、R2 無外部覆寫來源、protected deployment inputs；不得共用 CYACC storage/credentials。
- [ ] 先 `CF_BACKUP_ENABLED=true`／`CF_BACKUP_SCHEDULE_ENABLED=false` 部署，確認 SUPER_ADMIN manual controls 與其他角色拒絕。
- [ ] 真實 manual backup：兩邊 readback、相同 bytes/manifest SHA／backup event、非敏感 catalog/Audit。
- [ ] 受控 GCS failure/retry：verified R2 保留，重試只複製同一 immutable event bytes，不建立新 snapshot。
- [ ] 真實 isolated recovery：選定 cloud backup、兩邊 verified safety copies、空的 migrated target、record/byte reconciliation、source 不變與 structured Audit；不得以 live business D1 為 target。
- [ ] manual/recovery 通過後再明確啟用排程，驗證臺灣日期、每日 R2／週三週日 GCS、30/182-day retention 與 pending replica 保護。
- [ ] 就地記錄實際 run／結果，production activation 另行處理。

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
| Email | 驗證、重寄/逾期、密碼 recovery 與實際收信 | 使用者明確延後，此輪不寄信 |
| Backup / recovery | R2/GCS 設定、history/create、隔離還原/演練、排程 | 2026-10-05 起一週設定後再驗收，不啟動 production restore |
| 清理 / 上線 | 核對 fixture/account 清單、受控清理與 first-release gates | 驗收後確認，不自動刪除或 production cutover |

## 上線前暫時保留 — 用途與結束條件

- 測試資料及清理清單只為開發驗收與後續核對保留；不是 production seed 或另一份正式資料來源。完成相關驗收後核對清單，再經不可逆清理的當次確認移除。
- isolated acceptance source 為可重建 CI 驗證，fixture 僅存在臨時 D1，不隨 production 部署建立；不因清理 live fixture 移除有用的 regression tests。
- 未完成的人工／雲端／Email gate 保留到取得實測結果；完成後更新此文件，不另外新增狀態文件或永久例外規則。
- 舊 GAS／Sheet 只保留作參考，直到使用者確認新系統穩定後再決定停用／刪除；不把舊測試資料搬入 production。

### Development 測試資料清理 — 驗收後

- [ ] 核對此工作線建立的合成資料、ID/reference 及支援的正常清理行為；Git 只記錄非敏感結果。
- 保留範圍：Customer `CYWEB 驗收 20261001` revision 4（合成 phone/contact/address/note）；linked Visit revision 5；新增 Visit `2026-10-03` revision 1（改名後 snapshot 合成驗收）；自由文字 Frequent Item `Development 常用商品驗收（未建檔合成品項）`；draft WorkLog type `DEVELOPMENT_ACCEPTANCE` revision 10。未建立 live 正式 Item/Quote。
- [ ] 驗收完成後依相依順序使用正常產品行為清理；不可逆清理取得當次確認，保留必要 Audit/history 與其他資料。此項不授權清空資料庫。
- 使用既有登入帳號，未建立驗收帳號；日後若新增受控帳號須補清單，不刪既有使用者／authority。此清單與 production 乾淨 schema provisioning 分離，目前未執行清理。

## 目前接受與部署證據

- quota/cache：[PR #137](https://github.com/simonliu1118-byte/chihyuan-web/pull/137) accepted head `af2c8eb446846bf1daac837afd667f216a1d5556`；Governance `37118362496`、Runtime `37118362481`、deploy contract `37118362503` 通過。Development `37118566726` attempt 1，290ms ready。Actual loader 隔離測試包含 concurrent coalescing、5min cache、reset／retry-after、invalid header、最近成功資料保留及 on-demand recovery；live reload／manual refresh 仍標示 fallback，不能推論 quota 恢復或跨 isolate 全域快取。
- 共用 UI：[PR #138](https://github.com/simonliu1118-byte/chihyuan-web/pull/138) accepted head `f19109774f48392f924e65788ba9a2468a8b3135`，14 blobs 及 tree exact-match；local TypeScript／source／Vite 通過。Governance `37119318772`、Runtime `37119318792`（actual D1 full acceptance）、deploy contract `37119318807` 通過；Development `37119391904` attempt 1，421ms ready。Live 取消後 BODY 焦點問題於同工作項目 Build 1 修正。
- 焦點修正：[PR #139](https://github.com/simonliu1118-byte/chihyuan-web/pull/139) accepted head `78ffaf1f3d512655f972e4f073f31d3bdec8b779`，四 blobs exact-match；local TypeScript／Vite、Governance `37119656203`、Runtime `37119656168` 通過。UI-only 路徑不觸發 PR deploy-contract；[Development run 37119745615](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/37119745615) 包含部署契約／完整 build／health，attempt 1 成功，canonical 前一 source 下一次觀察轉新 source，1516ms ready，未 redeploy。共享 Dialog layout cleanup 於移除前關閉／回焦點，live connected trigger／nested form／review cancel 通過。
- 最新 Runtime 的 actual Worker/D1 full suite 仍包含六模組 protected HTTP／roles／grants／stale／domain lifecycle／exact Audit／ID non-reuse／restore／backup regression、七 migrations／48 tables、Program Catalog 三 Role 無 Module Access及 trusted release；provider、R2/GCS 等隔離邊界不替代真人／真實外部服務驗收。已完成語意與未完成範圍見上方矩陣。舊版本逐輪 PR／run／preview 記錄以 Git history 追溯，避免在本文件保存互相矛盾的過期基準。

## Topic source map

- Governance/product permanence: `PROJECT_RULES.md`
- Architecture index: `docs/architecture/README.md`
- Business Decisions: `docs/architecture/decisions/README.md`
- Shared CYID consumer package mirror: `docs/contracts/cyid/`
- CY Web-specific Identity adapter: `docs/architecture/IDENTITY_ADAPTER.md`
- Identity deployment: `docs/development/IDENTITY_DEPLOYMENT.md`
- Data model / physical dictionary: `docs/architecture/CANONICAL_DATA_MODEL.md` / `FINAL_DATA_DICTIONARY.md`
- Worker API: `docs/architecture/API_CONTRACT.md`
- Backup/recovery: `docs/architecture/BACKUP_ARCHITECTURE.md`
- Current progress: this file only

Historical preview/audit/readiness/review material under `docs/architecture/archive/` and Git history is evidence only, not current contract.

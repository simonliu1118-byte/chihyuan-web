# CY Web TODO

> 本文件只保存目前狀態、驗收證據與待辦，不是永久規則來源。舊版本逐輪紀錄以 Git history 追溯；業務規則與架構參照既有 canonical 文件，不另建交接或規則層。

## Cloudflare 發布流程整理 — 2026-10-17

- 以既有 0.8.0 main 為基準準備流程 PR：合併不部署、手動 deploy 限 main、同正式目標固定鎖且不取消進行中的 deploy；驗證／audit 分鎖。migration 前檢查當前 main ancestry 與完整 tracked tree，保留發布分支歷史 merge。產品 VERSION／BUILD 不變。
- 操作、非 fast-forward／相同 SHA 的處理方式與成功判定見 [既有網站發布操作](docs/development/IDENTITY_DEPLOYMENT.md#existing-portal-deployment-gate)。不把 PR validate 成功視為已部署。
- [ ] PR 合併後，在下一次已授權發布時回讀新模式的 source guard、deploy／health／portal／schedule 成功。本批不觸發部署、migration、備份啟用或資料／authority 切換。
- [ ] 補齊 GitHub 設定名稱／scope 的現行 read-back，才搬移 metadata；目前 API 403 不等於設定不存在。CY Web 備份的既有 bucket owner、GCS 配置與隔離回復另批驗收；Invoice 相關修改等待 D1 新基準。

## ERP 客戶、銷貨銷退單、未收款與商品成本權限 — 2026-10-17

- 以 main `31812ea`（已部署0.7.37）開始 **0.8.0 Build 0**：使用者要求把 CYERPAutoQuery V0.5～V0.7 的客戶（COPI01）、銷貨銷退單（COPR15＋COPR16）與未收款（ACRR18）接上 CY Web；升 Y 因新增三類使用者明顯可感受的查詢能力與權限。
- 單一「ERP 查詢」入口；桌機頁籤、手機下拉（使用者決定）。權限依資料敏感度分三個查詢權限＋「ERP 商品成本」（決定標準進價可見）；未收款有權限即可查客戶／業務員／全部，日後再細分；銷貨銷退單日期規則同歷史異動。
- 一個 job owner（`useErpJob`）供三類共用；銷退↔原銷貨單連結、未收款分組小計在 CY Web（`shared/erp-sales-links.ts`）。協定見 `docs/architecture/ERP_ITEM_QUERY_BRIDGE_CONTRACT.md` V0.8.0 節。
- [x] Browser／Worker TypeScript、完整 build、validate:source（12 migrations）；新增 Worker／SQLite regression（各類型權限、欄位白名單、Agent queryTypes 派工、SALES／RECEIVABLE 歸屬檢查、標準進價儲存與讀取過濾）與連結／分組測試。
- [x] 以 CYERPAutoQuery 實際產生的六種 complete body 回灌本 Worker 全部接受（跨 repo 契約核對，未提交 fixture）。
- [x] 本機合成 browser：1280px 頁籤／銷退縮排連結、390px 下拉／未收款分組、客戶名稱清單，無橫向溢出與 runtime error；未操作正式帳號或真實 ERP。
- [ ] PR CI、部署（含 0012 migration）與真人 ERP 驗收；需搭配 CYERPAutoQuery V0.7.1 以上（測試階段不做向下相容，舊版 Agent 無法領取工作）。

## 配色已確認，下一步討論版型 — 2026-10-16

- [x] 使用者選定「石墨靛藍」作深色版，再補「霧白靛藍」淺色版，並確認「顏色改這樣比較好看，再來是版型」。色票與設計邊界記於既有 [App Shell 文件](docs/architecture/APP_SHELL_FOUNDATION.md#confirmed-colour-direction--2026-10-16)，兩版預覽 source 一併保存於 `docs/design/cyweb-indigo-light-dark.html`，合成資料且不進 runtime。
- [x] 釐清先前說法：酒紅色不是已確認的 CY 家族品牌色，只是現行 Web 暫定配色。金色／銅色角色識別及狀態色保留；不因本輪 Web 選色修改 family-wide canonical。
- [ ] **下一步：先給版型設計方案。** 桌機／平板／手機、導覽與頁首、表單及資料區配置仍待討論；預覽橫式導覽不代表定案，不能遺漏管理／工具入口。主題切換／預設／偏好保存方式也待定。
- 正式程式及網站仍為已部署 **0.7.37**，PR174／175已合併；新配色目前只完成設計，尚未實作、合併產品程式或部署。本輪依使用者要求先保存文件，不開始版型或配色實作，也不重做舊 ERP 橋接草稿。

## 共用頁首／手機導覽／ERP 搜尋與歷史日期 — 2026-10-16

- 以最新 main `b5de6b3`（已部署0.7.36、PR169～173）開始本輪 **0.7.37 Build0**；舊本機ERP橋接草稿不併入。現有品號／品名、批號／歷史、Agent與Module Access owner沿用。
- 原六業務模組及ERP入口與管理區以分隔線區分，移除「業務／管理」小標、保留「工具」。共用頁首標題由16px加大至20px；說明沿用Dialog的無可見標題變體，只顯示文字與關閉控制，仍保有accessible name／Esc／焦點復歸。
- 共用AppShell以820px的presentation條件，單一導覽內容選擇桌機sidebar或手機Drawer；同一headerActions選擇桌機帳號區或手機帳號Modal，非雙DOM複製。保留原navigation guard及角色金／銅色；手機明確block外殼取代滿版auto-grid導覽空白。
- ERP搜尋類別下拉目前提供已支援「商品」；下方品號／品名切換，輸入欄上方不重複label，placeholder隨模式變化；所有寬度維持右側查詢按鈕。原生日期欄位位於歷史開關下面；額外類別待其正式能力加入，不提供假客戶查詢。
- 同一shared date owner涵蓋全介面與Worker：三個曆年周年當天允許、下一天拒絕；去年同月同日至臺北今天為空日期預設，修正舊+1天與閏年反向比較問題。ERP清單統一一個table/card presenter，每頁25筆；手機歷史摘要可展開，無第二業務資料流／observer／retry。
- [x] Browser／Worker TypeScript；shared日期與actual Worker/SQLite regression（超三年400且零工作、周年202與預設日期持久化）通過。
- [x] 完整source contracts（11 migrations／52 tables）、Worker/assets build、68項Node regression；AITeam共通檔與CYID canonical Git blob、consumer window核對通過。
- [x] 本機合成browser：Desktop標題20px／說明無可見header、超三年中文Modal；390px收合導覽／Esc／帳號Modal、品名25筆card分頁與點品號新工作；320px修正原生日期造成的grid min-content撐寬，320／768px無表單內或頁面橫向溢出。原生日期與空白最近一年結果確認，未操作正式帳號或真實ERP。
- [x] [PR #174](https://github.com/simonliu1118-byte/chihyuan-web/pull/174) exact head `dd62e704cb71238ce896423db0c27fb2e98a05f8`：Governance `38910610889`、Runtime `38910611048`（四jobs／actual isolated Worker+D1）、deployment contract `38910611136` 全通過；合併 `c33a74aa57d8277fc6629be061e668c8eabefccc`。PR未執行真部署。
- [x] [原網站部署 38910827315](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/38910827315) attempt2於 **2026-10-16 21:52:13 Asia/Taipei** 完成。Deployment `9dfede0054fb76ad16a9102a8d660e529373663b` 雙parent向前推進，tree `c034d620b18543f7a49ee8a5dc5885a05842b1bf` 與已驗main完全相同；原Worker、每日cron、雙入口 exact source/consumer/D1、invalid Session及正式Identity strict gate全通過。attempt1最後唯讀稽核回報 `CYWEB_AUDIT_SNAPSHOT_CHANGED`；未改動或略過guard，原提交重跑後通過，不推定第一次變動來源。
- [x] 獨立公開回讀 **0.7.37／consumer1.0.5／9dfede00／D1 ok**；正式HTML載入bundle包含搜尋類別、收合模組選單及三年中文限制。未新增migration／binding／authority；真實ERP與新增介面的真人操作仍由既有人工驗收追蹤。

## CY 程式補列 ERP 自動輸入工具 — 2026-10-16

- Source **0.7.32 Build 0／consumer1.0.5**：補列 CYERPAutoInput，顯示「SMART ERP 自動輸入工具」，沿用中央正式 Auto SVG、正式 `cyerp-auto-input-v0.2.9` 與 `CYERPAutoInput_V0.2.9.zip`。程式說明依上游 README 描述平台訂單匯入、銷貨單自動輸入與依設定儲存／列印；此工具與 CVT 說明均不使用「鼎新」。
- 維持每日03:00單一 producer；新增程式會以已確認 source snapshot 補入舊共用清單，現有成功版本保留，新清單等待每日排程，不因部署／開頁額外查詢 GitHub。不新增狀態 owner、render path 或資料表。
- [x] 正式 ZIP HEAD 回200／156847952 bytes（未下載執行）；中央 Auto SVG byte/hash 記錄、共通規則與 CYID canonical byte 核對通過。Browser／Worker TypeScript、14項 catalog regression、完整 build、全部 source contracts 通過。新增正式產品 tag／asset 與 OCR 模型排除、舊清單補新程式與無當日重試驗收。
- [x] 本機合成 USER Desktop：九項清單、新工具正式圖示／V0.2.9／日期／下載、CVT 說明與整頁無「鼎新」確認。未登入正式帳號或操作業務資料。
- [x] [PR #167](https://github.com/simonliu1118-byte/chihyuan-web/pull/167) exact head `cd47e97fed42dd1a591db6fcd544fd7b309cc2dd`：Governance `38844904852`、Runtime `38844904920`（四jobs／actual isolated Worker+D1）、deployment contract `38844904854` 全通過；合併 `162d9d9887a57c230932566936916163e296033a`。PR未執行真部署。另於390px手機確認同一程式卡片／說明且無橫向溢出。
- [x] [原網站部署 38845036800](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/38845036800) 於 **2026-10-16 11:22:00 Asia/Taipei** 完成。Deployment `6832a9a679a472f4af7f08027cca16cb8d39c5e8` 雙parent向前推進，tree `ed44bc34cf69549b2a2744901b7013e95e322d83` 與已驗main完全相同；原Worker、每日cron回讀、雙入口 exact source/consumer/D1、invalid Session與正式Identity strict gate 全通過。未新增 migration／binding／authority。
- [x] 部署後獨立公開回讀 **0.7.32／consumer1.0.5／6832a9a6／D1 ok**，實際前端bundle含 Auto 正式圖示。名稱／說明／下載由 authenticated API 回傳，部署證據為 exact source＋actual Worker/D1 regression＋合成 Desktop/Mobile browser，未登入正式帳號。首個真實每日排程仍預定2026-10-17 03:00；本輪不額外觸發 GitHub 更新。

## CY 程式每日自動更新 — 2026-10-16

- Source **0.7.31 Build 0／consumer1.0.5**：依使用者要求移除「更新版本」按鈕，改為台灣時間每日凌晨 **03:00**（UTC `0 19 * * *`）由伺服器查詢正式 Release。頁面只讀取共用清單；持續開啟的頁面在下次排程後讀取一次結果，卸載會取消讀取與計時器。
- Mutation owner 為 scheduled handler → catalog service；新增 `0008_program_catalog_state.sql` 單列 D1 公開 metadata cache，以原子每日 claim 與 completion token 防止跨執行個體重複查詢及舊結果覆寫。每個排程日最多一批有界查詢；失敗保留最近成功清單、不於當日重試。第一次排程前明示等待自動確認。
- State owner 為 D1 cache，前端沿用單一 ProgramCatalogView／FeedbackProvider。此 cache 不含帳號／業務資料、不改 Identity authority，排除於 portable business backup 與 schema fingerprint，既有備份相容性維持。原選用備份排程仍獨立於每日清單排程，不會被清單排程觸發。
- [x] 本機 Browser／Worker TypeScript、完整 build、全部 source contracts（8 migrations／49 tables）、60項 Node regression 通過，包含真實 SQLite 原子 claim／跨日恢復／stale completion fencing／讀取不查 GitHub、舊備份 fingerprint、排程分流與部署後 schedule 驗證器。
- [x] 本機合成 USER browser 確認無「更新版本」按鈕、每日03:00說明、首次等待狀態與原版本／下載清單。未操作正式帳號或業務資料。
- 本機 actual Wrangler+D1 runner 缺少 npx，完整隔離 Worker+D1 與 POSIX deployment-config 權限檢查交由 required Linux CI；本機 SQLite 回歸不代替 actual D1 驗收。
- [x] [PR #165](https://github.com/simonliu1118-byte/chihyuan-web/pull/165) exact head `186a2b872df35131960c8c7534cf3b9b60560e74`：Governance `38844156966`、Runtime `38844156968`（四jobs／actual isolated Worker+D1／daily catalog regression）、deployment contract `38844156972` 全通過；合併 `81bbb488a31563ff125511ed2cf590bff81587df`。PR未執行真部署。
- [x] [原網站部署 38844282570](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/38844282570) 於 **2026-10-16 11:13:10 Asia/Taipei** 完成。Deployment `0bb171bc8b5948c3fb9faa9eb097dbb6971c1264` 雙parent向前推進，tree `1709489059bc45663ba5828874c4c9587883b06f` 與已驗main完全相同；migration、原Worker部署、protected runner 回讀實際每日 cron、雙入口 exact source/consumer/D1、invalid Session與正式Identity strict gate 全通過。
- [x] 部署後獨立公開回讀 **0.7.31／consumer1.0.5／0bb171bc／D1 ok**；實際載入的前端bundle包含每日03:00與首次等待說明。首次真實排程預定 **2026-10-17 03:00 Asia/Taipei**，尚未發生；不宣稱已成功取得 GitHub 最新資料或已根治外部 quota。

## CY 程式清單更新與名稱 — 2026-10-16

- 使用者回報「更新版本」出現紅／黃重複提醒；程式以 `current=false` 明示保留已確認 snapshot，但頁面又將同一次 failure 顯示為紅條。移除 page-local error state／紅條，沿用單一 FeedbackProvider 中文 Dialog；關閉後只保留既有黃色 snapshot 狀態。提醒區分 RATE_LIMIT、一般 HTTP403、NETWORK/TIMEOUT 與不完整回應，不將所有403都稱為限流。
- 截圖沒有顯示這次 `refreshFailure` 分類，不能僅從畫面斷定當次原因；先前線上 RATE_LIMIT 證據仍保留。既有五分鐘成功 cache、provider cooldown、最近成功版本保留與 no-retry 路徑不變，不宣稱永久消除外部限流。
- Source **0.7.30 Build 0／consumer1.0.5**：加入已正式發版的 `smartcopiconverter-v1.0.1` tag／compiled ZIP 規則；原本沒有規則，即使 live lookup 成功也維持未發版。公開 Release metadata 確認非 draft／prerelease，ZIP HEAD 跟隨正式下載回200、2447073 bytes；未執行程式。
- 公開 Release fallback snapshot 同步至本輪已確認的 Accounting Web0.22.15、Accounting1.3.0、Invoice2.6.19、TriINVCalc1.5.6、Converter1.0.1；同一 reader 從本機真實匿名 GitHub 取得 `current=true` 且正確版本。這不代表 Cloudflare 出口的 quota 永久恢復。
- 顯示名稱改為「電子發票工具」「信封套印工具」「盲浮水印工具」；共用 catalog 同時供 table／card，維持內部穩定 ID 與圖示。信封／浮水印工具仍無公開正式 Release，不提供猜測的下載。
- [x] Browser／Worker TypeScript、完整 build、全部 source contracts 與47項 Node regression通過。新增 converter exact tag/asset／缺新ZIP不得借用舊ZIP／draft/prerelease/untrusted link、table/card名稱與單一狀態、中文 failure分類；既有 actual catalog route／reader／cache cooldown/recovery regression一併執行。
- [x] 本機合成 USER browser：更新成功→限流彈窗→關閉只一條黃狀態／無紅條→一般403不誤稱限流→恢復後清除警示；Desktop converter版本／日期／下載、三名稱與390px手機卡片無橫向溢出通過。沒有登入正式帳號、異動權限或正式資料。
- [x] [PR #163](https://github.com/simonliu1118-byte/chihyuan-web/pull/163) exact head `22a0e9c319f825137b1e161a37807cb46dcb9d8f`：Governance `38841551777`、Runtime `38841551769`（四jobs／actual isolated Worker+D1／新增catalog regression）、deployment contract `38841551742` 全通過；合併 `0d5f4e2f8fdad700de634f4ac22d4d25f3cd5ea2`。PR未執行真部署。
- [x] [原網站部署 38841704073](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/38841704073) 於 **2026-10-16 10:42:45 Asia/Taipei** 完成。Deployment commit `107dda04936975b457cd196d3d1d5138ed52c0df` 雙parent向前推進，tree `b08b0ccc9c8dc65786492cae9728c649615d982c` 與已驗main完全相同。原Worker部署、雙入口 exact source/consumer/D1、invalid Session與cookie clearing、正式Identity strict gate 全通過；未新增 migration／binding／authority。
- [x] 部署後獨立公開回讀 **0.7.30／consumer1.0.5／107dda04／D1 ok**，正式頁面載入的前端bundle包含新分類提醒。程式名稱／下載由已登入API回傳，不內嵌在前端bundle；其部署證據為 exact source＋Worker/catalog regression＋合成 browser，未登入正式帳號或宣稱已驗收 Cloudflare 真實 quota 恢復。

## 主動同步登入與撤權 — 2026-10-16

- [x] 使用者確認「帳號與郵件完整驗收 OK」及「真實角色與權限驗收 OK」；作為本輪真人總體驗收結果，沒有另行推定未逐項記錄的裝置／故障組合或 CYACCweb 驗收。
- 使用者回報撤權只能在下一次操作得知，已選定：**單一模組撤權 → 退出該模組並跳中文提醒；帳號停用／登入失效 → 返回登入頁**。
- Source **0.7.29 Build 0／consumer 1.0.5**：AuthGate 統一持有 principal／Module Access snapshot，前景每 30 秒與 focus／visibility return／online 確認；每次只一筆、有十秒期限／一秒合併間隔、隱藏暫停排程、卸載 abort／stale fencing。沿用 `/auth/me` 的可選 Module Access expansion 與既有 app-local service；無新增 Session authority／heartbeat table／業務重試。
- 確認 active module 撤權時先 render gate／unmount，取消未完成 dirty navigation，再強制返回仍可使用的帳號頁；共用中文 Dialog 指出模組及未儲存內容不會送出。其他模組撤權只更新導覽；管理角色失去必要權限時退出管理頁。保留 server 每次 protected operation 的即時拒絕。
- Protected 401／403 只發出 authority refresh signal，不自動重送 mutation。503／斷線／不完整 snapshot 不視為撤權或登出，保留當前內容並一次提醒，恢復後重新確認；卸載頁面的延遲錯誤不蓋過撤權提醒。
- [x] 本機 Browser／Worker TypeScript、完整 Worker+assets build、全部 source contracts、43 項 regression 通過；新增 monitor cadence／hidden／deadline／stale／logout fencing、combined route current grants／inactive member／SUPER_ADMIN／invalid Session／outage、API denial signal／no retry 測試。Windows 不適用的既有 backup schedule test 仍由 Linux CI 驗收。
- [x] Chrome 合成 API 六情境：idle 撤權／dirty editor＋pending navigation取消、非 active module 撤權保留欄位、invalid Session 回登入且停止檢查、503 保留欄位並僅一次提醒／恢復後撤權、protected403 提早重新確認與精確彈窗、一般 action403 不誤撤權；零業務 mutation，無真實帳號操作。
- [x] 中央契約更新先獨立同步：[治理 PR #160](https://github.com/simonliu1118-byte/chihyuan-web/pull/160) exact head `eaedc989ab73835350dd046bdb10972daef86341` Governance `38780595302`／deployment contract `38780595293` 通過並合併 `056abb96b9aeba14444b5159e6b52fe7b5e96fda`。七項 canonical package 鏡像更新至 1.0.6；本輪 consumer 仍 1.0.5，在 1.0.0–1.0.6 支援窗內，未引入私有通知功能或部署。
- [x] [功能 PR #161](https://github.com/simonliu1118-byte/chihyuan-web/pull/161) exact head `5eb11023380a34c90cf77ed5b1d966e0461e3faf`：Governance `38780977595`、Runtime `38780977593`（四 jobs，含新增回歸與 actual isolated Worker/D1）、deployment contract `38780977670` 全通過；合併 `c13c28f33c0e51a5941c68bec451cc42479cc985`。PR real deploy skipped。
- [x] [原網站部署 38781263296](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/38781263296) 於 **2026-10-16 01:56:24 Asia/Taipei** 全部完成。Deployment commit `d242702c6e6989207c96793454a1e373f1a83c3b` 由前部署與已驗 main 雙 parent 向前推進，tree `61036e4574af292149566b3683e454fcdac6bcf8` 與已驗 main 完全相同。原 Worker deploy、雙入口 exact source／consumer／D1 health、invalid Session/cookie clearing及 canonical production Identity strict gate 全通過；沒有新增 migration、Worker 或 authority。
- [x] 部署完成後獨立回讀正式入口 **0.7.29／consumer1.0.5／d242702c／D1 ok**，無登入 Chrome 確認原中文登入與 Enter 行為；零登入 POST。部署進行中獨立首次健康讀取仍為 0.7.28，於同一 run 完成後已轉新 source，未重新部署；不宣稱歷史 propagation 問題已根治。
- [ ] 使用者重新整理後確認本輪主動撤權的間隔與中文提醒；既有帳號／郵件與角色／權限驗收維持已完成，不要求重做全部流程。

## 帳號介面與全站中文錯誤提醒 — 2026-10-15

- Source **0.7.28 Build 0／consumer 1.0.5**：登入標題改「志遠企業管理系統」、員工編號 Enter 使用既有鍵盤 foundation 移至密碼、忘記密碼置中；右上帳號按 CYACCweb 相同 Workspace Role 與色值顯示金色超級管理員／銅色管理員。
- 使用者帳號標題右側只保留「新增使用者」，既有共用 Dialog 內填寫編號／姓名／電子郵件／權限；一般 ADMIN 仍只能建立 USER。busy lock、dirty guard、錯誤保留輸入及關閉後焦點回復；刪除確認移除空 body，僅保留一條分隔線。
- 使用者已確認截圖的新增失敗是 **3001 與既有超管編號重複**，不是 Workspace 殘留；不修改 CYID／Workspace／刪除語意，不刪真人帳號或清理資料。
- 單一 FeedbackProvider 沿用共享 Dialog，涵蓋登入、帳號／權限、六業務模組、設定／Audit／備份／程式清單的失敗提醒；API browser boundary 統一中文錯誤與欄位訊息，未知英文／診斷碼只顯示安全中文。保留 status/code/requestId 供既有程式判斷，不把所有 409 都誤報為 stale。原生表單驗證亦改中文彈窗，無請求攔截、observer 或第二業務 authority。
- 驗證信初寄／重寄／資料修改後的部分寄送失敗不再誤報已寄出；備份未完整驗證、程式版本 fallback 亦明確提醒。沒有真寄信或真實備份操作。
- 本機 browser/Worker TypeScript、完整 Cloudflare Worker+assets build、目前 required source contracts、既有 31 項可在 Windows 執行的回歸，以及中文 message/API boundary tests通過；Desktop/Mobile 合成 API 瀏覽器測試涵蓋登入 Enter、重複錯誤、表單保留、dirty guard、刪除取消／確認與刷新、原生 required、角色顏色／ADMIN 限制、十個頁面載入錯誤及手機視窗。合成證據不等於真人帳號／收信驗收。
- 為通過既有 Cloudflare plugin peer requirement，Wrangler 最小相容修正至 4.141.0；未改部署 owner／binding／D1／權限。
- [x] [PR #158](https://github.com/simonliu1118-byte/chihyuan-web/pull/158) exact head `25d907bb4137e236f185c591d433875e7d177a23`：Governance `38748796856`、Runtime `38748796855`（四 jobs，含 feedback suite／actual isolated Worker+D1 acceptance）、deployment contract `38748796781` 全通過，PR real deploy skipped；合併 `b67324a74dc1b176e0717188eb256891e0fc7688`。
- [x] 使用者本對話明確批准部署後，[原網站部署 38749325020](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/38749325020) 於 **2026-10-15 22:13:51 Asia/Taipei** 完成。Deployment commit `810a29abd043421f946fa52fc874fe7ecd5c642d` 為原部署 ref 與已驗 main 的雙 parent，tree `67964154d7059bcc4875b0497ba2b4acf32e6562` 與已驗 main 完全相同；無 force update。原 Worker deploy、雙入口 exact version/consumer/source/D1 health、invalid Session cookie clearing、原 canonical production Identity strict gate全部通過；沒有新增 migration、Worker 或 identity authority。
- [x] 部署後另以公開健康端點回讀 **0.7.28／consumer1.0.5／810a29ab／D1 ok**；正式網站無登入 browser 目視及自動確認中文標題、忘記密碼置中、員工編號 Enter 移至密碼，零登入 POST、未輸入真實密碼。登入後角色／帳號操作仍以本輪合成測試及待使用者實測清楚區分。
- [x] 使用者已確認帳號與郵件完整驗收、真實角色與權限驗收 OK（2026-10-16）；本輪新增主動撤權處理另列上方。首次業務上線前的 testing deletion/Audit 恢復 gate 維持下列既有項目。

## 測試期帳號刪除與寄信入口 — 2026-10-15

- 使用者批准測試期可刪除已驗證帳號，暫停新增／刪除Identity Audit；中央能力與恢復條件以CYID canonical consumer standard §17.2為準，不在Web另建帳號authority。
- Source0.7.27／consumer1.0.5：沿用帳號列表與DELETE代理，僅在provider明確回傳testingAccountDeletionAllowed=true且目前為Super Admin時，顯示已驗證帳號刪除；缺少能力仍維持pending-only。使用共用ConfirmDialog「確定刪除帳號／保留帳號」，刪除結果確認後才刷新清單；新增提示明確寫從CYWEB用信中一次性密碼完成驗證；移除登入／首次驗證頁共用底部灰色技術說明。
- [x] Web 0.7.27／consumer1.0.5：PR #156／#157 已合併，部署 `38717773511` 雙入口 health 與 production Identity strict gate通過；CYID0.3.9 production `38718039836` validate/deploy/version/session-rejection通過（2026-10-15 18:08 Asia/Taipei）。未刪任何真人帳號／重寄Email。
- [x] 使用者已回報帳號與郵件完整真人驗收 OK（2026-10-16）；本對話沒有逐項細節，不另宣稱所有刪除／重建／故障組合都有獨立證據。
- [ ] **業務第一版前**依CYID TODO恢復已驗證不可刪及新增/刪除Audit，更新Web契約mirror並驗收刪除入口隨provider能力關閉；保留既有business history，不將舊projection或Module Access轉給重建帳號。

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
- [x] 先前同事回報「新使用者信件→CYWEB設定後 Email 未驗證／新密碼不能登入」；authority 修正與 0.7.28 部署後，使用者於 2026-10-16 確認帳號與郵件完整驗收 OK。沒有該舊請求逐筆證據，仍不推定其唯一根因；本輪未代改密碼／重發信。
- [x] 正式 Identity／core portal 切換的既有 authority、中央契約及原business D1已核對；按本次全部模組開放授權處理原Worker，沒有重播provider provisioning、擴大IAM、搬動帳務或製造第二套帳號。
- [x] CYWEB端正式 authority／Workspace／core App／consumer／D1 gate已通過，回交證據收斂至既有 Identity deployment文件下方 CYACCweb handback。
- [ ] CYACCweb接手於自己的 protected runner 重跑 `--require-account-portal`，核對其最新 main後再推進 Draft #435；CYWEB未代合併或部署帳務。真 Email、一次性密碼→正式密碼→重新登入→CYACC一般登入仍未驗收，本輪未新增帳號／寄信。

操作與回交證據依既有 [Identity deployment](docs/development/IDENTITY_DEPLOYMENT.md#account-portal-authority-read-only-audit)；此 TODO 為唯一進度表。

## 目前基準 — 2026-10-16（Asia/Taipei）

- 目前已部署 **0.7.37 Build 0／CYID consumer 1.0.5**（本輪共用頁首／手機搜尋／全介面日期驗證與部署見上方；canonical contract mirror1.0.6）。已包含PR169～173的ERP獨立Module Access入口、Agent連線、批號／歷史及品名搜尋；現行contract與既有handoff report為介接依據。既有全部模組沿用原Worker／business D1／Module Access；使用者已確認帳號／郵件與真實角色／權限驗收OK。新增ERP能力的真人驗收、業務首版及乾淨schema仍分開追蹤。
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
- [ ] **GitHub 真實每日排程與 quota 恢復驗收**：0.7.31 已以 D1 全域每日 claim 取代五分鐘／fallback process cache 與 provider cooldown；頁面不再查詢 GitHub，每排程日最多一批、失敗保留最近成功版本，跨 isolate SQL 與 actual Worker+D1 regression／實際已安裝 cron 驗證通過。首次真實每日執行與 provider quota 恢復仍待次日排程確認，不以此推論外部限流永久消除。診斷只回 allowlisted code／HTTP status，不回 provider body、headers、exception text、IP／credential。
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
| Identity | 單一登入、first-login ticket 與 normal Session 分離、設定正式密碼後要求重新登入；consumer exact-sync；invalid provider Session fallback；使用者 2026-10-16 確認帳號／郵件完整及真實角色／權限驗收 OK | 本輪主動撤權處理的部署與真人確認；未逐項留證的裝置及故障組合不外推 |
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

- [x] **帳號與 Email 真人驗收**：使用者 2026-10-16 確認完整驗收 OK，取代先前延後狀態；不要求重做既有驗收。本輪不代建立帳號、寄信或改密碼，未留逐項紀錄的故障案例不推定已逐一執行。
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

# CY Web TODO 已結案歷史快照（2026-10-23 歸檔）

本檔保存從根 `TODO.md` 移出的**原文歷史段落**：原本已全部完成且沒有未勾選待辦的舊版成果、以及 2026-10-16 已失效的「目前基準」。以下內容的「目前／最新／下一步」均指當時，不代表 2026-10-23 現況。現行狀態看根 [TODO](../../TODO.md)；Claude/GPT 工作單及 handoff 原文仍在原位置，沒有搬移、刪除或重寫。

來源：2026-10-23 `main` 基準 `0da3b2bc9a7071388809c5528c90a56b07e92c8c`；每節內容照原樣保留，未做歷史真偽的事後改寫。

## 新 GCS 憑證驗證 — 2026-10-18

- 使用者已回報在既有 development Environment 新增Web專用GCS JSON Secret與bucket變數；以main-only `audit-backup` dispatch實際驗證，不能只看設定存在。
- 新增只讀JSON／JWT／bucket IAM驗證：不讀寫object、不執行SQL、不部署、不開排程；僅輸出綁定存在boolean／required permission結果與stable code。GCS驗證成功與manual inputs／schedule是否啟用分開。
- [x] PR／CI合併後protected audit39056878172已驗新key及GCS所需四項object權限；真實雙副本與GCS隔離還原亦已通過，詳Build1驗收。

## GCS 真實 Worker 傳輸返修 — 0.8.7 Build1

- 真實manual R2已verified、GCS failed後，以actual workerd重現兩個Node mock看不到的原因：儲存bare fetch再以this.send()呼叫，native fetch的this錯誤，在送出Google請求前Illegal invocation；修正receiver後另重現workerd只支援manual/follow，不支援redirect=error。
- 改預設sender以globalThis.fetch呼叫；redirect=manual且顯式拒絕全部3xx，固定JWT／GCS端點、credentials不跟址、逾時／bytes界線保持。新增actual workerd default nativefetch／WebCrypto regression，模擬Google JWT→IAM→immutable upload→exact readback，另驗OAuth轉址只發一次、不送第二站；兩個CI都執行。合成key僅process memory，未使用正式key或資料。
- [x] 本機131 Node／typecheck／build／actionlint／Governance及獨立review通過；[#189](https://github.com/simonliu1118-byte/chihyuan-web/pull/189) CI全success，合併 `b8bcc57524466c085f3642be67b816c7d0e9bd9c`。授權發布 [39058825249](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39058825249) success，live **0.8.7 Build1／active72／100%**，原主D1／Identity／隔離目標不變。兩入口exact health／HTTPS／實際JS／HSTS／invalid Session獨立驗證通過，catalog cron回讀僅`0 19 * * *`。同項目返修，BUILD=1不另升Z。
- [x] 真人同事件GCS retry於台灣02:38:23成功，原manual仍97筆／33,064 bytes，雙端verified且errorCode=null；未重匯出。
- [x] 真人明確選GCS隔離還原，台灣02:39:55先建立104筆／34,359 bytes的雙端verified安全備份，再於固定獨立D1還原97筆。structured Audit started／verified有authenticated actor、provider=gcs、固定空目標與安全事件關聯，aggregate durable count=97；主D1binding保持，驗證副本保留。正式資料與實際資源識別值不進Public Git。

## 隔離還原入口與手動備份部署 — 2026-10-18（Asia/Taipei）

- Source **0.8.7 Build0**：基於 Claude 已合併的0.8.6畫面／記住我修正，補既有 SUPER_ADMIN 備份頁的隔離還原確認視窗、同源／嚴格JSON API與固定 `RECOVERY_DB`；可明確指定 GCS，不以健康 R2 的讀取代替 GCS 還原。GCS失敗只持久化固定allowlist診斷（auth／request／upload billing或denied／read／integrity），未知例外一律泛化；不保存provider原文。沿用單一 BackupService／portable restore／Audit owner，既有雙端安全副本、空白與同批次寫入再檢查、schema／Workspace／bytes核對不變。
- 受保護部署在 current-main guard 後準備固定獨立D1；相同名稱不足以證明owner，既有目標須已綁此Worker；與主D1同ID拒絕、非空目標保留且不升migration、不清空或自動換目標。建立成功但首次binding失敗後須owner核對，不能盲重跑採用。
- [x] GCS只讀audit [39056878172](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39056878172) 通過真實新key與四項object權限驗證；沒有存取備份內容。使用者已設定R2、手動啟用true、排程false三變數。
- [x] 舊source發布 [39057334816](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39057334816) 被 current-main guard 攔下，無遠端變更；改採最新main `b474f046073461a189aecc6fd8f150bb62a29875` 的 [39057509990](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39057509990) **success**，live **0.8.6／consumer1.0.5／active69／100%**。原主D1／正式Identity保持，R2與GCS Secret已綁定，`BACKUP_ENABLED=true`、`BACKUP_SCHEDULE_ENABLED=false`，全部部署health／HTTPS／portal gates通過。
- [x] 本機128 Node、14 migrations／17 actual Worker＋D1 checks（含chunked限量、GCS明確選取、同事件安全診斷／未知機密錯誤泛化）、Browser／Worker TypeScript、source、build、deploy config、actionlint／Governance及獨立source review通過；Chromium1280／390雙確認、預設GCS、busy不能關閉、單次執行／成功後refresh驗收無錯誤。
- [x] [#187](https://github.com/simonliu1118-byte/chihyuan-web/pull/187) head `8837348025e80d26ec71dc19cea04c2b673de7e6` 的遠端Runtime／部署合約／Governance均success，合併 `8cca0379a13b7392a1af6bcd0e3b91c3c4ab442a`；[39058390526](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39058390526) 發布success。live **0.8.7／active70／100%**，固定獨立RECOVERY_DB已建立／遷移／綁定，與主D1不同ID；主D1／Identity相同，manual=true、schedule=false。
- [x] 真實雙端副本／GCS隔離還原／雙端安全備份／reconciliation／Audit已通過，詳上節Build1驗收；原02:23:27事件的初始GCS失敗已在同事件retry補齊。

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

## 目前基準 — 2026-10-16（Asia/Taipei）

- 目前已部署 **0.7.37 Build 0／CYID consumer 1.0.5**（本輪共用頁首／手機搜尋／全介面日期驗證與部署見上方；canonical contract mirror1.0.6）。已包含PR169～173的ERP獨立Module Access入口、Agent連線、批號／歷史及品名搜尋；現行contract與既有handoff report為介接依據。既有全部模組沿用原Worker／business D1／Module Access；使用者已確認帳號／郵件與真實角色／權限驗收OK。新增ERP能力的真人驗收、業務首版及乾淨schema仍分開追蹤。
- 已包含 0.7.24「CY 程式 → 價格觀測室（原型）」外連，原型程式位於 CYapps `apps/CYPriceDesk/`，維持 Sites owner-private 與 ChatGPT 登入；未發版桌面程式仍不提供下載。
- 先前已部署 source **0.7.22 Build 0** 已加入單次切換模組提醒，並沿用 Customer／WorkLog 共用 Dialog／ConfirmDialog，修正關閉焦點並移除六模組／Shell 工程描述；包含 quota cooldown／最近成功版本保留及 skip-link 修正；CY 程式頁仍依使用者要求不顯示「發版說明」連結。六模組獨立自動驗收準備完成，目前為 UI／UX 與小功能整理階段。
- 本輪 source **0.7.23 Build 0／CYID consumer 1.0.4** 在既有「帳號與權限 → 系統使用權」新增 Super Admin 的「登記系統」，由 CYID core Session 決定目前 Workspace；其他員工使用權仍在既有清單管理。共享 Dialog／Field／dirty guard／Toast，無 browser registry authority。Provider #416／development #158 與 Web #146／development #138 已通過 CI／部署；七個 canonical mirrors1.0.4 已同步。使用者在原 development portal 完成 CYInvoice 真人登記／目前 Workspace 啟用，畫面已出現 CYInvoice。一般員工 App Access、取消／dirty guard／busy／行動裝置仍待驗收，不因 Super Admin 永遠允許就視為其他員工已授權。
- 固定入口 `https://admin.chihyuancm.com` 沿用原 CYWEB Worker與business D1；Identity authority 切換以本輪 post-deploy strict gate為證據，GitHub environment／deploy ref 的 development 名稱保留作既有操作標籤。
- 六個業務模組及 Settings/Audit 使用單一 React → protected Worker API → D1。舊 local business authority、Group proxy、activation 入口與重複 local pages 已退休；無另加版本殼。
- 備份／isolated recovery 工程已實作；實際雲端備份及排程仍未啟用。乾淨 production 業務資料 cutover 尚未執行，與本次正式 Identity綁定修正分開。

- 本輪已完成單次切換模組提醒與既有 SUPER_ADMIN Desktop 驗收；後續依下方未勾選項目整理共用 UI／UX。

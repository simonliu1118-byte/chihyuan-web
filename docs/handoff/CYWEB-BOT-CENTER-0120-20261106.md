# CY Web V0.12.0 BOT 管理中心交接

- 日期：2026-11-06。初始基準 `main@dc475720`；本輪依最新 `main@5982b09ee0de2d9c06e47e3c7a47e4f72b4c1a06`（V0.11.5）重新整合，保留 PR #437／#439 的已合併內容。
- 工作分支 `cursor/bot-center-5273`，PR #438。Claude 審查待填。
- **最新授權（2026-11-07）**：使用者明確指示「438交給你修好，然後兩個都可以合併部署」。先合併 #440，再整合 #438，正式 migration 只由 main 的受控部署工作執行。下方先前的「不合併／不部署」是當時狀態；目前結果以本文件最後一節為準。

## 使用者看到的範圍

在既有志遠企業管理系統裡新增「BOT 管理中心」。左側選單跟「ERP 查詢」同一組（沒有組名），就在它下面，不放進「業務模組」「系統管理」或「工具」。網址是 `#bot-center`。

畫面沿用現有表格、狀態膠囊、欄位與短視窗，只有四區：

1. 各 BOT 進度狀態。一開始有社群小編、內容專家、CEO、IT，之後可在同一頁新增。
2. 待審稿。通過或退回，理由可以不填。
3. 回報。
4. 今日完成時間軸。今天以台灣時間計算。

超級管理員不用另外授權就看得到。其他人要在「帳號與權限」勾「BOT 管理中心」。「帳號與權限」的分組程式沒有改，這個代碼因為不是 `ERP_` 開頭，會出現在該頁既有的「業務模組」欄位群。

## 審核邊界

通過或退回只寫回這篇審稿的狀態、選填理由、審核人與時間，讓原來的 BOT 讀得到。

它不會發到 Facebook、Instagram 或 Threads，不會建立正式發布工作，也不會打開自動回覆。BOT 管理中心是審核畫面，不是自動發布開關。

## 資料與架構

- 模組代碼 `BOT_CENTER`，路由 `bot-center`。沒有 `MODULE_REQUIREMENTS`。人的操作走既有 CY Web session 與 `requireModuleAccess`。
- 機器送件用一組可輪換憑證，做法與 ERP 查詢程式的憑證相同：明文只在產生時顯示一次，資料庫只留 SHA-256。這不是員工帳號，也不是第二套身份。沒有憑證的公開請求會被拒絕。
- 新表：`bot_profiles`、`bot_drafts`、`bot_reports`、`bot_completions` 納入可攜備份。`bot_ingest_credentials` 不進備份，還原後要重新產生憑證。`app_member_module_access` 的允許代碼加上 `BOT_CENTER`，既有授權整表搬回。
- Migration：由與出機衝突的 `0053_bot_center` 改為 `0054_bot_center`；保留已合併的 `0053_store_equipment_category`。`CURRENT_MIGRATION` 更新至 `0054_bot_center`，`BACKUP_COLUMNS` 保留出機 category/category_other 並加入 BOT 表；`bot_ingest_credentials` 仍排除可攜備份。舊備份缺這些表時還原成空表，沒有資料語意轉換。
- 人的 API：`GET /api/bot-center`（含分頁游標）、`POST /api/bot-center/bots`、`POST /api/bot-center/drafts/:id/review`、`GET|POST|DELETE /api/bot-center/credentials`。產生／輪換／撤銷憑證限超級管理員（前後端雙重限制）；其他 BOT_CENTER 授權使用者可檢視與審稿。
- 機器 API：`POST /api/bot-ingest/progress|reports|drafts|completions`，以及 `GET /api/bot-ingest/drafts/:id` 與 `GET /api/bot-ingest/drafts?botCode=&externalRef=`。
- 同一 BOT、同一個 `externalRef` 會回到原來那篇，不會把已審結果改回待審。
- 規格：[BOT_CENTER.md](../architecture/BOT_CENTER.md)。沒有做「工作台」，也沒有改 V0.11.2–V0.11.4 的交接或分支。

## 修改檔案

- 模組與殼層：`shared/modules.ts`、`shared/bot-center.ts`、`src/App.tsx`、`worker/index.ts`。目前 BOT 進度每 30 秒以可見分頁為條件自動更新，另提供完整手動刷新；審稿、回報與今日完成均提供「載入更多」，後端 cursor 與 UI 串接。
- 本模組：`src/runtime/modules/BotCenterPage.tsx`、`bot-center.css`、`src/runtime/api/bot-center-client.ts`、`worker/http/bot-center-routes.ts`、`migrations/0054_bot_center.sql`、`scripts/bot-center.test.mjs`。
- 備份與稽核標籤：`worker/backup/portable-backup.ts`、`worker/backup/schema-columns.ts`、`scripts/validate_schema.py`、`src/runtime/modules/change-log-labels.ts`。`scripts/store-equipment.test.mjs` 在**保留 V0.11.4 財產號／類別測試**的前提下，將備份等級斷言更新為 `0054_bot_center`，出機還原比對不變。
- 版本與文件：`VERSION`、`package.json`、`package-lock.json`、`CHANGELOG.md`、`TODO.md`、架構索引、資料字典、元件清單、本交接。

## 如何驗證

- `npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local` 通過。本機 D1 已套到 `0054_bot_center.sql`，這是本機驗收庫，不是正式 migration。
- 舊工作分支曾有 645 項中 644 通過、1 項因缺 `.tmp/canonical-cyapps` 而失敗的本機結果；**不可當作本次整合後的驗證結果**。已新增普通使用者無法操作憑證、超過 50 筆分頁不重漏、時間軸複合游標與重複 GET 無多餘寫入的測試；最新 PR CI 結論待補。
- `scripts/bot-center.test.mjs` 覆蓋：超級管理員不用授權列就能讀；一般使用者沒有 `BOT_CENTER` 會被拒絕；憑證錯誤或撤銷後不能送件；通過後機器讀得到狀態、理由與審核人；再審一次會被拒絕；通過時 ERP 查詢、叫貨、維修的筆數不變；台灣時間的今天會出現在時間軸、昨天不會。
- 正式站登入後的桌面／手機點選還沒在這個環境做。本機沒有可用的 CYID session，無法走過登入後的畫面。

## 風險

- 全系統仍共用一組機器憑證。持有憑證的程式可以讀所有 BOT 的審稿結果（沿用初版設計，需實機驗證與風險接受）；憑證管理現僅限超級管理員，避免一般審稿者造成全部 BOT 斷線。
- 憑證雜湊不在可攜備份裡。還原後要在這個頁面重新產生，否則 BOT 不能送件。
- 「帳號與權限」的欄位群名稱仍是既有規則，導覽位置與授權欄位群的標題不相同。
- 正式 D1 的 BOT `0054` 尚未執行；先前的出機 `0053` 必須保留並依序套用。後續本機 MCP 對話才執行受控驗證／發版，這一輪**只調整 PR，不合併、不部署、不碰正式 D1**。

## 審查紀錄（審查者填）

- 日期、結論（通過／需修正）、意見。執行者不得代填通過。

## 2026-11-06 GPT 初審修正（與 Claude 最終審查區分）

依使用者授權修正以下五項：

1. migration/備份版本：以 V0.11.5 main 重新整合 PR #438，BOT 改為 `0054_bot_center.sql`，CURRENT_MIGRATION、schema-columns、正式 schema 驗證與出機備份測試同步，出機 0053 不重寫。
2. 憑證權限：機器憑證的 POST/DELETE API 必須是 Workspace SUPER_ADMIN，其他 `BOT_CENTER` 授權員工仍可審稿／看進度；UI 隱藏無權憑證按鈕。
3. 進度刷新：前景頁每 30 秒更新 BOT 狀態，避免輪詢覆蓋使用者已載入的審稿／回報頁；另有「重新整理全部」操作。
4. 分頁：審稿／回報採 ID 游標，今日完成採 `completed_at + id` 複合游標，載入更多可遍歷過去 50 筆以後的資料。
5. 初始化寫入：先查詢缺漏的預設 BOT 身份，正常 GET 不再重複執行 4 筆 `INSERT OR IGNORE`；舊備份還原後仍可補回缺漏身份。

- 對上述修正追加迴歸測試，待最新 GitHub Actions 結果寫回，不偽稱已執行正式 D1 驗收。
- PR #438 仍由 Claude 作最終審查；本文件此段是執行者修正紀錄，不代填下方的審查者結論。

## PR #438 最新整合與自動驗證（2026-11-06）

- 整合提交 `4c0cf12d1b0321ed6ec4fdb0cfed8fe3a14a7f11`，以 `main@5982b09ee0de2d9c06e47e3c7a47e4f72b4c1a06` 為基準，將原工作分支 `4f7993cbed4263a1e1d7fa74657dc2f13fde9e20` 併入整合提交，保留原歷史。GitHub compare 的 merge-base 為此版 main，只修改 BOT 相關檔案／必要共用契約；`0053_store_equipment_category.sql` 及 ERP Session 修正保持不變。
- [Runtime Check #42181427921](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42181427921) **success**：browser-typecheck、worker-typecheck、source-contracts、Local D1 runtime acceptance、完整 Node **661/661**、Vite build 均通過。
- [Governance Check #42181427996](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42181427996) **success**。
- [部署契約檢查 #42181427989](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42181427989) **success**；正式 `deploy-development`、身份／備份稽核工作在 PR 驗證中被 skipped，**沒有正式部署**。
- 新增回歸測試：受授權一般員工不可產生／撤銷憑證、50 筆以上的審稿／回報／完成項目分頁、完成時間＋ID 游標不漏頁、正常重複 GET 不再對初始身份寫入。
- 目前為 PR 階段，**不合併、不部署、不操作正式 D1**；Claude 最終審查與登入後桌機／手機畫面驗收尚未完成。待本機有 MCP 連線時，依 `0053_store_equipment_category` → `0054_bot_center` 的正式順序檢查 schema／備份契約，勿改動已套用 migration。

## 2026-11-07 Build 1 返修與合併部署授權

使用者本輪明確指示修好 #438，再把 #438、#440 合併部署。#440 已先合併為 `197f0a6704cf7002af243b338cd2f0b009278a69`，本分支整合該版後保留其盤點 UI，產品版本為 **V0.12.0 Build 1**；不倒退為 V0.11.6。先前不合併／不部署的記載僅為各輪歷史狀態。

### 問題與修正

1. 並行審稿：舊程式用決定及毫秒時間判斷是否自己成功。兩次同毫秒、同決定的請求都可回報成功並寫兩筆 Audit，即使第二次理由沒有儲存。`worker/http/bot-center-routes.ts` 改用同一 D1 batch 的 UPDATE `meta.changes` 判斷；緊接的 Audit SQL 以 `changes()=1` 保證只記真正更新者。輸家回傳 409，時間不再作請求身分。兩個寫入保持同一交易，Audit 失敗會連同審稿回滾。
2. 進度輪詢：舊 30 秒輪詢呼叫完整 state，卻只採用 BOT／憑證，連帶掃描所有歷史審稿計數與讀取三份內容列表。新增同樣 session／模組授權的 GET `/api/bot-center/progress`，只讀 BOT 主檔及憑證狀態；`shared/bot-center.ts`、API client 與 `BotCenterPage.tsx` 共用 `BotProgressState`。完整載入／手動刷新／分頁仍走既有 endpoint，既有審稿清單與游標不被輪詢覆蓋。這項修正消除輪詢造成的歷史掃描，不宣稱完整載入的計數查詢沒有讀取成本。

官方依據：[D1 batch 順序與交易](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)、[SQLite changes()](https://www.sqlite.org/lang_corefunc.html#changes)。條件 Audit 必須緊接 UPDATE，後續不得在兩者間插入其他寫入。

### 修改範圍

- 程式：`worker/http/bot-center-routes.ts`、`shared/bot-center.ts`、`src/runtime/api/bot-center-client.ts`、`src/runtime/modules/BotCenterPage.tsx`。
- 測試：`scripts/bot-center.test.mjs` 增加可追蹤查詢的合成 D1 fixture、權限／查詢範圍驗證、固定毫秒並行送出及 Audit 失敗回滾驗證；既有路徑繼續驗證。
- 文件／版本：`BUILD` 改為 1；`VERSION`／`package.json` 維持 0.12.0；`BOT_CENTER.md`、`CHANGELOG.md`、`TODO.md`、handoff 索引與本文件同步。整合 #440 時保留其完整 changelog／handoff／測試／盤點修改，不改寫 0053／0054 migration。

### 驗證與審查狀態

- BOT 相關測試 **9/9**、前端／Worker TypeScript、`npm run build` 通過。建置僅出現既有 bundle size／fixed-point 動態匯入提示，不是錯誤。
- 另外使用專案安裝的 Miniflare／workerd 本機 D1 進行批次驗證：第一次更新 `meta.changes=1`、第二次為 0，Audit 只保留第一次理由一筆，通過；未連線正式 D1。
- 整合後 Windows 完整 Node 測試：**662 項中 651 通過、11 失敗**，不得稱為全通過。失敗集中於既有測試的 Windows 限制：備份 rehearsal 的 esbuild onLoad 以斜線路徑比對（Windows 沒有替換合成 service，6 項 503）、secure-entry 使用 URL pathname 當 Windows 檔案路徑（檔案層級載入失敗）、deployment-source 寫死 LF 文字切分（1 項）、0043／0044／0045 schema fingerprint 對 LF 原文與 CRLF 原文的預期（3 項；本機 `core.autocrlf=true`）。這些檔案本輪未更動；不為此次 BOT 修正放寬測試。正式驗收以本輪推送後 Ubuntu CI 的完整測試結果為準。
- #440 最新 PR CI 三組檢查通過；隔離快照本機盤點相關測試 **36/36**。
- 整合後完整 Node 測試、最新 PR CI、正式部署及健康回讀：完成後補記證據，不以舊 head 的成功代替。
- 本機 Claude Code 存在但 `claude auth status --json` 回報未登入；**Claude 最終／事後複審仍待辦，執行者不代填通過**。依使用者本輪明確授權繼續合併部署。登入後的桌機／手機目視驗收仍待完成。
- 無新增 production identifier／token；沒有在本機執行正式 D1 寫入。正式 0053 → 0054 migration 及發布只交由既有 main-only 受控 workflow 執行。

### 最新正式 CI 與合併證據

- 修正／整合 head：`4a8fba877eabb3e1a9b2ee93aaa7cb0a5b04d6a7`。
- [Runtime #42252681680](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42252681680) **success**：browser／Worker typecheck、source contracts、Local D1 runtime acceptance、Full Node test suite、Vite build 全部成功；這是本輪 Ubuntu 完整驗收，與上方明列失敗項的 Windows 本機結果分開記錄。
- [Governance #42252681881](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42252681881) **success**；[Deployment Contract #42252681782](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42252681782) **success**。PR 工作中的正式 deploy／audit skipped，沒有冒充部署完成。
- #438 已依本輪使用者授權合併，main source commit：`e7530c07c97b6f8a9428335b85d9ba318842f165`，包含先合併的 #440。
- main-only 正式部署 [#42253210792](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42253210792) 已啟動；完成後追加結果與健康回讀，未成功前不宣稱正式站已更新。

## 2026-11-07 正式部署完成

- 使用者本輪授權的 #440、#438 均已合併，正式產品身分 **V0.12.0 Build 1**（VERSION=0.12.0、BUILD=1）。
- 正式 source commit：`e7530c07c97b6f8a9428335b85d9ba318842f165`。
- [Deployment #42253210792](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42253210792) **success**：validate-deployment-contract 及 deploy-development 成功；正式 D1 migration、Worker／assets 建置發布、排程、來源版本／CYID consumer／D1 健康、HTTPS／靜態資源及正式 Identity authority 驗證均通過。正式目標沿用既有 main-only workflow，沒有另建正式服務。
- 獨立回讀正式站 /api/health：HTTP 200、version=0.12.0、sourceCommit 與上列完全一致、database=ok、identityConsumerVersion=1.0.5。健康 API 既有契約只回傳基礎版本，Build 1 身分由同一 source 的 BUILD 檔追溯。
- 獨立無憑證／未登入唯讀檢查：/api/bot-center 與 /api/bot-center/progress 均 401 AUTH_REQUIRED；/api/bot-ingest/drafts/1 為 401 BOT_UNAUTHORIZED，均沒有回傳業務資料。
- 本次正式內容也包含 main 已合併的 #437／#439（V0.11.4／V0.11.5）及本輪 #440，沒有倒退版本或遺漏盤點修正。
- **Claude 事後複審及登入後桌機／手機目視驗收仍待完成**；此處是執行者的部署證據，不是 Claude 審查通過。未產生機器連線憑證或用正式資料操作審稿。

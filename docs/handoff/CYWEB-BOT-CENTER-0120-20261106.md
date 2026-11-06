# CY Web V0.12.0 BOT 管理中心交接

- 日期：2026-11-06。初始基準 `main@dc475720`；本輪依最新 `main@5982b09ee0de2d9c06e47e3c7a47e4f72b4c1a06`（V0.11.5）重新整合，保留 PR #437／#439 的已合併內容。
- 工作分支 `cursor/bot-center-5273`，PR #438。Claude 審查待填。
- **不合併、不部署、不執行正式 migration。**

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

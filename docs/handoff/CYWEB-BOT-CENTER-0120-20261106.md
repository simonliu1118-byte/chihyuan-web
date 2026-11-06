# CY Web V0.12.0 BOT 管理中心交接

- 日期：2026-11-06。基準 `main` @ `dc47572026749f4dd4d942064d44598e64aa6c94`。
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
- Migration：`0053_bot_center`。`CURRENT_MIGRATION` 跟著前進。舊備份缺這些表時還原成空表，沒有資料語意轉換。
- 人的 API：`GET /api/bot-center`、`POST /api/bot-center/bots`、`POST /api/bot-center/drafts/:id/review`、`GET|POST|DELETE /api/bot-center/credentials`。
- 機器 API：`POST /api/bot-ingest/progress|reports|drafts|completions`，以及 `GET /api/bot-ingest/drafts/:id` 與 `GET /api/bot-ingest/drafts?botCode=&externalRef=`。
- 同一 BOT、同一個 `externalRef` 會回到原來那篇，不會把已審結果改回待審。
- 規格：[BOT_CENTER.md](../architecture/BOT_CENTER.md)。沒有做「工作台」，也沒有改 V0.11.2–V0.11.4 的交接或分支。

## 修改檔案

- 模組與殼層：`shared/modules.ts`、`shared/bot-center.ts`、`src/App.tsx`、`worker/index.ts`。
- 本模組：`src/runtime/modules/BotCenterPage.tsx`、`bot-center.css`、`src/runtime/api/bot-center-client.ts`、`worker/http/bot-center-routes.ts`、`migrations/0053_bot_center.sql`、`scripts/bot-center.test.mjs`。
- 備份與稽核標籤：`worker/backup/portable-backup.ts`、`worker/backup/schema-columns.ts`、`scripts/validate_schema.py`、`src/runtime/modules/change-log-labels.ts`。`scripts/store-equipment.test.mjs` 只把備份等級斷言改成 `0053_bot_center`，出機還原比對沒有改。
- 版本與文件：`VERSION`、`package.json`、`package-lock.json`、`CHANGELOG.md`、`TODO.md`、架構索引、資料字典、元件清單、本交接。

## 如何驗證

- `npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local` 通過。本機 D1 已套到 `0053_bot_center.sql`，這是本機驗收庫，不是正式 migration。
- `node --test scripts/*.test.mjs`：645 項裡 644 項通過。`scripts/audit-account-portal.test.mjs` 因工作區沒有 `.tmp/canonical-cyapps` 而無法載入，與這次改動無關。
- `scripts/bot-center.test.mjs` 覆蓋：超級管理員不用授權列就能讀；一般使用者沒有 `BOT_CENTER` 會被拒絕；憑證錯誤或撤銷後不能送件；通過後機器讀得到狀態、理由與審核人；再審一次會被拒絕；通過時 ERP 查詢、叫貨、維修的筆數不變；台灣時間的今天會出現在時間軸、昨天不會。
- 正式站登入後的桌面／手機點選還沒在這個環境做。本機沒有可用的 CYID session，無法走過登入後的畫面。

## 風險

- 全系統共用一組機器憑證。持有憑證的程式可以讀所有 BOT 的審稿結果，範圍與 ERP 查詢程式的單一憑證相同。
- 憑證雜湊不在可攜備份裡。還原後要在這個頁面重新產生，否則 BOT 不能送件。
- 「帳號與權限」的欄位群名稱仍是既有規則，導覽位置與授權欄位群的標題不相同。
- 正式 D1 還沒有 `0053`。合併後要依既有部署流程套用，這次不執行。

## 審查紀錄（審查者填）

- 日期、結論（通過／需修正）、意見。執行者不得代填通過。

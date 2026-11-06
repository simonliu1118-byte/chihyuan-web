# BOT 管理中心

V0.12.0。頁面在既有 CY Web 殼層，路由 `#bot-center`，左側「ERP 查詢」同一組（`erp-query`，沒有組名）的下一項。模組代碼 `BOT_CENTER`，標籤「BOT 管理中心」。超級管理員沿用既有全模組權限；其他人要在「帳號與權限」授權後才看得到。不使用 `MODULE_REQUIREMENTS`。

## 畫面

四個區塊，沿用共用表格、狀態膠囊、欄位與短視窗：

1. 各 BOT 進度狀態。初始身份是社群小編、內容專家、CEO、IT。同一個畫面可再新增代碼與名稱，不必改表。
2. 待審稿。通過或退回，理由可空白。
3. 回報。
4. 今日完成時間軸。今天以 Asia/Taipei 計算。

## 審核邊界

通過或退回只更新該篇審稿的狀態、選填理由、審核人與時間，並寫一筆共用稽核。原 BOT 用連線憑證把這筆結果讀回去。

這個動作不會發到 Facebook、Instagram 或 Threads，不會建立正式發布工作，也不會打開自動回覆。BOT 管理中心是審核畫面，不是自動發布開關。

## 誰可以呼叫

- 人：既有 CY Web session。Worker 以 `requireModuleAccess(..., "BOT_CENTER")` 判斷，不另做一套帳號。
- 機器：一組可輪換的連線憑證，做法與 ERP 查詢程式的憑證相同。頁面上產生時只顯示一次明文；資料庫只留 SHA-256。撤銷或輪換後舊憑證立即失效。這不是員工、不是 CYID session，也不是第二套身份系統。沒有憑證的公開請求會被拒絕。

憑證雜湊表 `bot_ingest_credentials` 不進可攜備份（與 ERP 連線憑證相同）。還原後要在這個頁面重新產生。進度、審稿、回報與完成項目會進可攜備份。

## API

人（需登入與模組權限）：

| 方法 | 路徑 | 作用 |
| --- | --- | --- |
| GET | `/api/bot-center` | 四個區塊與憑證是否已設定。`draftStatus` 可為 `pending`（預設）、`approved`、`rejected`、`all` |
| POST | `/api/bot-center/bots` | `{code,label}` 新增身份 |
| POST | `/api/bot-center/drafts/:id/review` | `{decision:"approved"\|"rejected",reason?}` |
| GET | `/api/bot-center/credentials` | 是否已設定，不含明文 |
| POST | `/api/bot-center/credentials` | 產生或輪換，回應只此一次含 `token` |
| DELETE | `/api/bot-center/credentials` | 撤銷 |

機器（`Authorization: Bearer <token>`）：

| 方法 | 路徑 | 作用 |
| --- | --- | --- |
| POST | `/api/bot-ingest/progress` | `{botCode,status,summary?}`，status 為 `idle`／`working`／`blocked`／`done` |
| POST | `/api/bot-ingest/reports` | `{botCode,title,body}` |
| POST | `/api/bot-ingest/drafts` | `{botCode,title,body,externalRef?}`。同一 BOT 的同一個 `externalRef` 回傳原來那篇，不把已審結果改回待審 |
| GET | `/api/bot-ingest/drafts/:id` | 讀審核結果 |
| GET | `/api/bot-ingest/drafts?botCode=&externalRef=` | 用外部編號讀審核結果 |
| POST | `/api/bot-ingest/completions` | `{botCode,title,detail?,completedAt?}`。時間缺省為伺服器當下 |

未知的 BOT 代碼會被拒絕，先在頁面新增。實體欄位以 `migrations/0053_bot_center.sql` 為準。

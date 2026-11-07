# BOT 管理中心

頁面在既有 CY Web 殼層，路由 `#bot-center`，左側「ERP 查詢」同一組（`erp-query`，沒有組名）的下一項。模組代碼 `BOT_CENTER`，標籤「BOT 管理中心」。超級管理員沿用既有全模組權限；其他人要在「帳號與權限」授權後才看得到。不使用 `MODULE_REQUIREMENTS`。本文件描述 V0.12.2 工作總覽契約；正式發布現況以根 TODO 為準。

## 畫面

依使用者確認的參考圖，改為高密度工作總覽，沿用 CYWEB 色彩／字級、`cy-op-panel`、`StatusChip`、`StatusFilter`、`ExpandToggle`、共用欄位及 Dialog，不套用外部站點的品牌或大字廣告樣式。

1. 上方顯示台灣日期／星期、所有 BOT 的進行中／受阻／待命數及待審總數、統計更新時間；「全部／各 BOT」膠囊同步篩選卡片、時間軸、審稿及回報。狀態僅代表最後回報，不宣稱在線或全員上班。
2. 初始身份社群小編、內容專家、CEO、IT 各一張工作卡片，桌機兩欄、手機單欄；新增 BOT 後自然增加。卡片包含狀態、兩行摘要（可展開全文）、完整今日完成數、待審數、狀態更新時間及查看回報／待審入口。進度輪詢發現新身份、統計尚未重新整理時顯示「統計待更新」，不以零冒充。
3. 「待我審核」在 BOT 工作卡片上方獨立占滿一列，使用共用 `cy-op-table`，每件一個 tr，不設展開按鈕或明細列。欄位為送審時間、BOT、事項、內容、狀態、操作；非待審篩選另顯示審核資訊。文字過長單行省略，原文與審核資訊保留在 DOM 及 title，滑鼠停留可看全文；手機在共用表格容器內水平捲動，不撐開頁面。通過／退回在同一列，理由可空白，可切換全部／通過／退回紀錄。今日完成時間軸在 BOT 卡片下方獨立占滿一列，沿用直線／圓點，最新在上，依完成時間 DESC／ID DESC 複合游標，詳情按需展開。今天以 Asia/Taipei 計算。審稿仍只回寫審核結果，不發布內容。
4. 「查看回報」使用共用 Dialog，保持目前 BOT 範圍，展開全文及每頁 50 筆游標載入。「設定」集中新增 BOT 與憑證狀態／管理，原超管權限不變。回報、設定及一次性憑證視窗均只用明確關閉按鈕，無右上 X、背景及 Escape 不關閉。

## 統計、篩選及讀取成本

- GET `/api/bot-center` 的 `botCode` 可選，省略為全部；代碼需符合格式且存在。回應 `botCode` 為目前範圍，`draftCounts` 為該範圍完整三種審稿統計，與目前分頁或所選審稿狀態無關。
- `botStats` 以 BOT code 為 key，含 `todayCompleted` 與 `draftCounts`。它保留所有 BOT 的完整統計，即使目前只選一個 BOT；不得以已載入的前 50 筆代替總數。今日完成使用台灣日的 UTC 半開區間。全 BOT 審稿統計及今日完成各一支 GROUP BY，沒有每 BOT 一支 SQL 的迴圈。
- 0056 僅新增 `(bot_id,review_status,id)`、`(bot_id,id)`、`(bot_id,completed_at,id)` 索引，供審稿、回報、完成清單的篩選與游標讀取。沒有新增業務表或改寫既有資料；portable backup migration marker 同步更新，欄位／保存契約不變。
- 進度在頁面可見時每 30 秒只呼叫 `/progress`，不掃描歷史或重算完整統計。完整載入、切換篩選、手動重新整理及操作成功後更新統計；跨台灣午夜時在下一次可見檢查更新日期與完整總覽。歷史各自載入更多，維持目前 BOT／狀態範圍並去重；跨日分頁改回新日期，避免混入昨天。
- 「統計更新」及「狀態更新」分開顯示。完整統計仍需讀取相符歷史索引，不宣稱零 D1 成本；不因新畫面提高輪詢頻率。

## 審核邊界

通過或退回只更新該篇審稿的狀態、選填理由、審核人與時間，並寫一筆共用稽核。原 BOT 用連線憑證把這筆結果讀回去。

審稿更新與 Audit 在同一個 D1 原子批次內；以條件更新的實際筆數判斷勝出者，只有實際更新的一筆才寫 Audit。即使兩個請求同毫秒作出相同決定，另一個仍回傳 409，不會重複紀錄或把未儲存的理由當成成功。

這個動作不會發到 Facebook、Instagram 或 Threads，不會建立正式發布工作，也不會打開自動回覆。BOT 管理中心是審核畫面，不是自動發布開關。

## 誰可以呼叫

- 人：既有 CY Web session。Worker 以 `requireModuleAccess(..., "BOT_CENTER")` 判斷，不另做一套帳號。**只有 Workspace SUPER_ADMIN** 可以產生、輪換與撤銷 BOT 連線憑證（Worker 強制 403、UI 不顯示操作按鈕）；其他獲授權員工仍可檢視 BOT、審稿及新增 BOT。
- 機器：一組可輪換的連線憑證，做法與 ERP 查詢程式的憑證相同。頁面上產生時只顯示一次明文；資料庫只留 SHA-256。撤銷或輪換後舊憑證立即失效。這不是員工、不是 CYID session，也不是第二套身份系統。沒有憑證的公開請求會被拒絕。

憑證雜湊表 `bot_ingest_credentials` 不進可攜備份（與 ERP 連線憑證相同）。還原後由超級管理員在這個頁面重新產生。進度、審稿、回報與完成項目會進可攜備份。初始四筆身份採讀取比對，只有資料缺漏才 `INSERT OR IGNORE`，正常 GET 不再重複寫入。

## API

人（需登入與模組權限）：

| 方法 | 路徑 | 作用 |
| --- | --- | --- |
| GET | `/api/bot-center` | 工作總覽、`botStats` 完整統計、憑證狀態與 `canManageCredentials`。可選 `botCode` 篩選所有歷史區塊；`draftStatus` 為 `pending`（預設）、`approved`、`rejected`、`all`；分頁參數 `draftBefore`、`reportBefore` 用 ID，`timelineBefore` 用 `completedAt|id`，分頁時須保留相同 BOT／審稿範圍。回應含目前 `botCode`、三個 NextBefore 及對應 More 旗標。 |
| GET | `/api/bot-center/progress` | 相同 session／模組授權；只回傳 `bots`、`credential`、`canManageCredentials`，供 30 秒自動刷新。 |
| POST | `/api/bot-center/bots` | `{code,label}` 新增身份 |
| POST | `/api/bot-center/drafts/:id/review` | `{decision:"approved"\|"rejected",reason?}` |
| GET | `/api/bot-center/credentials` | 是否已設定，不含明文 |
| POST | `/api/bot-center/credentials` | 僅超級管理員可產生或輪換；回應只此一次含 `token` |
| DELETE | `/api/bot-center/credentials` | 僅超級管理員可撤銷 |

機器（`Authorization: Bearer <token>`）：

| 方法 | 路徑 | 作用 |
| --- | --- | --- |
| POST | `/api/bot-ingest/progress` | `{botCode,status,summary?}`，status 為 `idle`／`working`／`blocked`／`done` |
| POST | `/api/bot-ingest/reports` | `{botCode,title,body}` |
| POST | `/api/bot-ingest/drafts` | `{botCode,title,body,externalRef?}`。同一 BOT 的同一個 `externalRef` 回傳原來那篇，不把已審結果改回待審 |
| GET | `/api/bot-ingest/drafts/:id` | 讀審核結果 |
| GET | `/api/bot-ingest/drafts?botCode=&externalRef=` | 用外部編號讀審核結果 |
| POST | `/api/bot-ingest/completions` | `{botCode,title,detail?,completedAt?}`。時間缺省為伺服器當下 |

未知的 BOT 代碼會被拒絕，先在頁面新增。實體欄位以 `migrations/0054_bot_center.sql` 為準。出機原有的 `0053_store_equipment_category.sql` 不變；BOT 的 `0054` 由既有 main-only 部署流程接續套用。正式版本、migration 與發布證據統一見 [TODO](../../TODO.md) 及 [handoff](../handoff/CYWEB-BOT-CENTER-0120-20261106.md)，不以 PR 驗證是否觸及正式 D1 代表目前部署狀態。

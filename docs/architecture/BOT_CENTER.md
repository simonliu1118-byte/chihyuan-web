# BOT 管理中心

沿用 CYWEB 殼層、`#bot-center` 路由及 `BOT_CENTER` 模組，在左側 ERP 查詢下一項。SUPER_ADMIN 自動具有模組權限；其他人須取得模組權限。以下為 V0.12.4 Build 1 契約（已部署、Claude事後複審待辦），正式部署狀態以根 TODO 為準。

## 畫面

1. 標題、台灣日期／星期、工作狀態與 BOT 篩選。移除標題旁「今日工作總覽」及提示性灰字；保留實際日期與資料。頁首仍可查看回報紀錄與設定。
2. **待審核**：共用 `cy-op-table` 全寬表格，每件一列、不展開。時間、BOT、事項、內容、狀態、操作；非待審篩選另顯示審核資訊。文字過長依共用表格省略、title 保留原文。按「通過」直接送出，不詢問／保存理由；「退回」才開共用短視窗，理由必填，Worker 同樣強制驗證。審核與 Audit 保持原子性及並行勝出者檢查，不發布內容。
3. **工作摘要**：桌機一排四張「新文章通知／Threads 巡視回報／拍板結案／待核准」。前兩張只統計台灣當日對應分類的實際完成事件，顯示完整數量與最新事項／結果。待核准包含所有日期尚未處理的稿件，依目前 BOT 範圍統計。拍板結案僅保留標題與 `—`，沒有計數、查詢、事件分類或後臺串接；不得拿一般完成數冒充。
4. **今日完成時間軸**：獨立全寬，最新在上；每項時間、BOT、標題與詳情同行直接顯示，不設展開／收合或縮排第二段。一般長內容自然換行，不隱藏內容。游標仍為完成時間 DESC／ID DESC，今天以 Asia/Taipei 計算。
5. **BOT 當日摘要**：移至時間軸下方，桌機一排四張；各卡只顯示名稱、最後回報狀態及當日摘要，移除卡片的回報／待審按鈕、數字及展開。昨日摘要不當成今日資料；沒有今日摘要顯示「今日尚無回報」。此區保留全部 BOT，不因上方篩選隱去其他身份。新增 BOT 自然往下排列；中等寬度兩欄、手機單欄。
6. 沿用 CYWEB panel／StatusChip／StatusFilter／Field／共用 Dialog，不引入第二套元件。回報紀錄維持共用視窗及按需展開；設定用共用表格逐 BOT 管理憑證。視窗沒有右上 X，背景與 Escape 不關閉，只按明確按鈕關閉。

## 逐 BOT 憑證

`bot_ingest_credentials` 以 `bot_id` 為主鍵，保存唯一 SHA-256 token_hash、產生／撤銷時間及操作人。明文僅產生時顯示一次，不進資料庫、Audit、檔案或可攜備份。只有 SUPER_ADMIN 可以產生／輪換／撤銷；其他有模組權限的人可讀狀態、審稿與新增 BOT。

0057 forward migration 將原 singleton 憑證的雜湊、時間及操作人**原樣歸屬 SOCIAL_EDITOR**，不重新產生、不取得明文；社群小編在 Grok 的原值不變。以 code 定位，不假設 bot_id=1。其他 BOT 要各自產生憑證，輪換或撤銷僅影響該 BOT。舊全域憑證操作路徑不再提供，避免誤輪換全體。

機器憑證在 Worker 辨識所屬 BOT；寫入省略 botCode 可直接採憑證身份，有傳但不相符回 403。讀取審稿亦受所屬 BOT 限制：按 ID 讀他人稿回 404，按外部編號冒用另一 botCode 回 403。這是機器回報授權，不是 CYID 員工帳號／session 或另一套人員登入系統。

## 工作分類、防重複與讀取成本

- `bot_completions.work_type` 為 general（舊資料及預設）、article_published、threads_patrol。只有實際發布／完成巡視才送出對應分類，不靠標題、BOT 身份、送審或核准推論；沒有拍板結案分類。
- `event_ref` 在同 BOT 內唯一。重送相同事件與內容回傳原紀錄；換內容／分類或明確完成時間不符回 409 BOT_EVENT_CONFLICT。非 general 必填，避免分類計件重複；既有無 eventRef 的一般 API 仍可用，但不具伺服器去重。
- GET `/api/bot-center` 支援 botCode 篩選審稿、回報、時間軸與工作摘要。完整審稿／完成統計不受 50 筆分頁限制；`workSummary` 回 articles／patrols 的完整數量及最新完成、pending 的跨日完整數量及最新待審。`botStats` 保留全部 BOT 的完整統計。
- 原今日完成 GROUP BY 加入 work_type，不逐 BOT 發 SQL。工作摘要增加兩筆索引 LIMIT 1 及一筆最新待審讀取；0057 補分類＋日期索引與事件唯一索引。不讀完全部正文、不把第一頁長度當總數。
- 30 秒可見頁面仍只讀 `/progress` 的 BOT 主檔與憑證狀態，不掃歷史／分類統計；跨台灣午夜下一次檢查完整刷新。沒有每次 API 呼叫寫 last_used，沒有增加固定輪詢；推播的重試僅用既有五分鐘排程。
- 可攜備份納入完成事件的新欄位、CURRENT_MIGRATION=0058，舊備份缺欄位取 general／null 預設；憑證仍排除，還原後各 BOT 由超管重新產生。空白目標不因 migration 預先建立 BOT 而阻擋還原。

## API

人（既有 CYWEB session＋BOT_CENTER 權限）：

| 方法 | 路徑 | 作用 |
| --- | --- | --- |
| GET | `/api/bot-center` | 工作總覽／完整統計／憑證狀態；botCode、draftStatus 及三種既有游標不變 |
| GET | `/api/bot-center/progress` | bots、credentials、canManageCredentials、pushReady、pushSettings，不回歷史／統計 |
| PUT | `/api/bot-center/bots/:code/push` | SUPER_ADMIN 設定逐 BOT webhook；網址／key 留白保留，不回傳原值 |
| POST | `/api/bot-center/drafts/:id/push/retry` | SUPER_ADMIN 重送 failed 推播；不重做審核，同 eventId |
| POST | `/api/bot-center/bots` | `{code,label}` 新增身份 |
| POST | `/api/bot-center/drafts/:id/review` | `{decision:"approved"\|"rejected",reason?}`；退回必填，通過忽略理由 |
| GET／POST／DELETE | `/api/bot-center/bots/:code/credential` | 讀該 BOT 狀態／產生或輪換／撤銷；寫入僅 SUPER_ADMIN |

機器（自己獨立的 `Authorization: Bearer <token>`）：

| 方法 | 路徑 | 作用 |
| --- | --- | --- |
| GET | `/api/bot-ingest/identity` | 回傳憑證實際 botCode／botLabel，供工具核對設定 |
| POST | `/api/bot-ingest/progress` | `{botCode?,status,summary?}`；idle／working／blocked／done |
| POST | `/api/bot-ingest/reports` | `{botCode?,title,body}` |
| POST | `/api/bot-ingest/drafts` | `{botCode?,title,body,externalRef?}`，同 BOT＋externalRef 回原稿、不覆寫 |
| GET | `/api/bot-ingest/drafts/:id` | 只可讀自己的審核結果 |
| GET | `/api/bot-ingest/drafts?botCode=&externalRef=` | 同上；botCode 可省略，帶入時必須相符 |
| POST | `/api/bot-ingest/completions` | `{botCode?,title,detail?,completedAt?,workType?,eventRef?}`；completedAt 預設現在 |

## Grok 工具、技能與啟用順序

[工具與共用技能](../../integrations/grok-bot/cyweb-work-reporter/SKILL.md)、[Grok 設定](../../integrations/grok-bot/cyweb-work-reporter/references/grok-setup.md)為 Node22+、無第三方執行套件的可攜包。WEB／0058 先部署，再更新工具；小編的原安全憑證與持久收據保持不變，其他 BOT 分別提供自己的憑證。

`check` 用 identity 驗證歸屬；complete 將固定 eventId 傳為 eventRef，general 舊收據相容。report 仍只有本機收據，斷線結果不明時不刪收據或換編號重送。工具沒有員工登入、自行審核或發布命令；核准後的外部操作仍按使用者與 Grok 授權。

V0.12.4 Build 1 在審核落庫後喚醒既有 Grok routine；推播沒有核准權威，BOT 仍須認證讀取結果。小編 pilot 只測試送審 → 人工核准 → 完成回報，不對外發文、不計入文章／巡視卡片。發布與審查證據見 [TODO](../../TODO.md)、[handoff](../handoff/CYWEB-GROK-REPORTER-0123-20261107.md)。

## 審核結果推播（0058）

- 逐 BOT 設定由 SUPER_ADMIN 管理，WEB 使用共用 Dialog／EntryTable／Field。完整 URL 和 key 只在安全輸入中提交；API／Audit 只回 configured、enabled、updatedAt，不回 URL、key 或密文。既有小編 CYWEB 憑證不動。
- 目的地固定 HTTPS api2.cursor.sh、預設443、禁止帳密／fragment／根路徑，禁止重導向。AES-256-GCM 隨機96bit IV＋BOT身份AAD加密完整設定；Worker secret BOT_PUSH_ENCRYPTION_KEY 由受保護 GH Environment 的 CF_BOT_PUSH_ENCRYPTION_KEY 注入。更換主金鑰會使舊設定不可解，不能自動輪換。
- 審核 UPDATE、Audit 與 outbox 同一 batch；只有審核勝出者建立一次推播。回應成功後 ctx.waitUntil 首送，網路錯誤不回滾已儲存的審核。每次通知只帶 type=cyweb.review_result、eventId=bot-review-ID、botCode、draftId，不送標題、內容、決定、理由或 CYWEB token。
- 既有 */5 排程每次最多3筆、每筆HTTP上限7秒，CAS租約60秒；最多6次，間隔5／15／60／240／1440分鐘。429 Retry-After 限5分鐘至24小時；3xx、一般4xx直接失敗，408／429／5xx／網路可重試。第6次租約過期會轉 failed，避免永久 sending。HTTP200只表示平台接受並開始 routine，不表示工作完成；不讀取回應正文。
- 未啟用不建立新通知；停用略過待送，重啟可續送既有待送。沒有主金鑰時不發送，原工作／審核不受影響。超管可重送 failed，保持原 eventId；逾時可能已喚醒，不能宣稱 exactly-once。Grok 用固定工作ID辨識實際工作，外部發布另守既有授權。
- 30秒 progress 仍只讀 profile／credential，push flags 加在原 profile LEFT JOIN，沒有新增歷史或outbox輪詢；已審稿件列表以主鍵LEFT JOIN一筆推播狀態，不掃全部通知。每次排程有固定上限 due查詢／CAS／結果寫入；啟用時另清除最多100筆30天舊技術通知，業務審稿不刪。
- 新增 bot_review_push_settings／bot_review_push_outbox 均為 ephemeral，不進可攜備份，還原後重設整合；完成分類與審稿等業務資料仍備份。0058僅加表／索引，不更動小編key或舊業務欄位。
- 共用工具 review-notification 只認固定四欄，驗證自己的BOT與正整數ID，再以自己的Bearer認證GET；missing／foreign／pending安靜忽略，approved／rejected以最新讀回為準，無自動發布命令。

協定依據：[Grok webhooks](https://docs.x.ai/grok-bot/skills-routines-and-automations#webhooks)、[Cloudflare waitUntil](https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil)。交接與啟用證據見 [V0.12.4 Build 1 handoff](../handoff/CYWEB-BOT-REVIEW-PUSH-0124-20261108.md)。


## V0.12.5 BOT 管理中心版面修訂（PR #453 已合併、尚未部署）

- 主頁維持既有 CYWEB 外層標題，頂部工作總覽卡不重複寫標題與日期；三個狀態計數及每個 BOT 名稱／狀態以 `StatusChip` 顯示，**沒有 BOT 身份篩選器**。審稿狀態（全部／待審／通過／退回）仍保留操作，原來「全部 BOT」範圍字樣刪除；後端既有 `botCode` 篩選 API 不移除、不更改權限。
- 今日完成移到頂部總覽卡，主頁只呈現依 `completed_at DESC,id DESC` 排序的最新五個事件，不是五個時間群組。「查看全部」使用共用 `Dialog`，載入既有首批 50 筆與 `timelineBefore` 續頁。用 `formatDateTime` 的台北年月日＋分鐘群組，同分鐘事件在一個時間與一個藍點下各自展示，事件不去重、不隱藏。
- 原底部逐 BOT 摘要卡**保留**，仍顯示名稱、當日摘要與狀態；沒有 BOT 篩選，只有 30 秒原進度輪詢，不增加背景查詢。
- 推播設定 `BotPushSettingsDialog` 用共用 `Dialog`、`EntryTable`、`EntryHeading`、`Field presentation="cell"` 形成兩行「左表頭／右輸入」；只改 Webhook URL 和 key，密碼型輸入不回填原值，留空沿用已儲存值。儲存沿用原 `PUT /api/bot-center/bots/:code/push`，把舊 `enabled` 原值原樣提交。新設定預設停用，必須在 BOT 設定表格操作欄明確啟用；不輪換既有 Grok key／加密金鑰／CYWEB 機器憑證。
- 推播啟停在原 BOT 設定表格的操作欄，僅 `SUPER_ADMIN` 可操作；未設定 webhook 或服務未就緒時停用按鈕，停用先經共用 `useConfirmation`，再向既有 API 只提交 `enabled` 布林值，後端保留已加密 target 和獨立憑證。設定管理視窗仍只處理 BOT 的獨立連線憑證。
- 新增 BOT 改獨立 Dialog，以同一組共用 EntryTable／EntryHeading／Field 兩列顯示代碼／名稱，沿用原長度與代碼字元限制、Enter 跳格、原新增 API。只修改前端、文件與測試，**不改 D1、Worker、migration、備份**。

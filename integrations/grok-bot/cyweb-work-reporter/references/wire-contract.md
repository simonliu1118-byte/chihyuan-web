# 共用回報操作契約（V0.22.0／0079）

入口：`node /workspace/cyweb-work-reporter/scripts/cyweb-reporter.mjs <command>`。JSON從標準輸入，token僅由安全Secrets注入。只有同源CYWEB API，禁止轉址，15秒逾時；沒有登入、核准或對外發布命令。

## 新版成果回報

|命令|輸入|用途|
|---|---|---|
|delivery|eventId、kind、approvalSource；選填 title、body、platform、url、sentAt、approvalNote、externalRef、item、sessionRef|每篇／每則實際發出後一次回報，全文、計數及時間軸一致|
|delivery-status|eventId|只讀原成果，回 item、images；查不到為BOT_NOT_FOUND|
|delivery-image|eventId、file絕對路徑|2MB、10張、SHA-256防重複，隔日清理|
|patrol-session|sessionRef、label、選填 day、note、completed|同場巡視只一行，可更新名稱／短摘要；日期不可變。completed:true 記下結束時間（只記第一次），不帶或 false 不會重新開啟|

外部已核准文章的合成範例：
```json
{"eventId":"synthetic-post-01","kind":"post","approvalSource":"chat","approvalNote":"使用者已在外部核准","title":"合成文章標題","body":"實際發布完整文案","platform":"IG","url":"https://example.invalid/posts/one","sentAt":"2026-11-13T04:00:00.000Z"}
```

CYWEB逐則已核准成果：
```json
{"eventId":"synthetic-post-02","kind":"post","approvalSource":"cyweb","externalRef":"synthetic-review-r1","item":1,"platform":"IG","url":"https://example.invalid/posts/two"}
```

巡視先：`{"sessionRef":"synthetic-20261113-noon","label":"午巡","day":"2026-11-13"}`；實際留言的 delivery 用 kind=patrol 並帶此 sessionRef。每則自己的 eventId 固定，note 最多40字且一般留空。系統依成果計「午巡｜已送出N則」。

- kind：post／patrol；approvalSource：cyweb／chat／line／other。**platform 只收 FB、IG、Threads**（不分大小寫，伺服器存標準寫法）；其他字串回 400，省略仍可。舊資料的自由文字照原樣顯示。外部來源必填完整 title、body、approvalNote；cyweb 必須連結自己的已通過原稿／則，內容與原稿完全相同。不能用它自行授權發文。
- externalRef 由工具轉為 draftId；item轉itemSeq。外部成果可連到自己的待審補登稿並標「外部已處理」，原 reviewer、review_status、理由不改。同批其他待審項目不受影響。
- title120字、body4000字、eventId120字、platform40字、url2048字且僅HTTPS無帳密、approvalNote200字；sessionRef120字、label12字、note40字，以Unicode code point計。sentAt為有效UTC ISO日期，不能在未來；省略採首次伺服器時間，原編號重試保留原時間。補登舊成果必填真實時間，不能冒充今天發布。
- 成果不可任意改內容。同eventId／同來源則／同發布網址不能重算。舊sent已入帳的同來源則，可一次連上固定eventId及空白平台／場次資料；之後衝突回409。
- 系統自動建立一次完成紀錄。**不用再對同一成果呼叫 sent 或 complete.article_published。**舊complete仍保留於時間軸，不靠它增加文章篇數。
- 發布圖片沿用短期保留，隔日清除；不是永久圖片歸檔。

## V0.22.0 新增

|命令|輸入|用途|
|---|---|---|
|decision|externalRef、title、body、category；選填 amount、deadline、options、previousDraftId|送請人拍板的事項；與稿件共用審核、版本鏈與推播|
|submit（擴充）|選填 sessionRef|海巡稿連結到自己、同一台北日已登錄的巡視場次|

decision 範例（合成資料）：
```json
{"externalRef":"synthetic-decision-01","title":"IG 廣告加碼 3 天","body":"三天觸及 1.2 萬、點擊率 2.8%，申請再投 3 天。","category":"廣告預算","amount":3000,"deadline":"2026-11-19T18:00:00+08:00","options":["加碼 3 天，每日 NT$1,000","加碼 2 天，每日 NT$800"]}
```

- category 1–20 字自由填寫；amount 為新台幣**元**（≥0、最多兩位小數），工具轉成「分」送出，伺服器以整數分儲存；deadline 為含時區的 ISO 時間，工具轉為 UTC；options 2–5 個、每個 1–80 字、不可重複。只有 category 必填。
- 線路（`POST /api/bot-ingest/drafts`）的 `decision` 物件為 `{category,amount?(分),deadline?(UTC ISO),options?}`，只能用在一般單篇，不可與 items、kind=post／patrol 併用，錯誤回 400。同 externalRef 重送回原紀錄、不覆寫。改稿用 previousDraftId＋新 externalRef，**新版必須再帶 decision**（缺少回 400，普通稿改成拍板回 409）。
- 讀回（`GET /api/bot-ingest/drafts/:id`、`?externalRef=`、工具 `review`）含 `decision:{category,amount,deadline,options,chosenOption,expired}`；工具的 amount 已換回元並多一個 `chosenOptionText`。人決定：approved＝同意（有 options 時 `chosenOption` 為選項序號，從 0 起）、rejected＝不同意（reason 為備註，必填）。**期限已過且仍待決定時 `expired:true`，人員端回 409 `BOT_DECISION_EXPIRED`，不能再決定。**
- 場次狀態（V0.22.0 版本的推算已由 V0.30.0 取代，見下節「V0.30.0 變更」）。人員 API：`GET /api/bot-center/sent-items?kind=patrol&sessionId=`、`GET /api/bot-center/patrol-sessions/:id/items`。

## V0.30.0 變更（WEB 0085）

|命令|新增輸入|用途|
|---|---|---|
|patrol-session|選填 pendingReview、toSend、waitingImages、skipped、abandoned|場次則數；0 到 999 的整數，沒帶的欄位保留原值；全部都沒帶過＝沿用舊推算（進行中，直到有連結稿件或 completed）|
|delivery|選填 sourceText（≤2000）、sourceAuthor（≤80）、sourceUrl（≤500，http／https）|成果的原文；**kind=patrol 時工具要求 sourceText**；body 只放我們送出的留言|

patrol-session 範例（合成資料）：
```json
{"sessionRef":"synthetic-noon-01","label":"午巡","pendingReview":0,"toSend":2,"waitingImages":1,"skipped":4,"abandoned":0}
```
patrol delivery 範例（合成資料）：
```json
{"eventId":"synthetic-reply-01","kind":"patrol","sessionRef":"synthetic-noon-01","approvalSource":"chat","approvalNote":"合成核准","title":"合成留言","body":"合成留言全文","sourceText":"合成原文全文","sourceAuthor":"synthetic_user","sourceUrl":"https://example.test/post/1","platform":"Threads","url":"https://example.test/reply/1"}
```

- 場次狀態（伺服器推算，只看則數與連結稿件，不看 note）：有待審核（回報的 pendingReview 與連結稿件待審則數取較大者）＝待審核；否則已 `completed` ＝已完成；有待留言（toSend 與連結稿件已通過未送出取較大者）＝待留言；有 waitingImages＝等待圖片（N 則）；都沒有且曾回報則數（或有連結稿件）＝已完成；從未回報則數、沒有連結稿件、未結束＝進行中。小編重新查核算待審核，不是獨立狀態。
- sent 來自成果帳本，與回報的則數無關。成果的 sessionRef 可指向較早的場次：場次日期須在送出日（台北時間）當天或之前、且不超過 14 天，否則回 422 `BOT_INVALID`。補送成果計入該場次全部送出數，也計入送出當日卡片的「今日送出留言」；主頁當日卡片另列「11/20 早巡（補送）」，只顯示當日補送數。
- 原文欄位在重送時：有帶就必須與原紀錄相同（衝突 409），沒帶則不比對。舊成果沒有原文，畫面顯示「未附原文」，不回頭解析舊內文。
- 保存期：送出時間早於 90 天的成果、以及日期早於 90 天且已沒有成果的場次，每日台灣 03:15 自動清除；仍在保存期內的補送成果會保留其場次。
- 人員 API `GET /api/bot-center/sent-items?kind=patrol&sessionId=` 看單一場次時列出該場次全部成果（不限當日）。

## 原有命令維持

|命令|輸入|
|---|---|
|check|{}；只讀健康與憑證歸屬|
|progress|status、summary?；idle／working／blocked／done，摘要200字|
|submit|externalRef、title、body、kind?、items?、previousDraftId?、sessionRef?；post／patrol用1–50個items，每則ref?／title／body|
|review|externalRef；只讀自己的審核，各則另回status、reason、sentAt；拍板事項另回decision|
|image|externalRef、file、item?；待審圖片，每則10張／2MB|
|sent|externalRef、items?；舊版相容，仍只記已通過且實際送出的則，新成果推薦delivery|
|report|eventId、title、body|
|complete|eventId、title、detail?、completedAt?、reviewRef?、workType?；general／article_published／threads_patrol|
|review-notification|type=cyweb.review_result、eventId=bot-review-ID、botCode、draftId；四欄只作喚醒，重新讀取原結果|
|pilot-start／pilot-finish|同一reference；首次小編合成連線測試，先人工核准，無外部發布|

送審externalRef80字，改稿用新編號＋目前最新版previousDraftId，已送出或外部已處理稿不能覆蓋。每則title120字、body4000字、ref80字；整份JSON最多256KB。退回理由由人工填，機器不能寫人員審核API。

## API與安全

新增機器API：POST／GET `/api/bot-ingest/deliveries`、POST `/api/bot-ingest/deliveries/:id/images?uploadRef=SHA256`、POST `/api/bot-ingest/patrol-sessions`。GET成果以eventRef查詢並限制自己的BOT；其餘原API不變。設定沒有新增BOT或憑證管理能力。

人員需原CYWEB session＋BOT_CENTER權限：GET `/api/bot-center/deliveries/:id`、`/delivery-images/:id`、`/sent-items?kind=post|patrol`。明細當日50筆游標分頁，只在點開時讀全文；主頁文章只取metadata。30秒progress仍只查主檔／整合狀態，不查歷史。

舊report／complete收據的檔名與fingerprint不改。原token、收據目錄、routine保留；report只有本機防重複，complete另有server eventRef。新delivery有server去重；結果不明先delivery-status，查到即停止。4xx衝突不可換編號繞過；5xx／斷線不代表未送達。所有命令輸出一份JSON，失敗非零，不回顯環境值或token。

# 共用回報操作契約（V0.21.3／0077）

入口：`node /workspace/cyweb-work-reporter/scripts/cyweb-reporter.mjs <command>`。JSON從標準輸入，token僅由安全Secrets注入。只有同源CYWEB API，禁止轉址，15秒逾時；沒有登入、核准或對外發布命令。

## 新版成果回報

|命令|輸入|用途|
|---|---|---|
|delivery|eventId、kind、approvalSource；選填 title、body、platform、url、sentAt、approvalNote、externalRef、item、sessionRef|每篇／每則實際發出後一次回報，全文、計數及時間軸一致|
|delivery-status|eventId|只讀原成果，回 item、images；查不到為BOT_NOT_FOUND|
|delivery-image|eventId、file絕對路徑|2MB、10張、SHA-256防重複，隔日清理|
|patrol-session|sessionRef、label、選填 day、note|同場巡視只一行，可更新名稱／短摘要；日期不可變|

外部已核准文章的合成範例：
```json
{"eventId":"synthetic-post-01","kind":"post","approvalSource":"chat","approvalNote":"使用者已在外部核准","title":"合成文章標題","body":"實際發布完整文案","platform":"IG","url":"https://example.invalid/posts/one","sentAt":"2026-11-13T04:00:00.000Z"}
```

CYWEB逐則已核准成果：
```json
{"eventId":"synthetic-post-02","kind":"post","approvalSource":"cyweb","externalRef":"synthetic-review-r1","item":1,"platform":"IG","url":"https://example.invalid/posts/two"}
```

巡視先：`{"sessionRef":"synthetic-20261113-noon","label":"午巡","day":"2026-11-13"}`；實際留言的 delivery 用 kind=patrol 並帶此 sessionRef。每則自己的 eventId 固定，note 最多40字且一般留空。系統依成果計「午巡｜已送出N則」。

- kind：post／patrol；approvalSource：cyweb／chat／line／other。外部來源必填完整 title、body、approvalNote；cyweb 必須連結自己的已通過原稿／則，內容與原稿完全相同。不能用它自行授權發文。
- externalRef 由工具轉為 draftId；item轉itemSeq。外部成果可連到自己的待審補登稿並標「外部已處理」，原 reviewer、review_status、理由不改。同批其他待審項目不受影響。
- title120字、body4000字、eventId120字、platform40字、url2048字且僅HTTPS無帳密、approvalNote200字；sessionRef120字、label12字、note40字，以Unicode code point計。sentAt為有效UTC ISO日期，不能在未來；省略採首次伺服器時間，原編號重試保留原時間。補登舊成果必填真實時間，不能冒充今天發布。
- 成果不可任意改內容。同eventId／同來源則／同發布網址不能重算。舊sent已入帳的同來源則，可一次連上固定eventId及空白平台／場次資料；之後衝突回409。
- 系統自動建立一次完成紀錄。**不用再對同一成果呼叫 sent 或 complete.article_published。**舊complete仍保留於時間軸，不靠它增加文章篇數。
- 發布圖片沿用短期保留，隔日清除；不是永久圖片歸檔。

## 原有命令維持

|命令|輸入|
|---|---|
|check|{}；只讀健康與憑證歸屬|
|progress|status、summary?；idle／working／blocked／done，摘要200字|
|submit|externalRef、title、body、kind?、items?、previousDraftId?；post／patrol用1–50個items，每則ref?／title／body|
|review|externalRef；只讀自己的審核，各則另回status、reason、sentAt|
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

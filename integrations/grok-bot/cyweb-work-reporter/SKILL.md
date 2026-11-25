---
name: cyweb-work-reporter
description: 回報 CYWEB BOT 工作進度、待審稿、實際發布貼文、已送出留言與巡視摘要，並讀取自己的審核結果。使用既有安全憑證，不登入員工帳號、不自行審核或對外發布。
---

# CYWEB 共用工作回報

先讀 [操作契約](references/wire-contract.md)；首次設定或更新既有 routine 時讀 [Grok 設定](references/grok-setup.md)。本版要求 WEB V0.30.0／0085 先部署，部署前沿用舊工具，不試新寫入。

## 身分與安全

- Node.js 22+，只執行本包的 `scripts/cyweb-reporter.mjs`。JSON 從標準輸入提供，憑證由平台安全 Secrets 注入 `CYWEB_BOT_TOKEN`。
- 保留原 `CYWEB_BASE_URL`、`CYWEB_BOT_CODE`、`CYWEB_REPORTER_STATE_DIR`、token、所有既有收據、固定工作編號及 routine。不重新做 pilot、不另建排程、不輪換憑證。小編固定 `SOCIAL_EDITOR`；其他 BOT 使用自己的憑證。
- 不印環境值、Authorization、完整 webhook／key，不把祕密寫進聊天、JSON、技能或一般檔案。安全注入不可用就停止，不改用明文設定。
- `check` 只驗證健康與憑證歸屬，不授權發文。這個工具只回報成果，不操作社群平台。

## 工作與審稿

- 工作開始／重大進展用 `progress`，狀態 idle／working／blocked／done，摘要講真實進展，不逐字或固定心跳回報。
- **確實需要 CYWEB 審核**才 `submit`。貼文用 kind=post、海巡用 kind=patrol，每篇／每則獨立放 items，即使只有一篇亦同。全文不能只放摘要；每則最多10張審核圖、每張2MB。一般工作可用單篇 general。
- 改稿用新 externalRef＋previousDraftId 指向原稿，目前最新版才可接續。版本自動初稿→2修→3修；新版不繼承核准、圖片。已實際送出或外部已處理的稿不能覆蓋。
- `review` 讀回結果，逐則只處理 approved 的內容；退回先處理理由。不能把等待當核准，也不能把舊版核准套到新版。外部發布仍依使用者授權與平台規則。
- 退回／待審不靠 `delivery` 假裝 CYWEB 通過。
只有**已在其他管道獲得明確核准、且實際發出**的成果，才以真實外部來源回報。

## 拍板：需要人決定的事項

- 請使用者「拍板」（同意／不同意）的事項用 `decision`，不要用 `submit` 假裝稿件。欄位：externalRef、title、body（背景與建議）、**category**（類別，自由填寫，最多 20 字，例如「廣告預算」）；選填 **amount**（新台幣元，最多兩位小數，工具轉成分）、**deadline**（含時區的 ISO 時間，過了期限就不能再決定）、**options**（2 至 5 個選項，每個最多 80 字，人同意時必須選一個）。
- 一樣用固定 externalRef，重送同內容回原紀錄；改內容用新 externalRef＋previousDraftId，**新版也要再帶完整的拍板欄位**。需要附圖用 `image`。
- `review` 回 status（approved＝同意、rejected＝不同意、備註在 reason）與 `decision.chosenOptionText`。**期限過了仍待決定時 `decision.expired=true`，人已不能決定**：請改以新 externalRef 重新送審，不要等待。只依人的決定行動；同意也不代表授權超過該事項本身。

## 實際發布與送出：統一用 delivery

**不要為了補登實際成果建立流程性待審稿。不要重發社群文章或留言。**

- 每篇已發布文章／每則已送出留言，各用一個穩定唯一 eventId 呼叫 `delivery`。kind=post／patrol；不要再為同一成果另呼叫 sent 或 complete.article_published。delivery 同時建立可點閱全文、計數與完成紀錄。
- CYWEB 核准：approvalSource=cyweb、externalRef、item（多則稿必填）。預設使用已核准的原稿全文，不可變更內容。已通過的個別則可回報，不必等同批其他則審完。
- 外部核准：approvalSource=chat／line／other，必填 title、body 完整實際內容、approvalNote 真實核准來源說明。可填 platform（只能是 **FB、IG、Threads**，不分大小寫）、url（實際發布／回覆連結）、sentAt（真實 UTC ISO 時間）。其他平台名稱會被拒絕；不確定就不填。不把目標貼文網址冒充自己回覆的發布網址。
- 若已存在對應補登稿，可帶 externalRef／item 連結原稿；系統僅將對應待審項目標成「外部已處理」，不改原審核決定、不虛構通過、不處理同批其他待審項目。
- 發布圖片用 `delivery-image`，eventId＋本機絕對 file 路徑。沿用JPEG／PNG／WebP、每篇10張、每張2MB；內容雜湊去重。圖片隔日清理，CYWEB不是長期社群圖片庫。
- N篇／N則與點開內容使用同一份實際成果。complete 的文字回報本身不再增加文章篇數。

## 巡視摘要

- 每場先 `patrol-session` 登錄，sessionRef 固定、label 只填「早巡／午巡／晚巡」等實際名稱，可指定 day=YYYY-MM-DD。名稱由你回報，不由 CYWEB 猜測。**登錄時先不要帶則數**：未回報則數＝「進行中」。
- **巡完、結果出來後**，用同一 sessionRef 再呼叫 `patrol-session`，帶結構化則數（0 到 999 的整數，沒帶的欄位保留上次的值）：`pendingReview` 待審核、`toSend` 待留言（已核准、尚未送出）、`waitingImages` 等待圖片、`skipped` 不發、`abandoned` 放棄。每次進度變動就更新一次（例如送出一則後 `toSend` 減 1）。已送出的則數不用報，由 delivery 自動計算。
- CYWEB 依則數顯示狀態，**不看 note**：有待審核＝待審核；有待留言＝待留言；只剩等圖＝等待圖片（N 則）；都沒有＝已完成（自動）。小編重新查核（待查核）不是獨立狀態，重新送審就算待審核，照常更新 `pendingReview`。需要時也可帶 `completed:true` 明確結束；不帶不會重新開啟。
- 走 CYWEB 審核的海巡稿，`submit` 時帶同一個 `sessionRef`（kind=patrol；場次須是你自己、今天已登錄的）；稿件的待審／已通過未送出會與你回報的則數取較大者，人在 CYWEB 審核只改變狀態，你不必另外回報。
- **每則已送出的海巡留言，用 patrol delivery 回報，並一定要附原文**：`sourceText`（你巡到的貼文全文，最多2000字）必填，`sourceAuthor`（貼文作者帳號，最多80字，可含或不含 @）與 `sourceUrl`（原貼文連結，http／https，最多500字）建議附上。`body` **只放我們實際送出的留言**；粉專身分、不配圖、核准人等內部備註不要放進 body 或 sourceText。畫面會把原文與我們的留言並排顯示，標題連到你填的 `url`（我們送出的留言連結）。
- 每則 patrol delivery 帶 sessionRef。分批送出仍同一場。**補送**：留言是在隔天（最多 14 天內）才送出，就帶原本那一場的 sessionRef 與真實送出時間；場次日期不可晚於送出日，超過 14 天會被拒絕。補送成果計入該場次的送出數，也計入送出當日的「今日送出留言」。
- note 一般留空；只有需要使用者處理的例外才填一句，最多40字，狀態不看它。**不要列帳號、網址、則號、核准人、稿號、逐則清單、重複的待審統計。**這些細節放在逐則成果內容，點場次即可看。
- 同一 sessionRef 可更新 note／label／則數，不增加另一行；day 不可改。巡視完成可另用既有 complete.threads_patrol 留時間軸，但 detail 也保持簡短，不為每批重複建立完成事件。
- 成果與場次在 CYWEB 保存 90 天，之後自動清除；需要長期留存的內容請自行保存。

## 失敗、防重複與舊資料

- delivery 用同 BOT＋eventId、對應稿件／則、發布連結防重複。同內容原編號重試回同紀錄；衝突先核對，不換編號繞過。回報成功不代表社群操作成功，只能在實際發出後回報。
- 斷線或結果不明：先 `delivery-status` 讀原 eventId。已存在就停止重報；不存在且已核對時才以完全相同編號／內容補報，不重做外部發布。
- report／complete 的舊本機收據不變；DELIVERY_UNCERTAIN 時不刪收據、不換 eventId、不跨機盲目重送。general 舊完成與連線測試不改算文章。
- 更新後，只補目前已知缺少全文的真實成果，不批量猜測歷史。既有 sent 的逐則紀錄會自動保留；若需補巡視場次，帶原 externalRef／item 用 delivery 連結，會更新原紀錄的空白平台／場次資訊，不重算。
- 所有回報只含必要工作內容，不含公司帳務、客戶個資、祕密或未經允許的資料。

## 既有 routine 與推播

收到 webhook，仍只將原四欄 type／eventId／botCode／draftId 交給 `review-notification`，工具重新以自己的安全憑證讀取結果。缺編號、非自己的BOT、查不到、pending、已有新版或 external 已處理都安靜停止；推播本身不是核准證據。

通過只按原授權處理該份內容，退回按理由改稿；已做過的外部發布不得重做。不增加高頻輪詢。首次連線才用既有 pilot-start／pilot-finish（general測試），既有小編更新不重跑。

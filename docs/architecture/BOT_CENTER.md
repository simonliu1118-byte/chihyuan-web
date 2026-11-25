# BOT 管理中心

## V0.30.0 巡視場次狀態、補送、保存期與送出內容（工程實作，未部署，migration 0085）

以下優先於 V0.22.0 的「巡視場次狀態」與 V0.21.3 的場次摘要說明。

- **場次狀態**：進行中（已登錄、BOT 尚未回報結果）、待審核、待留言（已核准未送出）、等待圖片（N 則）、已完成。`POST /api/bot-ingest/patrol-sessions` 選填整數 `pendingReview`、`toSend`、`waitingImages`、`skipped`、`abandoned`（0–999；沒帶的欄位保留原值，五欄皆 NULL＝從未回報）。推算（`shared/bot-center.ts` 的 `derivePatrolStatus`，不看 note）：待審＝回報值與連結稿件待審則數取較大者；有待審→待審核；BOT 已 `completed`→已完成；有待留言（回報值與連結稿件已通過未送出取較大者）→待留言；有等圖→等待圖片；曾回報則數或有連結稿件而上述皆無→已完成；否則進行中。小編重新查核不是獨立狀態，重新送審即算待審核。`sent` 仍來自成果帳本。卡片右側文字：「N 則待審」「N 則待留言」「N 則等圖」「送出 N 則」；排序待審核→待留言→等待圖片→進行中→已完成。
- **補送**：成果的 `sessionRef` 可指向較早的場次：場次日期（台北）≤ 成果送出日、且不超過 14 天，否則 422。場次的 `sent`／`sentTotal` 計全部成果；卡片標題「今日送出留言」只算今日 `sent_at`。今日卡片另有 `late:true` 的列「M/D 場次（補送）」，`sent`＝今日補送數、`sentTotal`＝全部，不佔今日 3 列名額；其餘舊場次不顯示。`GET /api/bot-center/sent-items?kind=patrol&sessionId=` 看單一場次時列出該場次全部成果（不限當日）。不遷移既有資料。
- **成果原文**：`POST /api/bot-ingest/deliveries` 選填 `sourceText`（≤2000）、`sourceAuthor`（≤80）、`sourceUrl`（≤500、http／https、無帳密），存 `bot_deliveries.source_text／source_author／source_url`（預設空字串）。重送時有帶就須相同（409），沒帶不比對。伺服器不強制；技能工具要求 kind=patrol 必填 sourceText。`body` 只放我們送出的留言。舊成果為空，畫面顯示「未附原文」，不解析舊內文。
- **送出內容視窗**（`BotSentPatrolDialog`／`SentPatrolItem`，large 860）：標題＝場次名稱＋狀態＋「YYYY/MM/DD・送出 N 則」；每則「第 N 則　@作者 ↗」連到發布網址，桌機左原文（淡色）右我們的留言，手機上下排（原文在淺色底框）；無作者時用成果標題，無發布網址時不連結；沒有「開啟貼文」連結。
- **90 天保存期**（`purgeOldBotHistory`，台灣 03:15，與 ERP 保存期同一個排程時段，`cywebCronTasks().botRetention`，沒有新 trigger）：刪除 `sent_at` 早於 90 天的 `bot_deliveries`，以及場次日期早於 90 天且已沒有成果的 `bot_patrol_sessions`；每批 200、每次最多 5 批（成果、場次各自），可重跑。外鍵處理：先刪 `bot_delivery_images`（有 R2 物件則先刪物件；平常已隔日清除），再刪成果；場次刪除前把 `bot_drafts.session_id` 設為 NULL（稿件與審核紀錄不刪、不受 90 天限制）；仍被保存期內成果（含 14 天內補送）引用的場次保留。`bot_completions` 時間軸事件的 `delivery:<id>` 只是文字參照，不動。清除後同一 eventRef 若再重送會被當成新成果（技能收據只防近期重送）。
- **備份**：0085 新增 `bot_patrol_sessions` 五欄、`bot_deliveries` 三欄，`schema-columns.ts` 與 `CURRENT_MIGRATION=0085_bot_patrol_status` 同步；舊備份缺欄位採預設（則數 NULL＝沿用舊推算、原文空字串），不需新的 UPGRADES 步驟。
- 技能包 5 檔同步（patrol-session 則數、delivery 原文與補送、升級步驟）；WEB 需先部署。

## V0.22.0 改版（工程實作，未部署，與 V0.21.6 一起部署）

以下為現行契約，優先於下方歷史沿革（0079）。

- **版面**：頁首 BOT 狀態列（只列受阻、或進行中且最後回報超過 6 小時的 BOT，點開看最新摘要；其餘顯示「其餘 N 個 BOT 正常」，由既有 `/progress` 資料計算，無新輪詢）→ 四張同結構摘要卡（新文章通知、Threads 巡視回報、待核准、拍板結案，各最多 3 列）→ 今日完成時間軸 → 待審核表。「BOT 當日摘要」區與進行中／受阻／待命計數已移除。
- **待審核表**：第一欄「項次」連續編號（載入更多續號）、「期限」欄只有拍板事項有值；手機 ListRow 同。待審檢視中拍板事項固定排最前（期限近到遠，無期限在後，只在第一頁），其後內容稿照 id 倒序游標分頁。
- **拍板事項**：`bot_draft_decisions(draft_id PK, category 1–20 字, amount 分≥0, deadline_at UTC, options_json 2–5 個≤80 字, chosen_option)`，稿件為 kind=general 無 items，與稿件共用審核、版本鏈、推播與稽核。`decision` 物件驗證錯誤回 400；同 externalRef 回原紀錄；改稿須再帶 decision（缺少 400、普通稿改拍板 409）。讀回含 `decision:{category,amount,deadline,options,chosenOption,expired}`。人員審核 `POST /api/bot-center/drafts/:id/review` 加 `choice`（選項序號，從 0 起）：有選項而同意時必填；不同意須備註（reason）；期限已過且仍待決定回 409 `BOT_DECISION_EXPIRED`。介面文字：同意／不同意。
- **workSummary**：`pending` 改為只計內容稿的 `{count,posts,patrolDrafts,patrolItems,other}`（件；patrolItems 為待審則數）；新增 `decisions:{count,items[≤3]{id,title,deadline}}`，只計尚未逾期者（逾期仍在審核表顯示「已逾期」）。查詢走 `idx_bot_drafts_status`（待審範圍）與 `bot_draft_decisions` 主鍵，不新增全表掃描。
- **平台**：delivery `platform` 新寫入只收 FB／IG／Threads（不分大小寫、存標準寫法），其他回 400，可省略；舊自由文字照原樣顯示。
- **巡視場次狀態**：海巡稿可帶 `sessionRef`（同 BOT、同台北日已登錄的場次，否則 400）存於 `bot_drafts.session_id`（改稿沿用）。場次狀態由伺服器推算（只看最新版稿件）：有待審的則＝待審核；否則有通過但尚無 delivery 的則、且場次未結束＝已審核；其餘＝已完成。BOT 可由 `patrol-sessions` 帶 `completed:true` 記下 `completed_at`（只記第一次，不會重新開啟）。沒有連結稿件的舊場次有送出成果即已完成；沒有稿件、成果、結束時間的空場次不列。人員在 CY Web 審核只改變推算結果，BOT 不需重報。
- **人員 API 新增**：`GET /api/bot-center/sent-items?...&sessionId=`（0＝未歸場次）、`GET /api/bot-center/patrol-sessions/:id/items`（待審或已通過未送出的則）。
- **備份／migration**：0079 新增 `bot_draft_decisions`、`bot_drafts.session_id`（索引）、`bot_patrol_sessions.completed_at`，為業務資料，納入可攜備份，`CURRENT_MIGRATION=0079`。
- 不做：拍板到期提醒推播（使用者決定不做）。

## API 現況（V0.22.0）

人（CYWEB session＋BOT_CENTER 權限）：

| 方法 | 路徑 | 作用 |
| --- | --- | --- |
| GET | `/api/bot-center` | 工作總覽、審稿清單、時間軸、憑證狀態（botCode、draftStatus、三種游標） |
| GET | `/api/bot-center/progress` | bots、憑證、推播狀態，不回歷史 |
| GET | `/api/bot-center/sent-items` | kind=post／patrol、summary=1、before、botCode、sessionId；每頁 50 |
| GET | `/api/bot-center/patrol-sessions/:id/items` | 場次待處理的則 |
| GET | `/api/bot-center/deliveries/:id`、`/delivery-images/:id`、`/images/:id` | 成果全文、圖片 |
| GET | `/api/bot-center/drafts/:id` | `{draft,items,images}`，draft 含 decision |
| POST | `/api/bot-center/drafts/:id/review` | `{decision,reason?,choice?}` |
| POST | `/api/bot-center/drafts/:id/items/:seq/review` | 逐則審核 |
| POST | `/api/bot-center/drafts/:id/push/retry` | SUPER_ADMIN 重送失敗推播 |
| PUT | `/api/bot-center/bots/:code/push` | SUPER_ADMIN 逐 BOT 推播設定 |
| GET／POST／DELETE | `/api/bot-center/bots/:code/credential` | 憑證狀態／產生輪換／撤銷（寫入僅 SUPER_ADMIN） |

（`POST /api/bot-center/bots` 已移除，BOT 由程式碼 `INITIAL_BOTS` 定義。）

機器（各 BOT 自己的 Bearer）：

| 方法 | 路徑 | 作用 |
| --- | --- | --- |
| GET | `/api/bot-ingest/identity` | 憑證所屬 botCode／botLabel |
| POST | `/api/bot-ingest/progress`、`/reports`、`/completions` | 進度、回報、完成事件 |
| POST | `/api/bot-ingest/drafts` | `{title,body,externalRef?,kind?,items?,previousDraftId?,decision?,sessionRef?}` |
| GET | `/api/bot-ingest/drafts/:id`、`?externalRef=` | 讀自己的審核結果（含 decision） |
| POST | `/api/bot-ingest/drafts/:id/images?item=`、`/sent` | 審核圖片、舊版已送出回報 |
| POST／GET | `/api/bot-ingest/deliveries`（GET 用 eventRef） | 實際成果回報（platform 限 FB／IG／Threads） |
| POST | `/api/bot-ingest/deliveries/:id/images?uploadRef=` | 成果圖片 |
| POST | `/api/bot-ingest/patrol-sessions` | `{sessionRef,label,day?,note?,completed?}` |

## V0.21.3 成果與手機審稿（工程實作，未部署）

以下為本版現行契約，優先於下方歷史沿革。

- 審核與實際成果分離。bot_deliveries為逐篇／逐則已發出的快照，文章count、發表清單、留言N與點閱均以此來源；bot_completions保留時間軸，文字完成回報本身不當成有全文的發布成果。0077保留既有sent的post／patrol items並建立ledger，不猜測general舊稿或僅有completion的內容。
- POST /api/bot-ingest/deliveries：同BOT固定eventRef，kind=post/patrol；cyweb來源必須連自己的已通過稿件或item，內容完全相同。chat/line/other來源填真實核准說明與完整內容，可不經CYWEB送審。這是已發出成果回報，不是新的發布授權。可附platform、HTTPS url、真實sentAt。
- 固定事件、原稿／則、發布網址防重複；同內容重試回原紀錄、衝突409。舊sent來源可一次補穩定事件編號／空白平台與巡視場次，原id及數量不變。其餘成果不可覆寫。實際新寫入與一次完成事件、對應pending解決同batch，隨機write_key限制只有勝出者能解決對應稿件，並行敗者不會動到其他待審稿。
- 外部成果連到pending時記externally_completed_at，原review_status、reviewer、理由不改；人員讀模型以external／外部已處理呈現，只讀、不計pending、不重做CYWEB審核或推播，同批其他pending保留。已發出／外部已處理版本不可被新版覆蓋。外部來源不偽造CYWEB通過。
- POST /api/bot-ingest/patrol-sessions：sessionRef、day、label及可選40字note。同場更新同一行，日期不可改；label由BOT給，不從時間／長標題猜。摘要顯示「午巡｜已送出N則」，N查同一ledger；未補場次舊成果只顯示「已送出N則」，不假造午巡名稱。帳號與連結在點N的逐則全文。
- GET人員 /api/bot-center/deliveries/:id、/delivery-images/:id沿用CYID＋BOT_CENTER；機器GET /api/bot-ingest/deliveries?eventRef=限制原BOT。正文安全文字呈現、連結只HTTPS。主頁文章metadata及sent-items均50筆keyset；點文章只讀一筆全文＋圖；沒有新歷史輪詢，progress仍僅主檔／整合狀態。
- 外部成果可用POST /api/bot-ingest/deliveries/:id/images?uploadRef=SHA256補圖片，檔頭驗證、2MB、每篇10張、雜湊去重；沿用BotImages／原圖放大與Dialog。bot_delivery_images屬ephemeral，隔日清理，不進portable backup。
- 手機待審用共用ListRow壓兩列：初稿／2修＋標題、時間＋BOT＋內容摘要，右側StatusChip；全部原資訊保留，整列點閱。桌機維持表格。手機審稿共用Dialog，一次一則，上一則／下一則，底部通過／退回，批次動作共用OverflowMenu；送審說明可用既有ExpandToggle讀取。無背景關閉與重複X。
- 0077與backup schema同步；ledger／巡視場次為業務資料會備份，舊備份restore upgrade由已sent items重建ledger。原SOCIAL_EDITOR token、持久收據、routine與推播設定均不動。回報工具與技能須等WEB先部署後更新。


沿用 CYWEB 殼層、`#bot-center` 路由及 `BOT_CENTER` 模組，在左側 ERP 查詢下一項。SUPER_ADMIN 自動具有模組權限；其他人須取得模組權限。以下為目前 V0.15.0 介面契約與既有 V0.12.4 伺服端推播契約；正式部署狀態以根 TODO 為準。

## V0.18.13 工作卡片與送出內容（已部署，待Claude事後審查）

- Threads卡片維持「今日巡視N則」，N是台北當日實際sent_at海巡回覆數，不是巡視完成批次。點N開啟共用Dialog，逐則呈現已送出全文／送出時間；未送出或退回項目不列入。
- N下方呈現當日threads_patrol完成回報的title與detail（最新在上，最多50筆）；早巡／午巡／晚巡及已送出等文字由BOT自行回報，CYWEB不依時間猜名稱、不把巡視完成自動當作已送出。過多回報在卡內捲動，沒有展開收合。巡視的count／latest／toSend欄位保留；V0.21.6起已移除未使用的articles.latest、articles.reviewed、patrols.reviewed。
- 新文章N篇保持純顯示（仍由article_published完成事件計數）。下方published每列對應一則實際送出的post item，可點開原BotReviewDialog，但僅顯示該篇全文／附圖，不顯示同批其他篇、批次說明、版本導航或審核按鈕。審核圖片仍依原隔日清理政策，不能宣稱長期保存公開平台媒體。
- 新GET /api/bot-center/sent-items需既有BOT_CENTER人員權限；kind=patrol/post，before=sentAt|itemId，summary=1只回標題與識別／時間、不回正文；botCode選填。每頁50則、以sent_at DESC,id DESC續頁，限制台北當日並排除被取代的稿件，沿用既有sent_at索引，沒有migration。
- 主頁articles.published首批只取標題／識別，完整內容點開才查；巡視全文也只在點N時讀取。多頁由使用者按載入更多，不先載入全部歷史。主頁巡視回報查詢取代原latest巡視查詢；新增文章逐則metadata一個有界查詢，30秒progress輪詢不變，不增加背景歷史／送出明細輪詢。
- 待核准N以var(--cy-danger)紅字顯示，沿用既有字級。FINANCE卡片仍只讀當日progress摘要，不改財務BOT設定或憑證。

## V0.18.12 目前改稿／發布契約（已部署，待Claude事後審查）

以下變更優先於後文的歷史沿革；未列出的既有權限、推播與完成回報契約不變。

- 稿件增加版本欄。POST /api/bot-ingest/drafts 可帶 previousDraftId，必須使用新的 externalRef；只可接同 BOT、同 kind 的目前最新版，且不得已實際送出整篇或任一則。新版固定重新待審、自動初稿→2修→3修，舊稿保留唯讀歷史。主清單、各待審計數、工作摘要只計最新版；審稿視窗可看上一版與新版。舊有 rN 不以標題猜測關聯。
- 審核、附圖與送出除預讀檢查外，寫入亦檢查沒有新版。唯一 previous_draft_id 索引與同一 batch 保證一次只有一個接續版本；已取代的推播不再排送，Grok 收到已在途的舊喚醒仍會重新讀取並略過。
- 每則／單篇最多 10 張審核圖片（仍每張 2MB）；新版不繼承舊圖。已審或被取代稿件的圖片隔日清除；目前待審稿圖片保留。
- 卡下清單改按實際送出時間 sent_at 的台北當日，post 在「今日發布的貼文」，patrol 在「今日送出的海巡」。人工審核本身不進清單；點開顯示稿件／各則送出時間。已送出清單以 articles.published／patrols 的 sentToday 提供（V0.21.6 移除舊 reviewed 欄位）。每卡明細最多 50 稿。
- 文章發布總數／時間軸仍由明確的 complete.article_published 計數；巡視次數由 complete.threads_patrol 計數；sent 表示實際發出哪些稿／則，兩種回報各有用途。回報工具與技能已同步，保留小編原有 token、routine、持久收據。
- 財務會計 FINANCE 取代 IT。0068 清除 IT 的稿、逐則、回報、完成、憑證與推播設定；審核圖片先加入技術清理佇列，排程每次最多 100 張、儲存空間刪除成功才移除佇列，失敗下次重試。財務會計不繼承 IT 祕密；小編所有整合原值保留。既有全系統 Audit 不改寫。
- UI 與人員 API 移除新增 BOT，新 BOT 由程式碼 INITIAL_BOTS 定義；設定仍管理現有 BOT 的各自憑證與推播。
- 卡片與長標題允許收縮，手機單欄，不擠出狀態文字。審稿表格在手機仍於表格自身捲動，不撐大整頁。
- migration marker 與備份欄位同步 0068；版本鏈為業務資料會備份／還原，圖片清理佇列與憑證等整合資料不進可攜備份。

## 畫面（V0.15.0 起的沿革）

1. 頂部總覽使用純狀態 StatusChip，BOT 狀態不作篩選；頁首仍可查看回報紀錄與設定。
2. **待審核**：共用 `cy-op-table` 全寬表格，每件一列。內容欄只顯示分類（貼文／海巡＋則數）與第一行；操作為「審閱」（已審為「查看」），開啟審閱視窗看全文。退回理由必填，Worker 同樣強制驗證。審核與 Audit 保持原子性及並行勝出者檢查，不發布內容。審閱視窗見下方「多則逐則審核」。
3. **工作摘要**：桌機一排四張「新文章通知／Threads 巡視回報／拍板結案／待核准」。前兩張只統計台灣當日對應分類的實際完成事件。Threads 卡片顯示「今日巡視 N 次」與「已送出 X 則・待送出 Y 則」；新文章與 Threads 卡片下方各列出今日審完的貼文／海巡，點開看詳細內容。待核准包含所有日期尚未處理的稿件，並分列「貼文 N 篇・海巡 N 則」，依目前 BOT 範圍統計。拍板結案僅保留標題與 `—`，沒有計數、查詢、事件分類或後臺串接；不得拿一般完成數冒充。
4. **今日完成時間軸**：位於頂部，最新五筆在首頁，完整清單於共用 Dialog 依游標載入；同分鐘共用一個時間點，但各事件各有單行文字。溢出時才顯示共用小箭頭，展開可讀取該件標題與全部詳情，再次按下收合；原資料、排序及台灣日期規則均不變。
5. **BOT 當日摘要**：位於工作摘要卡片下方，桌機一排四張；各卡只顯示名稱、最後回報狀態及當日摘要，移除卡片的回報／待審按鈕、數字及展開。昨日摘要不當成今日資料；沒有今日摘要顯示「今日尚無回報」。此區保留全部 BOT，不因上方篩選隱去其他身份。新增 BOT 自然往下排列；中等寬度兩欄、手機單欄。
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

## API（歷史沿革；現況以上方「API 現況（V0.22.0）」為準）

人（既有 CYWEB session＋BOT_CENTER 權限）：

| 方法 | 路徑 | 作用 |
| --- | --- | --- |
| GET | `/api/bot-center` | 工作總覽／完整統計／憑證狀態；botCode、draftStatus 及三種既有游標不變 |
| GET | `/api/bot-center/progress` | bots、credentials、canManageCredentials、pushReady、pushSettings，不回歷史／統計 |
| PUT | `/api/bot-center/bots/:code/push` | SUPER_ADMIN 設定逐 BOT webhook；網址／key 留白保留，不回傳原值 |
| POST | `/api/bot-center/drafts/:id/push/retry` | SUPER_ADMIN 重送 failed 推播；不重做審核，同 eventId |
| POST | `/api/bot-center/drafts/:id/review` | `{decision:"approved"\|"rejected",reason?}`；退回必填，通過忽略理由 |
| GET／POST／DELETE | `/api/bot-center/bots/:code/credential` | 讀該 BOT 狀態／產生或輪換／撤銷；寫入僅 SUPER_ADMIN |
| GET | `/api/bot-center/drafts/:id` | 審閱用完整內容：`{draft,items,images}` |
| POST | `/api/bot-center/drafts/:id/items/:seq/review` | 逐則 `{decision,reason?}`；最後一則審完即結束整篇 |
| GET | `/api/bot-center/images/:id` | 審核圖片（僅模組權限；nosniff、CSP none） |

機器（自己獨立的 `Authorization: Bearer <token>`）：

| 方法 | 路徑 | 作用 |
| --- | --- | --- |
| GET | `/api/bot-ingest/identity` | 回傳憑證實際 botCode／botLabel，供工具核對設定 |
| POST | `/api/bot-ingest/progress` | `{botCode?,status,summary?}`；idle／working／blocked／done |
| POST | `/api/bot-ingest/reports` | `{botCode?,title,body}` |
| POST | `/api/bot-ingest/drafts` | `{botCode?,title,body,externalRef?,kind?,items?}`，同 BOT＋externalRef 回原稿、不覆寫；kind=post／patrol 時 items 1–50 則 `{ref?,title,body}` |
| GET | `/api/bot-ingest/drafts/:id` | 只可讀自己的審核結果；多則稿另回 `items`（各則結果） |
| POST | `/api/bot-ingest/drafts/:id/images?item=` | 原始圖片內容（JPEG／PNG／WebP，≤2MB，每篇或每則最多 5 張），僅待審稿 |
| POST | `/api/bot-ingest/drafts/:id/sent` | 回報已實際送出；多則稿 `{items:[則號]}`，只記通過且未記的則 |
| GET | `/api/bot-ingest/drafts?botCode=&externalRef=` | 同上；botCode 可省略，帶入時必須相符 |
| POST | `/api/bot-ingest/completions` | `{botCode?,title,detail?,completedAt?,workType?,eventRef?}`；completedAt 預設現在 |

## Grok 工具、技能與啟用順序

[工具與共用技能](../../integrations/grok-bot/cyweb-work-reporter/SKILL.md)、[Grok 設定](../../integrations/grok-bot/cyweb-work-reporter/references/grok-setup.md)為 Node22+、無第三方執行套件的可攜包。WEB／0058 先部署，再更新工具；小編的原安全憑證與持久收據保持不變，其他 BOT 分別提供自己的憑證。

`check` 用 identity 驗證歸屬；complete 將固定 eventId 傳為 eventRef，general 舊收據相容。report 仍只有本機收據，斷線結果不明時不刪收據或換編號重送。工具沒有員工登入、自行審核或發布命令；核准後的外部操作仍按使用者與 Grok 授權。

V0.12.4 Build 1 在審核落庫後喚醒既有 Grok routine；推播沒有核准權威，BOT 仍須認證讀取結果。小編 pilot 只測試送審 → 人工核准 → 完成回報，不對外發文、不計入文章／巡視卡片。發布與審查證據見 [TODO](../../TODO.md)、[handoff](https://github.com/simonliu1118-byte/chihyuan-web/blob/ff3562c6bfcddb67ff19ded15fa485fd527c7c4a/docs/handoff/CYWEB-GROK-REPORTER-0123-20261107.md)。

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

## V0.12.6 視窗寬度與時間軸補充（2026-11-08）

- 完成事件使用共享 `ExpandToggle` 與實際文字溢出量測，避免短文出現無效展開箭頭。展開僅在前端顯示當次已載入內容，不另發 API 或改動事件資料。
- 推播設定 Dialog 限制桌機寬 414px（原 medium 620px）；BOT 設定 Dialog 限制桌機寬 720px（原 large 900px）。僅套用特定 class，不修改共用 Dialog 全域尺寸；憑證表格最小 680px，較窄畫面保留捲動。
- 只刪除 Threads 巡視卡片的最新詳情段落，不刪除資料來源、統計與其他摘要卡的內容。

## 多則逐則審核、審核圖片與送出回報（V0.15.0，0060）

使用者 2026-11-09 定案：單篇稿整篇審（方案 A）；貼文、海巡一次送多則時逐則審（方案 B）；BOT 可附圖片僅供審核，畫質可較低，審完隔日刪除。

- **資料**：`bot_drafts.kind`（general／post／patrol）、`sent_at`；`bot_draft_items` 存各則（則號 1–50、ref、標題、內容、審核結果、送出時間）；`bot_review_images` 只存 R2 物件位置（`HR_FILES` 的 `bot-review/` 前綴）。圖片表不進可攜備份。
- **逐則審核**：每則通過或退回（退回必填理由）。最後一則審完時整篇自動結束：有任何一則通過 → 整篇「通過」，若有退回則理由為「部分通過」；全部退回 → 整篇「退回」，理由「全部退回」。BOT 只處理通過的則。整篇按鈕「剩餘 N 則全部通過／全部退回」只套用尚未審的則。逐則 Audit 為 `bot_draft.item_approved／item_rejected`，與更新同一個 batch；推播在整篇結束時才排入，沿用原 outbox。
- **審閱視窗**（`BotReviewDialog`）：共用 Dialog；上一篇／下一篇、送審說明、各則全文（保留換行、網址可點、不解析 HTML）、圖片縮圖點開放大、各則審核按鈕。
- **圖片**：伺服器以檔頭判斷型別，不信任宣告的 content-type；超過 2MB 回 413，每篇或每則超過 5 張回 409，已審稿不能加圖。每次排程刪除「審核日早於台灣今日」的稿件圖片（每次最多 100 張，R2 與 D1 一起刪）。
- **送出回報與今日統計**：BOT 實際送出後回報 `sent`。Threads 卡片「已送出」為今日 `sent_at` 的海巡則數，「待送出」為尚未送出且未退回（待審＋已通過）的海巡則數；「今日巡視 N 次」仍是 `threads_patrol` 完成事件數。今日審完清單各取 50 筆。
- **Grok 工具**：`submit` 加 `kind`／`items`，`review` 回各則結果，新增 `image`（本機絕對路徑）與 `sent`。WEB V0.15.0／0060 部署後再更新工具。

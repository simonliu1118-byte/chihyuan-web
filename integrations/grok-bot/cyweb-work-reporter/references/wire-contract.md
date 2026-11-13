# 共用回報操作契約

入口：`node /workspace/cyweb-work-reporter/scripts/cyweb-reporter.mjs <command>`。JSON 從標準輸入，不從命令參數讀內容。`--help` 不需連線設定。

## 命令與 JSON

| 命令 | JSON | 結果 |
| --- | --- | --- |
| `check` | `{}` | 健康、版本與 `/identity` 憑證歸屬檢查；不送出業務 POST |
| `progress` | `{"status":"working","summary":"正在準備貼文"}` | 狀態與更新時間；status：idle／working／blocked／done，摘要最多 200 字 |
| `submit` | `{"externalRef":"social-post-20261107-r1","title":"測試標題","body":"待審全文"}` | 送審 ID、externalRef、pending／approved／rejected、理由與審核時間 |
| `submit`（多則） | `{"externalRef":"threads-patrol-20261109-r1","title":"Threads 巡視 11/9 下午","body":"本次巡視說明","kind":"patrol","items":[{"ref":"thread-123","title":"回覆 @某帳號","body":"回覆全文"}]}` | 同上，另含 `kind` 與 `items`（各則 seq、ref、title、status、reason、sentAt）。kind：post 貼文、patrol 海巡；1–50 則 |
| `image` | `{"externalRef":"threads-patrol-20261109-r1","item":1,"file":"/workspace/shots/1.jpg"}` | 審核用圖片；JPEG／PNG／WebP、2MB 內、每篇或每則 10 張；只能加在待審稿；item 省略則附在整篇 |
| `sent` | `{"externalRef":"threads-patrol-20261109-r1","items":[1,3]}` | 回報已實際送出的則號（單篇省略 items）；只接受通過的則，重複回報不重算 |
| `review-notification` | `{"type":"cyweb.review_result","eventId":"bot-review-123","botCode":"SOCIAL_EDITOR","draftId":123}` | 以本 BOT 憑證即時讀指定稿件；ignored 表示安靜略過，正式結果在 review，不發布 |
| `review` | `{"externalRef":"social-post-20261107-r1"}` | 只讀這個 BOT 的同編號審核結果 |
| `report` | `{"eventId":"task-01:milestone-1","title":"資料整理完成","body":"已整理合成測試素材，待撰稿"}` | 紀錄 ID、是否送達／是否由既有收據抑制重複 |
| `complete` | `{"eventId":"task-01:completed","title":"貼文已發布","detail":"實際成果與平台","reviewRef":"social-post-20261107-r1","workType":"article_published"}` | 讀回核准後記錄完成；不需審核可省略 reviewRef；workType 預設 general，其他為 article_published／threads_patrol |
| `pilot-start` | `{"reference":"social-editor-pilot-20261107-01"}` | 僅小編，送測試稿、回報及待人工審核摘要 |
| `pilot-finish` | 同一 reference | 僅小編，核准後記錄測試完成，不發文 |

多則稿每則標題最多 120 字、內容 4,000 字、ref 80 字；整份 JSON 輸入上限 256KB。標題最多 120 字，正文／詳情 4,000 字，externalRef 80 字、eventId 120 字、pilot reference 70 字，皆以 Unicode code point 計。`complete.completedAt` 選填有效 UTC ISO 時間（如 `2026-11-07T02:00:00.000Z`），不填用伺服器現在時間。不能回報尚未完成的事；不要預設未來時間。未列出的輸入欄位會拒絕；review-notification 對不合法喚醒安靜略過。身份由安全憑證固定，只有 review-notification 的 botCode 用來比對自己的身份，不能覆寫；不能傳 URL 或 token。

輸出只有一份 JSON；成功 `{"ok":true,"data":{...}}`，失敗 `{"ok":false,"error":{"code":"...","message":"..."}}` 並回傳非零程序狀態。不要把非零狀態忽略後仍繼續依賴操作。

## 實際使用的 API

只呼叫 `/api/health` 與 `/api/bot-ingest/identity|progress|reports|drafts|drafts/:id/images|drafts/:id/sent|completions`，機器 Authorization 由工具加入；健康檢查不帶憑證。禁止轉址，不提供員工登入、審核、輪換憑證、任意 URL 或對外發布命令。HTTP 逾時 15 秒，不自動重試寫入。多則、圖片與送出回報要求 WEB V0.15.0／0060；改稿要求 WEB V0.18.12／0068；其餘要求 WEB V0.12.4 Build 1／0058，identity 會回傳憑證實際歸屬。

伺服器送審以同 BOT + externalRef 去重，只回傳原資料。新版 complete 把 eventId 傳為 eventRef，伺服器以同 BOT + eventRef 唯一索引去重；相同內容回原紀錄，不同內容回 409 BOT_EVENT_CONFLICT，未分類舊完成紀錄不猜測分類。非 general 分類必須有 eventRef，同一實際發布／巡視始終保持相同編號。完成 API 仍允許舊客戶端不帶 eventRef 的一般紀錄，此時沒有伺服器去重。

report 仍無伺服器 idempotency key。工具對 report／complete 都在首次寫入前保存本機 pending 收據，成功後原子替換為 delivered；收據只含雜湊、狀態與 ID，不存內容或憑證。並行首次送出以獨占建立收據避免重複，不能泛稱所有操作都是多電腦 exactly-once。general 舊收據的 fingerprint 保持相容，更新不重送已完成事件，也不將它改算新文章。

已確認的 API 4xx 拒絕會釋放該收據，修正原因後可用原事件再試；逾時、斷線、5xx 或無法辨識回應會保留 pending，禁止盲目重送。收據目錄不可刪除或在不同執行之間換位置。無法確認時到 WEB 核對並交由人工處理，不直接操作正式資料庫。

## 權限與限制

- 憑證在伺服器綁定 bot_id。寫入只可操作自己，傳不相符的 botCode 回 403；按 ID 讀別隻 BOT 的稿件回 404，按外部編號指定別隻 BOT 回 403。工具輸入仍不能覆寫 BOT 身分。原共用憑證已原樣歸屬 SOCIAL_EDITOR，其他 BOT 必須取得自己的憑證。
- `complete.reviewRef` 的核准檢查只在本工具發送前執行，沒有修改伺服器完成 API 或加入發布交易。不能宣稱任何持有憑證的客戶端都必須先審核，也不能宣稱核准與外部發布原子同步。
- `check` 以 GET identity 確認實際身份，不再用不存在稿件的 404 推論成功。憑證失效或 BOT 設定不符都會失敗。
- 沒有對所有歷史的輪詢，也不會拉取客戶／訂單資料。每次 submit 查該編號是否已存在，再按需新增版本；每次 review 一次 GET。附 reviewRef 的 complete 會先讀該份審核。pilot 是有限次設定與送出，不是常駐服務。
- 正常 UI 依自己的刷新機制更新；CLI 回傳成功不代表瀏覽器立刻重繪，必要時手動重新整理管理中心。
- 只有 article_published／threads_patrol 的成功完成事件進對應今日卡片；detail 可放平台或巡視結果。一般 report、送審、人工核准、測試皆不直接增加文章數。拍板結案目前沒有分類／後臺。推播僅傳四個識別欄位，不含審核決定、理由或稿件正文；收到後一次 GET 讀回正式結果。重送可能重複喚醒，不能宣稱外部工作 exactly-once。

CYWEB 完整契約見主專案 `docs/architecture/BOT_CENTER.md`。

## 新版覆蓋（WEB V0.18.12／0068）

`submit` 新增選填 `previousDraftId`（正整數，原稿 id），externalRef 必須換新。新列會設 previous_draft_id 與 revision_number=原稿+1，原稿保留歷史但不再出現在待審／主清單與統計。新稿重新待審；不能從別隻 BOT、不同 kind、已有新版或已送出任一則的稿件分叉。競爭失敗回 409，先讀回最新版，不盲目重試。舊 externalRef 仍可直接 GET，回 supersededById；工具會阻止依舊稿進行後續操作。

送審回應多 revisionNumber、previousDraftId、supersededById；review 輸出保留 revisionNumber／supersededById。歷史 legacy r2／r10 不依標題猜配對；此版起必須明確帶 previousDraftId，才會連成版本鏈。

新文章卡的發布總數仍以 complete.article_published 計數；卡下清單改以該稿／則的實際 sent_at 台北當日列出。一次海巡完成的 complete.threads_patrol 與逐則 sent 是不同維度。兩種回報不可互相冒充，單純審核不是實際送出。


## V0.18.13 顯示規則

巡視卡N取sent回報的海巡回覆則數；complete.threads_patrol仍是一個巡視事件，title原樣顯示名稱＋實際狀態，detail原樣顯示摘要。示例title「午巡 已送出」，detail「本次回覆的重點與待人工確認事項」。每次巡視一個固定eventId，不逐則建立巡視完成事件。

文章每個post item即一篇發布內容，items.title／body分別放標題與該篇全文；實際發布後sent該seq，再用article_published完成事件記入總篇數與時間軸。若有送審保留對應reviewRef。不要依標題猜配對、不重報舊事件、不把尚未送出的內容標成已發布。人員端的sent-items查詢不在BOT工具呼叫範圍，BOT不使用員工session。

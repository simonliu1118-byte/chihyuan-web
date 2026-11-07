# 共用回報操作契約

入口：`node /workspace/cyweb-work-reporter/scripts/cyweb-reporter.mjs <command>`。JSON 從標準輸入，不從命令參數讀內容。`--help` 不需連線設定。

## 命令與 JSON

| 命令 | JSON | 結果 |
| --- | --- | --- |
| `check` | `{}` | 健康、版本、憑證檢查；不送出業務 POST |
| `progress` | `{"status":"working","summary":"正在準備貼文"}` | 狀態與更新時間；status：idle／working／blocked／done，摘要最多 200 字 |
| `submit` | `{"externalRef":"social-post-20261107-r1","title":"測試標題","body":"待審全文"}` | 送審 ID、externalRef、pending／approved／rejected、理由與審核時間 |
| `review` | `{"externalRef":"social-post-20261107-r1"}` | 只讀這個 BOT 的同編號審核結果 |
| `report` | `{"eventId":"task-01:milestone-1","title":"資料整理完成","body":"已整理合成測試素材，待撰稿"}` | 紀錄 ID、是否送達／是否由既有收據抑制重複 |
| `complete` | `{"eventId":"task-01:completed","title":"貼文工作完成","detail":"實際成果摘要","reviewRef":"social-post-20261107-r1"}` | 讀回核准後記錄完成；若事務不需審核可省略 reviewRef |
| `pilot-start` | `{"reference":"social-editor-pilot-20261107-01"}` | 僅小編，送測試稿、回報及待人工審核摘要 |
| `pilot-finish` | 同一 reference | 僅小編，核准後記錄測試完成，不發文 |

標題最多 120 字，正文／詳情 4,000 字，externalRef 80 字、eventId 120 字、pilot reference 70 字，皆以 Unicode code point 計。`complete.completedAt` 選填有效 UTC ISO 時間（如 `2026-11-07T02:00:00.000Z`），不填用伺服器現在時間。不能回報尚未完成的事；不要預設未來時間。未列出的輸入欄位會拒絕，身份由環境設定固定，不能在 JSON 另傳 botCode、URL 或 token。

輸出只有一份 JSON；成功 `{"ok":true,"data":{...}}`，失敗 `{"ok":false,"error":{"code":"...","message":"..."}}` 並回傳非零程序狀態。不要把非零狀態忽略後仍繼續依賴操作。

## 實際使用的 API

只呼叫既有 `/api/health` 與 `/api/bot-ingest/progress|reports|drafts|completions`，機器 Authorization 由工具加入；健康檢查不帶憑證。禁止轉址，不提供員工登入、審核、輪換憑證、任意 URL 或對外發布命令。HTTP 逾時 15 秒，不自動重試寫入。

伺服器送審以同 BOT + externalRef 去重，只回傳原資料。報告與完成 API **本身沒有 idempotency key**；工具在首次寫入前保存本機 pending 收據，成功後原子替換為 delivered。收據只含雜湊、狀態與紀錄 ID，不存內容或憑證。並行首次送出以獨占建立收據避免重複；這不是伺服器 exactly-once 或多電腦交易保證。

已確認的 API 4xx 拒絕會釋放該收據，修正原因後可用原事件再試；逾時、斷線、5xx 或無法辨識回應會保留 pending，禁止盲目重送。收據目錄不可刪除或在不同執行之間換位置。無法確認時到 WEB 核對並交由人工處理，不直接操作正式資料庫。

## 權限與限制

- 這是合作式工具的操作限制，不是新增逐 BOT 的伺服器權限。既有共享憑證仍可透過原 API 代其他 BOT 回報；只配置給受信任帳號，並固定自己的角色。工具輸入不能覆寫 BOT 身分。
- `complete.reviewRef` 的核准檢查只在本工具發送前執行，沒有修改伺服器完成 API 或加入發布交易。不能宣稱任何持有憑證的客戶端都必須先審核，也不能宣稱核准與外部發布原子同步。
- `check` 使用 GET 查不存在的固定送審編號；404 視為憑證獲接受，未知 BOT 也可能 404。因此 BOT 身份必須先在管理中心確認，首次回報會再由伺服器驗證。
- 沒有對所有歷史的輪詢，也不會拉取客戶／訂單資料。每次 submit 最多一次查詢加一次新增；每次 review 一次 GET。附 reviewRef 的 complete 會先讀該份審核。pilot 是有限次設定與送出，不是常駐服務。
- 正常 UI 依自己的刷新機制更新；CLI 回傳成功不代表瀏覽器立刻重繪，必要時手動重新整理管理中心。

CYWEB 完整契約見主專案 `docs/architecture/BOT_CENTER.md`。

---
name: cyweb-work-reporter
description: Report BOT work progress, submit drafts for human review, read review decisions, and record completed work in the CYWEB BOT management center. Use when starting or updating a tracked task, encountering a blocker, requesting review, checking a pending review, or finishing authorized work. Supports SOCIAL_EDITOR, CONTENT_EXPERT, CEO, IT and other preconfigured CYWEB BOT identities; includes a nonpublishing SOCIAL_EDITOR pilot.
---

# CYWEB 共用工作回報

這份技能供 Grok Bot 使用。共用工具只連接 CYWEB 管理中心，不登入員工帳號、不核准自己的送審、不對外發文。先讀 [Grok 設定](references/grok-setup.md)，需要欄位或例子時讀 [操作契約](references/wire-contract.md)。

## 執行前

1. 工具保存在 `/workspace/cyweb-work-reporter`，使用 Node.js 22 或以上，不需安裝 npm 套件。用 `node --version` 確認；若未具備執行環境，先回報阻礙。
2. 由平台安全注入 `CYWEB_BOT_TOKEN`，其餘環境設定為 `CYWEB_BASE_URL`、本 BOT 的 `CYWEB_BOT_CODE`、持久收據目錄 `CYWEB_REPORTER_STATE_DIR`。不可把憑證寫進聊天、命令參數、JSON、技能或普通檔案；不可用 `env`、`printenv`、`echo` 印出或檢查值。若無法安全注入，停止連線並告知使用者，不改用明文 `.env`。
3. 技能可共用，但執行時必須使用自己固定的 BOT 代碼。小編為 `SOCIAL_EDITOR`；其他角色必須事先在 CYWEB 設定，不猜測或冒用。共用電腦上的環境設定不要互相覆寫。
4. 執行 `node /workspace/cyweb-work-reporter/scripts/cyweb-reporter.mjs check`。這只檢查健康與憑證，不建立正式工作；成功不代表所有角色或外部發布都已授權。

## 回報流程

所有命令的內容以 JSON 從標準輸入提供。憑證只能由安全環境注入。以下 JSON 使用合成資料：

```sh
node /workspace/cyweb-work-reporter/scripts/cyweb-reporter.mjs progress <<'JSON'
{"status":"working","summary":"正在準備本週文案"}
JSON
```

- 開始工作／重大進展：`progress`，填簡短真實摘要。不要逐字回報、每個工具呼叫回報或固定心跳。
- 遇到阻礙：`progress` 為 `blocked`，說明缺少什麼；需要保留的事件才另外 `report`。
- 需要使用者審核：用 `submit` 傳完整待審內容與固定 `externalRef`，接著進度改 `idle`，摘要標明待審。回覆送審編號並停止依賴此核准的後續操作。
- 同一內容重試保留相同 `externalRef`；內容修改必須使用新版本編號，例如 `social-post-20261107-r2`。既有編號不會更新原稿或重置審核。
- 使用者告知已審或工作恢復時：用 `review` 讀取原編號。只有 `approved` 才能處理該份已核准內容；`pending` 繼續等待；`rejected` 先處理理由，以新版本再送審。不能自行呼叫人員審核 API、使用員工 session，或把等待視為核准。
- CYWEB 核准僅是這份內容的審核結果；對外發文仍須符合使用者指示及 Grok 平台權限。實際工作成功才 `complete`；若該事項經過送審，**必填對應 `reviewRef`**，工具會重新確認核准。未曾需要審核的已授權工作可省略。
- 完成後 `progress` 設為 `done`，摘要講實際成果。送審、排程、回報成功不等於外部工作完成。

## 防重複與失敗處理

- `report`／`complete` 必須使用固定且唯一的 `eventId`，同一事件的再次執行保持內容與編號不變。持久收據會阻止重複送出；這不是跨電腦或伺服器的 exactly-once 保證。
- 每次查看 `{ok:true}` 才能稱回報成功；錯誤或中斷不可聲稱已完成。
- `DELIVERY_UNCERTAIN` 表示可能已送達。停止重送，請使用者在 CYWEB 核對；不能刪收據、更換 `eventId` 或換另一台電腦盲目重送。收據遺失也先核對。
- `EVENT_CONFLICT` 表示同編號內容不同，先查明事件與原內容。不能為繞過錯誤無限制建立新事件。
- `BOT_UNAUTHORIZED` 交由使用者確認安全憑證；不可自行輪換或撤銷。輸出或貼回錯誤時不得加上環境值、Authorization、原始請求或其他祕密。
- 只回報必要工作內容，不含客戶個資、登入資訊、金鑰或未經允許的資料。工具只能辨識並阻擋目前的 BOT 憑證，不能替代其他資料的人工判斷。

## 小編首輪測試

固定一個本輪測試編號，例如 `social-editor-pilot-20261107-01`，整輪保持相同。

1. 設好安全憑證與小編環境，先 `check`。
2. `pilot-start` 輸入 `{"reference":"social-editor-pilot-20261107-01"}`，會送出標記為測試的進度、待審與回報，**不發文**。
3. 請使用者到 CYWEB「BOT 管理中心 → 待我審核」人工核准測試稿；未核准不要完成。
4. 核准後 `pilot-finish` 輸入同一 reference。工具讀回審核、記錄測試完成並更新進度。退回則停止，先確認原因。
5. 回報實際得到的送審／完成編號，請使用者確認管理中心顯示；不要把本機模擬測試說成已完成 Grok 實機連線。

這份技能不會自行建立排程。第一輪人工跑通後，如使用者另外要求，可設定只在有待審工作時定期讀結果；不查詢整個歷史或高頻輪詢。

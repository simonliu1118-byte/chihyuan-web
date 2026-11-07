# CYWEB V0.12.3 Grok Bot 共用回報交接

- 日期：2026-11-07（Asia/Taipei）；執行：GPT；分支 `cyweb/grok-reporting-kit-0123`，基準 main `79a9138b6082a1d32c8392dec7bc61326cdf963e`。
- 使用者本輪授權：「先幫我準備共用回報工具和技能，接小編測試，告訴我需要在 Grok Bot 那邊做哪些設定」。本輪沒有重新授權合併部署；完成後開 PR 給 Claude 審查，不借用前輪 dashboard 的授權。
- VERSION／package.json=0.12.3，BUILD=0；沒有 Worker、D1、UI 或 CYapps 變更。正式站仍為 V0.12.2，來源／發布證據見 TODO。不操作正式 BOT 憑證或真實工作紀錄。

## 檔案與行為

1. `integrations/grok-bot/cyweb-work-reporter/scripts/client.mjs`：只支援固定 CYWEB ingest 與 health 路徑；HTTPS 根網址、固定 BOT 環境代碼、Bearer 僅安全注入，禁止轉址，15 秒逾時，不盲目重試寫入。JSON 欄位／長度檢查、已知憑證阻擋與輸出遮蔽；未提供員工登入、核准、憑證管理、任意 URL 或對外發布操作。
2. `scripts/cyweb-reporter.mjs`（位於上述技能資料夾）：Node22+ 命令入口，JSON 標準輸入上限64KB；標準輸出為成功／失敗 JSON，失敗非零狀態，沒有堆疊或原始回應內容。無第三方執行依賴，工具可從 repo 外執行。
3. 送審固定 externalRef，先查後送，既有內容不同就要求新版本編號。review 只讀本 BOT 的外部編號。complete 若附 reviewRef 會重新確認核准；技能規定曾送審工作必填。沒有更改伺服器 API，不能宣稱所有持憑證客戶端都被強制先審或外部發布原子同步。
4. report／complete 固定 eventId + 雜湊 payload fingerprint；在持久目錄獨占建立 pending 收據、sync 後才 POST，成功原子替換 delivered。收據不含正文、標題、eventId 明文或 token。已確認4xx可修正後同事件重試；不明回應／斷線／5xx保留 pending 並阻止重送。同一持久目錄可防並行重複；不是伺服器、跨主機或收據遺失後的 exactly-once。
5. `SKILL.md`／`references/grok-setup.md`／`wire-contract.md`：共用回報流程、Grok 私人技能啟用、持久路徑、憑證安全設定、小編人工核准測試及錯誤處理。依 Grok Bot 官方文件，不套用 Grok Build `.grok/skills` 或 Codex metadata。API key 可用 secure secret card，共用 BOT 可於 Details → Secrets 加環境名稱；能否安全注入 shell 要在實機確認，無此能力即停止，不降級明文。
6. `scripts/test-support/bot-center-fixture.mjs`：抽出原 BOT 測試的 Worker bundle／完整 migrations SQLite fixture，供原 `bot-center.test.mjs` 及新增 `grok-bot-reporter.test.mjs` 共用。原測試內容不改。
7. VERSION／package.json、CHANGELOG／TODO、BOT_CENTER 架構與 handoff 索引同步。`runtime-check.yml` 路徑加入 `integrations/grok-bot/**`，未來只修改工具時亦會跑完整既有 Node suite（含新增測試），無新增 workflow／權限／套件。可攜 ZIP 僅在工作區 outputs 產出，不進 Public Git，內含五個工具／技能檔案，沒有環境設定、祕密或真實資料。

## 驗證

- `node --test scripts/bot-center.test.mjs scripts/grok-bot-reporter.test.mjs`：18/18 通過。新增8項覆蓋技能 metadata／資源完整、HTTPS／設定／輸入及身份覆寫拒絕、實際 Worker 小編送審 → pending 阻擋 → 人工核准 → 完成／去重、退回阻擋、收據隱私與事件衝突、寫入後斷線跨 client 不重送、401修正及並行送出、實際 HTTP + CLI JSON／錯誤不洩漏憑證。
- 以上全部為本機合成資料；憑證亦由隔離 fixture 臨時產生，未接正式 D1／Grok 或真實發布平台。沒有宣稱 Grok 實機已連通。
- `npm run build`（包含 browser／Worker TypeScript）成功；既有 dynamic import 與 bundle-size 提示仍在，本輪沒有新增套件。
- 本機沒有可用 Python，未執行 host skill 的 `quick_validate.py`；以 Node 檢查這份僅含 name／description 純量的 YAML frontmatter、命名／長度／無未完成佔位文字及本地 references／scripts 完整，且實際執行工具驗證行為。不將結構檢查冒充 Grok 平台已匯入技能。
- ZIP 五個檔案白名單已核對，從 repo 外的全新 OS 暫存目錄解壓執行 CLI `--help` 成功，無 npm 安裝。檔名 `cyweb-work-reporter-v0.12.3.zip`，15,638 bytes，SHA-256 `3e8f2a7ce87b06b8a263cecd48fd9e9aa078c1771fe9c0ad3617983f3f619cdb`；外部 outputs 交付、不提交 binary。PR CI 結果待補。

## Claude 審查重點／剩餘事項

- 核對客户端只使用原機器契約、無自行審核與發文、共享憑證風險描述正確；送審新版本與完成時 reviewRef 的合作式限制不誤稱伺服器防線。
- 核對首次 pending 收據失敗、併發、API拒絕與不確定結果的處理；無法確認時必須人工核對，不刪收據／換編號盲目重送。收據只存本機投遞狀態，不是另一套業務權威。
- 小編實機：使用者在 Grok 安全卡／Secrets 設定 CYWEB_BOT_TOKEN（不回傳聊天），提供 HTTPS 根網址、SOCIAL_EDITOR、持久收據目錄；工具與私人技能啟用後 check → pilot-start → 使用者 WEB 核准 → pilot-finish。若安全注入不可用就先停。測試會在正式管理中心留下標記明確的測試稿／回報／完成，不含正式文案，不發文。
- 人工測試過關後才能宣稱實機已接上，其他 BOT 各自配置 code；是否增加待審核准自動恢復的 routine 另由使用者決定，本輪沒有新增輪詢。
- Claude 最終審查：**待審，不由執行者代填通過**。未合併／未部署，亦不需為現有 V0.12.2 API 額外部署才能使用 CLI。

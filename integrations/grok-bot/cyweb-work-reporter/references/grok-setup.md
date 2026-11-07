# Grok Bot 安裝與小編測試

這是 Grok Bot 的共用技能與命令工具，不是 Grok Build 的 `.grok/skills` 安裝包，也不需要額外 MCP 服務。Node.js 22+，沒有第三方執行套件。

## 1. 準備 CYWEB 連線

由超級管理員在 CYWEB「BOT 管理中心 → 設定」確認連線憑證已設定，並確認有 `SOCIAL_EDITOR`（社群小編）。已有安全保存的憑證就使用原憑證；不要為測試直接重新產生，輪換會使其他 BOT 的舊憑證一起失效。若尚未設定，由超級管理員產生一次，再直接存入 Grok 的安全祕密欄。

這組憑證目前對所有 BOT 共用，**不是逐 BOT 隔離權限**；代碼由工具的環境設定固定。不要把它給不受信任的 BOT／外部帳號，也不要提供 CYID 員工帳密或 session。

## 2. 放工具、建立共用技能

把 `cyweb-work-reporter-v0.12.3.zip` 附給 Grok Bot，請它解壓，使檔案位於：

```text
/workspace/cyweb-work-reporter/SKILL.md
/workspace/cyweb-work-reporter/scripts/cyweb-reporter.mjs
/workspace/cyweb-work-reporter/scripts/client.mjs
/workspace/cyweb-work-reporter/references/grok-setup.md
/workspace/cyweb-work-reporter/references/wire-contract.md
```

請 Grok 將 `SKILL.md` 存為帳號內共用的私人技能 `cyweb-work-reporter`，在小編 BOT 的 Connect apps／Private skills 選取啟用。其他 BOT 之後可用同一技能，不需要各抄一份。單純放入檔案不代表已在 Grok 技能庫啟用。

Grok Bots 共用雲端電腦；持久檔案放在 `/workspace`，不要放臨時目錄。電腦恢復可能移除安裝過的執行環境，要重新確認 Node 版本。不要把憑證寫入 ZIP、技能、專案、啟動腳本或明文環境檔。

## 3. 小編的執行設定

| 設定 | 值／方式 |
| --- | --- |
| `CYWEB_BASE_URL` | 你的 CYWEB HTTPS 根網址，不含 `/api`、路徑、帳密或參數 |
| `CYWEB_BOT_CODE` | `SOCIAL_EDITOR` |
| `CYWEB_REPORTER_STATE_DIR` | `/workspace/cyweb-report-receipts`，保留不刪，勿放在可定期清理的目錄 |
| `CYWEB_BOT_TOKEN` | 從 Grok 安全 Secrets 欄設定，安全注入執行工具的環境；值不要傳聊天 |

前三項不是祕密，可以由小編的工作環境設定提供；不要把全機 `CYWEB_BOT_CODE` 設成小編而讓其他 BOT 沿用。其他 BOT 分別配置自己的代碼（`CONTENT_EXPERT`、`CEO`、`IT`）。收據可共用同一持久目錄，檔名已依網址、BOT、類型與事件分開。

官方文件提供安全 secret card，以及共用 BOT 詳情 → Secrets → Add secret 的方式。不同帳號／版本的可用介面可能不同。請確認安全值確實能注入 shell 程序環境；只檢查工具 `check` 的成功或錯誤，**不要列出環境值**。若該版本只能安全登入網站、不能注入自訂程序環境，先停止並回報缺少此能力；不要把值改存明文檔或貼入命令。Team Secrets 的 setup script 是另一項企業能力，不作本工具前提。

這次不需要開啟 Facebook／Instagram／Threads 發布權限，也不需要設定自動核准。日後正式發布另按平台及使用者授權處理。

## 4. 可以直接交給小編的指示

> 請將附檔解壓到 `/workspace/cyweb-work-reporter`，依其中 `SKILL.md` 建立並啟用帳號共用私人技能。你的小編代碼固定為 `SOCIAL_EDITOR`。連線憑證請使用平台安全 Secrets 注入，不要向我索取聊天明文，不要印出環境值，也不要寫入檔案。先確認 Node.js 22+ 與非機密環境設定，執行 `check`。若安全注入不可用就先停下告訴我。成功後以固定 reference `social-editor-pilot-20261107-01` 執行 `pilot-start`；等我在 CYWEB 核准，再以同一 reference 執行 `pilot-finish`。本次只測試回報與核准，不對外發文，不建立排程。將回傳的紀錄編號與結果告訴我即可。

若重跑同一輪，保持原 reference，不要改編號。工具有防重複，但不確定送達時仍須在 WEB 人工核對。

## 5. 驗收

1. `check` 成功：服務為 CYWEB、資料庫健康、憑證獲接受；不等於 Grok 已獲所有外部操作權。
2. `pilot-start` 後管理中心有一篇測試待審、一筆測試回報；小編摘要待人工核准。
3. 未核准 `pilot-finish` 必須失敗；人工核准後可以完成。
4. 管理中心今日完成時間軸出現一筆測試完成，小編狀態為完成；重跑同輪不增加重複測試回報或完成項目。

本包的自動測試使用真實 Worker 路由與本機合成 SQLite；不代表已操作你的 Grok Bot、正式憑證或正式待審資料。首次實機測試將留下明確測試紀錄，這是預期行為，工具沒有刪除業務紀錄能力。

## 6. 後續讓其他 BOT 使用

小編實機驗收後，再為其他 BOT 啟用同一技能及各自的 BOT 代碼。若要待審核准後自動恢復工作，可另設例行工作，只讀已知未決 `externalRef`；WEB 現在不主動推送喚醒。Grok 例行工作有用量成本與平台最低間隔，這次不建立輪詢排程。

參考官方文件：[自訂工具與電腦](https://docs.x.ai/grok-bot/computer-and-apps)、[共用私人技能](https://docs.x.ai/grok-bot/skills-routines-and-automations)、[安全祕密](https://docs.x.ai/grok-bot/vault)。

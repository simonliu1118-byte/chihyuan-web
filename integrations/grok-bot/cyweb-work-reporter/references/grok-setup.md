# Grok Bot 安裝與小編測試

這是 Grok Bot 的共用技能與命令工具，不是 Grok Build 的 `.grok/skills` 安裝包，也不需要額外 MCP 服務。Node.js 22+，沒有第三方執行套件。新版須先部署 WEB V0.12.4 Build 1 與 migration 0058，再替換工具；多則逐則審核、審核圖片與 `sent` 回報須 WEB V0.15.0（migration 0060）。不是直接拿新版工具測試舊 WEB。

## 1. 準備 CYWEB 連線

由超級管理員在 CYWEB「BOT 管理中心 → 設定 → 連線憑證表格」查看各 BOT。現有小編憑證會在 migration 0058 原樣綁定 `SOCIAL_EDITOR`，Grok 不必重填；不要為這次更新重新產生。只有尚未設定的 BOT 才按該列「產生」，直接存進 Grok 安全祕密欄。以後輪換／撤銷只影響該列 BOT。

每組憑證只屬於一隻 BOT；伺服器禁止跨 BOT 回報與讀審稿結果。不同 BOT 不要共用憑證，也不要提供 CYID 員工帳密或 session。Grok 同帳號的電腦與祕密存取仍須按其平台實際邊界管理，不能把不同 BOT 當成彼此完全隔離的電腦。

## 2. 放工具、建立共用技能

把 `cyweb-work-reporter-v0.12.4-build1.zip` 附給 Grok Bot，請它解壓，使檔案位於：

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
| `CYWEB_BOT_TOKEN` | 此 BOT 自己的憑證，由 Grok 安全 Secrets 注入工具環境；小編保留原值，值不要傳聊天 |

前三項不是祕密，可以由小編的每次執行環境提供；不要把全機 `CYWEB_BOT_CODE` 設成小編而讓其他 BOT 沿用。其他 BOT 各自配置代碼（`CONTENT_EXPERT`、`CEO`、`FINANCE`）與對應獨立憑證。收據可共用同一持久目錄，檔名已依網址、BOT、類型與事件分開。更新程式不刪除收據，舊版 general 完成事件的收據仍相容。

官方文件提供安全 secret card，以及共用 BOT 詳情 → Secrets → Add secret 的方式。不同帳號／版本的可用介面可能不同。請確認安全值確實能注入 shell 程序環境；只檢查工具 `check` 的成功或錯誤，**不要列出環境值**。若該版本只能安全登入網站、不能注入自訂程序環境，先停止並回報缺少此能力；不要把值改存明文檔或貼入命令。Team Secrets 的 setup script 是另一項企業能力，不作本工具前提。

這次不需要開啟 Facebook／Instagram／Threads 發布權限，也不需要設定自動核准。日後正式發布另按平台及使用者授權處理。

## 4. 可以直接交給小編的指示

> 請將附檔解壓到 `/workspace/cyweb-work-reporter`，依其中 `SKILL.md` 建立並啟用帳號共用私人技能。你的小編代碼固定為 `SOCIAL_EDITOR`。連線憑證請使用平台安全 Secrets 注入，不要向我索取聊天明文，不要印出環境值，也不要寫入檔案。先確認 Node.js 22+ 與非機密環境設定，執行 `check`。若安全注入不可用就先停下告訴我。成功後以固定 reference `social-editor-pilot-20261107-01` 執行 `pilot-start`；等我在 CYWEB 核准，再以同一 reference 執行 `pilot-finish`。本次只測試回報與核准，不對外發文，不建立排程。將回傳的紀錄編號與結果告訴我即可。

若重跑同一輪，保持原 reference，不要改編號。工具有防重複，但不確定送達時仍須在 WEB 人工核對。

## 5. 驗收

1. `check` 成功：服務為 CYWEB、資料庫健康、憑證歸屬為 SOCIAL_EDITOR；不等於 Grok 已獲外部操作權。若身分不符會停止。
2. `pilot-start` 後管理中心有一篇測試待審、一筆測試回報；小編摘要待人工核准。
3. 未核准 `pilot-finish` 必須失敗；人工核准後可以完成。
4. 管理中心今日完成時間軸出現一筆測試完成，小編狀態為完成；重跑同輪不增加重複測試回報或完成項目。

本包的自動測試使用真實 Worker 路由與本機合成 SQLite；不代表已操作你的 Grok Bot、正式憑證或正式待審資料。首次實機測試將留下明確測試紀錄，這是預期行為，工具沒有刪除業務紀錄能力。

## 6. 後續讓其他 BOT 使用

小編實機驗收後，再為其他 BOT 啟用同一技能及各自的代碼／憑證。核准結果可由 webhook 喚醒後主動讀取，設定步驟如下；不新增輪詢排程。文章發布完成用 `complete.workType=article_published`，Threads 巡視完成用 `threads_patrol`；其他完成用 general，連線測試不進文章／巡視卡片。拍板結案僅畫面保留，沒有後臺串接。

參考官方文件：[自訂工具與電腦](https://docs.x.ai/grok-bot/computer-and-apps)、[共用私人技能](https://docs.x.ai/grok-bot/skills-routines-and-automations)、[安全祕密](https://docs.x.ai/grok-bot/vault)。

## 7. 啟用審核推播

先部署 WEB V0.12.4 Build 1／0058，再更新本包與共用私人技能。小編原 CYWEB_BOT_TOKEN、BOT 代碼與持久收據保持不變。使用者已建立「收到 webhook 後讀取 CYWEB 稿件審核結果」的 routine，不需另建。

1. 操作者以受控環境建立一次性 CF_BOT_PUSH_ENCRYPTION_KEY，部署流程注入 Worker；既有主金鑰不可覆蓋。這是 CYWEB 自己的加密金鑰，不是小編憑證，也不是 Grok webhook key。
2. 使用者在 Grok 小編詳情 → Routines 開啟既有工作，將完整 POST to 與 key 直接填入 CYWEB「BOT 管理中心 → 設定 → 社群小編 → 推播設定」，勾啟用。只允許 HTTPS api2.cursor.sh。不要貼到聊天、Git、技能或普通檔；畫面不讀回原值，留白保留既有設定。
3. 例行工作沿用下列指示：收到 CYWEB webhook 時，將 JSON 的 type、eventId、botCode、draftId 以標準輸入交給共用工具 review-notification。只用該工具認證讀到的結果；ignored=true（缺編號、查不到、pending 等）安靜結束、不通知人。approved 依原稿與既有授權續作，rejected 依理由處理。重送同 eventId 不重做已完成外部操作。不要把 webhook 當成核准或擴大發布授權。
4. 指令為 node /workspace/cyweb-work-reporter/scripts/cyweb-reporter.mjs review-notification，輸入範例見操作契約。HTTP 200 只表示 Grok 接受並開始執行，不表示任務完成；是否完成須查看 routine 執行紀錄與 CYWEB 完成事件。
5. 首輪只送明確標示測試的合成稿，人工通過及退回各一次，確認收到正確稿件結果；不對外發文。這個步驟尚未在真實 Grok 執行，不以本機測試代替。

推播暫時失敗會限次重試；WEB 審核結果不回滾。失敗可由超管在已審稿件列重送，事件編號保持不變。Grok routine 停用或金鑰變動時，先更新／停用該 BOT 推播設定。只在啟用之後的審核才建立推播，不補送全部歷史。技術推播狀態保留30天，審稿業務紀錄不刪。

依 [Grok 官方 webhook 說明](https://docs.x.ai/grok-bot/skills-routines-and-automations#webhooks)，以 POST＋Authorization Bearer 傳送，只有200確認喚醒；其他結果須確認例行工作與 key。本工具不設定 Grok 自身用量／發布權限。

## 更新至 V0.18.12

保留原 token、原收據目錄與既有 routine；只替換工具與技能檔。更新後 check 確認 SOCIAL_EDITOR，routine 繼續把同一四欄喚醒交給 review-notification，已有新版的舊喚醒會安靜略過。改稿 submit 要帶 previousDraftId，圖片每則最多 10 張。實際發布後 sent 與具固定 eventId 的 article_published 完成事件各回報一次；不要為補畫面而重報歷史已完成事件。

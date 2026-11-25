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

小編實機驗收後，再為其他 BOT 啟用同一技能及各自的代碼／憑證。核准結果可由 webhook 喚醒後主動讀取，設定步驟如下；不新增輪詢排程。文章／留言實際發出後統一用 delivery，巡視場次用 patrol-session；其他一般完成仍用 complete.general，連線測試不進文章／巡視卡片。拍板結案自 V0.22.0 起用 `decision` 串接（見「更新至 V0.22.0」）。

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

保留原 token、原收據目錄與既有 routine；只替換工具與技能檔。更新後 check 確認 SOCIAL_EDITOR，routine 繼續把同一四欄喚醒交給 review-notification，已有新版的舊喚醒會安靜略過。改稿 submit 要帶 previousDraftId，圖片每則最多 10 張。新版已改為 delivery 一次回報，詳見下方 V0.21.3 更新；不要再重複呼叫 sent＋article_published。

## 更新至 V0.30.0（先部署 WEB／0085）

先部署 WEB V0.30.0 並確認 migration 0085，再替換工具。只替換本包既定 5 檔（SKILL.md、scripts/cyweb-reporter.mjs、scripts/client.mjs、references/grok-setup.md、references/wire-contract.md）；原 token、安全環境、收據目錄、固定工作編號、webhook 與 routine 都保留，不重做 pilot。

1. 更新後先 `check`，確認身分仍是自己的 BOT。
2. **場次則數**：`patrol-session` 登錄時先不帶則數；巡完有結果再帶 `pendingReview`、`toSend`、`waitingImages`、`skipped`、`abandoned`（0–999 的整數），每次進度變動就更新。狀態（進行中／待審核／待留言／等待圖片／已完成）由則數自動決定，note 不影響。
3. **每則海巡留言一定附原文**：`delivery` 的 `sourceText`（必填）、`sourceAuthor`、`sourceUrl`；`body` 只放我們送出的留言，內部備註（粉專身分、不配圖等）不要放進去。舊成果不需補。
4. **補送**：隔天才送出的留言，帶原本場次的 sessionRef 與真實送出時間（14 天內）。
5. 小編 routine 的指示補一句：「巡完回報場次則數；每則海巡留言附原文 sourceText；隔天補送帶原場次。」只是文字，不改憑證與排程。
6. 驗收：主頁 Threads 卡片看得到各場次狀態與「N 則待審／待留言／等圖」；點場次看到標題（第 N 則＋@作者，連到我們的留言）與左原文、右留言。

## 更新至 V0.22.0（先部署 WEB／0079）

WEB V0.22.0 與 V0.21.6 一起部署；部署並確認 migration 0079 後再替換工具。只替換本包既定 5 檔，原 token、安全環境、收據目錄、固定工作編號、webhook 與 routine 全部保留；不重跑 pilot、不輪換憑證、不重發已送出的內容。舊命令的輸入輸出不變，可直接沿用。

1. 更新後先 `check`，確認身分仍是自己的 BOT。
2. **新增 `decision`**：要請使用者拍板（同意／不同意）的事項改用它，欄位 externalRef、title、body、category（自由填寫，最多 20 字）；選填 amount（新台幣元）、deadline（含時區的 ISO 時間）、options（2 至 5 個）。用 `review` 讀回決定與所選選項；`decision.expired=true` 表示期限已過、人已不能決定，請以新編號重新送審。webhook 喚醒的處理不變。
3. **海巡稿連結場次**：先 `patrol-session`，再把該場要送審的海巡稿 `submit` 時帶同一個 `sessionRef`。CYWEB 主頁依此顯示每場狀態（待審核／已審核／已完成）；人審核只改變狀態，不需要你再回報。場次全部處理完、或剩下不打算送的通過項目時，以 `patrol-session` 帶 `completed:true` 明確結束。
4. **delivery 的 platform 只能是 FB、IG、Threads**（不分大小寫）；其他名稱會被拒絕，不確定就不填。舊紀錄不需要補。
5. 小編 routine 的指示補一句：「需要使用者決定的事用 decision，不要用 submit；讀到 expired 就改用新編號重送。」只是文字指示，不新增排程或權限。

## 更新至 V0.21.3（先部署 WEB／0077）

只替換本包既定5檔；原token、安全環境、收據、固定工作編號、webhook與routine都保留。check確認版號與身分後再使用新命令。不要重跑pilot，也不要重發已發布內容。

- routine讀審核結果的四欄喚醒與review-notification不變；external表示已由外部處理，安靜停止，不再要求使用者補審。
- 實際發出後以delivery回報，每篇／每則一個穩定eventId。CYWEB核准帶原externalRef與item；Chat／LINE核准填真實approvalSource與approvalNote，連同完整文案、真實送出時間、平台及實際發布連結，不建立流程性待審稿。
- 巡視先patrol-session指定同場sessionRef和早巡／午巡／晚巡名稱；每則delivery帶同sessionRef，分批送出仍合併計數。note一般留空，必要時只寫40字內需要處理的例外，不列帳號、網址、則號、核准人、稿號。
- 現有有篇數沒內容的成果：確認確實已發布後，用原外部工作編號及真實時間補完整成果；有補登待審稿就連externalRef／item，系統標外部已處理而非通過。既有sent六則只需連原稿／則補場次，不再增加計數。所有範例與操作契約均為合成資料，不依標題批量猜測歷史。
- delivery已建立全文、數量與完成事件，不再另送sent或complete.article_published；舊收據保持原樣。巡視整場完成可沿用一次complete.threads_patrol，不逐批追加長篇摘要。
- 啟用後核對：文章N篇下面每篇可點全文；今日送出留言N則可點；午巡只一行；外部已處理不留待審。圖片仍隔日清理，不承諾永久保存。

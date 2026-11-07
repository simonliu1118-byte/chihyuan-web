# CYWEB V0.12.4 Build 1 BOT 審核結果推播交接

- 執行：GPT；分支 `cyweb/bot-review-push-0124`，基準 main `97a2acced3823e665991759b4dd33c2d8dee5223`。新獨立功能，VERSION／package=0.12.4、BUILD=1。
- 使用者授權：PR #447 合併部署後處理推播；已確認 Grok webhook 允許網域 `api2.cursor.sh`，小編已建立「收到 webhook 後讀取 CYWEB 稿件審核結果」routine。沒有提供完整路徑／key，也不向聊天索取。小編現有 CYWEB 憑證維持原值，拍板結案不接後臺。
- **PR #449已合併，V0.12.4 Build1於2026-11-08正式部署成功**：[受控發布 #42401625125](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42401625125)，source=`90100f726a999ce3ad24c63b752178df6899bc8d`；遠端0058、兩端健康／來源、HTTPS／session／排程／portal驗證通過。新獨立主加密金鑰已配置；小編原CYWEB憑證未讀取／輪換。Grok完整URL／key仍待使用者安全輸入，Claude事後複審及實機驗收仍待辦。

## 實作

1. `0058_bot_review_push.sql` 新增逐 BOT 加密設定與技術 outbox、到期／清理索引；只新增表，不改既有 BOT token 或業務欄位。`portable-backup.ts` marker=0058，兩張表皆 ephemeral、排除可攜備份；`validate_schema.py` 同步表集合及排除名單。
2. `worker/bot/review-push.ts`：AES-256-GCM、96bit 隨機 IV、BOT ID 綁定 AAD。Worker secret `BOT_PUSH_ENCRYPTION_KEY` 為 canonical base64 的32bytes。目的地僅 HTTPS exact `api2.cursor.sh`、預設443、非根路徑、無帳密／fragment，禁止重導向；Webhook key 與 CYWEB BOT key 分開。API／Audit 不回明文、密文或完整路徑。
3. 審核 UPDATE、勝出者 Audit 及通知 INSERT 同一 D1 batch；Audit 緊接 UPDATE，以 changes() 守住並行勝出者；通知再依前一 Audit changes() 建立。失敗整批回滾，重複審核409。儲存後 `ctx.waitUntil` 首送，網路失敗不回滾正式結果；fetch 的 ctx 已傳入 BOT route。
4. Outgoing body **只有** `{type:"cyweb.review_result",eventId:"bot-review-ID",botCode,draftId}`，不含稿件標題、正文、決定、理由、externalRef 或 CYWEB token。Authorization Bearer 只用 Grok webhook key。HTTP200表示平台接受且開始 routine，不表示完成，回應body直接取消、不讀回。
5. 沿用既有五分鐘排程，每輪最多3筆、每HTTP7秒、租約60秒；CAS 比對選到的 attempts 及目前啟用狀態。最多6次，間隔5／15／60／240／1440分鐘；429 Retry-After 限5分鐘–24小時；3xx／一般4xx終止，408／429／5xx／網路暫時失敗重試。最終租約失聯轉 failed，避免永久 sending。超管只可手動重送 failed，保持同一 eventId。模糊逾時可能重複喚醒，不保證外部 exactly-once。
6. 未啟用不建立通知、不回補全部歷史；停用跳過已排隊，重啟可續送。每輪最多清100筆30天舊技術通知，保留審稿業務紀錄。缺主金鑰不發送；其他獨立排程照原 Promise.allSettled 處理。
7. SUPER_ADMIN 可 PUT `/api/bot-center/bots/:code/push`、POST `/api/bot-center/drafts/:id/push/retry`；機器不能管理。GET 僅回 flags。既有 profile 查詢 LEFT JOIN 設定flags，不新增歷史／outbox輪詢；已審列表用 draft主鍵 LEFT JOIN 一筆通知。progress30秒成本維持同筆數輪詢，不掃歷史；啟用推播的 cron 有固定上限 due／CAS／結果寫入及清理成本。
8. `BotPushSettingsDialog` 使用既有 Dialog／EntryTable／Field／CheckField／Enter導覽；網址與key皆密碼型欄位、不回填，已配置時留空保留。明確取消／儲存、無X／背景／Escape關閉。已審表格顯示推播狀態與超管失敗重送，沒有「推播已送出＝BOT已完成」的說法。
9. `render-runtime-secrets.mjs` 沿用既有備份／usage bundle，增加可選主加密金鑰，獨占建立600暫存檔；受控workflow仍main-only dispatch、原部署來源檢查／cleanup保留。`prepare-bot-push-key.mjs` 預設只讀secret名稱；已存在不覆寫，只有明確 `--create` 且缺值才產生並以stdin交gh，不寫值到args／輸出／檔案。不自動輪換，避免讓既有設定無法解密。

## 工具與 Grok

10. 共用CLI新增 `review-notification`，只接受type/eventId/botCode/draftId，驗證自己的BOT與ID後使用自己的CYWEB Bearer GET該稿件；無編號／無效／他人／查不到／pending回 ignored且notifyHuman=false，安靜結束。approved/rejected使用最新讀回結果；不接受payload內決定，不呼叫發布。舊回報收據、complete事件編號與原小編key不動。
11. SKILL及兩份references同步安全設定、routine指示及啟用順序；已有routine直接更新，不重建／重複排程。重複喚醒可重讀結果，但實際外部工作須以原固定工作ID核對，complete去重不能代替外部發布去重。此功能不給予新的對外發布授權。
12. `cyweb-work-reporter-v0.12.4-build1.zip` 在工作區外部outputs交付，不進Git；五檔白名單，**18,747 bytes**，SHA-256=`b4d3adbc5b888a5fe18b44379ef7cd1b2c36ecb8a6e4765122a51a500a47bca1`。OS暫存目錄獨立解壓逐檔核對並執行CLI --help通過，不安裝npm執行依賴。舊V0.12.3包不覆蓋。

## 已驗證與限制

- 相關本機 **98/98**：BOT／獨立憑證／Grok工具、加密與AAD、URL allowlist／redirect、角色權限、審核與outbox原子性／並行、waitUntil落庫後首送、失敗／限次／429／租約／停用／清理、缺／錯／pending喚醒、認證新鮮讀回、備份排除及既有維修／排程／來源／傳輸契約。全部合成資料與fake fetch，沒有向真實webhook送出。
- 最終 `npm run build`（browser／Worker typecheck＋Vite）通過；原有dynamic import與bundle size提示保留，沒有新執行依賴。
- 官方 skill `quick_validate.py` 通過；schema通過 **59 migrations／133 tables／10組**。部署驗證腳本在Windows既有POSIX0600檢查不適用，未放寬安全條件，交Ubuntu PR CI驗證；其餘推播secret測試已單獨通過。完整CI以PR最終head的run為準，不能把本機98項當全部CI。
- 無法完成真實UI／窄螢幕互動：本機browser技能檔缺失、舊CUA工具已不再提供；沒有繞過限制或用source inspection宣稱視覺通過。請Claude補驗推播設定、留空保留、儲存錯誤、已審狀態／重送與手機。
- Grok原key、完整POST to／key皆未讀取；開發驗證時主金鑰尚未寫入正式環境（本輪發布已完成配置），沒有改或部署CYapps。沒有實際喚醒Grok／對外發文／自動核准。實機端到端驗證尚待安全設定後進行。

## Claude 審查與後續啟用

- 審查重點：金鑰不洩漏／逐BOT AAD、允許目的地／不重導向、winner-only原子審核、租約與最多6次、暫停／保留、可攜備份排除、受控部署secret保留、CLI只以新鮮認證結果為準。補上述UI驗證。
- 本輪已依使用者明確授權建立獨立主金鑰並部署。未來其他環境查詢／準備方式：`node scripts/prepare-bot-push-key.mjs --repo simonliu1118-byte/chihyuan-web --environment development` 預設只讀；確定缺值時加 `--create`。不要用此流程覆蓋既有主金鑰，也不要印出值。保護環境的管理／發行者仍有能力讀取runtime資料，不能宣稱對維運者不可解。
- 按既有main-only `development-deploy.yml` 受控發布、套0058並核對兩端健康及source；沒有新Cloudflare產品／cron。若未配置主金鑰，本版可保持推播關閉，原審核正常。
- 使用者直接在WEB「設定→社群小編→推播設定」貼入完整POST to及key，啟用；不要貼聊天／PR。更新Grok ZIP／共用私人技能和既有routine指示；原CYWEB token與持久收據保留。Grok webhook key與CYWEB token不能混用。
- 使用明確合成稿做通過／退回各一次，核對推播200、routine執行與認證讀回指定結果，pending／無編號不另通知。維持不對外發文；完成後更新本handoff、TODO、CHANGELOG的正式證據。真實設定未完成前不要宣稱推播已上線。

協定核對：[Grok webhooks](https://docs.x.ai/grok-bot/skills-routines-and-automations#webhooks)（200才確認run開始、Bearer key）、[Cloudflare waitUntil](https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil)（HTTP後最多30秒，首送只針對單筆，cron上限3筆）。

## 首輪完整 CI 返修（Build 1）

首輪source `3949f394` 的完整713項中712通過，唯一失敗是新Audit動作漏補中文名稱（Runtime #42394587946）；已補bot_review_push實體與configured／retried動作，針對相關16項通過。依同項目返修規則增加BUILD=1，不更動VERSION。原98項測試證據仍適用，最終完整CI以PR #449最新head為準；首輪Ubuntu部署契約／型別／source-contracts／治理已通過，但不能把失敗的完整run當驗收。

## 2026-11-08 使用者直接發布授權與驗證基準

- 使用者明確補充授權：**PR #449（V0.12.4 Build 1）可先合併與正式部署，Claude 改為事後審查**。此授權取代本輪「必須先 Claude 審查」的作業順序；但 Claude 事後複審、推播真實端到端／手機 UI 驗收仍為待辦，絕不可填成已完成。
- 使用者再次要求**保留社群小編既有 CYWEB 憑證**，不重新產生、不撤銷、不輪換或修改 Grok 原有 `CYWEB_BOT_TOKEN`、routine 排程及持久收據。這次 0058 只新增技術推播資料表，未修改 `bot_ingest_credentials`。
- 合併前 head `533a619a1c64867435f0f5b77166d9c8de782ecc`：Runtime [#42394990866](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42394990866) **success**（713/713 Node、browser/Worker TS、來源契約、local D1、Vite），Governance [#42394990869](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42394990869) **success**，部署契約 [#42394990954](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42394990954) **success**。PR 的 deploy job 依規則 skipped，不能稱為正式部署。
- 正式發布只能使用 `main` 上的 `development-deploy.yml`、`workflow_dispatch`、operation=`deploy-development`；確認受保護 Environment `development`。受控 workflow 必須完成 remote D1 0058、Worker+assets 部署、來源／健康驗證並記錄 run ID 與實際 SHA，才可標成已部署。
- `CF_BOT_PUSH_ENCRYPTION_KEY` 是**全新且獨立**的推播設定加密金鑰，不等於社群小編 CYWEB 機器憑證或 Grok webhook key；若尚未配置，本次可以保留推播停用，不應默認可送。不可在 PR、聊天、log、檔案印出任何 secret；若已存在不得輪換。
- 若目前執行通道不支援 GitHub Actions workflow dispatch，不可用更動 workflow 的 push 觸發方式繞過 main-only 發布限制，也不可回報已完成部署；應在 handoff 明列合併、部署、金鑰／webhook 各自真實狀態與後續受控操作入口。


## 合併完成、正式部署尚待受控執行（2026-11-08）

- PR [#449](https://github.com/simonliu1118-byte/chihyuan-web/pull/449) 已 squash merge 到 `main@4352a9f90b2c0321d07b0e32ea1e461dee767fbb`。最新來源 `841f5208de3ca9a4f14f728e6dc362852d52ddbb` 的 [Runtime #42400319701](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42400319701) **success**（713/713、local D1、TypeScript、source contracts、Vite build）；[Governance #42400320010](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42400320010) **success**；[Deployment Contract #42400319772](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42400319772) **success**。
- 使用者明確授權直接合併與部署，Claude 改事後審查。本次工具只有 GitHub 讀取／合併與 PR 檔案寫入，**沒有 workflow_dispatch 動作**；此對話也沒有可用的已登入 `gh` CLI。依專案治理，不會把 `development-deploy.yml` 偷改成 push 部署或重跑舊 SHA。**尚無 V0.12.4 Build1 的正式 workflow_dispatch run、未確認正式 0058 migration/Worker/健康**。
- 下個受控步驟：到 GitHub [CY Web Deploy](https://github.com/simonliu1118-byte/chihyuan-web/actions/workflows/development-deploy.yml) 以 `main` 執行 `Run workflow`，`operation=deploy-development`。這會使用當時 `main` 的最新 SHA（若另有 docs-only commit，以該 SHA 為準）；必須完成 D1 remote 0058、部署與 canonical／workers.dev 健康與來源驗證，才寫入成功結果。
- 不可任意重設或輪換既有 `SOCIAL_EDITOR` 機器憑證。可選 `CF_BOT_PUSH_ENCRYPTION_KEY` 為新的推播 webhook 設定主金鑰，應在 GitHub Environment `development` 安全設定／確認已存在；不得以此金鑰取代 `CYWEB_BOT_TOKEN` 或 Grok webhook key。若尚無主金鑰，先保持推播停用；當次合併不表示功能已可發送。
- 待辦：Claude 事後複審、正式部署與 0058/來源健康回讀、WEB UI／手機目視、Grok webhook 與原共用工具實機通過／退回測試。**此段只記錄已驗證的合併及仍待完成事項。**


## 正式發布完成（2026-11-08）

- 使用者補充「chat沒辦法更新D1，因此449的部署和D1migration需要你處理」，本輪承接既有合併，未重複合併PR449。已讀取main上PR450的待部署交接，發布以當時最新main 90100f726a999ce3ad24c63b752178df6899bc8d 為source；其與已驗證產品head533a619a差異僅文件。沒有變更VERSION／BUILD或業務程式。
- GitHub Environment development原先未有CF_BOT_PUSH_ENCRYPTION_KEY；受控helper先只讀確認，再--create建立全新32bytes加密key，透過stdin交gh secret set，輸出只有configured/created旗標。未顯示、落檔、讀回或輪換secret。這不是SOCIAL_EDITOR的CYWEB機器憑證，也不是Grok webhook key。
- 僅以main手動dispatch development-deploy.yml、operation=deploy-development。[Run #42401625125](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42401625125)的部署契約與正式部署均success；remote D1 **0058_bot_review_push.sql ✅**，Worker與assets發布成功。沒有手工修改正式業務表、重寫舊migration或更動Grok routine。
- canonical與workers.dev最終HTTP200、version0.12.4、identityConsumerVersion1.0.5、databaseok、source皆為上述90100f72；BUILD1由該source檔核對（health沒有build欄位）。既有每日排程、HTTPS／靜態資源、兩入口無效session拒絕及canonical portal authority全部通過。
- 本次僅更新handoff／TODO／CHANGELOG／索引及架構狀態，不改產品source，不需為文件證據再部署。Claude事後複審、登入後UI／手機、Grok實機通過與退回尚待驗收，不能把部署成功當端到端成功。
- 使用者下一步：把V0.12.4 Build1 ZIP交Grok更新工具／共用私人技能；既有SOCIAL_EDITOR的CYWEB_BOT_TOKEN與收據保留。到WEB設定→社群小編→推播設定，直接貼Grok既有routine的完整POST to與key本體（不是整串Authorization header），啟用。routine用review-notification讀指定ID，無編號／pending不另通知，重送不重做已完成外部工作。先用合成稿驗證通過／退回、不對外發文。完整URL／key不貼聊天或Git。
- 發布後重新交付同版五檔工具包 `cyweb-work-reporter-v0.12.4-build1.zip`，18,747 bytes，當次ZIP SHA-256=`13ae462c0d03b12aff550b11bbbdb6b80f5aa0b09e1ca2a3f0705d5e2d4bb71e`。重新封裝的ZIP時間metadata與先前包不同，先前hash保留在上方作歷史；本輪以此hash為準。已獨立解壓、逐檔bytes與當前source核對、CLI --help通過；不含正式網址、token或key，不進Git。

## Grok 社群小編推播兩路實機驗收回報（2026-11-08）

此段根據**使用者於本次對話提供的 Grok 社群小編實際回報**記錄；不是此文件提交者親自登入 Grok 或查詢正式 D1 outbox 所取得的獨立紀錄。測試使用全新合成稿，不改既有真實稿件，不對外發布，不輪換／撤銷原有 `SOCIAL_EDITOR` CYWEB 機器憑證。

| 路徑 | Grok webhook eventId | draftId | externalRef | Grok 認證讀回 | 測試安全限制 |
| --- | --- | --- | --- | --- | --- |
| 審核**通過** | `bot-review-2` | `2` | `push-test-approved-20261108-01` | `status=approved` | `automaticPublication=false`，不對外發文 |
| 審核**退回** | `bot-review-3` | `3` | `push-test-rejected-20261108-01` | `status=rejected`，理由「推播功能測試」 | 不改稿、不重新送審、不對外發文 |

- 通過路徑：Grok 社群小編回報約 02:55 已處理 webhook `bot-review-2`，使用既有 CYWEB 認證成功讀回 `draftId=2` 的 `approved`；`automaticPublication=false`，未發布。
- 退回路徑：Grok 社群小編回報 webhook `bot-review-3`，使用既有 CYWEB 認證成功讀回 `draftId=3` 的 `rejected` 及退回理由「推播功能測試」；不修改稿件、不重送審、不發布。
- **實機讀回結論：通過／退回兩條 Grok Webhook → CYWEB 認證讀回路徑，依兩筆使用者提供的 Grok 結果皆成功。** 已驗證回傳狀態與測試 externalRef 相符；推播並未授權 Grok 自動發布。
- **尚未獨立核對**：CYWEB 正式 D1 `bot_review_push_outbox` 的投遞時戳、HTTP 回應碼、重試次數及是否已標記送達。雖然 Grok 已處理兩筆事件，但不可把此回報等同已由伺服器日誌證實兩筆 HTTP 200。若需完整營運驗收，後續以受權 MCP／管理介面讀取這兩筆 outbox 狀態，避免重送或建立真實稿件。
- 本段**僅新增 handoff 驗收證據**：沒有修改推播程式、設定、GitHub Secrets、Grok Routine、Webhook、測試稿、D1 migration 或正式部署。Claude 事後程式審查與 outbox 獨立核對仍為待辦。

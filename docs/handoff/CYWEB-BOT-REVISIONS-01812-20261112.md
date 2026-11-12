# CYWEB V0.18.12 BOT 改稿與卡片修正交接

- 執行：GPT；分支 cyweb/bot-revisions-layout-01812；基準 main 93cb25e6（V0.18.11），VERSION/package=0.18.12、BUILD=0。
- 本輪需求：桌機／手機卡片破版、初稿與修訂版本、主動新版覆蓋、每則10圖、今日實際發布明細、IT→財務會計、移除動態新增BOT；使用者另明確授權 IT 舊資料不用保留。需提供小編更新指令與共用工具／技能。
- **未合併／未部署；未執行正式 D1 或 R2 刪除，待 Claude 審查及本版發布授權。**

## 實作與檔案

1. shared/bot-center.ts、worker/http/bot-center-routes.ts、migrations/0068_bot_revisions.sql：previous_draft_id、revision_number 與唯一前版索引；新稿／items 原子 batch。新 externalRef + previousDraftId 只接同身分／分類的最新且未送出原稿。版本自增，重新待審；舊稿保留歷史，只在清單／計數隱藏，不可再審核／附圖／送出。寫入也做競爭檢查，不能只依預讀。
2. worker/bot/review-push.ts：待送通知不含已被取代稿件。在途舊通知仍可能到達，因此工具必須讀最新狀態並忽略 supersededById。這不是外部發布原子交易，不聲稱 exactly-once。
3. src/runtime/modules/BotCenterPage.tsx、BotReviewDialog.tsx、bot-center.css、src/runtime/api/bot-center-client.ts：版本欄、上一版／新版與唯讀歷史、送出時間、實際送出清單，卡片 grid/flex 子項 min-width:0、長標題省略，手機單欄；移除新增 BOT 的 UI 與 API client。
4. 0068 刪 IT 的稿件／逐則／回報／完成／憑證／推播設定／圖片索引，R2 object keys 先寫 bot_review_image_deletions；排程每次100個，先 R2 delete 後刪佇列，失敗可重試。既有全系統 Audit 與歷史備份不重寫。FINANCE 是新身分，不沿用 IT 秘密；SOCIAL_EDITOR 憑證／加密推播原值保留。
5. 圖片每則10張／每張2MB，寫入時再做上限及新版檢查；待審被取代稿隔日亦清圖，避免永久滯留。
6. worker/backup/portable-backup.ts、schema-columns.ts、scripts/validate_schema.py：marker0068、版本鏈業務資料可還原；圖片清理佇列是 ephemeral 不備份。
7. integrations/grok-bot/cyweb-work-reporter/{SKILL.md,scripts/client.mjs,scripts/cyweb-reporter.mjs,references/grok-setup.md,references/wire-contract.md}：previousDraftId、新版本／過時稿拒絕、10圖與實際發布雙回報語意，保留舊收據fingerprint、原憑證與routine。
8. scripts/bot-revisions.test.mjs、新 fixture hook，以及既有 bot-center／scoped-credentials／review-items／review-push／UI／grok-reporter 測試：修訂競爭、舊稿鎖定、跨BOT隔離、送出後不可覆蓋、IT清除／R2重試、小編key不變、備份版本鏈往返。
9. TODO、CHANGELOG、BOT_CENTER 與handoff入口同步。

## 使用者可見的「已送出」

- 單篇／逐則 sent_at：在今日發布貼文或今日送出海巡明細，點開後可看到各則送出時間。
- article_published completion：文章發布總數與完成時間軸；threads_patrol completion：巡視次數。sent與complete不互相冒充，審核通過不代表發布。
- 舊API workSummary.*.reviewed 名稱保持相容，但明細已改實際送出當日，最多50稿。沒有增加背景歷史輪詢；30秒仍只讀輕量progress。

## 驗證

- npm run typecheck、npm run build、npm run validate:source、schema69個migration／154表全部通過。
- 最終 BOT／Grok／備份marker／相關UI測試69項全部通過。完整Node823項：813通過、10失敗；相同10項已在獨立 origin/main 93cb25e6 快照重現（該三檔33項23通過10失敗）。包括 backup-rehearsal-http 6項（Windows路徑使esbuild注入filter未命中）、secure-entry 1檔（Windows /C:/ URL.pathname）、store-backup-upgrade 3項既有schema fingerprint不符。未混入無關修正，不宣稱完整回歸全綠。
- 真正 Wrangler local D1：69個migration與19組Worker+D1 acceptance皆印出PASS；完成驗收後暫存目錄清理遇WinError32（metadata.sqlite仍被使用），所以整支驗收命令結束非零；不把清理失敗隱藏成命令全成功。test_d1_runner單元測試通過。
- 共用技能官方 quick_validate 通過；更新包只含5個工具／技能檔，解壓後CLI --help通過。outputs/cyweb-work-reporter-v0.18.12.zip，23063bytes，SHA256=3221403978bcce18c5760ffab851c3858f589db424bdc62ba27c06ce79e1272a。包內沒有憑證、收據或本機設定。
- 合成預覽使用實際 API fixture 產生資料，沒有正式資料／憑證。IAB 1440×1000：四張工作卡 clientWidth=scrollWidth=343；390×844：單欄卡349，整頁scrollWidth375≤viewport390。長中英標題與已送出文字沒有越界。手機審稿表只在自身橫向捲動。
- AITeam main shared/cy-visual/README.md 已讀；目前只含 desktop/icon package，Web依專案規則和既有共用元件，不改家族視覺。

## 風險與後續

- 0068 IT清除是使用者指定的不可逆業務清理；本輪只備妥 migration。正式執行前按受控部署先備份，R2清理排程需要HR_FILES綁定。IT歷史備份若將來刻意還原可能恢復舊資料，需當次處理，不改寫歷史備份。
- 不猜測既有 r2/r10 標題的關係；新版起需明確 previousDraftId 形成修訂鏈。已送出任一則不能覆蓋整批，避免混淆已發布內容。
- 多則的部分通過只可發出 approved 的則；新版不繼承圖片與核准。外部發布前仍須讀最新審核，推播不是發布授權。
- 實機 Grok 改稿／10圖／公開平台發布尚未驗證，不用本機合成測試代稱正式成功。
- 小編更新包與貼上指令在完成後提供，待WEB0068部署後再啟用新版改稿。

## Claude 審查（由 Claude 填寫）

- 結論：待審查。
- 審查重點：revision競爭與跨BOT隔離、IT清除範圍及原小編憑證保留、備份還原與ephemeral排除、實際送出／完成事件兩種維度、手機不溢出、工具收據與routine相容。

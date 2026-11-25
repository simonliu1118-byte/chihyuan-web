# CYWEB V0.30.0 — BOT 巡視場次狀態、補送、90 天保存與送出內容改版交接

## 狀態與使用者決策（2026-11-25）

- 分支 `cyweb/bot-patrol-status`，基於 origin/main（V0.29.3）。版本 V0.30.0、Build 0：新增 API 欄位、兩個新場次狀態、補送、保存期與視窗改版，屬使用者可明顯感受的新能力，依 REPOSITORY_RULES §6 升 Y（Z、Build 歸零）。
- migration `0085_bot_patrol_status.sql`；`CURRENT_MIGRATION` 為 `0085_bot_patrol_status`。未合併、未部署、未碰正式 D1。
- 使用者決定：五種場次狀態與結構化則數；補送較早場次（14 天內）；保存 90 天；送出內容視窗改左原文右留言、標題連到我們的留言、不放「開啟貼文」；舊資料不處理。

## 修改檔案與理由

| 檔案 | 行為與原因 |
| --- | --- |
| `migrations/0085_bot_patrol_status.sql`（新） | 場次五個可為空整數欄（CHECK ≥ 0）、成果三個原文欄（預設空字串）。 |
| `shared/bot-center.ts` | 新狀態型別／標籤、`derivePatrolStatus`（純函式，供伺服器與測試）、`BotPatrolSummary` 新欄位、`BotSentItemView` 原文欄位。 |
| `worker/http/bot-center-routes.ts` | 則數驗證與儲存（COALESCE 保留舊值）；場次摘要改用推算與補送列；成果 sessionRef 日期窗口（0–14 天）；原文欄位驗證／冪等；單一場次成果不限當日；`purgeOldBotHistory`。 |
| `worker/index.ts`、`shared/cyweb-cron.ts` | 03:15 排程加 `botRetention`（同時段，無新 trigger）。 |
| `worker/backup/*` | 欄位清單與 `CURRENT_MIGRATION`；舊備份缺欄位用預設。 |
| `BotWorkCards.tsx`、`BotSentPatrolDialog.tsx`、`bot-center.css` | 狀態標籤／色調／排序／右側文字、補送列；視窗標題與每則並排版面。 |
| 技能包 5 檔 | SKILL、wire-contract、grok-setup（新增升級段）、client.mjs 驗證。 |
| 測試 | 新 `bot-patrol-status.test.mjs`；更新 `bot-decisions`、`bot-status-strip`、`grok-bot-reporter`、`erp-housekeeping`、`hr-ui-fixes`、`hr-current-values`。 |

## 實作時的取捨（請確認）

1. 待審、待留言：連結稿件與 BOT 回報取**較大者**而非相加，避免 BOT 同時回報時重複計算；等圖只看回報值。
2. `completed:true` 優先於待留言與等圖（沿用 V0.22.0「BOT 明確結束」語意），但仍低於待審核（需要人處理）。
3. 回報過則數而三者皆 0 即自動已完成（含 0 則的空場次）。因此技能要求「登錄時不帶則數，巡完再帶」，否則剛登錄就會顯示已完成。
4. 補送窗口以**成果送出日**（台北）計：場次日期晚於送出日、或早於 14 天都拒絕（422）。補送列只在「今日有收到補送成果」時出現，不佔今日 3 列名額（最多另列 3 列）。
5. 90 天清理：成果與場次分開計批；稿件不刪，只清 `session_id`；`bot_completions` 不動。清除後同 eventRef 重送會成為新成果（保存期外的重送由技能收據擋住，不在本版處理）。
6. 原文欄位伺服器端選填（舊工具不壞），必填由技能工具端要求（kind=patrol）。重送時有帶才比對。
7. 「第 N 則」：場次視窗用 場次總數 − 順序（新到舊），未歸場次視窗用順序；有 sourceAuthor 顯示 @作者，否則顯示成果標題。

## 測試與驗證

完整驗證結果（`node --test scripts/*.test.mjs`、typecheck、validate:source、build、`validate:d1:local`、`git diff --check`）見提交說明與 CHANGELOG。截圖為合成資料（桌機 1440 與手機 390 淺色：送出內容視窗、Threads 卡片）：`/tmp/claude-0/-home-user/04d2ad10-f9b3-5958-aff8-f556061b5368/scratchpad/patrol-shots/`。

## 部署順序

1. 確認正式 D1 在 0084、當日備份已驗證；部署 WEB（0085）。
2. 替換 Grok 技能包 5 檔（`cyweb-work-reporter-v0.30.0.zip`），依 grok-setup「更新至 V0.30.0」操作；保留 token、收據、routine。
3. 隔日確認 03:15 清理沒有錯誤。

## Claude 審查

- [ ] migration 0085 與備份欄位／`CURRENT_MIGRATION` 一致，舊備份還原為預設值。
- [ ] 場次狀態推算（含無則數時的舊推算）、卡片右側文字、排序與補送列。
- [ ] 則數驗證與 COALESCE 保留舊值；note 不影響狀態。
- [ ] 補送窗口（14 天、不可未來）與送出數／今日送出數的計算。
- [ ] 原文欄位驗證與重送冪等；舊成果顯示「未附原文」。
- [ ] 90 天清理的外鍵處理、批次上限與可重跑；稿件與時間軸不受影響。
- [ ] 送出內容視窗版面（桌機兩欄、手機上下排）與寬度規則；沒有「開啟貼文」與「查看已送出留言」。
- [ ] 技能包 5 檔內容與合成範例、無真實帳號／網址／憑證。

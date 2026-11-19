# WO-0.22.0 BOT 管理中心改版：狀態列、四張摘要卡、拍板事項、巡視場次狀態、平台選項

- 狀態：**工程實作完成，待審查**（§9 由審查者填寫）。
- 分支：`cyweb/v0.22.0-bot-center`（由 main V0.21.6、migration 0078 開出）
- 版號：V0.22.0；與 V0.21.6 一起部署（兩版目前都尚未部署）。
- 開工前必讀：`PROJECT_RULES.md`、`REPO_POLICY.md`、`docs/architecture/BOT_CENTER.md`；現況程式 `src/runtime/modules/BotCenterPage.tsx`、`worker/http/bot-center-routes.ts`、`integrations/grok-bot/cyweb-work-reporter/`；使用者確認的桌機設計稿（版面參考，顏色一律用系統 token）。

## 1. 背景（使用者要求，2026-11-18）

- BOT 管理中心頂部的進行中／受阻／待命計數與逐 BOT 待命晶片沒有用，只想看「需要注意的 BOT」；「BOT 當日摘要」區拿掉。
- 四張摘要卡要同一種長相；待核准移到第三張；拍板結案要真的能用。
- 待審核表要有項次與期限；BOT 要能送「請我拍板」的事項（類別由 BOT 自填、可有金額、期限、選項），我決定同意或不同意。
- 新文章通知的平台要固定選項（FB／IG／Threads）。
- Threads 巡視每一場要看得出：待審核、已審核（等小編留言）、已完成；我在 CY Web 審核後，小編不用再回報一次。
- 拍板到期提醒推播：使用者決定不做。

## 2. 已定案事項（執行者不得更改）

### 2.1 版面（由上而下）

1. 頁首：標題、既有「回報紀錄」「設定」按鈕，以及 **BOT 狀態列**（取代舊聚合晶片與「BOT 當日摘要」區）。只列需注意的 BOT：`blocked` → 紅色「<名稱>・受阻 HH:MM」；`working` 且最後回報超過 6 小時 → 琥珀「<名稱>・N 小時無回報」；點晶片開 Dialog 顯示最新摘要與時間；其後灰字「其餘 N 個 BOT 正常」（全部正常則「全部 BOT 正常」）。資料取自既有 `/progress`，不新增輪詢。
2. 四張結構相同的摘要卡（標題＋小連結；大數字＋「單位・說明」；最多 3 列淡底資料列，無分隔線；空狀態同樣式），順序：
   - 新文章通知：今日貼文成果數；列＝平台標籤（FB／IG／Threads）＋標題＋HH:MM，點開成果全文；連結「全部 ›」開完整清單。
   - Threads 巡視回報：今日送出留言則數；每場一列：名稱＋狀態標籤（待審核／已審核／已完成）＋右側文字（待審核「N 則待審」、已審核「N 則通過・待小編留言」、已完成「送出 N 則」）；點開該場的送出／待處理明細。
   - 待核准：內容稿待審件數（不含拍板）；列「貼文 N 件」「Threads 留言 N 件（M 則）」，「其他 N 件」僅 >0 時；連結捲到審核表並切到待審。
   - 拍板結案：待決定件數「件・等你決定」；列＝標題＋期限（今日或已過為紅字）；連結捲到審核表。
3. 今日完成時間軸維持原樣，放在四張卡下方。
4. 待審核表（桌機）與 ListRow 清單（手機）：第一欄「項次」連續編號（載入更多續號）；新增「期限」欄（只有拍板事項有值）；拍板列：StatusChip「拍板」＋「［BOT 類別］」＋內文第一行，按鈕「決定」；待審檢視中拍板事項依期限由近到遠排最前（無期限在後），其後維持既有順序。

### 2.2 拍板事項（後端）

- 拍板是 BOT 送給人決定的稿件，與稿件共用審核表、推播、版本鏈與稽核。
- 儲存：migration 0079 新增側表 `bot_draft_decisions(draft_id PK→bot_drafts, category 1–20 字, amount 分≥0 可空, deadline_at UTC 可空, options_json 2–5 個≤80 字可空, chosen_option 可空)`；不重建 `bot_drafts`。拍板稿 kind=general、無 items。可攜備份、`schema-columns.ts`、`CURRENT_MIGRATION`、`validate_schema` 同步（屬業務資料，需備份）。
- 送審：`POST /api/bot-ingest/drafts` 可帶 `decision:{category,amount?,deadline?,options?}`（不可與 items 併用）；伺服器驗證；以 externalRef 冪等。改稿（`previousDraftId`）也必須帶 `decision`。`GET /api/bot-ingest/drafts/:id` 與依 externalRef 讀取回 `decision:{category,amount,deadline,options,chosenOption,expired}`。
- 審核：`POST /api/bot-center/drafts/:id/review` 對拍板接受 `choice`（選項序號）；有選項且同意時必填；不同意須備註。期限已過仍待決定：409 `BOT_DECISION_EXPIRED`，表格顯示「已逾期」，BOT 讀到 `expired:true`。介面文字：approved＝同意、rejected＝不同意。
- 拍板視窗：標題、BOT、類別（BOT 填寫）、金額、期限、內文、圖片、選項（單選）、備註（不同意必填）；共用 Dialog 頁尾「不同意／同意」，無右上 X。
- `workSummary`：`pending` 改為內容稿計數 `{count,posts,patrolDrafts,patrolItems,other}`；新增 `decisions:{count,items:[≤3 {id,title,deadline}]}`；查詢受索引限制，不新增全表掃描。

### 2.3 平台選項

- delivery `platform` 新寫入為 `FB`｜`IG`｜`Threads`（不分大小寫輸入，存標準寫法），其他 400；既有自由文字照原樣顯示；卡片標籤各用既有 token 色。

### 2.4 巡視場次狀態

- 海巡稿可帶 `sessionRef`（須為同 BOT、同台北日已登錄的場次），存 `bot_drafts.session_id`（0079 ALTER ADD COLUMN，可空，建索引）。
- 場次狀態由伺服器推算：任一連結的則待審 → 待審核；否則有已通過但尚無 delivery 的則、且場次未結束 → 已審核；其餘 → 已完成。BOT 可隱含（通過的都送完）或明確（`POST /api/bot-ingest/patrol-sessions` 帶 `completed:true`，`bot_patrol_sessions.completed_at`）結束。舊場次沒有連結稿件：有 delivery 即已完成。在 CY Web 審核只改變推算結果，BOT 不需重報。

### 2.5 Grok 工具（同一個 5 檔的包）

- 新增 `decision` 命令、`submit` 的 `sessionRef`、delivery 平台選項、`patrol-session` 的 `completed`；收據與冪等規則、舊命令相容不變；SKILL.md、wire-contract.md、grok-setup.md（新增「更新至 V0.22.0」）、工具測試同步。

## 3. 範圍

1. migration 0079、備份欄位與版本標記、`validate_schema`。
2. `shared/bot-center.ts`、`worker/http/bot-center-routes.ts`、前端 `BotCenterPage`、新 `BotWorkCards`、`BotDecisionDialog`、`bot-decision.ts`、`BotSentPatrolDialog`、`bot-center.css`、client。
3. Grok 工具包 5 檔。
4. 文件：本單、`BOT_CENTER.md`（含修正過時 API 表）、CHANGELOG、TODO、VERSION、package.json。
5. 測試：新增 `bot-decisions.test.mjs`、`bot-status-strip.test.mjs`，更新既有 BOT 測試與工具測試。

## 4. 不做

- 拍板到期提醒推播（使用者決定不做）。
- 不改 BOT 憑證、推播設定、小編 token／routine／收據。
- 不新增輪詢、不碰正式 D1、不合併、不部署。

## 5. 實作指引

- 沿用共用 panel、StatusChip、StatusFilter、ListRow、Dialog、OverflowMenu、Field，不建第二套元件；顏色用 token。
- 寫入沿用既有並發保護（審核同批 `changes()` 閘門）；拍板選項寫入與審核同一批。

## 6. 驗收清單

- [x] 狀態列：受阻、超過 6 小時無回報、正常三種規則與 Dialog。
- [x] 四張卡同結構、順序、計數與列；時間軸在卡下方；BOT 當日摘要已移除。
- [x] 項次連續（含載入更多）、期限欄、拍板列與「決定」；拍板排最前。
- [x] 拍板：送審、驗證、冪等、改稿、choice 必填、逾期 409、`expired`、拍板視窗。
- [x] 平台列舉、場次狀態轉換（待審核→已審核→已完成、明確結束、舊場次）。
- [x] 備份含新表／欄位，舊備份可還原；`validate:schema`、`validate:d1:local`。
- [x] 工具命令與文件（含「更新至 V0.22.0」）。
- [x] 桌機 1440×900、手機 390×844 截圖，無水平溢出、同列卡片等高。
- [x] typecheck、build、全部 Node 測試、validate:source、validate:d1:local 通過。
- [x] VERSION／package.json／CHANGELOG／TODO 更新。

## 8. 完成報告

（見提交時的完成報告；測試筆數與截圖路徑已在交付訊息列出。）

- 偏差與取捨：
  1. 拍板卡片與計數不含「已逾期」的待決定事項（它們不能再決定，仍在審核表顯示「已逾期」）。
  2. 場次沒有連結稿件、沒有成果、也未結束時，不列在主頁卡片。
  3. Threads 卡最多 3 列，排序為待審核、已審核、已完成；「全部 ›」開當日全部送出留言。
  4. 工具的拍板 `amount` 以新台幣元輸入，工具轉成分送出（線路與資料庫為分）；deadline 工具接受含時區時間並轉 UTC。
  5. 拍板送審驗證錯誤一律 400；人員審核缺 `choice` 為 422（與退回理由必填一致）。
  6. 拍板改稿缺 `decision` 回 400；普通稿改為拍板回 409。
  7. 工具以 `sessionRef` 輸入欄位（JSON）表示「--session」。

## 9. 審查紀錄（審查者填）

### 2026-11-19 審查（Claude）— 結論：通過

- 逐張檢視截圖（桌機 1440 與手機 390 的首屏、拍板視窗、載入更多後的審核表）：狀態列只列受阻與超過 6 小時無回報的 BOT；四張卡片結構一致且同高；項次在載入更多後連續；手機單欄、無水平溢出。
- 程式抽查拍板審核：逾期回 409 `BOT_DECISION_EXPIRED`；有選項時同意必須選擇；選項寫入、審核狀態與 Audit 在同一批次，且只對仍待審、未被新版取代的稿生效。
- 接受完成報告列出的偏差（逾期事項不計入拍板卡、空場次不列、工具金額以元輸入轉為分等）。
- 側欄網頁程式圖示（ACC、PRC）一併併入本版。
- 驗證：本機 Node 967／967、typecheck、build；PR #531 CI 全數通過；合併後部署，正式站 0.22.0，0078／0079 已套用，部署 log 比對無識別值（2026-11-19）。
- 未驗證：狀態視窗、場次視窗與手機全頁三張截圖未逐張目視；Grok 實機流程待小編更新工具後驗收。


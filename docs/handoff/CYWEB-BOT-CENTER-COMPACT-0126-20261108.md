# CYWEB V0.12.6 Build 0 — BOT 時間軸與視窗精簡交接

- 日期：2026-11-08；執行：GPT；原始 main 基準：`427f8d828e0cc63786a4634c6ecef10dab7ddf9a`；工作分支：`cyweb/bot-center-compact-0126`。
- 使用者提供 CYWEB 的四張實際畫面並要求：①今日完成時間軸每件只留一行，超出才顯示小展開按鈕；②Threads 巡視回報卡片只保留「11/8 中午 Threads 海巡完成，10 則草稿已傳王麗媛審核」類的最新標題，移除下方長詳情；③社群小編推播設定視窗窄三分之一；④BOT 設定視窗窄 20%。

## 修改內容

- `src/runtime/modules/BotCenterPage.tsx`：以 `TimelineEvent` 顯示每件完成事件；預設單行省略、只有實際文字超出才以共用 `ExpandToggle` 展開全文。入口首頁五筆和「查看全部」共用一套邏輯，不變更同分鐘群組／時間順序／50筆載入更多。Threads 卡片移除 `latest.detail` 顯示，保留 `latest.title`，其他卡不變。BOT 設定 `Dialog` 加 scope class。
- `src/runtime/modules/BotPushSettingsDialog.tsx`：推播設定 `Dialog` 加 scope class；Webhooks 欄位、保留原值、送出、權限／啟停不變。
- `src/runtime/modules/bot-center.css`：僅在本模組加入單行／展開樣式與對應 Dialog 寬度：620 → 414px（-33.2%），900 → 720px（-20%），縮小 BOT 憑證表格最小寬 850 → 680px／操作按鈕內距。小螢幕保留既有表格容器的橫向捲動。
- `scripts/bot-center-ui.test.mjs`：確認單行、溢出量測、共用展開元件、Threads 不重複詳情、僅此兩個視窗縮窄。
- `VERSION`、`package.json`、`CHANGELOG.md`、`TODO.md`、`docs/architecture/BOT_CENTER.md`、`docs/architecture/UI_COMPONENT_CATALOG.md`、`docs/handoff/README.md`：同步版本、現況與畫面契約。BUILD=0 保持不變。

## 安全與驗證

- 純前端與文件修改，不接觸正式 D1、Worker、Identity、BOT machine token、Grok Webhook、加密主金鑰、排程、推播 outbox 或真實工作資料；沒有搬移資料或新增 API 查詢。
- 展開文字只控制瀏覽器畫面，不影響先前審稿結果與發文狀態。無論是否展開，資料仍依既有角色／模組授權載入。
- GitHub PR CI：**待執行／回填**。沒有取得成功證據前不可宣稱通過。
- Claude 最終審查：**待辦**（需對照此 handoff、PR diff、CI 結果）。
- 桌機、手機實際畫面驗收：**待辦**，尤其 BOT 設定操作按鈕與推播設定長欄位的窄寬表現。
- 使用者本次未授權合併或正式部署；需明確取得批准，按受控 GitHub workflow 執行。正式站維持既有版本。

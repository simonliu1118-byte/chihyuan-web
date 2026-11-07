# CYWEB V0.12.5 Build 0 — BOT 管理中心 UI 整理交接

- 日期：2026-11-08；執行：GPT。基準 `main@f171f51d22f99bd69b5dd557c48c36c5a3ddbe13`（V0.12.4 Build 1，含 PR #449 推播及遠端 D1 0058）。
- 分支：`cyweb/bot-center-ui-refinement-0125`。**未合併、未部署**；依 PROJECT_RULES.md §9.1，Claude 最終審查待辦，不由執行者代填通過。
- 使用者已確認的兩版合成模擬圖：頂部卡去重複標題與日期；狀態／BOT pill 僅供顯示；今日完成時間軸移到最上方、只放最新五筆，查看全部用 Modal；同分鐘的事件只顯示一個藍點與時間；審稿紀錄及時間軸不再有灰色「全部 BOT」。推播設定、新增 BOT 都採**共用元件的左表頭／右輸入表格式**，不用自由排列的欄位。啟用 checkbox 移出設定 Modal，在既有 BOT 設定表格的操作欄改「啟用／停用」。

## 修改與動作

- `src/runtime/modules/BotCenterPage.tsx`：移除頂部 BOT 身份篩選、重複標題與日期；使用 StatusChip 顯示計數與每 BOT 狀態，審稿狀態篩選仍可切換。新增分組時間軸顯示元件，同分鐘事件共用時間與標記，首頁取前五**筆事件**；查看全部開既有 Dialog，保留 50 筆游標 `loadMore('timeline')`。底部逐 BOT 摘要卡片保持原本功能與版面；在原本 BOT 設定表格操作欄增加推播啟停與推播設定按鈕；新增 BOT 透過設定內「新增 BOT」按鈕開獨立 EntryTable 表格式 Modal。既有憑證管理仍在同一表格，不自動操作。
- `src/runtime/modules/BotPushSettingsDialog.tsx`：兩列表格 Webhook URL／密鑰，保留密碼型欄位及空白沿用原值，移除啟用 checkbox；儲存時保留從 API 回傳的原 `enabled`，不因打開設定而變動狀態。
- `src/runtime/modules/bot-center.css`：頂部 pills、同分鐘時間軸、原有 BOT 摘要卡片與 BOT 設定操作表、共用 EntryTable 的桌機與小螢幕樣式。
- `scripts/bot-center-ui.test.mjs`：驗證純資訊狀態、五筆截取、同分鐘分組、全量 Modal/游標、共用兩列表單、權限與啟停設定沒有把密鑰放入 API，無獨立 checkbox。
- `scripts/bot-review-push.test.mjs`：新加真實 API 合成測試，關閉／重新啟用原推播不變更已加密的 webhook target 或 BOT token hash。
- `VERSION`、`BUILD`、`package.json`、`TODO.md`、`CHANGELOG.md`、`docs/architecture/BOT_CENTER.md`、`docs/architecture/UI_COMPONENT_CATALOG.md`、`docs/handoff/README.md`：同步版號與畫面契約。

## 安全、風險與驗證

- **不讀取、不輪換、不撤銷、不中斷**小編既有 `SOCIAL_EDITOR` CYWEB 機器憑證、原 Grok Webhook URL/key 或主金鑰 `CF_BOT_PUSH_ENCRYPTION_KEY`；只經原 session／SUPER_ADMIN／Audit 的 PUT 端點切換 enabled，不修改後端權限、密文、D1 schema、Agent 或部署。
- UI 的「停用」會阻止新的審核推播並暫停待送佇列（重新啟用可恢復），因此使用共用確認框避免意外停用。原有已啟用設定只修改 URL／key 時仍保持啟用；新設定須先保存，再在設定表格操作欄明確啟用。
- 分頁全部 Modal 按原 50 筆逐次「載入更多」，不是只放前 50 筆；主畫面只呈現最新五筆、不增背景歷史查詢。若跨午夜保持現有 30 秒輕量刷新。
- 待辦：PR Runtime／Governance／部署契約 CI；Claude 最終審查；桌機／手機確認長文字換行、同分鐘時間標記、表格式輸入與 Modal 捲動、啟用與停用切換；不要自動在正式站切換推播測試。
- **此 PR 不合併、不部署、不操作正式 D1**。

## 2026-11-08 交付前返修與發布授權

- 使用者本輪再明確授權：**程式完成且 CI 通過後可合併並部署**；依 CYWEB 實際運作規範，仍須走 `main` 的 `development-deploy.yml`／`workflow_dispatch`／`deploy-development`，不能將 PR validation 當正式部署；Claude 依此次授權可事後審查。
- 初版文件合併樹誤用 `main` 的 base tree，意外把已提交的前端三個檔案復原成原版；本次返修從此前的程式提交 `3a55eb2180124a42ec7fd4c7222e5faeea1299c4` 還原，再以正確工作分支 head tree 為基準新增提交，**前一輪 CI 不作為最終驗證依據**。
- 進一步依使用者的原畫面與需求，保留底部四張 BOT 當日摘要卡，不另加非必要的 BOT 列表。推播「啟用／停用」操作移到原 `BOT 設定` 彈窗的 BOT 列表「操作」欄，與既有「推播設定」及獨立 BOT 憑證操作並列。新增 BOT 以設定視窗右側按鈕開啟共用表格式 Modal。
- 不變更既有已啟用的小編推播設定、連線憑證、加密金鑰、後端、D1；需使用者主動按下啟停才變更 enabled。最新測試／發布證據待新 head 完成後回填。

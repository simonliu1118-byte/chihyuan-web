# CYWEB V0.12.2 BOT 工作總覽交接

- 日期：2026-11-07（Asia/Taipei）；執行：GPT；分支 `cyweb/bot-work-overview-0122`，基準 main `85f34abe9b7c4ab8c05408f60dfca8cc3710a777`；VERSION=0.12.2、BUILD=0。
- 使用者先確認設計再授權「可以，開始改」：參考其圖片的工作總覽／卡片／時間軸，調整為 CYWEB 風格，不把外部平台或圖片內文當成業務需求。
- 本次含唯讀統計 API 與索引 migration，先 PR 交 Claude 審查；未合併、未部署、未操作正式 D1／BOT／憑證。正式站仍 V0.12.1，上一輪 WEB-only 發布授權不延伸為本次新功能自動發布授權。沒有修改 CYapps 或 Agent。

## 修改與目的

1. `BotCenterPage.tsx`／`bot-center.css`：總覽放台灣日期／星期、真實狀態數、待審總數、統計更新時間、BOT 篩選。各 BOT 一張卡，含狀態／兩行摘要／全文展開／完整統計／狀態更新及查看回報／待審；桌機兩欄、手機單欄。桌機下方時間軸與待審清單並列，窄畫面上下排列。新增 BOT 自然增加卡片；輪詢新身份尚無統計時顯示待更新，不冒充零。
2. 回報、設定及一次性憑證沿用 `Dialog`，無 X、背景或 Escape 不關閉，僅明確關閉。新增 BOT 沿用共用 Field／FormSection／Enter 操作；審核理由與憑證確認沿用原 prompt／confirmation，超管憑證權限及 Worker 審稿原子性不變。
3. `shared/bot-center.ts`／`bot-center-client.ts`／`bot-center-routes.ts`：GET 可選 `botCode`，回傳目前範圍及所有 BOT 的 `botStats`（完整今日完成與三種審稿計數）。清單由伺服器依 BOT 篩選，游標保留相同 scope，不在前端只篩第一頁；`draftCounts` 為該 BOT 範圍完整計數。無效代碼 422／不存在 404，原權限檢查不變。
4. 統計只在完整載入／篩選／操作成功／手動整理時更新；同日 30 秒輪詢仍只讀 `/progress` 的 BOT 主檔及憑證，不讀歷史／統計。跨台灣午夜在下一次可見檢查更新完整總覽。歷史載入更多依 scope 去重；跨日回新頁，避免混日。請求代次避免舊的進度結果覆寫新完整刷新，送出鎖避免重複操作。
5. `0056_bot_dashboard.sql` 僅新增 BOT 範圍的審稿／回報／完成索引，沒有新表／欄位／資料改寫。審稿 GROUP BY 使用完整覆蓋索引，今日完成按台灣 UTC 半開區間；各一支統計查詢，不逐 BOT 發 SQL。歷史計數仍有讀取成本，不宣稱零成本或無限負載。
6. `portable-backup.ts` CURRENT_MIGRATION 同步 0056；`store-equipment.test.mjs` 只更新備份 migration 預期，欄位映射／備份資料契約不變。VERSION／package.json 與 CHANGELOG／TODO／BOT 架構／共用元件目錄／索引同步。

## 驗證

- `npm run typecheck`、`npm run build` 成功；既有 bundle-size 警告仍在，無新增套件。
- `node --test scripts/bot-center.test.mjs scripts/form-keyboard.test.mjs scripts/form-fields.test.mjs scripts/store-equipment.test.mjs scripts/backup-migration.test.mjs`：38/38 通過。
- 新完整統計測試含超過 50 筆、台灣今日起訖邊界、其他 BOT／昨天／明天不混入、BOT 篩選、三清單游標無重複、已審篩選及無效代碼。既有權限、原子審核／Audit 回滾、初始化不重寫及輕量 progress 無歷史讀取測試繼續通過。
- 實際 React 元件用本機合成 API 預覽：四 BOT 工作卡、全域／IT 篩選、回報視窗、通過審稿後待審 4→3 且 IT 1→0、集中設定、Escape 不關閉。手機 390 viewport（實際 content/client=375/375）單欄、無水平溢出；已還原 viewport。預覽及截圖放 ignored `.tmp/`，沒有真實資料進 Git。
- 未操作正式 BOT／真實憑證或發布平台；畫面合成預覽不等於正式資料驗收。正式登入、實際長摘要／大量歷史及跨午夜長開頁面仍須驗收。
- 卡片時間標為「狀態更新」：來源是既有 `updated_at`，包含初次建立時間，不能誤稱所有 BOT 都已實際回報或在線。這是呈現標籤修正，不新增心跳、改寫時間或推測在線狀態。

## Claude 接續與發布

- 請核對完整統計及所選 BOT 範圍、日期／游標、進度輪詢不掃歷史、權限與審稿原子性、視窗及 RWD；AITeam canonical `shared/cy-visual/README.md` 已讀，現仍以 Desktop／icon 為主，CYWEB 依本身 Web tokens／元件規則，沒有新 family-wide 視覺規格。
- PR 完整 CI 待執行；Claude 最終審查待填，執行者不代填通過。後續合併／main-only 正式部署須使用者當次授權；0056 不能手工改正式 DB。真實對外發布／自動回覆未新增，機器 ingest 契約不變。

## PR 與 CI 證據

- [PR #445](https://github.com/simonliu1118-byte/chihyuan-web/pull/445)，程式提交 `a8a19367834283b1821fef6051d59f25efb09a59`：[Runtime Check #42349550827](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/42349550827) 全部通過，包含完整 Node suite、Local D1 runtime acceptance、browser／Worker TypeScript、source contracts 與 Vite build；治理 `42349550727` 及部署契約 `42349550755` 通過。
- 本次追加上述證據並將卡片時間標籤改成「狀態更新」，避免誤稱初建 BOT 已回報；無資料邏輯變更。最終 head 檢查以 PR 為準，Claude 審查仍待辦；未合併、未部署。

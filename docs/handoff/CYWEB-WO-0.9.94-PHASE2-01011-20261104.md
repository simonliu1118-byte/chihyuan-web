# WO-0.9.94 第二段：依使用者確認刪除說明文字

- 日期：2026-11-04（台灣時間）。版本：**V0.10.11 Build 0**。
- 分支：`cyweb/wo-0.9.94-phase2`；PR：[#413](https://github.com/simonliu1118-byte/chihyuan-web/pull/413)。
- 最終基準：main `56834b3e`（V0.10.10，PR #411）。執行期間已同步主線客戶、清單、備份與修改紀錄更新，依 §2.1 順延版本。
- 狀態：實作完成，待 Claude 最終審查。未合併、未部署。
- 唯一範圍依據：[WO-0.9.94 §2.1](../development/work-orders/WO-0.9.94.md#21-使用者確認結果第二段由-claude-填寫)。本檔是 PROJECT_RULES §9.1 交接，沒有另立規格。

## 結果與邊界

依原文重新定位，刪除 §8 建議刪除的 70 項與 #138，共 **71 項**核對清除。其中 #234、#236 已由最新 main 的備份改版移除，本 PR 不還原舊版備份元件，其餘 **69 項**由本 PR 刪除。#106 改為註記標題右側的 `目前字數/300`，保留換行及 300 字限制。190 項保留與 #250、#259 不變；客戶「最後修改」仍在紀錄卡片下方，V0.10.0–V0.10.10 的客戶與設定改版完整保留。

刪掉提示時同時移除所屬 p／small／description／hint；不留下空的搜尋下拉框、ERP 查詢結果區、未選員工的明細卡。保留空狀態主句、驗證、錯誤、載入、確認問句與實際資料。共用 Field／Dialog／MasterDetailEmpty／AppShell 的一般能力不移除。

## 修改檔案與對應項目

以下路徑前綴為 `src/`，模組檔案前綴為 `src/runtime/modules/`。

| 檔案 | WO 項目／原因與行為 |
| --- | --- |
| App.tsx | #1–15，移除各頁傳給 AppShell 的說明及該常數；保留所有頁標題。 |
| ui/pickers/EntityPicker.tsx | #22，刪除「請輸入關鍵字」。預設一字搜尋在尚未輸入時不開空下拉框；最少兩字以上的提示、搜尋中／失敗／無結果及選取行為保留；ARIA 展開狀態對應實際下拉框。 |
| CustomerOperationalPage.tsx | #28，只移除未選客戶的操作提示，保留主句與新版客戶內容。 |
| ItemOperationalPage.tsx | #38、40；建立商品時 #39 ERP 品號限制仍保留。 |
| DefectOperationalPage.tsx、defect/DefectForm.tsx | #46、47，移除空清單與編輯說明；移除下一步提示呼叫。 |
| status-flow.ts | #49–52、62–66、83–87、95–97，刪除四組下一步文字常數；所有狀態 tone 保留。#52 同文多處均清除。 |
| SalesOrderOperationalPage.tsx | #55–58、60、61 及下一步提示呼叫；#59 ERP 客戶編號一致性提示及驗證保留。 |
| OutsourcingMasterData.tsx | #69、74、75，代工對象、BOM 空清單與編輯說明。 |
| OutsourcingOperationalPage.tsx | #78、79、81 及下一步提示呼叫；#80 更正已確認出庫的後果說明保留。 |
| WorkLogOperationalPage.tsx | #90、92 及下一步提示呼叫；必要列數驗證及進度不變。 |
| OrderingPage.tsx | #104 刪除；#106 改為右側字數，不改註記輸入與儲存邏輯。 |
| erp-item-query.css | 只新增 #106 標題列 flex 及計數字級／數字對齊樣式，未改共用標籤。 |
| ui/OrderingSourcePicker.tsx | #111，移除搜尋分類提示整個區塊，保留空結果文字。 |
| StocktakeGroupedDetail.tsx | #138，刪除手機 Enter／Esc 教學；保留儲存中、#139 WEB／ERP 說明及原鍵盤處理。 |
| ErpPartyOrdersDialog.tsx | #149，未查詢時移除提示與空結果容器；查詢時仍有 loading／結果區；日期範圍規則提示保留。 |
| ErpHeldPrompt.tsx | #161，僅移除補充說明，保留暫停資訊主問句與操作。 |
| HrOperationalPage.tsx | #185、191，移除提示，緊急聯絡人必要列數驗證保留。 |
| HrLeavePanel.tsx | #196、204；未選人員不產生空明細卡，特休工時欄位與資料保留。 |
| identity/SharedIdentityPage.tsx | #212、214、215、217、218、222；#211 本人權限、#213 未驗證 Email、#216 群組權限後果說明保留。 |
| BackupOperationalPage.tsx（與最終 main 無差異） | #234、236 已由主線備份改版移除；整份採最新 main，保留新版單列表格與 #237 等提醒。 |
| auth/AuthGate.tsx | #247、249，刪除驗證教學與無使用者資料時的備援句；#248 首次登入重要說明、既有人名／編號保留。 |
| VERSION、package.json | 由最新 main 0.10.10 加至 0.10.11；BUILD 維持 0。 |
| CHANGELOG.md、TODO.md、本 handoff、handoff README、WO §8.6、合成截圖 | 記錄本次結果及 Claude 待審，不變更第一段原始盤點表或 Claude §9 歷史。 |

## 驗證

- 由原盤點表取出 71 項刪除原文，掃描目前 src：**剩餘 0 項**。190＋2 項保留原文與 main 比對：既有字面出現數沒有減少；動態文字另對照 JSX／函式及差異核對（#30、32、114、202、203、209、210 原本就是模板組合）。原盤點的行號與建議保留作歷史，未改寫。
- `npm run build`：通過（包含前端與 Worker 型別檢查）；只有既有打包大小提醒。
- `npm run validate:source`：通過。Windows 使用本機 portable Python 並設定 `PYTHONUTF8=1`，避免 cp950 解碼失敗。
- `node --test scripts/*.test.mjs`：618 項，**607 通過、11 失敗**。將 main 原檔複製到隔離暫存、還原本次修改檔案為 HEAD 原文，以相同 Windows／CRLF 環境重跑這四支，37 項中同樣 26 通過、11 失敗，名稱及失敗條件一致：
  - backup-rehearsal-http.test.mjs：6 項，合成復原請求回 503，與預期 200／400／403／409 不同。
  - deployment-source.test.mjs：1 項，原測試以 LF 字串切 CRLF 工作流程，split 後為 undefined。
  - secure-entry.test.mjs：1 項，Windows URL.pathname 的 /C:/ 路徑無法交給 esbuild。
  - store-backup-upgrade.test.mjs：3 項，原測試把目前 CRLF migration 指紋與 LF 固定值相比。
- 上述失敗未修改測試或 Worker 以規避；本 PR 相對最終 main 的 Worker、migration、部署流程與測試檔沒有變更。PR 的 Linux CI 結果另核對，不把本機完整測試寫成全通過。
- 產品實際 React 元件＋本機合成 API 替身驗證：註記 0/300、含換行 8/300、300/300 與 maxLength=300；桌面／手機靠右且無超出；客戶空狀態只剩主句；ERP 查詢待命不留空結果框；預設搜尋空白無 popup、兩字限制及找不到資料仍顯示；手機儲位不再有 Enter／Esc 提示，WEB／ERP 說明及 Esc 取消仍正常；首次登入刪掉兩句但保留重要提醒。
- `git diff --check` 通過。沒有新增鏡像斷言測試、API、資料庫或部署設定。

## 畫面證據

全部為合成資料，沒有正式 API／Identity／ERP／Cloudflare／D1 讀寫。預覽替身僅在被忽略的 .tmp，沒有交付到產品。第一段全清單及紅框圖仍見 WO §8.3／8.4；下列是第二段代表畫面，非宣稱重新走查第一段全部 148 狀態。#106 與手機盤點先前已補驗；整合 V0.10.10 後再以最終版建置與對應畫面核對。

| 畫面 | 圖片 | 實際尺寸 | SHA-256 |
| --- | --- | --- | --- |
| 來源註記桌面，8/300（含換行） | [01-source-note-desktop.jpg](WO-0.9.94-phase2/01-source-note-desktop.jpg) | 1440×1000 | `cdd855bd947fb6ccdbb17a8f788e8e1ee5136e652dee7835a2c2907eb08d2a51` |
| 來源註記手機，300/300 | [02-source-note-mobile.jpg](WO-0.9.94-phase2/02-source-note-mobile.jpg) | 390×844 | `ce43ee161f9f8d70e844271a7880149bda3d44e524617f919b0dcd81afecc0f1` |
| 客戶空清單，僅保留主句 | [03-customer-empty-desktop.jpg](WO-0.9.94-phase2/03-customer-empty-desktop.jpg) | 1440×1000 | `bc4ee8c7e5b28af1279f7f65eaf040e7e6631c34de1c88e2838611b55bd8bc7d` |
| ERP 查詢待命，保留範圍提示 | [04-erp-query-idle.jpg](WO-0.9.94-phase2/04-erp-query-idle.jpg) | 1440×1000 | `cd3b752326f808d837d69c402c3fe9086b0b309b311d2c0c9b24a7d8d29e4ded` |
| 兩字限制及還原驗證重要說明保留 | [05-picker-preserved-hints.jpg](WO-0.9.94-phase2/05-picker-preserved-hints.jpg) | 1440×1000 | `4e0677a05a7719450e018def59baf8cef95835bfb90275969166695c7a697e85` |
| 手機修改儲位，刪 #138、保留 #139 | [06-stocktake-mobile-location.jpg](WO-0.9.94-phase2/06-stocktake-mobile-location.jpg) | 375×812 | `071ea819e3475bbbb6120d42b664697a658de52c445a04dabca2b588b6b98441` |

## 風險與 Claude 接續

變更以移除呈現為主。需注意共用搜尋選擇器移除提示時的 popup／ARIA 一致性，以及有條件保留提示的分支（商品建立、出庫更正、未驗證 Email、未完成備份設定）。未對正式帳號、寄信、ERP 查詢、儲位或備份執行操作；仍需正式登入後實機驗收。

請 Claude 對照 WO §2.1、71 項刪除及 192 項保留、本 PR 差異與 CI 審查，將結論填回本節與 WO §9。未授權本次自行合併或部署。

## Claude 最終審查

待 Claude 填寫；GPT 未代填通過。

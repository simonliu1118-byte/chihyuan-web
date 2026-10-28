# CYWEB V0.9.51 — 備份管理 UI 整理、季度提醒每日查詢：GPT → Claude 審查 Handoff

- **狀態：GPT 已提交功能與測試，待最新 PR CI 及 Claude 最終審查；未合併、未部署。**
- 日期：2026-10-29（Asia/Taipei）
- Repository：`simonliu1118-byte/chihyuan-web`
- 工作分支：`feat/cyweb-backup-layout-daily-reminder-20261029`
- 基準：`main` commit `d775cac6e7dfb798e7981318047288b1f70a7a56`，已包含合併的 PR #303 與 #304（正式版本 V0.9.50 Build 0）
- 新版：**V0.9.51 Build 0**；本版交接是增量修正，不回改已結案的 V0.9.49／50 handoff。
- 執行者：ChatGPT；**最終審查：Claude，由 Claude 親自填 §7；不可由執行者代填通過。**

## 1. 使用者原始需求與圖示

使用者提供 V0.9.50 備份頁面截圖並指定四項：

1. 「每季提醒超管」的檢查不需要每小時，改為**每天一次**。
2. 截圖一分離在備份清單上方的「✓ 隔離還原驗證：完成」大框，與下方「隔離還原驗證紀錄」合成**同一區塊**。
3. 「備份識別資訊」不需要每筆展開：把備份編號、版本、資料摘要**直接常駐顯示**於備份時間與 R2／GCS 儲存副本之間（桌面可用空間夠，手機保留可換行卡片）。
4. 移動「CYInvoice 災難復原」按鈕到上方「更新紀錄」右側，中間加分隔線；移除頁面下方整個 CYInvoice 入口說明區塊。「公司電腦全部遺失或損毀時，寄送復原邀請給新電腦接管 CYInvoice。」改為按鈕的 **tooltip**。

不用調整任何業務流程、權限、D1、Migration、備份排程、Cloudflare 資源或已通過的 V0.9.50 隔離目標自動解除綁定流程。依 `PROJECT_RULES.md` §9.1，所有改動均須記在 handoff 後交 Claude 審查。

## 2. 逐檔修改（與程式單一權威）

| 路徑 | 修改、目的與注意事項 |
| --- | --- |
| `shared/backup-quarterly.ts` | 新增共用 `QUARTERLY_REMINDER_RECHECK_MS = 24 * 60 * 60 * 1000`，保留原台灣時區曆季計算與成功判定。 |
| `src/App.tsx` | 將超管提醒原本的一小時節流判斷與 timer 改為同一 24 小時常數；首次登入仍查一次，回到瀏覽器分頁只在已滿間隔或**跨台灣曆季**時查，演練成功事件仍立即刷新。**未**啟用離線 Email／Push、Cron 或備份排程。 |
| `src/runtime/modules/BackupOperationalPage.tsx` | 備份列表事件欄只保留時間／種類／狀態，新增可重用 `identity` renderer，桌面 `DataView` 的「備份時間」與「儲存副本」之間插入「備份資訊」欄；手機 `renderCard` 直接顯示同一套完整 ID、版本及 SHA，不另設展開。原 `shouldShowLatestRehearsalResult` 決策保留；只把 `BackupLatestRehearsalResult` 移入「隔離還原驗證紀錄」的 section 內、歷史列表之前。將 `CyInvoiceRecoveryAdminPanel` 的**唯一**元件實例移到 toolbar 更新按鈕旁。 |
| `src/identity/CyInvoiceRecoveryAdminPanel.tsx` | 只重構**入口視圖**：移除獨立 `cy-invoice-recovery-panel` 區塊和其文字，改為同一排的分隔線＋按鈕並加 `title`（完整原文字）。仍依原 SUPER_ADMIN、Workspace Super Admin、Email verified 條件顯示；原 checkpoint、sessionStorage、操作 ID、單次簽發／撤銷／查詢、密碼、雙重確認和 Dialog 仍由**同一元件**擁有，沒有拆第二份表單或新 owner。原操作尚未結案時仍顯示「繼續處理復原操作」。 |
| `src/runtime/modules/backup-operational.css` | 備份識別欄常駐排版／長 SHA 換行／桌面欄寬；在上方 toolbar 的 CYInvoice 按鈕左邊加細分隔線；將成功結果框整合至歷史 section 內的 padding／margin，不再是獨立 panel。維持原共用 Design Tokens。 |
| `scripts/backup-ui.test.mjs` | 補桌面欄順序、備份識別資訊不需展開、手機卡片同資料、完成結果在驗證紀錄 section 內、工具列單一 CYInvoice 按鈕與 tooltip／Dialog owner 的回歸。 |
| `scripts/backup-schedule.test.mjs` | 補提醒常數 24 小時與 `App.tsx` 對應節流及 timer contract 的回歸，沿用原 Runtime Check 既有測試組。 |
| `VERSION`, `package.json` | V0.9.50 → V0.9.51；`BUILD` 保持 0，依版本規則。 |
| `TODO.md`, `CHANGELOG.md` | 明確記錄新增 UI 需求、版本進度、未部署界線及原 V0.9.50 正式版本，不把本次 PR 綠燈當部署。 |
| `docs/handoff/README.md`, 本檔 | 新增現行 Claude 審查入口，歷史已合併 V0.9.49 移至歷史清單；本檔完整交付細節、測試、風險與審查欄位。 |

## 3. UI 預期驗收條件

- 頁面最上方依序：**建立手動備份**｜**更新紀錄**｜細分隔線｜**CYInvoice 災難復原**。按鈕的 native tooltip 為使用者指定全文；操作未完成時按鈕顯示「繼續處理復原操作」，原對話框與發信行為不得改變。
- 備份列表桌面欄順序：**備份時間（台灣）／備份資訊／儲存副本／資料量／操作**。備份資訊包含**完整**備份編號、V 版本及資料摘要；無需展開按鈕。手機卡片直接顯示並處理長值換行。
- 「✓ 隔離還原驗證：完成」顯示於 **「隔離還原驗證紀錄」同一個 panel 的標題下**；結果（時間／核對成功）與完整歷史列表一起閱讀。已核准的新空白目標 `recoveryReady=true` 時仍依既有規則隱藏舊成功大框，歷史事件保留。
- 超管第一次登入仍即時唯讀查詢當季 Audit；開著 CYWEB 期間**最多每 24 小時**再查，台灣季度切換或本次演練完成可以即時更新。僅查通知狀態，不觸發或重做還原。
- CYInvoice 權限不足或 Email 未驗證時不顯示按鈕**也不會顯示多餘分隔線**；保留原「已簽發但未定案」警告及操作 ID 安全邊界。

## 4. 測試與 CI（以 PR 最新 HEAD 為準）

- [x] 新增合成 React render 與靜態版面 contract（`scripts/backup-ui.test.mjs`）。
- [x] 新增提醒間隔常數與實作節流檢查（`scripts/backup-schedule.test.mjs`）。
- [ ] 最新 Governance Check、Runtime Check、Deploy PR-only 驗證結果：由本輪新 PR 建立後填入實際 workflow URL／SHA，不以舊版 CI 當本次證據。
- [ ] Claude 以最新 head 檢查桌面／平板／手機 CSS 可讀性與 toolbar 在窄版換行時操作可用性；真正裝置截圖尚未執行。
- [ ] Claude 確認 CYInvoice 元件在 toolbar 只 mount 一次，`confirmationDialog`、credential dialog、未結操作 checkpoint 未遺失；對簽發、撤銷與重送風險不應因純位置變更產生第二條路徑。
- [ ] 併入前需要 Claude 最終審查且另取得使用者核准；正式部署、Cloudflare 及任何還原不屬本輪。

**本輪僅 GitHub 分支提交：Cloudflare D1/R2/GCS/Worker 讀 0、寫 0、資源建立／刪除／改綁 0。** 沒有操作任何正式備份或客戶／員工資料。

## 5. 風險與後續建議（不自行擴大範圍）

- 每 24 小時是**登入後的站內提醒讀取頻率**，不是每日發 Email、Cron 或強制每 24 小時重新演練；台灣曆季判斷依既有純函式。若使用者反覆重新登入，不提供跨瀏覽器的每日配額鎖。
- 管理頁目前固定顯示**完整備份 SHA256**；桌面能用新欄放下，手機靠 `overflow-wrap:anywhere` 換行。Claude 可建議是否未來提供「複製摘要」操作，但不得在本輪自行遮罩原有識別碼。
- 原 `CyInvoiceRecoveryAdminPanel` 入口由區塊變成 toolbar 元件後，**不要新增**另一層全域狀態或平行 Dialog；目前僅移動一個 instance。原頁面頁首的 `cy-page-toolbar` 已是單一動作列。
- V0.9.50 已實作的使用後 Worker 綁定自動解除流程在 `scripts/provision-backup-recovery.mjs`，本版未改動也未宣稱會在 UI 點擊成功當下即實體解除。
- 本版不新增和操作 D1，故不用本地 Cloudflare MCP 查核；正式 UI 實機驗收須等 Claude 審核／使用者核准正式發布後才做。

## 6. GPT 執行完成報告

- 已在最新 main 開分支、逐檔實作上述需求與新增回歸測試，並更新本 handoff／版本／TODO／CHANGELOG。
- 所有視圖結構變動皆沿用現有 `DataView`、`Dialog`、`CyInvoiceRecoveryAdminPanel` 與設計色票，沒有修改 Worker 路由或 D1 schema。
- 未獲授權的部分：**不合併、不部署、不執行還原、不清空、不改綁、不建立 D1**。
- 最新 CI／若有返修，於 PR 建立後再同步記錄。Claude 審查結論仍未填寫。

## 7. Claude 最終審查紀錄（Claude 親自填）

- 審查日期：
- 審查者：Claude
- 審查的 PR head SHA：
- 結論：**待審查**（通過／需修正／阻擋合併）
- 需修正事項（逐一附檔案／行號）：
- 視覺／裝置／React 生命週期檢查：
- 最新 CI／本機測試證據：
- Claude 直接修改或 GPT 返修（如有）：
- 是否可交使用者決定合併／部署：

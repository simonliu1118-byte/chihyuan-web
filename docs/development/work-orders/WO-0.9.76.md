# WO-0.9.76 進貨輔助抽屜：結果表格與加入叫貨單版面

- 狀態：待 Claude 審查
- 分支：cyweb/wo-0.9.76-restock-layout　PR：[#365](https://github.com/simonliu1118-byte/chihyuan-web/pull/365)
- 純前端、沒有 API 與 migration：審查通過後合併部署。

## 1. 背景（使用者原話，2026-11-03）

- 「進貨輔助抽屜太大了」。V0.9.74 已讓抽屜依內容大小，只有查詢表單時約 630px；但有結果時表格仍會把抽屜撐到 1100px。
- 「如果抽屜改窄，這個介面可能要想一下怎麼設計比較清楚，不會一直在拉卷軸」。目前結果表格有兩個問題：
  - 每天一組「銷／退」欄，31 天就是 62 欄，要一直左右捲；
  - 表格自己有一層上下卷軸，抽屜又有一層，變成兩層卷軸。
- 「加入這邊把建議拿掉」：指「加入叫貨單」對話框的來源最上面那組「建議」。
- 2026-11-03 起的「已在草稿」只在打開加入對話框時查詢該品號（V0.9.74），本單不要改回逐列預先查。

## 2. 已定案事項

### A. 結果表格預設精簡

- 預設欄位：
  - 品號／品名；
  - 銷貨、銷退、淨銷、庫存；
  - 叫貨。
  
  **每日明細預設不顯示**，表格不必左右捲動。抽屜在 1440 螢幕上寬度約 720～800px（以內容為準，不要寫死 1100）。
- 篩選列（篩選品號或品名、排序、只看庫存不足、共 N 個品號）保持在表格上方，右邊加一個切換「顯示每日明細」：
  - 用 `SegmentedControl` 或 `CheckField` 擇一，與「只看庫存不足」並排；
  - 打開後才出現每日「銷／退」欄，這時抽屜放寬到最多 `min(1100px, 100vw - 24px)`，表格可左右捲；
  - 這個選擇記在 `localStorage`（讀寫用 try/catch）。
- 想看單一品號每天的數字，也可以點品號：現有的 ERP 資料視窗已經能看。

### B. 只有一層卷軸

- 結果表格不要再有自己的上下捲動區（拿掉 `.cy-restock-scroller` 的高度限制），只由抽屜本身上下捲。
- 表頭固定在抽屜頂端：`position: sticky; top: 0`，相對抽屜內容區。
- 開啟每日明細時只允許左右捲，「品號／品名」欄固定在左邊（sticky left），原本就有的話沿用。
- 抽屜下方「已加入 ○○ 草稿」的提示用現有的 `FeedbackBanner`，固定在抽屜底部，不要被表格推到最下面看不到。

### C. 叫貨欄縮窄

- 「加入叫貨單」文字按鈕改成 `IconButton`＋`Icons.add`（`variant="table"`），`aria-label` 和 `title` 為「加入叫貨單」，以節省欄寬。
- 列高恢復一致：V0.9.74 之前那種按鈕下多一行草稿提示、撐高單列的狀況已經沒有了，確認沒有殘留樣式。

### D. 加入叫貨單對話框：拿掉「建議」

- `src/ui/OrderingSourceChips.tsx` 拿掉「建議」那一組（上次來源、有草稿的來源）。
  - 「公司」「廠商」兩組不變，有草稿的來源仍顯示小圓點。
  - 「上次」來源仍然預先選好（`lastSourceId` 繼續用來預選，只是不再另列一組）。
- 對話框上方「已在 ○○ 草稿 ○ 盒」提示（V0.9.74）保留。
- 對話框內的廠商列表目前自己有一層捲動，加上整個對話框又捲。請調整成只有廠商列表這一處捲動，高度上限約 5 行，對話框本身在 1440×900 不必捲動。

### E. 手機（390）

- 抽屜維持滿版。
- 預設精簡表格在手機改成卡片：
  - 品號／品名一行；
  - 銷貨、銷退、淨銷、庫存一行；
  - 右上角放加入圖示。
  
  比照售後維修清單的 `data-label` 卡片寫法。
- 手機不提供每日明細切換。

## 3. 範圍

- `src/runtime/modules/RestockAssist.tsx`：預設欄位、每日明細切換、加入按鈕、卡片。
- `src/runtime/modules/erp-item-query.css`：卷軸、sticky 表頭、抽屜寬度。
- `src/ui/OrderingSourceChips.tsx` 與 `src/ui/ordering-source-chips.css`：拿掉建議、廠商列表高度。
- 測試：
  - 預設沒有每日欄、切換後才有；
  - 對話框沒有「建議」；
  - 上次來源仍預選。

## 4. 不做

- 不改進貨輔助的查詢、ERP Agent、排序與庫存不足判斷。
- 不改 `draft-items` API。
- 固定一條：不加多餘的測試與防護（共通規則 §11.4，使用者 2026-10-29）。

## 5. 實作指引

- 一律用共用元件：
  - `SidePanel`；
  - `IconButton`＋`Icons`（不要寫 `<svg>`）；
  - `SegmentedControl`／`CheckField`；
  - `FeedbackBanner`；
  - `Dialog`。
- 抽屜寬度：`SidePanel` 已有 `width="auto"`＋`className="cy-restock-side"` 依內容大小（V0.9.74）。開每日明細時可加一個 class 放寬上限，不要改共用 `SidePanel`。
- 版本 V0.9.79（V0.9.77、V0.9.78 已由 Claude 用掉；若順序不同則接續最新版本）。

## 6. 驗收清單

- [x] 1440 有結果時，抽屜約 720～800px，預設不用左右捲；只有一層上下卷軸，表頭固定。
- [x] 「顯示每日明細」打開後才有每日欄，抽屜放寬、可左右捲、品號欄固定；重新整理後記得選擇。
- [x] 叫貨欄是加入圖示；「已加入」提示在抽屜底部看得到。
- [x] 加入對話框沒有「建議」，上次來源仍預選；只有廠商列表捲動，對話框在 1440×900 不必捲。
- [x] 手機 390：抽屜滿版，結果為卡片。
- [x] `npm run typecheck`、`npm run validate:source`、`npm run build` 通過；`node --test scripts/*.test.mjs` 通過，交審前最新 head CI 全綠。
- [x] VERSION／package.json、TODO、CHANGELOG 已更新。

## 7. 截圖要求

- 桌面 1440×900：
  - 有 300 個品號以上的結果（預設）；
  - 開啟每日明細；
  - 加入對話框。
- 手機 390：結果卡片、加入對話框。

## 8. 完成報告（執行者填）

- **交付**：V0.9.79 Build0，PR [#365](https://github.com/simonliu1118-byte/chihyuan-web/pull/365)，分支 cyweb/wo-0.9.76-restock-layout。已整合 main 2f9e9f8，保留Claude已合併的V0.9.76到貨／日期、V0.9.77未到貨頁籤、V0.9.78草稿紅框／手填廠商值。版本依工單順延，未覆蓋其他工作。
- **桌面預設**：1440×900，340個合成品號；抽屜寬780px，內容scrollWidth=clientWidth=763，沒有水平溢出，只有cy-restock-content一層上下捲動。表頭固定在內容頂端。
- **每日明細**：共用CheckField與庫存不足並排，切換後抽屜1100px，才產生每日欄位；同一內容區可水平捲動，單一thead固定top:0，品號固定left。重新整理後記得偏好。無額外API讀取。
- **加入與提示**：共用IconButton＋Icons.add（table），aria-label/title「加入叫貨單」。FeedbackBanner為捲動內容外的flex footer，加入成功後即使表格很長仍在底部可見。
- **來源視窗**：移除建議組，保留公司／廠商、上次來源預選及草稿圓點；仍只在打開時查該品號draft-items。80個合成廠商下列表174px約五行；1440×900的440×572px視窗只有廠商列表捲動，視窗本身不捲。
- **手機**：390×844，抽屜寬390且無水平溢出；同一tbody/tr用data-label卡片顯示，右上加入圖示；不產生每日欄、隱藏明細切換。370px加入視窗亦只有廠商列表捲動。
- **本機驗證**：V0.9.79的npm run typecheck／build／validate:source通過；整合後叫貨grid/page/route與本工單、共用欄位／鍵盤測試 **104/104** 通過。為執行完整來源檢查，在ignored .tmp使用Python官方3.13.0攜帶版（Authenticode Python Software Foundation簽章Valid）、僅程序環境PYTHONUTF8=1，未改系統安裝。
- **本機平台差異**：前兩次完整Node在Windows為582/571、587/576，11失敗皆為未修改的Windows URL／CRLF／schema換行指紋；Linux完整結果如下。npm run validate:d1:local已完成全部migration、Worker+D1 acceptance及移除舊session表三項PASS，退出清理時遇Windows WinError32檔案占用；已停止該隔離驗證背景程序，沒有把此命令的整體退出碼記成成功。Linux CI的同命令整體通過。
- **正式CI**：程式整合提交65d8fdc的[Runtime Check 41449692020](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41449692020)四jobs全綠，完整Node **596/596通過、0失敗**，含Local D1、來源契約及build；[Governance](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41449692094)及[部署契約](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41449692026)通過。最後僅回填本報告／交接，交審時仍確認[PR最新head checks](https://github.com/simonliu1118-byte/chihyuan-web/pull/365/checks)全綠後再轉Ready。
- **截圖交付**：外部outputs/WO-0.9.76-ui-proof.zip，包含wo76-desktop-compact、desktop-daily、desktop-daily-sticky、desktop-add、desktop-footer、mobile-cards、mobile-add七張PNG，全部合成資料，未放入Public Git。
- **偏離及原因**：水平與上下捲動共用抽屜內容區，避免table wrapper的overflow-x:auto建立另一個scroll ancestor、使表頭無法相對抽屜固定。沒有複製表頭／observer／DOM relocation／第二套手機元件，SidePanel共用元件未改。
- **來源檢查修正**：原validate_operational_runtime.py全面拒絕localStorage，誤判工單指定的畫面偏好。直接修改既有檢查，只允許RestockAssist的cy-restock-daily兩個literal存取；其他業務儲存仍禁止，未新增儲存wrapper。
- **資源與審查**：本輪正式D1讀0列／寫0列、正式ERP呼叫0；合成HTTP及本機D1均不接正式服務。相對最新main沒有API／Worker／migration變更。Claude最終審查請填原工單§9；未合併、未部署、未發Release。

## 9. 審查紀錄（審查者填）

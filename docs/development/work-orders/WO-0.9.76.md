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

- 實作版本：V0.9.79 Build0，開工基底main 5c2a01c；開發中Claude合併WO-0.9.74（V0.9.76）及V0.9.77未到貨頁籤，已整合main 431a73c，先依工單順延至V0.9.78；交審時Claude另合併V0.9.78草稿修正（main 2f9e9f8），再整合並依主線工單指定版本順延V0.9.79，保留已合併功能。
- 驗收：1440×900／340 個合成品號下抽屜 780px，內容 scrollWidth=clientWidth=763，只有 cy-restock-content 一層上下捲動；顯示每日明細後為 1100px，橫向與上下捲動均由同一內容區承擔，表頭 top=120 與內容頂端一致，固定品號 left=329 與內容左側一致。選擇重新整理後保留。
- 加入：共用 IconButton/Icons.add（table），FeedbackBanner 作為不捲動 footer，加入後位於視窗底部；公司／廠商僅出現一次，上次來源預選與草稿點保留。80 個合成廠商下列表高度 174px、可見約五行，440px 加入對話框高度約 572px，本身不需捲動。
- 手機390×844：抽屜寬390、內容無水平溢出、每日欄不建立／切換不顯示；同一表格轉 data-label 卡片，加入圖示在右上。手機加入對話框寬370，只有廠商列表捲動。
- 主要測試：新增 scripts/restock-layout.test.mjs 三項，實際測試預設／切換、偏好及 compact、來源預選與按需查詢；連同欄位／鍵盤測試6/6通過。npm run build（含前後端 typecheck）通過，既有 bundle 大小／dynamic import 警告未擴大處理。
- 本機完整 node --test scripts/*.test.mjs：整合前582項571通過11失敗；整合main 431a73c後587項576通過11失敗（同一組Windows差異）；失敗在未修改的 backup-rehearsal-http Windows URL、secure-entry Windows URL、部署檔CRLF及0043～0045 schema字元換行指紋。Windows未安裝Python，validate:source／validate:d1:local本機無法執行；需以PR的Linux CI執行正式完整驗證，不把本機結果寫成全通過。
- 截圖：外部交付 outputs/wo76-desktop-compact.png、wo76-desktop-daily.png、wo76-desktop-daily-sticky.png、wo76-desktop-add.png、wo76-desktop-footer.png、wo76-mobile-cards.png、wo76-mobile-add.png，全部是合成資料，未放入Public Git。
- 偏離說明：每日明細的水平捲動與上下捲動共用抽屜內容區；若給 table wrapper overflow-x:auto，瀏覽器會同時建立上下捲動 ancestor，使 sticky 表頭無法相對抽屜固定。因此直接維持一個 scroll owner，沒有複製表頭／observer／DOM relocation／第二套手機元件，符合單層捲動目的。SidePanel共用元件未修改。
- 資源：純前端；本輪正式D1讀0列／寫0列、正式ERP呼叫0。合成HTTP在localhost，不接正式服務，API/migration/Worker無變更。
- 主線整合：只在TODO／CHANGELOG頂端的新版本段落有衝突，保留兩方內容並將本工單順延V0.9.78；RestockAssist的DateInput customError與日期／到貨／未到貨頁籤改動均保留。
- 整合後重點27/27通過、V0.9.78 build/typecheck通過；首輪CI 41448262542 的來源檢查將所有 localStorage 一概視為業務authority，與工單指定的單一顯示偏好衝突。已直接更新既有validate_operational_runtime.py，僅允許RestockAssist的cy-restock-daily兩個literal存取，其他業務儲存禁用照舊；沒有新增storage wrapper或改掉工單要求。
- 程式提交65acc04： [Runtime Check 41448660942](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41448660942)四個jobs全綠、完整Node **591/591通過、0失敗**，含Local D1與來源契約／Vite build；[Governance 41448660917](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41448660917)與[部署契約41448661032](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41448661032)全通過，實際deploy/audit未執行。
- 第二次整合：完整保留main 2f9e9f8的草稿紅框、手填廠商值及原有測試；僅TODO／CHANGELOG新版本段落有衝突，兩方內容都保留，版本順延V0.9.79。先前交接提交504965b亦已完整Linux591/591、來源／型別／治理／部署契約全通過；整合後最新head仍以以下檢查入口為準。
- 最終交審檢查入口：[PR #365 checks](https://github.com/simonliu1118-byte/chihyuan-web/pull/365/checks)，本輪只回填完成報告／交接，仍須確認該最終head的必要CI全綠再轉Ready。Claude最終審查待填；未合併、未部署、未發Release。


## 9. 審查紀錄（審查者填）

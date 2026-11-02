# WO-0.9.68 月度待辦：換行版面與項目週期

- 狀態：待審查（GPT 已提交候選，尚未合併部署）
- 分支：cyweb/wo-0.9.68-monthly-layout　PR：[ #351 ](https://github.com/simonliu1118-byte/chihyuan-web/pull/351)

## 1. 背景（使用者原話）

- 「月度待辦的介面有點醜，怎麼改比較好?」
- 「各項目要可以設定單月/雙月/全部/自訂，有設定就只會在指定月份出來」
- 版面：「維持現在方向，超過一列能放的空間之後，就變成兩列」，並附示意圖：左側一格「2026/10」跨列；右側第一行是項目 A、B、C 的名稱，下一行是對應的辦理格；放不下的 D、E、F 換到下一組（名稱一行＋辦理格一行），兩組之間用粗線分隔。

## 2. 已定案事項

- **版面方向不變**：一列是「一個月份 × 一個門市」，項目是欄。
- **項目換行**：一個月份門市的項目放不下一行時，換成多組。每組是「項目名稱一行＋辦理格一行」。左邊的「年月」「門市別」格跨所有組（rowSpan）。組與組之間用較粗的分隔線，月份門市之間用更明顯的分隔。
- **項目名稱橫排**、可在格內自然換行，**不再一字一行的直排**。
- **每組可放幾個項目依可用寬度計算**：每格最小 96px，以表格容器寬度扣掉左側兩欄後計算，視窗縮放時重算（`ResizeObserver`）。手機（820px 以下）每組固定 3 個。
- **辦理格外觀**：
  - 未辦：淺色外框的小按鈕「登記」，**不要藍底**；
  - 已辦：綠色「✓ 11/05」（無日期的已辦顯示「✓」），可點開修改；
  - 本月份：未辦且月份已過，格子淡紅底。
- **項目週期**（項目設定新增一欄「週期」）：
  - 每月（預設）、單月（1、3、5、7、9、11 月）、雙月（2、4、6、8、10、12 月）、自訂（勾選 1–12 月，至少一個）；
  - 週期只決定「哪些月份產生這個項目的辦理格」。不在週期內的月份，該格**不顯示**（換行計算時也不佔位）。
  - 週期變更**從當月起生效**，**已產生的過去月份格子與完成紀錄不刪除也不隱藏**（與現有「停用從次月生效、歷史不抹除」的規則一致）。實作方式：沿用 `periods` 的做法，在 item 保存週期歷史 `schedules:[{from:"YYYY-MM",kind:"ALL"|"ODD"|"EVEN"|"CUSTOM",months?:number[]}]`。
  - 判斷某月是否適用時，用「from ≤ 該月」的最後一筆週期。
- 載入沿用 V0.9.67：首次只顯示共用 `Loading`。

## 3. 範圍

- `shared/store-monthly.ts`：
  - 型別加 `schedules`，提供 `scheduleAppliesInMonth(item,month)`；
  - `monthlyApplicable` 加入週期條件；
  - 新增設定時預設 `[{from:當月,kind:"ALL"}]`；舊資料沒有 `schedules` 視為每月。
- `worker/store/monthly-service.ts` 的 `monthlyMaterialization` SQL：產生格子時加入週期條件（用 `json_each` 讀 item 的 `schedules`，取 from ≤ 月份的最後一筆）。
- `worker/http/store-monthly-routes.ts`：
  - `changedList` 驗證並保存週期：kind 必須是四種之一，CUSTOM 的 months 必須是 1–12 不重複整數且至少一個；
  - 週期有變更時 push 一筆 `{from:當月,...}`，同月重複變更覆寫同月那筆。
- `src/runtime/modules/StoreMonthlyTodos.tsx`：
  - 換行版面；
  - 設定項目對話框加「週期」欄：用共用 `SegmentedControl` 選每月／單月／雙月／自訂；選自訂時在同列下方展開 1–12 月勾選（用共用 `CheckField`）。
- `store-monthly.css`：只寫版面所需樣式，沿用既有變數。
- 測試：
  - 週期判斷（每月／單月／雙月／自訂、跨年、從當月生效、舊資料無 `schedules`）；
  - 產生格子遵守週期；
  - 換行分組數依寬度變化。

## 4. 不做

- 不改資料表結構（`items_json` 已是 JSON，**不需要 migration**）。
- 不做項目逾期通知、Email。
- 固定一條：不加多餘的測試與防護（共通規則 §11.4，使用者 2026-10-29）。只做本單要求的功能與實際會發生的錯誤處理；不加重複驗證、不會發生的情境測試。

## 5. 實作指引

- 共用元件（**不要在模組內另寫**）：`SegmentedControl`、`CheckField`／`Field`、`IconButton`＋`Icons`、`Dialog`、`DateInput`（含無日期）、`Loading`、`StoreOperationHistory`。圖示一律從 `src/ui/actions/icons.tsx` 取，**不要寫 `<svg>`**。
- 換行用 `<tbody>` 內多個 `<tr>`：每個月份門市產生 `組數×2` 列，第一列放年月、門市別（rowSpan＝組數×2）與操作欄。
- 寬度計算抽成一個小 hook（`useColumnsPerLine(ref,minWidth,fixedWidth)`），放模組內即可。

## 6. 驗收清單

- [ ] 15 個項目在 1440 寬時分兩組；縮窄視窗時增加組數；手機每組 3 個。
- [ ] 項目名稱橫排、可換行，不再直排。
- [ ] 未辦是淺色外框「登記」，已辦顯示 ✓＋日期，過月未辦淡紅底。
- [ ] 週期四種可設定，只在適用月份出現；週期變更從當月起，過去月份的格子與紀錄仍在。
- [ ] 首次進入只有共用 Loading。
- [ ] 固定項目：新表單按 Enter 跳下一欄、日期欄位四碼年份（`PROJECT_RULES.md` §5，`form-keyboard.test.mjs` 會檢查）。
- [ ] `npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local` 通過。
- [ ] `node --test scripts/*.test.mjs` 通過。
- [ ] VERSION／package.json 版本、TODO 段落已更新。

## 7. 截圖要求

- 桌面 1440、1024 寬，手機 390 寬：月度待辦清單（15 個項目）與設定項目對話框（含一個自訂週期展開）。

## 8. 完成報告（GPT，2026-11-02）

**Git 交付：** [PR #351](https://github.com/simonliu1118-byte/chihyuan-web/pull/351)；分支 `cyweb/wo-0.9.68-monthly-layout`，目標 `main`，基準 `ba5c50cc25bb`。版本 `0.9.68`／BUILD `0`，**未合併、未部署、未建立 Release**。

### 實作與回歸
- [x] `shared/store-monthly.ts`：集中 `scheduleInMonth`、`scheduleAppliesInMonth`、`setMonthlySchedule`，提供每月／單月／雙月／自訂及從當月起生效的歷史；舊資料無 `schedules` 預設每月。
- [x] `worker/store/monthly-service.ts`：原 `monthlyMaterialization` 以 JSON1 讀取生效週期，不另外建立第二套生成路徑；排除不適用月份辦理格，既有歷史格不刪除。
- [x] `worker/http/store-monthly-routes.ts`：設定 `schedule` 驗證（CUSTOM 月份 1–12 且不可重複、至少一月）、當月更新同月歷史而非重複新增，保留原版本守門、Audit、requestKey。
- [x] `StoreMonthlyTodos.tsx`／`store-monthly.css`：每組「名稱列＋辦理格列」、年月與門市 `rowSpan`、粗組分隔；容器用 `ResizeObserver` 計算 96px 最小格，手機每組 3 項。首次載入仍用共用 `Loading`，日期、無日期、歷程、操作按鈕沿用現有元件。
- [x] 項目設定新增「週期」欄，沿用 `SegmentedControl`、`CheckField`、`Field`、`EntryTable`，自訂時展開 1–12 月。
- [x] 不新增 migration：沿用 `store_monthly_settings.items_json`；不做通知及 Email。
- [x] 更新 `VERSION`、`package.json`、`TODO.md`、`CHANGELOG.md` 及 Claude Handoff。
- [x] 主要自動回歸：週期判斷、跨年、歷史保留、舊資料、D1 產生格、錯誤月份、Responsive 組數、設定送出、原日期修正與操作紀錄。
- [ ] 1440／1024／390 的真實瀏覽器截圖與不同裝置操作：**未執行**，需 Claude 審查／實機驗收。寬度分組數與表格 DOM 已由自動測試驗證，不能替代視覺驗收。

### 遠端 CI 實際結果
- [x] [Runtime Check #41415275951](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41415275951)：`build`、`browser-typecheck`、`worker-typecheck`、`source-contracts` 全部成功；本機 D1 runtime acceptance 成功；**Node 564／564 通過、0 失敗**；Vite build 成功。
- [x] [Governance Check #41415275623](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41415275623)：成功。
- [x] [CY Web Deploy PR 驗證 #41415275634](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41415275634)：`validate-deployment-contract` 成功；**`deploy-development` 已 skipped，未部署**。
- 首輪 Runtime #41414923761 曾有 2 項 UI 文字／欄數測試與新畫面不符（562／564），已在同分支修正，後續上述完整 CI 564／564 成功。非產品業務邏輯失敗。

### 差異／限制／交接
- 無超出工單的功能與資料結構變更；依規則優先共用元件，未新增版本殼、Observer 修補鏈或平行業務路徑。
- 真實登入資料、人工桌面／手機視覺、觸控、日期 popover 位置仍須 Claude／使用者驗證；沒有宣稱已通過。
- 請 Claude 於本工單 §9 記錄最終審查，複審通過且依使用者授權後再合併部署；若需返修，回給 GPT。
- 詳細修改檔案、風險與檢查重點：[Claude Handoff](../../handoff/CYWEB-WO-0.9.68-GPT-20261102.md)。

## 9. 審查紀錄（審查者填）

## 9. 審查紀錄（審查者填）

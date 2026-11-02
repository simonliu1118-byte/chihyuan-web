# WO-0.9.68 月度待辦：換行版面與項目週期

- 狀態：待審查（GPT 已提交候選，尚未合併部署）
- 分支：cyweb/wo-0.9.68-monthly-layout　PR：#（建立 PR 後回填）

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

## 8. 完成報告（GPT）
- 實作：以 shared/store-monthly.ts 的 scheduleInMonth／scheduleAppliesInMonth 作正式週期判斷，Worker settings 保存逐月 schedules，D1 monthlyMaterialization 以 JSON1 查適用月份；舊項目無 schedules 視為每月。無 migration。
- UI：共用 SegmentedControl、CheckField、Field、EntryTable、DateInput、IconButton、Loading、Dialog；月度清單按容器可用寬度最小 96px 分組（手機 3 項），年月／門市跨列及粗分隔，避免另一套日期或狀態邏輯。
- 測試：新增週期、歷史、D1 辦理格、錯誤月份、分組與設定交互回歸。遠端 CI 結果待 PR 產生後更新，不得把未執行項目宣稱通過。
- 差異：沒有自行擴大工單範圍；版本 0.9.68，BUILD=0。
- 截圖：1440／1024／390 及設定自訂週期畫面尚待真實瀏覽器驗收；尚未提供截圖，不視為通過。
- 權限：GPT 僅建立獨立分支／PR，不合併、不部署、不發 Release；Claude 於 §9 審查。
- 交接：docs/handoff/CYWEB-WO-0.9.68-GPT-20261102.md

## 9. 審查紀錄（審查者填）

## 9. 審查紀錄（審查者填）

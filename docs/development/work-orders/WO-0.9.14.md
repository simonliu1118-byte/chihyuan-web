# WO-0.9.14 客戶編號呈現、相關紀錄視窗、報價多品項輸入、品號顯示統一

- 狀態：**已完成・Claude 審查通過・PR #212 已合併**（截至 2026-10-23；歷史交付狀態見 §8、§9）
- 分支：`cyweb/customer-quotes-0.9.14`　PR：[#212](https://github.com/simonliu1118-byte/chihyuan-web/pull/212)（已合併）
- 閱讀提示：本單 §0 的「不合併、不部署」、§8 的「待審查／尚未部署」是 GPT **交付當時**的執行界線與證據，不是目前 PR 狀態；§8 完成報告及 §9 Claude 審查紀錄原文保留供交接。
- 依據：`PROJECT_RULES.md` §9；BD-020／BD-021／BD-022（報價＝一個客戶＋一個商品＋數量級距，本單**不改**）
- 視覺規範：`docs/architecture/CY_WEB_VISUAL_GUIDE.md`

## 0. 執行限制（必讀）

- **不得新增或修改 `.github/workflows/*`**，不得新增工作單未列出的檔案（示意圖、mock HTML、SVG、另外的測試 runner 等）。截圖由審查者以實際畫面擷取，執行者只需在完成報告說明怎麼操作驗證。
- 不合併、不部署。

## 1. 背景（使用者原話）

- 「我認為ERP的客戶編號是很重要的資訊。左邊清單順序交換，上面是小字AC0001，下面是稍大字大大中醫，字體的部分不用更改跟目前相同就好」
- 「右邊明細AC0001前面不需要那個ERP，我們只有唯一客戶編號。我想要直接呈現成 AC0001 大大中醫 在這個客戶的標題，然後可以用括號稍小文字顯示客戶全名(大大中醫診所)」
- 「新增紀錄的部分，按新增進來就不應該還有右上角那個新增拜訪了。如果是從全部的地方要按新增，新增按鈕我想要靠左然後紀錄一樣要做搜尋列」
- 「報價紀錄商品應該要邊輸入邊選而不是用下拉式選單，之後有幾千項商品下拉不可能用」
- 「單筆報價紀錄應該要支援多筆商品，看能不能用清單方式呈現」→ 定案：**一次輸入多項、每項各存一筆紀錄**（見 §2-6）。
- 「所有呈現品號-品名的地方都以 A00001 志遠拔罐杯#1 這樣的方式呈現就好，不要．」

## 2. 已定案事項（不得更改）

1. **客戶清單列**：第一行小字顯示客戶編號（沒有編號顯示「未設定編號」），第二行顯示客戶名稱；**字級、字重沿用目前兩行的樣式**（只交換內容順序）。地區等其他附加資訊不放在這兩行。
2. **客戶明細標題**：`AC0001 大大中醫`，後面接較小字的全名 `（大大中醫診所）`；沒有編號時只顯示名稱；沒有全名時不顯示括號。原副標題（全名 · ERP 編號）移除。
3. **全站不再出現「ERP 客戶編號」「ERP 編號」字樣**，一律稱「**客戶編號**」（清單、明細、修改表單、提示文字、確認訊息、`changeReason` 文字）。明細欄位裡的「ERP 客戶編號」那一格移除（已在標題）。
4. **以「＋ 新增」開啟的專屬視窗**：直接顯示新增表單，視窗內**不再出現**「＋ 新增拜訪」「＋ 新增報價」等按鈕；儲存或取消後關閉視窗。
5. **以「查看全部」開啟的專屬視窗**：最上方一列，**左邊「＋ 新增」**、右邊搜尋框（拜訪：比對內容、拜訪對象、聯絡人；報價：比對品號、品名；常用商品：比對品號、品名、自訂名稱）。在此按「＋ 新增」會在同一視窗顯示新增表單（清單在下方）。
6. **報價多品項輸入**（BD-020／021 不變）：
   - 新增表單：上方共用欄位「日期」「備註」；下方是品項清單，每列「商品（邊打邊選）｜數量｜單位｜單價｜（移除）」，可「＋ 加一列」。
   - 儲存時依商品分組：**每個商品存成一筆報價紀錄**；同一商品出現多列＝該筆紀錄的多個數量級距。
   - 全部品項在**同一個 D1 batch** 寫入（全部成功或全部失敗），不可逐筆呼叫造成部分成功。
   - 顯示：依日期分組（新到舊），每組標題「日期　建立者」，下方逐列「品號 品名　數量 單位　$單價」；同一紀錄多個級距時逐行列出。
   - 「修正紀錄」（BD-022）維持**針對單一紀錄**修正，不做整組修正。
7. **商品欄位改為邊打邊選**：報價品項與常用商品「加入」都改用共用 `EntityPicker`（輸入品號／品名搜尋），不再用下拉選單。
8. **品號＋品名顯示一律為 `A00001 志遠拔罐杯#1`**（品號、一個半形空格、品名），全站不再用「·」連接品號與品名。品號後如有規格等其他資訊，用全形空白或另一行，不用「·」。

## 3. 範圍

1. 客戶清單列與明細標題、全站「客戶編號」用詞。
2. 拜訪／報價／常用商品專屬視窗：新增模式與查看全部模式、搜尋列。
3. 報價多品項輸入、批次寫入 API、依日期分組顯示（含數量級距）。
4. 報價與常用商品改用 `EntityPicker`。
5. 全站品號＋品名顯示統一。
6. 文件、版本、TODO。

## 4. 不做

- 報價資料結構、BD-020／021／022 語意、修正流程的變更。
- 報價單總額、報價單號、列印或匯出報價單（正式報價單在 SMART ERP）。
- 其他模組的版面調整（商品頁改版另案討論中，不在本單）。
- 新增 CI workflow、示意圖檔、mock 頁面。

## 5. 實作指引

### 5.1 客戶編號呈現
- `src/runtime/modules/CustomerOperationalPage.tsx`：
  - 清單列（目前約 795 行）改為兩行：`<span>{customerNo ?? "未設定編號"}</span>` 在上、`<strong>{shortName}</strong>` 在下；沿用既有 `cy-op-list-row` 內 `strong`／`span` 的樣式，只交換 DOM 順序（可用 CSS `order` 或直接調換元素，並確認螢幕閱讀器順序合理）。
  - 明細標題（目前約 853 行）：`<h2>{customerNo ? `${customerNo} ` : ""}{shortName}{fullName ? <small className="cy-record-title-note">（{fullName}）</small> : null}</h2>`；刪除原副標題那行，保留「最後修改」那行。
  - 移除明細欄位中的「ERP 客戶編號」格（約 875 行）。
  - 修改表單欄位標籤「ERP 客戶編號」→「客戶編號」；提示「ERP 客戶編號可先留空…」→「客戶編號可先留空，之後在「修改」補填。」；`changeReason` 文字改「客戶編號更正」／「客戶編號建檔後回填」。
- 全站搜尋 `ERP 客戶編號`、`ERP 編號`、`尚無 ERP`（`grep -rn "ERP 客戶編號\|ERP 編號\|尚無 ERP" src worker shared`）逐一改為「客戶編號」用詞；**ERP 查詢頁本身描述 SMART ERP 欄位的文字不在此限**（例如 ERP 單據的「客戶代號」保持原樣）。
- CSS：`.cy-record-title-note { margin-left: 4px; color: var(--cy-text-muted); font-size: var(--cy-fs-md); font-weight: 400; }`（放在 `customer-operational.css`，多行寫法、只用 tokens）。

### 5.2 專屬視窗的兩種模式
- 現有 `relatedView` 狀態擴充為 `{ view: "visits" | "quotes" | "frequent"; mode: "create" | "browse" }`。
  - `create`：只渲染新增表單（不渲染清單、不渲染面板內的「＋ 新增…」按鈕）；儲存成功或取消後關閉視窗。
  - `browse`：最上方 `cy-related-toolbar`：左「＋ 新增」（`cy-op-button primary compact`）、右搜尋框（`cy-op-input`，`type="search"`）；按「＋ 新增」在清單上方顯示新增表單，儲存後回到清單並保留搜尋。
- 把 `VisitsPanel`／`QuotesPanel`／`FrequentPanel` 內部的「＋ 新增…」按鈕移除（改由上面的工具列控制），面板改接收 `filter` 文字只負責過濾顯示。
- 搜尋在前端過濾已載入的資料即可（不新增 API），比對不分大小寫。

### 5.3 報價多品項輸入
- 後端：新增 `POST /api/business/customers/:id/quotes/batch`，body `{ quoteDate, note?, lines: [{ itemId, quantity, unit, unitPrice, note? }] }`：
  - 依 `itemId` 分組，每組建立一筆 `customer_item_quotes` 與其價格級距（沿用既有單筆建立的驗證、快照欄位與稽核寫法），**全部放在同一個 `db.batch`**。
  - 每筆寫一個 `customer_item_quote.created` 稽核事件（與單筆建立相同 action），metadata 含 `customerId`，讓 WO-0.9.13 的客戶修改紀錄能歸入。
  - 回傳建立的紀錄列表。保留原單筆 API（修正流程仍使用）。
  - 在 `worker/acceptance` 對應的客戶相關驗收中加：兩個商品＋同商品兩列 → 建出 2 筆、其中一筆 2 個級距；任一列無效時整批不寫入。
- 報價清單 API 回傳每筆的 `priceBreaks`（目前 summary 沒有），供依日期分組列出數量與單價；`shared/customer-related.ts` 同步型別。
- 前端 `QuotesPanel`：
  - 新增表單＝日期、備註（共用）＋品項列表（`EntityPicker` 商品、數量、單位〔選商品後預設為基本單位，可改〕、單價、移除鈕）＋「＋ 加一列」。至少一列才能儲存。
  - 清單：依 `quoteDate` 分組（新到舊），組標題 `YYYY/MM/DD　建立者`；組內逐筆 `A00001 志遠拔罐杯#1　100 個　$12`，多級距逐行；每筆右側保留「修正紀錄」。
  - 客戶頁「報價紀錄」卡片的摘要行沿用 `YYYY/MM/DD A00001 志遠拔罐杯#1`。

### 5.4 EntityPicker
- 報價品項與常用商品「加入」改用 `src/ui/pickers/EntityPicker`（可參考 `OutsourcingMasterData.tsx` 用法），搜尋呼叫既有 `searchCustomerItemOptions(q)`（`/api/business/customers/item-options?q=`）。
- 頁面初次載入不再一次抓 100 筆商品做下拉；`itemOptions` 若只為下拉而載入就移除。

### 5.5 品號＋品名顯示
- 在 `src/ui/foundation/format.ts` 新增 `formatItem(itemNo, name)` → `` `${itemNo} ${name}` ``（任一為空時只顯示另一個）。
- 以 `grep -rnE "itemNo[A-Za-z]*\}? · |itemNo\} · " src --include=*.tsx` 找出所有「品號 · 品名」（目前在客戶、委外、委外主檔、工單、商品、瑕疵頁），全部改用 `formatItem`。
- 為 `formatItem` 在 `scripts/format-date.test.mjs` 旁新增或擴充測試（可放同檔，檔名不變）。

### 5.6 文件、版本、TODO
- `VERSION`／`package.json` → `0.9.14`；`BUILD` 維持 `0`。
- `TODO.md` 最上方新增 0.9.14 段落並連結本單；在 0.9.13 段落補 PR #208 的合併與部署紀錄（審查者會提供 run 編號，若執行時已存在就照 main 上的紀錄）。
- `CY_WEB_VISUAL_GUIDE.md`：客戶編號呈現、品號顯示規則、專屬視窗的「新增模式／查看全部模式」。
- `API_CONTRACT.md`：新增 `POST /api/business/customers/:id/quotes/batch` 與報價清單含 `priceBreaks`。

## 6. 驗收清單

- [ ] 客戶清單：上行小字客戶編號（無則「未設定編號」）、下行客戶名稱，字級字重與目前相同。
- [ ] 客戶明細標題為 `AC0001 大大中醫（大大中醫診所）`（全名較小字）；無全名不顯示括號；明細不再有「ERP 客戶編號」格。
- [ ] `grep -rn "ERP 客戶編號\|ERP 編號\|尚無 ERP" src` 沒有結果。
- [ ] 卡片「＋ 新增」開的視窗只有新增表單、沒有其他「新增」按鈕；儲存／取消後關閉。
- [ ] 「查看全部」視窗最上方左邊「＋ 新增」、右邊搜尋框；三種紀錄的搜尋都有效。
- [ ] 報價新增可輸入多列；兩個不同商品＋同商品兩列 → 存成 2 筆，其中一筆有 2 個級距；任一列錯誤時一筆都不寫入（驗收測試涵蓋）。
- [ ] 報價清單依日期分組顯示數量、單位、單價；修正紀錄仍針對單筆。
- [ ] 報價與常用商品的商品欄位都是邊打邊選，沒有商品下拉選單。
- [ ] 畫面上品號與品名之間不再有「·」，一律 `A00001 志遠拔罐杯#1`；`formatItem` 測試通過。
- [ ] `npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local` 全部通過。
- [ ] `node --test scripts/*.test.mjs` 全部通過（需先 `git clone --depth 1 https://github.com/simonliu1118-byte/cyapps .tmp/canonical-cyapps`；無法取得時在完成報告寫明，**不得**另寫 workflow 代替）。
- [ ] 沒有新增或修改 `.github/workflows/*`，沒有範圍外檔案。
- [ ] VERSION／package.json 為 0.9.14；TODO、視覺規範、API 合約已更新。

## 7. 截圖要求

執行者不需提交截圖；在完成報告列出自己操作驗證的步驟。審查者會以實際畫面擷取：客戶清單與明細標題、新增模式視窗、查看全部視窗（含搜尋）、報價多品項新增與分組清單、手機 390 寬。

## 8. 完成報告（執行者填）

- 執行基準：從 PR #208 已合併後的 `main` `e2884e86d9e7de5750f1f4b0ffd1bdebb2558443` 建立 `cyweb/customer-quotes-0.9.14`。
- 交付：**[PR #212](https://github.com/simonliu1118-byte/chihyuan-web/pull/212)**（待審查；**未合併、未部署**）。只變更本工作單涵蓋之既有檔案；`BUILD` 維持 `0`。

### 8.1 驗收清單逐項結果

| §6 項目 | 執行者結果／證據 |
|---|---|
| 客戶清單編號上、名稱下 | **已實作，待 UI 截圖**：先渲染沿用小字的編號 `span`（空值為「未設定編號」），再渲染原本的名稱 `strong`；地區不再混入兩行。 |
| 客戶明細標題與移除重複欄位 | **已實作，待 UI 截圖**：`客戶編號 空格 簡稱（全名）`；全名為次要小字、無值不顯示；刪除重複客戶編號資訊格，保留最後修改者／時間。 |
| 全站「ERP 客戶編號／ERP 編號／尚無 ERP」用語 | **已修正並以 GitHub 原始碼檢視**：客戶及銷售工單業務介面、客戶相關 Worker/shared 檔案改稱「客戶編號」；ERP 來源欄位仍保留原有業務語意。因本執行環境無法 clone，未能直接執行工作單指定的完整 `grep -rn`，請審查者覆核。 |
| 「＋ 新增」專屬視窗 | **已實作，待實機**：採 `create` 模式，只顯示該紀錄新增表單；成功儲存或取消後關閉，不出現第二個新增按鈕。 |
| 「查看全部」工具列與三種搜尋 | **已實作，待實機**：`browse` 模式上方左「＋ 新增」、右搜尋，按新增在清單上方顯示表單；拜訪比對內容、對象、聯絡人，報價比對品號／品名，常用商品比對品號／品名／自由名稱，不區分大小寫。 |
| 報價多列、依商品分組、D1 原子性 | **通過 CI D1 驗收**：2 商品＋其中 1 商品兩級距→建立 2 筆，第一筆 2 級距；無效列回 `422` 且資料庫快照未變。單筆 quote、級距及每筆 `created` 稽核含 `customerId` 在一次 `db.batch()` 內。 |
| 報價按日期／建立者分組、逐級距、單筆修正 | **已實作，待 UI 實機**：清單依日期由新至舊，標題為日期與建立者；每個級距逐列顯示數量、單位、價格。每次修正仍針對單一 quote ID（沿用既有 revision gate）。 |
| 報價與常用商品改用 `EntityPicker` | **已實作，待實機**：均以品號／品名即時搜尋既有 `/customers/item-options?q=`；已移除初載 100 商品選單及兩處商品下拉。 |
| 品號＋品名一個空格；`formatItem` 測試 | **已實作，待完整單元測試**：建立共用 `formatItem`，並修改客戶、商品、瑕疵、銷售工單、委外及委外主檔中識別格式；`scripts/format-date.test.mjs` 新增 `formatItem` 案例。完整 `node --test scripts/*.test.mjs` 尚未執行，原因見 §8.2。 |
| `npm run typecheck`／`npm run validate:source`／`npm run build`／`npm run validate:d1:local` | **對應 GitHub CI 工作全部通過**：Browser TS、Worker TS、來源契約、Local D1 runtime acceptance、Vite build；詳 §8.2。上述四條命令並未由執行者在本機逐一直接執行。 |
| `node --test scripts/*.test.mjs`，需 canonical CYapps checkout | **未執行**：本執行環境對 github.com DNS 無法解析（`git ls-remote https://github.com/simonliu1118-byte/cyapps HEAD` → `Could not resolve host: github.com`），無法建立指定 `.tmp/canonical-cyapps`；未新增 workflow 作替代。請審查者在可 clone 的工作機執行完整命令。 |
| 不新增 workflow／範圍外檔案 | **通過 PR changed-files 清單檢查**：修改均落在客戶相關前後端、既有相關模組品號顯示、既有驗收與格式測試、既有合約／TODO／VERSION／package.json 及本工作單；未修改／新增 `.github/workflows/*`，未新增其他程式或 mock 圖檔。 |
| VERSION、package.json、TODO、視覺與 API 文件 | **已完成**：VERSION／package.json `0.9.14`、BUILD `0`；TODO 加本單並紀錄 PR #208 合併 `6c490196` 與正式部署 [run 39183836960](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39183836960)（此為**先前版本**的紀錄，本次未部署）；視覺規範與 batch API 合約已更新。 |

### 8.2 驗證指令輸出摘要

- [Runtime Check #39207160188](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39207160188)：**success**（對應提交 `23304d4279a604c6e8a84f0f98da15881b8e8d48`），`browser-typecheck`、`worker-typecheck`、`source-contracts`、`build` 均通過；`build` 工作中 `Local D1 runtime acceptance` 與 `Vite build` 都為 success，包含新增 `BATCH_QUOTE_GROUPED_TIERS`／`BATCH_QUOTE_INDEPENDENT_AUDIT`／`BATCH_QUOTE_LIST_TIERS`／`BATCH_QUOTE_INVALID_ATOMIC_ROLLBACK` 驗收。
- [Governance Check #39207160192](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39207160192)：**success**。
- [CY Web Deploy PR 檢查 #39207160049](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39207160049)：`validate-deployment-contract` **success**，`deploy-development` **skipped**；僅為 PR 檢查，**沒有正式部署**。
- CI 的 `source-contracts` 執行各項 `python scripts/validate_*.py`（結果皆 `PASS`），及指定 ERP 子集 `node --test`（`# fail 0`）。這**不等於**執行完整 `node --test scripts/*.test.mjs`。
- 執行環境限制：`git ls-remote https://github.com/simonliu1118-byte/cyapps HEAD` → `fatal: unable to access ... Could not resolve host: github.com`。GitHub 原始碼操作及 CI 檢查透過已授權 GitHub 連接執行，未藉新增 workflow 補救。

### 8.3 操作驗證步驟（交審查者實機與截圖）

1. 在可登入的 CY Web 開啟「客戶」；桌面寬 1440、手機寬 390 各拍清單：編號在上、名稱在下；選擇有編號／全名及無編號／全名客戶，檢查標題和最後修改者。
2. 客戶相關卡片的「＋ 新增拜訪／報價／常用商品」各按一次：確認直接只有新增表單；取消返回客戶頁，不應有額外「＋ 新增…」。
3. 各卡片按「查看全部」：工具列左新增右搜尋，分別以內容／對象、品號／品名、自訂品名測試大小寫、零結果與新增後仍保持搜尋內容。
4. 報價新增，選商品 A（兩列不同數量與單價）、商品 B（一列），送出後核對資料為兩筆報價、A 具兩個級距；清單按日期分組逐級距顯示；針對其中一筆執行「修正紀錄」確認只改該筆。
5. 在報價與常用商品輸入欄搜尋大量品號／品名，驗證非下拉、選取後保留基本單位並可改、刪除列；檢查其他模組的品號與品名僅以一個半形空格連接。
6. 將視窗切換深淺主題並檢查 390px 檢視，依 §7 擷取真實畫面；資料異動僅在經核准的測試資料或隔離驗收環境進行。

### 8.4 與工作單不同之處、限制及交審事項

- **沒有修改定案業務語意、沒有新增資料表或 migration。** 舊單筆建立與 BD-022 單筆修正仍保留。
- 同一 batch 的 quote IDs 由資料庫目前最大 ID 預配置後一次寫入；若有競爭寫入碰撞，資料庫主鍵約束會使 batch 失敗／整批回滾，不會形成部分成功。
- 工作單指定的完整本機 `grep`／`node --test scripts/*.test.mjs` 與登入後實機截圖未執行，原因分別為原始碼只可透過 GitHub 連接存取、環境無法 clone canonical CYapps、截圖明訂由審查者執行。這些**仍屬待審查驗收項目**，不可視為全部通過。
- PR 與本分支僅供審查，沒有合併或正式部署；後續合併、部署決策依 §9 交審查者。

## 9. 審查紀錄（審查者填）

- 日期：2026-10-19　結論：**通過**（審查者直接修正下列兩項小問題後合併）。
- 審查者在本機執行：`npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local` 全部通過；`node --test scripts/*.test.mjs` 143/143 通過（含 `formatItem`）。`grep -rn "ERP 客戶編號\|ERP 編號\|尚無 ERP" src worker shared` 無結果。
- 實際畫面（桌面 1440、手機 390，模擬 API）：清單編號在上、名稱在下；標題 `AC0001 大大中醫（大大中醫診所）`；「＋ 新增」只開表單；「查看全部」左新增右搜尋、搜尋有效；報價依日期分組並逐級距顯示；商品邊打邊選、可多列。
- 審查者直接修正：
  1. 明細標題下仍留著舊副標題「全名 · 客戶編號」（§2-2 要求移除），已刪除。
  2. 報價品項列與常用商品表單的 `label` 樣式套到 `EntityPicker` 內部，使「商品＊」斷成兩行、選擇框比其他欄位低；改為只套用直接子層 `> label`。
- 意見（不阻擋）：
  - 批次報價先讀 `MAX(id)` 再在 batch 內寫入指定 ID；兩人同時新增報價時後者會因主鍵衝突整批失敗（不會部分寫入），重送即可。目前使用量下可接受。
  - 「查看全部」搜尋框內按 Esc 會先清空搜尋文字，第二次才關閉視窗（瀏覽器原生行為），可接受。

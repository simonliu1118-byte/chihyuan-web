# WO-0.9.15 商品頁改版：精簡基本資料、單層換算、瑕疵與報價卡片

- 狀態：已完成（審查通過 2026-10-19）
- 分支：`cyweb/item-page-0.9.15`　PR：[ #214 ](https://github.com/simonliu1118-byte/chihyuan-web/pull/214)（未合併／未部署）
- 依據：`PROJECT_RULES.md` §9；**BD-058**（單位換算單層、一律換成基準單位）；BD-020／021／022（報價語意不變）；BD-043（模組權限）
- 視覺規範：`docs/architecture/CY_WEB_VISUAL_GUIDE.md`

## 0. 執行限制（必讀）

- **不得新增或修改 `.github/workflows/*`**，不得新增工作單未列出的檔案（示意圖、mock HTML、SVG、另外的測試 runner 等）。截圖由審查者以實際畫面擷取，執行者只需在完成報告說明怎麼操作驗證。
- 不合併、不部署。

## 1. 背景（使用者原話）

- 「進到商品頁面的重作，比方說單位換算就不需要自己佔一個大區塊等等」
- 「瑕疵一定是商品…左邊的瑕疵模組是可以快速填寫瑕疵紀錄單和處理瑕疵事件，商品的瑕疵區塊是點到商品可以知道商品發生過什麼瑕疵事件，他們應該是共用同樣的資料、只是呈現方式和位置不同」
- 瑕疵卡點紀錄：「跳過去」（到瑕疵模組處理）。
- 瑕疵新增：「商品那邊也可以按新增開一個視窗做瑕疵新增，但這個小視窗要跟瑕疵那邊直接按新增是連動的，以避免其中一邊修了什麼另一邊沒改到」。
- 報價新增：「報價也一樣」（同瑕疵，在商品頁開視窗新增，與客戶頁的報價新增表單連動）。
- 「如果使用者沒有瑕疵或客戶模組權限，就不顯示瑕疵或報價卡」。
- 已作廢瑕疵：照建議，預設不算，「查看全部」裡勾選才顯示。
- 報價卡：「可以先做出來，但因為客戶很多，不可以做成太複雜」；「如果有多個客戶同價格可以彙整在一起」；「報價那邊還是可以弄個新增，直接接到客戶-報價那邊去，自動帶入這個品項」。
- 換算：「換算一般是一層，一律用基本單位去算，比方說一盒=30包，一箱=180包」。

## 2. 已定案事項（不得更改）

1. **明細版面**（由上而下）：
   - 標題：`A00001 志遠拔罐杯#1`（`formatItem`），標題下一行小字：規格、分類、狀態（已停用用既有停用 chip）。右側按鈕維持「修改／更改品號／停用」。
   - 一張「基本資料」卡，三列：
     - `基準單位 包 · 1 盒 = 30 包 · 1 箱 = 180 包`（沒有換算時只顯示基準單位）。
     - `成本 $35（未稅）　門市價 $80　診所價 $65`（成本與稅別合併成一格）。
     - `備註 …`（沒有備註不顯示這列）。
     - 有歷史品號時最下方一行小字：`曾用品號：A0001-OLD（YYYY/MM/DD 更改）`，多個用「、」分隔；沒有就不顯示。
   - 取消原本獨立的「單位換算」「歷史品號」兩個區塊。
   - 下方兩張卡片：**瑕疵紀錄**、**報價紀錄**（樣式與客戶頁 `RelatedCard` 一致；桌面並排，手機上下排）。
2. **單位換算（BD-058）**：每一列都是 `1 [來源單位] = [數量] 基準單位`，目標單位固定是基準單位、不可選。同一來源單位只能出現一次。舊資料若有接成一串的換算，畫面一律換算成基準單位顯示，下次存檔以新格式寫回。
3. **修改表單的換算**：不再用大的 `cy-form-block`。在「基準單位」欄位下方，每列一行精簡輸入 `1 [單位輸入] = [數量輸入] 包 [✕]`，最後一個「＋ 換算」文字按鈕。
4. **瑕疵紀錄卡**（權限：使用者有 `DEFECTS` 模組才顯示；沒有就整張卡不出現，也不呼叫 API）：
   - 卡片標題「瑕疵紀錄」＋總筆數；下方一行各狀態筆數（`建立 1 · 處理中 2 · 已解決 5`，0 筆的狀態不顯示）。
   - 列出最近 3 筆：`YYYY/MM/DD　客戶名稱　描述（單行截斷）　[狀態 chip]`。
   - 預設**不含已作廢**（總數與狀態筆數也不含）。
   - 「查看全部」：對話框，上方左「＋ 新增」、右搜尋框，搜尋框旁一個「顯示已作廢」勾選；已作廢的列以灰色與「已作廢」chip 區分。
   - 點任一筆 → 跳到瑕疵模組並打開那一筆（處理動作只在瑕疵模組做）。
   - 「＋ 新增」→ 在商品頁開啟對話框填寫瑕疵，**商品已帶入且不可改**；存檔後關閉對話框並重新整理瑕疵卡。
   - 對話框裡的表單與瑕疵模組按「＋ 新增」的表單是**同一個共用元件**（同欄位、同驗證、同 API），只改一處兩邊都生效；不可複製一份表單。
5. **報價紀錄卡**（權限：使用者有 `CUSTOMERS` 模組才顯示；沒有就整張卡不出現）：
   - 每個客戶只取他對此商品**最新一次**報價（`quote_date` 最新；同日取 `id` 最大）。
   - 把「單位＋整組級距（數量、單價）完全相同」的客戶彙整成一組。單位不同分開列，不換算比價。
   - 卡片標題「報價紀錄」＋`N 位客戶 · M 種價格`；列出最近報價日期最新的 3 組，每列 `盒　1+ $80 · 100+ $70　12 位客戶　最近 YYYY/MM/DD`。
   - 「查看全部」：對話框，上方左「＋ 新增」、右客戶搜尋框（比對客戶編號、名稱）；每組可展開列出客戶 `AC0001 大大中醫　YYYY/MM/DD`；搜尋時只留下含符合客戶的組，並自動展開。點客戶 → 跳到該客戶頁。
   - 「＋ 新增」→ 在商品頁開啟對話框：最上方一個「客戶」欄位（`EntityPicker`，搜尋客戶編號／名稱，必填），下方是報價新增表單，**第一列商品已帶入此商品**、單位預設基準單位；可再加其他商品列（多品項規則同 WO-0.9.14）。存檔後關閉對話框並重新整理報價卡。
   - 對話框裡的報價表單與客戶頁報價「新增模式」是**同一個共用元件**（同欄位、同驗證、同批次 API），只改一處兩邊都生效；不可複製一份表單。
6. **商品清單列**：比照客戶頁，上行小字品號、下行品名；規格放在品名後面，用全形空白分隔（不用「·」）。分類／已停用 chip 維持。
7. **跨模組跳轉**用 hash 帶參數（可重新整理、可分享）：
   - `#defects?id=<瑕疵 id>`：開啟該筆。
   - `#customers?id=<客戶 id>`：開啟該客戶。
   - 跳轉要經過既有的 `useNavigationGuard`（表單有未儲存內容時先確認）。

## 3. 範圍

1. 商品明細與清單列改版、修改表單換算精簡（§2-1、2-3、2-6）。
2. BD-058 換算驗證（後端）與顯示換算成基準單位（前端）。
3. 瑕疵紀錄卡與「查看全部」對話框。
4. 報價彙整 API、報價紀錄卡與「查看全部」對話框。
5. hash 參數跳轉（瑕疵、客戶兩個模組的進入點）。
6. 文件、版本、TODO。

## 4. 不做

- 在商品頁直接處理瑕疵（開始處理、結案、作廢）或修正報價。
- 報價不同單位之間的換算比價、價格趨勢圖、匯出。
- 資料庫 migration（BD-058 不需要；報價彙整用既有 `idx_customer_item_quotes_item_date`）。
- 其他模組版面調整、新增 CI workflow、示意圖檔、mock 頁面。

## 5. 實作指引

### 5.1 單位換算（BD-058）
- `worker/item/item-validation.ts`：每列 `toUnit` 必須等於 `baseUnit`，否則該列 `conversions[i].toUnit` 錯誤「換算單位必須換成基準單位」；同一 `fromUnit` 重複時錯誤「此單位已有換算」。既有「來源不可等於基準單位」的檢查保留。
- 前端修改表單：每列只有 `fromUnit`、`quantity` 兩個輸入；送出時 `toUnit` 一律填 `baseUnit`。改了基準單位時，已輸入的列目標自動跟著換（不需另外確認）。
- 載入舊資料時（明細與修改表單）用 `unitFactorToBase`（`worker/item/unit-conversion.ts`；前端若無法直接引用，把純函式搬到 `shared/` 由兩邊共用，**不要複製一份**）把每個非基準單位換算成基準單位數量。
- `worker/acceptance` 的商品驗收加：`toUnit` 不是基準單位會被拒絕；重複來源單位會被拒絕。

### 5.2 商品明細與清單
- `src/runtime/modules/ItemOperationalPage.tsx`：依 §2-1 重排明細；刪除「單位換算」「歷史品號」兩個 `cy-item-section`，改為基本資料卡內的列。
- 修改表單換算改成 §2-3 的精簡列；樣式寫在 `item-operational.css`（多行寫法、只用 tokens），刪掉不再使用的舊樣式。
- 清單列依 §2-6。
- 價格顯示沿用現有金額格式函式；日期一律 `formatDate`。

### 5.3 瑕疵紀錄卡
- 資料：既有 `GET /api/business/defects?itemId=<id>&limit=3`（回傳 `statusCounts`）；「查看全部」用 `limit=100`＋`cursor` 分頁（捲到底或「載入更多」）、`q` 搜尋、`includeInvalid=true` 勾選。**不新增 API。**
- 是否顯示依 `session.moduleAccess.allowedModules` 是否含 `DEFECTS`（把這個判斷由 `App.tsx` 傳進頁面，或提供共用 hook；不要在頁面內另外打 API 試探）。
- 瑕疵表單抽成共用元件 `src/runtime/modules/defect/DefectForm.tsx`（現在在 `DefectOperationalPage.tsx` 內的新增／修改表單、欄位、驗證、送出 API 一起搬過去），props 例如 `{ mode: "create" | "edit"; initial?; fixedItem?: { id, itemNo, name }; onSaved(detail); onCancel() }`。
  - 瑕疵模組的新增與修改改用這個元件，行為不變。
  - 商品頁對話框用 `mode="create"`＋`fixedItem`：商品欄位顯示為唯讀文字、送出時帶入 `itemId`。
  - 表單需要的選項資料（客戶、負責人）沿用既有 `/api/business/defects/lookups`，由元件自己載入，不要在商品頁另寫。
- 卡片與對話框重用客戶頁的 `RelatedCard` 與相關 Dialog 結構：若目前只在 `CustomerOperationalPage.tsx` 內部，移到 `src/ui/` 下的共用元件（例如 `src/ui/records/RelatedCard.tsx`），客戶頁改為引用，行為不變。

### 5.4 報價彙整 API 與卡片
- 新增 `GET /api/business/customers/item-quote-summary?itemId=<id>`（放在客戶路由下，以 `CUSTOMERS` 模組把關）。回傳：
  ```ts
  { customerCount: number; groups: Array<{
      unit: string;
      breaks: Array<{ quantity: number; unitPrice: number }>;   // 依 quantity 由小到大
      latestQuoteDate: string;                                    // YYYY-MM-DD
      customers: Array<{ customerId: number; customerNo: string | null; shortName: string; quoteDate: string; quoteId: number }>;
  }> }
  ```
  - 以 SQL 取每位客戶此商品最新一筆（`ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY quote_date DESC, id DESC)`）與其 `quote_price_breaks`，在 Worker 內依「單位＋級距」組鍵分組。
  - 組鍵＝該筆所有級距依 quantity 排序後的 `(unit, quantity, unitPrice)` 串接；`unit` 欄位取第一個級距的單位（實務上同筆同單位）。
  - groups 依 `latestQuoteDate` 新到舊；組內客戶依 `quoteDate` 新到舊。
  - `shared/customer-related.ts` 加型別；`docs/architecture/API_CONTRACT.md` 補合約。
- 卡片顯示依 §2-5；是否顯示依 `CUSTOMERS` 權限（同 5.3）。
- 報價新增表單抽成共用元件 `src/runtime/modules/customer/QuoteCreateForm.tsx`（WO-0.9.14 在 `CustomerOperationalPage.tsx` 的多品項新增表單、驗證、呼叫 `POST /api/business/customers/:id/quotes/batch` 一起搬過去），props 例如 `{ customerId: number | null; initialLines?: Array<{ item, unit }>; onSaved(); onCancel() }`。
  - 客戶頁報價「新增模式」改用這個元件，行為不變（`customerId` 固定為該客戶）。
  - 商品頁對話框：上方客戶 `EntityPicker`（沿用客戶清單的搜尋 API）選定後把 `customerId` 傳入；未選客戶時「儲存」不可按。

### 5.5 hash 參數跳轉
- `src/App.tsx` 的 `currentRoute()` 目前用整個 hash 比對路由，需改為只取 `?` 前面判斷路由，`?` 後面當參數。提供一個小工具（例如 `src/runtime/navigation/route-params.ts`）：`readRouteParams()`、`replaceRouteParams(params)`、`routeHref(route, params)`。
- `CustomerOperationalPage.tsx`：讀到 `id` 就選取該客戶（不在目前清單頁也要能直接載入明細）。
- `DefectOperationalPage.tsx`：讀到 `id` 就開啟該筆。

### 5.6 文件、版本、TODO
- `VERSION`／`package.json` → `0.9.15`；`BUILD` 維持 `0`。
- `TODO.md` 最上方新增 0.9.15 段落並連結本單。
- `CY_WEB_VISUAL_GUIDE.md`：商品明細版面、單層換算顯示、相關紀錄卡可跨模組使用、hash 參數跳轉。
- BD-058 已由審查者新增，不需修改。

## 6. 驗收清單

- [ ] 商品明細：標題 `A00001 志遠拔罐杯#1`、下一行規格／分類／狀態；基本資料卡三列；沒有獨立的「單位換算」「歷史品號」區塊；有歷史品號時只有一行小字。
- [ ] 換算顯示一律成基準單位（含舊的接串資料，驗收測試或手動資料涵蓋）。
- [ ] 修改表單換算為精簡列，目標單位固定為基準單位；後端拒絕 `toUnit` ≠ 基準單位與重複來源單位（驗收測試涵蓋）。
- [ ] 清單列上行小字品號、下行品名＋規格，沒有「·」。
- [ ] 瑕疵卡：最近 3 筆、總數與狀態筆數不含已作廢；查看全部可搜尋、可勾選顯示已作廢（灰色＋chip）；點一筆跳到瑕疵模組那一筆；＋新增在商品頁開對話框、商品已帶入且不可改，存檔後卡片更新。
- [ ] 商品頁對話框與瑕疵模組新增使用同一個 `DefectForm` 元件（`grep` 確認沒有第二份瑕疵表單）；瑕疵模組的新增、修改行為不變。
- [ ] 報價卡：同單位同級距的客戶彙整成一組、每客戶只算最新一次；顯示客戶數與價格數；查看全部可展開、可依客戶搜尋；點客戶跳到客戶頁。
- [ ] 報價＋新增：在商品頁開對話框，選客戶後可存檔；第一列已帶入此商品與基準單位，可再加其他商品；存檔後報價卡更新。
- [ ] 商品頁對話框與客戶頁報價新增使用同一個 `QuoteCreateForm` 元件（`grep` 確認沒有第二份報價新增表單）；客戶頁報價新增行為不變。
- [ ] 沒有 `DEFECTS`／`CUSTOMERS` 模組權限時對應卡片不出現，也沒有 403 錯誤訊息。
- [ ] hash 參數跳轉可重新整理、可分享；有未儲存表單時跳轉會先確認。
- [ ] 客戶頁改用共用 `RelatedCard` 後行為與 0.9.14 相同。
- [ ] `npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local` 全部通過。
- [ ] `node --test scripts/*.test.mjs` 全部通過（需先 `git clone --depth 1 https://github.com/simonliu1118-byte/cyapps .tmp/canonical-cyapps`；無法取得時在完成報告寫明，**不得**另寫 workflow 代替）。
- [ ] 沒有新增或修改 `.github/workflows/*`，沒有範圍外檔案。
- [ ] VERSION／package.json 為 0.9.15；TODO、視覺規範、API 合約已更新。

## 7. 截圖要求

執行者不需提交截圖；在完成報告列出自己操作驗證的步驟。審查者會以實際畫面擷取：商品明細（含兩張卡）、修改表單換算、瑕疵查看全部、商品頁瑕疵新增對話框、報價查看全部（展開與搜尋）、商品頁報價新增對話框、手機 390 寬。

## 8. 完成報告（執行者填）

- 基準：`main` `85e20f0013a306217e9e444c62f5f725fc6b24e2`（WO-0.9.14／PR #212 已合併）。
- 執行分支：`cyweb/item-page-0.9.15`；[PR #214](https://github.com/simonliu1118-byte/chihyuan-web/pull/214)。僅供審查，**未合併、未部署**。
- 版本：`VERSION`、`package.json` 均為 `0.9.15`；`BUILD` 保持 `0`。

### 8.1 驗收清單逐項回報

| §6 驗收項目 | 結果及驗證證據 |
|---|---|
| 商品明細標題／副標／基本資料 | **已實作，待審查者實機截圖**。標題以 `formatItem` 顯示品號＋品名；副行規格／分類／狀態；單一基本資料卡列出基準單位與換算、成本稅別與兩種價格、非空備註、歷史品號一行小字；已移除獨立換算／品號歷史區塊。 |
| 舊串接換算顯示成基準單位 | **已實作，D1 回歸測試通過**。前端直接重用 `worker/item/unit-conversion.ts` 中純函式 `unitFactorToBase`（未複製演算法）；舊鏈路可用有理數精確算到基準單位，編輯送出會改成直接轉換。若精度超過 4 位小數而不能精確存回，明確報錯，避免無聲四捨五入。 |
| 編輯時精簡換算列、Server 驗證 | **已實作，Local D1 Acceptance 通過**。在「基準單位」欄位下方輸入來源與數量；目標顯示目前基準單位，API 一律帶入該值；`toUnit` 非基準或來源重複時後端拒絕；驗收含保留資料快照不變。 |
| 清單編號上、名稱／規格下 | **已實作，待 UI 截圖**。原小字位置顯示品號，原粗體位置顯示品名與全形空白分隔的規格；無中點。 |
| 瑕疵摘要／搜尋／作廢／跳轉／新增 | **已實作，待實機操作**。`DEFECTS` 授權才載入；最近三筆，總筆數／狀態數不含已作廢；查看全部有搜尋、作廢勾選、分頁載入更多；已作廢採中性色 chip 與淡化列；點紀錄跳 `#defects?id=<id>`；新增在商品頁對話框帶入唯讀商品，儲存後刷新卡。 |
| 共用瑕疵表單（建立／修改） | **已實作，需實機回歸**。`src/runtime/modules/defect/DefectForm.tsx` 統一載入選項、欄位、驗證、建立與修改 API；瑕疵模組及商品頁皆使用此元件，不存在第二套新增表單。 |
| 報價相同單位／級距彙整、最新一筆 | **已實作，Local D1 驗收通過**。`ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY quote_date DESC, id DESC)` 挑出每客戶此品項最新報價；以原始 scaled4 精確值、單位及完整級距分組，群組日期新到舊；驗收涵蓋不同客戶完全相同級距併組、較新報價覆蓋舊報價。 |
| 報價查看全部、搜尋、展開、跳客戶 | **已實作，待 UI 截圖**。卡片顯示 N 位客戶、M 種價格及最近三組；查看全部可搜尋客戶編號／名稱，篩選有命中客戶的群組並展開；點客戶跳 `#customers?id=<id>`。 |
| 商品頁報價新增／預設商品 | **已實作，待實機驗收**。開對話框先以 `EntityPicker` 搜尋必填客戶；報價表單首列已有當前商品與基準單位，可再加列；未選客戶禁用儲存；成功後刷新卡。 |
| 共用報價新增表單 | **已實作，需實機回歸**。`src/runtime/modules/customer/QuoteCreateForm.tsx` 由客戶頁與商品頁共同使用，內部驗證與 `POST .../quotes/batch` 為唯一新增流程；客戶頁單筆「修正紀錄」仍獨立，BD-020／021／022 不變。 |
| 模組無權限時不顯示且不打 API | **已實作，待 Session 實機權限測試**。`App.tsx` 依 `session.moduleAccess.allowedModules` 傳 `DEFECTS`、`CUSTOMERS` 布林值；卡片渲染與 API 讀取均以此條件阻擋。 |
| Hash 帶 id 可重整／分享、離頁確認 | **已實作，待瀏覽器驗證**。`route-params.ts` 建構／讀取 `?id=`；App 路由以 `?` 前段判斷，跨模組透過既有 `createGuardedHashNavigation`／`useNavigationGuard` 檢查未儲存表單；客戶／瑕疵頁可直接用 ID 載入即使不在目前清單。 |
| 共用 RelatedCard 回歸 | **已實作，待實機回歸**。抽至 `src/ui/records/RelatedCard.tsx`，客戶頁與商品頁共用；客戶卡原動作／清單不更動；新增可選的 summary 欄位供商品卡。 |
| 四項必要檢查：TypeScript／Source／Build／D1 | **對應 GitHub CI 全部通過**。前端＋Worker TypeScript、各 Source Contracts、Vite build、Local D1 runtime acceptance 皆 success。參見 §8.2；本環境未直接執行四條本機 npm 指令。 |
| `node --test scripts/*.test.mjs` | **未執行完整集合**。`git ls-remote https://github.com/simonliu1118-byte/chihyuan-web.git HEAD` 顯示 `Could not resolve host: github.com`；無法在此工作環境 clone `cyapps` 至 `.tmp/canonical-cyapps`。既有 CI 中的單獨 ERP／Identity tests 已通過，但不可取代本項完整測試。交審查者在可 clone 環境執行。 |
| 未新增 workflow／範圍外檔案 | **PR changed-files 已確認**：沒有任何 `.github/workflows/*`；新增檔案僅本單核准的 `DefectForm`、`QuoteCreateForm`、`RelatedCard`、`route-params`。既有的三支來源契約驗證腳本為配合本單抽出共用表單、BD-058 的檢查而同步更新，沒有增加另一個 runner 或 CI workflow。 |
| VERSION／TODO／視覺／API 合約 | **已更新**。另同步修訂既有 `ITEM_MODULE_CONTRACT.md` 的直接換算描述（不另建永久規則），沒有 migration。 |

### 8.2 驗證指令／CI 證據

- [Runtime Check run 39213694556](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39213694556)，在功能提交 `0bdb84d1ad20b64697a143a7a08996fe8919da59` **success**：`browser-typecheck`、`worker-typecheck`、`source-contracts`、`build` 全通過；其中 `Local D1 runtime acceptance`、`Vite build` 均 success。
- [Governance Check run 39213694552](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39213694552)：**success**。
- [CY Web Deploy PR 檢查 run 39213694636](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39213694636)：`validate-deployment-contract` success、**`deploy-development` skipped**。這是 PR 驗證而非發布，沒有正式部署。
- 本單新增或擴充既有本機 D1 驗收：`BD058_REJECT_INDIRECT_CONVERSION`、`BD058_REJECT_DUPLICATE_SOURCE`、`ACCEPT_ITEM_LEGACY_CHAIN_FLATTEN_COMPAT`、`ITEM_QUOTE_GROUP_IDENTICAL_TIERS`、`ITEM_QUOTE_LATEST_PER_CUSTOMER`。詳細測試程式在 `worker/acceptance/`，CI success 為驗證依據。
- 執行環境 `git ls-remote`：`fatal: unable to access 'https://github.com/...': Could not resolve host: github.com`。因此無法直接執行完整 `node --test scripts/*.test.mjs` 或本機 npm 四條驗證指令，沒有新增 workflow 取代。

### 8.3 實機操作與截圖指引（審查者執行）

1. 在正式授權的測試資料中打開商品清單，檢查品號在上／品名＋規格在下；選有歷史品號、兩種換算、成本稅別的商品，桌面 1440px 截基本資料及雙相關卡；另以手機 390px 截圖確認雙卡直向排列。
2. 商品按「修改」，在基準單位下方新增／移除換算、修改基準單位，確認目標單位同步。以既有串接換算資料核對 (1 盒 = 30 包、1 箱 = 180 包) 換成基準單位；資料異動須經核准且不使用正式營運資料作破壞性測試。
3. 有 `DEFECTS` 權限時在商品卡查看最近三筆／狀態數；查看全部搜尋、勾選顯示已作廢、載入更多，點一筆驗證跳瑕疵明細；以商品頁＋新增，確認商品不可更改，成功後刷新卡。瑕疵模組本身新增與修改再重測一次。
4. 有 `CUSTOMERS` 權限時確認報價同單位同完整級距彙整、不同級距／單位分開；查看全部展開、按客戶編號／名稱搜尋；點客戶跳到客戶頁。商品頁＋新增選客戶，確認第一列商品已帶入，新增第二商品列再儲存，確認重新整理卡片及客戶頁。
5. 分別以只有 `ITEMS`、`ITEMS+DEFECTS`、`ITEMS+CUSTOMERS` 權限的 Session 驗證對應卡是否完全不渲染且沒有不必要的 403 API。
6. 直接瀏覽 `#defects?id=<id>`／`#customers?id=<id>`，重新整理並分享連結；從有未儲存的商品或相關新增表單跨模組點選紀錄，確認有離頁保護。
7. 按 §7 取得桌面／390px 實際畫面；本執行者未偽造或提交示意截圖。

### 8.4 與工作單差異／交審風險

- 純函式 `unitFactorToBase` 在前端可以直接引用 Worker 原有純 TypeScript，因此依 §5.1「若無法直接引用才搬到 shared」保留原位置，**沒有複製算法**。
- 除工作單列舉的主要檔案外，為使既有來源契約測試理解表單搬移與 BD-058 規則，調整既有 `scripts/validate_customer_runtime_transport.py`、`scripts/validate_operational_runtime.py`、`scripts/validate_item_foundation.py`。這是維持原驗收有效性，未新增 runner 或 workflow。
- BD-058 對「需要超過四位小數才能精確回存」的舊鏈路，前端拒絕無聲近似，交審查者確認該案例的產品處理方式。一般可精確表達的舊鏈路按原定案轉換。
- 目前僅有靜態、TypeScript、資料庫與 CI 建置驗證；桌面／手機、權限 Session、操作流程與 hash 重整實測仍需審查者完成，**不得把 CI success 視作視覺或正式站驗收**。不合併、不部署。

## 9. 審查紀錄（審查者填）

- 日期：2026-10-19　結論：**通過**（審查者直接修正下列小問題後合併）。
- 審查者在本機執行：`npm run typecheck`、`npm run build`、`npm run validate:d1:local` 通過；`node --test scripts/*.test.mjs` 143/143 通過；`npm run validate:source` 修正後通過（見下）。
- 實際畫面（桌面 1440、手機 390，模擬 API）：基本資料卡三列與曾用品號、舊接串換算顯示成「1 箱 = 180 包」、修改表單精簡換算列、瑕疵卡（最近 3 筆、狀態筆數）、商品頁瑕疵新增對話框（商品唯讀帶入）、報價卡彙整、報價查看全部（展開與搜尋）、商品頁報價新增對話框（客戶＋第一列帶入商品）。
- 審查者直接修正：
  1. `npm run validate:source` 失敗：`validate_defect_runtime_transport.py` 仍只在 `DefectOperationalPage.tsx` 找 `createDefect`／`updateDefect`，表單抽到 `DefectForm.tsx` 後找不到。改為頁面與共用表單一起檢查（CI 的 source-contracts 未跑這支，所以 CI 是綠的）。
  2. 報價卡與「查看全部」的價格少了「$」，且 JSX 換行吃掉全形空白，顯示成「100+ 702 位客戶」；改用 `quoteGroupText()` 一處組字串：`盒　1+ $80 · 100+ $70　2 位客戶　最近 2026/10/12`。
  3. 「曾用品號」把目前品號也列進去（`validTo` 為空的那筆）；只列已停用的舊品號。
  4. 商品清單「已停用」chip 被 `.cy-item-row > span` 樣式拉成整列寬；改為放在右側欄位。
- 意見（不阻擋）：
  - `ItemOperationalPage.tsx` 直接從 `worker/item/unit-conversion.ts` 引用 `unitFactorToBase`（純函式、無 Worker 相依，build 正常）；日後若再有前端共用，應搬到 `shared/`。
  - 商品頁瑕疵新增對話框有兩層標題（對話框「新增瑕疵紀錄」與表單「新增瑕疵」），可接受，之後統一對話框表單樣式時一併處理。

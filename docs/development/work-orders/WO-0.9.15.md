# WO-0.9.15 商品頁改版：精簡基本資料、單層換算、瑕疵與報價卡片

- 狀態：待執行（**WO-0.9.14 合併後**才從最新 `main` 開分支；本單依賴 0.9.14 的報價「新增模式」視窗、多品項輸入與 `formatItem`）
- 分支：`cyweb/item-page`（建議）　PR：（執行者填）
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

- 驗收清單逐項結果：
- 與工作單不同之處與原因：
- 驗證指令輸出摘要：
- 操作驗證步驟：

## 9. 審查紀錄（審查者填）

- （待審查）

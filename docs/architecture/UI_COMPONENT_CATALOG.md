# CY Web 共用元件與畫面做法（UI Component Catalog）

> 2026-11-04 Claude 整理。給接手 UI 的人（GPT 或其他 AI）：**做任何畫面前先查這份，能用共用元件就用，不准在模組裡另做一份相似元件。**
> 缺元件時：先在 `src/ui/` 加共用元件（或擴充既有元件的 props），再給模組用；不要在模組檔案內寫一次性的按鈕、圖示、表格樣式。
> 規則來源：`PROJECT_RULES.md`、`UI_FOUNDATION.md`、`FORM_FOUNDATION.md`、`CY_WEB_VISUAL_GUIDE.md`。本檔是「目前實作」的地圖，與規則衝突時以規則檔為準並回報。

## 1. 已定案的畫面樣式（使用者逐一確認過）

> **全系統規則：表格在哪裡，就在哪裡改（使用者 2026-11-09）**
> - 畫面上以表格呈現的資料，新增與修改都在**同一個表格的同一個位置**直接輸入（`RecordSheet`、`RecordRows`、`EntryTable`、叫貨的 `OrderingGrid`），每個欄位留在它原本的格子。
> - **不要**另外開一個把欄位一個個往下排的表單（`FormSection`＋直排 `Field`），也不要讓修改畫面的欄位位置跟檢視時不同。
> - **格子就是輸入區**：表格裡的輸入用無框線的 `cy-sheet-input`（游標所在格只出現一圈細框），不要在格子裡再放有框線、圓角的輸入框。`RecordSheet`／`RecordRows` 內即使寫成 `cy-op-input` 也會被共用樣式改成無框（V0.16.1）。格內小表格用 `InlineGridField`。
> - 視窗裡的表單同樣用 `EntryTable` 排成表格。只有手機寬度由共用元件自動換排法。
> - 舊模組還有直排表單的，隨各自的表格式改版工單一起改掉（見 TODO「其他主檔改成表格式單據」）。

| 樣式 | 範本（照著做） | 重點 |
|---|---|---|
| 表格式單據（主檔明細／新增修改） | 客戶 `CustomerOperationalPage.tsx`（V0.9.95 起） | `RecordSheet`＋`RecordRows`；檢視與修改同一個版面，修改時格子變輸入框；第一列自動帶出空白列。各列盡量共用同一格線（例如 `repeat(6,minmax(0,1fr))`），用 cell 的 `span` 跨欄，讓上下線條對齊；表頭上的小控制項（例如「同戶籍地址」）用 `headExtra`（人事資料單，V0.18.4） |
| 表格式彈窗表單 | 售後維修 `StoreRepairs.tsx` 新增維修單（V0.10.16）、`StoreRepairPrintSettings.tsx` | 一個 `EntryTable` 包全部欄位；表頭列＋輸入列交替；用 colgroup 細網格＋`colSpan` 讓每列依內容配寬度；**不要上半表格、下半一般表單混用** |
| 設定清單（分類、狀態、部門等） | `LookupSettingsTable.tsx`、`ModuleSettingsPanel.tsx` | 密集表格、項次、操作欄（修改／停用／刪除，刪除只給未被使用的）；握把拖拉排序，畫面立即生效、背景儲存，失敗才還原 |
| 左側清單 | `.cy-op-list-row`（app.css） | 全系統一致：選取＝藍色左邊條＋淺藍底；不要自訂另一種選取樣式 |
| 一般資料表 | `.cy-op-table`（app.css） | 項次欄、精簡內距；需要展開時用同表格內展開（見修改紀錄 `ChangeLogList`） |
| 作業清單（叫貨、門市各頁） | `OrderingGrid`、`.cy-ordering-grid`、門市 `store.css` | 叫貨與門市樣式使用者已定，不要動，除非使用者點名 |
| 列印 | `store-repair-print.ts` | 產生獨立 HTML，用隱藏 iframe 叫瀏覽器列印視窗；只用黑線、不用底色（點陣式／熱感紙）；`@page size` 指定紙張；店名、電話等業務資訊一律從設定讀，**不得寫死在程式碼**（repo 是 public） |

## 2. 共用元件清單（`src/ui/`）

### 表單
- `forms/Field.tsx`：`CheckField type="radio"` 可讓互斥選項沿用共用欄位外觀，預設仍為 checkbox。
- `forms/Field.tsx`：`Field`（每個輸入都要包；表格格子內用 `presentation="cell"`）、`CheckField`（勾選框，**不要用原生 `<label>`**，測試會擋）、`FormSection`、`RequiredRows`。
- `forms/EntryTable.tsx`：`EntryTable`、`EntryHeading`（必填星號用 `required`）、`EntryFields`（視窗內少量列式欄名／編輯格，仍自動以 `Field presentation="cell"` 包每個欄位）。表格式表單的共用外框，修改不另長出直排表單。
- `forms/RecordSheet.tsx`：`RecordSheet`、`RecordRows`（`hideWhenEmpty`；檢視模式空值顯示「—」）。
- `forms/TimeInput.tsx`：所有時間輸入（24 小時 HH:MM），不要用原生 `type="time"`。
- `forms/DateInput.tsx`：所有日期輸入（YYYY/MM/DD）；`precision="month"` 為共用 YYYY/MM 年月選擇模式，對外值是 YYYY-MM。日期可為「無」時，旁邊放 `CheckField label="無日期"`。
- `forms/PhoneInput.tsx`：`PhoneInput`（輸入）、`PhoneText`（顯示）、`PhoneEntryInput`／`phoneEntryColumns`（含分機欄）。電話一律用這組。
- `forms/PresetTextInput.tsx`：預設選項＋「其他」自填（例：付款條件、發票開立；選其他沒填就存「其他」）。
- `primitives/TextInput`、`TextArea`、`SelectField`、`SegmentedControl`（2–4 個互斥選項）。
- textarea 不可手動拉大，會隨內容自動長高（`foundation/text-autosize.ts` 全域安裝，不用另外處理）。
- 鍵盤：每個資料輸入 `<form>` 必須 `onKeyDown={enterAdvancesFields}`（或 `enterAdvancesThenSubmits`），查詢表單用 `role="search"`。`scripts/form-keyboard.test.mjs` 會檢查。中文輸入法組字中的 Enter 要忽略（`isComposing`）。

### 按鈕與圖示
- `actions/IconButton.tsx`：表格內操作一律用它（`variant="table"`，危險操作 `tone="danger"`，展開用 `expanded`/`controls`）。
- `actions/icons.tsx`：`Icons.*` 唯一圖示來源（edit、cancel、back、history、camera、print、check、close、add、remove、retry、verify、chevronRight、grip、settings、eye）。**新圖示加在這裡**，不要在模組內寫 inline SVG。
- 一般按鈕：`cy-op-button`（`primary`、`compact`；`quiet` 透明文字按鈕；`soft` 淡底色無框，用於列內次要動作，例如「指定結案」「移除」「修改」「載入更多」）。`quiet` 只留給本來就該像文字的地方：返回連結、工具列切換、展開／收合、灰底標題列上的按鈕（灰底上 `soft` 會看不出來）。不要再新增沒有底色也沒有框的一般按鈕。
- 卡片／面板標題列上的小動作（「查看全部 ›」「＋ 新增待辦」）：`cy-op-button mini soft cy-header-action`（主動作用 `mini primary cy-header-action`），22px 高，不撐高標題列（2026-11-09）。
- 浮出選單與提醒視窗必須留在畫面內：⋯ 一律用共用 `OverflowMenu`（依畫面定位），不要自己寫 `position:absolute; right:0` 的下拉。
- 整列刪除線：在 `<tr>` 加 `cy-row-struck`（整列一條橫線、文字變灰），用於已移出的黑名單、已指定結案的叫貨品項等「保留顯示但已失效」的列。忙碌中的按鈕用 `feedback/usePendingAction`。
- 展開箭頭：`data/ExpandToggle.tsx`（全系統同一個箭頭）。

### 清單與資料
- `data/DataViewToolbar.tsx`：清單上方工具列（搜尋＋左側切換＋右側動作按鈕）。
- `data/StatusFilter.tsx`：狀態篩選籤（含數量、色點）。`data/OpenOnlyToggle.tsx`：「顯示未結案」。
- `data/DataPagination.tsx`、`data/useLoadMore.tsx`、`data/DataView.tsx`。
- `primitives/StatusChip.tsx`：狀態膠囊（tone：info／warning／success／danger／neutral）。客戶狀態用 `customer/StatusName.tsx` 的 `StatusPill`／`StatusPicker`。
- `pickers/EntityPicker.tsx`：選客戶／商品等主檔。

### 彈窗、抽屜、回饋
- `overlays/Dialog.tsx`：`Dialog`（精簡框、右上 X 圖示）、`Drawer`（右側抽屜，客戶頁為 380px）、`BottomSheet`。不要巢狀面板。`closeOnBackdrop`：點外面關閉，只給純導覽面板（手機模組選單）用，表單視窗不開。手機不再有側邊欄抽屜與左緣滑動手勢（V0.27.0，使用者 2026-11-24）：頂端列左側 CY 標誌回首頁，頁名按鈕「人事 ▾」開 `BottomSheet` 圖示格（`AppShell`）。
  - **寬度一定要指定 `size`**（2026-11-09 盤點後定）：V0.27.0 起寬度規則（使用者 2026-11-24）：`small` **400px**＝確認、理由、單一欄位；`medium` **560px**（未指定時的預設）＝一般表單，約 6 個欄位以內，表單不要被撐得比內容寬；`large` **860px**＝只給多欄表格或明細（清單、審核表、列印預覽）。一般表單不要用 `large`；欄位多於 6 個才考慮 `large`，且表單格優先用 2 欄（`EntryFields columns={2}`）。既有的視窗專屬寬度（維修單、出機、訂購、盤點紀錄、BOT 審稿等密集表格）屬例外，維持原樣。V0.18.2 起 `size` 是必填（TypeScript 會擋），`Drawer`／`BottomSheet` 例外。只有內容真的需要時，才在該視窗 class 加專屬寬度，而且**一定要寫成 `.該視窗class > .cy-dialog-surface`**（子層選擇器）；寫成空白（後代選擇器）會把在它裡面開的確認框、理由框一起撐寬（2026-11-10 BOT 退回理由變 1040px 的原因）。
- `overlays/ConfirmDialog`、`useConfirmation`、`useFormPrompt`（要理由的確認）。
- 有未儲存變更的畫面：`foundation/useUnsavedChangesGuard`；設定視窗關閉前自己確認（見 `ModuleSettingsPanel`）。
- `feedback/FeedbackProvider`：`useFeedbackMessage`＋`FeedbackBanner`（頁面訊息）；`Loading`；`ToastRegion`。
- 設定存檔後通知其他畫面重抓下拉選單：`runtime/modules/settings-events.ts`（`SETTINGS_SAVED_EVENT`、`useSettingsSaved`）。

### 版面與關聯
- `layout/MasterDetail.tsx`：左清單＋右明細。
- `records/RelatedCard.tsx`、`related/RelatedRecordPanel.tsx`：明細下方關聯卡片（客戶頁三張卡片三等分）。
- `foundation/format.ts`：`formatDate`、`formatDateTime`、`formatPerson`、`formatItem`（顯示格式統一用這些）。

### 門市共用（`runtime/modules/store-workflow/`）
- `StoreFields.tsx`：`ContactCells`（電話1／電話2／LINE，可用 `spans` 跨欄）、`HonorificCell`、`Reason`。
- `StoreMilestoneFields.tsx`：`StoreMilestoneButton`（流程格「登記」與日期戳記，訂購與維修共用）、`StoreMilestoneDateFields`。流程格內改日期一律用 `.cy-store-date-popover` 格內小視窗（照顧客訂購／售後維修寫法），不開整個對話框。
- 操作紀錄：`StoreOperationHistory.tsx`（顯示，欄名中文對照也在這）＋`shared/store-history.ts` 的 `changedFields`（只列有變動的欄位）；新模組的紀錄照這組做。
- `StoreWorkflowActions.tsx`：`storeWorkflowActions`（修改／取消／退回／紀錄 四個圖示）。
- `StoreShippingFields.tsx`、`StoreOperationHistory.tsx`、`StoreNoteInput.tsx`。

## 3. 做畫面時的固定做法

1. **欄寬要設計**：表格用 `<colgroup>`；短值（日期、狀態、項次、按鈕）固定寬度，長文字欄吃剩餘寬度；文字欄靠左，項次／狀態／日期／按鈕置中（表頭跟著內容對齊）。做完要截圖檢查不截斷、不重疊。
2. **檢視時空欄位也顯示**（除了使用者指定可隱藏的，例如備註）。
3. **必填只標使用者指定的欄位**；其他一律選填。
4. **長度限制**放在 `shared/*.ts` 的 `*_LIMITS` 常數，前後端共用。
5. **下拉選項來自設定**時，存檔後要能立即更新（`useSettingsSaved`）。
6. **不要寫灰色說明小字**（V0.10.12 已全系統刪除）。
7. 版號：AI 可升 Y（`REPOSITORY_RULES.md` §6）；每次改版更新 `VERSION`、`package.json`、`CHANGELOG.md`。
8. 新資料表或欄位：migration＋`worker/backup/portable-backup.ts` 的 `CURRENT_MIGRATION`＋`worker/backup/schema-columns.ts`＋`scripts/validate_schema.py`；資料意義改變才需要 `UPGRADES`。
9. 驗證：`npx tsc --noEmit -p .`、`npm run validate:source`、`node --test scripts/*.test.mjs`、`npm run validate:d1:local`，並以實際元件截圖給使用者看過再合併。

## 4. 還沒共用化、接手時優先做的

- 主檔明細頁標題列（客戶頁的編號／名稱／狀態膠囊）與「關聯卡片＋抽屜」：商品、瑕疵、報價改版時抽成共用元件，不要各模組複製客戶頁的程式碼。
- 舊彈窗（修改紀錄、報價新增／修正、商品單位換算、人事各對話框）統一改成表格式彈窗（見 `TODO.md`）。

## 5. 各模組的範本（照著做，不另做元件）

> 2026-11-09 由逐版紀錄整理而成；各版細節見 CHANGELOG 與各模組架構文件。

| 範圍 | 照哪裡做 | 用到的共用件與重點 |
| --- | --- | --- |
| 售後維修內的子頁（門市送修／出機紀錄／定期維護） | `StoreAfterSales`、`StoreEquipment` | 一組 `SegmentedControl` 切換子頁。<br>新增／修改用 `EntryTable`＋`Field`。<br>到訪日期用 `StoreMilestoneButton`、`StoreMilestoneDateFields` 和格內小視窗。<br>`OpenOnlyToggle` 可傳 `openLabel`（例：「顯示未完成」）。 |
| 月份矩陣 | `StoreMaintenanceMatrix` | `cy-ordering-grid` 雙層表頭、客戶固定欄。<br>格內放 `IconButton` 圓圈／警示，或 `StoreMilestoneButton` 實際日期。<br>游標分頁共用 `store-workflow/useStorePagedList`，不背景輪詢。<br>規格見 [STORE_EQUIPMENT_MAINTENANCE.md](STORE_EQUIPMENT_MAINTENANCE.md)。 |
| 紀錄串視窗 | `StocktakeRecordsDialog` | `Dialog`＋`cy-op-table`＋`ExpandToggle`。<br>展開區共用 `StoreHistoryChain`（與門市訂購相同），由舊至新串接。<br>只有明確「關閉」按鈕。 |
| 總覽＋卡片＋時間軸頁 | `BotCenterPage` | `cy-op-panel`。<br>狀態用 `StatusChip`，篩選用 `StatusFilter`。<br>溢出的內容用 `ExpandToggle` 展開。<br>退回理由用 `useFormPrompt`，確認用 `useConfirmation`。<br>統計由 Worker 計算，只做輕量輪詢。<br>規格見 [BOT_CENTER.md](BOT_CENTER.md)。 |
| 小型設定視窗 | `BotPushSettingsDialog`、新增 BOT | `Dialog` 包一個 `EntryTable`（左表頭、右輸入，`Field presentation="cell"`）。<br>明確取消／儲存。<br>密鑰類欄位不回填原值。<br>需要專屬寬度時只加在該視窗的 class 上。 |
| 手機版 | `OrderingPage`、`ErpItemQueryPage`、`AppShell` | 與桌機共用同一個元件和資料流，只用限定範圍的 CSS 改排版。<br>• 表格加 `data-label`／`data-col`，手機改卡片排列。<br>• 頁籤用 `cy-op-tabs`，手機可左右捲動。<br>不另做手機專用編輯器、查詢狀態或 API。<br>主題切換只由 `ThemePreference` 管理。 |
| 年月輸入 | `DateInput precision="month"` | 對外的值是 `YYYY-MM`，不要另做年月選擇器。 |
| 互斥選項 | `CheckField type="radio"` | 外觀與勾選框一致。 |
| 首頁、公告、待辦、鈴鐺 | `HomePage`、`AnnouncementsPage`、`MyTodosPage`、`NotificationBell` | 首頁只做摘要與導覽，新增／編輯都到正式頁。撰寫用 `EntryTable`。鈴鐺清單有固定高度捲動，只連到正式頁。規格見 [HOME_HUB.md](HOME_HUB.md)。 |

## 6. 手機版（V0.14.0 起，全系統共用）

**規則：手機寬度只有一個標準 820px（`useCompactLayout()` 與 CSS 相同），只改呈現，不改任何業務邏輯、API、存檔規則。各模組不再自己寫手機 CSS；需要的排法缺了，就加到 `src/ui/mobile/`。** 樣式集中在 `src/ui/mobile/mobile.css`。

| 用途 | 元件 | 手機上的樣子 | 桌機 |
| --- | --- | --- | --- |
| 模組的子頁（門市、叫貨、人事…） | `ModuleSections` | 一律在上方的頁籤（可帶數量徽章），放不下時左右滑；**不用底部分頁**（會壓到手機底部系統手勢橫線，容易誤按，2026-11-09） | 原本的 `cy-op-tabs` |
| 清單的每一列 | `ListRow` | 標題、副標、右側值或 `StatusChip`、箭頭 | 相同，選取時藍色左邊條 |
| 搜尋與篩選 | `DataViewToolbar`（`filters`、`activeFilterCount`） | 搜尋占一整列；篩選收進「篩選」按鈕開的下方面板 | 不變 |
| 主要動作 | `ActionBar` | 固定在畫面最下方、等寬大按鈕（留出系統手勢區） | 靠右一列 |
| 次要動作 | `OverflowMenu`（⋯） | 同桌機；點外面或 Esc 關閉 | 同 |
| 對話框 | `Dialog`（不用改呼叫方式） | 自動變成從下方滑出的面板；表單底部 `cy-op-form-footer` 固定在面板底部 | 不變 |
| 表格式表單 | `EntryTable`（不用改呼叫方式） | 自動變成「欄名｜內容」逐列；必填欄名帶＊ | 不變 |
| 主檔單據 | `RecordSheet`、`RecordRows` | 「欄名｜內容」；子表每列一張小卡 | 不變 |
| 寬表格 | 在 `<table>` 加 `cy-rt`，每個 `td` 加 `data-label`；可選 `data-priority="title"`（卡片標題）、`"wide"`（整列寬）、`"hide"`（只在桌機顯示） | 每列變一張兩欄卡片 | 不變 |
| 寬表格（清單式） | `cy-rt cy-rt-list`：`data-priority="title"` 第一行左、`data-rt="end"` 第一行右、`data-rt="meta"` 第二行左（手機專用的摘要格，桌機自動隱藏）、`data-rt="action"` 第二行右；其他欄 `data-priority="hide"` | 每列兩行的精簡清單（同一張卡片內以分隔線區隔），適合項目多的明細 | 不變 |

範例：門市頁的四個分頁（`StorePage`）用 `ModuleSections`。

 
### WO-0.14.1 第一批（叫貨）
- 手機叫貨子頁由 ModuleSections 控制，草稿來源／叫貨紀錄使用 ListRow，搜尋篩選由 DataViewToolbar 擁有，同一套編輯 Grid 的手機行點擊開 BottomSheet；桌機仍用原表格。
- 主要動作由 ActionBar 固定在畫面底部，次要由 OverflowMenu 提供（V0.17.2 起分頁在頂部，`aboveTabs` 變體已移除）。共用選擇清單、精簡品項樣式維護在 `src/ui/mobile/mobile.css`，不得另建模組-specific 的手機覆蓋層。

### WO-0.14.1 第二批（門市）
- StoreCustomerOrders／StoreRepairs／StoreEquipment／StoreStocktake 的寬表格在手機以共用 `cy-rt`＋`data-label`＋`data-priority` 呈現，桌機不變。原模組 workflow/cy-store-cards 卡片 CSS 刪除，避免同一 mobile 排版有第二套 owner。
- 月度待辦和三年維護矩陣為互動式年月網格，本批保留內容與原儲存操作，不重建資料 owner；工單明確要求僅處理其外框與按鈕。

### WO-0.14.1 第三批（客戶／商品）
- 手機的客戶、商品瀏覽清單採 ListRow；搜尋和分類／狀態採 DataViewToolbar 的 `filters`、`activeFilterCount`，不另造表單 state。選定明細以 ActionBar 提供主要修改，編輯頁用相同的提交按鈕處理器，其他選項在 OverflowMenu。
- 桌機維持原 toolbar、status 操作與 MasterDetail。換算列窄版適配以 shared `cy-mobile-unit-conversion-row` 在 820px 統一處理，不再依賴商品自己的 560px rule。

### WO-0.14.1 第四批（早期業務模組）
- 瑕疵、銷售工單、代工單與工作日誌的手機主清單統一 ListRow、DataViewToolbar。委外代工四子頁以 ModuleSections 搭配既有切換／未儲存保護。
- 主要的狀態流轉用共用 ActionBar，刪除、作廢、撤回或反向交易集中 OverflowMenu；不能更動按鈕對應的原 handler。
- 銷售／代工寬表 cy-rt 和 data-label，窄版輸入改共用 mobile.css 的 two-col／stack，移除舊 560/720px 類似版型。

### WO-0.14.1 第五批（HR／ERP／BOT）
- HR 人員清單與分頁採 ModuleSections、ListRow、DataViewToolbar；手機主要編輯與儲存用 ActionBar，危險動作用 OverflowMenu。HR 多欄編輯列使用同一 shared mobile.css。
- ERP 查詢各類的 CategoryJob 始終保留 mounted state，只有最外層手機導覽換 ModuleSections；未收款和進貨輔助結果透過 cy-rt，進貨輔助篩選用 DataViewToolbar，不重寫排程佇列。
- BOT 審稿與憑證表在手機用 cy-rt data-label，動作 handler 不變；桌機仍原表格和按鈕。避免把 BOT 審核的 approve/reject 改成非原生權限流程。

### WO-0.14.1 第六批（系統管理／首頁）
- 帳號與權限：手機 ModuleSections 分頁、使用者 DataViewToolbar/ListRow，原權限抽屜控制依業務 owner 不變；群組矩陣 cy-rt 並以 shared CSS 還原每個 checkbox 的操作能力，維持桌機的權限 table。
- 異動紀錄以 DataViewToolbar 和 cy-rt，備份共用 LineTable cy-rt，保留記錄展開和安全確認。首頁待辦／通知預覽 ListRow，其他模組原有 DataView renderCard、Dialog/Field/EntryTable 已符合共用策略，不新增替身。

### WO-0.18.0 委外代工庫存／產出進度
- `src/ui/data/StockGauge.tsx`：`StockGauge` 是廠商庫存電池條（綠／黃／紅、整數百分比、負庫存顯示「—」）；baseline 與顏色由 `shared/outsourcing-flow.ts` 算，元件不儲存庫存 authority。
- `ProductionGauge` 共用同樣的條狀元件樣式，成品進度 = 實交／預計，最多 100%。
- 代工資料單使用 `RecordSheet`＋`RecordRows`，新增發料、交貨、退料、盤點、對帳與付款視窗用 `Dialog`＋`EntryTable`；手機沿用單一 820px 共用排法，不得另建一套 business state。
- **本項仍在 V0.18.0 開發分支，尚待 CI 與 Claude 審查，不代表正式站已採用。**

### WO-0.16.0 商品主檔與共用格子內價格表
- 商品檢視與編輯共用 `RecordSheet` 與 `Field`；基準單位換算及批發多列價格仍由商品表單 owner 管理，不另外建立儲存層。
- `src/ui/forms/InlineGridField.tsx` 是共用格內多欄價格輸入，欄名在上、每格十進位輸入在下，由父層提供欄位清單／onChange；手機沿用 `RecordSheet` 的響應式編排。
- `ItemsModulePage.tsx` 使用共用 `ModuleSections` 控制商品／瑕疵子頁，沿用既有授權、路由及原瑕疵元件。

 
### WO-0.17.0 人事資料單／薪資總覽
- `HrEmployeeSheet` 以 `RecordSheet` 在同一畫面切換檢視／編輯並配合三張 `RecordRows`，手機沿用其 820px 共用轉置。
- 動態資料的短視窗統一 `EntryFields`（由 `EntryTable` 與 `Field presentation=cell` 組成）；調薪的四欄一列使用 `EntryTable`，津貼採 `RecordRows`。
- 薪資總覽桌機數字靠右、手機 `cy-rt cy-rt-list`，不複製寫入 owner。既有 `HrService.salary` POST 不修改，另加單一薪資唯讀 bulk GET。

### V0.20.3 人事表格式整理（待審查）

EntryFields新增可選columns（1至6）：分組表頭列／輸入列，最後不足格依colSpan填齊；仍由EntryTable及Field presentation=cell處理標籤、必填與手機轉置。不傳columns的既有列式呼叫不變。人事視窗統一傳columns，不複製表單外框。

人事設定用EntryTable原位切換資料／輸入列；清單及歷史用cy-rt，展開列共用cy-table-expansion，密集矩陣共用cy-mobile-matrix。相關窄版樣式集中mobile.css的820px區段，移除人事模組640／700／701及自訂820分支。桌機／手機共用資料、handler、草稿與儲存。

## 7. 介面檢查清單（V0.29.1 起，每個畫面交付前逐項過）

用真實形狀的合成資料（至少 3 位員工、多種狀態）與「空狀態」，桌機 1440×900、手機 390×844、淺色與深色各看一次，把每個頁籤、子頁、展開列與所有對話框都截圖。有一項不過，就在共用元件或共用 CSS 修，不要只修單一頁面。

1. **垂直節奏**：頁籤 → 子頁籤／分段控制 → 工具列 → 內容 → 頁尾，彼此有標準間距（區塊間 12px、標題與內容 10px、章節間 20px 左右），沒有貼在一起或重疊。
2. **表格**：表頭樣式一致；每張表都有 1px 橫向分隔線（多個 `tbody` 的分組表也要有）並遵守「一般表格直線」規則；內文 14px（不縮到 13px 以下）；數字靠右；日期不換行；沒有過寬或被擠扁的欄；需要對齊的兩張表共用同一組 `<colgroup>`。
3. **切換月份／年份**一律用共用 `MonthPicker`（`precision="year"` 為年份），不做有框的「上一年／下一年」按鈕。
4. **工具列**：搜尋框桌機約 240–280px、手機滿版；下拉依內容寬度；輸入框、下拉、按鈕的聚焦外框是單一完整、不被裁切的 2px 外框（`forms.css`）。
5. **彈窗**寬度只用 400／560／860，內容不擁擠也不拉得過長。
6. **手機**：沒有整頁橫向捲動（刻意可捲動的表格區除外）、觸控目標 ≥ 40px、重要文字不被截斷、固定底部列不蓋住內容。
7. **深色**：對比足夠，沒有白色區塊或白帶。
8. **空狀態**：沒有資料時有刻意設計的說明（不是一個空表頭）。
9. **分系統／排班等大型表格**：字級、列高、分界線（例如雙週線）貫穿整個表身，欄的底色（假日、週末）整欄一致，列印時字級不低於 13px。
10. **金額**：零顯示為 `0`（或 `$0`），絕不出現 `−0`、`$-0`；金額格式化函式用 `(n||0)` 正規化負零。
11. **空表**：沒有資料的表格不能只剩表頭，要有說明文字；下拉在沒有選項時顯示「無…」。
12. **對齊的表**：兩張要對齊的表共用同一組 `<colgroup>`；整月型大表用固定版面（`table-layout:fixed`）讓每個日期欄等寬並能在目標視窗寬度內放得下。

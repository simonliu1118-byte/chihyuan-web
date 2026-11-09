# CY Web 共用元件與畫面做法（UI Component Catalog）

> 2026-11-04 Claude 整理。給接手 UI 的人（GPT 或其他 AI）：**做任何畫面前先查這份，能用共用元件就用，不准在模組裡另做一份相似元件。**
> 缺元件時：先在 `src/ui/` 加共用元件（或擴充既有元件的 props），再給模組用；不要在模組檔案內寫一次性的按鈕、圖示、表格樣式。
> 規則來源：`PROJECT_RULES.md`、`UI_FOUNDATION.md`、`FORM_FOUNDATION.md`、`CY_WEB_VISUAL_GUIDE.md`。本檔是「目前實作」的地圖，與規則衝突時以規則檔為準並回報。

## 1. 已定案的畫面樣式（使用者逐一確認過）

| 樣式 | 範本（照著做） | 重點 |
|---|---|---|
| 表格式單據（主檔明細／新增修改） | 客戶 `CustomerOperationalPage.tsx`（V0.9.95 起） | `RecordSheet`＋`RecordRows`；檢視與修改同一個版面，修改時格子變輸入框；第一列自動帶出空白列 |
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
- `forms/EntryTable.tsx`：`EntryTable`、`EntryHeading`（必填星號用 `required`）。表格式表單的外框。
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
- 一般按鈕：`cy-op-button`（`primary`、`compact`）。忙碌中的按鈕用 `feedback/usePendingAction`。
- 展開箭頭：`data/ExpandToggle.tsx`（全系統同一個箭頭）。

### 清單與資料
- `data/DataViewToolbar.tsx`：清單上方工具列（搜尋＋左側切換＋右側動作按鈕）。
- `data/StatusFilter.tsx`：狀態篩選籤（含數量、色點）。`data/OpenOnlyToggle.tsx`：「顯示未結案」。
- `data/DataPagination.tsx`、`data/useLoadMore.tsx`、`data/DataView.tsx`。
- `primitives/StatusChip.tsx`：狀態膠囊（tone：info／warning／success／danger／neutral）。客戶狀態用 `customer/StatusName.tsx` 的 `StatusPill`／`StatusPicker`。
- `pickers/EntityPicker.tsx`：選客戶／商品等主檔。

### 彈窗、抽屜、回饋
- `overlays/Dialog.tsx`：`Dialog`（精簡框、右上 X 圖示）、`Drawer`（右側抽屜，客戶頁為 380px）、`BottomSheet`。不要巢狀面板。
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
| 模組的子頁（門市、叫貨、人事…） | `ModuleSections` | 2–5 個時變成底部分頁（可帶數量徽章）；超過 5 個改成上方可左右滑的頁籤 | 原本的 `cy-op-tabs` |
| 清單的每一列 | `ListRow` | 標題、副標、右側值或 `StatusChip`、箭頭 | 相同，選取時藍色左邊條 |
| 搜尋與篩選 | `DataViewToolbar`（`filters`、`activeFilterCount`） | 搜尋占一整列；篩選收進「篩選」按鈕開的下方面板 | 不變 |
| 主要動作 | `ActionBar` | 固定在畫面最下方、等寬大按鈕；有底部分頁時疊在分頁上方 | 靠右一列 |
| 次要動作 | `OverflowMenu`（⋯） | 同桌機；點外面或 Esc 關閉 | 同 |
| 對話框 | `Dialog`（不用改呼叫方式） | 自動變成從下方滑出的面板；表單底部 `cy-op-form-footer` 固定在面板底部 | 不變 |
| 表格式表單 | `EntryTable`（不用改呼叫方式） | 自動變成「欄名｜內容」逐列；必填欄名帶＊ | 不變 |
| 主檔單據 | `RecordSheet`、`RecordRows` | 「欄名｜內容」；子表每列一張小卡 | 不變 |
| 寬表格 | 在 `<table>` 加 `cy-rt`，每個 `td` 加 `data-label`；可選 `data-priority="title"`（卡片標題）、`"wide"`（整列寬）、`"hide"`（只在桌機顯示） | 每列變一張兩欄卡片 | 不變 |
| 寬表格（清單式） | `cy-rt cy-rt-list`：`data-priority="title"` 第一行左、`data-rt="end"` 第一行右、`data-rt="meta"` 第二行左（手機專用的摘要格，桌機自動隱藏）、`data-rt="action"` 第二行右；其他欄 `data-priority="hide"` | 每列兩行的精簡清單（同一張卡片內以分隔線區隔），適合項目多的明細 | 不變 |

範例：門市頁的四個分頁（`StorePage`）用 `ModuleSections`。

 
### WO-0.14.1 第一批（叫貨）
- 手機叫貨子頁由 ModuleSections 控制，草稿來源／叫貨紀錄使用 ListRow，搜尋篩選由 DataViewToolbar 擁有，同一套編輯 Grid 的手機行點擊開 BottomSheet；桌機仍用原表格。
- 主要動作由 ActionBar 的 `aboveTabs` 通用變體固定在底部分頁上方，次要由 OverflowMenu 提供。共用選擇清單、精簡品項樣式維護在 `src/ui/mobile/mobile.css`，不得另建模組-specific 的手機覆蓋層。

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

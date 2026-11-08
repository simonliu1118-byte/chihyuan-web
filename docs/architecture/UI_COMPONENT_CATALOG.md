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

## 出機與維護（V0.11.0）

`StoreAfterSales` 在售後維修內只用一組 SegmentedControl 切換門市送修／出機紀錄／定期維護。新增修改沿用 EntryTable＋Field；到訪沿用 StoreMilestoneButton、StoreMilestoneDateFields、單行 Field 與既有格內小視窗。OpenOnlyToggle 的 openLabel 可換成「顯示未完成」，舊呼叫者預設文字不變。沒有新增日期／登記元件。


## 三年維護矩陣（V0.11.1）

`StoreMaintenanceMatrix` 只改維護呈現：共用 cy-ordering-grid 雙層表頭、客戶固定欄、36月份、IconButton 圓圈／警示、StoreMilestoneButton 實際日期；同日多筆點開用EntryTable。日期與單行備註沿用StoreMilestoneDateFields（allowWithoutDate=false）及Field，不另建選擇器。`store-workflow/useStorePagedList` 抽取原出機的游標／防舊回應邏輯，出機和矩陣共用；不背景輪詢。詳細資料與行為以[維護契約](STORE_EQUIPMENT_MAINTENANCE.md)為準。

## BOT 管理中心（V0.12.4 Build 1）

`BotCenterPage` 沿用 `cy-op-panel`、CYWEB tokens；順序為總覽、全寬待審核表格、四張工作摘要、全寬同行時間軸、四張 BOT 當日摘要。兩組卡片桌機四欄，中等寬度兩欄、手機單欄；BOT 卡無操作與展開，時間軸每筆單行，僅超出時可展開詳情。拍板結案卡不接後臺。待審核及逐 BOT 憑證設定沿用 `cy-op-table`／table wrap。狀態用 `StatusChip`、篩選用 `StatusFilter`；回報紀錄與時間軸的溢出事件均沿用 `ExpandToggle`。視窗沿用 `Dialog`、新增 BOT 用 `Field`／`FormSection`、退回理由用必填 `useFormPrompt`、憑證確認用 `useConfirmation`，通過不開視窗。無新 UI library；完整統計由 Worker 計算，進度仍輕量輪詢。契約見 [BOT_CENTER.md](BOT_CENTER.md)。

## 盤點紀錄（V0.12.1）

`StocktakeRecordsDialog` 沿用共用 `Dialog`、`cy-op-table` 及 `ExpandToggle`，一張底稿一列，30% 放日期／單號／初盤與複盤人員，70% 放去重品號＋品名並折行。展開區與門市訂購共用 `StoreHistoryChain`，由舊至新串接初盤確認、複盤確認、寫回 ERP 與 ERP 清除歸檔；小字、動作粗體，從箭頭連同下一筆整段換行。不顯示品項差異表或重複參與人員，展開不另發請求。主紀錄游標分頁，沒有歷史背景輪詢；只有明確「關閉」按鈕，點背景不關閉。

`BotPushSettingsDialog` 亦使用既有 Dialog／EntryTable／EntryHeading／Field／CheckField 與 Enter 導航；不另建元件庫。逐 BOT 密碼型網址／密鑰輸入、啟停移至 BOT 設定表格、明確取消／儲存；設定不回填原值，沒有 X／背景／Escape 關閉。已審列表推播狀態用既有 StatusChip，超管失敗重送沿用 cy-op-button。


## BOT 管理中心（V0.12.5 Build 0，PR #453 已合併、待正式部署）

頁首工作狀態與逐 BOT 身份用共用 `StatusChip` 呈現（不可作篩選）；五筆時間軸用既有共用 `Dialog` 顯示全部，時間點依台灣同分鐘合併一個藍點。底部 `cy-op-table` 是 BOT 列表及啟停按鈕；推播設定／新增 BOT 均使用 `Dialog` 包住單一 `EntryTable` 與 `EntryHeading`／`Field presentation="cell"`（左表頭、右輸入），不用一般 `FormSection` 表單取代。相關 UI 與權限參見 [BOT_CENTER.md](BOT_CENTER.md)。

V0.12.6：BOT 時間軸單行省略／內容溢出時用共用 `ExpandToggle`；Threads 巡視回報卡只顯示最新事項標題。推播設定／BOT 設定視窗分別為 414px／720px 的專屬寬度，不影響其他共用 Dialog。

## V0.12.7 Build 0 — 手機 UI 與叫貨草稿

- 手機 ThemeToggle 無框日月一鍵切換，原 ThemePreference 為唯一設定 owner；只有 `cy-shell-navigation-drawer` 使用 264px 寬。
- ERP 查詢的桌機與手機共用唯一 `cy-op-tabs` + kept-mounted panel，手機 CSS 左右捲動，不新增 mobile select 或不同查詢 state。原 ERP 管理視窗以帶狀態點的小 pill 開啟。
- 手機叫貨預設可見草稿清單（`GET /orders?status=DRAFT`），與未到貨、叫貨紀錄共用唯一 `OrderingPage`／`useMasterDetailPane` 和 `prepareSwitch`。Grid 只增加 data-label / data-col，手機以範圍限定 CSS 卡片排版，不新增第二編輯器。其他共用 Grid 的桌機與門市畫面不變。

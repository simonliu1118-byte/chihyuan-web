# WO-0.9.12 客戶相關紀錄改卡片、標題列說明與設定按鈕、日期格式、個人選單精簡

- 狀態：待執行
- 分支：`cyweb/customer-cards`（建議）　PR：（執行者填）
- 依據：`PROJECT_RULES.md` §9；視覺規範 `docs/architecture/CY_WEB_VISUAL_GUIDE.md`
- 基準：`main` 於 V0.9.11（PR #203 已部署，CY Web Deploy #250）

## 1. 背景（使用者原話）

- 「拜訪紀錄、報價紀錄、常用商品，是不是直接切成三張直式卡片橫向並排就好? 三張卡片各自有各自的察看全部，按下去就會打開一個專屬視窗，這樣應該比頁籤好用?」
- 「至於那個動態..我也不確定留著幹嘛」
- 「這個選單只要有我的帳號和登出就好，不需要再重複一次姓名編號和權限」
- 「所有日期格式顯示一律 YYYY/MM/DD」
- 「把原本那個設定頁籤全部拆回他自己的模組的部分，現在的呈現方式有點複雜化，又多了一個頁籤要選，我想要做成按鈕……看說明能不能都簡化成30字內……直接秀出來……在標題旁邊，然後接著就是前面說的這個設定按鈕，按下去開新視窗處理」

## 2. 已定案事項（不得更改）

1. 客戶明細下方的「拜訪紀錄／報價紀錄／常用商品／動態」頁籤，改為**三張卡片橫向並排**（拜訪紀錄、報價紀錄、常用商品）；**「動態」頁籤移除**。
2. 每張卡片**只顯示最近 3 筆**；卡片是**唯讀摘要**，新增、修改、修正、刪除**一律在該卡片的專屬視窗內**進行。
3. 卡片上的「＋ 新增」與「查看全部」打開**同一個**專屬視窗；「＋ 新增」打開時直接進入新增狀態。
4. 客戶標題下加一行「最後修改：YYYY/MM/DD HH:mm · 姓名」（所有人可見）。「修改紀錄」按鈕**不在本單**（留給 WO-0.9.13，需配合異動紀錄改寫）。
5. 個人選單只剩「我的帳號（密碼、Email）」「登出」兩項，移除選單頂端的姓名／編號／權限。
6. 全站**顯示**日期一律 `YYYY/MM/DD`，日期時間 `YYYY/MM/DD HH:mm`（台北時間）。輸入用的原生日期欄位（`<input type="date">`）**保留**，其顯示格式由瀏覽器語系決定，不自製日期元件。
7. 頁面標題列：標題右側顯示**一行**頁面說明（灰色小字，30 字內），**移除 ⓘ 說明按鈕與說明視窗**；手機（≤ 820px）不顯示說明。
8. 模組設定改為標題列上的「設定」按鈕（在說明之後），**移除** V0.9.11 加的「客戶｜設定」等頁籤；按鈕只對 ADMIN／SUPER_ADMIN 顯示，按下開大視窗處理。設定權限（BD-043：結構設定只有超級管理員可改，工作日誌設定管理員可改）與 API 不變。
9. 頁面說明定稿（照抄，不得改字）：

| route | 說明 |
|---|---|
| customers | 客戶資料、聯絡人、拜訪與報價紀錄 |
| items | 商品資料、品號、價格與單位換算 |
| defects | 瑕疵回報、處理進度與作廢 |
| orders | 銷售工單與出貨流程，正式單號由 ERP 提供 |
| outsourcing | 代工單、代工對象、單價、BOM 與庫存 |
| worklogs | 填寫日誌、送審與評分統計 |
| erp-item-query | 查閱 SMART ERP 資料，只讀不改 |
| identity | 使用者、權限群組與系統安全 |
| audit | 重要操作與設定變更的紀錄 |
| backups | 備份狀態、手動備份與重試副本 |
| programs | CY 程式的功能、版本與使用入口 |
| account | 變更自己的密碼與 Email |

（`audit` 的頁名與說明會在 WO-0.9.13 改為「異動紀錄」，本單不改頁名。）

## 3. 範圍

1. 客戶相關紀錄三張卡片＋三個專屬視窗；移除「動態」。
2. 客戶「最後修改」一行（含後端回傳最後修改者）。
3. 個人選單精簡。
4. 共用日期格式函式，全站日期顯示改用它。
5. 標題列一行說明、移除 ⓘ、設定按鈕＋設定視窗，移除模組內「設定」頁籤。
6. 文件、版本、TODO 更新。

## 4. 不做

- 異動紀錄（稽核紀錄）頁的任何改動、客戶「修改紀錄」按鈕（WO-0.9.13）。
- 「使用說明」按鈕（等所有模組完成後另開）。
- 拜訪／報價／常用商品的資料欄位、API、權限、驗證規則變更。
- 自製日期輸入元件；改變任何日期的**儲存**格式（資料庫與 API 仍是 ISO `YYYY-MM-DD`／ISO timestamp）。
- 其他模組的版面調整。

## 5. 實作指引

### 5.1 日期格式（先做，其他項目會用到）
- 在 `src/ui/foundation/format.ts` 新增 `formatDate(value)`：
  - 純日期字串 `YYYY-MM-DD` → 直接轉 `YYYY/MM/DD`（**不要**經過 `new Date()`，避免時區位移）。
  - 其他（ISO timestamp、Date）→ 以 `Asia/Taipei` 取日期部分輸出 `YYYY/MM/DD`。
  - 空值 → `—`。
- 確認 `formatDateTime` 輸出為 `YYYY/MM/DD HH:mm`（目前用 `zh-TW` Intl，請用測試確認分隔符確實是 `/` 且月份、日期補零；若不是，改為手動組字串）。
- 全站找出直接顯示日期欄位的地方改用 `formatDate`／`formatDateTime`。起點：
  `grep -rnE "\.(visitDate|quoteDate|logDate|orderDate|reportedDate|shippedDate|receivedDate|occurredAt|createdAt|updatedAt)\b" src --include=*.tsx`
  只改**顯示**（JSX 文字、title、aria-label）；`value=`、`setDraft`、API payload 不改。ERP 查詢頁（`ErpItemQueryPage.tsx`、`ErpSalesOrders.tsx` 等）也包含在內。
- 在 `scripts/` 現有 node 測試新增或擴充一個測試檔，覆蓋 `formatDate` 與 `formatDateTime` 的輸出（含 `2026-01-05` → `2026/01/05`、時區邊界 `2026-10-17T16:30:00Z` → `2026/10/18`）。

### 5.2 個人選單
- `src/ui/shell/AccountMenu.tsx`：刪除 `.cy-account-popover-head` 區塊；`employeeNo` 若不再使用就移除 prop 並同步 `src/App.tsx`。
- `src/app.css`：刪除 `.cy-account-popover-head` 相關規則。

### 5.3 標題列說明與設定按鈕
- `src/App.tsx` `PAGE_META` 的 `description` 換成 §2 第 9 點定稿。
- `src/ui/shell/AppShell.tsx`：
  - 移除 ⓘ 按鈕（`cy-shell-help-button`）、`openHelp`、`helpOpen`／`helpPosition` 狀態與說明 `Dialog`。
  - 在 `<h1>` 後加 `<p className="cy-shell-topbar-description">{pageDescription}</p>`（compact 時不渲染或以 CSS 隱藏）。
  - `pageTools` 維持在說明之後（設定按鈕與 ERP 連線控制都走 `pageTools`）。
- CSS（`src/app.css`）：說明 `font-size: var(--cy-fs-sm)`、`color: var(--cy-text-muted)`、單行 `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`，與標題同一列垂直置中；刪除 `.cy-shell-help-button` 與 `.cy-shell-help` 相關規則。
- 設定：
  - `src/runtime/modules/ModuleSettingsPanel.tsx`：保留 `ModuleSettingsPanel`；把 `WithModuleSettings`（頁籤）改為 `ModuleSettingsButton({ role, label, only })`：ADMIN／SUPER_ADMIN 才渲染一顆 `cy-op-button`（齒輪圖示＋「設定」，圖示用 inline stroke SVG，可沿用 `AppShell` 的 `settings` 圖示路徑），按下開共用 `Dialog`（`size="large"`，標題「{label}設定」），內容是 `<ModuleSettingsPanel role only />`。
  - 關閉視窗時若面板內有未儲存的編輯，要先確認：用 `useNavigationGuard().canLeave()` 判斷後才關閉（`ModuleSettingsPanel` 已登記 `useUnsavedChangesGuard`）。
  - `src/App.tsx`：customers／items／worklogs 不再包 `WithModuleSettings`，改為傳 `pageTools={<ModuleSettingsButton …/>}`（ERP 查詢頁維持原本的 `ErpAgentCredentialControl`）。`only` 對應不變：客戶 `["customer_category","customer_status","department"]`、商品 `["item_category"]`、工作日誌 `["worklog-categories","worklog-platforms","scoring"]`。
  - `scripts/validate_operational_runtime.py`：把檢查的 `WithModuleSettings` 改成 `ModuleSettingsButton`，其餘檢查（禁止 `#settings`）保留。

### 5.4 客戶「最後修改」
- 後端：`worker/customer/customer-repository.ts` 的客戶明細查詢以 `updated_by` join `app_members`（與現有 `owner_employee_no` 的 join 方式相同），回傳 `updatedBy: CustomerEmployeeRef | null`；型別加在 `shared/customer.ts` `CustomerDetail`（或其所屬介面）。不改資料表。
- 前端：`CustomerOperationalPage.tsx` 客戶明細的 `cy-record-header` 內，在原副標題下加 `<p className="cy-record-meta">最後修改：{formatDateTime(updatedAt)}{updatedBy ? ` · ${displayName ?? employeeNo}` : ""}</p>`。
- 若有 `worker/acceptance` 對客戶明細回傳格式的檢查，補上 `updatedBy`。

### 5.5 客戶三張卡片
- 移除 `RelatedTab` 的 `"activity"` 與頁籤列（`cy-customer-related` 內的 `cy-op-tabs`）。
- 新增卡片區：`<section className="cy-customer-cards">`，CSS `display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px;`（寬時三欄、窄時自動換行、手機一欄）。
- 每張卡片（建議抽一個小元件 `RelatedCard`，放在同檔或 `src/runtime/modules/CustomerRelatedCards.tsx`）：
  - 標題列：名稱＋筆數（`拜訪紀錄 5`）＋右側 `cy-op-button compact`「＋ 新增」。
  - 內容：最近 3 筆，一筆一行（文字過長以省略號截斷）：
    - 拜訪：`formatDate(visitDate)` · 拜訪對象（`personSnapshot` 或聯絡人名稱）· `content` 第一行。依 `visitDate` 由新到舊。
    - 報價：`formatDate(quoteDate)` · `itemNoSnapshot itemNameSnapshot`。依 `quoteDate` 由新到舊。
    - 常用商品：品號＋品名（正式商品）或自訂名稱。依現有排序（`sortOrder`）。
  - 空狀態：「尚無拜訪紀錄。」等文字（沿用現有空狀態用詞）。
  - 底部：`查看全部（N）›` 文字按鈕；N 為 0 時仍可按（打開後可新增）。
- 專屬視窗：共用 `Dialog`，`size="large"`，標題「拜訪紀錄 — {客戶簡稱}」等。內容**重用現有** `VisitsPanel`／`QuotesPanel`／`FrequentPanel`（新增、修改、修正、刪除行為與 API 完全不變）。
  - 「＋ 新增」開啟時直接進入新增：拜訪 → `setVisitDraft(emptyVisit())`；報價 → `startQuote()`；常用商品 → 聚焦到新增欄位。
  - 視窗內有未儲存草稿時關閉要確認（`useConfirmation`，用詞「放棄尚未儲存的內容？」）。
  - 切換客戶時關閉視窗並清掉草稿（沿用現有清草稿邏輯）。
- 樣式只用 tokens，不用 `!important`；卡片外框沿用 `cy-op-panel` 或同等 tokens（`--cy-border`、`--cy-radius-lg`、`--cy-surface`）。

### 5.6 文件、版本、TODO
- `VERSION` 與 `package.json` 版本改為 `0.9.12`；`BUILD` 維持 `0`。
- `TODO.md` 最上方新增「0.9.12 Build 0」段落，摘要本單並連結 `docs/development/work-orders/WO-0.9.12.md`；同時在 0.9.11 段落補一行部署紀錄：`PR #203 合併 2e45269，CY Web Deploy #250（run 39139601492）部署成功`。
- `docs/architecture/CY_WEB_VISUAL_GUIDE.md`：§4.1 頂端列改為「標題＋一行說明＋頁面工具（設定按鈕等）」，移除說明圖示描述；模組設定一段改為「標題列的設定按鈕，開視窗處理」；新增「日期顯示一律 YYYY/MM/DD（`formatDate`／`formatDateTime`）」；記錄客戶相關紀錄採三張卡片＋專屬視窗。

## 6. 驗收清單

- [ ] 客戶明細下方是三張卡片（拜訪紀錄、報價紀錄、常用商品），沒有任何頁籤，也沒有「動態」。
- [ ] 每張卡片最多 3 筆，依日期由新到舊（常用商品依排序）；有筆數；空狀態文字正確。
- [ ] 「查看全部」與「＋ 新增」開同一個大視窗；「＋ 新增」直接進入新增狀態；視窗內新增、修改、報價修正、刪除都正常，關閉後卡片立即更新。
- [ ] 視窗內有未儲存內容時關閉會先確認；切換客戶時視窗關閉。
- [ ] 1440 寬三張並排；約 900 寬自動換行；390 寬直向一欄。
- [ ] 客戶標題下顯示「最後修改：YYYY/MM/DD HH:mm · 姓名」；後端回傳 `updatedBy`。
- [ ] 個人選單只有「我的帳號（密碼、Email）」「登出」。
- [ ] 所有頁面標題旁是一行說明（文字與 §2 第 9 點完全一致），沒有 ⓘ；手機不顯示說明。
- [ ] 客戶、商品、工作日誌標題列有「設定」按鈕（僅 ADMIN／SUPER_ADMIN）；一般使用者看不到；頁面內不再有「客戶｜設定」類頁籤。
- [ ] 設定視窗內容與 V0.9.11 設定頁籤相同；超級管理員可改結構設定、管理員只能看結構設定但可改工作日誌設定；未儲存時關閉會確認。
- [ ] 全站畫面上的日期都是 `YYYY/MM/DD`、日期時間 `YYYY/MM/DD HH:mm`（含 ERP 查詢頁）；`formatDate` 測試通過。
- [ ] `npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local` 全部通過。
- [ ] `node --test scripts/*.test.mjs` 全部通過（`audit-account-portal` 需先 `git clone --depth 1 https://github.com/simonliu1118-byte/cyapps .tmp/canonical-cyapps`）。
- [ ] VERSION／package.json 為 0.9.12；TODO、視覺規範已更新。

## 7. 截圖要求

以 mock 資料（客戶至少 5 筆拜訪、4 筆報價、2 個常用商品）擷取，放在 PR 說明或附件：
1. 客戶明細（桌面 1440 寬，淺色）：標題列說明＋設定按鈕、最後修改、三張卡片。
2. 同上，深色。
3. 拜訪紀錄視窗（查看全部）與新增狀態各一張。
4. 客戶明細（手機 390 寬）：卡片直向排列、標題列無說明。
5. 設定視窗（客戶，超級管理員）。
6. 個人選單展開。
7. 任一含日期的清單（例如瑕疵或工作日誌）顯示 `YYYY/MM/DD`。

## 8. 完成報告（執行者填）

- 驗收清單逐項結果：
- 與工作單不同之處與原因：
- 驗證指令輸出摘要：
- 截圖位置：

## 9. 審查紀錄（審查者填）

- （待審查）

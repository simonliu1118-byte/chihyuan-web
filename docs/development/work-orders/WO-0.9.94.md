# WO-0.9.94 全系統灰色說明小字：先盤點列表

- 狀態：第一段完成，待使用者確認／Claude 審查
- 分支：cyweb/wo-0.9.94-gray-text-inventory　PR：待建立（原工單 #392 已合併）

## 1. 背景（使用者原話）

- 「整個系統一堆無意義的說明灰色小字很醜 全刪了」
- 「另開工單，叫貨和門市也包含」
- 「先不要直接清，先掃出來列表我確認」

## 2. 已定案事項

- **本工作單分兩段**：
  - **第一段（本次）**：只盤點、列表，**不改任何程式或畫面**。
  - **第二段**：使用者逐項確認後，由 Claude 把結果寫回本工作單 §2.1，再交執行者刪除。
- **範圍是全系統**：叫貨、門市（訂購、黑名單、月度、售後維修、盤點）、ERP 查詢、人事、帳號與權限、我的帳號、登入、備份、異動紀錄、CY 程式、各業務模組，以及 `src/ui/` 的共用元件。
- **要列的**：畫面上以灰色或較小字顯示、用來**說明或教學**的文字。常見來源：
  - `Field` 的 `hint`（`src/ui/forms/Field.tsx` 的 `.cy-f-hint`）；
  - `MasterDetailEmpty` 的 `hint`，例如「從左側清單選一位客戶，或按清單上方的『＋ 新增』」；
  - 頁首說明 `pageDescription`（`.cy-shell-topbar-description`）及各頁的 `description`；
  - `<small>`，以及 class 名稱含 hint／note／desc／subtext／lead／meta／muted 的元素；
  - 共用元件內建的說明文字，例如 `TextInput`、`TextArea`、`SelectField`、`EntityPicker`、`ConfirmDialog`、`useFormPrompt`；
  - 程式裡用陣列或常數組出來的說明，以及 CSS `::before`／`::after` 的 `content` 文字。
- **不列的**：
  - 錯誤訊息、驗證提醒、Toast、確認對話框的主要問句；
  - 按鈕文字、欄位標題、表頭；
  - `title` 提示框（滑鼠移上才出現）與 `aria-label`；
  - 資料本身，例如日期、金額、人名、狀態膠囊。
- **帶資料的小字也要列**，例如「最後修改：日期 · 人」「12／300 字」「＋2 級距」「ERP 暫停到 15:30」，類型填「資料」，讓使用者一起決定。
- **空狀態文字也要列**，例如「尚無拜訪紀錄。」，類型填「空狀態」。

### 2.1 使用者確認結果（第二段由 Claude 填寫）

（第一段完成後填寫。）

## 3. 範圍（第一段）

- 掃描 `src/` 全部 `.tsx`、`.ts`、`.css`，找出符合 §2 的文字。
- **逐項到畫面上確認**：用本機開發環境或合成資料實際打開該畫面，確認文字真的會顯示、顯示在哪裡、是不是灰色或小字。程式裡有但畫面上永遠不會出現的，類型填「不會顯示」。
- 同一段文字出現在多處的（例如每個模組都有的 `MasterDetailEmpty` 提示），列一列並寫出所有出現位置。
- 結果寫在本工作單 §8 的表格，**一列一段文字**。

## 4. 不做

- 第一段不刪除、不修改任何文字、程式或樣式；不更動 VERSION／BUILD；不合併、不部署。
- 不重寫文字、不改用語。第二段也只刪除，除非使用者另外指定。
- 固定一條：不加多餘的測試與防護（共通規則 §11.4，使用者 2026-10-29）。只做本單要求的功能與實際會發生的錯誤處理；不加重複驗證、不會發生的情境檢查、層層 fail-closed、自設上限、安全開關，也不為這些寫測試。

## 5. 實作指引

- 先用 `rg`／`grep` 找候選，再逐項到畫面確認；不要只靠搜尋結果。Claude 先做過一次粗略搜尋，約 109 處（`<small>` 42、`hint=` 18、`description=` 14、`cy-md-toolbar-lead` 9，其餘散在各 class），只是起點，不是完整清單。
- §8 表格欄位：

  | # | 模組／畫面 | 位置（畫面上哪裡） | 文字原文 | 類型 | 來源（檔案:行） | 建議 | 理由 |
  | --- | --- | --- | --- | --- | --- | --- | --- |

  - **類型**：說明、空狀態、資料、不會顯示。
  - **建議**：刪除、保留、待決定。
  - **理由**：一句話。「保留」必須說明拿掉後使用者會少知道什麼。
- 依模組分段排列，同模組依畫面由上到下。
- 每個模組附一張桌面 1440 寬的截圖，用紅框標出列表中的小字，放在 PR 或 `docs/handoff/`，不放進主線文件目錄。

## 6. 驗收清單（第一段）

- [x] §8 表格涵蓋 §2 範圍內的所有模組，包含叫貨與門市。
- [x] 每一列都有原文、畫面位置、來源檔案:行、類型、建議與理由。
- [x] 每一列都已在畫面上確認過；不會顯示的標成「不會顯示」。
- [x] 每個模組有一張紅框截圖。
- [x] 程式、樣式、VERSION／BUILD 沒有任何變更（本工作單、截圖及 PROJECT_RULES §9.1 必要 handoff）。

## 7. 截圖要求

- 每個模組一張桌面 1440 寬截圖，紅框標出小字。手機版不需要。

## 8. 完成報告（執行者填）

### 8.1 本次交付與驗證方式

- 執行日期：2026-11-03（台灣時間）；基準：main `c8affe01a48c7358eacb6eda8090d35a93392136`（V0.9.93）。原工單 PR [#392](https://github.com/simonliu1118-byte/chihyuan-web/pull/392) 已合併，本次另開盤點報告 PR。
- 第一段共 **267 項**：說明 131、空狀態 82、資料 50、不會顯示 4。建議刪除 71、保留 191、待決定 5；**全部是候選建議，尚無使用者逐項確認，也未執行刪除。**
- 掃描 src 全部 165 個 .ts／.tsx／.css，從 JSX、hint／description／empty props、動態常數及 CSS content 找候選；另外追到 shared 中實際供 UI 使用的程式目錄與模組相依原因。
- 以實際 React 元件建立本機合成資料預覽，逐一開啟空清單、帶資料、編輯、設定、狀態分支與對話框；比對可見 DOM 與字級／顏色。桌面 viewport 1440×1000，另以 390 寬驗證手機專屬盤點提示（依本單不附手機圖）。
- 共 148 個已記錄的有效畫面狀態；可見候選皆核對到實際畫面文字，未顯示者改由呼叫條件與 CSS 交叉確認。較難由主頁操作抵達的條件，直接掛載同一實際元件並傳入合成 props，未複製或重寫產品文案。
- API 替身及紅框標記僅存在於被忽略的本機暫存預覽；沒有連線正式 API、ERP、Cloudflare 或 Identity，沒有正式 D1 讀寫。截圖均為合成資料。字級常見 12／13px，色彩依原有主題的 muted token，未改產品字體、顏色或間距。
- 原文中的「〈…〉」代表動態資料，不代表改寫文案。同文合併並列出所有已找到的呼叫位置；空狀態主句及其操作提示分成兩段。
- 另附 [GPT handoff](../../handoff/CYWEB-WO-0.9.94-GPT-20261103.md)，依 PROJECT_RULES §9.1 交給 Claude 審查；沒有額外建立業務規格。

### 8.2 邊界與未顯示項目

- 不列錯誤／驗證提醒、Toast、載入中回饋、確認框主要主文、按鈕／標籤／表頭、title／aria-label，以及人名、電話、日期、金額、備註等資料本身；只把附帶判讀用途的筆數、字數、最後修改、進度等另列為「資料」。
- CSS ::before／::after 已檢查：空 content、分隔箭頭與 attr(data-label) 屬裝飾／標籤；排班「連六」是違規檢核提醒，依 §2 排除，沒有漏當作一般說明。
- Field、FieldFrame、TextInput、TextArea、SelectField、Section、MasterDetailEmpty、Dialog、ConfirmDialog、useFormPrompt 的說明由呼叫端傳入，沒有額外的固定說明文案；實際文字已列在各模組，第二段不可為了刪一段文字而整批移除共用容器。EntityPicker 的內建空狀態另列。DataView 的預設「沒有資料」目前由所有產品呼叫端覆寫，標為不會顯示。
- 「已作廢，僅供查詢。」只在瑕疵畫面出現；銷售、代工的同文常數雖仍存在，呼叫端排除 voided，已合併註記於同一項。
- 人事「選擇員工查看假單、特休與補休。」：沒有 person 時 data-pane=list，桌面 hr-phase2b.css:21 與手機 app.css:550 都隱藏明細，實際沒有可見寬度。
- 程式目錄的兩個 web 程式簡介被 ProgramCatalogPage.tsx:47 的 web＋websiteUrl 篩選排除。它們仍是共用目錄資料，不能因 CY Web 不顯示就直接刪除共用資料。
- 首次登入的「請設定您的正式登入密碼。」可由 session 回 FIRST_LOGIN_REQUIRED、尚未帶員編／姓名的入口出現，已實際驗證，並非死文案。
- 紅框用來定位候選所在元素，可能包含同容器的合成資料；**是否處理以本表原文為準**，不表示框內所有內容都要刪除。截圖是每個模組的代表畫面，未將每個分支各附一張。

### 8.3 逐項候選表

#### 共用頁首

| # | 模組／畫面 | 位置（畫面上哪裡） | 文字原文 | 類型 | 來源（檔案:行） | 建議 | 理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 共用頁首／人事 | 桌面標題右側 | 人事資料、年資特休與薪資紀錄 | 說明 | [src/App.tsx:46](../../../src/App.tsx#L46) | 刪除 | 用途已能由標題或按鈕辨識。 |
| 2 | 共用頁首／客戶 | 桌面標題右側 | 客戶資料、聯絡人、拜訪與報價紀錄 | 說明 | [src/App.tsx:47](../../../src/App.tsx#L47) | 刪除 | 用途已能由標題或按鈕辨識。 |
| 3 | 共用頁首／商品 | 桌面標題右側 | 商品資料、品號、價格與單位換算 | 說明 | [src/App.tsx:48](../../../src/App.tsx#L48) | 刪除 | 用途已能由標題或按鈕辨識。 |
| 4 | 共用頁首／瑕疵 | 桌面標題右側 | 瑕疵回報、處理進度與作廢 | 說明 | [src/App.tsx:49](../../../src/App.tsx#L49) | 刪除 | 用途已能由標題或按鈕辨識。 |
| 5 | 共用頁首／銷售工單 | 桌面標題右側 | 銷售工單與出貨流程，正式單號由 ERP 提供 | 說明 | [src/App.tsx:50](../../../src/App.tsx#L50) | 刪除 | 用途已能由標題或按鈕辨識。 |
| 6 | 共用頁首／委外/代工 | 桌面標題右側 | 代工單、協力廠商、單價、BOM 與庫存 | 說明 | [src/App.tsx:51](../../../src/App.tsx#L51) | 刪除 | 用途已能由標題或按鈕辨識。 |
| 7 | 共用頁首／工作日誌 | 桌面標題右側 | 填寫日誌、送審與評分統計 | 說明 | [src/App.tsx:52](../../../src/App.tsx#L52) | 刪除 | 用途已能由標題或按鈕辨識。 |
| 8 | 共用頁首／ERP 查詢 | 桌面標題右側 | 查閱 SMART ERP 資料，只讀不改 | 說明 | [src/App.tsx:53](../../../src/App.tsx#L53) | 刪除 | 用途已能由標題或按鈕辨識。 |
| 9 | 共用頁首／叫貨 | 桌面標題右側 | 叫貨草稿、送出、到貨紀錄與未到貨管理 | 說明 | [src/App.tsx:54](../../../src/App.tsx#L54) | 刪除 | 用途已能由標題或按鈕辨識。 |
| 10 | 共用頁首／門市 | 桌面標題右側 | 門市訂購、通知取貨與黑名單，庫存盤點及月度待辦 | 說明 | [src/App.tsx:55](../../../src/App.tsx#L55) | 刪除 | 用途已能由標題或按鈕辨識。 |
| 11 | 共用頁首／帳號與權限 | 桌面標題右側 | 使用者、權限群組與系統安全 | 說明 | [src/App.tsx:56](../../../src/App.tsx#L56) | 刪除 | 用途已能由標題或按鈕辨識。 |
| 12 | 共用頁首／我的帳號 | 桌面標題右側 | 變更自己的密碼與 Email | 說明 | [src/App.tsx:57](../../../src/App.tsx#L57) | 刪除 | 用途已能由標題或按鈕辨識。 |
| 13 | 共用頁首／異動紀錄 | 桌面標題右側 | 誰在什麼時候改了什麼 | 說明 | [src/App.tsx:58](../../../src/App.tsx#L58) | 刪除 | 用途已能由標題或按鈕辨識。 |
| 14 | 共用頁首／備份管理 | 桌面標題右側 | 備份狀態、手動備份與重試副本 | 說明 | [src/App.tsx:59](../../../src/App.tsx#L59) | 刪除 | 用途已能由標題或按鈕辨識。 |
| 15 | 共用頁首／CY 程式 | 桌面標題右側 | CY 程式的功能、版本與使用入口 | 說明 | [src/App.tsx:60](../../../src/App.tsx#L60) | 刪除 | 用途已能由標題或按鈕辨識。 |

#### 共用清單與元件

| # | 模組／畫面 | 位置（畫面上哪裡） | 文字原文 | 類型 | 來源（檔案:行） | 建議 | 理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 16 | 共用清單 | 客戶、商品、銷售工單、代工、日誌、人事與叫貨清單筆數 | 共 〈n〉 筆 | 資料 | [src/runtime/modules/CustomerOperationalPage.tsx:819](../../../src/runtime/modules/CustomerOperationalPage.tsx#L819)<br>[src/runtime/modules/ItemOperationalPage.tsx:639](../../../src/runtime/modules/ItemOperationalPage.tsx#L639)<br>[src/runtime/modules/SalesOrderOperationalPage.tsx:533](../../../src/runtime/modules/SalesOrderOperationalPage.tsx#L533)<br>[src/runtime/modules/OutsourcingOperationalPage.tsx:559](../../../src/runtime/modules/OutsourcingOperationalPage.tsx#L559)<br>[src/runtime/modules/WorkLogOperationalPage.tsx:592](../../../src/runtime/modules/WorkLogOperationalPage.tsx#L592)<br>[src/runtime/modules/HrOperationalPage.tsx:329](../../../src/runtime/modules/HrOperationalPage.tsx#L329)<br>[src/runtime/modules/OrderingPage.tsx:553](../../../src/runtime/modules/OrderingPage.tsx#L553) | 保留 | 移除後無法知道篩選後的清單筆數。 |
| 17 | 共用清單 | 客戶、商品、銷售工單、代工、日誌、人事的分頁筆數 | 已載入 〈n〉 筆，還有更多 | 資料 | [src/runtime/modules/CustomerOperationalPage.tsx:819](../../../src/runtime/modules/CustomerOperationalPage.tsx#L819)<br>[src/runtime/modules/ItemOperationalPage.tsx:639](../../../src/runtime/modules/ItemOperationalPage.tsx#L639)<br>[src/runtime/modules/SalesOrderOperationalPage.tsx:533](../../../src/runtime/modules/SalesOrderOperationalPage.tsx#L533)<br>[src/runtime/modules/OutsourcingOperationalPage.tsx:559](../../../src/runtime/modules/OutsourcingOperationalPage.tsx#L559)<br>[src/runtime/modules/WorkLogOperationalPage.tsx:592](../../../src/runtime/modules/WorkLogOperationalPage.tsx#L592)<br>[src/runtime/modules/HrOperationalPage.tsx:329](../../../src/runtime/modules/HrOperationalPage.tsx#L329) | 保留 | 移除後容易把第一批資料誤認為全部資料。 |
| 18 | 共用篩選 | 各模組狀態篩選按鈕旁 | 〈狀態筆數〉 | 資料 | [src/ui/data/StatusFilter.tsx:17](../../../src/ui/data/StatusFilter.tsx#L17) | 保留 | 移除後少了各狀態筆數，無法快速判斷待處理量。 |
| 19 | 共用相關卡片 | 客戶、商品、人事卡片標題右側 | 〈相關紀錄筆數〉 | 資料 | [src/ui/records/RelatedCard.tsx:11](../../../src/ui/records/RelatedCard.tsx#L11) | 保留 | 移除後無法知道卡片只列部分紀錄。 |
| 20 | 客戶／人事／代工對象 | 客戶的電話、聯絡人、地址、重要備註編輯區；人事聯絡人、學經歷及相關卡片；代工對象電話編輯區 | 尚未填寫。 | 空狀態 | [src/runtime/modules/CustomerOperationalPage.tsx:960](../../../src/runtime/modules/CustomerOperationalPage.tsx#L960)<br>[src/runtime/modules/HrOperationalPage.tsx:392](../../../src/runtime/modules/HrOperationalPage.tsx#L392)<br>[src/runtime/modules/HrOperationalPage.tsx:394](../../../src/runtime/modules/HrOperationalPage.tsx#L394)<br>[src/runtime/modules/HrOperationalPage.tsx:396](../../../src/runtime/modules/HrOperationalPage.tsx#L396)<br>[src/runtime/modules/HrOperationalPage.tsx:649](../../../src/runtime/modules/HrOperationalPage.tsx#L649)<br>[src/runtime/modules/OutsourcingMasterData.tsx:221](../../../src/runtime/modules/OutsourcingMasterData.tsx#L221) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 21 | 共用操作紀錄 | 訂購、黑名單、月度、維修的空歷程 | 尚無操作紀錄 | 空狀態 | [src/runtime/modules/StoreOperationHistory.tsx:53](../../../src/runtime/modules/StoreOperationHistory.tsx#L53) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 22 | 共用搜尋選擇器 | 客戶、商品、工單等 EntityPicker 輸入框展開 | 請輸入關鍵字 | 說明 | [src/ui/pickers/EntityPicker.tsx:269](../../../src/ui/pickers/EntityPicker.tsx#L269) | 刪除 | 用途已能由標題、欄位或按鈕辨識。 |
| 23 | 共用搜尋選擇器 | 設定 minQueryLength 大於 1 的展開狀態 | 請至少輸入 〈n〉 個字元 | 說明 | [src/ui/pickers/EntityPicker.tsx:269](../../../src/ui/pickers/EntityPicker.tsx#L269) | 保留 | 移除後不知道還沒開始搜尋是因為字數不足。 |
| 24 | 共用搜尋選擇器 | 沒有搜尋結果的共用預設 | 找不到符合的資料 | 空狀態 | [src/ui/pickers/EntityPicker.tsx:57](../../../src/ui/pickers/EntityPicker.tsx#L57) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 25 | 共用資料表 | DataView 預設空狀態（現有三個呼叫端均自訂標題） | 沒有資料 | 不會顯示 | [src/ui/data/DataView.tsx:45](../../../src/ui/data/DataView.tsx#L45) | 保留 | 現行畫面都被呼叫端文案覆寫；刪除預設值會令未指定標題的共用表格失去空狀態。 |

#### 客戶

| # | 模組／畫面 | 位置（畫面上哪裡） | 文字原文 | 類型 | 來源（檔案:行） | 建議 | 理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 26 | 客戶 | 左側清單 | 沒有符合條件的客戶。 | 空狀態 | [src/runtime/modules/CustomerOperationalPage.tsx:838](../../../src/runtime/modules/CustomerOperationalPage.tsx#L838) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 27 | 客戶 | 未選取時明細主句 | 尚未選擇客戶 | 空狀態 | [src/runtime/modules/CustomerOperationalPage.tsx:951](../../../src/runtime/modules/CustomerOperationalPage.tsx#L951) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 28 | 客戶 | 未選取時主句下方 | 從左側清單選一位客戶，或按清單上方的「＋ 新增客戶」。 | 說明 | [src/runtime/modules/CustomerOperationalPage.tsx:951](../../../src/runtime/modules/CustomerOperationalPage.tsx#L951) | 刪除 | 功能或欄位已能表達用途，這段重複說明可刪。 |
| 29 | 客戶 | 新增／修改的重要備註區 | 會以醒目提示顯示在客戶資料最上方，例如付款條件、出貨注意事項。 | 說明 | [src/runtime/modules/CustomerOperationalPage.tsx:879](../../../src/runtime/modules/CustomerOperationalPage.tsx#L879) | 刪除 | 功能或欄位已能表達用途，這段重複說明可刪。 |
| 30 | 客戶 | 明細名稱下方 | 最後修改：〈日期時間〉 · 〈人員〉 | 資料 | [src/runtime/modules/CustomerOperationalPage.tsx:892](../../../src/runtime/modules/CustomerOperationalPage.tsx#L892) | 保留 | 移除後無法知道資料何時、由誰更新。 |
| 31 | 客戶 | 拜訪卡片 | 尚無拜訪紀錄。 | 空狀態 | [src/runtime/modules/CustomerOperationalPage.tsx:937](../../../src/runtime/modules/CustomerOperationalPage.tsx#L937) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 32 | 客戶／商品 | 報價卡片 | 尚無報價紀錄。 | 空狀態 | [src/runtime/modules/CustomerOperationalPage.tsx:941](../../../src/runtime/modules/CustomerOperationalPage.tsx#L941)<br>[src/runtime/modules/ItemOperationalPage.tsx:750](../../../src/runtime/modules/ItemOperationalPage.tsx#L750) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 33 | 客戶 | 常用商品卡片 | 尚無常用商品。 | 空狀態 | [src/runtime/modules/CustomerOperationalPage.tsx:945](../../../src/runtime/modules/CustomerOperationalPage.tsx#L945) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 34 | 客戶 | 報價卡片最多顯示兩級距後 | ＋〈n〉 級距 | 資料 | [src/runtime/modules/CustomerOperationalPage.tsx:943](../../../src/runtime/modules/CustomerOperationalPage.tsx#L943) | 保留 | 移除後看不出該報價還有未展開的價格級距。 |
| 35 | 客戶 | 查看全部拜訪的空白結果 | 沒有符合條件的拜訪紀錄。 | 空狀態 | [src/runtime/modules/CustomerOperationalPage.tsx:1024](../../../src/runtime/modules/CustomerOperationalPage.tsx#L1024) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 36 | 客戶 | 查看全部報價的空白結果 | 沒有符合條件的報價紀錄。 | 空狀態 | [src/runtime/modules/CustomerOperationalPage.tsx:1113](../../../src/runtime/modules/CustomerOperationalPage.tsx#L1113) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 37 | 客戶 | 查看全部常用商品的空白結果 | 沒有符合條件的常用商品。 | 空狀態 | [src/runtime/modules/CustomerOperationalPage.tsx:1161](../../../src/runtime/modules/CustomerOperationalPage.tsx#L1161) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 38 | 客戶 | 拜訪紀錄每筆內容下方 | 〈人員〉 · rev.〈版本〉 | 資料 | [src/runtime/modules/CustomerOperationalPage.tsx:1017](../../../src/runtime/modules/CustomerOperationalPage.tsx#L1017) | 待決定 | 人員有辨識價值，技術版次可考慮移除；第一段不重寫。 |

#### 商品

| # | 模組／畫面 | 位置（畫面上哪裡） | 文字原文 | 類型 | 來源（檔案:行） | 建議 | 理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 39 | 商品 | 左側清單 | 沒有符合條件的商品。 | 空狀態 | [src/runtime/modules/ItemOperationalPage.tsx:650](../../../src/runtime/modules/ItemOperationalPage.tsx#L650) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 40 | 商品 | 未選取時明細主句 | 尚未選擇商品 | 空狀態 | [src/runtime/modules/ItemOperationalPage.tsx:759](../../../src/runtime/modules/ItemOperationalPage.tsx#L759) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 41 | 商品 | 未選取時明細說明 | 從左側清單選一項商品，或按清單上方的「＋ 新增商品」。 | 說明 | [src/runtime/modules/ItemOperationalPage.tsx:759](../../../src/runtime/modules/ItemOperationalPage.tsx#L759) | 刪除 | 功能或欄位已能表達用途，這段重複說明可刪。 |
| 42 | 商品 | 新增表單標題下方 | 品號必須是 SMART ERP 中已存在的品號。 | 說明 | [src/runtime/modules/ItemOperationalPage.tsx:663](../../../src/runtime/modules/ItemOperationalPage.tsx#L663) | 保留 | 移除後使用者可能誤以為可自行建立 ERP 尚不存在的品號。 |
| 43 | 商品 | 修改表單標題下方 | 品號請用「更改品號」修改，會保留歷史品號。 | 說明 | [src/runtime/modules/ItemOperationalPage.tsx:663](../../../src/runtime/modules/ItemOperationalPage.tsx#L663) | 刪除 | 功能或欄位已能表達用途，這段重複說明可刪。 |
| 44 | 商品 | 詳細資料的曾用品號列 | 曾用品號：〈品號〉（〈日期〉 更改） | 資料 | [src/runtime/modules/ItemOperationalPage.tsx:732](../../../src/runtime/modules/ItemOperationalPage.tsx#L732) | 保留 | 移除後無法直接辨識歷史品號及更改日期。 |
| 45 | 商品 | 瑕疵卡片 | 尚無瑕疵紀錄。 | 空狀態 | [src/runtime/modules/ItemOperationalPage.tsx:740](../../../src/runtime/modules/ItemOperationalPage.tsx#L740) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 46 | 商品 | 瑕疵卡片摘要 | 建立 〈n〉 · 處理中 〈n〉 · 已解決 〈n〉 | 資料 | [src/runtime/modules/ItemOperationalPage.tsx:738](../../../src/runtime/modules/ItemOperationalPage.tsx#L738) | 保留 | 移除後卡片不能顯示各處理階段的筆數。 |

#### 瑕疵

| # | 模組／畫面 | 位置（畫面上哪裡） | 文字原文 | 類型 | 來源（檔案:行） | 建議 | 理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 47 | 瑕疵 | 左側清單 | 沒有符合條件的瑕疵紀錄。 | 空狀態 | [src/runtime/modules/DefectOperationalPage.tsx:412](../../../src/runtime/modules/DefectOperationalPage.tsx#L412) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 48 | 瑕疵 | 未選取時明細主句 | 尚未選擇瑕疵紀錄 | 空狀態 | [src/runtime/modules/DefectOperationalPage.tsx:468](../../../src/runtime/modules/DefectOperationalPage.tsx#L468) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 49 | 瑕疵 | 未選取時明細說明 | 從左側清單選一筆，或按清單上方的「＋ 新增瑕疵」。 | 說明 | [src/runtime/modules/DefectOperationalPage.tsx:468](../../../src/runtime/modules/DefectOperationalPage.tsx#L468) | 刪除 | 功能或欄位已能表達用途，這段重複說明可刪。 |
| 50 | 瑕疵 | 新增／修改表單標題下方 | 已建檔與處理中的瑕疵可以修改；已處理的需先重新開啟。 | 說明 | [src/runtime/modules/defect/DefectForm.tsx:84](../../../src/runtime/modules/defect/DefectForm.tsx#L84) | 刪除 | 功能或欄位已能表達用途，這段重複說明可刪。 |
| 51 | 瑕疵 | 明細標題下方 | 瑕疵 #〈編號〉 · 回報 〈日期〉 | 資料 | [src/runtime/modules/DefectOperationalPage.tsx:434](../../../src/runtime/modules/DefectOperationalPage.tsx#L434) | 保留 | 移除後少了紀錄編號與回報時間的查核線索。 |
| 52 | 瑕疵 | 明細進度提示（created） | 確認問題後按「開始處理」；建錯了可以「刪除」。 | 說明 | [src/runtime/modules/status-flow.ts:20](../../../src/runtime/modules/status-flow.ts#L20) | 刪除 | 狀態與操作按鈕已能表達目前步驟。 |
| 53 | 瑕疵 | 明細進度提示（processing） | 處理完成後按「完成處理」，填寫處理結果。 | 說明 | [src/runtime/modules/status-flow.ts:21](../../../src/runtime/modules/status-flow.ts#L21) | 刪除 | 狀態與操作按鈕已能表達目前步驟。 |
| 54 | 瑕疵 | 明細進度提示（resolved） | 已結案。問題再次發生時可以「重新開啟」。 | 說明 | [src/runtime/modules/status-flow.ts:22](../../../src/runtime/modules/status-flow.ts#L22) | 刪除 | 狀態與操作按鈕已能表達目前步驟。 |
| 55 | 瑕疵／銷售工單／委外/代工 | 瑕疵已作廢明細；銷售、代工的同文常數未使用 | 已作廢，僅供查詢。 | 說明 | [src/runtime/modules/status-flow.ts:23](../../../src/runtime/modules/status-flow.ts#L23)<br>[src/runtime/modules/status-flow.ts:31](../../../src/runtime/modules/status-flow.ts#L31)<br>[src/runtime/modules/status-flow.ts:39](../../../src/runtime/modules/status-flow.ts#L39) | 刪除 | 瑕疵狀態已表達作廢；另兩個呼叫端排除 voided，留在常數中但不會顯示。 |

#### 銷售工單

| # | 模組／畫面 | 位置（畫面上哪裡） | 文字原文 | 類型 | 來源（檔案:行） | 建議 | 理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 56 | 銷售工單 | 左側清單 | 沒有符合條件的工單。 | 空狀態 | [src/runtime/modules/SalesOrderOperationalPage.tsx:544](../../../src/runtime/modules/SalesOrderOperationalPage.tsx#L544) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 57 | 銷售工單 | 未選取時明細主句 | 尚未選擇工單 | 空狀態 | [src/runtime/modules/SalesOrderOperationalPage.tsx:654](../../../src/runtime/modules/SalesOrderOperationalPage.tsx#L654) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 58 | 銷售工單 | 未選取時明細說明 | 從左側清單選一張工單，或按清單上方的「＋ 新增工單」。 | 說明 | [src/runtime/modules/SalesOrderOperationalPage.tsx:654](../../../src/runtime/modules/SalesOrderOperationalPage.tsx#L654) | 刪除 | 功能或欄位已能表達用途，這段重複說明可刪。 |
| 59 | 銷售工單 | 新增／修改表單標題下方 | ERP 開單前可以修改；開單後只能更正 ERP 資料。 | 說明 | [src/runtime/modules/SalesOrderOperationalPage.tsx:555](../../../src/runtime/modules/SalesOrderOperationalPage.tsx#L555) | 刪除 | 功能或欄位已能表達用途，這段重複說明可刪。 |
| 60 | 銷售工單 | 新增／修改客戶選擇器下方 | 未建檔的現場客戶可留空，改填下方名稱。 | 說明 | [src/runtime/modules/SalesOrderOperationalPage.tsx:564](../../../src/runtime/modules/SalesOrderOperationalPage.tsx#L564) | 刪除 | 用途已能由標題或按鈕辨識。 |
| 61 | 銷售工單 | 工單明細標題下方 | 數量與單價最多四位小數。 | 說明 | [src/runtime/modules/SalesOrderOperationalPage.tsx:582](../../../src/runtime/modules/SalesOrderOperationalPage.tsx#L582) | 刪除 | 功能或欄位已能表達用途，這段重複說明可刪。 |
| 62 | 銷售工單 | ERP 回填／更正視窗的客戶編號欄下方 | 必須與 CY Web 客戶資料中的 客戶編號相同。 | 說明 | [src/runtime/modules/SalesOrderOperationalPage.tsx:428](../../../src/runtime/modules/SalesOrderOperationalPage.tsx#L428) | 保留 | 移除後少了客戶編號必須一致的限制資訊。 |
| 63 | 銷售工單 | ERP 回填視窗說明 | 填入 SMART ERP 開單後的資料，工單會改為「已開單」。 | 說明 | [src/runtime/modules/SalesOrderOperationalPage.tsx:426](../../../src/runtime/modules/SalesOrderOperationalPage.tsx#L426) | 刪除 | 用途已能由標題或按鈕辨識。 |
| 64 | 銷售工單 | ERP 更正視窗說明 | 修改已回填的 客戶編號或銷售單號，並保留更正紀錄。 | 說明 | [src/runtime/modules/SalesOrderOperationalPage.tsx:426](../../../src/runtime/modules/SalesOrderOperationalPage.tsx#L426) | 刪除 | 用途已能由標題或按鈕辨識。 |
| 65 | 銷售工單 | 明細進度提示（created） | 在 ERP 開好銷貨單後，按「ERP 回填／開單」填入 ERP 單號。 | 說明 | [src/runtime/modules/status-flow.ts:26](../../../src/runtime/modules/status-flow.ts#L26) | 刪除 | 狀態與操作按鈕已能表達目前步驟。 |
| 66 | 銷售工單 | 明細進度提示（issued） | 有貨就按「直接撿貨」；需要等貨按「轉待貨」。 | 說明 | [src/runtime/modules/status-flow.ts:27](../../../src/runtime/modules/status-flow.ts#L27) | 刪除 | 狀態與操作按鈕已能表達目前步驟。 |
| 67 | 銷售工單 | 明細進度提示（waiting_stock） | 貨到並撿好後按「完成撿貨」。 | 說明 | [src/runtime/modules/status-flow.ts:28](../../../src/runtime/modules/status-flow.ts#L28) | 刪除 | 狀態與操作按鈕已能表達目前步驟。 |
| 68 | 銷售工單 | 明細進度提示（picked） | 交貨後按「確認出貨」。 | 說明 | [src/runtime/modules/status-flow.ts:29](../../../src/runtime/modules/status-flow.ts#L29) | 刪除 | 狀態與操作按鈕已能表達目前步驟。 |
| 69 | 銷售工單 | 明細進度提示（shipped） | 已出貨。誤按時可以「撤銷出貨」。 | 說明 | [src/runtime/modules/status-flow.ts:30](../../../src/runtime/modules/status-flow.ts#L30) | 刪除 | 狀態與操作按鈕已能表達目前步驟。 |

#### 委外/代工

| # | 模組／畫面 | 位置（畫面上哪裡） | 文字原文 | 類型 | 來源（檔案:行） | 建議 | 理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 70 | 委外/代工 | 協力廠商清單 | 尚無代工對象，請按上方「＋ 新增代工對象」。 | 空狀態 | [src/runtime/modules/OutsourcingMasterData.tsx:199](../../../src/runtime/modules/OutsourcingMasterData.tsx#L199) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 71 | 委外/代工 | 未選取代工對象主句 | 尚未選擇代工對象 | 空狀態 | [src/runtime/modules/OutsourcingMasterData.tsx:250](../../../src/runtime/modules/OutsourcingMasterData.tsx#L250) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 72 | 委外/代工 | 未選取代工對象說明 | 從左側清單選一位，或按清單上方的「＋ 新增代工對象」。 | 說明 | [src/runtime/modules/OutsourcingMasterData.tsx:250](../../../src/runtime/modules/OutsourcingMasterData.tsx#L250) | 刪除 | 功能或欄位已能表達用途，這段重複說明可刪。 |
| 73 | 委外/代工 | 代工對象單價區 | 尚未設定現行單價。計價時會依這裡的單價計算。 | 空狀態 | [src/runtime/modules/OutsourcingMasterData.tsx:248](../../../src/runtime/modules/OutsourcingMasterData.tsx#L248) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 74 | 委外/代工 | 設定／修改單價視窗標題下方 | 同一商品只有一個現行單價；修改後，已計價的代工單不受影響。 | 說明 | [src/runtime/modules/OutsourcingMasterData.tsx:178](../../../src/runtime/modules/OutsourcingMasterData.tsx#L178) | 保留 | 移除後不易知道改價只影響後續計價。 |
| 75 | 委外/代工 | BOM 清單 | 尚無 BOM，請按上方「＋ 新增 BOM」。 | 空狀態 | [src/runtime/modules/OutsourcingMasterData.tsx:343](../../../src/runtime/modules/OutsourcingMasterData.tsx#L343) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 76 | 委外/代工 | 未選取 BOM 主句 | 尚未選擇 BOM | 空狀態 | [src/runtime/modules/OutsourcingMasterData.tsx:384](../../../src/runtime/modules/OutsourcingMasterData.tsx#L384) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 77 | 委外/代工 | 未選取 BOM 說明 | 從左側清單選一個，或按清單上方的「＋ 新增 BOM」。 | 說明 | [src/runtime/modules/OutsourcingMasterData.tsx:384](../../../src/runtime/modules/OutsourcingMasterData.tsx#L384) | 刪除 | 功能或欄位已能表達用途，這段重複說明可刪。 |
| 78 | 委外/代工 | 新增／修改 BOM 標題下方 | 一個成品可以有多個 BOM；入庫時若有多個使用中的 BOM，需要選擇實際用的那一個。 | 說明 | [src/runtime/modules/OutsourcingMasterData.tsx:349](../../../src/runtime/modules/OutsourcingMasterData.tsx#L349) | 刪除 | 功能或欄位已能表達用途，這段重複說明可刪。 |
| 79 | 委外/代工 | 代工單清單 | 尚無代工單。 | 空狀態 | [src/runtime/modules/OutsourcingOperationalPage.tsx:563](../../../src/runtime/modules/OutsourcingOperationalPage.tsx#L563) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 80 | 委外/代工 | 未選取代工單主句 | 尚未選擇代工單 | 空狀態 | [src/runtime/modules/OutsourcingOperationalPage.tsx:662](../../../src/runtime/modules/OutsourcingOperationalPage.tsx#L662) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 81 | 委外/代工 | 未選取代工單說明 | 從左側清單選一張代工單，或按清單上方的「＋ 新增代工單」。 | 說明 | [src/runtime/modules/OutsourcingOperationalPage.tsx:662](../../../src/runtime/modules/OutsourcingOperationalPage.tsx#L662) | 刪除 | 功能或欄位已能表達用途，這段重複說明可刪。 |
| 82 | 委外/代工 | 新增／一般修改表單 | 確認出庫前可以修改內容。 | 說明 | [src/runtime/modules/OutsourcingOperationalPage.tsx:574](../../../src/runtime/modules/OutsourcingOperationalPage.tsx#L574) | 刪除 | 功能或欄位已能表達用途，這段重複說明可刪。 |
| 83 | 委外/代工 | 更正出庫表單 | 儲存後會以新的出庫資料取代原本的出庫，並保留更正紀錄。 | 說明 | [src/runtime/modules/OutsourcingOperationalPage.tsx:574](../../../src/runtime/modules/OutsourcingOperationalPage.tsx#L574) | 保留 | 移除後少了取代既有出庫資料的影響說明。 |
| 84 | 委外/代工 | 出庫料件標題右側 | 每列料件、數量與單位必填 | 說明 | [src/runtime/modules/OutsourcingOperationalPage.tsx:587](../../../src/runtime/modules/OutsourcingOperationalPage.tsx#L587) | 刪除 | 功能或欄位已能表達用途，這段重複說明可刪。 |
| 85 | 委外/代工 | 代工庫存 | 目前沒有非零代工庫存。 | 空狀態 | [src/runtime/modules/OutsourcingOperationalPage.tsx:677](../../../src/runtime/modules/OutsourcingOperationalPage.tsx#L677) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 86 | 委外/代工 | 明細進度提示（pending_outbound） | 料件交給代工對象後按「確認出庫」。 | 說明 | [src/runtime/modules/status-flow.ts:34](../../../src/runtime/modules/status-flow.ts#L34) | 刪除 | 狀態與操作按鈕已能表達目前步驟。 |
| 87 | 委外/代工 | 明細進度提示（outbound） | 成品收回後按「確認入庫」。 | 說明 | [src/runtime/modules/status-flow.ts:35](../../../src/runtime/modules/status-flow.ts#L35) | 刪除 | 狀態與操作按鈕已能表達目前步驟。 |
| 88 | 委外/代工 | 明細進度提示（received） | 按「計價」，依代工單價計算應付金額。 | 說明 | [src/runtime/modules/status-flow.ts:36](../../../src/runtime/modules/status-flow.ts#L36) | 刪除 | 狀態與操作按鈕已能表達目前步驟。 |
| 89 | 委外/代工 | 明細進度提示（priced） | 付款後按「確認付款」。 | 說明 | [src/runtime/modules/status-flow.ts:37](../../../src/runtime/modules/status-flow.ts#L37) | 刪除 | 狀態與操作按鈕已能表達目前步驟。 |
| 90 | 委外/代工 | 明細進度提示（paid） | 流程已完成。 | 說明 | [src/runtime/modules/status-flow.ts:38](../../../src/runtime/modules/status-flow.ts#L38) | 刪除 | 狀態與操作按鈕已能表達目前步驟。 |

#### 工作日誌與各模組設定

| # | 模組／畫面 | 位置（畫面上哪裡） | 文字原文 | 類型 | 來源（檔案:行） | 建議 | 理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 91 | 工作日誌 | 左側清單 | 沒有符合條件的工作日誌。 | 空狀態 | [src/runtime/modules/WorkLogOperationalPage.tsx:597](../../../src/runtime/modules/WorkLogOperationalPage.tsx#L597) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 92 | 工作日誌 | 未選取時主句 | 尚未選擇工作日誌 | 空狀態 | [src/runtime/modules/WorkLogOperationalPage.tsx:690](../../../src/runtime/modules/WorkLogOperationalPage.tsx#L690) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 93 | 工作日誌 | 未選取時說明 | 從左側清單選一筆，或按清單上方的「＋ 新增日誌」。 | 說明 | [src/runtime/modules/WorkLogOperationalPage.tsx:690](../../../src/runtime/modules/WorkLogOperationalPage.tsx#L690) | 刪除 | 功能或欄位已能表達用途，這段重複說明可刪。 |
| 94 | 工作日誌 | 統計區加權平均日分下方 | 目標 〈分數〉 · 最低 〈分數〉 | 資料 | [src/runtime/modules/WorkLogOperationalPage.tsx:570](../../../src/runtime/modules/WorkLogOperationalPage.tsx#L570) | 保留 | 移除後看不到評分目標與最低標準。 |
| 95 | 工作日誌 | 工作內容標題右側 | 至少一個工作項目；每列內容或計分分類擇一 | 說明 | [src/runtime/modules/WorkLogOperationalPage.tsx:621](../../../src/runtime/modules/WorkLogOperationalPage.tsx#L621) | 刪除 | 功能或欄位已能表達用途，這段重複說明可刪。 |
| 96 | 工作日誌設定 | 計分設定區 | 已審核日誌的結果保留，不因設定變更重新計分。 | 說明 | [src/runtime/modules/ModuleSettingsPanel.tsx:102](../../../src/runtime/modules/ModuleSettingsPanel.tsx#L102) | 保留 | 移除後容易以為設定變更會回溯影響已審核結果。 |
| 97 | 各模組設定 | 尚無設定內容 | 尚無設定資料。 | 空狀態 | [src/runtime/modules/ModuleSettingsPanel.tsx:112](../../../src/runtime/modules/ModuleSettingsPanel.tsx#L112) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 98 | 工作日誌 | 明細進度提示（created） | 內容確認後按「送出審核」。 | 說明 | [src/runtime/modules/status-flow.ts:42](../../../src/runtime/modules/status-flow.ts#L42) | 刪除 | 狀態與操作按鈕已能表達目前步驟。 |
| 99 | 工作日誌 | 明細進度提示（pending_review） | 等待審核；審核人按「審核計分」，需要修改時可以「撤回審核」。 | 說明 | [src/runtime/modules/status-flow.ts:43](../../../src/runtime/modules/status-flow.ts#L43) | 刪除 | 狀態與操作按鈕已能表達目前步驟。 |
| 100 | 工作日誌 | 明細進度提示（reviewed） | 已完成審核。 | 說明 | [src/runtime/modules/status-flow.ts:44](../../../src/runtime/modules/status-flow.ts#L44) | 刪除 | 狀態與操作按鈕已能表達目前步驟。 |

#### 叫貨

| # | 模組／畫面 | 位置（畫面上哪裡） | 文字原文 | 類型 | 來源（檔案:行） | 建議 | 理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 101 | 叫貨 | 左側歷史清單 | 沒有符合條件的叫貨紀錄。送出後的叫貨單才會出現在這裡。 | 空狀態 | [src/runtime/modules/OrderingPage.tsx:563](../../../src/runtime/modules/OrderingPage.tsx#L563) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 102 | 叫貨 | 未到貨明細標題下方 | 已送出、還有剩餘數量的品項，共 〈n〉 項。 | 資料 | [src/runtime/modules/OrderingPage.tsx:582](../../../src/runtime/modules/OrderingPage.tsx#L582) | 保留 | 移除後少了筆數、進度或時間的判讀資訊。 |
| 103 | 叫貨 | 未到貨明細空白時 | 目前沒有未到貨的品項。 | 空狀態 | [src/runtime/modules/OrderingPage.tsx:600](../../../src/runtime/modules/OrderingPage.tsx#L600) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 104 | 叫貨 | 每張未到貨單摘要 | 〈n〉 項未到 | 資料 | [src/runtime/modules/OrderingPage.tsx:589](../../../src/runtime/modules/OrderingPage.tsx#L589) | 保留 | 移除後少了筆數、進度或時間的判讀資訊。 |
| 105 | 叫貨 | 廠商頁籤空白時 | 目前沒有可使用的廠商來源。 | 空狀態 | [src/runtime/modules/OrderingPage.tsx:620](../../../src/runtime/modules/OrderingPage.tsx#L620) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 106 | 叫貨 | 未選來源明細主句 | 選擇叫貨來源 | 空狀態 | [src/runtime/modules/OrderingPage.tsx:622](../../../src/runtime/modules/OrderingPage.tsx#L622) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 107 | 叫貨 | 未選來源明細說明 | 從上方頁籤選擇來源開始叫貨，或從左側開啟已送出的叫貨單。 | 說明 | [src/runtime/modules/OrderingPage.tsx:622](../../../src/runtime/modules/OrderingPage.tsx#L622) | 刪除 | 功能或欄位已能表達用途，這段重複說明可刪。 |
| 108 | 叫貨 | 已隱藏來源清單 | 目前沒有已隱藏的來源。 | 空狀態 | [src/runtime/modules/OrderingPage.tsx:650](../../../src/runtime/modules/OrderingPage.tsx#L650) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 109 | 叫貨 | 來源註記欄下方 | 〈n〉／300 字，可換行 | 資料 | [src/runtime/modules/OrderingPage.tsx:659](../../../src/runtime/modules/OrderingPage.tsx#L659) | 待決定 | 字數剩餘有用，但欄位本身已可換行；第一段不拆改文字。 |
| 110 | 叫貨 | 草稿日期或備註修改未失焦時 | 離開欄位後自動儲存 | 說明 | [src/runtime/modules/OrderingPage.tsx:518](../../../src/runtime/modules/OrderingPage.tsx#L518) | 保留 | 移除後不易知道草稿欄位的儲存時機。 |
| 111 | 叫貨 | 已送出叫貨單標題右側 | 送出 〈日期時間〉・版本 〈n〉 | 資料 | [src/runtime/modules/OrderingPage.tsx:472](../../../src/runtime/modules/OrderingPage.tsx#L472) | 保留 | 移除後少了送出時間及已送出版本的識別。 |
| 112 | 叫貨 | 草稿標題儲存狀態 | 已儲存 | 資料 | [src/runtime/modules/OrderingPage.tsx:62](../../../src/runtime/modules/OrderingPage.tsx#L62) | 保留 | 移除後無法確認自動儲存是否完成。 |
| 113 | 叫貨 | 草稿標題儲存狀態 | 尚未儲存 | 資料 | [src/runtime/modules/OrderingPage.tsx:62](../../../src/runtime/modules/OrderingPage.tsx#L62) | 保留 | 移除後看不到仍有未儲存內容。 |
| 114 | 叫貨／共用來源選擇 | 搜尋來源選單 | 符合搜尋的廠商 | 說明 | [src/ui/OrderingSourcePicker.tsx:46](../../../src/ui/OrderingSourcePicker.tsx#L46) | 刪除 | 功能或欄位已能表達用途，這段重複說明可刪。 |
| 115 | 叫貨／共用來源選擇 | 來源選單空白結果 | 找不到符合的來源 | 空狀態 | [src/ui/OrderingSourcePicker.tsx:48](../../../src/ui/OrderingSourcePicker.tsx#L48) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 116 | 叫貨／共用來源選擇 | 廠商搜尋無結果；OrderingSourceChips 與 OrderingSourcePicker | 沒有符合的廠商 | 空狀態 | [src/ui/OrderingSourceChips.tsx:31](../../../src/ui/OrderingSourceChips.tsx#L31)<br>[src/ui/OrderingSourcePicker.tsx:49](../../../src/ui/OrderingSourcePicker.tsx#L49)<br>[src/runtime/modules/ErpJobStatus.tsx:15](../../../src/runtime/modules/ErpJobStatus.tsx#L15) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 117 | 叫貨／進貨輔助 | 日期條件下方 | 起訖都要填，最多 31 天。會查這段期間所有客戶的銷貨單與銷退單，依品號、日期加總（含贈品），再查各品號目前庫存。品號可點開查看 ERP 資料。 | 說明 | [src/runtime/modules/RestockAssist.tsx:193](../../../src/runtime/modules/RestockAssist.tsx#L193) | 保留 | 移除後少了查詢期間上限、含贈品及即時庫存的範圍說明。 |
| 118 | 叫貨／進貨輔助 | 結果表上方 | 共 〈n〉 個品號（顯示 〈m〉 個） | 資料 | [src/runtime/modules/RestockAssist.tsx:101](../../../src/runtime/modules/RestockAssist.tsx#L101) | 保留 | 移除後看不到篩選前後品號數量。 |
| 119 | 叫貨／進貨輔助 | 篩選後無品號 | 沒有符合篩選條件的品號。 | 空狀態 | [src/runtime/modules/RestockAssist.tsx:145](../../../src/runtime/modules/RestockAssist.tsx#L145) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 120 | 叫貨／進貨輔助 | 查詢進度 | 正在產生銷貨、銷退報表（已完成 〈n〉 / 〈m〉 張），之後分批查詢各品號庫存。 | 資料 | [src/runtime/modules/ErpJobStatus.tsx:39](../../../src/runtime/modules/ErpJobStatus.tsx#L39) | 保留 | 移除後少了筆數、進度或時間的判讀資訊。 |
| 121 | 叫貨／進貨輔助 | 庫存查詢進度 | 已查庫存 〈n〉 / 〈m〉 個品號，分批查詢中。 | 資料 | [src/runtime/modules/ErpJobStatus.tsx:38](../../../src/runtime/modules/ErpJobStatus.tsx#L38) | 保留 | 移除後少了筆數、進度或時間的判讀資訊。 |
| 122 | 叫貨／進貨輔助 | 庫存查詢完成整理中 | 已查庫存 〈n〉 / 〈m〉 個品號，整理結果中。 | 資料 | [src/runtime/modules/ErpJobStatus.tsx:38](../../../src/runtime/modules/ErpJobStatus.tsx#L38) | 保留 | 移除後少了筆數、進度或時間的判讀資訊。 |
| 123 | 叫貨 | 到貨紀錄、修改紀錄標題旁 | 〈n〉 筆 | 資料 | [src/runtime/modules/OrderingPage.tsx:487](../../../src/runtime/modules/OrderingPage.tsx#L487)<br>[src/runtime/modules/OrderingPage.tsx:530](../../../src/runtime/modules/OrderingPage.tsx#L530) | 保留 | 移除後無法知道收合的到貨及修改紀錄各有幾筆。 |

#### 門市

| # | 模組／畫面 | 位置（畫面上哪裡） | 文字原文 | 類型 | 來源（檔案:行） | 建議 | 理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 124 | 門市／訂購 | 訂購清單空白時 | 沒有符合條件的訂購。 | 空狀態 | [src/runtime/modules/StoreCustomerOrders.tsx:131](../../../src/runtime/modules/StoreCustomerOrders.tsx#L131) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 125 | 門市／黑名單 | 由取消訂購帶入的新增視窗上方 | 訂購取消尚未儲存；儲存後將同時取消並加入黑名單。 | 說明 | [src/runtime/modules/StoreCustomerOrders.tsx:156](../../../src/runtime/modules/StoreCustomerOrders.tsx#L156) | 保留 | 移除後無法知道此處取消會連帶放棄原訂購取消操作。 |
| 126 | 門市／黑名單 | 同名聯絡方式複核視窗的補充說明（只列輔助句，排除主要問句） | 不同人不會自動合併或套用處置。 | 說明 | [src/runtime/modules/StoreCustomerOrders.tsx:166](../../../src/runtime/modules/StoreCustomerOrders.tsx#L166) | 保留 | 移除後少了不同人不會自動套用處置的影響說明。 |
| 127 | 門市／售後維修 | 維修清單空白時 | 沒有符合條件的維修單。 | 空狀態 | [src/runtime/modules/StoreRepairs.tsx:94](../../../src/runtime/modules/StoreRepairs.tsx#L94) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 128 | 門市／售後維修 | 取消維修視窗補充說明 | 取消維修後仍必須通知顧客，並完成機器歸還才會結案。 | 說明 | [src/runtime/modules/StoreRepairs.tsx:125](../../../src/runtime/modules/StoreRepairs.tsx#L125) | 保留 | 移除後容易誤以為取消維修即已結案。 |
| 129 | 門市／售後維修 | 照片視窗上方 | 〈n〉／3 張 | 資料 | [src/runtime/modules/StoreRepairPhotos.tsx:71](../../../src/runtime/modules/StoreRepairPhotos.tsx#L71) | 保留 | 移除後看不到剩餘可上傳張數。 |
| 130 | 門市／月度待辦 | 沒有資料且可管理時 | 請先設定門市與項目 | 空狀態 | [src/runtime/modules/StoreMonthlyTodos.tsx:103](../../../src/runtime/modules/StoreMonthlyTodos.tsx#L103) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 131 | 門市／月度待辦 | 沒有資料且不可管理時 | 尚無月度待辦 | 空狀態 | [src/runtime/modules/StoreMonthlyTodos.tsx:103](../../../src/runtime/modules/StoreMonthlyTodos.tsx#L103) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 132 | 門市／月度待辦 | 年月／門市對應不到當月項目 | 本月無適用項目 | 空狀態 | [src/runtime/modules/StoreMonthlyTodos.tsx:92](../../../src/runtime/modules/StoreMonthlyTodos.tsx#L92) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 133 | 門市／月度待辦 | 設定門市／設定項目表格下方 | 新增及週期變更從當月生效，既有歷史保留；停用及取消適用門市從次月生效。 | 說明 | [src/runtime/modules/StoreMonthlyTodos.tsx:114](../../../src/runtime/modules/StoreMonthlyTodos.tsx#L114) | 保留 | 移除後不易知道設定對當月、次月及歷史的不同影響。 |
| 134 | 門市／庫存盤點 | 左側盤點單空白時 | 尚無盤點單。請按「同步ERP盤點單」取得底稿。 | 空狀態 | [src/runtime/modules/StoreStocktake.tsx:293](../../../src/runtime/modules/StoreStocktake.tsx#L293) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 135 | 門市／庫存盤點 | 未選盤點單時 | 請選擇盤點單 | 空狀態 | [src/runtime/modules/StoreStocktake.tsx:278](../../../src/runtime/modules/StoreStocktake.tsx#L278)<br>[src/runtime/modules/StoreStocktake.tsx:297](../../../src/runtime/modules/StoreStocktake.tsx#L297) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 136 | 門市／庫存盤點 | 品項篩選無結果 | 目前沒有符合篩選的盤點列。 | 空狀態 | [src/runtime/modules/StocktakeGroupedDetail.tsx:125](../../../src/runtime/modules/StocktakeGroupedDetail.tsx#L125) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 137 | 門市／庫存盤點 | 忽略底稿視窗清單 | 目前沒有忽略底稿。 | 空狀態 | [src/runtime/modules/StoreStocktake.tsx:374](../../../src/runtime/modules/StoreStocktake.tsx#L374) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 138 | 門市／庫存盤點 | ERP 儲位待手動修改視窗上方 | 此清單只用來核對人工 ERP 作業，本頁不會呼叫 QUERY 修改儲位。須在 ERP 完成作業後再標記完成。 | 說明 | [src/runtime/modules/StoreStocktake.tsx:393](../../../src/runtime/modules/StoreStocktake.tsx#L393) | 保留 | 移除後容易把核對清單當成會自動修改 ERP 的功能。 |
| 139 | 門市／庫存盤點 | ERP 儲位待手動修改空白時 | 目前沒有需要人工修改的 ERP 儲位。 | 空狀態 | [src/runtime/modules/StoreStocktake.tsx:405](../../../src/runtime/modules/StoreStocktake.tsx#L405) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 140 | 門市／庫存盤點 | 修改紀錄空白時 | 尚無修改紀錄。 | 空狀態 | [src/runtime/modules/StoreStocktake.tsx:409](../../../src/runtime/modules/StoreStocktake.tsx#L409) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 141 | 門市／庫存盤點（手機） | 修改儲位欄位下方（桌面以儲存取消圖示取代） | Enter 儲存 · Esc 取消 | 說明 | [src/runtime/modules/StocktakeGroupedDetail.tsx:41](../../../src/runtime/modules/StocktakeGroupedDetail.tsx#L41) | 待決定 | 這是手機呈現；桌面沒有此文字，刪除會影響手機鍵盤操作提示。 |
| 142 | 門市／庫存盤點（手機） | 修改儲位欄位下方 | 僅修改 WEB，ERP 儲位待人工處理 | 說明 | [src/runtime/modules/StocktakeGroupedDetail.tsx:42](../../../src/runtime/modules/StocktakeGroupedDetail.tsx#L42) | 保留 | 移除後手機操作人不知道 ERP 不會同步修改。 |
| 143 | 門市／庫存盤點（手機） | 手機版品項標題與儲位按鈕的填寫進度 | 〈已填數〉/〈總數〉 已填 | 資料 | [src/runtime/modules/StocktakeGroupedDetail.tsx:184](../../../src/runtime/modules/StocktakeGroupedDetail.tsx#L184) | 保留 | 移除後少了筆數、進度或時間的判讀資訊。 |
| 144 | 門市／庫存盤點（手機） | 儲位下方小計 | 儲位小計 〈數量〉（尚未填完） | 資料 | [src/runtime/modules/StocktakeGroupedDetail.tsx:196](../../../src/runtime/modules/StocktakeGroupedDetail.tsx#L196) | 保留 | 移除後少了儲位加總與未填完的判斷。 |
| 145 | 門市／庫存盤點 | ERP 寫回進度 | 已寫入 〈n〉 / 〈m〉 列。 | 資料 | [src/runtime/modules/ErpJobStatus.tsx:50](../../../src/runtime/modules/ErpJobStatus.tsx#L50) | 保留 | 移除後少了筆數、進度或時間的判讀資訊。 |
| 146 | 門市／庫存盤點（手機） | 複盤已鎖定品項標題、儲位按鈕下方 | 已核對 | 資料 | [src/runtime/modules/StocktakeGroupedDetail.tsx:166](../../../src/runtime/modules/StocktakeGroupedDetail.tsx#L166)<br>[src/runtime/modules/StocktakeGroupedDetail.tsx:184](../../../src/runtime/modules/StocktakeGroupedDetail.tsx#L184) | 保留 | 移除後無法區分已鎖定核對的儲位與待盤儲位。 |
| 147 | 門市／庫存盤點（手機） | 盤點單日期旁；桌面 CSS 隱藏進度文字 | 〈日期〉盤點 · 商品 〈已填數〉/〈總數〉 已填 | 資料 | [src/runtime/modules/StoreStocktake.tsx:302](../../../src/runtime/modules/StoreStocktake.tsx#L302) | 保留 | 移除後手機版無法看到整張盤點單的填寫進度。 |

#### ERP 查詢

| # | 模組／畫面 | 位置（畫面上哪裡） | 文字原文 | 類型 | 來源（檔案:行） | 建議 | 理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 148 | ERP 查詢 | 商品歷史日期下方 | 起訖都未填：去年同月同日至今天；範圍最多三年。 | 說明 | [src/runtime/modules/ErpCustomerQuery.tsx:91](../../../src/runtime/modules/ErpCustomerQuery.tsx#L91)<br>[src/runtime/modules/ErpItemQueryPage.tsx:96](../../../src/runtime/modules/ErpItemQueryPage.tsx#L96)<br>[src/runtime/modules/ErpPartyOrdersDialog.tsx:45](../../../src/runtime/modules/ErpPartyOrdersDialog.tsx#L45)<br>[src/runtime/modules/ErpSupplierQuery.tsx:91](../../../src/runtime/modules/ErpSupplierQuery.tsx#L91) | 保留 | 移除後少了日期空白時的查詢範圍與上限。 |
| 149 | ERP 查詢 | 客戶的銷貨銷退日期下方 | 單據日期起訖都未填：去年同月同日至今天；範圍最多三年。輸入名稱時先列出客戶。 | 說明 | [src/runtime/modules/ErpCustomerQuery.tsx:91](../../../src/runtime/modules/ErpCustomerQuery.tsx#L91) | 保留 | 移除後少了預設期間與名稱查詢的先後順序。 |
| 150 | ERP 查詢 | 供應商的進貨退貨日期下方 | 單據日期起訖都未填：去年同月同日至今天；範圍最多三年。輸入名稱時先列出廠商。 | 說明 | [src/runtime/modules/ErpSupplierQuery.tsx:91](../../../src/runtime/modules/ErpSupplierQuery.tsx#L91) | 保留 | 移除後少了預設期間與名稱查詢的先後順序。 |
| 151 | ERP 查詢 | 客戶／供應商的單據查詢視窗日期下方 | 單據日期起訖都未填：去年同月同日至今天；範圍最多三年。 | 說明 | [src/runtime/modules/ErpCustomerQuery.tsx:91](../../../src/runtime/modules/ErpCustomerQuery.tsx#L91)<br>[src/runtime/modules/ErpPartyOrdersDialog.tsx:45](../../../src/runtime/modules/ErpPartyOrdersDialog.tsx#L45)<br>[src/runtime/modules/ErpSupplierQuery.tsx:91](../../../src/runtime/modules/ErpSupplierQuery.tsx#L91) | 保留 | 移除後使用者不知道日期空白會查多久。 |
| 152 | ERP 查詢 | 單據查詢視窗尚未查詢時 | 選擇單據日期後按「查詢」。 | 說明 | [src/runtime/modules/ErpPartyOrdersDialog.tsx:49](../../../src/runtime/modules/ErpPartyOrdersDialog.tsx#L49) | 刪除 | 功能或欄位已能表達用途，這段重複說明可刪。 |
| 153 | ERP 查詢 | 排程佇列抽屜上方 | ERP 一次執行一筆，依送入時間排序；每人最多 〈n〉 筆排隊或執行中。預估時間依近期同類查詢的平均耗時推算，僅供參考。 | 說明 | [src/runtime/modules/ErpQueuePanel.tsx:42](../../../src/runtime/modules/ErpQueuePanel.tsx#L42) | 保留 | 移除後少了每人排隊上限及時間只屬預估的資訊。 |
| 154 | ERP 查詢 | 排程佇列空白時 | 目前沒有排隊或執行中的查詢。 | 空狀態 | [src/runtime/modules/ErpQueuePanel.tsx:47](../../../src/runtime/modules/ErpQueuePanel.tsx#L47) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 155 | ERP 查詢 | 未收款結果下方 | 金額為 ERP 原幣；未收合計由各結帳單未收帳款相加（〈金額〉）。 | 資料 | [src/runtime/modules/ErpReceivableQuery.tsx:99](../../../src/runtime/modules/ErpReceivableQuery.tsx#L99) | 保留 | 移除後少了幣別及未收合計的計算口徑。 |
| 156 | ERP 查詢 | 商品結果的庫別區 | 無庫別資料。 | 空狀態 | [src/runtime/modules/ErpItemResult.tsx:57](../../../src/runtime/modules/ErpItemResult.tsx#L57) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 157 | ERP 查詢 | 商品結果的批號區 | 非批號管理。 | 資料 | [src/runtime/modules/ErpItemResult.tsx:61](../../../src/runtime/modules/ErpItemResult.tsx#L61) | 保留 | 移除後不易分辨無批號庫存與未啟用批號管理。 |
| 158 | ERP 查詢 | 批號商品沒有庫存時 | 目前沒有批號庫存。 | 空狀態 | [src/runtime/modules/ErpItemResult.tsx:62](../../../src/runtime/modules/ErpItemResult.tsx#L62) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 159 | ERP 查詢 | 商品歷史異動上方 | 共 〈n〉 筆異動。 | 資料 | [src/runtime/modules/ErpItemResult.tsx:68](../../../src/runtime/modules/ErpItemResult.tsx#L68) | 保留 | 移除後少了筆數、進度或時間的判讀資訊。 |
| 160 | ERP 查詢 | ERP 查詢程式視窗的關閉 ERP 區 | 把 ERP 的使用人數空出來給需要的同事。會等目前排隊的查詢跑完才關閉；暫停期間不能送出新的 ERP 查詢，查詢程式也不會自動開啟 ERP。 | 說明 | [src/runtime/modules/ErpAgentCredentialControl.tsx:161](../../../src/runtime/modules/ErpAgentCredentialControl.tsx#L161) | 保留 | 移除後少了關閉會等佇列完成及暫停查詢的影響。 |
| 161 | ERP 查詢 | ERP 查詢程式視窗的連線憑證區 | 只有超級管理員能產生或撤銷憑證。每次產生的原文只顯示一次，請立即複製到公司電腦的安全設定。 | 說明 | [src/runtime/modules/ErpAgentCredentialControl.tsx:193](../../../src/runtime/modules/ErpAgentCredentialControl.tsx#L193) | 保留 | 移除後少了憑證只顯示一次的必要提醒。 |
| 162 | ERP 查詢 | 連線憑證區目前狀態 | 目前憑證：〈已啟用／尚未設定或已撤銷／讀取中或無法取得〉 | 資料 | [src/runtime/modules/ErpAgentCredentialControl.tsx:194](../../../src/runtime/modules/ErpAgentCredentialControl.tsx#L194) | 保留 | 移除後少了筆數、進度或時間的判讀資訊。 |
| 163 | ERP 查詢 | 指定關閉時間下方 | 暫停到這個時間，最多 24 小時。 | 說明 | [src/runtime/modules/ErpAgentCredentialControl.tsx:41](../../../src/runtime/modules/ErpAgentCredentialControl.tsx#L41) | 保留 | 移除後少了最大暫停時間的限制。 |
| 164 | ERP 查詢 | ERP 暫停中視窗的補充說明 | 加入佇列後，暫停結束時會自動查詢，查完會通知你。 | 說明 | [src/runtime/modules/ErpHeldPrompt.tsx:27](../../../src/runtime/modules/ErpHeldPrompt.tsx#L27) | 刪除 | 功能或欄位已能表達用途，這段重複說明可刪。 |
| 165 | ERP 查詢／叫貨／盤點 | 查無資料（ITEM_NO） | 找不到此品號。 | 空狀態 | [src/runtime/modules/ErpJobStatus.tsx:14](../../../src/runtime/modules/ErpJobStatus.tsx#L14) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 166 | ERP 查詢／叫貨／盤點 | 查無資料（ITEM_NAME） | 沒有符合的品名。 | 空狀態 | [src/runtime/modules/ErpJobStatus.tsx:14](../../../src/runtime/modules/ErpJobStatus.tsx#L14) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 167 | ERP 查詢／叫貨／盤點 | 查無資料（CUSTOMER_NO） | 找不到此客戶代號。 | 空狀態 | [src/runtime/modules/ErpJobStatus.tsx:14](../../../src/runtime/modules/ErpJobStatus.tsx#L14) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 168 | ERP 查詢／叫貨／盤點 | 查無資料（CUSTOMER_NAME） | 沒有符合的客戶簡稱或全名。 | 空狀態 | [src/runtime/modules/ErpJobStatus.tsx:15](../../../src/runtime/modules/ErpJobStatus.tsx#L15) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 169 | ERP 查詢／叫貨／盤點 | 查無資料（SUPPLIER_NO） | 找不到此廠商代號。 | 空狀態 | [src/runtime/modules/ErpJobStatus.tsx:15](../../../src/runtime/modules/ErpJobStatus.tsx#L15) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 170 | ERP 查詢／叫貨／盤點 | 查無資料（SUPPLIER_NAME） | 沒有符合的廠商簡稱或全名。 | 空狀態 | [src/runtime/modules/ErpJobStatus.tsx:15](../../../src/runtime/modules/ErpJobStatus.tsx#L15) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 171 | ERP 查詢／叫貨／盤點 | 查無資料（PURCHASES） | 此期間沒有進貨單或退貨單。 | 空狀態 | [src/runtime/modules/ErpJobStatus.tsx:15](../../../src/runtime/modules/ErpJobStatus.tsx#L15) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 172 | ERP 查詢／叫貨／盤點 | 查無資料（SALES）；查無資料（RESTOCK） | 此期間沒有銷貨單或銷退單。 | 空狀態 | [src/runtime/modules/ErpJobStatus.tsx:16](../../../src/runtime/modules/ErpJobStatus.tsx#L16)<br>[src/runtime/modules/ErpJobStatus.tsx:17](../../../src/runtime/modules/ErpJobStatus.tsx#L17) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 173 | ERP 查詢／叫貨／盤點 | 查無資料（RECEIVABLE） | 沒有未收款。 | 空狀態 | [src/runtime/modules/ErpJobStatus.tsx:16](../../../src/runtime/modules/ErpJobStatus.tsx#L16) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 174 | ERP 查詢／叫貨／盤點 | 查無資料（ORDER） | ERP 查無此單號。 | 空狀態 | [src/runtime/modules/ErpJobStatus.tsx:16](../../../src/runtime/modules/ErpJobStatus.tsx#L16) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 175 | ERP 查詢／叫貨／盤點 | 查無資料（STOCKTAKE_SYNC） | 沒有新盤點單。 | 空狀態 | [src/runtime/modules/ErpJobStatus.tsx:18](../../../src/runtime/modules/ErpJobStatus.tsx#L18) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 176 | ERP 查詢／叫貨／盤點 | 查無資料（STOCKTAKE_WRITE） | 沒有需要寫回的列。 | 空狀態 | [src/runtime/modules/ErpJobStatus.tsx:18](../../../src/runtime/modules/ErpJobStatus.tsx#L18) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 177 | ERP 查詢／叫貨／盤點 | 排隊中狀態下方 | 已加入查詢佇列，等待公司電腦處理。 | 資料 | [src/runtime/modules/ErpJobStatus.tsx:49](../../../src/runtime/modules/ErpJobStatus.tsx#L49) | 保留 | 移除後少了筆數、進度或時間的判讀資訊。 |
| 178 | ERP 查詢／叫貨／盤點 | 排隊中且 ERP 暫停 | ERP 暫停中，已加入查詢佇列，〈時間〉 暫停結束後自動查詢。 | 資料 | [src/runtime/modules/ErpJobStatus.tsx:46](../../../src/runtime/modules/ErpJobStatus.tsx#L46) | 保留 | 移除後少了筆數、進度或時間的判讀資訊。 |
| 179 | ERP 查詢／叫貨／盤點 | 執行中狀態下方 | 正在查詢 ERP。 | 資料 | [src/runtime/modules/ErpJobStatus.tsx:56](../../../src/runtime/modules/ErpJobStatus.tsx#L56) | 保留 | 移除後少了筆數、進度或時間的判讀資訊。 |
| 180 | ERP 查詢／叫貨／盤點 | 執行中狀態下方 | 正在產生 ERP 報表並轉出，可能需要一到數分鐘。 | 資料 | [src/runtime/modules/ErpJobStatus.tsx:56](../../../src/runtime/modules/ErpJobStatus.tsx#L56) | 保留 | 移除後少了筆數、進度或時間的判讀資訊。 |
| 181 | ERP 查詢／叫貨／盤點 | 執行中狀態下方 | 正在讀取尚未匯入的盤點底稿。 | 資料 | [src/runtime/modules/ErpJobStatus.tsx:53](../../../src/runtime/modules/ErpJobStatus.tsx#L53) | 保留 | 移除後少了筆數、進度或時間的判讀資訊。 |
| 182 | ERP 查詢／叫貨／盤點 | 執行中狀態下方 | 正在寫回並核對 ERP 庫存。 | 資料 | [src/runtime/modules/ErpJobStatus.tsx:52](../../../src/runtime/modules/ErpJobStatus.tsx#L52) | 保留 | 移除後少了筆數、進度或時間的判讀資訊。 |
| 183 | ERP 查詢／叫貨／盤點 | 執行中狀態下方 | 正在產生銷貨、銷退報表，再分批查詢各品號庫存，可能需要數分鐘。 | 資料 | [src/runtime/modules/ErpJobStatus.tsx:39](../../../src/runtime/modules/ErpJobStatus.tsx#L39) | 保留 | 移除後少了筆數、進度或時間的判讀資訊。 |
| 184 | ERP 查詢 | 結果已從此分頁清除 | 結果已清除，請重新查詢。 | 空狀態 | [src/runtime/modules/ErpJobStatus.tsx:60](../../../src/runtime/modules/ErpJobStatus.tsx#L60) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 185 | ERP 查詢 | 「關閉到…」選好時間後的欄位下方 | 〈明天 〉〈時間〉，約 〈小時／分鐘〉後可再查詢。 | 資料 | [src/runtime/modules/ErpAgentCredentialControl.tsx:44](../../../src/runtime/modules/ErpAgentCredentialControl.tsx#L44) | 保留 | 移除後無法辨識選的是今天或明天，以及暫停多久。 |

#### 人事

| # | 模組／畫面 | 位置（畫面上哪裡） | 文字原文 | 類型 | 來源（檔案:行） | 建議 | 理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 186 | 人事 | 左側員工清單 | 沒有符合條件的員工。 | 空狀態 | [src/runtime/modules/HrOperationalPage.tsx:338](../../../src/runtime/modules/HrOperationalPage.tsx#L338) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 187 | 人事 | 未選員工明細主句 | 尚未選擇員工 | 空狀態 | [src/runtime/modules/HrOperationalPage.tsx:401](../../../src/runtime/modules/HrOperationalPage.tsx#L401) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 188 | 人事 | 未選員工明細說明 | 從左側清單選一位員工，或按清單上方的「＋ 新增員工」。 | 說明 | [src/runtime/modules/HrOperationalPage.tsx:401](../../../src/runtime/modules/HrOperationalPage.tsx#L401) | 刪除 | 用途已能由標題、欄位或按鈕辨識。 |
| 189 | 人事 | 薪資卡片 | 尚無薪資異動。 | 空狀態 | [src/runtime/modules/HrOperationalPage.tsx:382](../../../src/runtime/modules/HrOperationalPage.tsx#L382) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 190 | 人事 | 狀態異動卡片 | 尚無狀態異動。 | 空狀態 | [src/runtime/modules/HrOperationalPage.tsx:386](../../../src/runtime/modules/HrOperationalPage.tsx#L386) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 191 | 人事 | 年資不計期間卡片 | 沒有年資不計期間。 | 空狀態 | [src/runtime/modules/HrOperationalPage.tsx:389](../../../src/runtime/modules/HrOperationalPage.tsx#L389) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 192 | 人事 | 新增薪資異動的津貼區 | 尚未設定津貼項目（右上角「設定」）。 | 空狀態 | [src/runtime/modules/HrOperationalPage.tsx:434](../../../src/runtime/modules/HrOperationalPage.tsx#L434) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 193 | 人事 | 年資起算日欄下方 | 空白＝到職日 | 說明 | [src/runtime/modules/HrOperationalPage.tsx:571](../../../src/runtime/modules/HrOperationalPage.tsx#L571) | 保留 | 移除後不知道留空會採用哪一天。 |
| 194 | 人事 | 緊急聯絡人區標題旁 | 至少一位 | 說明 | [src/runtime/modules/HrOperationalPage.tsx:585](../../../src/runtime/modules/HrOperationalPage.tsx#L585) | 刪除 | 用途已能由標題、欄位或按鈕辨識。 |
| 195 | 人事 | 綁定使用者選擇器空白結果 | 沒有符合的使用者。 | 空狀態 | [src/runtime/modules/HrOperationalPage.tsx:638](../../../src/runtime/modules/HrOperationalPage.tsx#L638) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 196 | 人事／出勤 | 異常紀錄空白時 | 目前沒有異常紀錄 | 空狀態 | [src/runtime/modules/HrAttendancePanel.tsx:85](../../../src/runtime/modules/HrAttendancePanel.tsx#L85) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 197 | 人事／請假 | 請假總表空白時 | 沒有員工。 | 空狀態 | [src/runtime/modules/HrLeavePanel.tsx:82](../../../src/runtime/modules/HrLeavePanel.tsx#L82) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 198 | 人事／請假 | 員工假單清單 | 今年還沒有假單。 | 空狀態 | [src/runtime/modules/HrLeavePanel.tsx:92](../../../src/runtime/modules/HrLeavePanel.tsx#L92) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 199 | 人事／請假 | 未選員工時的右側 | 選擇員工查看假單、特休與補休。 | 不會顯示 | [src/runtime/modules/HrLeavePanel.tsx:115](../../../src/runtime/modules/HrLeavePanel.tsx#L115) | 刪除 | 無選取員工時明細被桌面及手機的 CSS 隱藏，沒有可見畫面。 |
| 200 | 人事／請假 | 預支補休來源欄下方 | 預支會另外列出，只有這個國定假日的補休給予後才會抵銷，不會從現有補休扣除。 | 說明 | [src/runtime/modules/HrLeaveDialog.tsx:117](../../../src/runtime/modules/HrLeaveDialog.tsx#L117) | 保留 | 移除後容易誤判預支補休的抵銷方式。 |
| 201 | 人事／請假 | 既有正式假單的修改視窗 | 此日已有正式假單，不能直接從排班格更改。若要調整，須先銷假並留下原因。 | 說明 | [src/runtime/modules/HrLeaveDialog.tsx:95](../../../src/runtime/modules/HrLeaveDialog.tsx#L95) | 保留 | 移除後不知道為何不能直接改排班格與正確調整入口。 |
| 202 | 人事／請假 | 請假表單下方摘要 | 預計請假 〈日期〉，假別：〈假別〉。所選有效日期的排班格會同步改為假別，例休日及國定假日依規則跳過。送出會檢查假額、補休與排班規則。 | 資料 | [src/runtime/modules/HrLeaveDialog.tsx:125](../../../src/runtime/modules/HrLeaveDialog.tsx#L125) | 保留 | 移除後少了本次請假範圍及班表同步影響的確認。 |
| 203 | 人事／請假 | 部分時數請假摘要 | 預計請假 〈日期〉，假別：〈假別〉。部分時數的班別維持不變。送出會檢查假額、補休與排班規則。 | 資料 | [src/runtime/modules/HrLeaveDialog.tsx:125](../../../src/runtime/modules/HrLeaveDialog.tsx#L125) | 保留 | 移除後看不到部分時數請假不改班別的差異。 |
| 204 | 人事／請假 | 無班別的時數請假摘要 | 預計請假 〈日期〉，假別：〈假別〉。無班別日期依填寫的分鐘數請假；已有班別的日期須改用起訖時間。送出會檢查假額、補休與排班規則。 | 資料 | [src/runtime/modules/HrLeaveDialog.tsx:125](../../../src/runtime/modules/HrLeaveDialog.tsx#L125) | 保留 | 移除後少了無班別與已有班別的時數輸入差異。 |
| 205 | 人事／請假 | 給予補休視窗下方 | 補休在給予當月的下個月底到期。 | 說明 | [src/runtime/modules/HrLeavePanel.tsx:125](../../../src/runtime/modules/HrLeavePanel.tsx#L125) | 保留 | 移除後不知道本次補休的到期規則。 |
| 206 | 人事／請假 | 國定假日補休視窗下方 | 補休在國定假日當月的下個月底到期。 | 說明 | [src/runtime/modules/HrLeavePanel.tsx:125](../../../src/runtime/modules/HrLeavePanel.tsx#L125) | 保留 | 移除後不知道國定假日補休的到期基準。 |
| 207 | 人事／請假 | 調整特休視窗下方 | 用於 CY Web 上線前的工時（沒有出勤紀錄）等情況。 | 說明 | [src/runtime/modules/HrLeavePanel.tsx:136](../../../src/runtime/modules/HrLeavePanel.tsx#L136) | 刪除 | 用途已能由標題、欄位或按鈕辨識。 |

#### 帳號與權限

| # | 模組／畫面 | 位置（畫面上哪裡） | 文字原文 | 類型 | 來源（檔案:行） | 建議 | 理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 208 | 帳號與權限 | 使用者清單右上 | 共 〈n〉 位 | 資料 | [src/identity/SharedIdentityPage.tsx:448](../../../src/identity/SharedIdentityPage.tsx#L448) | 保留 | 移除後少了時間、筆數或範圍等判讀資訊。 |
| 209 | 帳號與權限 | 權限群組表上方 | 共 〈n〉 個群組 | 資料 | [src/identity/SharedIdentityPage.tsx:945](../../../src/identity/SharedIdentityPage.tsx#L945) | 保留 | 移除後少了時間、筆數或範圍等判讀資訊。 |
| 210 | 帳號與權限 | 使用者清單無結果 | 沒有符合條件的使用者。 | 空狀態 | [src/identity/SharedIdentityPage.tsx:489](../../../src/identity/SharedIdentityPage.tsx#L489) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 211 | 帳號與權限 | 權限群組空白時 | 尚未建立權限群組。按「＋ 新增群組」建立，例如「業務」「倉管」。 | 空狀態 | [src/identity/SharedIdentityPage.tsx:984](../../../src/identity/SharedIdentityPage.tsx#L984) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 212 | 帳號與權限 | 使用者矩陣、群組矩陣與個人抽屜的 ERP 商品／客戶欄下 | 進貨輔助的前提 | 說明 | [src/identity/SharedIdentityPage.tsx:294](../../../src/identity/SharedIdentityPage.tsx#L294)<br>[src/identity/SharedIdentityPage.tsx:461](../../../src/identity/SharedIdentityPage.tsx#L461)<br>[src/identity/SharedIdentityPage.tsx:717](../../../src/identity/SharedIdentityPage.tsx#L717)<br>[src/identity/SharedIdentityPage.tsx:959](../../../src/identity/SharedIdentityPage.tsx#L959) | 保留 | 移除後看不到進貨輔助所需的兩項前置使用權。 |
| 213 | 帳號與權限 | 使用者矩陣、群組矩陣與個人抽屜的進貨輔助欄下 | 需先開啟「ERP 商品查詢」＋「ERP 客戶查詢」 | 說明 | [src/identity/SharedIdentityPage.tsx:294](../../../src/identity/SharedIdentityPage.tsx#L294)<br>[src/identity/SharedIdentityPage.tsx:461](../../../src/identity/SharedIdentityPage.tsx#L461)<br>[src/identity/SharedIdentityPage.tsx:717](../../../src/identity/SharedIdentityPage.tsx#L717)<br>[src/identity/SharedIdentityPage.tsx:959](../../../src/identity/SharedIdentityPage.tsx#L959) | 保留 | 移除後設定人不知道為何進貨輔助不能單獨開啟。 |
| 214 | 帳號與權限 | 自己的帳號抽屜上方 | 這是你的帳號；密碼與 Email 請到「我的帳號」變更，自己的權限與使用權由其他管理員設定。 | 說明 | [src/identity/SharedIdentityPage.tsx:659](../../../src/identity/SharedIdentityPage.tsx#L659) | 保留 | 移除後少了自己的資料與權限應到哪裡修改的界線。 |
| 215 | 帳號與權限 | 尚未啟用帳號抽屜的下一步 | 等待本人用驗證信完成首次登入；沒收到可以「重寄驗證 Email」。 | 說明 | [src/identity/SharedIdentityPage.tsx:640](../../../src/identity/SharedIdentityPage.tsx#L640) | 刪除 | 用途已能由標題、欄位或按鈕辨識。 |
| 216 | 帳號與權限 | Email 未驗證帳號抽屜的下一步 | Email 尚未驗證，密碼找回等功能暫停；可以「重寄 Email 驗證」。 | 說明 | [src/identity/SharedIdentityPage.tsx:641](../../../src/identity/SharedIdentityPage.tsx#L641) | 保留 | 移除後看不出未驗證會暫停哪些能力。 |
| 217 | 帳號與權限 | 停用帳號抽屜的下一步 | 已停用，無法登入；使用權仍保留，需要時按「啟用」。 | 說明 | [src/identity/SharedIdentityPage.tsx:642](../../../src/identity/SharedIdentityPage.tsx#L642) | 刪除 | 用途已能由標題、欄位或按鈕辨識。 |
| 218 | 帳號與權限 | 個人設定抽屜使用權區 | 個人設定：下面逐項勾選，立即生效。加入群組後改由群組決定。 | 說明 | [src/identity/SharedIdentityPage.tsx:690](../../../src/identity/SharedIdentityPage.tsx#L690) | 刪除 | 用途已能由標題、欄位或按鈕辨識。 |
| 219 | 帳號與權限 | 群組成員抽屜使用權區 | 系統與模組使用權由群組「〈群組名〉」決定，不能個別修改；要調整請到「權限群組」，或改回「個人設定」（保留目前的勾選）。 | 說明 | [src/identity/SharedIdentityPage.tsx:689](../../../src/identity/SharedIdentityPage.tsx#L689) | 保留 | 移除後不知道不能個別修改的原因與改動群組的入口。 |
| 220 | 帳號與權限 | 新增使用者視窗標題下方 | 系統會寄出驗證信與一次性首次登入密碼，本人完成驗證後即可使用。 | 說明 | [src/identity/SharedIdentityPage.tsx:785](../../../src/identity/SharedIdentityPage.tsx#L785) | 刪除 | 用途已能由標題、欄位或按鈕辨識。 |
| 221 | 帳號與權限 | 新增群組視窗標題下方 | 例如「業務」「倉管」。建立後勾選要開放的系統與模組，再到「人員」把人加入群組。 | 說明 | [src/identity/SharedIdentityPage.tsx:929](../../../src/identity/SharedIdentityPage.tsx#L929) | 刪除 | 用途已能由標題、欄位或按鈕辨識。 |
| 222 | 帳號與權限 | 移交超級管理員視窗標題下方 | 移交後立即生效，雙方既有登入都會撤銷。只能移交給已啟用且 Email 已驗證的使用者。 | 說明 | [src/identity/SharedIdentityPage.tsx:833](../../../src/identity/SharedIdentityPage.tsx#L833) | 保留 | 移除後少了移交會同時登出雙方的影響。 |
| 223 | 帳號與權限 | 登記並啟用系統視窗標題下方 | 為目前 Workspace 加入系統。超級管理員可直接使用；其他員工仍須另外開放使用權。已停用的系統重新登記後會啟用，原有使用權會保留。 | 說明 | [src/identity/SharedIdentityPage.tsx:1039](../../../src/identity/SharedIdentityPage.tsx#L1039) | 保留 | 移除後少了登記系統不等於開放所有人使用的差別。 |
| 224 | 帳號與權限 | 登記系統的識別碼欄下方 | 使用該系統核准的識別碼，由英文字母、數字、底線或連字號組成。 | 說明 | [src/identity/SharedIdentityPage.tsx:1043](../../../src/identity/SharedIdentityPage.tsx#L1043) | 保留 | 移除後少了識別碼應採核准值及合法字元的格式資訊。 |
| 225 | 帳號與權限 | 變更安全設定視窗標題下方 | 限制驗證碼重寄與 Email 寄送次數，避免被濫用。 | 說明 | [src/identity/SharedIdentityPage.tsx:1091](../../../src/identity/SharedIdentityPage.tsx#L1091) | 刪除 | 用途已能由標題、欄位或按鈕辨識。 |
| 226 | 帳號與權限 | 每日 Email 上限欄下方 | 系統上限：〈n〉 | 資料 | [src/identity/SharedIdentityPage.tsx:1098](../../../src/identity/SharedIdentityPage.tsx#L1098) | 保留 | 移除後設定者不知道可填上限。 |
| 227 | 帳號與權限 | D1 用量區上方 | 監控整個 Cloudflare 帳號的 D1 資料庫。每日 08:00（台灣時間）重置。 | 說明 | [src/identity/CloudflareUsagePanel.tsx:37](../../../src/identity/CloudflareUsagePanel.tsx#L37) | 保留 | 移除後容易把全帳號用量誤認為只有 CY Web，且不知道重置時間。 |
| 228 | 帳號與權限 | D1 用量資料時間 | 資料時間 〈時間〉（台灣時間）／今日為 UTC 〈日期〉 | 資料 | [src/identity/CloudflareUsagePanel.tsx:42](../../../src/identity/CloudflareUsagePanel.tsx#L42) | 保留 | 移除後不能判讀快照時間與統計日界。 |
| 229 | 帳號與權限 | D1 各庫用量下方 | 其他 〈n〉 個資料庫今日無用量。 | 資料 | [src/identity/CloudflareUsagePanel.tsx:53](../../../src/identity/CloudflareUsagePanel.tsx#L53) | 保留 | 移除後少了時間、筆數或範圍等判讀資訊。 |
| 230 | 帳號與權限 | 人員使用權抽屜，無群組且為超級管理員 | 超級管理員固定可用 | 說明 | [src/identity/SharedIdentityPage.tsx:322](../../../src/identity/SharedIdentityPage.tsx#L322) | 保留 | 移除後無法知道這些勾選為何不能取消。 |
| 231 | 帳號與權限 | 自己的使用權項目下方 | 自己的使用權由其他管理員設定 | 說明 | [src/identity/SharedIdentityPage.tsx:323](../../../src/identity/SharedIdentityPage.tsx#L323) | 保留 | 移除後無法知道自己的使用權要由誰調整。 |
| 232 | 帳號與權限 | 停用系統的使用權項目下方 | 系統已停用 | 說明 | [src/api/error-messages.ts:50](../../../src/api/error-messages.ts#L50)<br>[src/identity/SharedIdentityPage.tsx:288](../../../src/identity/SharedIdentityPage.tsx#L288) | 保留 | 移除後無法知道為何不能開放該系統。 |
| 233 | 帳號與權限 | 相依模組未開放時的使用權下方 | 需先開啟〈缺少的模組名稱，以「、」分隔〉 | 說明 | [shared/modules.ts:100](../../../shared/modules.ts#L100)<br>[src/identity/SharedIdentityPage.tsx:718](../../../src/identity/SharedIdentityPage.tsx#L718) | 保留 | 移除後無法知道還缺哪些使用權。 |

#### 異動紀錄

| # | 模組／畫面 | 位置（畫面上哪裡） | 文字原文 | 類型 | 來源（檔案:行） | 建議 | 理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 234 | 異動紀錄 | 查詢結果空白時 | 此範圍尚無異動紀錄。 | 空狀態 | [src/runtime/modules/AuditOperationalPage.tsx:143](../../../src/runtime/modules/AuditOperationalPage.tsx#L143) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 235 | 異動紀錄 | 單筆明細沒有欄位差異時 | 此筆未提供欄位差異。 | 空狀態 | [src/runtime/modules/AuditOperationalPage.tsx:156](../../../src/runtime/modules/AuditOperationalPage.tsx#L156) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |

#### 備份管理

| # | 模組／畫面 | 位置（畫面上哪裡） | 文字原文 | 類型 | 來源（檔案:行） | 建議 | 理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 236 | 備份管理 | 備份政策列右側 | 時間皆為台灣時間；手動備份會建立兩端副本。 | 說明 | [src/runtime/modules/BackupOperationalPage.tsx:177](../../../src/runtime/modules/BackupOperationalPage.tsx#L177) | 保留 | 移除後少了備份時間的時區及雙副本語意。 |
| 237 | 備份管理 | 備份清單下方 | 顯示最新 50 筆備份；每次備份只列一次，副本驗證結果分開顯示。 | 說明 | [src/runtime/modules/BackupOperationalPage.tsx:185](../../../src/runtime/modules/BackupOperationalPage.tsx#L185) | 刪除 | 用途已能由標題、欄位或按鈕辨識。 |
| 238 | 備份管理 | 備份清單空白主句 | 尚無備份紀錄 | 空狀態 | [src/runtime/modules/BackupOperationalPage.tsx:61](../../../src/runtime/modules/BackupOperationalPage.tsx#L61) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 239 | 備份管理 | 已設定但尚無備份的空狀態補充 | 建立手動備份後，這裡會顯示各儲存副本的驗證結果。 | 說明 | [src/runtime/modules/BackupOperationalPage.tsx:61](../../../src/runtime/modules/BackupOperationalPage.tsx#L61) | 刪除 | 用途已能由標題、欄位或按鈕辨識。 |
| 240 | 備份管理 | 未設定儲存的空狀態補充 | 儲存設定完成後才能建立備份。 | 說明 | [src/runtime/modules/BackupOperationalPage.tsx:61](../../../src/runtime/modules/BackupOperationalPage.tsx#L61) | 保留 | 移除後不知道為何不能建立備份。 |
| 241 | 備份管理 | 隔離演練紀錄空白主句 | 尚無隔離還原驗證紀錄 | 空狀態 | [src/runtime/modules/BackupOperationalPage.tsx:86](../../../src/runtime/modules/BackupOperationalPage.tsx#L86) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 242 | 備份管理 | 隔離演練紀錄空狀態補充 | 此處顯示近 90 天已記錄的演練，最多 30 筆；早期失敗若發生在記錄前，可能無法追溯。 | 說明 | [src/runtime/modules/BackupOperationalPage.tsx:87](../../../src/runtime/modules/BackupOperationalPage.tsx#L87) | 保留 | 移除後容易把查無紀錄誤認為從未演練過。 |
| 243 | 備份管理 | 已用隔離目標的完成結果 | 驗證時間：〈日期時間〉（台灣） | 資料 | [src/runtime/modules/BackupOperationalPage.tsx:100](../../../src/runtime/modules/BackupOperationalPage.tsx#L100) | 保留 | 移除後少了時間、筆數或範圍等判讀資訊。 |
| 244 | 備份管理 | 隔離完成結果第二段 | 結果：備份已還原至隔離資料庫，資料核對成功。本次驗證已完成，請勿對同一隔離目標再次執行。 | 說明 | [src/runtime/modules/BackupOperationalPage.tsx:101](../../../src/runtime/modules/BackupOperationalPage.tsx#L101) | 保留 | 移除後少了這個目標不可重做的限制。 |
| 245 | 備份管理 | 隔離完成結果第三段 | 下次驗證請依季度計畫準備經核准的全新空白隔離目標。 | 說明 | [src/runtime/modules/BackupOperationalPage.tsx:102](../../../src/runtime/modules/BackupOperationalPage.tsx#L102) | 保留 | 移除後不知道後續演練需要新的空白目標。 |
| 246 | 備份管理 | 驗證隔離還原視窗第一段 | 將所選備份還原至獨立的空白驗證副本，並核對資料。正式系統繼續使用目前資料。 | 說明 | [src/runtime/modules/BackupOperationalPage.tsx:200](../../../src/runtime/modules/BackupOperationalPage.tsx#L200) | 保留 | 移除後少了隔離驗證不會還原正式資料的範圍說明。 |
| 247 | 備份管理 | 驗證隔離還原視窗第二段 | 驗證前會另建 R2、GCS 安全備份；兩端皆驗證成功才繼續。驗證副本成功使用後會保留，重做須另行準備核准的空白副本。 | 說明 | [src/runtime/modules/BackupOperationalPage.tsx:201](../../../src/runtime/modules/BackupOperationalPage.tsx#L201) | 保留 | 移除後少了安全備份與隔離目標使用方式的說明。 |
| 248 | 備份管理／CYInvoice 復原 | 復原操作 ID 欄下方 | 此頁籤會保留原 ID 以便重新整理後查詢。請另行複製保存；關閉頁籤或清除瀏覽器資料後，需貼回原 ID。不會自動重寄。 | 說明 | [src/identity/CyInvoiceRecoveryAdminPanel.tsx:151](../../../src/identity/CyInvoiceRecoveryAdminPanel.tsx#L151) | 保留 | 移除後容易遺失查回操作的識別碼或誤以為會自動重寄。 |
| 249 | 備份管理／CYInvoice 復原 | 仍有未確認操作時下方 | 原操作尚未取得明確撤銷結果。請先查詢／撤銷，暫不建立其他操作 ID。 | 說明 | [src/identity/CyInvoiceRecoveryAdminPanel.tsx:165](../../../src/identity/CyInvoiceRecoveryAdminPanel.tsx#L165) | 保留 | 移除後不知道新操作被停用及需要先查回的原因。 |

#### 登入

| # | 模組／畫面 | 位置（畫面上哪裡） | 文字原文 | 類型 | 來源（檔案:行） | 建議 | 理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 250 | 登入／帳號協助 | 帳號協助與首次登入驗證的標題下方 | 依照畫面指示完成帳號驗證 | 說明 | [src/auth/AuthGate.tsx:321](../../../src/auth/AuthGate.tsx#L321) | 刪除 | 用途已能由標題、欄位或按鈕辨識。 |
| 251 | 登入／首次登入 | 首次登入密碼驗證完成後 | 首次登入密碼已完成一次性驗證。請在驗證時效內設定正式密碼；設定成功後會回到登入頁，並需使用新密碼重新登入。 | 說明 | [src/auth/AuthGate.tsx:342](../../../src/auth/AuthGate.tsx#L342) | 保留 | 移除後少了需在期限內設定且設定後要重新登入的流程。 |
| 252 | 登入／首次登入 | 驗證表單的無姓名無員編分支 | 請設定您的正式登入密碼。 | 說明 | [src/auth/AuthGate.tsx:340](../../../src/auth/AuthGate.tsx#L340) | 刪除 | 用途已能由標題、欄位或按鈕辨識。 |

#### CY 程式

| # | 模組／畫面 | 位置（畫面上哪裡） | 文字原文 | 類型 | 來源（檔案:行） | 建議 | 理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 253 | CY 程式 | 目錄常數；CY Web 清單篩掉 web＋websiteUrl 的資料 | 多人網頁記帳，支援帳戶與科目管理、收支查詢、自動期初餘額及 Excel 匯出，可於電腦與手機使用。 | 不會顯示 | [shared/program-catalog.ts:52](../../../shared/program-catalog.ts#L52) | 待決定 | 此為共用程式目錄內容；CY Web 清單排除已有網址的 web 程式，刪除前須確認其他系統是否仍使用。 |
| 254 | CY 程式 | 程式清單的功能簡介（桌面與手機共用資料） | Windows 記帳工具，支援收支登錄、帳戶與科目管理、Excel 匯入、月份鎖帳及本機／雲端備份。 | 說明 | [shared/program-catalog.ts:56](../../../shared/program-catalog.ts#L56) | 保留 | 移除後無法由清單了解這支程式提供哪些功能。 |
| 255 | CY 程式 | 程式清單的功能簡介（桌面與手機共用資料） | Windows 電子發票工具，支援手動開立、Excel 資料匯入、發票查詢、作廢及 PDF 預覽與列印。 | 說明 | [shared/program-catalog.ts:61](../../../shared/program-catalog.ts#L61) | 保留 | 移除後無法由清單了解這支程式提供哪些功能。 |
| 256 | CY 程式 | 程式清單的功能簡介（桌面與手機共用資料） | 將含稅商品資料換算為未稅單價、銷售額及營業稅，自動分配四捨五入尾差，並即時預覽三聯式發票版面。 | 說明 | [shared/program-catalog.ts:66](../../../shared/program-catalog.ts#L66) | 保留 | 移除後無法由清單了解這支程式提供哪些功能。 |
| 257 | CY 程式 | 程式清單的功能簡介（桌面與手機共用資料） | 將 ERP COPI08 匯出的 Excel 交易資料轉換為 SMART 銷貨單匯入格式，檢查必要欄位並避免覆蓋同名輸出檔案。 | 說明 | [shared/program-catalog.ts:71](../../../shared/program-catalog.ts#L71) | 保留 | 移除後無法由清單了解這支程式提供哪些功能。 |
| 258 | CY 程式 | 程式清單的功能簡介（桌面與手機共用資料） | 支援蝦皮、MO店+與酷澎訂單匯入，將銷貨單表頭與商品明細自動輸入 SMART ERP，並可依設定儲存及列印。 | 說明 | [shared/program-catalog.ts:76](../../../shared/program-catalog.ts#L76) | 保留 | 移除後無法由清單了解這支程式提供哪些功能。 |
| 259 | CY 程式 | 程式清單的功能簡介（桌面與手機共用資料） | 在公司內網電腦接收 CY Web 的查詢，自動到 SMART ERP 查品號、批號庫存與歷史異動、客戶、廠商、銷貨銷退單、進貨退貨單及未收款，只查詢不修改 ERP 資料。 | 說明 | [shared/program-catalog.ts:81](../../../shared/program-catalog.ts#L81) | 保留 | 移除後無法由清單了解這支程式提供哪些功能。 |
| 260 | CY 程式 | 程式清單的功能簡介（桌面與手機共用資料） | 支援收件人與地址管理、臺灣郵遞區號查詢、信封版面位置與字型設定，以及 Windows 印表機套印。 | 說明 | [shared/program-catalog.ts:84](../../../shared/program-catalog.ts#L84) | 保留 | 移除後無法由清單了解這支程式提供哪些功能。 |
| 261 | CY 程式 | 程式清單的功能簡介（桌面與手機共用資料） | 商品圖片盲浮水印工具，支援批次嵌入、圖片驗證與 PDF 驗證報告。 | 說明 | [shared/program-catalog.ts:87](../../../shared/program-catalog.ts#L87) | 保留 | 移除後無法由清單了解這支程式提供哪些功能。 |
| 262 | CY 程式 | 目錄常數；CY Web 清單篩掉 web＋websiteUrl 的資料 | 獨立查價原型，手動記錄商品與蝦皮、momo 等平台報價，比較最低價及價差。使用 ChatGPT 私有登入；資料儲存在目前瀏覽器。 | 不會顯示 | [shared/program-catalog.ts:90](../../../shared/program-catalog.ts#L90) | 待決定 | 此為共用程式目錄內容；CY Web 清單排除已有網址的 web 程式，刪除前須確認其他系統是否仍使用。 |
| 263 | CY 程式 | 清單最下方 | 每日台灣時間凌晨 3 點自動確認版本；最近確認：〈日期〉。 | 資料 | [src/runtime/modules/ProgramCatalogPage.tsx:57](../../../src/runtime/modules/ProgramCatalogPage.tsx#L57) | 保留 | 移除後不知道版本清單的更新頻率與新舊程度。 |
| 264 | CY 程式 | 未發版程式的使用／下載欄 | 正式發版後提供下載 | 說明 | [src/runtime/modules/ProgramCatalogPage.tsx:36](../../../src/runtime/modules/ProgramCatalogPage.tsx#L36) | 保留 | 移除後不知道沒有下載入口的原因。 |
| 265 | CY 程式 | 已發版卻無對應檔案時 | 尚無可下載檔案 | 空狀態 | [src/runtime/modules/ProgramCatalogPage.tsx:37](../../../src/runtime/modules/ProgramCatalogPage.tsx#L37) | 保留 | 移除後無法區分目前無資料與畫面尚未載入。 |
| 266 | CY 程式 | 程式清單為空時 | 尚無程式 | 空狀態 | [src/runtime/modules/ProgramCatalogPage.tsx:56](../../../src/runtime/modules/ProgramCatalogPage.tsx#L56) | 保留 | 移除後無法區分程式清單為空與內容尚未載入。 |
| 267 | CY 程式 | 自動確認版本仍在等待排程時 | 版本清單將於每日排程自動確認，目前顯示已確認的正式版本。 | 說明 | [src/runtime/modules/ProgramCatalogPage.tsx:44](../../../src/runtime/modules/ProgramCatalogPage.tsx#L44) | 保留 | 移除後無法知道目前顯示的版本尚未經本次排程重新確認。 |

### 8.4 桌面紅框截圖索引

下列 42 張均為 1440px 寬 JPEG，從本機瀏覽器直接取得；超過首屏的條件以盤點表為完整清單。

| 模組／畫面 | 截圖 | 像素 | SHA-256 |
| --- | --- | --- | --- |
| 登入／帳號協助 | [00a-login-recovery.jpg](../../handoff/WO-0.9.94/00a-login-recovery.jpg) | 1440×1000 | `2faa27a93a2842f5e98f1c1d883de43533239bb894e85c4015d5f9f93147e62e` |
| 客戶／資料與卡片 | [02b-customer-detail.jpg](../../handoff/WO-0.9.94/02b-customer-detail.jpg) | 1440×1000 | `3cdca8942dbbaa5917a15e00ca99ac9dfefaa6e6c67b09e76ab228d62c6cf320` |
| 客戶／編輯 | [02-customers-form.jpg](../../handoff/WO-0.9.94/02-customers-form.jpg) | 1440×1000 | `42bb4f586e1e9de8e5f7d7d646dcab9cbcfef86e576ae02c2ad39b32d3f9040b` |
| 商品／編輯與提示 | [03c-item-edit.jpg](../../handoff/WO-0.9.94/03c-item-edit.jpg) | 1440×1000 | `b292dd8bb3705ad19f4b483847ca386cd9107b511eff50cccda59bb1574814d7` |
| 瑕疵／明細 | [04b-defect-detail.jpg](../../handoff/WO-0.9.94/04b-defect-detail.jpg) | 1440×1000 | `850995c22558c62e06411daec828645986fe2d53e95d6eb2bb2e09c5a4656f0d` |
| 銷售工單／ERP 回填 | [05c-order-erp-fill.jpg](../../handoff/WO-0.9.94/05c-order-erp-fill.jpg) | 1440×1000 | `0c3823f86fc0add9ca327c7b649455ad273de593cfcdaa1f2b3b5b28bf1403ac` |
| 委外/代工／對象 | [06g-contractor-detail.jpg](../../handoff/WO-0.9.94/06g-contractor-detail.jpg) | 1440×1000 | `dd10759d083b2e0db343ce6ab5cbca22889df0e1426b6f42093a349e13c27d5b` |
| 委外/代工／BOM | [06e-bom-form.jpg](../../handoff/WO-0.9.94/06e-bom-form.jpg) | 1440×1000 | `700bb50f8b3dfc94931101ef16d8c9ed976c3d0a1e3d79969225c46b0e0defff` |
| 工作日誌／編輯 | [07a-worklog-form.jpg](../../handoff/WO-0.9.94/07a-worklog-form.jpg) | 1440×1000 | `6f5feb36a406715c2102fb43fc516a4c6df110d606c507e4e24bd3e0062cdb52` |
| 工作日誌／計分設定 | [05h-settings-scoring.jpg](../../handoff/WO-0.9.94/05h-settings-scoring.jpg) | 1440×1000 | `68769b76b72b1f8b29c44e4d8f007e42a2d8bf6950ca311df5ab59797ef2ef08` |
| 人事／主畫面 | [08-hr.jpg](../../handoff/WO-0.9.94/08-hr.jpg) | 1440×1000 | `5159261b9f7afc8890821969f37fd6a2a2f794f3ec1258e090e33339bb7b8cb0` |
| 人事／補休 | [08i-hr-comp-holiday.jpg](../../handoff/WO-0.9.94/08i-hr-comp-holiday.jpg) | 1440×1000 | `37b3bb3956c027ed06fe1830a493b2da5a5212c4a7dd4d23332ce9da04f2c684` |
| 人事／部分時數請假 | [08o-hr-leave-minutes.jpg](../../handoff/WO-0.9.94/08o-hr-leave-minutes.jpg) | 1440×1000 | `7add01f0be68f63eef9e711945cc7cca3321f58317303638be7f0a7f840d2f9e` |
| 人事／特休調整 | [08p-hr-adjust-annual.jpg](../../handoff/WO-0.9.94/08p-hr-adjust-annual.jpg) | 1440×1000 | `5c4285b03b3ce0761ebd6368355fbdc4344d652df44d197fee4c60a82a27c43f` |
| 叫貨／未到貨 | [06g-ordering-pending.jpg](../../handoff/WO-0.9.94/06g-ordering-pending.jpg) | 1440×1000 | `3eaba54431ab87021944740d780ab122302d0248c271dc37292c793d43fcd3ab` |
| 叫貨／自動儲存提示 | [06h-ordering-autosave.jpg](../../handoff/WO-0.9.94/06h-ordering-autosave.jpg) | 1440×1000 | `4434b9f8fc1425cda0da162cac3919130247afc985e1e95d6b95859bcbd6cfaf` |
| 叫貨／來源註記 | [09c-ordering-source-form.jpg](../../handoff/WO-0.9.94/09c-ordering-source-form.jpg) | 1440×1000 | `0dcb9635316cfcc9e0bd8cc4ff97ee96370da5d66305eff8abe71fa4f12d0a01` |
| 叫貨／進貨輔助 | [09a-restock.jpg](../../handoff/WO-0.9.94/09a-restock.jpg) | 1440×1000 | `bdd52b0561c6bcf1001bd6d6f8239d7298ca3fd12b89e48d95cdd423f8fb5b23` |
| 門市／訂購 | [10-store-orders.jpg](../../handoff/WO-0.9.94/10-store-orders.jpg) | 1440×1000 | `cdfef79944ceaad2ec114b8215134ca5f44f82a51a28aa6e6682eb6ed4defef3` |
| 門市／黑名單轉入 | [07n-blacklist-origin.jpg](../../handoff/WO-0.9.94/07n-blacklist-origin.jpg) | 1440×1000 | `f1ae9a2d1149b7b4b316dcfe133457c5231d01f6c82f955f446cb7e6a523dfb7` |
| 門市／黑名單核對 | [07o-blacklist-line-review.jpg](../../handoff/WO-0.9.94/07o-blacklist-line-review.jpg) | 1440×1000 | `102f0cca7b478818a8c1e5ee321331556fde4326bf6c1e0db675c81b0ed14711` |
| 門市／售後維修 | [12-store-repairs.jpg](../../handoff/WO-0.9.94/12-store-repairs.jpg) | 1440×1000 | `1f9a648031271160472fa6eb325dca8b802075b726f1afb96e043f66793f1bf3` |
| 門市／庫存盤點 | [13-store-stocktake.jpg](../../handoff/WO-0.9.94/13-store-stocktake.jpg) | 1440×1000 | `bfff7b50e129c20461067c2df9860d030408027fc94b1a15329aab345bb95439` |
| 門市／人工 ERP 儲位 | [13b-stocktake-manual.jpg](../../handoff/WO-0.9.94/13b-stocktake-manual.jpg) | 1440×1000 | `4777e43c181b8b7474dc621897b291bd30b10fcc229e10dd42c727123c989c8b` |
| 門市／月度設定 | [14a-monthly-settings.jpg](../../handoff/WO-0.9.94/14a-monthly-settings.jpg) | 1440×1000 | `051cf602d47a79643e22d0c86e867c7fb940addd516f8dda92bdfd84eba76f17` |
| ERP／商品歷史查詢 | [15a-erp-history-form.jpg](../../handoff/WO-0.9.94/15a-erp-history-form.jpg) | 1440×1000 | `411a25f0fc12df12a8d228f54e96dc0eece27f09d60e2b50022d84ed31d33997` |
| ERP／程式控制 | [15e-erp-agent.jpg](../../handoff/WO-0.9.94/15e-erp-agent.jpg) | 1440×1000 | `c9696d39d0d6e46ee92267600be87b8062a22375d56b09c50886c9c78f51054d` |
| ERP／暫停時間的動態提示 | [15j-erp-until-time.jpg](../../handoff/WO-0.9.94/15j-erp-until-time.jpg) | 1440×1000 | `c51cad565682f101416e4daebd1ae41dea3f005a23c9b9efcf5a678a2f3f59b7` |
| 帳號與權限／主畫面 | [16-identity.jpg](../../handoff/WO-0.9.94/16-identity.jpg) | 1440×1000 | `3e757afdeacde8ec4d2cdb03986b4ccde03818b4cc53981f65ab61f1136675d8` |
| 帳號與權限／新增群組 | [16c-identity-group-new.jpg](../../handoff/WO-0.9.94/16c-identity-group-new.jpg) | 1440×1000 | `f306e24ac0a9588b1ffd33e95aab14df4cdaf747586d9113edd310331f9bce45` |
| 帳號與權限／停用原因 | [16i-access-reasons.jpg](../../handoff/WO-0.9.94/16i-access-reasons.jpg) | 1440×1000 | `aa698cc1672d71e2e6527dc44d704bd26c040f06fa3d19b6974b054f9ef35c54` |
| 帳號與權限／系統與安全 | [09l-security-idle-db.jpg](../../handoff/WO-0.9.94/09l-security-idle-db.jpg) | 1440×1000 | `f29ad04974125eb55a67a76c15d2c393283c1e2c6b1a2b814e2d5052ec277b57` |
| 我的帳號 | [17-account.jpg](../../handoff/WO-0.9.94/17-account.jpg) | 1440×1000 | `b13cc213fd6a5a6f90b3d41cb033c5336a35720aae2a6baee6e231072e671aa5` |
| 異動紀錄／空明細 | [10b-audit-no-diff.jpg](../../handoff/WO-0.9.94/10b-audit-no-diff.jpg) | 1440×1000 | `417a563899946254adaba3316302564df77981aa3229ed6a6be09f60c8b6bb47` |
| 備份管理／紀錄 | [11-backups.jpg](../../handoff/WO-0.9.94/11-backups.jpg) | 1440×1000 | `1dbddfb89a58bed4834e237a9db0813291a9b74f8cfb1dbc57426e85df6ee76b` |
| 備份管理／驗證說明 | [11d-backup-rehearsal.jpg](../../handoff/WO-0.9.94/11d-backup-rehearsal.jpg) | 1440×1000 | `f480c6a87054ce84cd5d7cdb31b71894379f0ab498f86f88d6bc3c19d62b8e02` |
| 備份管理／復原 | [19a-invoice-recovery.jpg](../../handoff/WO-0.9.94/19a-invoice-recovery.jpg) | 1440×1000 | `8af88ae2373e8724500178b8192730c82dff8284c8067b7d7be7d26040b2abc8` |
| 首次登入 | [13d-first-login.jpg](../../handoff/WO-0.9.94/13d-first-login.jpg) | 1440×1000 | `7f38f8d97a3da4f0a1f78abcd9b8b49abae615be447a1538bab5eef1a1b97512` |
| CY 程式／清單 | [20-programs.jpg](../../handoff/WO-0.9.94/20-programs.jpg) | 1440×1000 | `268865461be0cc2bcbdcd74b9f30e0b588cfdd655b62b527f4c5771cb9d9f093` |
| CY 程式／等待排程與空清單 | [20a-program-empty.jpg](../../handoff/WO-0.9.94/20a-program-empty.jpg) | 1440×1000 | `d39272ad2165edefa87ba6f10ee94958afe10667164a26e1033ce9fe8f36c29a` |
| 共用／搜尋空結果 | [21a-picker-empty.jpg](../../handoff/WO-0.9.94/21a-picker-empty.jpg) | 1440×1000 | `926e58fca5bf5bdbe45bfd14bc04b6c72f7c9bc473ad4ea1044b082c9f5564c6` |
| 共用／搜尋字數提示 | [21b-picker-two-characters.jpg](../../handoff/WO-0.9.94/21b-picker-two-characters.jpg) | 1440×1000 | `86544cfbab1481c2691d3b9214064d4b083a63381427f2afb20ce562a9f6716f` |

### 8.5 本次差異與待辦

- 僅修改本工作單、合成紅框截圖及 §9.1 必要 handoff；src、shared、worker、樣式、版本及 BUILD 均無變更。
- 驗證：候選逐項畫面核對、來源行號與連結檢查、截圖尺寸及 SHA-256 回讀、Git 差異邊界與 diff --check。產品沒有變更，因此未新增測試、未執行產品建置或正式資料操作。
- 待使用者逐項確認，Claude 將結果填入 §2.1；之後才安排第二段實作。§9 由 Claude 審查填寫，本次不代填通過。未合併、未部署。

## 9. 審查紀錄（審查者填）

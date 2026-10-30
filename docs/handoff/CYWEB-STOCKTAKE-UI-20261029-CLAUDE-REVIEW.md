# 2026-10-30 最新需求交接：品號一卡 × 儲位優先 × 多批號（僅設計，待 Claude 審核）

- **最新版完整設計文件**：[CYWEB-STOCKTAKE-LOCATION-BATCH-DESIGN-20261030.md](CYWEB-STOCKTAKE-LOCATION-BATCH-DESIGN-20261030.md)
- 內容含使用者最終確認的手機卡／桌面分組、儲位選擇最右「修改」鈕、取消重複「儲位 1324」標題、**完全刪除「批號／初盤數量」獨立標題及分隔線**、各批號直接輸入、整品號卡片一般／黃／綠邊框、ERP 原始 seq 一列寫回、D1 子明細、並發／舊資料與完整 TODO。
- 本版取代過去「ERP 一列一張手機卡」及「一儲位一張手機卡」的視覺設計。使用者現只要求**文件彙總交 Claude 審核**，尚未授權實作、Migration、QUERY 或部署。
- 新設計文件建立 commit：`25f3a8be579d6d543c1009477e2b5c2e674caa38`；本節只是既有 Handoff 的連結補充，沒有變更應用程式碼。
- 請 Claude 優先檢查 ERP 原序號映射與數量合計、跨庫別同儲位、新批號與 WEB 儲位修改但 ERP 未同步之安全邊界，以及 D1 版本併發；待審核通過再議實作。

---

## 2026-10-30 第五輪正式合併／部署紀錄（Claude 必審）

- 使用者已明確批准「可以合併並部署」。
- [PR #316](https://github.com/simonliu1118-byte/chihyuan-web/pull/316) 已合併 `main`，merge SHA `15e69de02858b49c7bfd3903ed8c4aa2d073fae2`。
- `deploy/cyweb-development` 已採非強制快轉更新至與 `main` 完全相同的 merge SHA，通過部署來源一致性安全檢查。
- [CY Web Deploy #41008014614](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41008014614)：`completed/success`；`validate-deployment-contract` 與 `deploy-development` 均成功，Cloudflare 發布及部署後身分／服務權限檢查通過。網站 https://admin.chihyuancm.com。
- [Runtime Check #41007893310](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41007893310) 最終 `completed/success`，最新版功能分支提交 `ec7ff2304f71f84fc8b8aaad36084278e3457585` 的四項檢查都成功；Governance Check 同樣成功。
- 本次完成的 UI 內容及待審核細節請見下文「第五輪：手機精簡盤點卡與移除儲位下拉」。QUERY、Worker、DB 均未更動；「重新盤點」仍為 TODO。
- CI 與服務健康檢查**不是** iPhone Safari 的真實視覺與操作驗收，請 Claude 特別檢查 320–430px、長字折行、輸入欄頂端對齊、單位、手機展開記錄與桌面表格欄數。
- 本段為發布後文件補記，沒有修改已發布的應用程式碼。

---

## 2026-10-30 第五輪 CI 與 PR 紀錄

- [Draft PR #316](https://github.com/simonliu1118-byte/chihyuan-web/pull/316)：`ui/stocktake-compact-mobile-20261030` → `main`；只包含手機盤點緊湊版、移除儲位選單、UI 回歸測試、Handoff。
- [Runtime Check #41007697860](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41007697860)：`completed / success`，四個工作 `source-contracts`、`browser-typecheck`、`worker-typecheck`、`build` 均成功，已驗證提交 `d03744ac5cafe087332fb081376eec518a789727`。
- 同一提交的 Governance Check 成功。此後只追加本 Handoff 測試紀錄，沒有修改已驗證的應用程式碼。
- **尚未在登入後的實際 iPhone Safari 進行視覺與互動驗收**；Claude 必須檢查極窄手機寬度、長品名／規格自然換行、右側單位與輸入框、左右上緣對齊、展開詳情、Enter／離焦保存，以及桌面表格不退化。
- 依本輪使用者指令先完成修改供檢視，**尚未合併或部署**，須另取得發布授權。

---

# 2026-10-30 第五輪：手機精簡盤點卡與移除儲位下拉（Claude 複審）

## 使用者確認的版型

手機每筆為**左資訊三行、右數量編輯**的窄卡，左右兩欄均從頂端對齊：
1. 左第一行「品號 空格 品名」，品名允許依寬度自然折行，不能省略號截斷；
2. 左第二行是小字「規格」，過長自然折行；
3. 左第三行「批號 儲位」，只以空格分開，不加 `·`，實際顯示如 `批20250301 儲1391;3212`；
4. 右欄「初盤數量／複盤數量」標籤與左第一行**上緣對齊**，輸入框至少 48px 高、16px 字級避免 iOS 自動放大，輸入框右側以小字顯示單位（如「盒」）；
5. 先前手機卡鋪滿庫別、單位、最後填寫、修改紀錄等資訊太高；現在點左側商品資訊才展開次要資料、修改紀錄與新增批號刪除，沒展開時保持三行+右輸入的精簡密度；
6. **所有版型移除「儲位（手機一次顯示一組）」下拉**，不再強制手機只顯示某一儲位；所有盤點列仍按原排序顯示，可繼續用現有搜尋框搜尋儲位；
7. 桌面版維持叫貨式表格，手機樣式限於 `max-width:820px`，繼續使用原本的數量輸入／blur 保存／Enter 下一筆／權限鎖／多人衝突控制。

## 實作檔案與提交

- `src/runtime/modules/StoreStocktake.tsx`：移除 `location` state、`locations` useMemo、手機 matchMedia 過濾以及選單 JSX；新增 `expandedLine` 控制單筆詳情折疊；保留同一個 `data-stocktake-qty` input，右側新增小字單位；手機摘要沿用 ERP 同步的真實品號、品名、規格、批號、儲位；展開包含最後填寫、庫別、歷史、必要的刪除批號操作。提交 `aa1068ef` 與 `18845369`（維持桌面表格原欄位順序）。
- `src/runtime/modules/store.css`：手機用 grid 兩欄、align-items:start，左三行字可自然折行，右數量標籤與第一行同上緣、輸入 48px／16px、單位置右；移除舊手機大卡逐欄展開樣式及儲位選單 CSS；所有樣式集中且只影響盤點頁。提交 `87715082`。
- `scripts/store-stocktake-ui.test.mjs`：更新舊手機版斷言並新增三行、換行、單位、展開操作及無儲位分組回歸測試。提交 `e68d3066`。

## 風險與驗證

- 請以**最新 HEAD** 的 CI Runtime／Governance 結果為準，不能沿用上一輪 PR #315 的結果。Source contract 只能預防主要碼路徑退化，無法取代真實 Safari 視覺驗收。
- Claude 需特別測試 iPhone 320／375／390／430 CSS px、長品名及長規格換行、最窄 320px 的右數量輸入、中文單位長字、輸入鍵盤、不影響桌面所有欄位、多批號同品號不合併、複盤狀態差異資料展開／已鎖定不可輸入。
- **UI 修正，不修改 Windows QUERY、Worker、D1、ERP 寫回治理；前述 TODO「重新盤點」仍不實作。**
- 此輪保持獨立分支／PR，除非使用者另行批准，不合併／部署。

---

## 2026-10-30 iPhone 排版修復已合併並部署（Claude 後續複審）

- 使用者提供實際 iPhone 截圖，指出桌面 14 欄表格在手機無法操作、「全部」下拉選單與搜尋欄分離且有大空白；修復詳情請見下方「手機版實機截圖缺陷修復」。
- [PR #315](https://github.com/simonliu1118-byte/chihyuan-web/pull/315) 已合併 main，合併 SHA `d85298bddd7385b80eca2d7aa65b3b82873cd40c`。開發部署分支快轉到相同 SHA，遵守來源驗證流程。
- [Runtime Check #40948279424](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40948279424) 最終 `completed/success`（第二次 attempt）：browser-typecheck、worker-typecheck、source-contracts、build 均成功。第一次 worker-typecheck 的既有非 UI 佇列測試因 RUNNING/QUEUED 時序差異失敗，重跑成功，沒有為此修改其他程式。
- [Governance Check #40948279357](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40948279357) 成功。
- [CY Web Deploy #40948725006](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40948725006) 完成且成功：部署來源核驗、Cloudflare Worker 與靜態資產發布、部署後權限／健康驗證通過。網站：https://admin.chihyuancm.com。
- 本次只發布 UI/CSS/Source-contract 測試／Handoff，**未改 ERP QUERY、Worker、D1、盤點儲存邏輯**；先前的 TODO「重新盤點」仍完全未實作。
- **後續 Claude 和使用者實機覆核仍必要**：特別驗證 Safari 320/375/390/430 CSS px 搜尋與下拉是否同排、每列可讀可輸入、表頭主管動作是否可見、複盤的帳面欄位與鎖定、離焦儲存與修改紀錄；不能將 CI 成功宣稱為真實 iPhone 視覺驗收。
- 本段為部署完成後的文件紀錄，無新增功能程式碼。

---

# 2026-10-30 手機版實機截圖缺陷修復（Claude 複審重點）

## 使用者回報與根因

使用者部署 PR #314 後在 iPhone 確認：盤點明細直接顯示寬達約 1290／1580px 的桌面表格，手機無法合理輸入或查看右側動作；搜尋欄與「全部」下拉選單之間有大片空白，篩選操作佈局錯亂。先前僅有 TypeScript／原始碼測試，**沒有確認手機實際視覺，不能視為完成手機支援**。

- `src/runtime/modules/store.css` 的桌面盤點表格有 `min-width:1290px`／`1580px`，舊手機媒體查詢只調整輸入高度，**沒有改桌面表格的呈現模式**。
- 共用 `DataViewToolbar` 的 `.cy-data-search` 設有 `flex:1 1 320px`，小於 680px 時全站媒體查詢將搜尋容器改成直向排列，使 320px 的 flex basis 變成**垂直高度**；因此「全部」選單被往下推遠。
- 這些是頁面響應式呈現問題，不涉及 QUERY 或庫存 API。

## 修正內容

- `5087a286`：在既有盤點表格欄位加 `data-label`，供手機以明確標籤顯示品號／品名／規格／庫別／儲位／批號／單位／盤點數量／最後填寫／動作。資料欄位與既有事件、權限、盲盤規則皆不變。
- `f9b12782`：在 `store.css` 增加**集中且僅限盤點頁**的 `@media(max-width:820px)` 樣式，把現有桌面 `cy-ordering-grid` 表格於手機上轉成每品項一個直向的可編輯列（不新增另一套 JSX／狀態管理）；盤點數量輸入為全寬 46px 高、16px 字級；修改紀錄、刪除新增批號、多人衝突處理都保留在對應列。平板／桌面仍保留原表格。
- 同一媒體查詢修正 `cy-data-toolbar-primary`、`cy-data-search`、`cy-data-filters` 方向及 `flex-basis`，使搜尋和「全部」選單在同一橫列、選單寬度 106px。補齊盤點外框 `box-sizing`、`min-width` 防止手機溢出；主管確認按鈕採自然換行。
- `60e86833`：新增 source-contract 回歸測試，檢查手機各資料標籤、表格轉直向列、數量編輯事件沒有遺失、下拉選單保持同列。
- **沒有修改 ERP QUERY、Worker、DB、進度或「重新盤點」TODO**；本次只修手機版 UI。

## 驗證與 Claude 複審

- 最新 CI 工作與部署結果另以本輪正式 SHA 補記，不可沿用 PR #314 的通過紀錄當作手機修復證據。
- Claude 請優先用真實 iPhone（320、375、390、430 CSS px）驗收：搜尋欄與「全部」選單同列且無超大空白；手機頁面寬度不溢出、操作按鈕完整可見；每列品號／品名／批號／盤點數量都可以直接查看；輸入、離焦儲存、Enter 下一筆、查歷史及複盤下的帳面欄位與鎖定狀態都正常；保留共用元件而沒有影響叫貨頁。
- 這次手機卡片化只是一種**手機呈現**，桌面仍是叫貨式表格；不要擅自改動盤點資料或同步邏輯。
- 依使用者最新回報可進行這輪缺陷修復，後續仍保留 Claude 複審要求。

---

## 2026-10-30 第三輪已合併／已成功部署（Claude 複審保留）

- 使用者明確批准：「合併且部署，我直接看看視覺」。
- [PR #314](https://github.com/simonliu1118-byte/chihyuan-web/pull/314) 已合併至 main，merge SHA `b1b48f005826ac2c3070adf3d2d865a8a3d755f8`。
- 依既有保護流程，將 deploy/cyweb-development 快轉至**相同** main SHA，未使用強制更新；已觸發 [CY Web Deploy #40946493623](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40946493623)。
- 部署工作最終狀態 **completed / success**：validate-deployment-contract 和 deploy-development 成功，包含部署來源一致性核對、D1 migration、Cloudflare Worker/資產發布、部署後 D1/Identity/入口權限健康檢查。
- 網站：https://admin.chihyuancm.com ，使用者會自行檢查桌機與手機版視覺。
- 最新 CI：[Runtime Check #40943538927](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40943538927) 與 [Governance Check #40943538616](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40943538616)，均 success，PR 最終 SHA `52d4eae66de5f491a9034408957ef10c08dfaf3e`。
- **Claude 審查仍未完成**：需依下文要求複查版面、輸入／自動儲存、多人版本衝突、盲盤權限及 TODO「重新盤點」的未來 ERP 風險。本輪並未實作 TODO。
- 本節為部署後 Handoff 補記，不代表額外更動本次已發布的應用程式碼。

---

## 第三輪驗證完成（2026-10-30）

- Runtime Check [#40943246310](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40943246310) **completed / success**，對應本輪 UI + TODO 文件 SHA `2120f1dfdf06d946a4b683e2bea978a613f54d36`。
- 四項 CI 工作均成功：`source-contracts`、`browser-typecheck`、`worker-typecheck`、`build`；完整 Node test suite 與 Vite build 完成。
- Governance Check [#40943246330](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40943246330) **success**。
- 此更新僅補測試證據於 Handoff，未改程式邏輯。仍需要 Claude 的瀏覽器桌機／手機視覺複審，特別是橫向捲動、表格欄寬、操作列換行、盤點數量編輯及版本衝突。
- PR #314 保持 Draft，未合併、未部署。

---

# 2026-10-30 第三輪：庫存盤點右側基本架構改版（Claude 複審）

## 本輪確認範圍與已做項目

使用者要求以叫貨明細右側畫面為準，優先完成**庫存盤點基本架構**。此次僅改 UI 與 source-contract 測試，**未修改 QUERY Windows 程式、Worker API、資料庫、庫存同步、權限與 ERP 寫回行為**。

1. 移除畫面上「盲盤中：帳面數量在第一次主管確認前不會由伺服器傳回。」說明文字。盲盤的安全限制不變：初盤仍不得接收或顯示 ERP 帳面數量。
2. 右側表頭改用既有 `cy-record-header`、`cy-ordering-title`、`cy-record-actions`、`StatusChip`：單號 → 狀態 Pill → `YYYY/MM/DD盤點 · 商品 x/y 已填`；右側依狀態顯示「重新整理」「新增批號」「初盤確認」或「複盤確認」，失敗時維持「重新寫回」。原管理員權限、確認對話框與 ERP 重新讀取限制都保留。
3. 初盤進度以 `counted/total` 顯示；複盤中顯示未鎖定且需要複盤列的 `recountQty` 填寫進度，避免直接顯示初盤已完成百分比。注意目前語意是**明細列**，同品號多批號會分別計算；文案遵照使用者指定的「商品」。
4. 搜尋列改用 Claude 已建的 `DataViewToolbar`；原有搜尋條件及「全部／未填／有差異／新增批號」下拉篩選不變，下拉移至搜尋框右側。手機的儲位選單暫時保留原條件，表格可水平捲動。
5. 明細標題改為 **「盤點品號庫存明細」**，不再用每商品一張卡。直接沿用 `cy-ordering-grid-scroll`、`cy-ordering-grid`、`cy-ordering-cell` 叫貨表格樣式：項次、品號、品名、規格、庫別、儲位、批號、單位、數量、最後填寫、操作。初盤不顯示帳面數量；複盤顯示初盤數量、帳面、差異及複盤輸入欄。保留 Enter 下一筆、離焦儲存、數量驗證、多人版本衝突、修改紀錄及新增批號刪除；衝突提示改為表格內跨欄的完整橫列。
6. 復用 `OrderingGrid` 的**既有 CSS 外觀與編輯樣式**，但不直接使用其叫貨專用資料編輯器，以保留盤點的後端版本鎖及盲盤流程；未建立一套新的共用 Grid 元件。

## 本輪 Commit 與檔案

- `2fba47fa` `src/runtime/modules/StoreStocktake.tsx`：共用表頭、Toolbar、盤點表格、移除盲盤提醒。
- `aa27a7e3` `StoreStocktake.tsx`：修正 JSX 層級，將多人衝突訊息放入全寬 table row，且維持對應列的 key。
- `2e9f7682` `src/runtime/modules/store.css`：刪除舊卡片專屬樣式，沿用叫貨表格 CSS，增加必要欄寬與手機水平捲動調整，保持 CSS 集中管理。
- `2c8ca470`、`a237277b` `scripts/store-stocktake-ui.test.mjs`：補表頭、共用 Toolbar、表格、操作與無盲盤說明的回歸檢查。

## TODO（使用者要求先記錄，**這一輪嚴禁實作**）

**未來新增逐品號操作「重新盤點」按鈕**。需求意圖：

1. 使用者點擊盤點明細中的「重新盤點」，代表**該品號這次不盤點**，不可視為已填數量，也不該照一般盤點列寫回。
2. 之後 QUERY 執行此次盤點單的 **ERP 回填** 時，必須把對應的 ERP 盤點列**刪除**，不能僅在前端隱藏；此操作涉及 ERP 寫入例外與核對，日後需獨立設計／安全審核。
3. 所有這次不盤點的品項必須存成可管理的**獨立清單**，不可因畫面篩選或重整而丟失。
4. 未來**使用者有需求時**，由 QUERY 根據該清單操作 ERP，**另產生一張盤點表**，供後續盤點；不是按「重新盤點」後立即自動建立。
5. 待設計時要確認「品號」範圍是否包含同品號多批號／多儲位的所有列，如何追蹤來源單及 ERP 列序號、排除後的主管確認完整性、例外狀態、刪除／產生新 ERP 盤點表的安全界線、權限、審計、佇列與重試。請 Claude 先獨立複審工單及 ERP 寫回治理，再安排新一輪實作。**此項沒有新增按鈕、API、schema 或 QUERY 程式碼。**

## 測試與待複審

- 請以**本輪最後 UI SHA** 的 Runtime Check、Governance Check、PR 部署 dry-run 結果為準，不引用上一輪 CI 當作本輪證據。
- Claude 需重點檢查：多列／相同品號不同批號、手機水平捲動、狀態切換後欄位數、複盤 progress、輸入離焦儲存／Enter、版本衝突跨欄提示、初盤 bookQty 不外洩、操作權限與狀態。
- 此 PR 仍是 Draft；本輪未獲合併或部署授權。後續只有使用者明確批准才合併部署。

---

## 第二輪 CI 最終結果（2026-10-30）

- [GitHub Actions Runtime Check #40940708273](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40940708273) `completed / success`，驗證程式 SHA `a1b81b3ddb89bf9471bfb76ef3b5df6583355af1`。
- 4 個工作均成功：`browser-typecheck`、`worker-typecheck`、`source-contracts`、`build`。build 內含本機 D1 驗收、完整 Node 測試（包括新增 `scripts/store-stocktake-ui.test.mjs`）、Vite 打包。
- 前兩輪 CI 失敗分別因 Enter 共用鍵盤規範及 Field/FormSection 共用表單規範，均已按既有設計修復；最新程式版全部通過。
- 此後只更新本 Handoff 文件，不變更已測試的程式檔。PR #314 仍 Draft，尚未合併、尚未部署。瀏覽器實際視覺檢查與互動驗收仍列為 Claude 複審工作，不得把 CI 當成實際截圖驗證。

---

## 第二輪補充：共用表單元件治理檢查

- 修正 Enter 鍵後，Runtime Check run `40940419218` 的 browser typecheck、source contracts、worker tests 通過，但完整 Node 測試的 `scripts/form-fields.test.mjs` 擋下表單中的原生 `<label>`，要求所有業務表單必須沿用共用 `Field` / `FormSection`。
- `cf0bf631`：`StoreStocktake.tsx` 改以共用 `Field required size="l"` 包住唯一輸入，`FormSection` 布局，按鈕仍位於輸入框右側。
- `a1b81b3`：`store.css` 對共用欄位提供局部 flex 寬度與底部對齊，不覆寫其他表單。
- 最新 CI 需以 `cf0bf631`／`a1b81b3` 之後的版本為準；此段記錄既有失敗與修正，保留給 Claude 複審。

---

## 2026-10-30 CI 發現與修正（第二輪補充）

- 新增的單欄位忽略底稿輸入表單，首次 Runtime Check `40940260959` 的 worker-typecheck／Identity adapter regression tests 階段被共用 `scripts/form-keyboard.test.mjs` 擋下：所有資料輸入表單必須使用既有 Enter 導覽處理器。
- `2e488897`：`src/runtime/modules/StoreStocktake.tsx` 的忽略底稿表單補上既有 `enterAdvancesThenSubmits`，可在輸入編號後按 Enter 直接送出，符合共用鍵盤與表單規範。沒有修改忽略清單 API。
- **首次 CI 的失敗不等於最新 SHA 的失敗；必須重新看 `2e488897` 之後的最新 CI 結果。** Claude 應保留此過程，複審鍵盤操作及成功新增時 Dialog 不關閉。

---

# 2026-10-30 盤點 UI 第二輪（Claude 後續複審必看）

## 使用者最終確認需求

1. **同步完成通知**必須使用 ERP 查詢現有**右上角**綠色 Toast（有「查看」按鈕）；只在使用者確實執行的同步工作結束時通知，載入歷史結果、重新整理、進入頁面都不能跳一次。不得再用 `useFeedback` Alert Dialog 代替 Toast，也不要在「已排入佇列」時發完成通知。
2. 左側入口改 **「設定忽略底稿」**。對話框寬度從 620px 縮窄 20% 為約 **496px**；「新增」按鈕放輸入框右方；移除底部「取消」，保留右上角 X；成功新增後保持對話框開啟、清空輸入、更新清單。
3. 已忽略清單改用叫貨共用 `cy-op-table` 樣式（不是另一套 `DataView` 視覺）；保留底稿編號、加入時間、單項「移除」。
4. 左側盤點清單完全採用叫貨共用 `cy-op-list`、`cy-op-list-row`、`cy-status-row`、`StatusChip`，三項**同一行**：左底稿編號、中 `2026/10/28盤點`、右狀態 Pill。**不顯示** `0/47 列已填寫` 等進度。右側明細仍可顯示填寫進度。
5. Windows QUERY、Worker API、資料庫、忽略排除規則這一輪均不修改。

## 變更與 Commit SHA

| Commit | 檔案 | 具體修改 |
|---|---|---|
| `96ec696b` | `src/runtime/modules/useErpJob.ts` | 在共用 `ERP_QUERY_DONE_EVENT` 增加 `queryType`，仍沿用 `sawRunning` 防止歷史結果重播通知 |
| `3397f29e` | `src/App.tsx` | `STOCKTAKE_SYNC` 即使盤點頁可見也走全域 `useToastQueue` + `ToastRegion`；其他 ERP 查詢仍只在頁面隱藏時 Toast；查看導航走門市 |
| `81904c75` | `StoreStocktake.tsx` | 移除原本依 `job.result` 跳 Dialog（重整重播的根源）；移除同步排隊即通知；叫貨清單、日期、狀態 Pill、手機 select 不再顯示進度 |
| `0664f651`, `4dfb1c0f` | `StoreStocktake.tsx` | 496px 忽略視窗的配套 JSX、輸入框右側「新增」、無取消按鈕；共用 `cy-op-table`；新增成功保留視窗 |
| `c0043fe9`, `411af305`, `71932fec` | `store.css` | 修改左欄寬至約 330px，三欄同列 CSS、Dialog 局部縮窄及手機表格，調高覆寫選擇器優先度；樣式集中在原 `store.css` |
| `529f509c`, `45bac79b` | `scripts/store-stocktake-ui.test.mjs` | 新增 Toast 事件觸發防重播、共用清單結構、忽略視窗佈局的 source contract 回歸檢查 |

狀態色：初盤中／寫回中 info（藍）、複盤中 warning（黃）、寫回失敗 danger（紅）、ERP 已確認 success（綠）；依現有 `StatusChip` 語意。

## 驗證、風險及 Claude 複審要求

- 新版 PR 需由最新 SHA 的 Governance Check、Runtime Check、部署 dry-run 結果證明；本節記錄時 CI 尚未完成。
- 測試腳本的 source contract 僅是基本回歸保護，**不能取代**實際瀏覽器視覺檢查。
- 複審「重新載入已完成 ERP Job 不 Toast」與「新同步在完成時恰好一筆右上角 Toast」；跑不同查詢頁不應因本改動改變原有通知規則。
- 複審 330px 左欄在窄桌機下的三欄同列與狀態 Pill 是否截斷；手機 select、496px Dialog、清單表格、鍵盤 Enter、刪除確認須正常。
- 檢查 `useErpJob` 的 `STOCKTAKE_WRITE` 不被誤當成同步完成。
- **此輪不會自行合併／部署**；等使用者後續批准。原 2026-10-30 部署成功記錄屬前一輪版本，不代表這輪已部署。

---

## 2026-10-30 已合併並完成開發環境部署（供 Claude 事後複審）

- 使用者明確批准合併並部署，仍要求保留 Handoff 交 Claude 複審。
- PR #313: https://github.com/simonliu1118-byte/chihyuan-web/pull/313 ，已合併 main。
- Merge SHA: `7f43a50a3e67dd48ef044488805709d96ec87f83`。
- 開發部署分支 `deploy/cyweb-development` 更新至完全相同的 main SHA，遵守 `DEPLOYMENT_SOURCE_MUST_MATCH_CURRENT_MAIN`。
- GitHub Actions CY Web Deploy run: https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40926268529 ，最終 `completed/success`，包含遷移、Worker 部署、HTTPS/static 與部署後權限檢查。
- 所有原先的修改與待審內容仍在本文件；Claude 複審不因部署成功而省略。請注意此記錄是部署完成後的文件補記，非重新發行程式。

---

## 2026-10-30 使用者批准合併及部署，Claude 後續複審保留

- 使用者明確改為允許 PR #313 合併 main 並部署，但**仍要求保留完整 Handoff 供 Claude 事後複審**。
- 合併前確認 PR #313 mergeable=true、clean；前次 `87066760` 的 Runtime Check、Governance Check、PR deploy dry-run 均成功。
- 原本開發分支部署提交 `19a44060` 的驗證成功，但因 `DEPLOYMENT_SOURCE_MUST_MATCH_CURRENT_MAIN` 被安全檢查拒絕真正發布；本次遵循安全流程先合併 main 再發布。
- 部署後應補記 merge SHA、開發部署 workflow run、health 結果。Claude 仍需複審：獨立忽略清單與 legacy IGNORED 遷移、同步佇列競態、備份資料表覆蓋、手機 UI，以及用戶要求的查詢完成通知。

---
## 2026-10-30 開發部署執行紀錄

- 使用者明確批准**部署但不合併**。
- PR #313 的檢查提交 `8706676046b83ff1d5b748c9a7e692761d4dd1e3`：Governance Check、Runtime Check、CY Web Deploy 的 pull_request 驗證皆成功。
- 原開發部署分支 `deploy/cyweb-development` SHA `fe0f13db7c88b8c21374e3307bd4f70b21eb7459`，與功能分支已分歧；建立雙 parent 合流部署提交 `19a44060436928f972d3ca58e746af406751033d`，使用通過驗證的功能樹，並由部署分支快轉更新來觸發既有開發部署工作流程。
- 開發部署 GitHub Actions run: https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/40917566654 。請以該 run 的**最終結果及健康檢查**判定部署成功，不能只看推送成功。
- **PR #313 不合併**；無正式生產環境發行。

---
## 2026-10-30 部署前檢查

使用者已同意部署，但明確要求 **不合併 PR #313**。部署前 Runtime CI 曾失敗：新增 `stocktake_sync_ignored` 未進入資料表驗證與可攜備份覆蓋清單。已補：
- `scripts/validate_schema.py`：`8bf30c5e`，補入 EXPECTED_TABLES。
- `worker/backup/schema-columns.ts`：`11ddcc26`，將新表三欄納入可攜備份。

需檢查最新版 CI，再依既有環境部署流程執行；PR 保持 Draft，不合併 main。

---
## 2026-10-29 架構修正（依使用者最新最終定義）

**最終需求：忽略清單僅告訴 QUERY 哪些 ERP 底稿不要掃；只有 QUERY 真正同步成功才有 WEB 盤點單。QUERY Windows 程式碼不修改。**

變更：
- `migrations/0031_stocktake_ignore_exclusions.sql`：新增獨立 `stocktake_sync_ignored(sheet_no,created_at,updated_at)`；將舊 `IGNORED` 記錄移至此清單。尚未 ERP 同步的 legacy stub 刪除；已同步的舊底稿保留資料，轉回 COUNTING（歷史資料保護待 Claude 審查）。
- `worker/http/store-stocktake-routes.ts`：管理員 `GET ?ignored=true` 查獨立清單、`POST /ignore` 加入編號、`DELETE /ignore` 移除編號；不再寫入 `stocktake_sheets`，也移除 `/:sheetNo/ignore` 和 `/unignore` 的盤點狀態操作。 `POST /sync` 讀此排除清單形成既有 `skipSheets`，不改 QUERY 協定。
- `worker/http/stocktake-erp.ts`：同步結果存入 D1 前再次檢查忽略清單，以防 ERP job 排隊期間新增忽略卻仍匯入。這是 WEB 同步接收端防護，**沒有修改桌面 QUERY**。
- `src/runtime/modules/StoreStocktake.tsx`：管理表只存底稿編號與加入時間；「移除」呼叫 `DELETE /ignore`；從盤點卡移除「設為忽略／取消忽略」狀態動作；前一輪已更名「同步ERP盤點單」及移除「更新畫面」。
- `scripts/store-stocktake.test.mjs`：調整新增/移除忽略 API 測試、確認未成功同步的底稿不會出現在 WEB。

主要提交：`adafdf12`、`6c7c7c88`、`f5df389c`、`b7ec0a29`、`8c25610f`、`df8a270a`。

**注意：先前 Handoff 對 `unignore`、以盤點狀態表示忽略、`?ignored=true` 回傳 StocktakeSheet 的敘述已過時，以本節為準。** Claude 必須檢查 migration 對已有歷史的 IGNORED 盤點單處理、同步佇列競態與最新版 CI。未合併、未部署。

---
## 2026-10-29 使用者釐清需求：忽略清單純粹是 ERP SYNC 排除表

- 更新盤點單改名為 **同步ERP盤點單**；移除「更新畫面」，因已有 30 秒清單自動輪詢及其他即時刷新。
- 忽略底稿**不是另一種需要在 WEB 操作的盤點單**，目的僅是排除 ERP 尚存但不需匯入的底稿編號。
- 新增忽略編號後 `STOCKTAKE_SYNC` 的 `skipSheets` 必須包含它；從排除表移除後，下次同步若 ERP 確實存在，才能產生 WEB 盤點單。
- 既有 schema 把同步前的排除編號記為 `stocktake_sheets.status=IGNORED` stub。為維持相容而不另加 migration；移除 **尚未讀明細** 的忽略 stub 時，API 刪除該 stub，不再轉成 `COUNTING` 造成 WEB 平白出現底稿；曾有明細的已忽略底稿則保留既有恢復行為，以免破壞歷史資料。
- UI 表格動作改稱「移除」，確認對話框清楚解釋是排除清單調整，不會建立 WEB 底稿。

本輪提交：
- `a940ba32`：同步ERP盤點單按鈕文案與刪除更新畫面。
- `15b6cfa4`：排除清單的 UI 文案和操作提示。
- `3e64bd70`：修正 `worker/http/store-stocktake-routes.ts` 的未同步忽略 stub 移除行為。
- `ce5ff95b`：`scripts/store-stocktake.test.mjs` 增加移除排除項後 WEB 不產生底稿的回歸斷言。

驗證要求：同一張 stub 加入忽略→SYNC skip→移除忽略→WEB 清單仍無該單→再次 SYNC 包含該底稿→ERP 回傳後才出現在 WEB。最新 Runtime CI 需對 **最終 SHA** 驗證，不得沿用先前成功紀錄。

---
# CYWEB 庫存盤點 UI 修改 — Claude 審查交接
日期：2026-10-29
Repository: `simonliu1118-byte/chihyuan-web`
Branch: `ui/store-stocktake-layout-20261029`
Scope: 僅 CYWEB 前端盤點頁面；不更動 Worker、DB、ERP Driver，不部署。

## 使用者需求
1. 上方查詢完成訊息不再佔據一整張卡，改用既有通知元件。
2. 更新盤點單／更新畫面／忽略底稿管理移入左側「盤點單」卡頂部，使左右欄從同一高度開始。
3. 新增忽略底稿的對話框中直接顯示已忽略底稿表格及逐筆取消忽略；移除「顯示忽略」。
4. 所有修改寫入 Handoff，最後交 Claude 審查。

## 按鈕語義確認（已閱讀 Worker）
- **更新盤點單**：POST `/api/business/store/stocktake/sync`，建立 `STOCKTAKE_SYNC` ERP job；skip 已忽略及已讀明細底稿；非強制重讀所有底稿。
- **更新畫面**：GET 同一路徑及畫面資料刷新，**不呼叫 ERP**；原本清單即有每 30 秒輪詢，選中底稿每 10 秒輪詢。
- **取消忽略**：呼叫現有 POST `/:sheetNo/unignore`，用 `expectedVersion` 做樂觀鎖；狀態從 IGNORED 恢復 COUNTING，並**不刪除**資料。按鈕文案使用「取消忽略」避免誤解。
- **已忽略底稿**：管理員專用 GET `?ignored=true`。

## 已實作修改
### Commit `7852ba46` — `src/runtime/modules/StoreStocktake.tsx`
- 將整排 `cy-store-toolbar` 按鈕移入 `cy-stocktake-sheets`，新增 `cy-stocktake-list-actions`，讓雙欄上移。
- 移除 `showIgnored` checkbox 和「顯示忽略」在清單、手機 select 的合併邏輯；忽略底稿在管理視窗處理。
- 管理員一律讀取忽略清單（不須啟用 checkbox）。
- 將已完成的查詢狀態改為共用 `useFeedback` 通知；排隊和執行中仍保留 `ErpJobStatus`，讓使用者看到查詢進度。
- 忽略底稿 Dialog 增加共用 `DataView` 表格＋手機卡片，欄位：底稿編號、底稿日期、單項「取消忽略」；刪除前用共用 `useConfirmation` 二次確認。
- 使用既有 `unignore` API；成功後重新讀取清單；失敗交由既有 `reportError` 顯示。
- 按鈕 `更新畫面` 保留，因為手動即時刷新有實質用途。

### Commit `ba45564f` — `src/runtime/modules/store.css`
- 新增盤點專用的集中式 selector，控制導覽卡頂部按鈕列與忽略清單間距，不散落於其他樣式檔。

### Commit `f284fef4` — 補齊成功提示與查無新單通知
- 原有 `setMessage` 的成功提示因移除全寬 FeedbackBanner 不可消失；改由共用 `useFeedback` 顯示，保留所有成功訊息。
- ERP `NOT_FOUND` 狀態顯示「沒有新盤點單」，避免向使用者只顯示狀態代碼。

### Commit `98803483` — 保留原按鈕文案
- 左側仍稱「新增忽略底稿」以符合使用者原操作習慣，開啟後是兼具新增、清單、單項取消忽略的「忽略底稿管理」Dialog。

## 風險／審查重點
- `useFeedback` 目前是共用 Dialog 提醒（非自動消失 Toast）。需求文字「通知」可能指共享通知體系，請 Claude 評估是否要採用 `ToastRegion`，不要私造通知元件。
- 目前沒有瀏覽器視覺驗證；檢查窄版手機下 `DataView` 卡片切換及對話框高度/捲動。
- `ignoreForm` 新增後會維持原本成功即關閉 Dialog 的行為；再次開啟可看到清單。
- 管理員開啟盤點頁時多一個 `?ignored=true` GET，應注意失敗時的反應（目前與正常清單同時取得）。
- 原已存在的「設為忽略」和選中已忽略底稿上的「取消忽略」操作仍保留 API 路徑，但清單不再顯示已忽略底稿。
- 提交 `42019a23` 對應 Governance Check 已通過，Runtime Check 曾處於執行中；新增修正提交 `f284fef4` 必須另取最新版 CI 證據。請在審查前要求最新 CI 證據；不得聲稱已驗證或直接合併部署。

## 後續驗收
1. Desktop：頁面沒有全寬操作列、同步進度只在執行時出現、左右卡對齊。
2. 按更新盤點單：ERP job 仍建立且完成時有共用通知；更新畫面不送 ERP job。
3. 管理員新建忽略底稿：成功；重新打開 Dialog 可見表格。
4. 逐筆取消忽略：有確認、回復初盤中、清單同步更新；測試 409 version conflict。
5. 非管理員不可看見忽略管理按鈕或取得清單。
6. 手機版：按鈕換行合理，忽略項目卡片可操作。
7. TypeScript build、單元測試及 CI 全綠。

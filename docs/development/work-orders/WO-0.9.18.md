# WO-0.9.18 移除多餘說明文字、我的帳號改版

- 狀態：**已完成・Claude 審查通過・PR #220 已合併**（截至 2026-10-23；歷史交付狀態見 §8、§9）
- 分支：`cyweb/account-hints-wo-0.9.18`　PR：[#220](https://github.com/simonliu1118-byte/chihyuan-web/pull/220)（已合併）
- 閱讀提示：本單 §0 的「不合併、不部署」、§8 的「待審查／尚未部署」是 GPT **交付當時**的執行界線與證據，不是目前 PR 狀態；§8 完成報告及 §9 Claude 審查紀錄原文保留供交接。
- 依據：`PROJECT_RULES.md` §9
- 視覺規範：`docs/architecture/CY_WEB_VISUAL_GUIDE.md`

## 0. 執行限制（必讀）

- **不得新增或修改 `.github/workflows/*`**，不得新增工作單未列出的檔案（示意圖、mock HTML、SVG、另外的測試 runner 等）。截圖由審查者以實際畫面擷取。
- 不合併、不部署。

## 1. 背景（使用者原話）

- 「全盤檢視，這種沒用的小字說明移除，只留下真正有用的說明」（截圖：「3001 劉建昌 · 超級管理員。密碼與驗證碼由 CYID 帳號服務保管，CY Web 不會保存。」）
- 「我的帳號裡面這個看起來還是好怪，現在一般比較現代的變更密碼／變更 email 都怎麼做的？」→ 定案：先顯示目前設定，每項一個「變更」按鈕開小視窗。

## 2. 已定案事項（不得更改）

1. **說明文字的去留規則**（全站 `src/` 所有頁面、表單、對話框、卡片）：
   - **留**：空狀態提示（「尚無地址」「沒有符合條件的…」）；會影響輸入結果的規則（日期範圍規則、密碼長度、格式要求）；不可逆或安全相關的警告（例如憑證原文只顯示一次）；錯誤與成功訊息。
   - **刪**：解釋系統運作原理的句子（例如「密碼與驗證碼由 CYID 帳號服務保管，CY Web 不會保存」）；重複標題意思的副標；操作教學（例如「填好後按上方『確認入庫』」，日後放進使用說明）；頁面頂部的使用者自我介紹列（例如「3001 劉建昌 · 超級管理員。」，右上角已顯示）。
   - 模組頂部標題列的一行說明（`PAGE_META.description`）**保留**，不在本單範圍。
2. **我的帳號頁**改為一張卡片：
   ```
   劉建昌　3001　超級管理員
   ─────────────────────────────
   Email   s***@gmail.com（已驗證）   [變更]
   密碼    ••••••••                   [變更]
   ```
   - Email 若目前取得不到地址，只顯示驗證狀態（「已驗證」／「待驗證」）；**不修改 CYID 或新增後端 API 取 Email**。
   - Email 待驗證時，該列顯示「待驗證」與「寄送驗證碼」按鈕（沿用現有 `startCurrentEmailVerification` 流程）。
3. **變更密碼視窗**：目前密碼、新密碼、確認新密碼，每欄右側「顯示／隱藏」切換鈕（👁，`aria-label`「顯示密碼」／「隱藏密碼」）；新密碼下方即時檢查兩列「✓ 8～16 字元」「✓ 兩次輸入相同」（未符合為灰色 ○）；兩項都符合才可按「變更密碼」。成功後沿用現有「已變更，請重新登入」流程。
4. **變更 Email 視窗**分兩步：①新 Email＋目前密碼 →「寄送驗證碼」；②6 位數驗證碼 →「確認」，旁邊「重新寄送」按鈕在寄出後 60 秒內不可按並顯示倒數（「60 秒後可重新寄送」）。「返回」回到第①步。成功後沿用現有流程。
5. 兩個視窗用共用 `Dialog`；表單按鈕放視窗底部，與其他對話框表單一致。

## 3. 範圍

1. 全站說明文字檢查與刪除（依 §2-1），附對照表。
2. 我的帳號頁改版與兩個視窗。
3. 文件、版本、TODO。

## 4. 不做

- CYID 後端、API、驗證流程本身的變更。
- 模組標題列說明（`PAGE_META.description`）。
- 使用說明（日後另案）。
- 新增 CI workflow、示意圖檔、mock 頁面。

## 5. 實作指引

### 5.1 說明文字
- 先列出候選：`grep -rnE "<p( className=\"[^\"]*\")?>[^<{]{8,}" src --include=*.tsx`，再逐一人工判斷（也要看 `<small>`、`title`、`placeholder` 以外的長說明 `<span>`）。目前約 50 處。
- 刪除後同步刪掉只為該文字存在的 CSS class（例如 `.cy-identity-intro` 若不再使用）。
- 完成報告附對照表：`檔案:行號｜原文｜留／刪｜理由`，**每一處都要列**，審查者逐條核對。

### 5.2 我的帳號
- `src/identity/SharedIdentityPage.tsx` 的 `MyAccountPage`（及其使用的帳號區塊）重寫為 §2-2 卡片；兩個視窗拆成同檔或 `src/identity/` 下的小元件。
- 沿用現有 `changeOwnPassword`、`startOwnEmailChange`、`startCurrentEmailVerification`、`confirmOwnEmailChange`，行為與錯誤訊息不變。
- 先確認 `/api/auth/me`（`AuthUser`）或現有 identity client 是否已有目前 Email；有就遮罩顯示（保留第一個字元與 `@` 之後網域：`s***@gmail.com`），沒有就依 §2-2 只顯示狀態。
- 密碼「顯示／隱藏」做成共用 `PasswordInput`（`src/ui/forms/PasswordInput.tsx`），三個密碼欄與 Email 視窗的目前密碼都使用。
- 樣式寫在既有 identity CSS（多行寫法、只用 tokens）。

### 5.3 文件、版本、TODO
- `VERSION`／`package.json` → `0.9.18`；`BUILD` 維持 `0`。
- `TODO.md` 最上方新增 0.9.18 段落並連結本單；在 0.9.17 段落補記 PR #217 合併 `045c86c`、部署 run 39225975605（#317，success）。
- `CY_WEB_VISUAL_GUIDE.md`：說明文字去留規則（§2-1）、帳號設定「目前值＋變更」樣式、`PasswordInput`。

## 6. 驗收清單

- [ ] 對照表涵蓋所有候選說明文字，每處標明留／刪與理由；刪除項符合 §2-1。
- [ ] 我的帳號頁沒有「密碼與驗證碼由 CYID…」與自我介紹列；顯示姓名、員工編號、角色、Email（或驗證狀態）、密碼兩列各有「變更」。
- [ ] 變更密碼視窗：三欄可顯示／隱藏；即時檢查兩項，未全部符合時按鈕不可按；成功後重新登入流程與原本相同。
- [ ] 變更 Email 視窗：兩步驟、重新寄送 60 秒倒數、返回可回第①步；成功流程與原本相同。
- [ ] Email 待驗證時可從該列寄送驗證碼並完成驗證。
- [ ] 手機 390 寬版面正常（視窗全寬、按鈕可點）。
- [ ] `npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local` 全部通過。
- [ ] `node --test scripts/*.test.mjs` 全部通過（需先 `git clone --depth 1 https://github.com/simonliu1118-byte/cyapps .tmp/canonical-cyapps`；無法取得時在完成報告寫明，**不得**另寫 workflow 代替）。
- [ ] 沒有新增或修改 `.github/workflows/*`，沒有範圍外檔案。
- [ ] VERSION／package.json 為 0.9.18；TODO、視覺規範已更新。

## 7. 截圖要求

執行者不需提交截圖。審查者會擷取：我的帳號（桌面與手機）、變更密碼視窗（含即時檢查）、變更 Email 兩個步驟、幾個刪除前後的頁面。

## 8. 完成報告（執行者填）

- PR：[#220](https://github.com/simonliu1118-byte/chihyuan-web/pull/220)；工作分支 `cyweb/account-hints-wo-0.9.18`，從 `main` commit `461eca2c` 建立，不合併、不部署。
- 驗收清單逐項結果：
  1. **全站說明文字：已完成原始碼盤點及刪改，待實際畫面複核。** 使用 GitHub Git Tree 取得 `src/` 全部 60 個 TSX 檔案，逐檔檢視 `<p>`、`<small>`、`<span>` 長文；本節後方列出逐項留刪及理由（含刪除前位置與目前分支候選索引），60 個 TSX 均已納入盤點。保留輸入規則、安全警示、空狀態及資料內容；刪除操作教學、重複副標與實作原理說明；`PAGE_META.description` 未動。刪掉已不用的樣式。
  2. **我的帳號：實作完成／實機待驗。** 一張卡片呈現姓名、員工編號、角色、Email 驗證狀態與遮蔽密碼，兩項各自進入變更對話框；移除自我介紹與 CYID 技術說明。現有 `AuthUser` 沒有 Email 地址，遵守 §2-2 僅顯示驗證狀態，不新增 API。
  3. **密碼 Dialog：實作完成／實機待驗。** 三組共用 `PasswordInput`，各自有 👁 切換與可及名稱，顯示「8～16 字元／兩次輸入相同」即時勾選，未符合不可提交；沿用 `changeOwnPassword` 及重新登入流程。
  4. **Email Dialog：實作完成／實機待驗。** 新 Email 與目前密碼 → 六碼驗證，倒數 60 秒、重新寄送、返回；即使返回或重新開啟 Dialog，冷卻期間也不可重新寄送；沿用原 `startOwnEmailChange`／`confirmOwnEmailChange`；寄送失敗會顯示錯誤並可重新操作。
  5. **待驗證 Email：實作完成／實機待驗。** 從帳號 Email 列呼叫 `startCurrentEmailVerification`，成功取得 challenge 後六碼確認。
  6. **390px 手機：樣式已實作／實機待驗。** 使用單卡片、同一套小型 Dialog、響應式列排版；尚未取得實際畫面。
  7. **型別／來源／建置／D1：GitHub Actions 既有 Runtime Check 已通過。** 於 [run 39257042924](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39257042924) 的 Worker TypeScript、Browser TypeScript、source-contracts、Local D1 runtime acceptance、Vite build 均為 success。該檢查使用既有 workflow，非新增。
  8. **完整 Node 測試：既有 CI 涵蓋多組測試並通過，但未執行一次完整 `node --test scripts/*.test.mjs`。** 工作單所要求的 canonical cyapps clone 與完整集合命令尚無執行證據，不能宣稱該項完全通過。
  9. **範圍／workflow：以 GitHub Compare 核對變更全部是指定 `src/` 程式及樣式、`TODO.md`、視覺規範、工作單；無 `.github/workflows/*` 差異、沒有示意圖／mock／新測試 runner。**
  10. **版本與文件：`VERSION` 0.9.18、`package.json` 0.9.18、`BUILD` 0；TODO 已新增本單並補記 V0.9.17 合併與部署，視覺規範已更新。**
- 與工作單不同之處與原因：
  - `AuthUser` 不回傳 Email，因此只顯示驗證狀態（工作單明示的允許情境）；未修改 CYID 或後端 API。
  - 本地環境執行 `git ls-remote`／`git clone` 曾顯示 `Could not resolve host: github.com`。改由 GitHub Connector 的 Git Tree 和 Contents 讀完整 `src/`，且**直接採用既有 GitHub Actions 的實際驗證結果**，不新增工作流程。獨立完整 Node 命令及實機 UI 截圖仍須審查者驗證。
  - 為確保現有程式目錄更新契約測試通過，保留「每日台灣時間凌晨 3 點自動確認版本」及最近確認時間；僅刪除操作教學。
- 驗證指令輸出摘要：
  - Runtime Check [#39257042924](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39257042924)：**success**，包含 TypeScript browser／Worker、source-contracts、Local D1、Vite build、身份及 ERP 等回歸測試。
  - Governance Check [#39257042800](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39257042800)：**success**。
  - Connector 靜態檢查：四個既有 identity API 呼叫、四個共用密碼欄、60 秒重新寄送、防止無效密碼提交、CSS 390px media rule 均符合。
  - `npm run typecheck`：CI 分別執行 `tsc --noEmit -p tsconfig.json` 與 `tsconfig.worker.json`，兩者通過。
  - `npm run validate:source`：CI source-contracts 執行主要 Python contracts 驗證通過；是否包含此 npm script 的所有串接子指令，以審查者直接執行為準。
  - `npm run build`：CI Vite build 通過，並有獨立 TypeScript 成功；未以完全相同 npm 指令重新執行。
  - `npm run validate:d1:local`：CI 直接執行且通過。
  - `node --test scripts/*.test.mjs`：未單獨執行此完整集合命令（CI 已執行其中的回歸測試）。
- 操作驗證步驟：以已驗證／待驗證的真實帳號依次驗證我的帳號卡片、三個密碼眼睛按鈕、八到十六字及雙輸入判斷、密碼變更強制重新登入、Email 雙步驟／返回／冷卻計時／六碼確認、待驗證 Email、390px 手機與桌面版；截圖由審查者依 §7 擷取。
- 說明文字對照表：下列所有表格均屬本節完成報告。原始刪除位置以修改前行號表示，未刪保留位置以工作分支目前行號表示；動態資料 JSX 僅摘要呈現。

  | 檔案／刪除前原文 | 留／刪 | 理由 |
  | --- | --- | --- |
  | `SharedIdentityPage.tsx`：員工編號姓名＋「密碼與驗證碼由 CYID 帳號服務保管，CY Web 不會保存。」 | 刪 | 頁面頂部自我介紹與技術原理 |
  | 同檔：Email 待重新驗證長篇解釋 | 刪／改 | 留下待驗證狀態、驗證操作與錯誤 |
  | 同檔：可管理一般使用者「點姓名開啟」介紹 | 刪 | 操作教學 |
  | 同檔：新增使用者可套用同職位使用權說明 | 刪 | 操作教學 |
  | 同檔：模組使用權與管理員權限各自獨立說明 | 刪 | 系統原理介紹 |
  | 同檔：「員工能使用的志遠系統…」副標 | 刪 | 重複標題 |
  | 同檔：人員權限表／群組表長篇「勾選立即生效…」 | 刪 | 操作教學 |
  | `CustomerOperationalPage.tsx`：客戶編號可先留空、稍後修改 | 刪 | 操作教學 |
  | `ErpItemQueryPage.tsx`：點選品號重查完整資料 | 刪 | 操作教學 |
  | `ErpCustomerQuery.tsx`／`ErpSupplierQuery.tsx`：點客戶／廠商代號查詢 | 刪 | 操作教學 |
  | `ErpReceivableQuery.tsx`：點憑證號碼展開的說明 | 刪 | 操作教學；計算與幣別規則保留 |
  | `ErpPartyOrdersDialog.tsx`：「選擇單據日期後按查詢」 | 刪 | 操作教學；日期限制保留 |
  | `OutsourcingOperationalPage.tsx`：「填好後按確認入庫」及料件、庫存運作敘述 | 刪 | 操作教學與重複欄位說明 |
  | `OutsourcingMasterData.tsx`：做出上面產出數量需要的料件 | 刪 | 重複欄位標題 |
  | `WorkLogOperationalPage.tsx`：填寫後按「送出審核」與平台選擇介紹 | 刪 | 操作教學 |
  | `AuthGate.tsx`：「記住我僅保留員工編號，不儲存密碼。」／「驗證登記 Email 後重新設定密碼。」 | 刪 | 技術說明與重複標題 |
  | `CyInvoiceRecoveryAdminPanel.tsx`：災難復原用途說明 | 刪 | 重複功能介紹；重要撤銷／接管安全警告保留 |
  | `ProgramCatalogPage.tsx`：解壓縮下載、工具選單開啟教學 | 刪 | 操作教學；每日確認時間與最近確認時間保留 |

### §8 補充：已逐項判斷的說明文字（位置為檢查前行號）

| 檔案／行號 | 原文或原文摘要 | 留／刪 | 理由 |
| --- | --- | --- | --- |
| 客戶 CustomerOperationalPage:849 | 客戶編號可先留空，之後在「修改」補填。 | 刪 | 重複操作教學 |
| ERP ErpItemQueryPage:145 | 點選品號，重新向 ERP 查詢該商品完整資料。 | 刪 | 重複操作教學 |
| 委外 OutsourcingOperationalPage:585 | 交給協力廠商的料件；可註明預計做成的成品與 BOM。 | 刪 | 非輸入限制的描述 |
| 委外 OutsourcingOperationalPage:644 | 填好後按上方「確認入庫」。 | 刪 | 操作教學 |
| 委外 OutsourcingOperationalPage:672 | 依出庫、入庫紀錄即時計算的協力廠商手上庫存。 | 刪 | 系統運作解釋 |
| 工作日誌 WorkLogOperationalPage:599 | 填寫日期與工作內容；儲存後可在明細按「送出審核」。 | 刪 | 操作教學 |
| 工作日誌 WorkLogOperationalPage:611 | 每個工作項目可選平台，並加上多個計分分類。 | 刪 | 重複表單操作描述 |
| 身分 SharedIdentityPage:457 | 勾選立即生效。加入權限群組…點姓名可處理帳號… | 刪 | 過長操作教學與系統原理 |
| 身分 SharedIdentityPage:938 | 勾選立即套用到群組所有成員…每人最多一個群組… | 刪 | 長篇操作教學；權限規則由實際控制與後端保障 |
| ERP ErpItemQueryPage:134 | 起訖都未填：去年同月同日至今天；範圍最多三年。 | 留 | 影響查詢結果的日期規則 |
| ERP ErpItemQueryPage:142 | 結果已達上限，可能有更多資料，請輸入更完整的品名。 | 留 | 截斷警告，影響結果解讀 |
| ERP ErpItemQueryPage:150-155 | 無庫別資料／非批號管理／沒有批號庫存。 | 留 | 空狀態提示 |
| ERP ErpItemQueryPage:162 | 只顯示最新 2,000 筆，請縮小日期範圍。 | 留 | 限制及資料截斷警告 |
| 商品 ItemOperationalPage:659 | 品號必須在 ERP 存在／更改品號會保留歷史品號。 | 留 | 實際輸入規則與安全影響 |
| 客戶 CustomerOperationalPage:916/921 | 尚無電話或聯絡人／尚無地址。 | 留 | 空狀態 |
| 客戶 CustomerOperationalPage:1011/1099/1144 | 沒有符合條件的拜訪／報價／常用商品。 | 留 | 搜尋空狀態 |
| 銷售 SalesOrderOperationalPage:552 | ERP 開單前可以修改；開單後只能更正 ERP 資料。 | 留 | 影響是否能修改的業務限制 |
| 銷售 SalesOrderOperationalPage:585 | 數量與單價最多四位小數。 | 留 | 輸入精度限制 |
| 委外 OutsourcingOperationalPage:571 | 更正出庫會取代舊資料並保留更正紀錄。 | 留 | 重要資料變動警告 |
| 委外 OutsourcingOperationalPage:674 | 目前沒有非零代工庫存。 | 留 | 空狀態 |
| 稽核 AuditOperationalPage:142/155 | 此範圍尚無異動紀錄／此筆未提供欄位差異。 | 留 | 空狀態 |
| 工作日誌 WorkLogOperationalPage:524/549 | 錯誤訊息。 | 留 | 錯誤回饋 |
| 身分 SharedIdentityPage:626 | 這是你的帳號，密碼與 Email 需於我的帳號變更。 | 留 | 避免在管理他人帳號頁更動自己憑證的安全提示 |
| 身分 SharedIdentityPage:657 | 權限由群組決定，不可個別修改。 | 留 | 影響權限編輯結果的限制 |
| 身分 SharedIdentityPage:686 | 停用控制項原因。 | 留 | 不可操作原因 |
| 身分 SharedIdentityPage:1024 | 驗證碼與 Email 次數限制。 | 留 | 安全與輸入限制 |
| 身分 SharedIdentityPage:1030 | 每日 Email 系統上限。 | 留 | 設定數值限制 |

另外複核 `ItemOperationalPage.tsx`、`SalesOrderOperationalPage.tsx`、`DefectOperationalPage.tsx`：既有顯示多屬輸入限制、狀態或業務資料，沒有刪除。仍需掃描未列於本表的全部 `src/` 檔案；此表並非所有候選項目。

### §8 原始碼候選盤點（第 1 組，行號為目前分支）

| 檔案:行號 | 候選 JSX 內容摘要 | 留／刪 | 理由 |
| --- | --- | --- | --- |
| `src/App.tsx:246` | ? <section className="cy-op-panel"><h2>目前無法確認模組權限</h2><p>{moduleAccessError ?? "請重新整理頁面後再試。"}</p></section> | 留 | 空狀態或資料缺失提示 |
| `src/auth/AuthGate.tsx:311` | if (state.status === "checking") return <main className="cy-auth-screen" aria-busy="true"><section className="cy | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/auth/AuthGate.tsx:312` | if (state.status === "unavailable") return <main className="cy-auth-screen"><section className="cy-auth-card cy- | 留 | 安全／限制／結果提示 |
| `src/auth/AuthGate.tsx:317` | <div className="cy-auth-heading"><div className="cy-auth-brand-mark" aria-hidden="true">CY</div><div><h1 id="cy- | 留 | 安全／限制／結果提示 |
| `src/auth/AuthGate.tsx:320` | <label><span>員工編號</span><input data-enter-advance="true" autoComplete="username" inputMode="numeric" maxLength={ | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/auth/AuthGate.tsx:321` | <label><span>密碼</span><input data-enter-advance="true" type="password" autoComplete="current-password" maxLength | 留 | 安全／限制／結果提示 |
| `src/auth/AuthGate.tsx:328` | {state.message ? <p className="cy-auth-error" role="alert">{state.message}</p> : null} | 留 | 安全／限制／結果提示 |
| `src/auth/AuthGate.tsx:334` | <p>{firstLogin?.displayName ? '${firstLogin.displayName} · ${firstLogin.employeeNo ?? employeeNo}' : employeeNo  | 留 | 安全／限制／結果提示 |
| `src/auth/AuthGate.tsx:336` | <p className="cy-auth-note-inline">首次登入密碼已完成一次性驗證。請在驗證時效內設定正式密碼；設定成功後會回到登入頁，並需使用新密碼重新登入。</p> | 留 | 安全／限制／結果提示 |
| `src/auth/AuthGate.tsx:337` | <label><span>正式密碼</span><input type="password" autoComplete="new-password" maxLength={16} value={newPassword} on | 留 | 安全／限制／結果提示 |
| `src/auth/AuthGate.tsx:338` | <label><span>確認正式密碼</span><input type="password" autoComplete="new-password" maxLength={16} value={confirmPasswo | 留 | 安全／限制／結果提示 |
| `src/auth/AuthGate.tsx:339` | {flowMessage ? <p className="cy-auth-error" role="status">{flowMessage}</p> : null} | 留 | 安全／限制／結果提示 |
| `src/auth/AuthGate.tsx:343` | <label><span>員工編號</span><input inputMode="numeric" maxLength={4} value={employeeNo} onChange={(e) => setEmployee | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/auth/AuthGate.tsx:344` | {flowMessage ? <p className="cy-auth-error" role="status">{flowMessage}</p> : null} | 留 | 安全／限制／結果提示 |
| `src/auth/AuthGate.tsx:348` | <div className="cy-auth-flow-title"><h2>重設密碼</h2><p>員工編號 {employeeNo}</p></div> | 留 | 安全／限制／結果提示 |
| `src/auth/AuthGate.tsx:349` | <label><span>6 位數驗證碼</span><input inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target | 留 | 安全／限制／結果提示 |
| `src/auth/AuthGate.tsx:350` | <label><span>新密碼</span><input type="password" autoComplete="new-password" maxLength={16} value={newPassword} onC | 留 | 安全／限制／結果提示 |
| `src/auth/AuthGate.tsx:351` | <label><span>確認新密碼</span><input type="password" autoComplete="new-password" maxLength={16} value={confirmPasswor | 留 | 安全／限制／結果提示 |
| `src/auth/AuthGate.tsx:352` | {flowMessage ? <p className="cy-auth-error" role="status">{flowMessage}</p> : null} | 留 | 安全／限制／結果提示 |
| `src/identity/CyInvoiceRecoveryAdminPanel.tsx:153` | {outstanding ? <p className="cy-identity-subtext">原操作尚未取得明確撤銷結果。請先查詢／撤銷，暫不建立其他操作 ID。</p> : null} | 留 | 安全／限制／結果提示 |
| `src/identity/CyInvoiceRecoveryAdminPanel.tsx:154` | {storageError ? <p role="alert">瀏覽器無法讀寫原操作紀錄，簽發已停用。請保留原 ID；可貼入已自行保存的 ID 查詢。</p> : null} | 留 | 安全／限制／結果提示 |
| `src/identity/SharedIdentityPage.tsx:175` | <h2>{session.user.displayName} <span>{session.user.employeeNo}</span> <span>{permissionLabel(session.user.worksp | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/identity/SharedIdentityPage.tsx:177` | <strong>Email</strong><span>{session.user.emailVerified ? "已驗證" : "待驗證"}</span> | 留 | 安全／限制／結果提示 |
| `src/identity/SharedIdentityPage.tsx:183` | <strong>密碼</strong><span>••••••••</span> | 留 | 安全／限制／結果提示 |
| `src/identity/SharedIdentityPage.tsx:194` | <span className={validLength ? "valid" : ""}>{validLength ? "✓" : "○"} 8～16 字元</span> | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/identity/SharedIdentityPage.tsx:195` | <span className={matching ? "valid" : ""}>{matching ? "✓" : "○"} 兩次輸入相同</span> | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/identity/SharedIdentityPage.tsx:387` | if (employee.workspace_role === "SUPER_ADMIN") return <span className="cy-access-muted">—</span>; | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/identity/SharedIdentityPage.tsx:389` | if (employee.employee_id === session.user.employeeId ／／ !moduleGroups.length) return <span className="cy-access- | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/identity/SharedIdentityPage.tsx:414` | <span className="cy-md-count">{busyAny ? <Loading inline /> : '共 ${rows.length} 位'}</span> | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/identity/SharedIdentityPage.tsx:437` | <span><span className="cy-mono">{employee.employee_no}</span>{employee.identity_admin === 1 ? " · 帳號管理員" : ""}</ | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/identity/SharedIdentityPage.tsx:447` | {saving.has(cell) ? <span className="cy-loading-spinner" role="status" aria-label="儲存中" /> | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/identity/SharedIdentityPage.tsx:471` | if (!editable) return <span>{permissionLabel(employee.workspace_role)}</span>; | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/identity/SharedIdentityPage.tsx:623` | {employee.identity_admin === 1 ? <span>帳號管理員</span> : null} | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/identity/SharedIdentityPage.tsx:626` | {own ? <p className="cy-next-step finished">這是你的帳號；密碼與 Email 請到「我的帳號」變更，自己的權限與使用權由其他管理員設定。</p> | 留 | 安全／限制／結果提示 |
| `src/identity/SharedIdentityPage.tsx:657` | <p className="cy-identity-intro">{group ? '系統與模組使用權由群組「${group.name}」決定，不能個別修改；要調整請到「權限群組」，或改回「個人設定」（保留目前的勾選）。' | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/identity/SharedIdentityPage.tsx:686` | {saving.has('${employee.employee_id}:${column.key}') ? <span className="cy-loading-spinner" aria-hidden="true" / | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/identity/SharedIdentityPage.tsx:900` | <span className="cy-md-count">{savingId !== null ? <Loading inline /> : '共 ${view.groups.length} 個群組'}</span> | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/identity/SharedIdentityPage.tsx:903` | <span><strong>「{group.name}」有 {pending.get(group.id)!.length} 人的系統使用權尚未套用：</strong>{pending.get(group.id)!.map(n | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/identity/SharedIdentityPage.tsx:922` | <span title={names.join("、")}>{names.length ? '${names.length} 位：${names.slice(0, 3).join("、")}${names.length >  | 留 | 空狀態或資料缺失提示 |
| `src/identity/SharedIdentityPage.tsx:997` | {registrationError ? <p className="cy-form-grid-full cy-notice cy-notice-danger" role="alert">{registrationError | 留 | 安全／限制／結果提示 |
| `src/identity/SharedIdentityPage.tsx:1024` | <h3>驗證碼與 Email 安全設定</h3><p className="cy-identity-intro">限制驗證碼重寄與 Email 寄送次數，避免被濫用。每日 Email 不能超過系統上限。</p> | 留 | 安全／限制／結果提示 |
| `src/identity/SharedIdentityPage.tsx:1030` | <label>每日 Email 上限<input className="cy-op-input" type="number" min={1} max={view.systemEmailDailyCeiling} value= | 留 | 安全／限制／結果提示 |
| `src/identity/SharedIdentityPage.tsx:1072` | ? <section className="cy-op-panel"><p className="cy-notice cy-notice-danger" role="alert">{error}</p><button typ | 留 | 安全／限制／結果提示 |
| `src/runtime/modules/AuditOperationalPage.tsx:138` | <span>{time}　{person}　{sentence}</span> | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/AuditOperationalPage.tsx:142` | {!events.length?<p className="cy-customer-muted">此範圍尚無異動紀錄。</p>:null} | 留 | 安全／限制／結果提示 |
| `src/runtime/modules/AuditOperationalPage.tsx:149` | <p className="cy-change-log-summary">{formatDateTime(selected.occurredAt)}　{formatPerson(selected.actor)}　{audit | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/AuditOperationalPage.tsx:150` | {selected.entityType !== "erp_item_query" && selected.statusFrom !== selected.statusTo && (selected.statusFrom ／ | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/AuditOperationalPage.tsx:155` | {selected.entityType !== "erp_item_query" && !auditChanges(selected,lookups).length?<p className="cy-customer-mu | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/BackupOperationalPage.tsx:23` | return <span key={provider} className="cy-backup-copy" data-status={copy?.status ?? "unknown"}> | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/BackupOperationalPage.tsx:43` | {!row.canRetry && !(history.recoveryConfigured && rehearse && row.copies.some(copy => copy.status === "verified" | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/BackupOperationalPage.tsx:46` | <span>{row.triggerKind === "scheduled" ? "排程備份" : row.triggerKind === "pre_restore" ? "還原前安全備份" : "手動備份"} · {lab | 留 | 安全／限制／結果提示 |
| `src/runtime/modules/BackupOperationalPage.tsx:54` | renderCard={row => <>{event(row)}{providerStatus(row)}<div className="cy-backup-card-footer"><span>{row.recordCo | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/BackupOperationalPage.tsx:122` | <div className="cy-op-panel cy-backup-policy"><span><strong>R2</strong> 每日 03:30 · 保留 30 天</span><span><strong>G | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/BackupOperationalPage.tsx:128` | : history ? <><BackupHistoryView history={history} busy={busy} retry={id => void run("retry", id)} rehearse={sel | 留 | 安全／限制／結果提示 |
| `src/runtime/modules/BackupOperationalPage.tsx:129` | : <p>尚未取得備份紀錄，請使用「更新紀錄」。</p>}</section> | 留 | 空狀態或資料缺失提示 |
| `src/runtime/modules/BackupOperationalPage.tsx:135` | <p>將所選備份還原至獨立的空白驗證副本，並核對資料。正式系統繼續使用目前資料。</p> | 留 | 安全／限制／結果提示 |
| `src/runtime/modules/BackupOperationalPage.tsx:136` | <p>驗證前會另建 R2、GCS 安全備份；兩端皆驗證成功才繼續。驗證副本成功使用後會保留，重做須另行準備核准的空白副本。</p> | 留 | 安全／限制／結果提示 |
| `src/runtime/modules/BackupOperationalPage.tsx:137` | <p><strong>{time(selected.createdAt)}</strong> · V{selected.appVersion} · {selected.recordCount.toLocaleString() | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/CustomerOperationalPage.tsx:829` | <span className="cy-customer-result-main"> | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/CustomerOperationalPage.tsx:830` | <span>{customer.customerNo ?? "未設定編號"}</span> | 留 | 空狀態或資料缺失提示 |
| `src/runtime/modules/CustomerOperationalPage.tsx:833` | <span className={'cy-status-chip ${customer.status ? "cy-status-chip-success" : ""}'}>{customer.status?.name ??  | 留 | 空狀態或資料缺失提示 |
| `src/runtime/modules/CustomerOperationalPage.tsx:888` | <h2>{selected.customerNo ? '${selected.customerNo} ' : ""}{selected.shortName}{selected.fullName ? <small classN | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/CustomerOperationalPage.tsx:889` | <p className="cy-record-meta">最後修改：{formatDateTime(selected.updatedAt)}{selected.updatedBy ? ' · ${formatPerson( | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/CustomerOperationalPage.tsx:892` | {selected.status ? <span className="cy-status-chip cy-status-chip-success">{selected.status.name}</span> : null} | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/CustomerOperationalPage.tsx:900` | {selected.notes.map((row) => <p key={row.id}>{row.content}</p>)} | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/CustomerOperationalPage.tsx:914` | {selected.phones.map((row) => <p key={'p${row.id}'} className="cy-customer-line"><span className="cy-mono">{row. | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/CustomerOperationalPage.tsx:915` | {selected.contacts.filter((row) => row.isActive).map((row) => <p key={'c${row.id}'} className="cy-customer-line" | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/CustomerOperationalPage.tsx:916` | {!selected.phones.length && !selected.contacts.some((row) => row.isActive) ? <p className="cy-customer-muted">尚無 | 留 | 空狀態或資料缺失提示 |
| `src/runtime/modules/CustomerOperationalPage.tsx:920` | {selected.addresses.map((row) => <p key={row.id} className="cy-customer-line"><span>{'${row.postalCode ? '${row. | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/CustomerOperationalPage.tsx:921` | {!selected.addresses.length ? <p className="cy-customer-muted">尚無地址</p> : null} | 留 | 空狀態或資料缺失提示 |
| `src/runtime/modules/CustomerOperationalPage.tsx:930` | <span key={row.id} title={row.content ?? ""}>{formatDate(row.visitDate)} · {row.personSnapshot ／／ selected.conta | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/CustomerOperationalPage.tsx:934` | <span key={row.id}>{formatDate(row.quoteDate)} {formatItem(row.itemNoSnapshot, row.itemNameSnapshot)}</span>)} / | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/CustomerOperationalPage.tsx:938` | <span key={row.id}>{row.item ? formatItem(row.item.itemNo, row.item.name) : row.customItemName ／／ "未命名品項"}</span | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/CustomerOperationalPage.tsx:950` | return <section className="cy-form-block"><div className="cy-form-block-head"><div><h3>{title}</h3>{hint ? <p>{h | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/CustomerOperationalPage.tsx:1003` | <p>{visit.content ／／ "—"}</p> | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/CustomerOperationalPage.tsx:1004` | <span>{formatPerson(visit.employee)} · rev.{visit.revision}</span> | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/CustomerOperationalPage.tsx:1011` | {!visible.length ? <p className="cy-customer-muted">沒有符合條件的拜訪紀錄。</p> : null} | 留 | 空狀態或資料缺失提示 |
| `src/runtime/modules/CustomerOperationalPage.tsx:1090` | {quote.priceBreaks.map(tier => <p key={tier.id}> | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/CustomerOperationalPage.tsx:1093` | <span>rev.{quote.revision}</span> | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/CustomerOperationalPage.tsx:1099` | {!groups.size ? <p className="cy-customer-muted">沒有符合條件的報價紀錄。</p> : null} | 留 | 空狀態或資料缺失提示 |
| `src/runtime/modules/CustomerOperationalPage.tsx:1140` | <span>{row.item ? "正式商品" : "未建檔自由文字"}</span></div> | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/CustomerOperationalPage.tsx:1144` | {!visible.length ? <p className="cy-customer-muted">沒有符合條件的常用商品。</p> : null} | 留 | 空狀態或資料缺失提示 |
| `src/runtime/modules/DefectOperationalPage.tsx:411` | {rows.map((row) => <button key={row.id} type="button" className={'cy-op-list-row cy-status-row ${selectedId ===  | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/DefectOperationalPage.tsx:434` | <div><h2>{selected.customerNameSnapshot}</h2><p>瑕疵 #{selected.id} · 回報 {formatDate(selected.reportedDate)}</p></ | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/DefectOperationalPage.tsx:457` | <div><span>回報日期</span><strong>{formatDate(selected.reportedDate)}</strong></div> | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/DefectOperationalPage.tsx:458` | <div><span>負責人</span><strong>{selected.ownerEmployee.displayName ／／ ownerLabel(selected.ownerEmployee.id, select | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/DefectOperationalPage.tsx:459` | <div><span>客戶</span><strong>{selected.customerNoSnapshot ? '${selected.customerNoSnapshot} · ' : ""}{selected.cu | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/DefectOperationalPage.tsx:460` | <div><span>商品</span><strong>{formatItem(selected.itemNoSnapshot, selected.itemNameSnapshot)}</strong></div> | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/DefectOperationalPage.tsx:461` | <div className="wide"><span>瑕疵內容</span><strong>{selected.defectDescription}</strong></div> | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/DefectOperationalPage.tsx:462` | <div className="wide"><span>處理結果</span><strong>{selected.handling ?? "—"}</strong></div> | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/DefectOperationalPage.tsx:463` | {selected.invalidatedAt ? <div className="wide cy-defect-invalid-note"><span>作廢資訊</span><strong>{formatDateTime( | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/ErpAgentCredentialControl.tsx:92` | <span className="cy-status-dot" data-tone={tone} aria-hidden="true" />{label} | 留 | 動態業務資料或操作狀態，不屬多餘說明 |
| `src/runtime/modules/ErpAgentCredentialControl.tsx:97` | <p>只有超級管理員能產生或撤銷憑證。每次產生的原文只顯示一次，請立即複製到公司電腦的安全設定。</p> | 留 | 安全／限制／結果提示 |
| `src/runtime/modules/ErpAgentCredentialControl.tsx:98` | <p>目前憑證：{credential === null ? "讀取中或無法取得" | 留 | 空狀態或資料缺失提示 |
| `src/runtime/modules/ErpAgentCredentialControl.tsx:116` | {error && <p className="cy-notice cy-notice-danger" role="alert">{error}</p>} | 留 | 安全／限制／結果提示 |
| `src/runtime/modules/ErpCustomerQuery.tsx:91` | <p>單據日期起訖都未填：去年同月同日至今天；範圍最多三年。輸入名稱時先列出客戶。</p> | 留 | 安全／限制／結果提示 |
| `src/runtime/modules/ErpCustomerQuery.tsx:99` | {mine.truncated && <p className="cy-notice cy-notice-warning">結果已達 {mine.items.length} 筆，可能有更多資料，請輸入更完整的名稱。</p>} | 留 | 安全／限制／結果提示 |

### §8 原始碼候選盤點（第 2 組，ERP 查詢，行號為目前分支）

| 檔案:行號 | 候選 JSX 內容摘要 | 留／刪 | 理由 |
| --- | --- | --- | --- |
| `src/runtime/modules/ErpItemQueryPage.tsx:134` | <p>起訖都未填：去年同月同日至今天；範圍最多三年。</p> | 留 | 查詢限制、狀態或錯誤訊息 |
| `src/runtime/modules/ErpItemQueryPage.tsx:142` | {mine.truncated && <p className="cy-notice cy-notice-warning">結果已達 {mine.items.length} 筆，可能有更多資料，請輸入更完整的品名。</p>} | 留 | 查詢限制、狀態或錯誤訊息 |
| `src/runtime/modules/ErpItemQueryPage.tsx:150` | {mine.warehouses.length === 0 ? <p>無庫別資料。</p> | 留 | 空狀態／無結果訊息 |
| `src/runtime/modules/ErpItemQueryPage.tsx:154` | {!mine.batchManaged ? <p>非批號管理。</p> | 留 | 業務資料欄位或查詢結果 |
| `src/runtime/modules/ErpItemQueryPage.tsx:155` | : mine.batches.length === 0 ? <p>目前沒有批號庫存。</p> | 留 | 空狀態／無結果訊息 |
| `src/runtime/modules/ErpItemQueryPage.tsx:161` | ? <><p>共 {mine.history.total} 筆異動。</p> | 留 | 業務資料欄位或查詢結果 |
| `src/runtime/modules/ErpItemQueryPage.tsx:162` | {mine.history.truncated && <p className="cy-notice cy-notice-warning">共 {mine.history.total} 筆，只顯示最新 2,000 筆，請縮小 | 留 | 查詢限制、狀態或錯誤訊息 |
| `src/runtime/modules/ErpItemQueryPage.tsx:164` | : <p>此版本 CYERPAutoQuery 不支援歷史異動，請更新。</p>} | 留 | 空狀態／無結果訊息 |
| `src/runtime/modules/ErpJobStatus.tsx:30` | <p>{subject[result.queryType]}：<strong>{describe(result)}</strong>{result.elapsedMs !== null ? '　耗時 ${(result.el | 留 | 業務資料欄位或查詢結果 |
| `src/runtime/modules/ErpJobStatus.tsx:31` | {result.status === "QUEUED" && <p className="cy-erp-waiting"><span className="cy-loading-spinner" aria-hidden="t | 留 | 業務資料欄位或查詢結果 |
| `src/runtime/modules/ErpJobStatus.tsx:32` | {result.status === "RUNNING" && <p className="cy-erp-waiting"><span className="cy-loading-spinner" aria-hidden=" | 留 | 業務資料欄位或查詢結果 |
| `src/runtime/modules/ErpJobStatus.tsx:34` | {result.errorMessage && <p className="cy-notice cy-notice-danger">{result.errorMessage}</p>} | 留 | 查詢限制、狀態或錯誤訊息 |
| `src/runtime/modules/ErpJobStatus.tsx:35` | {result.status === "EXPIRED" && <p>排隊超過兩分鐘，請重新送出查詢。</p>} | 留 | 查詢限制、狀態或錯誤訊息 |
| `src/runtime/modules/ErpJobStatus.tsx:36` | {result.status === "NOT_FOUND" && <p>{notFound[result.queryType]}</p>} | 留 | 業務資料欄位或查詢結果 |
| `src/runtime/modules/ErpJobStatus.tsx:37` | {result.status === "DONE" && result.resultCleared && <p>結果已清除，請重新查詢。</p>} | 留 | 查詢限制、狀態或錯誤訊息 |
| `src/runtime/modules/ErpOrderDialog.tsx:23` | {!result ? job.submitting ? <Loading /> : <p>無法送出查詢，請關閉後再試。</p> : <> | 留 | 空狀態／無結果訊息 |
| `src/runtime/modules/ErpOrderList.tsx:18` | <div className="cy-erp-orders-head" aria-hidden="true">{columns.map(c => <span key={c}>{c}</span>)}</div> | 留 | 業務資料欄位或查詢結果 |
| `src/runtime/modules/ErpPartyOrdersDialog.tsx:44` | <p>單據日期起訖都未填：去年同月同日至今天；範圍最多三年。</p> | 留 | 查詢限制、狀態或錯誤訊息 |
| `src/runtime/modules/ErpPurchaseOrders.tsx:21` | {truncated && <p className="cy-notice cy-notice-warning">共 {total} 張，只顯示最新 {orders.length} 張，請縮小日期範圍。</p>} | 留 | 查詢限制、狀態或錯誤訊息 |
| `src/runtime/modules/ErpPurchaseOrders.tsx:27` | <span>{formatDate(order.date)}</span> | 留 | 業務資料欄位或查詢結果 |
| `src/runtime/modules/ErpPurchaseOrders.tsx:29` | <span>{order.lines.length} 項</span> | 留 | 業務資料欄位或查詢結果 |
| `src/runtime/modules/ErpPurchaseOrders.tsx:30` | <span className="cy-erp-order-extra">{order.supplierOrderNo}</span> | 留 | 業務資料欄位或查詢結果 |
| `src/runtime/modules/ErpPurchaseOrders.tsx:31` | <span className="cy-erp-order-total">{erpMoney(order.total)}</span> | 留 | 業務資料欄位或查詢結果 |
| `src/runtime/modules/ErpPurchaseOrders.tsx:34` | {related.length > 0 && <p className="cy-erp-order-links">{order.kind === "進貨" ? "退貨單：" : "原進貨單："} | 留 | 業務資料欄位或查詢結果 |
| `src/runtime/modules/ErpPurchaseOrders.tsx:41` | : <span key={link.orderNo}>{link.orderNo}（不在查詢範圍）</span>)} | 留 | 查詢限制、狀態或錯誤訊息 |
| `src/runtime/modules/ErpQueryRows.tsx:31` | <span role="status">{start+1}～{Math.min(start+size,rows.length)}／{rows.length} 筆</span> | 留 | 業務資料欄位或查詢結果 |
| `src/runtime/modules/ErpReceivableQuery.tsx:78` | {mine.truncated && <p className="cy-notice cy-notice-warning">共 {mine.total} 張，只顯示 {mine.bills.length} 張。</p>} | 留 | 查詢限制、狀態或錯誤訊息 |
| `src/runtime/modules/ErpReceivableQuery.tsx:82` | <strong>{group.customerCode}</strong><span>{group.customerName}</span> | 留 | 業務資料欄位或查詢結果 |
| `src/runtime/modules/ErpReceivableQuery.tsx:83` | <span>{group.bills.length} 張</span><span className="cy-erp-order-total">{erpMoney(group.unpaid)}</span> | 留 | 業務資料欄位或查詢結果 |
| `src/runtime/modules/ErpReceivableQuery.tsx:90` | cell={(row, column) => column !== 7 ? undefined : <span className="cy-erp-vouchers"> | 留 | 業務資料欄位或查詢結果 |
| `src/runtime/modules/ErpReceivableQuery.tsx:93` | return <span key={v.voucherNo}> | 留 | 業務資料欄位或查詢結果 |
| `src/runtime/modules/ErpReceivableQuery.tsx:101` | <p className="cy-erp-search-hint">金額為 ERP 原幣；未收合計由各結帳單未收帳款相加（{erpMoney(mine.bills.reduce((a, b) => a + erpNumber | 留 | 業務資料欄位或查詢結果 |
| `src/runtime/modules/ErpSalesOrders.tsx:21` | {truncated && <p className="cy-notice cy-notice-warning">共 {total} 張，只顯示最新 {orders.length} 張，請縮小日期範圍。</p>} | 留 | 查詢限制、狀態或錯誤訊息 |
| `src/runtime/modules/ErpSalesOrders.tsx:27` | <span>{formatDate(order.date)}</span> | 留 | 業務資料欄位或查詢結果 |
| `src/runtime/modules/ErpSalesOrders.tsx:29` | <span>{order.lines.length} 項</span> | 留 | 業務資料欄位或查詢結果 |
| `src/runtime/modules/ErpSalesOrders.tsx:30` | <span className="cy-erp-order-extra">{order.salesperson}</span> | 留 | 業務資料欄位或查詢結果 |
| `src/runtime/modules/ErpSalesOrders.tsx:31` | <span className="cy-erp-order-total">{erpMoney(order.total)}</span> | 留 | 業務資料欄位或查詢結果 |
| `src/runtime/modules/ErpSalesOrders.tsx:34` | {related.length > 0 && <p className="cy-erp-order-links">{order.kind === "銷貨" ? "銷退單：" : "原銷貨單："} | 留 | 業務資料欄位或查詢結果 |
| `src/runtime/modules/ErpSalesOrders.tsx:41` | : <span key={link.orderNo}>{link.orderNo}（不在查詢範圍）</span>)} | 留 | 查詢限制、狀態或錯誤訊息 |
| `src/runtime/modules/ErpSupplierQuery.tsx:91` | <p>單據日期起訖都未填：去年同月同日至今天；範圍最多三年。輸入名稱時先列出廠商。</p> | 留 | 查詢限制、狀態或錯誤訊息 |
| `src/runtime/modules/ErpSupplierQuery.tsx:99` | {mine.truncated && <p className="cy-notice cy-notice-warning">結果已達 {mine.items.length} 筆，可能有更多資料，請輸入更完整的名稱。</p>} | 留 | 查詢限制、狀態或錯誤訊息 |

### §8 原始碼候選盤點（第 3 組，業務模組，行號為目前分支）

| 檔案:行號 | 候選 JSX 內容摘要 | 留／刪 | 理由 |
| --- | --- | --- | --- |
| `src/runtime/modules/ItemOperationalPage.tsx:571` | <span>{formatDate(row.reportedDate)}　{row.customerNameSnapshot}　{row.defectDescription}</span> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/ItemOperationalPage.tsx:641` | <span className="cy-mono">{row.itemNo}</span> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/ItemOperationalPage.tsx:643` | {row.isActive ? <small>{categoryName(row)}</small> : <StatusChip>已停用</StatusChip>} | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/ItemOperationalPage.tsx:659` | <p>{creating ? "品號必須是 SMART ERP 中已存在的品號。" : "品號請用「更改品號」修改，會保留歷史品號。"}</p> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/ItemOperationalPage.tsx:679` | <span>{draft.baseUnit}</span> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/ItemOperationalPage.tsx:702` | <p>{[selected.spec, selected.category?.name, selected.isActive ? "使用中" : null].filter(Boolean).join("　")} | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/ItemOperationalPage.tsx:718` | {baseConversions(selected).map((row, index) => <span key={index}>　·　1 {row.fromUnit} = {row.quantity} {selected. | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/ItemOperationalPage.tsx:722` | <span>　門市價 {selected.storePrice ? '${selected.storePrice}' : "—"}</span> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/ItemOperationalPage.tsx:723` | <span>　診所價 {selected.clinicPrice ? '${selected.clinicPrice}' : "—"}</span> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/ItemOperationalPage.tsx:726` | {previousNumbers.length ? <small>曾用品號：{previousNumbers.map(row => | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/ItemOperationalPage.tsx:732` | summary={<small>{(["created", "processing", "resolved"] as const).filter(code => defectCounts[code]) | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/ItemOperationalPage.tsx:737` | <span>{formatDate(row.reportedDate)}　{row.customerNameSnapshot}　{row.defectDescription}</span> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/ItemOperationalPage.tsx:746` | rows={(quoteSummary?.groups ?? []).slice(0, 3).map((group, index) => <span key={index}> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/ItemOperationalPage.tsx:761` | return <div className="cy-item-info"><span>{label}</span><strong>{value ／／ "—"}</strong></div>; | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/ModuleSettingsPanel.tsx:98` | <h2>每日平均分數</h2><p>已審核日誌的結果保留，不因設定變更重新計分。</p><div className="cy-op-grid-two"><label>目標<input className="cy-op-inp | 留 | 限制／安全提醒／結果狀態 |
| `src/runtime/modules/ModuleSettingsPanel.tsx:103` | <section className="cy-op-panel"><div className="cy-op-panel-header"><h2>{sections.find(row => row.key === secti | 留 | 空狀態提示 |
| `src/runtime/modules/ModuleSettingsPanel.tsx:121` | <span aria-hidden="true">⚙️</span> 設定 | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/OutsourcingMasterData.tsx:194` | <strong>{row.displayName}</strong><span>{row.phone ?? "—"}{row.isActive ? "" : " · 停用"}</span></button>)} | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/OutsourcingMasterData.tsx:216` | {draft.contacts.length === 0 ? <p className="cy-form-block-empty">尚未填寫。</p> : draft.contacts.map((row, index) => | 留 | 空狀態提示 |
| `src/runtime/modules/OutsourcingMasterData.tsx:226` | <div className="cy-record-header"><div><h2>{detail.displayName}</h2><p>{[detail.legalName, detail.entityType === | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/OutsourcingMasterData.tsx:230` | <div><span>統編</span><strong>{detail.taxId ?? "—"}</strong></div> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/OutsourcingMasterData.tsx:231` | <div><span>電話</span><strong>{detail.phone ?? "—"}</strong></div> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/OutsourcingMasterData.tsx:232` | <div><span>地址</span><strong>{detail.address ?? "—"}</strong></div> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/OutsourcingMasterData.tsx:233` | {detail.contacts.some((row) => row.isActive) ? <div className="wide"><span>聯絡人</span><strong>{detail.contacts.fi | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/OutsourcingMasterData.tsx:234` | {detail.note ? <div className="wide"><span>備註</span><strong>{detail.note}</strong></div> : null} | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/OutsourcingMasterData.tsx:241` | : <p className="cy-out-hint">尚未設定現行單價。計價時會依這裡的單價計算。</p>} | 留 | 限制／安全提醒／結果狀態 |
| `src/runtime/modules/OutsourcingMasterData.tsx:335` | <strong>{row.finishedItemName}</strong><span><span className="cy-mono">{row.recipeRef}</span> · {row.finishedIte | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/OutsourcingMasterData.tsx:341` | <div className="cy-record-header cy-edit-header"><div><h2>{creating ? "新增 BOM" : '修改 ${detail?.recipeRef ?? "BOM | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/OutsourcingMasterData.tsx:357` | <EntityPicker<OutsourcingItemOption> label={<span className="cy-visually-hidden">第 {index + 1} 項料件</span>} disab | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/OutsourcingMasterData.tsx:368` | <div className="cy-record-header"><div><h2>{detail.finishedItemName}</h2><p><span className="cy-mono">{detail.re | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/OutsourcingMasterData.tsx:371` | <div className="cy-op-detail-grid"><div><span>產出</span><strong>{detail.outputQuantity} {detail.outputUnit}</stro | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/OutsourcingOperationalPage.tsx:87` | if (status === "voided") return <p className="cy-progress-voided">此代工單已作廢。</p>; | 留 | 限制／安全提醒／結果狀態 |
| `src/runtime/modules/OutsourcingOperationalPage.tsx:560` | {orders.map((row) => <button key={row.id} type="button" className={'cy-op-list-row cy-status-row ${selectedOrder | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/OutsourcingOperationalPage.tsx:571` | <div><h2>{creating ? "新增代工單" : correctingOutbound ? "更正已確認的出庫" : "修改代工單"}</h2><p>{correctingOutbound ? "儲存後會以新的出 | 留 | 限制／安全提醒／結果狀態 |
| `src/runtime/modules/OutsourcingOperationalPage.tsx:587` | <div className="cy-out-part cy-out-part-head" aria-hidden="true"><span>料件</span><span>數量</span><span>單位</span><s | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/OutsourcingOperationalPage.tsx:613` | <div className="cy-record-header"><div><h2>{selectedOrder.contractorNameSnapshot}</h2><p><span className="cy-mon | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/OutsourcingOperationalPage.tsx:637` | <div className="cy-op-detail-grid"><div><span>工單日期</span><strong>{formatDate(selectedOrder.orderDate)}</strong>< | 留 | 限制／安全提醒／結果狀態 |
| `src/runtime/modules/OutsourcingOperationalPage.tsx:674` | {stockRows.length === 0 ? <p>目前沒有非零代工庫存。</p> : null} | 留 | 空狀態提示 |
| `src/runtime/modules/ProgramCatalogPage.tsx:23` | return program.publishedAt ? <time dateTime={program.publishedAt}>{date(program.publishedAt)}</time> : <span>—</ | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/ProgramCatalogPage.tsx:32` | <div><strong>{program.name}</strong><span>{program.platform === "web" ? "網頁版" : "Windows 10／11 · x64"}</span></d | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/ProgramCatalogPage.tsx:36` | if (action.kind === "pending") return <span>正式發版後提供下載</span>; | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/ProgramCatalogPage.tsx:37` | if (action.kind === "unavailable") return <span>尚無可下載檔案</span>; | 留 | 空狀態提示 |
| `src/runtime/modules/ProgramCatalogPage.tsx:51` | { key: "description", header: "功能簡介", render: program => <p className="cy-program-description">{program.descript | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/ProgramCatalogPage.tsx:54` | <span>發版日 {published(program)}</span></div> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/ProgramCatalogPage.tsx:55` | <p className="cy-program-description">{program.description}</p>{links(program)}</>} | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/ProgramCatalogPage.tsx:99` | {!loading && !catalog ? <p role="status">目前無法讀取程式清單，請稍後重新開啟此頁。</p> : null} | 留 | 空狀態提示 |
| `src/runtime/modules/SalesOrderOperationalPage.tsx:87` | if (status === "voided") return <p className="cy-progress-voided">此工單已作廢。</p>; | 留 | 限制／安全提醒／結果狀態 |
| `src/runtime/modules/SalesOrderOperationalPage.tsx:537` | <span><span className="cy-mono">{row.erpNo ? 'ERP ${row.erpNo}' : row.workOrderRef}</span> · {formatDate(row.ord | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/SalesOrderOperationalPage.tsx:552` | <div><h2>{creating ? "新增銷售工單" : '修改 ${selected?.workOrderRef ?? "工單"}'}</h2><p>ERP 開單前可以修改；開單後只能更正 ERP 資料。</p></ | 留 | 限制／安全提醒／結果狀態 |
| `src/runtime/modules/SalesOrderOperationalPage.tsx:585` | <div className="cy-form-block-head"><div><h3>工單明細</h3><p>數量與單價最多四位小數。</p></div><button type="button" className=" | 留 | 限制／安全提醒／結果狀態 |
| `src/runtime/modules/SalesOrderOperationalPage.tsx:587` | <div className="cy-order-line cy-order-line-head" aria-hidden="true"><span>商品</span><span>數量</span><span>單位</spa | 留 | 限制／安全提醒／結果狀態 |
| `src/runtime/modules/SalesOrderOperationalPage.tsx:593` | <EntityPicker<LineItemOption> label={<span className="cy-visually-hidden">第 {index + 1} 列商品</span>} disabled={bu | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/SalesOrderOperationalPage.tsx:616` | <div><h2>{selected.customerNameSnapshot}</h2><p><span className="cy-mono">{selected.workOrderRef}</span>{selecte | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/SalesOrderOperationalPage.tsx:637` | <div><span>ERP 單號</span><strong>{selected.erpNo ?? "尚未回填"}</strong></div> | 留 | 空狀態提示 |
| `src/runtime/modules/SalesOrderOperationalPage.tsx:638` | <div><span>客戶編號</span><strong>{selected.customerNoSnapshot ?? "—"}</strong></div> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/SalesOrderOperationalPage.tsx:639` | <div><span>日期</span><strong>{formatDate(selected.orderDate)}</strong></div> | 留 | 限制／安全提醒／結果狀態 |
| `src/runtime/modules/SalesOrderOperationalPage.tsx:640` | <div><span>操作人員</span><strong>{selected.operator.displayName ?? selected.operator.employeeNo ?? '員工 #${selected. | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/SalesOrderOperationalPage.tsx:641` | <div><span>發票</span><strong>{selected.invoiceTypeCode ? invoiceText[selected.invoiceTypeCode] ?? selected.invoic | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/SalesOrderOperationalPage.tsx:642` | <div><span>收據</span><strong>{selected.receiptOptionCode ? receiptText[selected.receiptOptionCode] ?? selected.re | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/SalesOrderOperationalPage.tsx:643` | <div className="wide"><span>備註</span><strong>{selected.note ?? "—"}</strong></div> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/WorkLogOperationalPage.tsx:523` | <p>{reviewDraft.record.workLogRef}</p> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/WorkLogOperationalPage.tsx:524` | {message ? <p role="alert" className="cy-auth-error">{message}</p> : null} | 留 | 限制／安全提醒／結果狀態 |
| `src/runtime/modules/WorkLogOperationalPage.tsx:532` | <h3>工作項目 {index + 1}</h3><p>{entry.content}</p> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/WorkLogOperationalPage.tsx:548` | <p>{reasonDraft.record.workLogRef}</p> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/WorkLogOperationalPage.tsx:549` | {message ? <p role="alert" className="cy-auth-error">{message}</p> : null} | 留 | 限制／安全提醒／結果狀態 |
| `src/runtime/modules/WorkLogOperationalPage.tsx:558` | <div><span>已審核筆數</span><strong>{statistics?.reviewedCount ?? "—"}</strong></div> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/WorkLogOperationalPage.tsx:559` | <div><span>工作日數</span><strong>{statistics?.totalWorkDays ?? "—"}</strong></div> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/WorkLogOperationalPage.tsx:560` | <div><span>總分</span><strong>{statistics?.totalFinalScore ?? "—"}</strong></div> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/WorkLogOperationalPage.tsx:561` | <div><span>加權平均日分</span><strong>{statistics?.weightedAverageDailyScore ?? "—"}</strong> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/WorkLogOperationalPage.tsx:562` | <small>目標 {configuration?.scoringConfig?.targetAverageDailyScore ?? "—"} · 最低 {configuration?.scoringConfig?.min | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/WorkLogOperationalPage.tsx:567` | <span className="cy-op-chip" key={row.id}> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/WorkLogOperationalPage.tsx:587` | {rows.map((row) => <button key={row.id} type="button" className={'cy-op-list-row cy-status-row ${selectedId ===  | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/WorkLogOperationalPage.tsx:627` | <div className="cy-worklog-categories-head"><span>計分分類</span><button type="button" className="cy-op-button compa | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/WorkLogOperationalPage.tsx:647` | <div className="cy-record-header"><div><h2>{formatDate(selected.logDate)} 工作日誌</h2><p><span className="cy-mono"> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/WorkLogOperationalPage.tsx:663` | <div><span>日誌日期</span><strong>{formatDate(selected.logDate)}</strong></div> | 留 | 限制／安全提醒／結果狀態 |
| `src/runtime/modules/WorkLogOperationalPage.tsx:664` | <div><span>期間</span><strong>{formatDate(selected.dateFrom)} ～ {formatDate(selected.dateTo)}</strong></div> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/WorkLogOperationalPage.tsx:665` | <div><span>工作日數</span><strong>{selected.workDays}</strong></div> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/WorkLogOperationalPage.tsx:666` | <div><span>類型</span><strong>{selected.typeCode}</strong></div> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/WorkLogOperationalPage.tsx:667` | <div><span>總分</span><strong>{selected.finalScore ?? "—"}</strong></div> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/WorkLogOperationalPage.tsx:668` | <div><span>平均日分</span><strong>{selected.averageDailyScore ?? "—"}</strong></div> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/WorkLogOperationalPage.tsx:669` | <div className="wide"><span>審核備註</span><strong>{selected.reviewRemark ?? "—"}</strong></div> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/WorkLogOperationalPage.tsx:675` | <p>{entry.content ?? "—"}</p> | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/WorkLogOperationalPage.tsx:676` | <div className="cy-op-chip-list">{entry.categories.map((category) => <span className="cy-op-chip" key={category. | 留 | 動態業務資料或表單欄位 |
| `src/runtime/modules/customer/QuoteCreateForm.tsx:91` | {error ? <p role="alert" className="cy-notice cy-notice-error">{error}</p> : null} | 留 | 限制／安全提醒／結果狀態 |
| `src/runtime/modules/defect/DefectForm.tsx:81` | <p>已建檔與處理中的瑕疵可以修改；已處理的需先重新開啟。</p></div> | 留 | 限制／安全提醒／結果狀態 |
| `src/runtime/modules/defect/DefectForm.tsx:112` | {error ? <p className="cy-notice cy-notice-error" role="alert">{error}</p> : null} | 留 | 限制／安全提醒／結果狀態 |

### §8 原始碼候選盤點（第 4 組：共用元件 A）

| 檔案:行號 | 候選 JSX 內容摘要 | 留／刪 | 理由 |
| --- | --- | --- | --- |
| `src/ui/actions/IconButton.tsx:12` | <span aria-hidden="true">{icon}</span> | 留 | UI 狀態、結果訊息或動態資料 |
| `src/ui/data/DataPagination.tsx:23` | {label ? <span className="cy-data-pagination-label">{label}</span> : null} | 留 | UI 狀態、結果訊息或動態資料 |
| `src/ui/data/DataView.tsx:59` | <span className="cy-visually-hidden">資料讀取中</span> | 留 | UI 狀態、結果訊息或動態資料 |
| `src/ui/data/DataViewToolbar.tsx:26` | <span className="cy-visually-hidden">{searchLabel}</span> | 留 | UI 狀態、結果訊息或動態資料 |
| `src/ui/data/StatusFilter.tsx:17` | const count = (value: number ／ null ／ undefined) => counts ? <span className="cy-status-filter-count">{value ??  | 留 | UI 狀態、結果訊息或動態資料 |
| `src/ui/feedback/FeedbackProvider.tsx:42` | <p className="cy-feedback-message" role="alert">{alert.message}</p> | 留 | UI 狀態、結果訊息或動態資料 |
| `src/ui/feedback/Loading.tsx:7` | <span className="cy-loading-spinner" aria-hidden="true" /> | 留 | UI 狀態、結果訊息或動態資料 |
| `src/ui/feedback/NextStep.tsx:6` | return <p className={finished ? "cy-next-step finished" : "cy-next-step"}>{finished ? null : <strong>下一步</strong | 留 | UI 狀態、結果訊息或動態資料 |
| `src/ui/forms/PasswordInput.tsx:7` | return <span className="cy-password-input"> | 留 | UI 狀態、結果訊息或動態資料 |
| `src/ui/foundation/ThemeToggle.tsx:78` | {iconOnly ? null : <span>{options[index].label}</span>} | 留 | UI 狀態、結果訊息或動態資料 |
| `src/ui/layout/MasterDetail.tsx:28` | return <div className="cy-md-empty"><div><strong>{title}</strong>{hint ? <p>{hint}</p> : null}</div></div>; | 留 | UI 狀態、結果訊息或動態資料 |

### §8 原始碼候選盤點（第 5 組：共用元件 B）

| 檔案:行號 | 候選 JSX 內容摘要 | 留／刪 | 理由 |
| --- | --- | --- | --- |
| `src/ui/primitives/FieldFrame.tsx:25` | {required ? <span className="cy-field-required" aria-hidden="true"> *</span> : null} | 留 | UI 狀態、結果訊息或動態資料；頁面標題描述按 §2 保留 |
| `src/ui/primitives/Section.tsx:23` | {description ? <p className="cy-section-description">{description}</p> : null} | 留 | UI 狀態、結果訊息或動態資料；頁面標題描述按 §2 保留 |
| `src/ui/primitives/StatusChip.tsx:16` | <span className={["cy-status-chip", 'cy-status-chip-${tone}', className].filter(Boolean).join(" ")}> | 留 | UI 狀態、結果訊息或動態資料；頁面標題描述按 §2 保留 |
| `src/ui/records/RelatedCard.tsx:10` | <h3>{title} <span className="cy-customer-card-count">{count}</span></h3> | 留 | UI 狀態、結果訊息或動態資料；頁面標題描述按 §2 保留 |
| `src/ui/records/RelatedCard.tsx:16` | : <p className="cy-customer-muted">{empty}</p>} | 留 | UI 狀態、結果訊息或動態資料；頁面標題描述按 §2 保留 |
| `src/ui/related/RelatedRecordPanel.tsx:42` | {tab.badge != null ? <span className="cy-related-panel-badge">{tab.badge}</span> : null} | 留 | UI 狀態、結果訊息或動態資料；頁面標題描述按 §2 保留 |
| `src/ui/shell/AccountMenu.tsx:36` | <span className="cy-account-avatar" aria-hidden="true">{initial}</span> | 留 | UI 狀態、結果訊息或動態資料；頁面標題描述按 §2 保留 |
| `src/ui/shell/AccountMenu.tsx:37` | {compact ? null : <span className="cy-account-name"><strong>{displayName}</strong><span className="cy-account-ro | 留 | UI 狀態、結果訊息或動態資料；頁面標題描述按 §2 保留 |
| `src/ui/shell/AppShell.tsx:61` | <div className="cy-shell-brand"><span className="cy-shell-brand-mark" aria-hidden="true">CY</span> | 留 | UI 狀態、結果訊息或動態資料；頁面標題描述按 §2 保留 |
| `src/ui/shell/AppShell.tsx:81` | }}><NavIcon name={item.key} /><span>{item.label}</span>{item.external ? <svg width="13" height="13" viewBox="0 0 | 留 | UI 狀態、結果訊息或動態資料；頁面標題描述按 §2 保留 |
| `src/ui/shell/AppShell.tsx:104` | {!compact && pageDescription ? <p className="cy-shell-topbar-description">{pageDescription}</p> : null} | 留 | UI 狀態、結果訊息或動態資料；頁面標題描述按 §2 保留 |

## 9. 審查紀錄（審查者填）

- 日期：2026-10-19　結論：**通過**（審查者直接修正下列小問題後合併）。
- 審查者在本機執行：`npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local` 全部通過；`node --test scripts/*.test.mjs` 144/144 通過。
- 實際畫面（桌面 1440、手機 390，深色，模擬 API）：我的帳號卡片、變更密碼視窗（顯示／隱藏、即時檢查、未符合時按鈕停用）、變更 Email 兩步驟與 60 秒倒數。
- 說明文字對照表逐條核對，刪除項大致符合 §2-1。
- 審查者直接修正：
  1. ERP 銷貨／進貨單據視窗查詢前的「選擇單據日期後按『查詢』。」是空狀態提示（§2-1 應保留），刪掉後視窗查詢前是一片空白；已恢復。
  2. 手機寬度下「變更」按鈕被排到值的下一行；改為與值同一行。
  3. 刪除說明後留下的空白行（9 個檔案）一併清掉。
- 版本號：PR #218（ERP 銷貨銷退／進貨退貨清單）已先以 0.9.18 合併，本單改為 **0.9.19**；原 WO-0.9.19（人事第一期）更名為 WO-0.9.20。
- 意見（不阻擋）：取得不到目前 Email 地址，帳號頁只顯示驗證狀態，符合 §2-2。

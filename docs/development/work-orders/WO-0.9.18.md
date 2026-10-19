# WO-0.9.18 移除多餘說明文字、我的帳號改版

- 狀態：待執行
- 分支：`cyweb/account-hints`（建議）　PR：（執行者填）
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

**執行狀態：部分實作，尚未達工作單全部驗收；PR #220 維持 Draft，禁止合併或部署。**

- 驗收清單逐項結果：
  1. 全站說明文字逐項對照：**部分完成**，已檢查十個主要 TSX 頁面並列出部分逐項決議，仍缺少完整 `src/` 逐檔候選清單與逐條人工裁決；不能宣稱全站完成。
  2. 我的帳號單一卡片：**已提交**。顯示姓名、員工編號、角色、Email 驗證狀態及遮蔽密碼。現有 `AuthUser` 未提供 Email 地址，依工作單僅顯示驗證狀態；刪除 CYID 技術說明及重複介紹。
  3. 變更密碼 Dialog：**已提交，未執行互動測試**。目前／新／確認密碼使用共用 `PasswordInput`，提供 👁 顯示切換、8～16 字元與一致性即時標示，條件不符時無法提交，沿用 `changeOwnPassword` 與重新登入提示。
  4. 變更 Email Dialog：**已提交，未執行互動測試**。沿用現有 API，分為輸入與驗證兩步，設 60 秒倒數、返回及重新寄送。
  5. 待驗證 Email：**已接入原 `startCurrentEmailVerification`，並加入失敗後可重試狀態；未做實機驗證**。
  6. 手機 390px：**已有響應式樣式，未在真實畫面驗證**。
  7. `npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local`：**未執行，不能宣稱通過**。
  8. `node --test scripts/*.test.mjs`：**未執行**；canonical cyapps clone 未成功。
  9. 工作單範圍與 workflow：GitHub Compare 目前顯示 10 個範圍內檔案（新增 `PasswordInput`、身份頁、客戶、ERP、委外、工作日誌、TODO、視覺規範及本工作單），**無 `.github/workflows/*` 變更**。
  10. `VERSION`／`package.json`：目前 `main` 已是 `0.9.18`，未重複修改；TODO 與視覺規範已更新，`BUILD` 未動。
- 與工作單不同之處與原因：因無法取得完整儲存庫 checkout，全站文字掃描及必要測試未能執行。依 §2-2，AuthUser 沒有目前 Email，故只顯示驗證狀態，未更動後端。
- 驗證指令輸出摘要：
  - `git clone --depth 1 --branch cyweb/account-hints-wo-0.9.18 https://github.com/simonliu1118-byte/chihyuan-web.git`：失敗，`Could not resolve host: github.com`。
  - GitHub Compare `main...cyweb/account-hints-wo-0.9.18`：10 個變更檔案，無 workflow，無範圍外檔案。
  - `npm run typecheck`／`npm run validate:source`／`npm run build`／`npm run validate:d1:local`／`node --test scripts/*.test.mjs`：未執行，無輸出。
- 操作驗證步驟：以已驗證帳號開啟我的帳號，檢查卡片、密碼三欄切換與即時驗證；執行密碼變更後驗證重新登入；以已驗證 Email 執行 Email 變更、輸入六位碼、確認返回與 60 秒冷卻；以待驗證帳號測試寄送驗證碼；於 390px 檢查視窗、按鈕，最後執行 §6 全部測試。
- 說明文字對照表（**僅已核對項目，非全站完整表**）：

  | 檔案／位置 | 原文 | 留／刪 | 理由 |
  | --- | --- | --- | --- |
  | `src/identity/SharedIdentityPage.tsx`，原 SelfServicePanel 頂部 | 員工編號、姓名、角色與「密碼與驗證碼由 CYID 帳號服務保管，CY Web 不會保存。」 | 刪 | 重複自我介紹及不必要的系統實作說明；必要身分資訊改放單一卡片標題 |
  | 同檔，原 Email 待重新驗證提醒 | 「帳號已啟用，原密碼仍有效…」操作及系統解說 | 刪／改 | 保留「待驗證」狀態與寄送驗證碼操作，移除長篇運作說明 |
  | 同檔，原 UserWorkspace 附註 | 「系統與模組使用權由帳號管理員或超級管理員設定；你可以管理一般使用者的帳號，點姓名開啟。」 | 刪 | 重複權限原理及點擊教學 |
  | 帳號 Dialog | 「8～16 字元」、「兩次輸入相同」 | 留 | 直接影響密碼有效性的規則 |
  | 帳號 Dialog | 驗證碼已寄出／操作錯誤與結果 | 留 | 操作回饋與安全驗證資訊 |
  | `src/identity/SharedIdentityPage.tsx`，原建立使用者提示（原約 644 行） | 新同事可以直接套用同職位同事的系統與模組使用權。 | 刪 | 可從複製使用權操作理解，無須重複提示 |
  | 同檔，原使用權編輯提示（原約 703 行） | 模組使用權與權限（管理員／一般使用者）各自獨立，改權限不會改這裡。 | 刪 | 靜態原理介紹；實際權限邊界仍由後端維持 |
  | 同檔，原已登記系統副標（原約 985 行） | 員工能使用的志遠系統。CY Web 是固定啟用的核心入口。 | 刪 | 重複標題及系統原理 |

**未完成之全站掃描需於 PR 正式交審前補齊；本報告不得視為全部驗收通過。**



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

仍需掃描未列於本表的全部 `src/` 檔案；此表並非所有候選項目。

## 9. 審查紀錄（審查者填）

- （待審查）

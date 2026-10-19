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
  1. 全站說明文字逐項對照：**未完成**，缺少完整 `src/` 逐檔候選清單與逐條人工裁決；不能宣稱全站完成。
  2. 我的帳號單一卡片：**已提交**。顯示姓名、員工編號、角色、Email 驗證狀態及遮蔽密碼。現有 `AuthUser` 未提供 Email 地址，依工作單僅顯示驗證狀態；刪除 CYID 技術說明及重複介紹。
  3. 變更密碼 Dialog：**已提交，未執行互動測試**。目前／新／確認密碼使用共用 `PasswordInput`，提供 👁 顯示切換、8～16 字元與一致性即時標示，條件不符時無法提交，沿用 `changeOwnPassword` 與重新登入提示。
  4. 變更 Email Dialog：**已提交，未執行互動測試**。沿用現有 API，分為輸入與驗證兩步，設 60 秒倒數、返回及重新寄送。
  5. 待驗證 Email：**已接入原 `startCurrentEmailVerification`，未做實機驗證**。
  6. 手機 390px：**已有響應式樣式，未在真實畫面驗證**。
  7. `npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local`：**未執行，不能宣稱通過**。
  8. `node --test scripts/*.test.mjs`：**未執行**；canonical cyapps clone 未成功。
  9. 工作單範圍與 workflow：以 GitHub Compare 核對只有 `TODO.md`、`CY_WEB_VISUAL_GUIDE.md`、本工作單、`SharedIdentityPage.tsx`、`identity.css`、新 `PasswordInput.tsx`；**無 `.github/workflows/*` 變更**。
  10. `VERSION`／`package.json`：目前 `main` 已是 `0.9.18`，未重複修改；TODO 與視覺規範已更新，`BUILD` 未動。
- 與工作單不同之處與原因：因無法取得完整儲存庫 checkout，全站文字掃描及必要測試未能執行。依 §2-2，AuthUser 沒有目前 Email，故只顯示驗證狀態，未更動後端。
- 驗證指令輸出摘要：
  - `git clone --depth 1 --branch cyweb/account-hints-wo-0.9.18 https://github.com/simonliu1118-byte/chihyuan-web.git`：失敗，`Could not resolve host: github.com`。
  - GitHub Compare `main...cyweb/account-hints-wo-0.9.18`：6 個變更檔案，無 workflow，無範圍外檔案。
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

**未完成之全站掃描需於 PR 正式交審前補齊；本報告不得視為全部驗收通過。**

## 9. 審查紀錄（審查者填）

- （待審查）

# WO-0.9.16 介面細修：設定與修改紀錄按鈕、異動紀錄可讀性與密度、選單與用詞

- 狀態：待執行（**WO-0.9.15 合併後**才從最新 `main` 開分支；兩單都會改 VERSION／TODO）
- 分支：`cyweb/ui-polish`（建議）　PR：（執行者填）
- 依據：`PROJECT_RULES.md` §9；BD-053／054（稽核）
- 視覺規範：`docs/architecture/CY_WEB_VISUAL_GUIDE.md`

## 0. 執行限制（必讀）

- **不得新增或修改 `.github/workflows/*`**，不得新增工作單未列出的檔案（示意圖、mock HTML、SVG、另外的測試 runner 等）。截圖由審查者以實際畫面擷取，執行者只需在完成報告說明怎麼操作驗證。
- 不合併、不部署。

## 1. 背景（使用者原話）

- 「上方設定按鈕的那個齒輪很醜，看是不是能改用 emoji」
- 「修改旁邊修改紀錄的按鈕大小和修改不一致，然後修改紀錄看是不是直接改用一個 emoji 代替做成圖示按鈕」
- 「異動紀錄裡面還是有亂碼或不懂在幹嘛的行為」（截圖：「送出 ERP 查詢「AC0016」：狀態」「完成 ERP 查詢「ERP 查詢 #d6411034-…」：狀態」「ERP 查詢失敗「PURCHASES」：狀態」）
- 「異動紀錄的清單可以大幅增加密度」
- 「左邊目錄，委外改成 委外/代工」「志遠記帳程式 web 版剛好多一個字變折行看怎麼處理」→ 短名稱「志遠記帳 Web」（使用者同意）。
- 「代工對象有點微妙，這個字義很像是我們幫別人代工」→ 改為「**協力廠商**」（使用者同意）。
- 「ERP 查詢從業務模組裡面移出來，放到目錄的最上面」
- ERP 查詢事件：預設隱藏，超級管理員可勾選顯示（使用者同意）。

## 2. 已定案事項（不得更改）

1. **設定按鈕**：`ModuleSettingsButton` 的線條齒輪 SVG 換成 emoji，按鈕文字為「⚙️ 設定」（emoji 加 `aria-hidden`，可及名稱仍為「設定」）。
2. **修改紀錄按鈕**：所有出現「修改紀錄」按鈕的明細（目前為客戶頁；之後各模組沿用）改為**圖示按鈕**：只顯示「🕘」，`title` 與 `aria-label` 為「修改紀錄」，**高度、外框、字級與旁邊「修改」按鈕相同**（同一個 `cy-op-button` 尺寸，寬度等於高度）。做成共用元件 `src/ui/actions/IconButton.tsx`（props：`icon`、`label`、`onClick`、`disabled?`），客戶頁改用它。
3. **異動紀錄不顯示 ERP 查詢事件（預設）**：
   - `entity_type = 'erp_item_query'` 的事件（送出、完成、失敗、逾時）預設不出現在「異動紀錄」頁與客戶頁的「修改紀錄」。
   - 異動紀錄頁上方篩選列加一個勾選「顯示 ERP 查詢」，**只有超級管理員看得到**；勾選後才顯示。
   - 顯示時：**不顯示「送出」**（只顯示完成／失敗／逾時各一行），句子為 `查詢 ERP〔類別〕「查詢內容」：成功／失敗／逾時`，例如 `查詢 ERP 客戶「AC0016」：成功`、`查詢 ERP 進貨「B0009」：失敗`；不得出現 UUID、「ERP 查詢 #…」、英文代碼（如 `PURCHASES`）或「：狀態」。
   - `erp_item_agent.*`（連線密鑰更新／撤銷）是管理動作，維持顯示。
4. **全部事件可讀性掃描**：句子中不得出現 UUID、英文代碼、`#數字` 形式的內部編號、或只是欄位名的變更清單（例如只有「狀態」卻看不出改成什麼）。找不到人看得懂的名稱時，用「類別＋業務編號」（如「銷售工單 SO-0012」），真的沒有業務編號時只寫類別（如「備份」），不寫內部 ID。
5. **異動紀錄清單密度**：每筆一行、列高約 30px（上下 padding 4px，字級維持 14px），格式 `HH:mm　姓名　句子`（日期已在分組標題，列內只顯示時間）；過長時單行截斷加「…」，完整內容在點開的明細看。客戶頁「修改紀錄」對話框用同一個清單元件，一起變密。
6. **左側選單**：
   - 「ERP 查詢」移到選單最上方，在「業務模組」分組之前，單獨一項、不加分組標題；權限規則不變（沒有任何 ERP 查詢權限就不顯示）。
   - 「委外」改為「委外/代工」（選單、頁面標題、權限群組與模組權限中的模組名稱一致）。
   - 外部工具「志遠記帳系統 Web 版」在選單顯示短名稱「**志遠記帳 Web**」；CY 程式頁等其他地方仍顯示正式名稱。
   - **登入後預設頁**：網址沒有指定頁面時，有任何 ERP 查詢權限的人進入「ERP 查詢」；沒有 ERP 權限的人進入「業務模組」中第一個有權限的模組（使用者 2026-10-19：「有 ERP 權限的人登入後先看到 ERP 查詢」）。
7. **「代工對象」全部改為「協力廠商」**（畫面文字、欄位標籤、提示與錯誤訊息、異動紀錄用詞、視覺規範文件）。資料表與 API 欄位名稱不改。

## 3. 範圍

1. 設定按鈕 emoji；共用 `IconButton` 與客戶頁修改紀錄圖示按鈕。
2. 異動紀錄：ERP 查詢事件預設隱藏＋超級管理員勾選、ERP 查詢句子、全部事件可讀性掃描。
3. 異動紀錄清單密度（含客戶頁修改紀錄對話框）。
4. 左側選單：ERP 查詢移到最上方、委外/代工、外部工具短名稱。
5. 「代工對象」→「協力廠商」。
6. 文件、版本、TODO。

## 4. 不做

- 資料表、API 欄位、稽核資料寫入方式的變更（只改讀取與顯示）。
- 其他模組新增「修改紀錄」按鈕（只換客戶頁現有按鈕，元件供日後沿用）。
- 新增 CI workflow、示意圖檔、mock 頁面。

## 5. 實作指引

### 5.1 按鈕
- `src/runtime/modules/ModuleSettingsPanel.tsx`：刪除 SVG，按鈕內容 `<span aria-hidden="true">⚙️</span>設定`。
- 新增 `src/ui/actions/IconButton.tsx`：`<button type="button" className="cy-op-button compact cy-icon-button" title={label} aria-label={label}><span aria-hidden="true">{icon}</span></button>`；`.cy-icon-button` 寬度等於 `compact` 按鈕高度、內容置中，寫在共用 UI 樣式（多行寫法、只用 tokens）。
- `CustomerOperationalPage.tsx` 的「修改紀錄」按鈕改用 `<IconButton icon="🕘" label="修改紀錄" … />`。

### 5.2 異動紀錄後端
- `worker/audit` 查詢加參數 `includeErpQueries`（預設 `false`）：`false` 時 `entity_type <> 'erp_item_query'`；`true` 時排除 `action = 'created'` 的 ERP 查詢事件。
- 只有 `SUPER_ADMIN` 可以傳 `true`；其他角色傳了也當 `false`（後端判斷，不只靠前端隱藏）。
- `docs/architecture/API_CONTRACT.md` 補參數說明。

### 5.3 異動紀錄前端
- `src/runtime/modules/change-log-labels.ts`：
  - ERP 查詢事件專用句子：類別用 `shared/erp-item-query.ts` 的查詢種類對應中文（客戶、商品、供應商、進貨、銷貨、未收款、單據…，與 ERP 查詢頁的中文一致，不要另寫一份對照，抽成共用常數）；查詢內容取事件中的查詢字串；結果依 action 顯示「成功／失敗／逾時」；不列欄位變更。
  - `recordName` 的最後備援改為只回傳類別名稱（`entityLabel`），**不再附 `#entityKey`**。
  - 變更清單只有狀態欄位時，顯示「狀態：A → B」的中文值，不只顯示「狀態」。
- `AuditOperationalPage.tsx`：超級管理員顯示「顯示 ERP 查詢」勾選；清單列改為 `HH:mm　姓名　句子` 單行截斷；調整 `.cy-change-log-row` 樣式達 §2-5。
- 以實際稽核資料逐一檢查所有 `entityType`／`action` 組合（可從 `worker` 內所有 `action:` 常值列出），在完成報告附「事件 → 顯示句子」對照表，列出修正前後。

### 5.4 選單與用詞
- `src/App.tsx`：`baseNavigation` 最前面新增一個無標題群組只含 `erp-item-query`（`NavigationGroup` 若不支援無標題，加 `label?: string` 並讓側欄不渲染空標題）；從「業務模組」移除 ERP 查詢；預設頁改為：先看 ERP 查詢（`moduleCodesForRoute("erp-item-query")` 任一有權限），沒有再找 `key === "business"` 群組中第一個有權限的模組（不要用 `baseNavigation[0]`）。
- 「委外」→「委外/代工」：`App.tsx` 選單與 `PAGE_META` 標題、`shared/modules.ts` 的 `label`。
- 外部工具短名稱：`shared/program-catalog.ts` 的程式資料加選填欄位 `navLabel`，`accounting-web` 設為「志遠記帳 Web」；`programsNavigation` 使用 `program.navLabel ?? program.name`。
- `grep -rn "代工對象" src worker shared docs/architecture` 全部改為「協力廠商」（約 22 處）；不改識別字與資料欄位名。

### 5.5 文件、版本、TODO
- `VERSION`／`package.json` → `0.9.16`；`BUILD` 維持 `0`。
- `TODO.md` 最上方新增 0.9.16 段落並連結本單；補記 V0.9.14 部署：PR #212 合併 `85e20f0`、部署 run 39209010837（#294，success）。
- `CY_WEB_VISUAL_GUIDE.md`：圖示按鈕規則、異動紀錄清單密度、選單結構、「協力廠商」用詞。

## 6. 驗收清單

- [ ] 設定按鈕顯示「⚙️ 設定」，沒有線條齒輪。
- [ ] 客戶明細「修改紀錄」是 🕘 圖示按鈕，與「修改」同高同外框；滑鼠提示與螢幕閱讀器名稱為「修改紀錄」。
- [ ] 異動紀錄預設沒有任何 ERP 查詢事件；超級管理員勾選後只出現完成／失敗／逾時，句子如 `查詢 ERP 客戶「AC0016」：成功`；管理員、一般使用者看不到勾選，直接呼叫 API 帶 `includeErpQueries=true` 也拿不到（驗收測試涵蓋）。
- [ ] 異動紀錄全部事件沒有 UUID、英文代碼、`#數字`、只有欄位名的變更清單；完成報告附對照表。
- [ ] 清單每筆單行、約 30px 高，`HH:mm　姓名　句子`；客戶頁修改紀錄對話框同樣。
- [ ] 選單最上方是「ERP 查詢」（無分組標題），業務模組內不再有 ERP 查詢；沒有 ERP 權限時不顯示。
- [ ] 選單、頁面標題、權限設定中都是「委外/代工」。
- [ ] 選單中外部工具顯示「志遠記帳 Web」且不折行；CY 程式頁仍為正式名稱。
- [ ] 開啟網站不帶網址時：有 ERP 查詢權限 → 進 ERP 查詢；沒有 → 進業務模組第一個有權限的模組。
- [ ] `grep -rn "代工對象" src worker shared docs/architecture` 沒有結果。
- [ ] `npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local` 全部通過。
- [ ] `node --test scripts/*.test.mjs` 全部通過（需先 `git clone --depth 1 https://github.com/simonliu1118-byte/cyapps .tmp/canonical-cyapps`；無法取得時在完成報告寫明，**不得**另寫 workflow 代替）。
- [ ] 沒有新增或修改 `.github/workflows/*`，沒有範圍外檔案。
- [ ] VERSION／package.json 為 0.9.16；TODO、視覺規範、API 合約已更新。

## 7. 截圖要求

執行者不需提交截圖；在完成報告列出自己操作驗證的步驟。審查者會以實際畫面擷取：頂部設定按鈕、客戶明細按鈕列、異動紀錄（預設與超級管理員勾選 ERP 查詢）、左側選單（桌面與手機）、委外/代工頁的協力廠商用詞。

## 8. 完成報告（執行者填）

- 驗收清單逐項結果：
  1. 設定 emoji：已修改 `ModuleSettingsPanel.tsx`；尚待實機視覺驗收。
  2. 🕘 修改紀錄共用圖示按鈕：已新增 `IconButton.tsx` 並套用客戶頁；尺寸與可及性尚待實機驗收。
  3. ERP 查詢預設隱藏／SUPER_ADMIN 限制：已修改 Worker 查詢、路由、前端及 D1 acceptance；測試未在本回合執行。
  4. 事件可讀性：已修改 `change-log-labels.ts` 及現有測試；未完成實際全事件／真實資料逐筆驗收。
  5. 單行密集列表：已修改前端與樣式；30px 高度尚待實機驗收。
  6. ERP 查詢移至最上方：已修改 `App.tsx`；權限與手機畫面尚待實機驗收。
  7. 委外/代工：已修改導覽、模組標籤；需審查完整畫面。
  8. 志遠記帳 Web：已加入 `navLabel`；不折行須實機驗收。
  9. 預設登入頁：已修改 `App.tsx`；不同角色路由尚待驗收。
  10. 舊稱搜尋：相關 source 有修改；未執行指定 grep，不能宣稱零結果。
  11. `npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local`：未執行（本回合使用 GitHub Connector，無本機原始碼建置／D1 驗證環境）。
  12. `node --test scripts/*.test.mjs`：未執行；亦未完成 canonical CYapps 暫存 clone。
  13. 變更範圍：對 `main` 比較未見 `.github/workflows/*`，唯一新增的原始碼檔案為工作單明列的 `src/ui/actions/IconButton.tsx`。
  14. `VERSION` 與 `package.json` 已改為 0.9.16；`BUILD` 未修改；`TODO.md`、API 合約、視覺規範已更新。
- 與工作單不同之處與原因：原要求完成所有指令驗證及逐事件真實資料對照，但目前未有可執行建置／D1 測試的環境，故尚未能宣稱全部驗收通過。未修改 workflow、未合併、未部署。
- 驗證指令輸出摘要：GitHub 比較 `main...cyweb/ui-polish-0.9.16`：ahead 24、behind 0；未見 workflow 異動。其餘指定 shell/npm 測試均未執行，無輸出可附。
- 操作驗證步驟：登入 SUPER_ADMIN → 查看設定按鈕及客戶明細圖示 → 異動紀錄先看預設隱藏，再勾選「顯示 ERP 查詢」核對完成／失敗／逾時及無送出事件 → ADMIN／USER 直接呼叫 audit API 帶 `includeErpQueries=true`，確認仍不回傳查詢事件 → 測量稽核列高及截斷明細 → 比對桌面與手機側欄及登入預設路由 → 開啟委外/代工確認「協力廠商」，並檢查 CY 程式頁仍呈現完整程式名稱。
- 事件 → 顯示句子對照表（程式預期格式，未經實際資料逐筆確認）：

  | 事件 | 修正前問題 | 預期顯示句子 |
  | --- | --- | --- |
  | ERP 查詢送出 | 送出 ERP 查詢及內部狀態 | 預設及勾選後都不顯示 |
  | ERP 客戶查詢完成 | 完成 ERP 查詢「ERP 查詢 #UUID」：狀態 | 查詢 ERP 客戶「AC0016」：成功 |
  | ERP 進貨查詢失敗 | ERP 查詢失敗「PURCHASES」：狀態 | 查詢 ERP 進貨「B0009」：失敗 |
  | ERP 查詢逾時 | 內部查詢 ID 或英文代碼 | 查詢 ERP〔中文類別〕「查詢內容」：逾時 |
  | 狀態變更 | 只有「狀態」 | 〔中文動作〕「〔業務名稱〕」：狀態：〔原值〕 → 〔新值〕 |
  | 找不到業務編號 | 類別 #內部 ID | 〔中文動作〕〔類別〕 |

## 9. 審查紀錄（審查者填）

- （待審查）

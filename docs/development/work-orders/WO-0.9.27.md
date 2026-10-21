# WO-0.9.27 全系統表單改用共用欄位元件（必填＊、一次提醒、依長短排版）

- 狀態：待執行
- 分支：`cyweb/form-fields-all`（建議）　PR：（執行者填）

## 1. 背景（使用者原話）

> 現在各類表單必填好像沒有加上記號，請加上記號讓使用者知道哪些是必填。然後像人事，戶籍和通訊地址都沒輸入，按儲存的時候他會分兩次跳提醒，請一次跳。並且，現在所有表單好像幾乎都是這樣兩欄，排列有點太冗長，單欄也沒需要那麼寬的寬度。（2026-10-21）

> 可以是可以，先改，然後各表單的分區細節後續再修？（2026-10-21，看過人事表單新版後）

審查者已在 V0.9.26 Build 1（PR #255）完成：

- 共用元件 `src/ui/forms/Field.tsx`：`Field`、`CheckField`、`FormSection`、`RequiredRows`，以及 `src/ui/forms.css` 的 `.cy-f-*` 樣式；
- `FeedbackProvider` 把一次送出的所有缺漏合成一則提醒、標紅框；
- **人事員工表單**（`HrOperationalPage.tsx` 的 `EmployeeForm`）已改用新版，是本單的**範例**。

本單把其餘表單改成同樣做法。

## 2. 已定案事項（不得更改）

規則見 `PROJECT_RULES.md` §5「表單欄位一律用共用欄位元件」。重點：

1. 欄位一律用 `Field`／`CheckField`，外層用 `FormSection`；不再手寫 `<label>文字<input/></label>`，也不再用 `cy-op-form-grid`。
2. **必填**：在 `Field` 標 `required`（元件會自動在控制項加 `required`，不要兩邊各寫一次）。哪些欄位必填，**以目前程式的行為為準**：原本有 `required` 屬性、或送出前自行檢查（例如 `reportError("請填寫…")`）、或伺服器會回「必填」錯誤的欄位都算必填。不得新增或取消任何必填規則。
3. **擇一必填**用 `oneOf`＋`reportAs`（範例：人事的手機／市話）；**至少一列**用 `RequiredRows`（範例：人事的緊急聯絡人）。
4. **寬度**：
   - `s`：日期、時間、下拉選單、電話、數字、金額、數量、單位、短代號；
   - `m`：姓名、名稱、Email、品名、搜尋選擇器；
   - `l`：地址、備註、說明、`textarea`。
5. **一次提醒**：頁面裡逐欄的「請填寫 X」檢查，凡是能用 `required`／`RequiredRows` 表達的，改成交給瀏覽器檢查（`FeedbackProvider` 會一次列出全部）。無法用屬性表達的跨欄規則（例如明細列數量需大於 0、商品要和單位對應）維持原本的程式檢查，但要**先通過瀏覽器檢查才執行**，並且一次列出該規則的所有問題，不要逐列跳。
6. **分區**：本單只做最基本的分區：原本畫面上已經有分組（例如標題、分隔線、區塊）的，照原分組放進 `FormSection` 並加標題；其他表單用一個沒有標題的 `FormSection` 即可。**各表單的分區細節之後再由使用者逐一調整**，不要自行重新設計分組。
7. 欄位順序、欄位名稱、功能、API 都不改。

## 3. 範圍

改用共用欄位元件的表單（`<form>` 且非 `role="search"`），以下為 2026-10-21 盤點，執行時以實際程式為準，有遺漏一併處理：

| 檔案 | 表單數 | 內容 |
|---|---|---|
| `src/runtime/modules/CustomerOperationalPage.tsx` | 4 | 客戶、聯絡人、地址、拜訪等 |
| `src/runtime/modules/customer/QuoteCreateForm.tsx` | 1 | 報價 |
| `src/runtime/modules/ItemOperationalPage.tsx` | 1 | 商品 |
| `src/runtime/modules/defect/DefectForm.tsx` | 1 | 瑕疵 |
| `src/runtime/modules/SalesOrderOperationalPage.tsx` | 1 | 銷售工單 |
| `src/runtime/modules/OutsourcingOperationalPage.tsx` | 1 | 委外 |
| `src/runtime/modules/OutsourcingMasterData.tsx` | 3 | 代工對象、單價、BOM |
| `src/runtime/modules/WorkLogOperationalPage.tsx` | 3 | 工作日誌 |
| `src/runtime/modules/OrderingPage.tsx` | 4 | 叫貨 |
| `src/runtime/modules/ModuleSettingsPanel.tsx` | 3 | 模組設定 |
| `src/runtime/modules/HrOperationalPage.tsx` | 其餘 2 | 狀態異動、薪資、年資不計等動作視窗（員工表單已完成） |
| `src/runtime/modules/HrLeaveDialog.tsx`、`HrLeavePanel.tsx`、`HrLeaveTypeSettings.tsx`、`HrPhase2aSettings.tsx`、`HrSettingsButton.tsx` | 8 | 人事請假、設定 |
| `src/runtime/modules/RestockAssistPage.tsx` | 1 | 進貨輔助（若為查詢表單，改標 `role="search"` 即可） |
| `src/identity/SharedIdentityPage.tsx` | 7 | 帳號與權限 |
| `src/identity/CyInvoiceRecoveryAdminPanel.tsx` | 1 | 電子發票復原 |
| `src/auth/AuthGate.tsx` | 4 | 登入、首次設定密碼、忘記密碼 |
| `src/ui/overlays/useFormPrompt.tsx` | 1 | 共用輸入視窗（已有＊，改用 `Field` 讓樣式一致） |

另外：

1. 新增 `scripts/form-fields.test.mjs`，加入 `npm run validate:source`（放在 `form-keyboard.test.mjs` 後面）：
   - 掃描 `src/**/*.tsx`（`src/ui/` 共用元件本身除外）；
   - 對每個 `<form …>…</form>`（非 `role="search"`）區段，不得出現原生 `<label`，也不得出現 `cy-op-form-grid`；
   - 失敗訊息列出檔名與行號，並提示改用 `Field`。
   - **不得有例外清單。**
2. 表單內的勾選框用 `CheckField`。
3. 重複列（明細、聯絡人、學經歷）維持現有排版；有必填的欄，在區塊標題加＊與說明（範例：人事緊急聯絡人），列內輸入框保留 `required`。
4. 刪除不再使用的樣式（`cy-op-form-grid` 等），確認沒有其他地方引用後再刪。
5. `docs/architecture/CY_WEB_VISUAL_GUIDE.md` 補一節「表單欄位」：三種寬度、必填＊、擇一必填、一次提醒、分區，附人事表單作例子。

## 4. 不做

- 不重新設計各表單的分區與欄位順序（之後由使用者逐一調整）。
- 不新增或取消任何必填規則，不改 API、資料表、驗證邏輯。
- 不改查詢表單（`role="search"`）、列表的篩選列、排班表、出勤表格。

## 5. 實作指引

- 先讀範例：`src/runtime/modules/HrOperationalPage.tsx` 的 `EmployeeForm`，以及 `src/ui/forms/Field.tsx`、`src/ui/forms.css` 的 `.cy-f-*`。
- `Field` 的 `children` 必須是**單一控制項**（`input`／`select`／`textarea`）；控制項外面若包了按鈕（例如「選擇」），用 `<span className="cy-hr-picker">` 包起來，而且這種欄位不要標 `required`（元件會把 `required` 加在 `span` 上而無效），必填改由裡面的 `input` 自己加。
- 原本用 `FieldFrame`／`TextInput`／`SelectField`／`TextArea`（`src/ui/primitives/`）的表單：可以保留這些元件，但外層排版改用 `FormSection` 的格線，並給每個欄位寬度（若這些元件不方便接寬度，可在元件上加 `size` 屬性，輸出同樣的 `cy-f-s/m/l` class）。
- 送出前的自訂檢查：只有在瀏覽器檢查通過後才會執行（`onSubmit` 不會在有 `required` 缺漏時觸發），所以把能用屬性表達的檢查移除，留下的跨欄規則一次列出所有問題。
- 對話框（`Dialog`）裡的短表單也用 `FormSection`，格線會依對話框寬度自動收成兩欄或一欄。
- 每改完一個模組就跑 `npm run typecheck` 與 `node --test scripts/form-keyboard.test.mjs scripts/form-fields.test.mjs`。

## 6. 驗收清單

- [ ] §3 表格內所有表單都改用 `Field`／`CheckField`／`FormSection`；`form-fields.test.mjs` 通過且沒有例外清單。
- [ ] 每個表單的必填欄位都有紅色＊，且與原本的必填規則完全一致（完成報告逐表單列出必填欄位）。
- [ ] 每個表單：把必填欄全部留空按儲存，只跳**一次**提醒並列出全部缺漏、缺漏欄位有紅框、游標在第一個缺漏欄位。
- [ ] 寬度依 §2.4；桌面版表單最寬 960px；手機 390 寬不會左右捲動。
- [ ] 欄位順序、名稱、功能與改版前相同；所有既有功能測試照常通過。
- [ ] 固定項目：Enter 跳下一欄、日期欄四碼年份（`form-keyboard.test.mjs`）。
- [ ] `npm run typecheck`、`timeout 300 npm run validate:source`、`npm run build`、`npm run validate:d1:local`、`node --test scripts/*.test.mjs` **逐一實際執行並貼結果**；無法執行的寫明原因，不得宣稱通過。
- [ ] 沒有新增或修改 `.github/workflows/*`，沒有範圍外的檔案。
- [ ] VERSION／package.json → `0.9.27`，BUILD → `0`；`TODO.md` 的 0.9.27 段落打勾；視覺規範已補。

## 7. 截圖要求

由審查者擷取：客戶、報價、商品、瑕疵、銷售工單、委外、工作日誌、叫貨、帳號與權限、登入的表單，各附桌面 1440 寬與手機 390 寬，以及至少三個表單「全部留空按儲存」的提醒畫面。執行者在完成報告列出各表單的位置（從哪個選單、按哪個按鈕打開），方便審查者擷取。

## 8. 完成報告（執行者填）

## 9. 審查紀錄（審查者填）

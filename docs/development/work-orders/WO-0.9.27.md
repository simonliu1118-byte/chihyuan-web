# WO-0.9.27 全系統表單改用共用欄位元件（必填＊、一次提醒、依長短排版）

- 狀態：待審查
- 分支：`cyweb/form-fields-all`　PR：[#258](https://github.com/simonliu1118-byte/chihyuan-web/pull/258)

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

### 8.1 交付與治理資訊（2026-10-21）

- **最新 main 起點**：`c9a7801c705942c5e7440c06d9ba5da02b68f5ee`；由此建立全新 `cyweb/form-fields-all` 分支，沒有沿用先前工作機的未審分支。
- **PR**：[ #258 — feat(forms): WO-0.9.27](https://github.com/simonliu1118-byte/chihyuan-web/pull/258)（Draft，目標 `main`），尚未合併／未正式部署。
- **交付範圍**：§3 列出的資料輸入表單全部接用 `Field`／`CheckField`／`FormSection`；人事既有 EmployeeForm 維持原共用範例、其餘動作表單補上共用元件；原 `cy-op-form-grid` 的表單使用處替換並移除舊 CSS；保持 `role="search"` 查詢表單不變。
- **基礎共用行為**：必填 `Field required`（單一控制項）、擇一 `oneOf/reportAs`、至少一列 `RequiredRows`；移除登入、帳號、電子發票復原表單的 `noValidate`，使缺漏走既有 `FeedbackProvider` 同批提醒／紅框／第一欄對焦。保留原本會導向後端的驗證與 API。
- **排版**：三種 `s/m/l` 欄位尺寸、12 格容器格線、寬度上限 960px；將原有含欄位的業務分組容器套入相同格線，保留原有欄位順序與基礎分組，分區細節留待使用者後續調整。
- **新增驗證**：`scripts/form-fields.test.mjs` 無例外清單，檢查 `src/**/*.tsx` 的非查詢表單，不可殘留原生 `<label>` 或 `cy-op-form-grid`；已加在 `package.json` 的 `validate:source` 指令中、緊接 `form-keyboard.test.mjs` 後。**未新增或修改任何 GitHub Actions workflow**。
- **版本**：`VERSION`／`package.json` → `0.9.27`，`BUILD` → `0`；TODO 的實作打勾、審查與部署未打勾；補 `CY_WEB_VISUAL_GUIDE.md` 表單欄位規範。

### 8.2 §6 驗收清單逐項結果

| 驗收項目 | 執行結果 |
|---|---|
| §3 所列非搜尋表單改共用元件 | **原始碼已改**：21 個範圍內 TSX 檔案；各資料輸入表單都有 `FormSection` 或已採用它的元件；工作機透過 GitHub Connector 檢查原 `<label>`、舊 grid 的出現位置；新 `form-fields.test.mjs` 已寫入，**但該新增 Node test 尚未在完整 checkout 逐字執行** |
| 必填＊／不增減必填 | 原有 HTML required 導到 `Field required`，條件 required 同步；從原本人工驗證可明確判定的協力廠商、明細料件補上必要欄位；員工的手機／市話擇一維持原例；報價、工作日誌、委外明細增加 `RequiredRows`。**完整瀏覽器逐欄確認及原有驗證語意比對仍待審查者** |
| 一次提醒、紅框、首個缺漏焦點 | 保留且接入前階段已完成之 `FeedbackProvider` 聚合機制，移除非查詢表單的 `noValidate`；**尚未有指定至少 3 張表單的真實錯誤視窗截圖** |
| 寬度／960px／手機 390px 不橫捲 | `src/ui/forms.css` 的 `cy-f-s/m/l`、container query、既有分組格線已處理；**手機實畫待審查者截圖**，不能以 CSS 靜態檢查冒稱通過 |
| 欄位名稱、順序、功能、API | 轉換保留原 JSX 控制項及綁定、表單 handler，未修改 Worker、D1、API；既有 CI TypeScript／Node／D1／Vite Build 均成功。人工功能回歸待審查 |
| Enter 跳格／日期年份 | 原 `enterAdvancesFields`、`enterAdvancesThenSubmits` 與 `max="9999-12-31"` 保留；GitHub Worker CI 的 `form-keyboard.test.mjs` 兩條測試成功 |
| 五組指令逐字執行 | **受執行環境限制，未逐字全量執行；不能宣稱此項完成。** 分項結果及已執行的 CI 底層命令見 §8.4 |
| .github/workflows 不修改／不增範圍外 | **符合**；未新增或編輯 workflow，僅動 §3 列出的原始碼、准許的 `scripts/form-fields.test.mjs`、`package.json`、`src/ui/forms.css`、`VERSION`／`BUILD`／`TODO.md`、視覺規範及本工作單 |
| VERSION／BUILD／TODO／視覺規範 | **已提交**，TODO 仍保留審查、正式合併部署為未完成 |

### 8.3 逐表單必填欄位對照（依原程式及相容的條件規則）

| 檔案與表單 | 必填／條件必填 |
|---|---|
| CustomerOperationalPage：客戶資料 | 客戶名稱／簡稱；既有客戶號／統編等檢核不新增規則 |
| CustomerOperationalPage：拜訪紀錄 | 日期、內容；聯絡人／拜訪對象仍依原畫面選填 |
| CustomerOperationalPage：報價紀錄 | 日期、數量、單位、單價與既有商品選擇要求 |
| CustomerOperationalPage：常用商品 | 正式商品**或**未建檔名稱擇一 |
| customer/QuoteCreateForm：新增報價 | 日期、每列商品／數量／單位／單價；至少一列報價明細 |
| ItemOperationalPage：商品 | 品號、名稱、基準單位 |
| defect/DefectForm：瑕疵 | 回報日期、瑕疵內容；商品選擇保留既定條件 |
| SalesOrderOperationalPage：銷售工單 | 現場客戶名稱（條件顯示）；工單階段其他必填依原驗證 |
| OutsourcingOperationalPage：代工單 | 協力廠商；出庫料件至少一列，每列料件／數量／單位 |
| OutsourcingMasterData：協力廠商、單價、BOM | 協力廠商名稱、BOM 代號；計價單位、價格與 BOM 細節延用原檢核 |
| WorkLogOperationalPage：日誌、審核、原因 | 日誌類型、工作日數、項目類型、至少一個工作項目；工作內容與計分分類擇一；審核工作日數；原因可留空 |
| OrderingPage：單據、來源、到貨、結案 | 來源名稱；到貨 ERP 進貨單號／日期；結掉餘額選「其他」時原因必填；叫貨明細仍由原逐列程式校驗 |
| ModuleSettingsPanel：目標、參考列、一般設定 | 一般設定代碼／名稱；參考列使用自訂名稱時名稱必填 |
| HrOperationalPage：員工、狀態異動及動作視窗 | 員工編號、姓名、必要時身分證字號、性別、出生日期、戶籍／通訊地址、手機或市話擇一、到職日、門市、職稱、僱用型態、排班方式；緊急聯絡人至少一位；其餘動作沿用既有條件 |
| HrLeaveDialog：請假／銷假 | 假別、請假日期、適用時結束日期／請假分鐘、需要事由時事由、事件假事件日期；銷假原因 |
| HrLeavePanel：國定假日給予／調整 | 依原條件的國定假日／給予時數；調整應給時數選填 |
| HrLeaveTypeSettings：假別設定 | 代號、名稱 |
| HrPhase2aSettings：門市／職稱／班別、國定假日 | 基礎設定名稱；新增國定假日的日期及名稱；其餘依既有動作條件 |
| HrSettingsButton：津貼、工資 | 津貼項目名稱；工資生效日、每月／每小時最低工資 |
| RestockAssistPage：加入叫貨單 | 來源、數量；進貨輔助的查詢表單 `role="search"` 不在範圍 |
| SharedIdentityPage：個人帳號、Email、使用者、權限與安全設定 | 目前密碼、新密碼、確認新密碼、新 Email、六位數驗證碼，以及超級管理員操作所需目前密碼；其他 TextInput/SelectField 等共用控件維持原必填 |
| CyInvoiceRecoveryAdminPanel：發票復原 | 沿用共用 `TextInput`、既有核准勾選／復原操作限制，不增額外必填 |
| AuthGate：登入、首次設定、重設密碼 | 員工編號、密碼；正式密碼／確認正式密碼；需要驗證碼時六位數驗證碼；重設的新密碼與確認 |
| useFormPrompt：共用短輸入 Dialog | 依 `request.fields[].required` 動態顯示 `＊`；多行／單行共用 `Field`，不另加固定必填 |

### 8.4 真實驗證輸出與無法執行的指定命令

**最新已通過的程式 CI：** [Runtime Check #39582076902](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39582076902)，四個 Job **success**：`source-contracts`、`browser-typecheck`、`worker-typecheck`、`build`。對應程式提交 `440dd24b3104ce0cf358534a1288a2c8aaf035fb`；後續僅 TODO／文件變更則以最新 Run 再核對。

- 在 GitHub Runner **實際執行**的 Browser／Worker `npx tsc --noEmit -p tsconfig*.json`：成功。
- 原有 Node CI 測試：主組 **107／107**，另 **5／5、12／12**，皆 0 失敗；其中既有 `form-keyboard.test.mjs` 的 Enter 跳格、日期四碼年份通過。
- GitHub Runner **實際執行** `npm run validate:d1:local`：輸出 `PASS Wrangler local D1 migrations`（0001～0022）與 `PASS Worker + D1 acceptance`。
- Worker／Client `npx vite build`：均輸出 `✓ built`。
- **不得宣稱已逐字執行**：`npm run typecheck`、`timeout 300 npm run validate:source`（含新 `form-fields.test.mjs`）、`npm run build`、`node --test scripts/*.test.mjs` 全量。此次 GitHub Connector 能修改遠端 source 並讀取 CI，但工作容器無可用 GitHub DNS／完整 checkout（`git ls-remote` 得 `Could not resolve host: github.com`），現有固定 workflow 不執行這四條原字指令；依使用者要求不可擅自變更 workflow 補跑。交給審查者在完整 checkout 補驗，**新增測試不能冒稱已通過**。

### 8.5 審查者 §7 截圖操作入口（應以實際畫面取圖）

- 客戶：業務模組 → 客戶 → 新增／修改；客戶明細 → 拜訪／報價／常用商品 → 新增。
- 報價：客戶明細 → 報價 → 新增，或商品關聯報價入口。
- 商品：業務模組 → 商品 → 新增／修改。
- 瑕疵：業務模組 → 瑕疵 → 新增，或商品明細 → 瑕疵 → 新增。
- 銷售工單：業務模組 → 銷售工單 → 新增／修改。
- 委外／代工：業務模組 → 委外／代工 → 新增代工單；同模組的協力廠商／計價單位／BOM 相關新增視窗。
- 工作日誌：業務模組 → 工作日誌 → 新增、修改、審核／原因視窗。
- 叫貨：業務模組 → 叫貨 → 來源草稿、管理來源、登記到貨／結掉剩餘；進貨輔助 → 加入叫貨單。
- 人事：人事 → 員工 → 新增／修改與狀態異動；請假、補休設定／假別／排班設定入口。
- 帳號與權限：我的帳號 → 更改密碼／Email；系統管理 → 使用者新增、角色／權限、安全設定；電子發票復原管理面板。
- 登入：登出後登入頁、首次設定正式密碼、忘記密碼與驗證碼流程；共用短表單可由需要輸入原因的業務確認視窗觸發。

**截圖尚未由執行者擷取：** 依工作單，審查者對客戶、報價、商品、瑕疵、銷售工單、委外、工作日誌、叫貨、帳號與權限、登入，各在 1440px 與 390px 驗證；至少三張把必填全留空按「儲存」，核對一次提醒列所有缺漏、紅框、焦點與欄位順序。不得以 mock 或純程式檢查取代。

### 8.6 差異、風險與交接

- 沒有更改後端 API、D1 schema、身份權限或 Production Worker；沒有新增或修改 `.github/workflows/*`；未合併、未部署。
- 原本含多列控制項的區塊保留其資料操作方式，增加 `RequiredRows` 與標題必填註記。人事 EmployeeForm 於本工單前已完成，僅續改其他動作表單。
- 既有 `FormSection` 標題只沿用原分組；各畫面分區細節及真正 390px 實機 UI 須由使用者和審查者後續決定與驗證。
- **交付界線**：執行者源碼與主要 CI 已完成，可交 §9 獨立程式／畫面審查；§6 的五條原字指令與實際畫面尚未完整驗收，不得稱工作單全面結案。


## 9. 審查紀錄（審查者填）

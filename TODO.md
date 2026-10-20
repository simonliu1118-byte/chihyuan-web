## CY Web V0.9.23 Build 2 — 表單鍵盤規則與自動檢查（Claude 直接處理）

- [x] PROJECT_RULES §5：Enter 跳下一欄、日期四碼年份列為必要功能；`scripts/form-keyboard.test.mjs` 納入 validate:source。
- [x] 登入流程的首次設定密碼、忘記密碼補上 Enter 跳欄；查詢表單標示 role="search"。

## CY Web V0.9.23 Build 1 — 日期年份與 Enter 跳欄（Claude 直接處理）

- [x] 全系統日期欄位加上年份上限（四碼），避免手動輸入時年份變成六碼。
- [x] 補上 Enter 跳下一欄：客戶報價（含商品頁共用的報價表單）、更正報價、常用商品新增；我的帳號的密碼、Email 視窗（最後一欄 Enter 送出）。
- [x] 人事表單修正（Enter 跳欄、綁定使用者選擇視窗、身分證隱碼、地址順序、必填）在 WO-0.9.24 審查時一併完成。
- [ ] 正式上線前統一整理測試資料（測試客戶、工單、人事等）：先備份，列出候選清單給使用者確認，真實資料不可刪，再分批刪除。
- [ ] **正式上線前移除人事「刪除」功能**（測試用，BD-059 第 7 項；`HrService.remove`、DELETE 路由、人員頁刪除按鈕與驗收 `ACCEPT_HR_DELETE*`）。

## CY Web V0.9.25 — 人事第二期 2b：請假、特休、加班、補休（WO-0.9.25；待執行）

- [ ] GPT 依 WO-0.9.25 實作並開 PR；審查者審查、截圖、合併部署。
- [ ] 使用者測試 2a 時發現的問題，記在這裡，於 2b 審查時一併修正（使用者 2026-10-20：「修的弄完一起修」）。
- [x] 使用者已在 Cloudflare 建立人事附檔用的 R2 bucket（2026-10-20）。
- [ ] 部署前：確認 bucket 名稱並在 GitHub 新增 variable `CF_HR_FILES_R2_BUCKET`；審查者在 deploy workflow 傳遞該變數。
- [x] 2026-10-20 依使用者回饋改寫 2b：請假頁籤、排班預填與假單分開（待補／已完成記號）、加班改在出勤頁標記、換休可預支、不設每日正常工時（BD-060 第 17～25 點）。
- [ ] 每月 1 日排程檢查人事法規（`docs/architecture/HR_LEGAL_WATCH.md`）。部分工時（半職、兼職）的請假額度與特休比例待確認。
- [ ] 人事附檔的備份另案處理。

## CY Web V0.9.24 Build 0 — 人事第二期 2a：排班與出勤（WO-0.9.24；已審查）

- [x] BD-060 第二期規則定案（2026-10-20）；設計文件 §5 更新。
- [x] [WO-0.9.24 工作單](docs/development/work-orders/WO-0.9.24.md)：門市、職稱、班別、國定假日、月排班表（雙週跨月、自動例休、合法性檢查、列印）、出勤輸入與異常。
- [ ] 2b 工作單（請假與附檔、特休扣抵與遞延、加班確認與補休、國定假日換休帳戶、書面通知）於 2a 審查後開立。

## CY Web V0.9.23 Build 0 — 系統與安全細修（Claude 直接處理）

- [x] 「開始災難復原」按鈕放在說明文字下方（靠左）。
- [x] 已登記的系統只顯示名稱與狀態；識別碼為 CYID 註冊的正式系統代號（CYACC 為不具意義的代號，改名需 CYID／CYACC 協同搬移，使用者決定不改），改為滑鼠停留在名稱上時顯示。
- 使用者：系統與安全維持目前視覺；日後新增模組優先把上排填成三張卡片，再調整下方版面。
- [x] PR #227 合併 `cd0e5cb`；部署 run 39371824177（success）。

## CY Web V0.9.22 Build 0 — 系統與安全版面整理（Claude 直接處理）

- 使用者 2026-10-20：驗證碼與 Email 安全設定直接攤開容易誤按、全寬沒有意義；災難復原改去備份管理。
- [x] 系統與安全限制最大寬度 1080px；已登記的系統與安全設定並排（窄螢幕單欄）。
- [x] 驗證碼與 Email 安全設定改為唯讀摘要，按「變更」開視窗修改。
- [x] D1 用量只列今日有用量的資料庫，其餘收成一行；表格限制寬度。
- [x] CYInvoice 裝置災難復原移到備份管理：平時一行說明與「開始災難復原」按鈕，操作在視窗內；有未完成操作時按鈕改為「繼續處理復原操作」。復原流程與檢查不變。
- [x] PR #226 合併 `a2240c5`；部署 run 39366664656（success）。

## CY Web V0.9.21 Build 0 — Cloudflare 用量巡檢（WO-0.9.21；已審查）

- [x] [WO-0.9.21 工作單](docs/development/work-orders/WO-0.9.21.md)：超級管理員查看全帳號 D1 今日與近 7 天讀寫量，70%／90% 警示列；不做 Email。
- [ ] 使用者在 Cloudflare 建立只讀 token（Account Analytics: Read、D1: Read），存為 GitHub secret `CF_USAGE_API_TOKEN`（deploy workflow 傳遞已由審查者補上）；設定後重新部署並實機確認。
- [x] 2026-10-20 已設定 token 並重新部署（run 39365575767），實機顯示全帳號用量正常。
- [x] 審查通過，審查者修正 5 項（見工作單 §9）。

## CY Web V0.9.20 Build 0 — 人事模組第一期（WO-0.9.20；已部署）

- [x] [WO-0.9.20 工作單](docs/development/work-orders/WO-0.9.20.md)：人事主檔、使用者綁定、狀態異動、週年制年資特休、薪資異動、津貼與最低工資設定、證號保護及稽核。
- [x] 第二次審查通過：Node 測試 153/153、畫面依 §9 B 區由審查者改寫並截圖驗收。
- [x] PR #221 合併 `c342e21`；部署 run 39347135492（#370，success）。2026-10-19 首次部署（run 39281112381）因 Cloudflare 帳號 D1 每日讀取額度被 CYACC 作業用盡而在遠端變更前失敗，額度重置後重新部署。

## CY Web V0.9.19 Build 0 — 我的帳號與說明文字細修（WO-0.9.18；已部署）

- [x] [WO-0.9.18 工作單](docs/development/work-orders/WO-0.9.18.md)：我的帳號設定卡、密碼與 Email 視窗、全站說明文字清理；PR #220 已審查。版本號改為 0.9.19（0.9.18 已由 PR #218 使用）。
- [x] PR #220 合併 `fce11c5`；部署 run 39263519808（#321，success）。PR #218（0.9.18）部署 run 39234445296（#319，success）。

## CY Web V0.9.18 Build 0 — ERP 銷貨銷退／進貨退貨清單與視窗

- 使用者 2026-10-19：從客戶／供應商資料開的銷貨銷退、進貨退貨視窗不再一開就查，先帶入頁面日期、可改，按「查詢」才送出。
- 單據由卡片改為清單（`ErpOrderList`）：表頭＋每張一列（類別、日期、單號、品項、業務員／廠商單號、合計），點列展開／收合，並有「全部展開」「全部收合」；手機版每張兩行。銷退／退貨仍接在原單下並互相連結。單筆憑證視窗同樣套用。
- [ ] PR CI、授權後合併與部署；實機驗收。

## CY Web V0.9.17 Build 0 — 審查遺留小項（Claude 直接處理）

- [x] PR #217 合併 `045c86c`；部署 run 39225975605（#317，success）。

- [x] 異動紀錄商品名稱顯示為「A00001 志遠拔罐杯#1」；名稱含「#1」不再被當成內部編號濾掉。
- [x] 選單外部工具「價格觀測室（原型）」短名稱「價格觀測室」。
- [x] 單位換算純函式由 `worker/item/unit-conversion.ts` 搬到 `shared/unit-conversion.ts`，前端與 Worker 共用。
- [x] 商品頁瑕疵新增對話框不再有兩層標題；按鈕放在表單底部，與其他對話框表單一致。

## CY Web V0.9.16 Build 0 — 介面細修（已部署）

- [x] PR #216 合併 `38c40b1`；部署 run 39224596556（#315，success）。
- [x] [WO-0.9.16 工作單](docs/development/work-orders/WO-0.9.16.md)：設定及修改紀錄圖示、ERP 稽核篩選與文字、清單密度、選單及協力廠商用詞。

## CY Web V0.9.15 Build 0 — 商品頁精簡與跨模組瑕疵／報價紀錄（已部署）

- [x] [WO-0.9.15 工作單](docs/development/work-orders/WO-0.9.15.md)：商品清單／明細精簡、BD-058 直接換成基準單位、瑕疵與報價跨模組共用表單及摘要卡、含 id 的分享連結。
- [x] PR #214 合併 `a8352fe`；部署 run 39215572767（#311，success）。
- [ ] 此版本僅開 PR 交審查；正式合併／部署／真實 UI 截圖驗收由審查者辦理。

## CY Web V0.9.14 Build 0 — 客戶編號與多品項報價（已部署）

- [x] [WO-0.9.14 工作單](docs/development/work-orders/WO-0.9.14.md)：客戶編號呈現、相關紀錄新增／查看全部、商品搜尋、單次多品項報價（每商品一紀錄、同商品多級距）、批次原子寫入與品號顯示規範。
- [x] PR #212 合併 `85e20f0`；部署 run 39209010837（#294，success）。

## CY Web V0.9.13 Build 0 — 異動紀錄人性化與工具連結

- [x] [WO-0.9.13 工作單](docs/development/work-orders/WO-0.9.13.md)：CYID 姓名顯示快取、異動紀錄中文摘要與篩選／欄位變更抽屜、客戶管理員專屬修改紀錄，以及網頁程式外部工具入口。PR #208 審查通過（2026-10-19，紀錄見工作單 §9）。
- [x] PR #208 已於 2026-10-19 合併（commit `6c490196`）；CY Web Deploy [run 39183836960](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39183836960) 同提交正式部署成功；使用者實機驗收仍待完成。

## CY Web V0.9.12 Build 0 — 客戶紀錄卡片與介面一致性

- [x] [WO-0.9.12 工作單](docs/development/work-orders/WO-0.9.12.md)：拜訪／報價／常用商品改三張唯讀摘要卡片與各自專屬視窗；客戶最後修改者；個人選單精簡；共用台北日期顯示；標題說明與模組設定大視窗。
- [x] PR #207 審查通過並合併 `101de07`，CY Web Deploy #269（run 39144743035）部署成功。
- [ ] 使用者實機驗收。

## 2026-10-18 CYInvoice 3.0 Recovery × CYWEB V0.9.0 介面重整後接線

- [x] 以 CYWEB `main` 的最新 V0.9.0 Build 1（`a46f5666`，#191）為唯一基準，選取 #151 的復原 UI／Worker／測試與配置程式移植，不 merge 舊 V0.7.25 分支以免覆寫 Claude 已部署的介面、ERP、備份、Program Catalog 等功能。
- [x] 接回 SUPER_ADMIN／Email 驗證門檻的 `CyInvoiceRecoveryAdminPanel`、當次密碼、操作 ID checkpoint、防重送／狀態／明確撤銷 readback；User/ADMIN 不出現介面，瀏覽器不儲存密碼／復原碼。
- [x] 接回同源 + Origin／Fetch Metadata／CYID session 檢查、`CYINVOICE` Application 再驗證、固定 Workspace／Device 授權，以及非預設的 named `CyInvoiceRecoveryEntrypoint` 私有 RPC Service Binding，未接線回 503 而不會簽發；原 CYWEB/Identity D1 不增加第二權威。
- [x] 已有 #151 的 source API／UI 單元測試納入現行 Runtime Check、Deployment Config 測試，確認 0.9 UI 不需另一套 Desktop/Mobile renderer。
- [ ] 新 CYWEB PR 的最新 head Governance／Runtime Check／Build 與自動測試、Desktop／Mobile 真實 UI 操作驗收。
- [ ] CYInvoice PR #476 在原 D1 完成備份＋回復演練與 schema 0014／0015、Issuer gate 維護配置、Worker feature flag 後，再將 CYWEB `CF_CYINVOICE_RECOVERY_SERVICE` 實際接到正確命名入口並進行受控部署、真 Email／雙 Windows／DR-01～13。
- 來源舊 PR #151 保留作參照，不直接合併；本輪不變更正式 D1／Worker／CYWEB `main`，不發布正式新功能。CI 綠燈不代替真裝置驗收。

# CY Web TODO

> 本文件只保存目前狀態、驗收證據與待辦，不是永久規則來源。舊版本逐輪紀錄以 Git history 追溯；業務規則與架構參照既有 canonical 文件，不另建交接或規則層。

## 外框、新增按鈕、修改按鈕與模組設定 — 0.9.11 Build 0（2026-10-18）

- PR #203 合併 2e45269，CY Web Deploy #250（run 39139601492）部署成功

- 右上角從左到右為外觀切換（系統／淺色／深色，獨立按鈕；手機為單一圖示按鈕）與個人選單（頭像、姓名、角色；選單內「我的帳號」「登出」）。側欄帳號卡移除。個人設定目前只有外觀與密碼／Email，不另做設定按鈕；日後要加（例如字級）時做成上方獨立按鈕。
- 「我的帳號」改為獨立頁（`#account`），由個人選單進入；帳號與權限只剩「使用者」「系統與安全」，一般使用者側欄不再顯示帳號與權限。沒有可用模組或權限被取消時改回到「我的帳號」。
- 全站「＋ 新增…」移到清單工具列最左邊、搜尋框前面（客戶、商品、瑕疵、工單、委外代工單／代工對象／BOM、工作日誌）；備份頁的動作與設定頁的新增放在內容最上方工具列。移除 `PagePrimaryActions`。
- 紀錄修改表單的「取消／儲存」移到表單標題列右側（原本「修改」的位置），捲動時固定在畫面上方；不再放在底部（使用者同意只放上面）。
- 「系統管理／設定」拆回各模組（使用者：設定是各模組的，共通入口很奇怪）：客戶、商品、工作日誌各有「設定」頁籤（只對管理員／超級管理員顯示，結構設定仍只有超級管理員能改，BD-043 不變）。舊的分類標籤（`app_tags`，BD-037 已不作授權）不再顯示。API 不變。
- [ ] PR CI、合併與部署；使用者實機驗收。

## 待辦：使用說明

- [ ] 所有模組修完後：右上角加「使用說明」按鈕（排在外觀切換左邊），打開顯示目前頁面的教學並可切換其他模組；頁標題旁的 ⓘ 說明併入。教學內容等模組全部完成後一次撰寫。

## 權限群組 — 0.9.10 Build 0（2026-10-18）

- 使用者要求加上權限群組：群組設定好權限，加入的人使用群組設定、不可另外修改。使用者確認（BD-057）：每人最多一個群組；群組同時管系統使用權與 CY Web 模組（使用者：「這樣比較簡單」）；移出群組時保留當時的設定成為個人設定。
  - 權限群組放在「使用者」頁籤內，工具列切換「人員｜權限群組」；新增按鈕放在工具列左邊（「＋ 新增使用者」「＋ 新增群組」）。
  - 群組表：一列一群組，欄位分系統使用權、業務模組、ERP 查詢，勾選立即套用到所有成員；新增、重新命名、刪除（成員保留目前設定）。
  - 「人員」總表與個人抽屜有「權限群組」下拉（個人設定／群組，加入前確認）；群組成員整列鎖定並註明由哪個群組設定。「從某人複製使用權」：來源在群組就加入同群組，否則先移出群組再複製個人設定。
  - 系統使用權存在 CYID，無法和 D1 一起寫入：Worker 寫完 D1 後逐人同步到 CYID，只改不同的格；失敗或在 CY Web 以外被改動的成員，群組頁顯示黃色提示並可「重新套用」。
  - 後端：migration `0015_module_access_groups.sql` 四張表；模組變更在同一個 D1 batch 改寫成員的 `app_member_module_access`，執行期授權不變；個人模組 API 與系統使用權代理對群組成員回 409 `MODULE_ACCESS_GROUP_MANAGED`；revision 樂觀鎖與稽核事件。`validate:d1:local` 的 `moduleAccessGroups` 驗收涵蓋 CYID 同步、失敗回報與重新套用。
- [x] PR #202 CI 全綠後合併 `deaffa6`，CY Web Deploy #248（run 39137792479）以同一 commit 部署成功，含「Apply development D1 migrations」（0015）。
- [ ] 使用者實機驗收。

## 帳號頁：可編輯使用權總表 — 0.9.9 Build 0（2026-10-18）

- 使用者回饋 0.9.8：「我的帳號」放第一個；使用者一個一個點選不好用，要使用權一覽且最好能直接編輯。依使用者同意的提案 A 實作：
  - 頁籤順序改為「我的帳號／使用者／系統與安全」，預設開「我的帳號」。
  - 「使用者」改為一張總表：一列一人，欄位分組為系統使用權、業務模組、ERP 查詢；勾選立即生效（該格轉圈、只更新那一格），權限下拉可直接改。表頭與姓名欄固定，左右捲動。超級管理員列固定可用、自己那列不能改。搜尋與帳號狀態按鈕列保留。
  - 點姓名開右側抽屜：帳號動作（停用／啟用、更換 Email、重寄驗證、帳號管理員、刪除、移交）、權限、「從某人複製使用權」與此人的逐項使用權；手機版表格只列姓名與狀態，在抽屜內編輯。
  - 移除 0.9.8 的左清單右明細。仍只使用既有 API（`setEmployeeApplicationAccess`、`setEmployeeModuleAccess`），複製逐項送出並回報成功筆數。使用者確認不需要整欄設定（已移除）。
- [x] PR #200 已部署：CY Web Deploy #242（run 39124462710）以合併 commit `21fc879` 部署成功。
- [x] PR #201 CI 全綠後合併 `bfef221`，CY Web Deploy #245（run 39126985680）以同一 commit 部署成功。
- [ ] 使用者實機驗收。

## 帳號與權限頁整理 — 0.9.8 Build 0（2026-10-18）

- 使用者反映帳號與權限頁「有點難用、太亂」：原本一頁由上而下堆疊我的帳號、使用者大表（每列 2–4 顆按鈕）、系統使用權與模組使用權兩張勾選矩陣、OTP 設定與 CYInvoice 復原。改為頁籤＋左清單右明細，沿用其他模組的做法：
  - 「使用者」：左側清單可搜尋，狀態按鈕列（尚未啟用／Email 待驗證／啟用／停用）含人數；右側明細只顯示這個人可以做的動作，依狀態給「下一步」提示，權限、帳號管理員、Email 在同一區，下方逐項勾選「系統使用權」與「CY Web 模組使用權」（業務模組、ERP 查詢分組，勾選立即生效、該格轉圈）。新增使用者後自動選取該帳號。
  - 「我的帳號」：變更密碼與 Email（一般使用者只看到這一頁）。
  - 「系統與安全」（超級管理員）：已登記系統清單與「登記系統」、驗證碼與 Email 安全設定、CYInvoice 裝置災難復原。
- 移除兩張矩陣與舊的自訂移交視窗（改用共用 `Dialog`），`window.alert` 改為共用確認視窗後重新登入；停用帳號前先確認。API、權限規則與後端不變；`identity.css` 移除不再使用的表格、矩陣與自訂視窗樣式。
- [ ] PR CI、合併與部署；使用者實機驗收。

## ERP 查詢介面對齊與網頁標準視覺規範 — 0.9.7 Build 0（2026-10-18）

- 使用者要求確保 ERP 自動查詢工作線部署的 0.9.6 與新版介面一致。0.9.6 新增的單據視窗已使用共用 `Dialog`／`Loading`／按鈕轉圈；ERP 查詢頁仍有自訂的一套，本次改用共用元件並移除 `erp-item-query.css` 中的重複樣式：
  - 輸入框、日期、類別下拉改用 `.cy-op-input`；類別頁籤改用 `.cy-op-tabs`。
  - 查詢方式（品號／品名、客戶代號／名稱／銷貨銷退單、未收款範圍）改用新的共用分段按鈕 `.cy-segmented`；側欄外觀切換也改用它（`.compact`），取代 `.cy-theme-switch` 與 `.cy-erp-mode-switch`。
  - 連線狀態原為外框按鈕樣式，改為 `cy-status-dot`＋文字（超級管理員按鈕）或 `StatusChip`（唯讀）。
  - 銷貨／銷退、進貨／退貨類別改用 `StatusChip`；「結果已達上限」類提示改為黃色提醒框，ERP 錯誤訊息改為紅色訊息框（原本全部是紅字）。
  - 固定圓角數字改用 radius tokens。
- 新增 `docs/architecture/CY_WEB_VISUAL_GUIDE.md`（志遠網頁程式標準視覺規範），結構比照 AITeam CY Desktop Visual Guide：規範強度、字型字級、顏色與狀態語意、版面、元件、清單、載入、鍵盤、響應式、無障礙、用語、圖示、實作規則、與 Windows 規範的關係及驗收清單。依 `PROJECT_RULES.md` §5 為 canonical 候選，經使用者確認後應升格至 AITeam `shared/cy-visual/web/`（本工作階段對 AITeam 只有讀取權限）。
- [x] PR #197 已部署：CY Web Deploy #235（run 39104398791）以合併 commit `a316b9b` 部署成功。
- [x] [PR #199](https://github.com/simonliu1118-byte/chihyuan-web/pull/199) 合併 `5c0bb9b`，CY Web Deploy #240（run 39122159939）部署成功。
- [ ] 使用者確認視覺規範後升格至 AITeam（使用者 2026-10-18：之後另開對話處理）。

## ERP 客戶／廠商的銷貨銷退、進貨退貨改開視窗 — 0.9.6 Build 0（2026-10-18）

- 使用者實測：從客戶／廠商資料按「查此客戶的銷貨銷退單」「查此廠商的進貨退貨單」會換掉頁面上的資料，要再查一次。改為開視窗（`ErpPartyOrdersDialog`，自己的查詢工作，帶入頁面日期、可在視窗內改日期重查），頁面上的客戶／廠商資料保留。直接選「銷貨銷退單」「進貨退貨單」模式查詢的方式不變。
- 同批 CYERPAutoQuery V0.9.0 Build 3：報表「查無資料」訊息視為空結果（COPR16 無銷退時原本整筆失敗）、回報網路失敗會重試。
- [ ] PR CI、授權後合併與部署；實機驗收兩個視窗。

## 篩選列狀態計數 — 0.9.5 Build 0（2026-10-18）

- 依使用者核可的改版順序第 3 項（GPT 預覽的統計卡改為可點的篩選）：瑕疵、工單、委外、工作日誌的「全部狀態」下拉改為共用 `ui/data/StatusFilter` 狀態按鈕列，每顆顯示筆數與狀態色點，按一下篩選、再按一次或按「全部」取消。
- 後端：四個清單查詢在沒有 `cursor` 的第一頁回傳 `statusCounts`（共用 `worker/persistence/status-counts.ts` 的 `GROUP BY`），條件與清單相同（含工作日誌一般使用者只看自己），只排除狀態篩選；未新增路由、資料表或權限。`API_CONTRACT.md` 已記錄。
- Worker + D1 acceptance 新增瑕疵計數檢查（含作廢顯示切換、狀態篩選不影響計數、下一頁不帶計數），並確認改錯時會失敗。
- [x] [PR #197](https://github.com/simonliu1118-byte/chihyuan-web/pull/197) CI 全綠後合併 `a316b9b`，CY Web Deploy #235 部署成功。
- [ ] 使用者實機驗收。

## 狀態顏色統一與「下一步」提示 — 0.9.4 Build 0（2026-10-18）

- 依使用者核可的改版順序第 2 項（採用 GPT 預覽中「狀態顏色一致」與「下一步提示」兩點）。
- 單一顏色語意，定義在 `runtime/modules/status-flow.ts`：黃＝等這裡的人處理、藍＝進行中、綠＝完成、紅＝作廢、灰＝草稿／停用。瑕疵、工單、委外、工作日誌的清單與明細狀態一律改用共用 `StatusChip`；移除各模組自訂的 `cy-flow-status`、`cy-defect-status` 與重複的色票對照。工作日誌「已建檔」由黃改灰（草稿）、「待審核」由藍改黃（等審核人處理），使顏色代表同一件事。
- 明細上方新增 `NextStep`：依狀態寫出下一個要按的按鈕（例如瑕疵「確認問題後按『開始處理』」），完成狀態改為灰色說明，作廢沿用原有作廢提示不重複顯示。
- 頁面訊息：成功原本用黃色警告框、錯誤也是黃色。`useFeedbackMessage` 改帶語氣，成功為綠色、錯誤為紅色（錯誤仍同時跳提醒），六個業務模組改用共用 `FeedbackBanner`。
- 下一項：篩選列狀態計數（需新增後端計數 API）。
- [x] [PR #196](https://github.com/simonliu1118-byte/chihyuan-web/pull/196) CI 全綠後合併 `c20a398`，CY Web Deploy #233（run 39104072066）以同一 commit 部署成功。
- [ ] 使用者實機驗收。

## 按鈕轉圈與代工對象／BOM 操作 — 0.9.3 Build 0（2026-10-18）

- 使用者要求「儲存中…」這類動作提示也改用同一個轉圈：按鈕保留原文字，忙碌時以 `aria-busy` 在文字前顯示共用轉圈（`app.css`），取代 25 處「…中…」文字（存檔、ERP 查詢、登入／設定密碼／驗證碼／登出、帳號新增／登記／重新整理、備份、ERP 憑證、載入更多）；邊打邊選下拉的「搜尋中…」與單號視窗的「送出中…」改為共用 `Loading`，ERP 排隊／執行中的說明前加轉圈並保留說明文字。
- 流程按鈕原本整排變灰看不出是哪一顆在處理：新增 `ui/feedback/usePendingAction`，工單、瑕疵、委外、工作日誌、商品的流程按鈕只有被按的那一顆轉圈，其餘維持停用。開啟視窗的按鈕（撤回、審核、取消審核）不轉圈，由視窗內的確認按鈕轉圈。
- 使用者回報委外／代工的「代工對象／單價」與「BOM」頁沒有任何按鈕：後端新增／修改 API 早已存在，但畫面從未實作。新增 `OutsourcingMasterData.tsx`（`ContractorWorkspace`、`BomWorkspace`），取代原本只讀的兩段畫面：
  - 代工對象：新增、修改（名稱、類型、正式名稱、統編、電話、地址、備註、使用中、聯絡人）。
  - 代工單價：「設定單價」與每列「修改」，商品邊打邊選、計價單位只列該商品可用單位，沿用 revision 檢查。
  - BOM：新增、修改（代號、成品、產出數量／單位、使用中、料件邊打邊選與單位）。
  - 未存檔時切換頁籤、清單或模組會詢問；儲存後重新讀取共用清單，代工單表單的選單同步更新。
  - 刪除代工對象需工作區管理員且限從未使用者，本次未提供按鈕，改用「使用中」停用。
- 已知：代工單表單的料件仍是下拉加「篩選商品選單」，留待委外模組逐一整理時改成邊打邊選；頁面成功訊息仍沿用黃色提示框，留待第 2 項狀態顏色統一處理。
- [x] [PR #195](https://github.com/simonliu1118-byte/chihyuan-web/pull/195) CI 全綠後合併 `c5d671b`，CY Web Deploy #231（run 39103500583）以同一 commit 部署成功。
- [ ] 使用者實機驗收。

## 工單明細邊打邊選與整體檢視修正 — 0.9.2 Build 0（2026-10-18）

- 使用者要求工單明細商品改為邊打邊選，並整體檢視 CY Web。明細列改用共用 `EntityPicker`，移除「篩選商品選單」輸入框。
- 整體檢視修正：
  - 新增瑕疵／工單不再自動帶入清單第一位客戶與第一項商品（容易選錯），改為空白由使用者選。
  - 瑕疵、工單、委外、工作日誌存檔時缺必填欄位原本按了沒反應，改為提示缺哪一欄（工單、委外指出第幾列）。
  - 五個模組的預設日期原用 `toISOString()`（UTC），台灣 00:00–08:00 會變成前一天；改用既有 `taipeiToday()`。
  - 時間顯示原依瀏覽器語系（英文瀏覽器顯示 10/17/2026, 3:00:00 AM），改用共用 `formatDateTime`（台灣時區 2026/10/17 03:00）。
  - 手機刪除瑕疵／工單／代工單／日誌後自動回到清單；商品、瑕疵篩選與帳號頁權限選單補上可讀名稱；稽核篩選列的日期欄在 1440px 溢出 6px 已修正；帳號頁說明文字不再小於 12px。
- 使用者要求 Enter 不要直接儲存：紀錄編輯表單 Enter 依序跳到下一欄，最後停在儲存按鈕，再按一次才儲存；簡短視窗（原因、密碼、驗證碼）最後一欄 Enter 送出；多行文字保留換行；邊打邊選清單打開時 Enter 用來選取；Ctrl／⌘＋Enter 任何欄位直接儲存；查詢表單維持 Enter＝查詢。規則記於 [KEYBOARD_ENTRY_FOUNDATION](docs/architecture/KEYBOARD_ENTRY_FOUNDATION.md#data-entry-forms-092-user-decision-2026-10-18)。
- 整體檢視（前後端）另修：六個清單原本只顯示後端第一頁 100 筆、從未使用 nextCursor，超過 100 筆就看不到；新增共用 `useLoadMore`／「載入更多」，切換篩選時丟棄過期頁。
- 後端審查：API 入口與各路由均經 Identity／Module Access 或管理員角色檢查；寫入要求 JSON content-type、限制 64KiB，Session cookie 為 HttpOnly＋Secure＋SameSite=Strict；ERP 代理憑證以 SHA-256 雜湊保存並固定時間比對；金額數量全用定點整數；更新均帶 revision 檢查。`validate:d1:local` 17 組實際 Worker＋D1 驗收全數通過，未發現需修正的後端缺陷。
- 使用者同意刪除早期預覽：移除 `src/modules/customer/*`（未被正式頁面使用）、`preview/*` 與 9 支只檢查它們的驗證腳本（皆不在 `validate:source`／CI）。
- 使用者要求載入一律顯示轉圈：新增共用 `ui/feedback/Loading`（轉圈＋「載入中…」）。切換模組時的權限確認、六個模組首次進入（等第一頁清單讀完才整頁一次顯示）、點選清單讀明細（整個明細區改為轉圈，不再在舊資料上方顯示「更新客戶資料中…」）、設定／帳號／稽核／備份／CY 程式頁的讀取都改用它；清單重新查詢時筆數處顯示小轉圈。按鈕上的「儲存中…」等動作狀態維持不變。
- 使用者回報 ERP 客戶編號填不回去、找不到「更正」：移除客戶明細的「回填／更正」按鈕與獨立對話框，ERP 客戶編號改在「修改」表單直接填寫；儲存時先存基本資料，編號有變再以既有的編號變更 API（保留稽核與重複檢查）寫入，原因自動帶「ERP 建檔後回填」或「ERP 編號更正」。
- 使用者要求 CY 程式頁補上 CYERPAutoQuery：新增「SMART ERP 自動查詢工具」，圖示取自 AITeam 中央 `erp-autoquery/AutoQ.svg`（manifest 記錄 hash）；只接受 `cyerp-auto-query-vX.Y.Z` 與 `CYERPAutoQuery_VX.Y.Z.zip`。CYapps 目前尚未發正式版，先顯示「尚未發版」；尚無已確認版本的程式查不到 Release 時維持待發版、不算 `MISSING`，正式發版後每日 03:00 排程自動帶出版本與下載。
- 已知但本次未處理：`scripts/audit-account-portal.test.mjs` 需外部 cyapps 檢出，本機與 main 皆失敗；備份管理頁版面待備份工作結束後整理。
- [x] [PR #194](https://github.com/simonliu1118-byte/chihyuan-web/pull/194) CI 全綠後合併 `081413c`，CY Web Deploy #229（run 39099899777）以同一 commit 部署成功（validate-deployment-contract、deploy-development）。
- [ ] 使用者實機驗收。

## UI／UX 重整第二批 — 0.9.1 Build 0（2026-10-18）

- 原生 `window.confirm`／`window.prompt` 全部改用共用確認視窗與新的 `useFormPrompt` 表單視窗（商品、瑕疵、銷售工單、委外、ERP 連線憑證、帳號與權限）；多步 prompt 合併成一個表單，需填原因的動作寫明後果。商品、瑕疵、工單、委外的「放棄未儲存修改」改走共用 unsaved-change guard，與客戶、日誌一致。
- 瑕疵的客戶／商品、銷售工單的客戶改用共用 `EntityPicker`（邊打邊搜尋），移除「搜尋欄＋下拉」兩段式選擇。
- 稽核紀錄：查詢條件改為單列篩選列，點一列從右側抽屜看詳細內容。帳號與權限：「重新整理」移到頂欄、表單間距統一、畫面上的 Identity Admin／Module Access 改中文用語。
- 備份管理頁維持原樣，避免與進行中的備份工作衝突。
- [x] [#193](https://github.com/simonliu1118-byte/chihyuan-web/pull/193) CI 全綠後合併；[部署 39097850261](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39097850261) **success**，live **0.9.1**。
- [ ] 使用者以真實帳號驗收。

## UI／UX 重整 — 0.9.0 Build 1（2026-10-17）

- 使用者對 0.8.3～0.8.6 的精簡介面不滿意（字太小、元件仍大、流程不順），要求重新順過含 UX 流程。升 Y：全站版型、字級、操作流程都有明顯變化。設計重點與邊界記於 [App Shell 文件](docs/architecture/APP_SHELL_FOUNDATION.md)。
- 只改呈現與前端操作流程；API、權限、Module Access、guard、業務規則與資料不變。
- Build 1：使用者看過 Build 0 後比較三組主色，選定「商務藍」（淺 `#3D63D2`／深 `#9DBBFF`），只改主色 token。
- [x] Browser／Worker TypeScript、`validate:source`、build、Node regression（`audit-account-portal` 需外部 cyapps 檢出，main 上同樣失敗）；本機模擬資料 Chromium 1440／1024／390、淺色／深色截圖。
- [x] [#191](https://github.com/simonliu1118-byte/chihyuan-web/pull/191) CI 全綠後合併；使用者授權後以 main 執行 [部署 39062483770](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39062483770) **success**（deploy、health、HTTPS、Custom Domain、正式帳號入口 gates 全過），live **0.9.0 Build 1**。
- [ ] 使用者以真實帳號於桌機／手機驗收。
- 下一批見 0.9.1。

## 上線前提醒：啟用自動備份排程（使用者暫緩）

- [ ] **整體功能測試完成、準備正式上線前，提醒使用者啟用 CY Web 自動備份排程。** 使用者於2026-10-18明確要求在其他測試完成前先維持 `CF_BACKUP_SCHEDULE_ENABLED=false`；目前手動雙副本與GCS隔離還原已通過，排程尚未啟用。
- [ ] 屆時將 GitHub `development` Environment 的 `CF_BACKUP_SCHEDULE_ENABLED` 改為 `true`，保留既有Worker／主D1／Identity／R2／GCS及已使用的隔離驗證副本，從當前main受控部署；GitHub變數寫入API目前403，須由有權限的設定介面操作。
- [ ] 部署後核對 backup flag與UTC `30 19 * * *`（台灣每日03:30），並保留獨立catalog `0 19 * * *`；確認R2每日30天、GCS台灣週三／週日182天，manual／pre_restore雙副本。
- [ ] 觀察第一筆真實scheduled事件與provider verification／Audit；配置存在或手動成功不等於排程已執行。已使用的隔離副本不得清空重做。

## 新 GCS 憑證驗證 — 2026-10-18

- 使用者已回報在既有 development Environment 新增Web專用GCS JSON Secret與bucket變數；以main-only `audit-backup` dispatch實際驗證，不能只看設定存在。
- 新增只讀JSON／JWT／bucket IAM驗證：不讀寫object、不執行SQL、不部署、不開排程；僅輸出綁定存在boolean／required permission結果與stable code。GCS驗證成功與manual inputs／schedule是否啟用分開。
- [x] PR／CI合併後protected audit39056878172已驗新key及GCS所需四項object權限；真實雙副本與GCS隔離還原亦已通過，詳Build1驗收。

## GCS 真實 Worker 傳輸返修 — 0.8.7 Build1

- 真實manual R2已verified、GCS failed後，以actual workerd重現兩個Node mock看不到的原因：儲存bare fetch再以this.send()呼叫，native fetch的this錯誤，在送出Google請求前Illegal invocation；修正receiver後另重現workerd只支援manual/follow，不支援redirect=error。
- 改預設sender以globalThis.fetch呼叫；redirect=manual且顯式拒絕全部3xx，固定JWT／GCS端點、credentials不跟址、逾時／bytes界線保持。新增actual workerd default nativefetch／WebCrypto regression，模擬Google JWT→IAM→immutable upload→exact readback，另驗OAuth轉址只發一次、不送第二站；兩個CI都執行。合成key僅process memory，未使用正式key或資料。
- [x] 本機131 Node／typecheck／build／actionlint／Governance及獨立review通過；[#189](https://github.com/simonliu1118-byte/chihyuan-web/pull/189) CI全success，合併 `b8bcc57524466c085f3642be67b816c7d0e9bd9c`。授權發布 [39058825249](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39058825249) success，live **0.8.7 Build1／active72／100%**，原主D1／Identity／隔離目標不變。兩入口exact health／HTTPS／實際JS／HSTS／invalid Session獨立驗證通過，catalog cron回讀僅`0 19 * * *`。同項目返修，BUILD=1不另升Z。
- [x] 真人同事件GCS retry於台灣02:38:23成功，原manual仍97筆／33,064 bytes，雙端verified且errorCode=null；未重匯出。
- [x] 真人明確選GCS隔離還原，台灣02:39:55先建立104筆／34,359 bytes的雙端verified安全備份，再於固定獨立D1還原97筆。structured Audit started／verified有authenticated actor、provider=gcs、固定空目標與安全事件關聯，aggregate durable count=97；主D1binding保持，驗證副本保留。正式資料與實際資源識別值不進Public Git。

## 隔離還原入口與手動備份部署 — 2026-10-18（Asia/Taipei）

- Source **0.8.7 Build0**：基於 Claude 已合併的0.8.6畫面／記住我修正，補既有 SUPER_ADMIN 備份頁的隔離還原確認視窗、同源／嚴格JSON API與固定 `RECOVERY_DB`；可明確指定 GCS，不以健康 R2 的讀取代替 GCS 還原。GCS失敗只持久化固定allowlist診斷（auth／request／upload billing或denied／read／integrity），未知例外一律泛化；不保存provider原文。沿用單一 BackupService／portable restore／Audit owner，既有雙端安全副本、空白與同批次寫入再檢查、schema／Workspace／bytes核對不變。
- 受保護部署在 current-main guard 後準備固定獨立D1；相同名稱不足以證明owner，既有目標須已綁此Worker；與主D1同ID拒絕、非空目標保留且不升migration、不清空或自動換目標。建立成功但首次binding失敗後須owner核對，不能盲重跑採用。
- [x] GCS只讀audit [39056878172](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39056878172) 通過真實新key與四項object權限驗證；沒有存取備份內容。使用者已設定R2、手動啟用true、排程false三變數。
- [x] 舊source發布 [39057334816](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39057334816) 被 current-main guard 攔下，無遠端變更；改採最新main `b474f046073461a189aecc6fd8f150bb62a29875` 的 [39057509990](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39057509990) **success**，live **0.8.6／consumer1.0.5／active69／100%**。原主D1／正式Identity保持，R2與GCS Secret已綁定，`BACKUP_ENABLED=true`、`BACKUP_SCHEDULE_ENABLED=false`，全部部署health／HTTPS／portal gates通過。
- [x] 本機128 Node、14 migrations／17 actual Worker＋D1 checks（含chunked限量、GCS明確選取、同事件安全診斷／未知機密錯誤泛化）、Browser／Worker TypeScript、source、build、deploy config、actionlint／Governance及獨立source review通過；Chromium1280／390雙確認、預設GCS、busy不能關閉、單次執行／成功後refresh驗收無錯誤。
- [x] [#187](https://github.com/simonliu1118-byte/chihyuan-web/pull/187) head `8837348025e80d26ec71dc19cea04c2b673de7e6` 的遠端Runtime／部署合約／Governance均success，合併 `8cca0379a13b7392a1af6bcd0e3b91c3c4ab442a`；[39058390526](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39058390526) 發布success。live **0.8.7／active70／100%**，固定獨立RECOVERY_DB已建立／遷移／綁定，與主D1不同ID；主D1／Identity相同，manual=true、schedule=false。
- [x] 真實雙端副本／GCS隔離還原／雙端安全備份／reconciliation／Audit已通過，詳上節Build1驗收；原02:23:27事件的初始GCS失敗已在同事件retry補齊。

## Phase D 備份上線準備 — 2026-10-17（歷史準備；目前狀態見上節）

- Source **0.8.5 Build 0**（同步 Claude 已部署的0.8.4供應商／進貨介面後採下一個版號）：參考 CYACC 已啟用的 Phase D；原排程維持台灣 03:30、R2 每日30天／GCS週三週日182天，手動及還原前雙副本。移除 R2 複製失敗便停止的短路，讓跨雲副本獨立嘗試並保留原單次匯出／驗證／失敗稽核；補 GCS-only 成功提示。
- [x] 新增 actual Worker＋D1 故障回歸先在舊 source 重現 `ACCEPT_BACKUP_R2_OUTAGE_BLOCKED_GCS`；修正後17組驗收通過，含手動／還原前／週三排程的 R2 故障仍完成 GCS、R2-only 日不多跑 GCS，以及雙 provider 失敗不誤報成功。
- [x] 使用者已提供專用 Web GCS bucket 畫面；資源真名僅保留於受保護工作區。CYACC 目前 active240，具有 R2／GCS／RECOVERY_DB／通知 bindings；其已完成 Phase D 及正式 GCS 還原證據沿用原交接，不重新驗收或改動 CYACC。
- [ ] 受保護部署輸入：確認 Web GCS service-account Secret 設定位置、bucket IAM／lifecycle、既有 Web R2 owner。GitHub Secret 名稱API仍403，不能據此斷言 Secret 不存在或讀出其他 App 憑證。
- [x] 正式 D1 僅執行 aggregate SELECT，確認目前 durable rows 未超過500筆；0列寫入、不讀取業務內容。5MiB上限仍由真實匯出驗證。
- [ ] paired copy／隔離還原驗收及 production recovery 操作入口就緒後，再開啟備份排程；目前未啟用。500總筆數／5MiB exporter限制不得靠裁資料或清Audit規避。
- [ ] 本輪 source PR／CI／審查與符合啟用條件後的同目標發布。
## ERP 供應商查詢 — 2026-10-17

- 以 main `6c33b13`（0.8.3）開始 **0.8.4 Build 0**：使用者要求新增供應廠商（PURI01），頁面與流程同客戶。ERP 查詢入口新增「廠商」頁籤（廠商代號／廠商名稱／進貨退貨單，名稱只有一筆時直接查），新權限「ERP 供應商查詢」，migration 0014。進貨退貨單（PURCHASES，PURR18＋PURR22）版面同銷貨銷退單，退貨單接在原進貨單下並互相連結。ERP 查詢樣式改用 0.8.3 主題變數（原本模組 CSS 後載入、寫死淺色，深色模式按鈕與日期欄白底、連結深紅）；淺色也因此改為主題紫色。協定見 [ERP_ITEM_QUERY_BRIDGE_CONTRACT](docs/architecture/ERP_ITEM_QUERY_BRIDGE_CONTRACT.md#供應廠商查詢v084)。
- [ ] PR CI、使用者授權後合併與部署（含 migration 0014）；部署後才發 AUTO V0.9.0 測試包（舊 CY Web 會拒絕含 SUPPLIER 類型的 claim）。
- [ ] 實機：PURI01 代號與名稱、進貨退貨單經 Web 驗收。

## Cloudflare 發布流程整理 — 2026-10-17

- 初始以 0.8.0 準備流程 PR，現已同步含 HTTPS 修正的 0.8.2 main：合併不部署、手動 deploy 限 main、同正式目標固定鎖且不取消進行中的 deploy；驗證／audit 分鎖。migration 前檢查當前 main ancestry 與完整 tracked tree，保留發布分支歷史 merge。產品 VERSION／BUILD 不變。
- 操作、非 fast-forward／相同 SHA 的處理方式與成功判定見 [既有網站發布操作](docs/development/IDENTITY_DEPLOYMENT.md#existing-portal-deployment-gate)。不把 PR validate 成功視為已部署。
- [x] [#178](https://github.com/simonliu1118-byte/chihyuan-web/pull/178) 已合併；使用者授權後，以 main dispatch [39008172352](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39008172352) 完成首次新模式發布。current-main guard、deploy／health／portal／schedule 全成功；保留原 Worker／業務 D1／正式 Identity，未啟用備份或切換 authority。
- [ ] 補齊 GitHub 設定名稱／scope 的現行 read-back，才搬移 metadata；目前 API 403 不等於設定不存在。CY Web 備份的既有 bucket owner、GCS 配置與隔離回復另批驗收；Invoice 相關修改等待 D1 新基準。

## HTTPS 入口與備份配置 — 2026-10-17

- Source **0.8.2 Build 0**：正式 HTTP 頁面、靜態檔與 API 在任何 binding／body 處理前轉同 host/path/query 的 HTTPS；HTTPS 回應加入一年、僅限目前 host 的 HSTS。localhost／127.0.0.1／[::1] 保留原 HTTP 開發。
- 根因是原本只有 `/api/*` 先經 Worker；部署／本機設定改為所有請求先經同一入口，再由 ASSETS 提供原 SPA／檔案，API 不回退 HTML。所有靜態請求因此增加 Worker invocation，未改共用 Zone、Identity authority、業務 schema 或備份啟用狀態。
- 已補正式網域及 workers.dev 的部署後 HTTPS／HSTS／實際 JS 資產驗證；使用同一 run 的有界 propagation 觀察。操作與配置步驟見 [IDENTITY_DEPLOYMENT](docs/development/IDENTITY_DEPLOYMENT.md)。
- [x] [#180](https://github.com/simonliu1118-byte/chihyuan-web/pull/180) CI／合併及授權部署完成；[正式部署 39008172352](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39008172352) 於 **2026-10-17 13:59:43 Asia/Taipei** success。部署來源 `f70cc561d1f373a93381eb93a0ab59103371af9b`，**0.8.2／consumer1.0.5**，雙入口 exact health、HTTP→HTTPS、HTML／built JS MIME／HSTS、invalid Session 401／清 cookie、catalog schedule 與 canonical production Identity strict gate 均通過。
- [x] 本機合併後 110／110 Node regression、localhost HTML／API／模組驗收通過；Cloudflare 回讀原 Worker active67／100%，原業務 D1／Identity 與備份 opt-in contract 保持。獨立 HTTPS 頁面／JS／API HSTS、exact source 與 invalid Session 回讀通過；本機代理關閉 plain HTTP socket，HTTP redirect 使用本次部署 runner 的成功證據。
- [ ] 正式帳號的 Email 驗證／recovery 真人驗收仍待原流程追蹤；本次沒有寄信、建立真實 Session 或操作正式還原。
- [ ] 備份：確認核准的 R2 owner、GCS bucket 與受保護 credential 設定位置；目前此雲端沒有 GCS 綁定，GitHub 設定清單 API 仍受 integration 403 限制，未將缺讀取權限當成不存在。
- [ ] 正式隔離還原：已有 `BackupService.isolatedRecovery` 與 local runner 驗收，production API 目前僅 list/create/retry；需受控操作入口與隔離空 D1 目標接線，再驗證真實雙 provider 備份／還原，最後啟用備份排程。既有 03:00 catalog cron 不代表備份已啟用。

## ERP 單筆憑證視窗與金額 $ — 2026-10-17

- 以 main `e2d8e19`（已部署0.8.0）開始 **0.8.1 Build 0**：使用者實測未收款後要求金額加 `$`，並可點憑證在視窗查該張銷貨／銷退單（不離開未收款頁）。
- 新 `ORDER` 類型（migration 0013）、`ErpOrderDialog` 自有短工作、`ErpQueryRows` 增加呼叫端自訂儲存格；`erpMoney` 統一金額格式。
- [x] Worker／Browser TypeScript；ORDER 權限（客戶或未收款其一）、23x／24x 限制、單號歸屬與金額格式 regression；本機合成 browser 1280／390px 點憑證開視窗、關閉後未收款保留、無 runtime error。
- [x] 手機頁首（使用者回報）：說明按鈕由 44px 縮為 32px，連線狀態按鈕只顯示「未連線／已連線」（aria-label 保留「連線憑證」），與標題同列；本機合成 320／390px 頁首單列、無橫向溢出。
- [ ] PR CI、部署（含 0013）與真人驗收；需 CYERPAutoQuery V0.7.2。

## ERP 客戶、銷貨銷退單、未收款與商品成本權限 — 2026-10-17

- 以 main `31812ea`（已部署0.7.37）開始 **0.8.0 Build 0**：使用者要求把 CYERPAutoQuery V0.5～V0.7 的客戶（COPI01）、銷貨銷退單（COPR15＋COPR16）與未收款（ACRR18）接上 CY Web；升 Y 因新增三類使用者明顯可感受的查詢能力與權限。
- 單一「ERP 查詢」入口；桌機頁籤、手機下拉（使用者決定）。權限依資料敏感度分三個查詢權限＋「ERP 商品成本」（決定標準進價可見）；未收款有權限即可查客戶／業務員／全部，日後再細分；銷貨銷退單日期規則同歷史異動。
- 一個 job owner（`useErpJob`）供三類共用；銷退↔原銷貨單連結、未收款分組小計在 CY Web（`shared/erp-sales-links.ts`）。協定見 `docs/architecture/ERP_ITEM_QUERY_BRIDGE_CONTRACT.md` V0.8.0 節。
- [x] Browser／Worker TypeScript、完整 build、validate:source（12 migrations）；新增 Worker／SQLite regression（各類型權限、欄位白名單、Agent queryTypes 派工、SALES／RECEIVABLE 歸屬檢查、標準進價儲存與讀取過濾）與連結／分組測試。
- [x] 以 CYERPAutoQuery 實際產生的六種 complete body 回灌本 Worker 全部接受（跨 repo 契約核對，未提交 fixture）。
- [x] 本機合成 browser：1280px 頁籤／銷退縮排連結、390px 下拉／未收款分組、客戶名稱清單，無橫向溢出與 runtime error；未操作正式帳號或真實 ERP。
- [ ] PR CI、部署（含 0012 migration）與真人 ERP 驗收；需搭配 CYERPAutoQuery V0.7.1 以上（測試階段不做向下相容，舊版 Agent 無法領取工作）。

## 配色已確認，下一步討論版型 — 2026-10-16

- [x] 使用者選定「石墨靛藍」作深色版，再補「霧白靛藍」淺色版，並確認「顏色改這樣比較好看，再來是版型」。色票與設計邊界記於既有 [App Shell 文件](docs/architecture/APP_SHELL_FOUNDATION.md#confirmed-colour-direction--2026-10-16)，兩版預覽 source 一併保存於 `docs/design/cyweb-indigo-light-dark.html`，合成資料且不進 runtime。
- [x] 釐清先前說法：酒紅色不是已確認的 CY 家族品牌色，只是現行 Web 暫定配色。金色／銅色角色識別及狀態色保留；不因本輪 Web 選色修改 family-wide canonical。
- [ ] **下一步：先給版型設計方案。** 桌機／平板／手機、導覽與頁首、表單及資料區配置仍待討論；預覽橫式導覽不代表定案，不能遺漏管理／工具入口。主題切換／預設／偏好保存方式也待定。
- 正式程式及網站仍為已部署 **0.7.37**，PR174／175已合併；新配色目前只完成設計，尚未實作、合併產品程式或部署。本輪依使用者要求先保存文件，不開始版型或配色實作，也不重做舊 ERP 橋接草稿。

## 共用頁首／手機導覽／ERP 搜尋與歷史日期 — 2026-10-16

- 以最新 main `b5de6b3`（已部署0.7.36、PR169～173）開始本輪 **0.7.37 Build0**；舊本機ERP橋接草稿不併入。現有品號／品名、批號／歷史、Agent與Module Access owner沿用。
- 原六業務模組及ERP入口與管理區以分隔線區分，移除「業務／管理」小標、保留「工具」。共用頁首標題由16px加大至20px；說明沿用Dialog的無可見標題變體，只顯示文字與關閉控制，仍保有accessible name／Esc／焦點復歸。
- 共用AppShell以820px的presentation條件，單一導覽內容選擇桌機sidebar或手機Drawer；同一headerActions選擇桌機帳號區或手機帳號Modal，非雙DOM複製。保留原navigation guard及角色金／銅色；手機明確block外殼取代滿版auto-grid導覽空白。
- ERP搜尋類別下拉目前提供已支援「商品」；下方品號／品名切換，輸入欄上方不重複label，placeholder隨模式變化；所有寬度維持右側查詢按鈕。原生日期欄位位於歷史開關下面；額外類別待其正式能力加入，不提供假客戶查詢。
- 同一shared date owner涵蓋全介面與Worker：三個曆年周年當天允許、下一天拒絕；去年同月同日至臺北今天為空日期預設，修正舊+1天與閏年反向比較問題。ERP清單統一一個table/card presenter，每頁25筆；手機歷史摘要可展開，無第二業務資料流／observer／retry。
- [x] Browser／Worker TypeScript；shared日期與actual Worker/SQLite regression（超三年400且零工作、周年202與預設日期持久化）通過。
- [x] 完整source contracts（11 migrations／52 tables）、Worker/assets build、68項Node regression；AITeam共通檔與CYID canonical Git blob、consumer window核對通過。
- [x] 本機合成browser：Desktop標題20px／說明無可見header、超三年中文Modal；390px收合導覽／Esc／帳號Modal、品名25筆card分頁與點品號新工作；320px修正原生日期造成的grid min-content撐寬，320／768px無表單內或頁面橫向溢出。原生日期與空白最近一年結果確認，未操作正式帳號或真實ERP。
- [x] [PR #174](https://github.com/simonliu1118-byte/chihyuan-web/pull/174) exact head `dd62e704cb71238ce896423db0c27fb2e98a05f8`：Governance `38910610889`、Runtime `38910611048`（四jobs／actual isolated Worker+D1）、deployment contract `38910611136` 全通過；合併 `c33a74aa57d8277fc6629be061e668c8eabefccc`。PR未執行真部署。
- [x] [原網站部署 38910827315](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/38910827315) attempt2於 **2026-10-16 21:52:13 Asia/Taipei** 完成。Deployment `9dfede0054fb76ad16a9102a8d660e529373663b` 雙parent向前推進，tree `c034d620b18543f7a49ee8a5dc5885a05842b1bf` 與已驗main完全相同；原Worker、每日cron、雙入口 exact source/consumer/D1、invalid Session及正式Identity strict gate全通過。attempt1最後唯讀稽核回報 `CYWEB_AUDIT_SNAPSHOT_CHANGED`；未改動或略過guard，原提交重跑後通過，不推定第一次變動來源。
- [x] 獨立公開回讀 **0.7.37／consumer1.0.5／9dfede00／D1 ok**；正式HTML載入bundle包含搜尋類別、收合模組選單及三年中文限制。未新增migration／binding／authority；真實ERP與新增介面的真人操作仍由既有人工驗收追蹤。

## CY 程式補列 ERP 自動輸入工具 — 2026-10-16

- Source **0.7.32 Build 0／consumer1.0.5**：補列 CYERPAutoInput，顯示「SMART ERP 自動輸入工具」，沿用中央正式 Auto SVG、正式 `cyerp-auto-input-v0.2.9` 與 `CYERPAutoInput_V0.2.9.zip`。程式說明依上游 README 描述平台訂單匯入、銷貨單自動輸入與依設定儲存／列印；此工具與 CVT 說明均不使用「鼎新」。
- 維持每日03:00單一 producer；新增程式會以已確認 source snapshot 補入舊共用清單，現有成功版本保留，新清單等待每日排程，不因部署／開頁額外查詢 GitHub。不新增狀態 owner、render path 或資料表。
- [x] 正式 ZIP HEAD 回200／156847952 bytes（未下載執行）；中央 Auto SVG byte/hash 記錄、共通規則與 CYID canonical byte 核對通過。Browser／Worker TypeScript、14項 catalog regression、完整 build、全部 source contracts 通過。新增正式產品 tag／asset 與 OCR 模型排除、舊清單補新程式與無當日重試驗收。
- [x] 本機合成 USER Desktop：九項清單、新工具正式圖示／V0.2.9／日期／下載、CVT 說明與整頁無「鼎新」確認。未登入正式帳號或操作業務資料。
- [x] [PR #167](https://github.com/simonliu1118-byte/chihyuan-web/pull/167) exact head `cd47e97fed42dd1a591db6fcd544fd7b309cc2dd`：Governance `38844904852`、Runtime `38844904920`（四jobs／actual isolated Worker+D1）、deployment contract `38844904854` 全通過；合併 `162d9d9887a57c230932566936916163e296033a`。PR未執行真部署。另於390px手機確認同一程式卡片／說明且無橫向溢出。
- [x] [原網站部署 38845036800](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/38845036800) 於 **2026-10-16 11:22:00 Asia/Taipei** 完成。Deployment `6832a9a679a472f4af7f08027cca16cb8d39c5e8` 雙parent向前推進，tree `ed44bc34cf69549b2a2744901b7013e95e322d83` 與已驗main完全相同；原Worker、每日cron回讀、雙入口 exact source/consumer/D1、invalid Session與正式Identity strict gate 全通過。未新增 migration／binding／authority。
- [x] 部署後獨立公開回讀 **0.7.32／consumer1.0.5／6832a9a6／D1 ok**，實際前端bundle含 Auto 正式圖示。名稱／說明／下載由 authenticated API 回傳，部署證據為 exact source＋actual Worker/D1 regression＋合成 Desktop/Mobile browser，未登入正式帳號。首個真實每日排程仍預定2026-10-17 03:00；本輪不額外觸發 GitHub 更新。

## CY 程式每日自動更新 — 2026-10-16

- Source **0.7.31 Build 0／consumer1.0.5**：依使用者要求移除「更新版本」按鈕，改為台灣時間每日凌晨 **03:00**（UTC `0 19 * * *`）由伺服器查詢正式 Release。頁面只讀取共用清單；持續開啟的頁面在下次排程後讀取一次結果，卸載會取消讀取與計時器。
- Mutation owner 為 scheduled handler → catalog service；新增 `0008_program_catalog_state.sql` 單列 D1 公開 metadata cache，以原子每日 claim 與 completion token 防止跨執行個體重複查詢及舊結果覆寫。每個排程日最多一批有界查詢；失敗保留最近成功清單、不於當日重試。第一次排程前明示等待自動確認。
- State owner 為 D1 cache，前端沿用單一 ProgramCatalogView／FeedbackProvider。此 cache 不含帳號／業務資料、不改 Identity authority，排除於 portable business backup 與 schema fingerprint，既有備份相容性維持。原選用備份排程仍獨立於每日清單排程，不會被清單排程觸發。
- [x] 本機 Browser／Worker TypeScript、完整 build、全部 source contracts（8 migrations／49 tables）、60項 Node regression 通過，包含真實 SQLite 原子 claim／跨日恢復／stale completion fencing／讀取不查 GitHub、舊備份 fingerprint、排程分流與部署後 schedule 驗證器。
- [x] 本機合成 USER browser 確認無「更新版本」按鈕、每日03:00說明、首次等待狀態與原版本／下載清單。未操作正式帳號或業務資料。
- 本機 actual Wrangler+D1 runner 缺少 npx，完整隔離 Worker+D1 與 POSIX deployment-config 權限檢查交由 required Linux CI；本機 SQLite 回歸不代替 actual D1 驗收。
- [x] [PR #165](https://github.com/simonliu1118-byte/chihyuan-web/pull/165) exact head `186a2b872df35131960c8c7534cf3b9b60560e74`：Governance `38844156966`、Runtime `38844156968`（四jobs／actual isolated Worker+D1／daily catalog regression）、deployment contract `38844156972` 全通過；合併 `81bbb488a31563ff125511ed2cf590bff81587df`。PR未執行真部署。
- [x] [原網站部署 38844282570](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/38844282570) 於 **2026-10-16 11:13:10 Asia/Taipei** 完成。Deployment `0bb171bc8b5948c3fb9faa9eb097dbb6971c1264` 雙parent向前推進，tree `1709489059bc45663ba5828874c4c9587883b06f` 與已驗main完全相同；migration、原Worker部署、protected runner 回讀實際每日 cron、雙入口 exact source/consumer/D1、invalid Session與正式Identity strict gate 全通過。
- [x] 部署後獨立公開回讀 **0.7.31／consumer1.0.5／0bb171bc／D1 ok**；實際載入的前端bundle包含每日03:00與首次等待說明。首次真實排程預定 **2026-10-17 03:00 Asia/Taipei**，尚未發生；不宣稱已成功取得 GitHub 最新資料或已根治外部 quota。

## CY 程式清單更新與名稱 — 2026-10-16

- 使用者回報「更新版本」出現紅／黃重複提醒；程式以 `current=false` 明示保留已確認 snapshot，但頁面又將同一次 failure 顯示為紅條。移除 page-local error state／紅條，沿用單一 FeedbackProvider 中文 Dialog；關閉後只保留既有黃色 snapshot 狀態。提醒區分 RATE_LIMIT、一般 HTTP403、NETWORK/TIMEOUT 與不完整回應，不將所有403都稱為限流。
- 截圖沒有顯示這次 `refreshFailure` 分類，不能僅從畫面斷定當次原因；先前線上 RATE_LIMIT 證據仍保留。既有五分鐘成功 cache、provider cooldown、最近成功版本保留與 no-retry 路徑不變，不宣稱永久消除外部限流。
- Source **0.7.30 Build 0／consumer1.0.5**：加入已正式發版的 `smartcopiconverter-v1.0.1` tag／compiled ZIP 規則；原本沒有規則，即使 live lookup 成功也維持未發版。公開 Release metadata 確認非 draft／prerelease，ZIP HEAD 跟隨正式下載回200、2447073 bytes；未執行程式。
- 公開 Release fallback snapshot 同步至本輪已確認的 Accounting Web0.22.15、Accounting1.3.0、Invoice2.6.19、TriINVCalc1.5.6、Converter1.0.1；同一 reader 從本機真實匿名 GitHub 取得 `current=true` 且正確版本。這不代表 Cloudflare 出口的 quota 永久恢復。
- 顯示名稱改為「電子發票工具」「信封套印工具」「盲浮水印工具」；共用 catalog 同時供 table／card，維持內部穩定 ID 與圖示。信封／浮水印工具仍無公開正式 Release，不提供猜測的下載。
- [x] Browser／Worker TypeScript、完整 build、全部 source contracts 與47項 Node regression通過。新增 converter exact tag/asset／缺新ZIP不得借用舊ZIP／draft/prerelease/untrusted link、table/card名稱與單一狀態、中文 failure分類；既有 actual catalog route／reader／cache cooldown/recovery regression一併執行。
- [x] 本機合成 USER browser：更新成功→限流彈窗→關閉只一條黃狀態／無紅條→一般403不誤稱限流→恢復後清除警示；Desktop converter版本／日期／下載、三名稱與390px手機卡片無橫向溢出通過。沒有登入正式帳號、異動權限或正式資料。
- [x] [PR #163](https://github.com/simonliu1118-byte/chihyuan-web/pull/163) exact head `22a0e9c319f825137b1e161a37807cb46dcb9d8f`：Governance `38841551777`、Runtime `38841551769`（四jobs／actual isolated Worker+D1／新增catalog regression）、deployment contract `38841551742` 全通過；合併 `0d5f4e2f8fdad700de634f4ac22d4d25f3cd5ea2`。PR未執行真部署。
- [x] [原網站部署 38841704073](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/38841704073) 於 **2026-10-16 10:42:45 Asia/Taipei** 完成。Deployment commit `107dda04936975b457cd196d3d1d5138ed52c0df` 雙parent向前推進，tree `b08b0ccc9c8dc65786492cae9728c649615d982c` 與已驗main完全相同。原Worker部署、雙入口 exact source/consumer/D1、invalid Session與cookie clearing、正式Identity strict gate 全通過；未新增 migration／binding／authority。
- [x] 部署後獨立公開回讀 **0.7.30／consumer1.0.5／107dda04／D1 ok**，正式頁面載入的前端bundle包含新分類提醒。程式名稱／下載由已登入API回傳，不內嵌在前端bundle；其部署證據為 exact source＋Worker/catalog regression＋合成 browser，未登入正式帳號或宣稱已驗收 Cloudflare 真實 quota 恢復。

## 主動同步登入與撤權 — 2026-10-16

- [x] 使用者確認「帳號與郵件完整驗收 OK」及「真實角色與權限驗收 OK」；作為本輪真人總體驗收結果，沒有另行推定未逐項記錄的裝置／故障組合或 CYACCweb 驗收。
- 使用者回報撤權只能在下一次操作得知，已選定：**單一模組撤權 → 退出該模組並跳中文提醒；帳號停用／登入失效 → 返回登入頁**。
- Source **0.7.29 Build 0／consumer 1.0.5**：AuthGate 統一持有 principal／Module Access snapshot，前景每 30 秒與 focus／visibility return／online 確認；每次只一筆、有十秒期限／一秒合併間隔、隱藏暫停排程、卸載 abort／stale fencing。沿用 `/auth/me` 的可選 Module Access expansion 與既有 app-local service；無新增 Session authority／heartbeat table／業務重試。
- 確認 active module 撤權時先 render gate／unmount，取消未完成 dirty navigation，再強制返回仍可使用的帳號頁；共用中文 Dialog 指出模組及未儲存內容不會送出。其他模組撤權只更新導覽；管理角色失去必要權限時退出管理頁。保留 server 每次 protected operation 的即時拒絕。
- Protected 401／403 只發出 authority refresh signal，不自動重送 mutation。503／斷線／不完整 snapshot 不視為撤權或登出，保留當前內容並一次提醒，恢復後重新確認；卸載頁面的延遲錯誤不蓋過撤權提醒。
- [x] 本機 Browser／Worker TypeScript、完整 Worker+assets build、全部 source contracts、43 項 regression 通過；新增 monitor cadence／hidden／deadline／stale／logout fencing、combined route current grants／inactive member／SUPER_ADMIN／invalid Session／outage、API denial signal／no retry 測試。Windows 不適用的既有 backup schedule test 仍由 Linux CI 驗收。
- [x] Chrome 合成 API 六情境：idle 撤權／dirty editor＋pending navigation取消、非 active module 撤權保留欄位、invalid Session 回登入且停止檢查、503 保留欄位並僅一次提醒／恢復後撤權、protected403 提早重新確認與精確彈窗、一般 action403 不誤撤權；零業務 mutation，無真實帳號操作。
- [x] 中央契約更新先獨立同步：[治理 PR #160](https://github.com/simonliu1118-byte/chihyuan-web/pull/160) exact head `eaedc989ab73835350dd046bdb10972daef86341` Governance `38780595302`／deployment contract `38780595293` 通過並合併 `056abb96b9aeba14444b5159e6b52fe7b5e96fda`。七項 canonical package 鏡像更新至 1.0.6；本輪 consumer 仍 1.0.5，在 1.0.0–1.0.6 支援窗內，未引入私有通知功能或部署。
- [x] [功能 PR #161](https://github.com/simonliu1118-byte/chihyuan-web/pull/161) exact head `5eb11023380a34c90cf77ed5b1d966e0461e3faf`：Governance `38780977595`、Runtime `38780977593`（四 jobs，含新增回歸與 actual isolated Worker/D1）、deployment contract `38780977670` 全通過；合併 `c13c28f33c0e51a5941c68bec451cc42479cc985`。PR real deploy skipped。
- [x] [原網站部署 38781263296](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/38781263296) 於 **2026-10-16 01:56:24 Asia/Taipei** 全部完成。Deployment commit `d242702c6e6989207c96793454a1e373f1a83c3b` 由前部署與已驗 main 雙 parent 向前推進，tree `61036e4574af292149566b3683e454fcdac6bcf8` 與已驗 main 完全相同。原 Worker deploy、雙入口 exact source／consumer／D1 health、invalid Session/cookie clearing及 canonical production Identity strict gate 全通過；沒有新增 migration、Worker 或 authority。
- [x] 部署完成後獨立回讀正式入口 **0.7.29／consumer1.0.5／d242702c／D1 ok**，無登入 Chrome 確認原中文登入與 Enter 行為；零登入 POST。部署進行中獨立首次健康讀取仍為 0.7.28，於同一 run 完成後已轉新 source，未重新部署；不宣稱歷史 propagation 問題已根治。
- [ ] 使用者重新整理後確認本輪主動撤權的間隔與中文提醒；既有帳號／郵件與角色／權限驗收維持已完成，不要求重做全部流程。

## 帳號介面與全站中文錯誤提醒 — 2026-10-15

- Source **0.7.28 Build 0／consumer 1.0.5**：登入標題改「志遠企業管理系統」、員工編號 Enter 使用既有鍵盤 foundation 移至密碼、忘記密碼置中；右上帳號按 CYACCweb 相同 Workspace Role 與色值顯示金色超級管理員／銅色管理員。
- 使用者帳號標題右側只保留「新增使用者」，既有共用 Dialog 內填寫編號／姓名／電子郵件／權限；一般 ADMIN 仍只能建立 USER。busy lock、dirty guard、錯誤保留輸入及關閉後焦點回復；刪除確認移除空 body，僅保留一條分隔線。
- 使用者已確認截圖的新增失敗是 **3001 與既有超管編號重複**，不是 Workspace 殘留；不修改 CYID／Workspace／刪除語意，不刪真人帳號或清理資料。
- 單一 FeedbackProvider 沿用共享 Dialog，涵蓋登入、帳號／權限、六業務模組、設定／Audit／備份／程式清單的失敗提醒；API browser boundary 統一中文錯誤與欄位訊息，未知英文／診斷碼只顯示安全中文。保留 status/code/requestId 供既有程式判斷，不把所有 409 都誤報為 stale。原生表單驗證亦改中文彈窗，無請求攔截、observer 或第二業務 authority。
- 驗證信初寄／重寄／資料修改後的部分寄送失敗不再誤報已寄出；備份未完整驗證、程式版本 fallback 亦明確提醒。沒有真寄信或真實備份操作。
- 本機 browser/Worker TypeScript、完整 Cloudflare Worker+assets build、目前 required source contracts、既有 31 項可在 Windows 執行的回歸，以及中文 message/API boundary tests通過；Desktop/Mobile 合成 API 瀏覽器測試涵蓋登入 Enter、重複錯誤、表單保留、dirty guard、刪除取消／確認與刷新、原生 required、角色顏色／ADMIN 限制、十個頁面載入錯誤及手機視窗。合成證據不等於真人帳號／收信驗收。
- 為通過既有 Cloudflare plugin peer requirement，Wrangler 最小相容修正至 4.141.0；未改部署 owner／binding／D1／權限。
- [x] [PR #158](https://github.com/simonliu1118-byte/chihyuan-web/pull/158) exact head `25d907bb4137e236f185c591d433875e7d177a23`：Governance `38748796856`、Runtime `38748796855`（四 jobs，含 feedback suite／actual isolated Worker+D1 acceptance）、deployment contract `38748796781` 全通過，PR real deploy skipped；合併 `b67324a74dc1b176e0717188eb256891e0fc7688`。
- [x] 使用者本對話明確批准部署後，[原網站部署 38749325020](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/38749325020) 於 **2026-10-15 22:13:51 Asia/Taipei** 完成。Deployment commit `810a29abd043421f946fa52fc874fe7ecd5c642d` 為原部署 ref 與已驗 main 的雙 parent，tree `67964154d7059bcc4875b0497ba2b4acf32e6562` 與已驗 main 完全相同；無 force update。原 Worker deploy、雙入口 exact version/consumer/source/D1 health、invalid Session cookie clearing、原 canonical production Identity strict gate全部通過；沒有新增 migration、Worker 或 identity authority。
- [x] 部署後另以公開健康端點回讀 **0.7.28／consumer1.0.5／810a29ab／D1 ok**；正式網站無登入 browser 目視及自動確認中文標題、忘記密碼置中、員工編號 Enter 移至密碼，零登入 POST、未輸入真實密碼。登入後角色／帳號操作仍以本輪合成測試及待使用者實測清楚區分。
- [x] 使用者已確認帳號與郵件完整驗收、真實角色與權限驗收 OK（2026-10-16）；本輪新增主動撤權處理另列上方。首次業務上線前的 testing deletion/Audit 恢復 gate 維持下列既有項目。

## 測試期帳號刪除與寄信入口 — 2026-10-15

- 使用者批准測試期可刪除已驗證帳號，暫停新增／刪除Identity Audit；中央能力與恢復條件以CYID canonical consumer standard §17.2為準，不在Web另建帳號authority。
- Source0.7.27／consumer1.0.5：沿用帳號列表與DELETE代理，僅在provider明確回傳testingAccountDeletionAllowed=true且目前為Super Admin時，顯示已驗證帳號刪除；缺少能力仍維持pending-only。使用共用ConfirmDialog「確定刪除帳號／保留帳號」，刪除結果確認後才刷新清單；新增提示明確寫從CYWEB用信中一次性密碼完成驗證；移除登入／首次驗證頁共用底部灰色技術說明。
- [x] Web 0.7.27／consumer1.0.5：PR #156／#157 已合併，部署 `38717773511` 雙入口 health 與 production Identity strict gate通過；CYID0.3.9 production `38718039836` validate/deploy/version/session-rejection通過（2026-10-15 18:08 Asia/Taipei）。未刪任何真人帳號／重寄Email。
- [x] 使用者已回報帳號與郵件完整真人驗收 OK（2026-10-16）；本對話沒有逐項細節，不另宣稱所有刪除／重建／故障組合都有獨立證據。
- [ ] **業務第一版前**依CYID TODO恢復已驗證不可刪及新增/刪除Audit，更新Web契約mirror並驗收刪除入口隨provider能力關閉；保留既有business history，不將舊projection或Module Access轉給重建帳號。

## CYACCweb 首次登入入口交接 — 2026-10-15

來源：使用者提供的 CYACCweb first-login handoff／Draft CYapps #435（81cc5fcc），既有 production #38675354003 曾回 `CYWEB_PRODUCTION_AUTHORITY_MISMATCH`。本輪專用 branch 與 CYInvoice Draft #151 分開；不修改帳務 D1、CYInvoice source 或已部署 provider authority。

- [x] 核對 source：根 TODO 仍稱 admin portal 為 development；唯一 Web deploy owner 是既有 development workflow。不能只從 Worker 名字推定哪端該換綁定，當時尚未批准原系統完整切換；其後授權見下方。
- [x] 實作既有 workflow 的 `audit-identity` 唯讀操作：原受保護 environment、原憑證，GET-only 讀 domain → Worker → IDENTITY／D1 metadata／health；沿用 CYapps canonical production resolver 與 `requireProductionCoreConsumer`，不複製新 readiness authority。只輸出 boolean／正常化版本／stable code／時間，不輸出正式名稱、ID、token 或設定。
- [x] 本地八項回歸通過：中央 actual resolver／guard、authority/workspace/health mismatch、Identity DB隔離／業務 DB collision、unsafe URL／多網域、audit期間 drift、GET-only與 credential 不外送、audit operation 不進 deploy job；workflow YAML parsed。
- [x] [PR #152](https://github.com/simonliu1118-byte/chihyuan-web/pull/152) exact head `f13f4772884a10b8ee4fc9ec6ac1027066b400b7`：Governance `38693643909`、Runtime `38693643966`、部署契約 `38693643912` 通過，合併 `9b3fbb514beba5393978bc1de8b1e51b3fb393de`。未部署。
- [x] [唯讀稽核 run 38693835413](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/38693835413)，2026-10-15 **14:41:22 Asia/Taipei**：原受保護 environment 執行，audit success、deploy-development skipped、mutationPerformed=false。canonical production provider／獨立 Identity D1 metadata／portal managed domain與 business D1 metadata 都驗證；Workspace／core App／consumer1.0.4／health符合。**Portal Worker、business D1與 IDENTITY 全部仍為已設定 development；productionPortalReady=false、CYWEB_PRODUCTION_AUTHORITY_MISMATCH。** 不是 CYACC 應改用 development provider，亦不能將audit job綠燈視為修復。
- [x] **使用者 2026-10-15 17:09 明確批准：全部模組可直接開放，沿用既有 Module Access，由使用者限制其他員工。** 不新增 account-only 模式、UI／API 開關、另一 Worker 或第二登入。不自動新增／撤銷 grants、重播 Identity authority、清理測試資料或搬動帳務。
- [x] Source **0.7.26 Build 0**：原 deploy owner 每次 render 前先以 canonical production resolver＋原唯讀 audit核對同一 Worker／同一 business D1／Workspace／core App／health，僅接受已批准的 authority mismatch或已修正狀態；注入正式 Identity target，後續部署不回退 development。原 CF_IDENTITY_SERVICE 值只作 canonical production lookup seed，實際輸出 Binding 一律經正式 runtime核對。部署後原 canonical strict gate 必須通過。歷史 GitHub environment／deploy ref 名稱仍保留，不另建部署 owner。
- [x] 本地十二項 actual-canonical audit／runtime 回歸、四項首次登入 route/adapter regression、既有Identity tests、source contracts、Browser／Worker TypeScript及完整build通過。成功首次驗證必須明確回 emailVerified／passwordChanged／reloginRequired=true，無正常 Session；部分成功／expired／provider outage保持失敗。
- [x] [PR #154](https://github.com/simonliu1118-byte/chihyuan-web/pull/154) exact head `70e6e9862b60e290ce0e9fb4125a6827a1840fb5`：Governance `38712073846`、Runtime `38712073567`（四 jobs）、部署契約 `38712073611` 全通過，PR deploy skipped；合併 `9a76a1ac1337c82aa1db3c046edf48448feea64c`。
- [x] [實際部署 38712562070](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/38712562070)：原 deployment ref 以雙 parent commit `0be73dd96d81421f54f11f1e177f7365128f1bfb` 向前推進，tree `4ca0d9ba876f0acb9acc10d255469e7d7ca34f74` 與已驗 main 完全一致，無 force update。既有 Worker 部署成功、無新 migration；canonical／workers.dev 於1527ms同為0.7.26／consumer1.0.4／exact source／D1 ok，雙入口 invalid Session與cookie清除通過。
- [x] 2026-10-15 **17:24:39 Asia/Taipei** post-deploy 原canonical strict guard：同一 Worker／原business D1維持、`portalUsesConfiguredDevelopmentIdentity=false`、`portalUsesCanonicalProductionIdentity=true`、provider environment=production；Workspace／core App／consumer／health符合，**productionPortalReady=true、failureCode=null**。原唯讀 audit report 的 mutationPerformed=false只描述稽核本身；本 run確實已部署。
- [x] 先前同事回報「新使用者信件→CYWEB設定後 Email 未驗證／新密碼不能登入」；authority 修正與 0.7.28 部署後，使用者於 2026-10-16 確認帳號與郵件完整驗收 OK。沒有該舊請求逐筆證據，仍不推定其唯一根因；本輪未代改密碼／重發信。
- [x] 正式 Identity／core portal 切換的既有 authority、中央契約及原business D1已核對；按本次全部模組開放授權處理原Worker，沒有重播provider provisioning、擴大IAM、搬動帳務或製造第二套帳號。
- [x] CYWEB端正式 authority／Workspace／core App／consumer／D1 gate已通過，回交證據收斂至既有 Identity deployment文件下方 CYACCweb handback。
- [ ] CYACCweb接手於自己的 protected runner 重跑 `--require-account-portal`，核對其最新 main後再推進 Draft #435；CYWEB未代合併或部署帳務。真 Email、一次性密碼→正式密碼→重新登入→CYACC一般登入仍未驗收，本輪未新增帳號／寄信。

操作與回交證據依既有 [Identity deployment](docs/development/IDENTITY_DEPLOYMENT.md#account-portal-authority-read-only-audit)；此 TODO 為唯一進度表。

## 目前基準 — 2026-10-16（Asia/Taipei）

- 目前已部署 **0.7.37 Build 0／CYID consumer 1.0.5**（本輪共用頁首／手機搜尋／全介面日期驗證與部署見上方；canonical contract mirror1.0.6）。已包含PR169～173的ERP獨立Module Access入口、Agent連線、批號／歷史及品名搜尋；現行contract與既有handoff report為介接依據。既有全部模組沿用原Worker／business D1／Module Access；使用者已確認帳號／郵件與真實角色／權限驗收OK。新增ERP能力的真人驗收、業務首版及乾淨schema仍分開追蹤。
- 已包含 0.7.24「CY 程式 → 價格觀測室（原型）」外連，原型程式位於 CYapps `apps/CYPriceDesk/`，維持 Sites owner-private 與 ChatGPT 登入；未發版桌面程式仍不提供下載。
- 先前已部署 source **0.7.22 Build 0** 已加入單次切換模組提醒，並沿用 Customer／WorkLog 共用 Dialog／ConfirmDialog，修正關閉焦點並移除六模組／Shell 工程描述；包含 quota cooldown／最近成功版本保留及 skip-link 修正；CY 程式頁仍依使用者要求不顯示「發版說明」連結。六模組獨立自動驗收準備完成，目前為 UI／UX 與小功能整理階段。
- 本輪 source **0.7.23 Build 0／CYID consumer 1.0.4** 在既有「帳號與權限 → 系統使用權」新增 Super Admin 的「登記系統」，由 CYID core Session 決定目前 Workspace；其他員工使用權仍在既有清單管理。共享 Dialog／Field／dirty guard／Toast，無 browser registry authority。Provider #416／development #158 與 Web #146／development #138 已通過 CI／部署；七個 canonical mirrors1.0.4 已同步。使用者在原 development portal 完成 CYInvoice 真人登記／目前 Workspace 啟用，畫面已出現 CYInvoice。一般員工 App Access、取消／dirty guard／busy／行動裝置仍待驗收，不因 Super Admin 永遠允許就視為其他員工已授權。
- 固定入口 `https://admin.chihyuancm.com` 沿用原 CYWEB Worker與business D1；Identity authority 切換以本輪 post-deploy strict gate為證據，GitHub environment／deploy ref 的 development 名稱保留作既有操作標籤。
- 六個業務模組及 Settings/Audit 使用單一 React → protected Worker API → D1。舊 local business authority、Group proxy、activation 入口與重複 local pages 已退休；無另加版本殼。
- 備份／isolated recovery 工程已實作；實際雲端備份及排程仍未啟用。乾淨 production 業務資料 cutover 尚未執行，與本次正式 Identity綁定修正分開。

- 本輪已完成單次切換模組提醒與既有 SUPER_ADMIN Desktop 驗收；後續依下方未勾選項目整理共用 UI／UX。

## 後續順序

1. [x] 本輪獨立自動驗收準備完成：六模組 protected HTTP／service／D1 的規劃案例、實際欄位解析、重要計算、正反狀態、舊版本衝突、權限與精確 Audit 已通過 local 與 required GitHub checks。這不代表所有可能組合、真實服務／多角色／裝置已完成。
2. [ ] **目前階段：使用者統一人工驗收、UI／UX 調整及小幅功能新增。** 本輪指定 CY 程式頁，採既有共用元件與單一 runtime；新增／調整後執行適用回歸驗收。
3. [ ] 完成下方人工／Email／ERP／雲端項目後，核對第一版 readiness、測試資料清理及乾淨 production schema；使用者確認後才上線。這項順序確認不代表立即 production 部署批准。
4. [ ] CYInvoice 接入工作已開始：本 repo 只完成 generic 中央登記 UI／代理與鏡像，實際既有 Workspace 登記及 App Access 由授權管理員操作；Invoice binding／Windows／cutover 由 CYapps 工作線完成，不在此修改其業務資料。

## 中央系統登記（0.7.23）

- [x] Super Admin 顯示操作；一般 ADMIN／Identity Admin 不提供登記入口，server authority 仍由 CYID 決定。
- [x] Core Session proxy／unauthenticated denial／provider 403 原樣保留測試，以及 TypeScript、Vite 與 existing source contracts。
- [x] Provider 0.3.7 開發部署 #158（38197480766）通過；本 repo 依既有 sync script 完成 canonical 1.0.4 七項鏡像，exact-sync／支援窗驗證通過。
- [x] #146 exact-head Governance244／Runtime160／deploy-contract137通過，actual development#138部署與雙入口版本／D1／invalid Session驗收通過。
- [x] 使用者以既有 Super Admin 完成 CYInvoice 真人中央登記／目前 Workspace 啟用，系統使用權清單出現 CYInvoice；一般員工 App Access 尚未確認。
- [ ] 取消／dirty guard／busy、其他角色及行動裝置真人表單驗收。
- [x] CYapps Invoice 唯讀 #38／prepare-cyid #39 完成配置；使用者回報原 Windows continuity 後，#420 CI／actual activate-cyid #42（38206372325）確認 development CYID_ENABLED=true，原業務 Workspace／Device Token hashes／資料／history／FK 保留，Provider不變。原 Windows 中央當次驗證及其餘角色／transport／AA／AB／AC 仍待驗收，唯一進度入口為 CYapps Invoice 現行 TODO／RC；production仍另行核准。

## UI／UX 與小功能階段的工作範圍

- [x] CY 程式頁移除獨立 GitHub 發版說明連結，保留網站入口與 compiled ZIP 下載；同一清單的 Desktop／Mobile 皆適用。共用 render 核對／TypeScript／Vite 及 required remote checks 通過，已部署 0.7.17；既有 SUPER_ADMIN 重新載入後實際顯示七列、僅一個網站與三個下載連結，無發版說明。

- [x] CY 程式頁工程驗收與 Development 部署：所有已登入使用者均可使用，不需 Module Access。四個正式程式提供版本／日期／功能／核准 ICON 與網頁或 compiled Release 入口；SMART 銷貨單格式轉換工具、CYEnvelope、CYWatermark 先保留功能介紹並標示尚未發版，不提供虛構下載。
- [x] 既有 SUPER_ADMIN 的 Desktop `#programs` 導覽、七項介紹、圖示載入、已確認版本／日期、三個未發版無連結、更新 loading 及失敗標示已觀察。三個公開 compiled ZIP 經匿名 HTTP HEAD／redirect 回 200，網頁入口可到 CYAccountingWeb 登入頁；未下載執行桌面程式。
- [x] **CY 程式正式版本即時更新實測通過**：0.7.19 部署後既有 SUPER_ADMIN 初次讀取顯示「最新正式版本」且無 snapshot warning；手動更新 loading → 正常按鈕，七項、版本／日期、網站／三個 compiled ZIP 與三個未發版狀態保持正確。成功讀取採既有五分鐘 process cache；手動按鈕不表示每次強制繞過 cache。
- 根因／修正證據：0.7.18 診斷 actual NETWORK；相同 compatibility date 的 actual workerd 重現 Request `redirect:error` 拋 TypeError，舊純 fetch stub 未真正建立 Request，掩蓋執行環境問題。0.7.18 Build 1 改 `manual`，非 2xx／302 拒絕且不跟隨 Location，補 actual Request construction regression；local／remote Worker/D1、TypeScript／build 均通過。[PR #133](https://github.com/simonliu1118-byte/chihyuan-web/pull/133)／[PR #134](https://github.com/simonliu1118-byte/chihyuan-web/pull/134)；診斷 source f42fa3bfd2d9eb319c0b02ff343bb71de5fd3938／run 37116571600；修正 source 0a0208ec4b0a39ef19cf560e11b35f50ff196380／run 37117059457，兩入口首次 ready 270ms。
- [ ] **GitHub 真實每日排程與 quota 恢復驗收**：0.7.31 已以 D1 全域每日 claim 取代五分鐘／fallback process cache 與 provider cooldown；頁面不再查詢 GitHub，每排程日最多一批、失敗保留最近成功版本，跨 isolate SQL 與 actual Worker+D1 regression／實際已安裝 cron 驗證通過。首次真實每日執行與 provider quota 恢復仍待次日排程確認，不以此推論外部限流永久消除。診斷只回 allowlisted code／HTTP status，不回 provider body、headers、exception text、IP／credential。
- [ ] `#programs` Tablet/Mobile、USER/ADMIN（含無 Module Access）的真人畫面與實際下載使用尚待確認；既有 isolated 三 Role API 通過不代替這些結果。

- [ ] 依統一人工清單收集實際操作與畫面問題，回寫本文件，不另建平行進度表。
- [ ] 優先調整共用 navigation、清單密度、表單／明細、dialog/drawer、loading/error/empty feedback 及鍵盤／觸控；Desktop/Tablet/Mobile 維持同一資料與權限契約。
- [ ] 低風險 optimistic interaction 依既有方向逐項檢視；刪除、權限／credential、financial/inventory 等高風險操作不先呈現成功。
- [ ] 使用者提出小功能後記錄需求與驗收條件，再開獨立工作項目；不自行假設第一版要增加什麼。
- [ ] 每批 UI／功能變更跑適用 automated regression，真人/裝置 checklist 仍須實際確認。

- [x] 既有 SUPER_ADMIN 合成 WorkLog Desktop 共用表單：送審 rev.7 → 審核 rev.8（1 日／2.5 分）→ 取消審核 rev.9（統計歸零）→ 撤回回草稿 rev.10。無效日數被拒絕且欄位保留；兩頁籤 rev.7 表單於另一頁完成後被拒絕，未覆蓋 rev.8；未操作其他員工真實日誌。

- [x] Desktop Audit 本輪新增四筆 WorkLog 送審／審核／取消／撤回，累計八筆，entity work_log/1、actor 2；取消 reviewed → pending_review 與本輪合成原因 readback 通過。Customer ERP 表單／主檔取消、Visit 刪除 Escape 及 Frequent Item 移除取消後原資料保留；Customer rev.4、新舊 Visit／Frequent Item 未改，未 hard delete。
- [x] 最後進行 Desktop 共用 UI／UX 檢查：1363×936 程式頁無 document 橫向溢出、七個可見 ICON 56px 載入、active navigation 與網站／ZIP rel 正確。Keyboard Tab 可到 skip link，但 Enter 將 hash 改成 cy-main-content 而切到 Identity，為實測 bug；0.7.19 共用 AppShell 改成只移焦點，live Tab → Enter 確認 hash 保持 #programs、activeElement 為 cy-main-content、CY 程式內容不變。
- [x] 0.7.21 共用 UI 整理與 Build 1 焦點修正：Customer／WorkLog 採既有 Dialog／ConfirmDialog；WorkLog 一次填工作日數／整體備註／各項分數，客戶 ERP 編號與原因同一表單。dirty guard 的取消保留／放棄、busy inputs／actions／dismissal 鎖定、失敗及 stale 表單保留，Desktop 已實測。Escape／取消回 connected 原按鈕；nested confirmation 取消回原表單取消按鈕；native Tab 經 browser chrome 後回 dialog，未進入背景頁。1363×936 審核畫面無 document 橫向溢出。六模組及 Shell 工程描述改使用者語言。
- [x] 0.7.22 切換模組提醒：六模組編輯／Settings／Customer 關聯編輯採共用 guard，普通導覽及 hash／Back 單次詢問「確定切換」／「放棄切換，繼續編輯」。確認即放棄並切換，不強制儲存、不另建保存層、不追加確認。拒絕保留原頁／欄位；busy 操作及權限強制返回不受過期同意覆蓋。目的模組等待自己的權限檢查才 mount。六項 transition tests、TypeScript／build 及 required CI 通過（Governance `37121454070`、Runtime `37121454067`、部署契約 `37121454072`）。Development 已部署；既有 SUPER_ADMIN Desktop 側邊欄／Back 的確認與放棄皆實測，取消保留 Customer 欄位及兩項未儲存 WorkLog 內容，確認一次即切換。Customer 回讀仍為原內容／rev.4，WorkLog 仍為單筆草稿／rev.10；本輪無儲存、送審或刪除。其他角色／裝置及 Identity 專屬表單不外推為已驗收。
- [ ] 共用 UI 後續：Customer 重複統編確認／ERP 編號正式送出、reason 表單 dirty 取消，以及多項日誌儲存／審核與其他角色／裝置驗收仍待完成；本輪只驗收 ERP 表單取消，不寫入 ERP 編號。

## 已接受的工程與驗收範圍

| 範圍 | 已通過 | 尚不能視為完成 |
| --- | --- | --- |
| Identity | 單一登入、first-login ticket 與 normal Session 分離、設定正式密碼後要求重新登入；consumer exact-sync；invalid provider Session fallback；使用者 2026-10-16 確認帳號／郵件完整及真實角色／權限驗收 OK | 本輪主動撤權處理的部署與真人確認；未逐項留證的裝置及故障組合不外推 |
| CY 程式 | 七項清單與三個未發版；三 Role 無 Module Access API 自動驗收；SUPER_ADMIN Desktop 七個圖示／無橫向溢出／失敗標示已觀察，ZIP HEAD 200、網頁入口可到登入頁 | 部署端 Release refresh 已成功，另保留曾觀察的 RATE_LIMIT／cache 穩定性；其他真人角色／裝置與桌面程式實際下載使用未完成 |
| 六模組 HTTP 權限 | 未登入、無 Module Access、grant revoke/restore、Role 不改 grants、inactive member、provider invalid/unavailable、body 權限偽造拒絕；實際 routes/services/D1 | provider 為 isolated stub，不等於真實 CYID／瀏覽器全流程 |
| Customer / Quote | persistence／related schema、Contact retention、Visit snapshot；HTTP Visit/Frequent Item create/edit/delete、stale；Quote HTTP 新歷史／correct/stale／精確 price breaks／Audit、原子 rollback | 正式 Item／Quote 真人流程需合法 ERP 品項；完整畫面流程仍待人工確認 |
| Item / Defect | Item HTTP create/edit/renumber/stale／number Audit、精確成本／單位換算；Defect HTTP processing/resolved/reopen/invalidate/stale／Audit，creator 與 ADMIN 刪除界線 | 真實正式 Item、完整 lifecycle 畫面及裝置驗收 |
| Sales Order | ERP fill/correction、waiting/pick/ship/reversal/void、draft edit/delete、stale snapshot 及精確 Audit；HTTP 主要生命週期 | 合法 ERP 參考及真實多角色／畫面驗收 |
| Outsourcing | 全九種 persistence 轉換／stale replay、庫存與 receipt/pricing ledger preservation；取消後重建資料不被舊請求改動 | 完整 protected HTTP 計算／BOM／計價／反轉遠端已通過；真人流程未完成 |
| WorkLog | service lifecycle、併發／Audit；HTTP CRUD/submit/withdraw/review/cancel-review／statistics、cascade、精確 actor 與 stale；owner、非 owner、ADMIN／revoked-access 邊界 | 既有 SUPER_ADMIN 合成 Desktop workflow／錯誤／stale 通過；其他角色、設定組合、多項表單及裝置待驗收 |
| Backup / recovery | separate migrated D1 還原、FK／duplicate rollback、immutable copies、catalog/retry/retention、ephemeral R2；GCS 使用模擬 HTTP | 真實 GCS/R2 及排程、獨立 DR、實際 SUPER_ADMIN 畫面驗收 |
| ID / Audit | 九種 standalone entity 刪除後不重用 ID；migration backfill／rollback／備份還原後分配及 exact entity-key history | 無法推斷未留證據的舊 ID，也未重寫既有可能混淆的 Audit |

### 已觀察的 Desktop browser 結果

- 既有 SUPER_ADMIN 登入後模組／Settings／Audit 頁面載入；forgot-password 返回登入導覽通過，未寄信。
- Customer 建立／欄位儲存／reload、兩頁籤 stale save 拒絕通過。Customer 單列過高問題已修，673.9px pane 中 row 回到 70px。
- Visit 建立／編輯／reload／兩頁籤 stale 拒絕；原生鍵盤日期 `2026-11-01` 保留；Contact 改名及 Visit 再編輯後仍保留原 snapshot。改名後新 Visit 已由既有 SUPER_ADMIN 儲存成功，取得改名後 snapshot；reload readback 通過，新舊 snapshot 各自保留。
- Frequent Item 空白拒絕／自由文字新增／reload；WorkLog draft 建立／編輯／reload 通過。未建立正式 Item／Quote。
- 以上只涵蓋已觀察的 Desktop 與既有帳號，不外推其他角色或 Tablet/Mobile。
- CY 程式頁已由既有 SUPER_ADMIN 登入後觀察：Desktop 七列、七個 56×56 圖示完整載入，無頁面橫向溢出；三個尚未發版列各有零連結。初次及手動更新在 0.7.19 已顯示「最新正式版本」並正常完成；先前 snapshot／RATE_LIMIT 的觀察仍作穩定性證據。這取代先前「登入後清單未觀察」與「live refresh 未通過」狀態；live API 401、其他真人角色／Tablet/Mobile 仍未驗收。

## 部署觀察保留事項

- [ ] 持續保留 recurrent first-attempt health mismatch 診斷。0.7.10、0.7.12、0.7.14 與 0.7.15 曾觀察入口先回舊 source，於同一次部署後 13598ms／14586ms／20910ms／32620ms 轉為新 source，無再次 deploy；Cloudflare 內部原因仍未建立。
- 現有 gate 在 90 秒內只讀觀察兩入口的 allowlisted version／commit／consumer／D1，無自動 redeploy。0.7.13 首次觀察成功不表示歷史問題已根治。
- 0.7.16 兩入口首次觀察成功，391ms ready；0.7.18 診斷部署首次回 0.7.17，1296ms 於同一部署轉為新 source；Build 1／0.7.19 首次 ready 270ms／348ms。不據此宣稱歷史 mismatch 原因已修復。
- acceptance runner 原二秒 timeout 會重送已成功 fixture 寫入的原因已修正：readiness 不寫入、正式 acceptance 單次執行與 60 秒 bound；不保留舊 replay 做法。

## 需要使用者完成及暫緩事項

- [x] **帳號與 Email 真人驗收**：使用者 2026-10-16 確認完整驗收 OK，取代先前延後狀態；不要求重做既有驗收。本輪不代建立帳號、寄信或改密碼，未留逐項紀錄的故障案例不推定已逐一執行。
- [ ] **ERP**：使用者指定合法 SMART ERP 驗收品項及參考；不捏造 live 正式 Item／ERP 交易。
- [ ] **雲端**：使用者將 development R2/GCS resource／bucket IAM／GitHub environment variables 與 secret 設定延至 **2026-10-05 起的一週**。完成後只回報完成，不提供憑證內容。
- 雲端操作步驟沿用 [既有 deployment 文件](docs/architecture/CLOUDFLARE_PUBLIC_DEPLOYMENT_PRINCIPLES.md#development-backup-manual-setup-and-handback)。App-owned buckets／credentials 與 CYACC 分離；策略 R2 每日臺灣 03:30／30 天、GCS 臺灣週三／週日／182 天，同一份 portable bytes 複製兩邊。
- 使用者完成設定後，先 manual-only 接續驗收，再啟用排程；不因等待這些項目停止獨立工程工作。

### 真實雲端驗收清單

- [ ] 專屬 development R2/GCS buckets、bucket-only service account、R2 無外部覆寫來源、protected deployment inputs；不得共用 CYACC storage/credentials。
- [ ] 先 `CF_BACKUP_ENABLED=true`／`CF_BACKUP_SCHEDULE_ENABLED=false` 部署，確認 SUPER_ADMIN manual controls 與其他角色拒絕。
- [ ] 真實 manual backup：兩邊 readback、相同 bytes/manifest SHA／backup event、非敏感 catalog/Audit。
- [ ] 受控 GCS failure/retry：verified R2 保留，重試只複製同一 immutable event bytes，不建立新 snapshot。
- [ ] 真實 isolated recovery：選定 cloud backup、兩邊 verified safety copies、空的 migrated target、record/byte reconciliation、source 不變與 structured Audit；不得以 live business D1 為 target。
- [ ] manual/recovery 通過後再明確啟用排程，驗證臺灣日期、每日 R2／週三週日 GCS、30/182-day retention 與 pending replica 保護。
- [ ] 就地記錄實際 run／結果，production activation 另行處理。

### 統一人工驗收清單

使用者安排在自動驗收後集中操作及調整；以下須實際觀察，不以自動檢查代替。

| 範圍 | 人工確認 | 前提與保留界線 |
| --- | --- | --- |
| 核心帳號 / CYID | 登入/登出、Session 逾期/撤銷、self-service、返回登入 | 既有受控帳號；不自行新增帳號或授權 |
| Role / Module Access | USER/ADMIN/Identity Admin/SUPER_ADMIN 畫面、撤權/恢復/角色變更 | 受控帳號，不執行未指定的 live 權限變更 |
| CY 程式 | 無 Module Access 仍可看清單；版本／日期／ICON、網頁入口及 ZIP 下載；三個尚未發版項目無下載 | 既有登入帳號；外部 App 自行處理登入權限，未發版項目待正式公開 Release 才補入口 |
| Customer | 建立/編輯/搜尋、Contact/Visit snapshot/日期、Frequent Item、Quote 新歷史/更正/Audit | 保留既有 synthetic fixtures；正式 Item/Quote 需合法 ERP 品項 |
| Item / Defect | 正式欄位、單位/價格精度、Defect 狀態與管理操作 | 合法 ERP 參考，不捏造 live 正式 Item |
| Sales Order | Draft、ERP fill/correction、waiting/picking/shipping/reversal/void、權限提示 | 合法 ERP 參考與受控 synthetic workflow |
| Outsourcing | Contractor/BOM、outbound/receipt/pricing/payment 及反轉、stock/Audit readback | 受控 synthetic workflow，不異動真實庫存/付款 |
| WorkLog | owner CRUD/submit/withdraw、ADMIN review/cancel-review、statistics/readback | 受控 synthetic workflow 與既有帳號 |
| Settings / Audit | 編輯 settings、唯讀 Audit search、actor/reason | 既有權限，不改 production settings |
| 電腦 / 平板 / 手機 | 密度、導覽、表單、捲動、選取、錯誤/載入、觸控/鍵盤 | 真實裝置，調整需求回寫同一 TODO |
| Email | 驗證、重寄/逾期、密碼 recovery 與實際收信 | 使用者明確延後，此輪不寄信 |
| Backup / recovery | R2/GCS 設定、history/create、隔離還原/演練、排程 | 2026-10-05 起一週設定後再驗收，不啟動 production restore |
| 清理 / 上線 | 核對 fixture/account 清單、受控清理與 first-release gates | 驗收後確認，不自動刪除或 production cutover |

## 上線前暫時保留 — 用途與結束條件

- 測試資料及清理清單只為開發驗收與後續核對保留；不是 production seed 或另一份正式資料來源。完成相關驗收後核對清單，再經不可逆清理的當次確認移除。
- isolated acceptance source 為可重建 CI 驗證，fixture 僅存在臨時 D1，不隨 production 部署建立；不因清理 live fixture 移除有用的 regression tests。
- 未完成的人工／雲端／Email gate 保留到取得實測結果；完成後更新此文件，不另外新增狀態文件或永久例外規則。
- 舊 GAS／Sheet 只保留作參考，直到使用者確認新系統穩定後再決定停用／刪除；不把舊測試資料搬入 production。

### Development 測試資料清理 — 驗收後

- [ ] 核對此工作線建立的合成資料、ID/reference 及支援的正常清理行為；Git 只記錄非敏感結果。
- 保留範圍：Customer `CYWEB 驗收 20261001` revision 4（合成 phone/contact/address/note）；linked Visit revision 5；新增 Visit `2026-10-03` revision 1（改名後 snapshot 合成驗收）；自由文字 Frequent Item `Development 常用商品驗收（未建檔合成品項）`；draft WorkLog type `DEVELOPMENT_ACCEPTANCE` revision 10。未建立 live 正式 Item/Quote。
- [ ] 驗收完成後依相依順序使用正常產品行為清理；不可逆清理取得當次確認，保留必要 Audit/history 與其他資料。此項不授權清空資料庫。
- 使用既有登入帳號，未建立驗收帳號；日後若新增受控帳號須補清單，不刪既有使用者／authority。此清單與 production 乾淨 schema provisioning 分離，目前未執行清理。

## 目前接受與部署證據

- quota/cache：[PR #137](https://github.com/simonliu1118-byte/chihyuan-web/pull/137) accepted head `af2c8eb446846bf1daac837afd667f216a1d5556`；Governance `37118362496`、Runtime `37118362481`、deploy contract `37118362503` 通過。Development `37118566726` attempt 1，290ms ready。Actual loader 隔離測試包含 concurrent coalescing、5min cache、reset／retry-after、invalid header、最近成功資料保留及 on-demand recovery；live reload／manual refresh 仍標示 fallback，不能推論 quota 恢復或跨 isolate 全域快取。
- 共用 UI：[PR #138](https://github.com/simonliu1118-byte/chihyuan-web/pull/138) accepted head `f19109774f48392f924e65788ba9a2468a8b3135`，14 blobs 及 tree exact-match；local TypeScript／source／Vite 通過。Governance `37119318772`、Runtime `37119318792`（actual D1 full acceptance）、deploy contract `37119318807` 通過；Development `37119391904` attempt 1，421ms ready。Live 取消後 BODY 焦點問題於同工作項目 Build 1 修正。
- 焦點修正：[PR #139](https://github.com/simonliu1118-byte/chihyuan-web/pull/139) accepted head `78ffaf1f3d512655f972e4f073f31d3bdec8b779`，四 blobs exact-match；local TypeScript／Vite、Governance `37119656203`、Runtime `37119656168` 通過。UI-only 路徑不觸發 PR deploy-contract；[Development run 37119745615](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/37119745615) 包含部署契約／完整 build／health，attempt 1 成功，canonical 前一 source 下一次觀察轉新 source，1516ms ready，未 redeploy。共享 Dialog layout cleanup 於移除前關閉／回焦點，live connected trigger／nested form／review cancel 通過。
- 最新 Runtime 的 actual Worker/D1 full suite 仍包含六模組 protected HTTP／roles／grants／stale／domain lifecycle／exact Audit／ID non-reuse／restore／backup regression、七 migrations／48 tables、Program Catalog 三 Role 無 Module Access及 trusted release；provider、R2/GCS 等隔離邊界不替代真人／真實外部服務驗收。已完成語意與未完成範圍見上方矩陣。舊版本逐輪 PR／run／preview 記錄以 Git history 追溯，避免在本文件保存互相矛盾的過期基準。

## Topic source map

- Governance/product permanence: `PROJECT_RULES.md`
- Architecture index: `docs/architecture/README.md`
- Business Decisions: `docs/architecture/decisions/README.md`
- Shared CYID consumer package mirror: `docs/contracts/cyid/`
- CY Web-specific Identity adapter: `docs/architecture/IDENTITY_ADAPTER.md`
- Identity deployment: `docs/development/IDENTITY_DEPLOYMENT.md`
- Data model / physical dictionary: `docs/architecture/CANONICAL_DATA_MODEL.md` / `FINAL_DATA_DICTIONARY.md`
- Worker API: `docs/architecture/API_CONTRACT.md`
- Backup/recovery: `docs/architecture/BACKUP_ARCHITECTURE.md`
- Current progress: this file only

Historical preview/audit/readiness/review material under `docs/architecture/archive/` and Git history is evidence only, not current contract.

# CYWEB 叫貨修正交接給 Claude

更新日期：2026-10-22。此文件依使用者「專案主要由 Claude 處理，必須開 handoff 註明修改」要求建立。這是直接交辦修正的交接紀錄；共通規則仍以既有治理鏈為準。維護狀態入口為根目錄 `TODO.md`。

## 本輪 GPT 交接：V0.9.31 Build 0 — 到貨診斷（2026-10-22，待審查）

使用者實機出現「叫貨操作失敗」，原 Worker catch 區統一回傳 500 而未輸出原始例外。到貨 D1 batch 成功後仍會重新讀取單據，讀回出錯時原先會把已提交的結果誤判為儲存失敗。目前沒有正式 Worker log，**不可斷言原始 D1 根因**。

- `worker/http/ordering-routes.ts`：POST receipts 加入 preflight／persist／readback 階段；未知例外以 `[ordering_receipt_failure]` 記錄 requestId、階段、例外名稱及截斷訊息，禁止主動寫入 ERP 單號、品項與帳號資訊；已提交後讀回失敗回 `ORDERING_RECEIPT_CONFIRMATION_REQUIRED`（503），不再當成整筆未寫入。
- `src/runtime/modules/OrderingPage.tsx`：結果不明保留到貨 Dialog，不自動重送；提示附 requestId 供 Worker log 對應。
- `scripts/ordering-route.test.mjs`：驗證交易已成功但回讀失敗的診斷結果與資料保留，以及驗證失敗時資料未寫入。
- `VERSION`／`package.json`／`TODO.md`／架構文件更新；不增加 D1 migration、權限、ERP 查詢或其他模組功能。

**驗證交接**：容器無法解析 GitHub DNS，未能取得完整本機 checkout 執行 Node／SQLite；需以 PR CI 的 typecheck、build、ordering tests、validate:source 正式確認後才可合併。部署後用畫面 requestId 對應 Worker log 與 phase 判定根因，並先核對是否已有到貨紀錄再決定重試。本輪正式 D1 讀寫 0 列，未合併或部署。

## 最新交付：V0.9.30 Build 0（桌面表格與儲存狀態）

使用者已核准叫貨桌面預覽，並明確修正：格子本身直接可輸入，不是切換顯示／編輯模式；Enter 必須完整逐格，取消舊數量捷徑。另要求預設未到貨、移除明細下方兩行，以及原標題下自動儲存位置顯示轉圈儲存中／已儲存／紅字儲存失敗。

| 檔案 | 本輪修改 |
|---|---|
| `src/ui/OrderingGrid.tsx` | 所有 input 持續掛載，使用獨立表格樣式；colgroup 依內容配寬，列操作收成 `⋮`，重用共用 Dialog。數量 Enter 改到單位，其餘按實際欄序，備註到下一列品號。移除底部狀態／常駐說明；回報 dirty/saving/failed，列操作也納入等待。原 row key、API 確認、失敗保留及 flush/discard 保護延續 |
| `src/runtime/modules/erp-item-query.css` | 僅叫貨專用格線、透明無框儲存格、細焦點框、欄寬與 34px 列高；窄版觸控 44px，沿用原色彩 tokens。失敗狀態使用 danger token 紅字；spinner 重用共用動畫 |
| `src/runtime/modules/OrderingPage.tsx` | 預設未到貨且來源不預選；狀態集中於原日期／品項數那行。表頭儲存計數、失敗紅字、編輯修訂計數，避免舊回應清掉等待期間新輸入的 dirty 狀態；自動存表頭不另冒綠色已儲存 banner |
| `scripts/ordering-grid.test.mjs` | 四種來源在新列／已存列的完整 Enter 順序、取消數量捷徑、列操作參與儲存狀態與 flush，原換列／儲存保留案例持續驗證 |
| `scripts/ordering-page.test.mjs` | 預設未到貨、零草稿請求；狀態 spinner／失敗／未儲存／完成，表頭失敗重試與舊回應不誤判完成 |
| `VERSION`／`package.json`／`TODO.md`／架構文件 | 0.9.30，BUILD 仍為 0，更新 current contract 與交接 |

一般／廠商 Enter：**品號 → 品名 → 廠商品號 → 廠商品名 → 數量 → 單位 → 備註 → 下一列品號**。這項明確取代下方 V0.9.28／0.9.29 歷史紀錄中「保留數量快捷操作」；IME、廠商品名＋數量可儲存並送出、我方欄位不複製、樂觀鎖等規則不變。

本輪沒有修改 Worker／API／schema／權限、其他模組或共用主題。手機三欄表格＋完整表單仍是未核准實作的後續方案，現行窄版保留表格區水平捲動。本次直接交辦，不是 Claude→GPT 工作單。

驗證／部署狀態：

- [x] 本機瀏覽器以實際 OrderingPage／OrderingGrid 與合成 transport 操作：完整七欄 Enter 到下一列、轉圈儲存中、失敗紅字＋輸入保留、重試完成、重開模組預設未到貨、再開來源仍保留新增整列及補填備註；已查看淺／深色畫面。這是本機 UI smoke，後端 persistence 另由 in-memory SQLite 路由測試負責，不宣稱正式帳號驗收。
- [x] 最終 `node --test scripts/ordering.test.mjs scripts/ordering-route.test.mjs scripts/form-keyboard.test.mjs`：43 項通過；`npm run build`、`npm run validate:source` 通過（build 僅既有 bundle 大小／動態 import 提示）。
- 本機實際畫面：[預設未到貨](images/ordering-compact-table/default-pending.png)、[緊湊表格與焦點](images/ordering-compact-table/compact-table.png)、[儲存失敗紅字](images/ordering-compact-table/save-failed.png)。皆為合成資料；非 AI 預覽，也非正式站資料。
- [x] [PR #265](https://github.com/simonliu1118-byte/chihyuan-web/pull/265) 已合併：修正提交 `3f05a8c6d167faf6399bf91228d0471520a7b56d`，主線來源 `b75b9ac941f0cc7b167918226d8ace77142a87a9`。
- [x] [Runtime Check #39631359103](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39631359103)、[Governance #39631359027](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39631359027)、[部署契約 #39631359047](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39631359047) 必要檢查全部成功。
- [x] 原網站 [部署 #39631658692](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39631658692) 成功，來源 `main` 的 `b75b9ac941f0cc7b167918226d8ace77142a87a9`。已部署版本／consumer 宣告與 D1 健康、HTTPS／靜態資源、正式網域、無效 session 及 Identity 權威檢查全部成功。未建立 GitHub Release。
- 部署後僅補交接／TODO 證據，不修改功能、版本或部署設定，不需為本文件重部署。Claude 後續可直接閱讀此最新交付段落與根 TODO。
- 正式業務資料讀寫 **0 列**；本機合成請求與圖片均不含真實業務帳號／交易資料。無 migration 或遠端批次資料作業。

## 使用者確認的範圍

1. 備註按 Enter 應立即建立下一列並聚焦品號，不能在第一列循環。
2. 修正只填廠商品號／廠商品名／數量時未真正儲存，切走再回來資料消失，以及草稿載入過久。
3. 使用者明確定案：一般／廠商來源可用「廠商品名＋數量」儲存**及送出**，我方品號／品名可留空；不得把廠商品名複製到我方品名充作通過驗證。
4. 使用者另詢問叫貨明細改 ListView／表單的方案，先盤點再核准桌面預覽；實作與後續澄清見最上方 V0.9.30。

## 已交付的上一輪：V0.9.28 Build 0

- `OrderingGrid` 備註 Enter 改用最新草稿列清單；沒有下一列時立即新增，不等待 API 成功，也不因該列缺必填值而停在原列。
- 保留原數量 Enter 快捷操作、IME 行為與其餘畫面。
- 功能 [PR #260](https://github.com/simonliu1118-byte/chihyuan-web/pull/260)，後補部署證據 [PR #261](https://github.com/simonliu1118-byte/chihyuan-web/pull/261)。
- 已部署來源：`32c69ce1245519720a4a8e180c3fe519528c39bf`；[部署 #39619928512](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39619928512) 成功。本機相關測試 24 項、build、validate:source 通過。

## 本輪：V0.9.29 Build 0

### 根因

- 前端新列 eligibility 僅認我方品名／品號＋數量；只填廠商欄位時直接跳過提交，沒有真正呼叫儲存。
- 後端儲存及送出也要求我方品名，需與使用者新定案一致。
- 新列建立請求送出後，若再填單位／備註，舊流程可能直接清掉暫存列；切換來源也沒有明細 flush／未儲存確認。
- 開啟草稿後重查來源、歷史、未到貨，新建還重讀草稿列表；逐格儲存重複全區 refresh。初次歷史查詢又與搜尋 effect 重疊。後端草稿詳情重查單據並讀取不適用的到貨及修訂資料。

### 修改責任與位置

| 檔案 | 修改 |
|---|---|
| `shared/ordering.ts` | `orderingLineHasName` 統一一般／廠商的擇一品名規則；未到貨資料帶獨立 `vendorItemName` |
| `worker/http/ordering-routes.ts` | 儲存及送出採用新規則；成功附 `savedLineId`，新列產生 52-bit 安全整數 ID；保留版本鎖／稽核／交易。草稿略過到貨及修訂查詢，GET 不重查單據。搜尋納入廠商品名／品號；未到貨／稽核保留可識別的廠商品名 |
| `src/ui/OrderingGrid.tsx` | 等儲存確認才清除暫存；等待中補填欄位更新至同一個明細 ID；失敗保留並能重試。確認後保留同一 React row key，避免伺服器 ID 替換時重新建立輸入控制；延後的焦點操作能解析該 ID。提供 editor `flush/discard` 及 dirty/saving 狀態，中文儲存狀態。保留上一輪 Enter 修正 |
| `src/runtime/modules/OrderingPage.tsx` | 切換／送出／匯出前 flush、未完整則確認；套用共用離開保護。移除草稿路徑多餘 refresh，直接使用寫入回應與快取版本；來源切換用序號忽略過期載入。廠商增修／刪除同步當組與快取，不重查全畫面 |
| `scripts/ordering-grid.test.mjs` | 實際元件事件：廠商欄位儲存、Enter、等待中補填、失敗重試不重複新增、確認前不宣稱已儲存 |
| `scripts/ordering-page.test.mjs` | 實際頁面 handlers、控制 transport/editor 邊界：載入請求數、flush 等待、取消切換保留、過期回應、儲存回應精確對應列 |
| `scripts/ordering-route.test.mjs` | 真實 in-memory SQLite＋全部 migrations：兩種來源儲存→重開→送出、保留我方欄位空白、pending/search、必填邊界、草稿不查到貨／修訂 |
| `scripts/ordering.test.mjs` | 原 CI 入口納入 page 測試 |
| `VERSION`／`package.json` | 0.9.29；BUILD 維持 0 |

無 migration、權限、其他模組或主題／版型變更。沿用現有資料所有權；沒有建立另一套草稿資料庫或背景同步服務。

### 查詢量與失敗控制

- 既有草稿來源切換：原列表＋詳情＋3 個 refresh，共 5 次業務 API，改為列表＋詳情 2 次；新草稿直接用建立回應；草稿格子儲存不再追加 3 個 refresh。
- 草稿詳情讀取只保留單據／來源／有上限的明細，省去重複單據、到貨／修訂與到貨 SUM；實際延遲仍受網路及身分服務影響，未以正式實測毫秒數宣稱改善幅度。
- 等待期間只補寫使用者新輸入；單次新列工作最多 8 輪成功確認，若持續輸入超過上限則保留未儲存內容，等待下一次 Enter／blur／flush。失敗請求不自動重試，不形成背景無限讀寫。
- 本輪驗證使用合成資料與本機記憶體 SQLite，正式業務資料讀寫 **0 列**，無遠端資料批次整理。部署流程既有唯讀健康驗證另見部署紀錄，不視為業務實測。

### 驗證與交付狀態

- [x] `node --test scripts/ordering.test.mjs scripts/ordering-route.test.mjs scripts/form-keyboard.test.mjs`：最終修改後 36 項通過。
- [x] `npm run build`：瀏覽器與 Worker 型別檢查、Vite build 通過；僅既有 bundle 大小／動態 import 提示。
- [x] `npm run validate:source`：來源合約及共用 UI／表單檢查通過。
- [x] [PR #262](https://github.com/simonliu1118-byte/chihyuan-web/pull/262) 已合併；最終修正 `5712cb0068cdf247332b137a609a7f0cb624f9cf`，主線合併 `d77a05ed30fa3137568e9c6c021ce58422920324`。
- [x] 最終修正的 [Runtime Check #39626268627](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39626268627)、[Governance #39626268365](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39626268365)、[部署契約 #39626268713](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39626268713) 必要檢查全部成功。PR 曾顯示過期 head，暫關重開同一 PR 後確認 SHA 正確，未沿用前一提交檢查合併。
- [x] 原 CYWEB 網站 [部署 #39626518329](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/39626518329) 成功，來源 `main` 的 `d77a05ed30fa3137568e9c6c021ce58422920324`。來源 consumer 宣告／D1 健康、HTTPS／靜態資源、原正式網域、無效 session 與 Identity 權威檢查全部成功。此次未建立 GitHub Release。
- 部署後僅另補本 handoff 與 TODO 的證據，不修改已部署功能／版本；Claude 可從 `TODO.md` 連到本文件，不需重做上述修正。
- 未登入正式網站建立／送出業務測試單；尚無本輪真實瀏覽器端到端截圖。不可把 handler／SQLite 測試描述成實機驗收。

## ListView／表單盤點與設計（桌面已實作，手機仍待定）

| 既有共用能力 | 實際提供／限制 |
|---|---|
| `src/ui/data/DataView.tsx` | 桌面 table、手機 cards、loading/error/empty/selection；尚無明細編輯與逐格儲存 API。兩種呈現同時建立再用 CSS 顯示，若直接塞輸入欄位，須處理重複 editor／焦點與輸入狀態，不宜直接替換 |
| `src/ui/foundation/editable-list.ts` | 列的新增／更新／刪除／移動、錯誤與 dirty reducer；無 UI、Enter、API 排序及樂觀版本寫入能力 |
| `src/ui/forms/Field.tsx` | Field／FormSection：標籤、必填、擇一提示與長短欄排版，可沿用於手機單筆表單 |
| `src/ui/layout/MasterDetail.tsx` | 寬版左右清單／明細、窄版返回清單；叫貨頁已使用，與逐品項編輯為不同層次 |
| `src/ui/OrderingGrid.tsx` | 目前為叫貨專用，非全系統可編輯列表；承載 Enter、自動新增列及儲存協調 |

### 使用者後續澄清：桌面採緊湊表格，不採卡片

使用者原話：「沒有要卡片式，我要的是桌面版表格式，就不會有一堆欄位、空格等等占位子。手機版看怎麼做比較清楚。」之後確認「就是表格，焦點移入可以輸入」，並核准桌面預覽實作。

桌面建議：

- 使用緊湊資料表格，一品項一列；儲存格持續可直接輸入，平時無獨立輸入框、焦點格顯示細框，不切換顯示／編輯控制。
- 空值保留緊湊儲存格，不顯示大空白輸入框；短欄縮窄，品名／備註分配剩餘寬度，長文字可截短並於查看／編輯時展開。不因這個呈現變更刪掉資料欄位。
- 保留連續鍵盤輸入、備註 Enter 建下一列，以及自動儲存／版本佇列／失敗保護；數量 Enter 現在到單位，不使用舊捷徑。新增時保留末尾編輯列，多筆尚未完成的使用者輸入仍須保留，不能為清爽而刪除。
- 刪除／排序收進每列 `⋮` 入口，以共用 Dialog 操作，避免每列常駐一排按鈕。

手機建議（尚待定稿）：

- 同樣使用緊湊表格，主畫面只呈現「品名、數量、單位」；品名以我方品名優先、無則顯示廠商品名，僅為呈現，不互相複製儲存值。備註有內容才附於品名下方。
- 點選品項後，以共用 Dialog 搭配 Field／FormSection 編輯完整欄位；新增也用同一表單，可提供「儲存並新增下一筆」以利連續輸入。編輯視窗關閉／取消要沿用未儲存保護。
- 不把所有桌面欄位壓在手機同一橫列，也不改成每品項一張大卡片。

兩種呈現共用一套 editor／資料／驗證／儲存控制，依 viewport 只掛載一份輸入控制，切換呈現也須保存未儲存輸入。後續實作時評估從 OrderingGrid 抽出共用的 editable-lines controller／presentation；不要把叫貨專屬欄位、廠商規則寫成全域規則。現有 editable-list 可作底層參考，但不可取代本輪已補上的 API 確認、版本佇列與失敗保護。

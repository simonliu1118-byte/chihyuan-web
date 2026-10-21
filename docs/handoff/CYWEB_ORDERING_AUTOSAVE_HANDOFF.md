# CYWEB 叫貨修正交接給 Claude

更新日期：2026-10-21。此文件依使用者「專案主要由 Claude 處理，必須開 handoff 註明修改」要求建立。這是直接交辦修正的交接紀錄；共通規則仍以既有治理鏈為準。維護狀態入口為根目錄 `TODO.md`。

## 使用者確認的範圍

1. 備註按 Enter 應立即建立下一列並聚焦品號，不能在第一列循環。
2. 修正只填廠商品號／廠商品名／數量時未真正儲存，切走再回來資料消失，以及草稿載入過久。
3. 使用者明確定案：一般／廠商來源可用「廠商品名＋數量」儲存**及送出**，我方品號／品名可留空；不得把廠商品名複製到我方品名充作通過驗證。
4. 使用者另詢問叫貨明細改 ListView／表單的方案，要求盤點共用元件與評估。這部分目前僅評估，未改版型。

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
- [ ] PR、必要 CI、合併及部署結果：完成後在本段補上精確連結／來源 SHA。
- 未登入正式網站建立／送出業務測試單；尚無本輪真實瀏覽器端到端截圖。不可把 handler／SQLite 測試描述成實機驗收。

## ListView／表單評估（尚未實作）

| 既有共用能力 | 實際提供／限制 |
|---|---|
| `src/ui/data/DataView.tsx` | 桌面 table、手機 cards、loading/error/empty/selection；尚無明細編輯與逐格儲存 API。兩種呈現同時建立再用 CSS 顯示，若直接塞輸入欄位，須處理重複 editor／焦點與輸入狀態，不宜直接替換 |
| `src/ui/foundation/editable-list.ts` | 列的新增／更新／刪除／移動、錯誤與 dirty reducer；無 UI、Enter、API 排序及樂觀版本寫入能力 |
| `src/ui/forms/Field.tsx` | Field／FormSection：標籤、必填、擇一提示與長短欄排版，可沿用於手機單筆表單 |
| `src/ui/layout/MasterDetail.tsx` | 寬版左右清單／明細、窄版返回清單；叫貨頁已使用，與逐品項編輯為不同層次 |
| `src/ui/OrderingGrid.tsx` | 目前為叫貨專用，非全系統可編輯列表；承載 Enter、自動新增列及儲存協調 |

建議：桌面採欄位對齊的可編輯明細表，保留大量連續鍵盤輸入；手機用一品項一張分欄表單。兩個呈現共用一套 editor／資料／驗證／儲存控制，依 viewport 只掛載一份輸入控制，切換呈現也須保存未儲存輸入。

桌面全部改成大卡片會增加每列高度，不利多品項比對；每列都開 modal 會打斷連續輸入。若後續要做，先與使用者定稿，再評估從 OrderingGrid 抽出真正共用的 editable-lines controller／presentation；不要把叫貨專屬欄位、廠商規則寫成全域規則。現有 editable-list 可作底層參考，但不可取代本輪已補上的 API 確認、版本佇列與失敗保護。

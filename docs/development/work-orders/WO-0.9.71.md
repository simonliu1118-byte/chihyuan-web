# WO-0.9.71 進貨輔助移到叫貨模組（右側抽屜）

- 狀態：程式與自動測試完成，待 Claude 複審／人工視覺驗收；未合併、未部署
- 分支：cyweb/wo-0.9.71-restock-drawer　PR：[ #358 ](https://github.com/simonliu1118-byte/chihyuan-web/pull/358)
- 有新增 API（草稿品項查詢），沒有 migration：**Claude 審查通過後才合併部署**。

## 1. 背景（使用者原話）

- 「幫我把ERP查詢裡面的進貨輔助 移動到叫貨模組裡面」
- 「管理來源移到分隔線上並稍微左移，最右邊放進貨輔助的按鈕，用抽屜式打開右方進貨輔助，查完的也在這個抽屜顯示」
- 「ERP查詢裡面就不再有進貨輔助」
- 「進貨輔助原本按加入叫貨單，如果叫貨單已有只會顯示已有，多加上顯示已有、在哪張草稿、數量多少，這樣比較清楚」

## 2. 已定案事項

- **ERP 查詢**：移除「進貨輔助」頁籤與相關分支。查詢類別剩商品、客戶、供應商、未收款。
- **叫貨頁的頁籤列**（台北、台中…廠商那一排）：
  - 「管理來源」改放在頁籤列的分隔線上（與頁籤同一行、底線對齊），位置稍微往左；
  - 最右邊新增「進貨輔助」按鈕，只有具 `ERP_RESTOCK_ASSIST` 權限的人看得到，權限代碼不變。
- **抽屜**：按「進貨輔助」從右側滑出抽屜。抽屜內依序是：
  - 起日、迄日、查詢；
  - 進度（排程佇列狀態）；
  - 查詢結果表格；
  - 「加入叫貨單」。
  
  查詢執行中可以關閉抽屜，再打開時接回同一筆查詢與結果（沿用現有 `useErpJob` 接回機制）。抽屜寬度 `min(1100px, 100vw - 24px)`，結果表格在抽屜內水平捲動；手機為全寬。
- **完成通知**：ERP 完成通知的「查看」，進貨輔助改為導向叫貨頁並開啟抽屜；其他 ERP 類別不變。
- **已在草稿的提示**（新功能）：
  - 結果表格每一列在「加入叫貨單」按鈕旁顯示該品號目前所在的叫貨**草稿**。
  - 格式：`已在 台北 11/05 草稿 3 盒`。日期是預定送出日，沒有日期顯示「未定日期」；有多張草稿時每張一行。
  - 「加入叫貨單」對話框裡「已有同品號品項」的確認也改為顯示同樣資訊，例如「台北 11/05 草稿已有 3 盒，加到既有那一列？」。
  - 加入成功後，該列的提示立即更新。
- **只看草稿**：已送出的叫貨單不顯示在提示中（未到貨明細已有獨立頁面）。

## 3. 範圍

- **API**：`GET /api/business/ordering/draft-items?itemCodes=A,B,...`，權限 `ORDERING`。
  - 回傳 `[{itemCode, orderId, sourceId, sourceName, plannedSendDate, quantityText, unit, section}]`，只含 DRAFT 叫貨單、未結案的行；
  - itemCodes 上限 500 個，與進貨輔助結果上限一致；
  - 一次查詢完成（`IN` 用 `json_each` 綁一個參數，不要每個品號一個參數），補上需要的索引（如果現有沒有 `ordering_lines(item_code)` 類索引，以 migration 加；若需要 migration 則依 V0.9.66 方式更新備份指紋並補測試）。
- **共用抽屜元件**：把 `ErpQueueSidePanel` 的外框（右側固定、標題、關閉鈕、Esc 關閉）抽成 `src/ui/overlays/SidePanel.tsx`（props：`title`、`width`、`onClose`、`children`）。排程佇列與進貨輔助都用它。樣式從 `erp-item-query.css` 的 `.cy-erp-queue-side` 移到共用 `overlay.css`。
- **前端**：
  - `ErpItemQueryPage.tsx`：移除 RESTOCK 類別；
  - `RestockAssist.tsx`：查詢表單（原本在 ErpItemQueryPage 的起訖日）一起搬進來，成為獨立可放進抽屜的元件；
  - `OrderingPage.tsx`：頁籤列調整與抽屜；
  - `App.tsx`：完成通知的導向。
- **測試**：
  - ERP 頁不再有進貨輔助；
  - 叫貨頁無權限看不到按鈕；
  - draft-items API（只含草稿、權限、多張草稿）；
  - 加入叫貨單後提示更新。

## 4. 不做

- 不改進貨輔助的查詢邏輯、ERP Agent、結果欄位。
- 不顯示已送出／到貨中的叫貨單。
- 固定一條：不加多餘的測試與防護（共通規則 §11.4，使用者 2026-10-29）。只做本單要求的功能與實際會發生的錯誤處理；不加重複驗證、不會發生的情境測試。

## 5. 實作指引

- 一律用共用元件：`SidePanel`（本單新抽）、`Dialog`／`useConfirmation`、`IconButton`＋`Icons`（不要寫 `<svg>`）、`Field`、`DateInput`（起訖日改用它，含四碼年份）、`Loading`、`FeedbackBanner`。
- 「已在草稿」提示做成 `RestockAssist` 內的小元件即可，不需放到 `src/ui`。
- 叫貨頁頁籤列目前是 `.cy-ordering-tabbar`；調整版面時不要影響叫貨頁其他區塊。
- 版本 V0.9.71（若 WO-0.9.68 先合併則接續）。

## 6. 驗收清單

- [ ] ERP 查詢沒有進貨輔助頁籤。
- [ ] 叫貨頁：「管理來源」在分隔線上、稍微左移；最右邊是「進貨輔助」按鈕（無權限不顯示）。
- [ ] 進貨輔助在右側抽屜：查詢、進度、結果、加入叫貨單都在抽屜內；查詢中關閉抽屜再打開仍接回。
- [ ] ERP 完成通知「查看」會開到叫貨頁的進貨輔助抽屜。
- [ ] 結果每列顯示「已在 ○○ ○/○ 草稿 ○ ○」（多張多行）；加入成功後立即更新；加入對話框的「已有」確認顯示同樣資訊。
- [ ] 排程佇列抽屜改用共用 `SidePanel`，外觀與行為不變。
- [ ] 固定項目：新表單按 Enter 跳下一欄、日期欄位四碼年份（`PROJECT_RULES.md` §5，`form-keyboard.test.mjs` 會檢查）。
- [ ] `npm run typecheck`、`npm run validate:source`、`npm run build`、`npm run validate:d1:local` 通過。
- [ ] `node --test scripts/*.test.mjs` 通過，**交審前最新 head 的 CI 必須全綠**。
- [ ] VERSION／package.json 版本、TODO 段落已更新。

## 7. 截圖要求

- 桌面 1440：叫貨頁頁籤列、進貨輔助抽屜（含結果與「已在草稿」提示）、加入叫貨單對話框。
- 手機 390：抽屜。

## 8. 完成報告（GPT，2026-11-02）

### Git 與交付狀態
- [PR #358](https://github.com/simonliu1118-byte/chihyuan-web/pull/358)，分支 `cyweb/wo-0.9.71-restock-drawer`，以 `main` SHA `2fc8dc8ec8d8c5cbfdb09c22766cacfc067928b0` 為起點；版本 `V0.9.71`／BUILD `0`。
- **未合併、未部署、未建立 GitHub Release。** Claude 必須先於第 9 節複審，依使用者授權整合。

### 實作與共用架構
- [x] `src/ui/overlays/SidePanel.tsx` + `overlay.css`：共用右側無遮罩抽屜、Esc、關閉鍵、寬度與手機滿版；`ErpQueueSidePanel` 改用共用元件，舊專用 CSS 已移除。
- [x] `ErpItemQueryPage.tsx` 刪除 RESTOCK 類別及獨立分支，保留商品／客戶／供應商／未收款；`shared/modules.ts` 保留 `ERP_RESTOCK_ASSIST` 權限碼並將路由導向 `ordering`。
- [x] `OrderingPage.tsx`：管理來源與頁籤同列、偏左；最右側在具 `ERP_RESTOCK_ASSIST` 權限時顯示進貨輔助按鈕。抽屜寬 `min(1100px, calc(100vw - 24px))`，結果表格可水平捲動，手機滿版。
- [x] 抽屜使用原 `useErpJob` 作唯一查詢 owner；`App.tsx` 保持已開啟的叫貨頁掛載，隱藏或關閉抽屜時輪詢不中斷；RESTOCK 完成通知「查看」導向 `ordering` 並開抽屜，其他 ERP 類別保持原行為。
- [x] `RestockAssist.tsx`：查詢起迄日採既有 `Field`、`DateInput` 與 `enterAdvancesFields`，關閉再開接回查詢、日期與結果；原數據與加單流程不另建。
- [x] `worker/http/ordering-routes.ts`：`GET /api/business/ordering/draft-items`，既有 ORDERING 權限守門、最多 500 品號，使用 `json_each(?)` 單次查詢所有未結案 DRAFT 明細，不顯示已送出單。
- [x] 結果逐品號顯示「已在來源 日期 草稿 數量／單位」，同張草稿的多列合併提示，多張草稿分行；確認加入既有列時顯示草稿內容；加入成功後刷新提示。
- [x] 新增 `migrations/0045_ordering_draft_item_index.sql`：`ordering_lines(item_code,order_id)` 索引；無新資料表或資料列轉換。更新 portable-backup 中已知舊版 schema 的還原相容性、版本指紋測試。
- [x] 更新 `VERSION`、`package.json`、`TODO.md`、`CHANGELOG.md`、工單及 Claude Handoff。

### 驗證證據
- [x] [Runtime Check #41437785135](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41437785135)（程式 SHA `f880945857185b4707cc074571311cc58ff71f99`）：**Node 577／577 通過、0 失敗**，`browser-typecheck`、`worker-typecheck`、`source-contracts`、Local D1 runtime acceptance、Vite build 全部成功。
- [x] [Governance Check #41437785070](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41437785070)：成功。
- [x] [CY Web Deploy PR preflight #41437785139](https://github.com/simonliu1118-byte/chihyuan-web/actions/runs/41437785139)：部署契約成功，部署工作因 PR 事件略過，**未部署**。
- [x] 0045 精確 schema LF `e3f14b04ee560ddb43c98a2c31f2dcfb1c9710f81dd9161d018c1bd5506a1bab`、CRLF `ffd84deca22c432706918692fef76bfe050cda0598f2c6b0f2851f0c55d4e8ad`，已登錄並由整套測試核對；舊 0044 可攜備份可還原至帶索引的 0045。
- 完整 head 在補齊查詢表單 Enter 後另有 CI 重新執行，以 PR Checks 最新結果為準。先前紅燈包括測試 fixture、頁面 mock 模擬與 index-only 備份標準化，均已返修，不得引用為最終失敗。
- [ ] 桌面 1440 叫貨頁、抽屜結果／草稿提示／加單對話框，以及手機 390 真實瀏覽器截圖／觸控操作：**尚未完成**，不可當作實機視覺驗收通過。

### Claude 複審重點
- ERP Query 完全不顯示 RESTOCK 類別；ORDERING 與 ERP_RESTOCK_ASSIST 權限組合、按鈕可見性、Router／notification 導向。
- 抽屜關閉仍繼續查詢、完成 Toast 可重新開回；重複品號出現在多張草稿的提示與原加單確認；來源頁籤及未到貨功能沒有回歸。
- 詳細檔案與風險見 [Handoff](../../handoff/CYWEB-WO-0.9.71-GPT-20261102.md)；Claude 審查結果保留第 9 節。

查結論在 §9，Handoff：`docs/handoff/CYWEB-WO-0.9.71-GPT-20261102.md`。



## 9. 審查紀錄（審查者填）

### Claude 審查（2026-11-03，通過，版本改為 V0.9.72 合併部署）

版本：V0.9.71 已給 WO-0.9.68（PR #351，先合併），本 PR 改為 **V0.9.72**。

審查時直接修正：
1. **草稿查詢超過 500 品號會整批失效**：後端一次最多 500 個品號，但進貨輔助查一段期間所有客戶的銷貨，品號很容易超過 500；前端一次全送，被拒後 `catch` 清空，「已在草稿」提示就全部不見、也不報錯。改為每 200 個品號分批查詢再合併。
2. **叫貨頁常駐後回來不會更新**：為了讓進貨輔助查詢在切模組時不中斷，叫貨頁改成開過就一直掛著，結果切去別的模組再回來，來源、清單、未到貨與目前開著的單都是舊資料（之前每次進來都會重讀）。改為回到叫貨頁時重讀來源與清單；目前開著的單若沒有未儲存的修改，也重讀一次。
3. 抽屜裡的起訖日用 compact 日期元件（112px），在一般表單字級下「YYYY/MM/DD」被截斷；改用 `density="regular"`。
4. `DraftHints` 自己又寫了一次草稿文字格式，改用同檔的 `draftText`；`useContext` 合併到既有的 react import。
5. 本工作單第 7 節標題被完成報告覆蓋（「## 7. 截## 8.」），已還原。

確認無誤：
- 0045 只加索引，LF／CRLF 指紋用 migration 實算核對相符；0044 → 0045 備份還原測試在套件內。
- `draft-items` 走叫貨模組權限、`json_each` 參數化、只取草稿未結掉的行。
- 共用 `SidePanel` 取代排程佇列專用外框，沒有另做一套抽屜（手機改為滿版，原為底部 60vh，可接受）。
- 實機截圖（合成資料）：桌面 1440 頁籤列「管理來源」在分隔線上、「進貨輔助」在最右；抽屜 1100px 正常。手機叫貨頁頁籤列在明細窗格內，與「管理來源」相同，屬既有版面。
- typecheck、build、`node --test scripts/*.test.mjs` 581／581 通過。


# WO-0.9.71 進貨輔助移到叫貨模組（右側抽屜）

- 狀態：程式提交／待 CI 與 Claude 複審；未合併、未部署
- 分支：cyweb/wo-0.9.71-restock-drawer　PR：#（建立後回填）
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

## 8. 完成報告（GPT，2026-11-02；待完整驗證）
- 基準：`main` SHA `2fc8dc8ec8d8c5cbfdb09c22766cacfc067928b0`；分支 `cyweb/wo-0.9.71-restock-drawer`，版本 `0.9.71`／BUILD `0`。
- 共用元件：`src/ui/overlays/SidePanel.tsx` 與 `overlay.css`；排程佇列和叫貨進貨輔助共享可關閉的無遮罩側板及 Esc，移除 ERP 特例 CSS。
- `ErpItemQueryPage.tsx` 移除 RESTOCK，`OrderingPage.tsx` 加入權限控管按鈕、保留 query job 的抽屜，`App.tsx` 完成通知導航至叫貨。原有 `useErpJob` 仍作唯一查詢狀態；`RestockAssist.tsx` 以 `Field`／`DateInput` 表單並顯示草稿提示。
- `worker/http/ordering-routes.ts` 新增只含 DRAFT、closed_as 為 NULL 的 `draft-items` 批次查詢（`json_each`、500 品號）；`migrations/0045_ordering_draft_item_index.sql` 提供品號索引；備份 exact 版本／測試需 CI 核對。
- `scripts/ordering-route.test.mjs` 增加草稿多筆、排除已送出與無權限測試。仍待全套 CI 與 1440／390 真實瀏覽器驗收，不可冒稱通過。
- 不合併、不部署；Claude 審查結論在 §9，Handoff：`docs/handoff/CYWEB-WO-0.9.71-GPT-20261102.md`。



## 9. 審查紀錄（審查者填）

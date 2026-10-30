# CYWEB V0.9.56 Build 2 — 盤點密度與儲位原地編輯

## 使用者指示
增加表格密度；修改儲位改成在原位置輸入、Enter 儲存，移除彈窗；新增批號與修改紀錄縮小，修改使用圖示。依本次對話既有授權，單純 UI 修改完成檢查後直接合併部署。

## 修改
- `StocktakeGroupedDetail.tsx`：加入盤點專用 InlineLocation，採共用 Field；桌面儲位原位置及手機儲位按鈕原位置切換為輸入。鉛筆 SVG 有 title／aria-label。輸入自動全選、四碼驗證、Enter 儲存、Esc 取消、IME 組字不送出；儲存中停用輸入，失敗保留草稿，成功關閉。手機成功後選取新儲位。
- `StoreStocktake.tsx`：移除 renameForm 與修改儲位 Dialog。原 PATCH payload、sheet version 與錯誤回報維持；改回傳成功狀態供原地編輯器決定是否關閉。
- `store.css`：桌面品號與規格同列、群組留白 6px、間距 6px、數量輸入 26px、單格上下 1px；儲位資訊與操作改緊湊排法，批號與紀錄按鈕最小高 23px，鉛筆 22px。手機原地輸入保留 16px／44px，其他操作按鈕適度縮小，數量輸入維持原觸控尺寸。
- `BUILD`：1 → 2，同一盤點 UI 返修。

## 驗證與風險
- npm run build 通過（瀏覽器／Worker TypeScript 與 Vite）。
- node --test scripts/store-stocktake.test.mjs scripts/form-keyboard.test.mjs scripts/form-fields.test.mjs：29/29 通過。
- git diff --check 通過。
- 未修改 Worker／API／資料庫／ERP 寫回規則。仍只改 WEB 儲位，ERP 待人工修改提示保留在輸入旁。
- 真實桌面／手機視覺與操作待使用者驗收；未宣稱瀏覽器互動測試或 Claude 審查已完成。
- 合併／部署最終證據請見本 PR 的 GitHub 紀錄與對應 main dispatch deployment run。

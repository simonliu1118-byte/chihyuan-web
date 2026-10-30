# CYWEB V0.9.56 Build 3 — 電腦版單一盤點清單

## 使用者決定
所有本輪要求只適用電腦版：回歸單純清單，不要卡片；一張大表格，品號／品名／規格置於儲位左側；庫別在儲位碼前，修改鉛筆及新增批號同列；取消品號及儲位「已填」進度；文字加大，修改紀錄使用圖示；數量與單位分欄。手機版不動。沿用使用者已授權的 UI 修改直接合併部署。

## 實作
- `StocktakeGroupedDetail.tsx`：在非 compact 分支一次渲染整張表格，單一 thead，每品號 tbody，品號／品名／規格 rowSpan 涵蓋該品號，儲位 rowSpan 涵蓋該庫別儲位的批號。桌面不顯示卡片、品號標題或任何已填進度。
- 欄位順序：品號、品名、規格、儲位、批號、初盤／複盤數量、單位、操作。庫別置於儲位碼前，鉛筆原地編輯與新增批號在同一 flex 列，空間不足可換行。
- 共用 editor/actions 加可選參數，預設維持手機原狀；桌面數量不帶單位，歷史以 SVG 按鈕呈現。修改、歷史圖示皆有可讀名稱與 title。
- `store.css`：所有新樣式在 min-width:821px 內；字級 xs → sm，明確固定 icon 的 display、width、height、flex 與 stroke，避免圖示被擠扁。品號分隔用表格線，無卡片容器。
- `StoreStocktake.tsx`：進度文字加 span，僅桌面隱藏，手機仍顯示原內容。
- `scripts/store-stocktake-ui.test.mjs`：更新桌面 table 的 class 契約，其餘手機與盤點契約保留。
- BUILD 2 → 3，VERSION 維持 0.9.56。

## 驗證
- npm run build：TypeScript（browser / Worker）與 Vite 通過。
- 盤點 API、盤點 UI、表單鍵盤、共用欄位共 37 項測試通過。
- 手機卡片 return JSX 與 origin/main 比對相同（僅正規化 CRLF/LF）；共用 editor/actions 預設參數保持舊呈現，新增 CSS 只在桌面 media query 生效。
- git diff --check 通過。
- 未修改 API、資料庫、ERP 寫回與儲位驗證；原地編輯繼續使用既有版本鎖與錯誤回報。
- 真實瀏覽器／裝置尺寸、長品名／規格與圖示視覺仍待使用者驗收，不宣稱已做互動瀏覽器驗收。
- 最終 CI、合併與發布證據以本 PR 及 main dispatch deployment run 為準。
